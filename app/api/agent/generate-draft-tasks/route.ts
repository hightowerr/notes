import { NextRequest } from 'next/server';
import { z } from 'zod';

import { getAuthUser } from '@/lib/services/planIntegration';
import { generateDrafts } from '@/lib/services/draftTaskGeneration';
import { deduplicateDrafts } from '@/lib/services/deduplication';
import { suggestBridgingTasksTool } from '@/lib/mastra/tools/suggestBridgingTasks';
import { DraftTask } from '@/lib/schemas/taskIntelligence';
import { analyzeCoverage } from '@/lib/services/taskIntelligence';
import { createClient } from '@/lib/supabase/server';
import { validateRequestSchema } from '@/lib/utils/validation';
import { detectGaps } from '@/lib/services/gapDetectionService';
import type { Gap } from '@/lib/schemas/gapSchema';

// Schema for the request body
const generateDraftTasksRequestSchema = z.object({
  outcome_text: z.string().min(10).max(500),
  missing_areas: z.array(z.string().min(1).max(100)).min(1).max(5),
  existing_task_texts: z.array(z.string().min(1).max(500)).max(100).default([]),
  existing_task_ids: z.array(z.string().uuid()).max(100).default([]),
  session_id: z.string().uuid(),
  max_drafts_per_area: z.number().int().min(1).max(3).default(3),
  include_phase5_fallback: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    // Authenticate user
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate request body
    const body = await request.json();
    const validatedBody = validateRequestSchema(generateDraftTasksRequestSchema, body);

    const {
      outcome_text,
      missing_areas,
      existing_task_texts,
      existing_task_ids,
      session_id,
      max_drafts_per_area,
      include_phase5_fallback,
    } = validatedBody;

    let normalizedExistingTaskTexts = existing_task_texts ?? [];

    // Fetch existing tasks to get their text content and embeddings
    const supabase = await createClient();

    let existingEmbeddings: number[][] = [];
    if (existing_task_ids.length > 0) {
      const { data: existingTasks, error: fetchError } = await supabase
        .from('task_embeddings')
        .select('task_text, embedding')
        .in('task_id', existing_task_ids)
        .limit(50); // Max 50 tasks per request as per requirements

      if (fetchError) {
        console.error('[API] Error fetching existing tasks:', fetchError);
        return Response.json(
          { error: 'TASK_FETCH_FAILED', message: 'Failed to fetch existing tasks' },
          { status: 500 }
        );
      }

      if (!normalizedExistingTaskTexts.length) {
        normalizedExistingTaskTexts = existingTasks
          .map(task => task.task_text)
          .filter((text): text is string => Boolean(text));
      }

      existingEmbeddings = existingTasks
        .map(task => task.embedding)
        .filter((embedding): embedding is number[] => Array.isArray(embedding));
    }

    // Step 1: Generate Phase 10 drafts
    const { drafts: p10Drafts, generation_duration_ms: p10Duration } = await generateDrafts({
      outcomeText: outcome_text,
      missingAreas: missing_areas,
      existingTaskTexts: normalizedExistingTaskTexts,
      maxPerArea: max_drafts_per_area,
    });

    // Step 2: Check if coverage is still <80% and trigger Phase 5 if needed (FR-025)
    let phase5Triggered = false;
    const p5Drafts: DraftTask[] = [];

    const hypotheticalTaskTexts = [
      ...normalizedExistingTaskTexts,
      ...p10Drafts.map(d => d.task_text)
    ];
    const hypotheticalEmbeddings = [...existingEmbeddings, ...p10Drafts.map(d => d.embedding)];
    const hypotheticalTaskIds = [...existing_task_ids, ...p10Drafts.map(d => d.id)];

    if (include_phase5_fallback) {
      const hypotheticalCoverage = await analyzeCoverage(
        outcome_text,
        hypotheticalTaskIds,
        hypotheticalTaskTexts,
        hypotheticalEmbeddings
      );

      phase5Triggered = hypotheticalCoverage.coverage_percentage < 80;
    }

    let p5Duration = 0; // Initialize to 0 in case P5 isn't triggered
    let phase5Error: string | null = null;
    let dependencyGaps: Gap[] = [];

    if (phase5Triggered) {
      if (existing_task_ids.length >= 2) {
        try {
          const gapDetection = await detectGaps(existing_task_ids);
          dependencyGaps = gapDetection.gaps.sort((a, b) => b.confidence - a.confidence);
        } catch (gapError) {
          phase5Error = gapError instanceof Error ? gapError.message : 'Unknown error';
          console.error('[API] Dependency gap detection failed:', gapError);
        }
      } else {
        console.warn(
          '[API] Phase 5 triggered but insufficient tasks for dependency gap detection'
        );
      }

      const p5StartTime = Date.now();
      try {
        const targetGap = dependencyGaps[0];
        if (!targetGap) {
          console.warn('[API] Phase 5 triggered but no dependency gaps detected');
        } else {
          const toolResult = await suggestBridgingTasksTool.execute({
            gap_id: targetGap.id,
            predecessor_id: targetGap.predecessor_task_id,
            successor_id: targetGap.successor_task_id,
            outcome_text: outcome_text
          });

          // Transform bridging tasks to draft tasks format
          const bridgingTasks = toolResult.bridging_tasks;
          for (const task of bridgingTasks) {
            if (task.embedding) { // Only include tasks that have embeddings
              // Generate a proper deduplication hash using sha256
              const crypto = await import('node:crypto');
              const hash = crypto
                .createHash('sha256')
                .update(task.task_text.toLowerCase().trim())
                .digest('hex');
              p5Drafts.push({
                id: task.id,
                task_text: task.task_text,
                estimated_hours: task.estimated_hours,
                cognition_level: task.cognition_level,
                reasoning: task.reasoning,
                gap_area: 'dependency_gaps', // Use a generic area for dependency gaps
                confidence_score: task.confidence,
                source: 'phase5_dependency',
                source_label: '🔗 Dependency Gap',
                embedding: task.embedding,
                deduplication_hash: hash,
              });
            }
          }
        }
      } catch (error) {
        phase5Error = error instanceof Error ? error.message : 'Unknown error';
        console.error('[API] Error generating P5 drafts:', error);
        // Continue even if P5 fails, as P10 drafts are the primary focus
      }
      p5Duration = Date.now() - p5StartTime;
    }

    // Step 3: Run deduplication between P10 and P5 drafts (FR-027)
    const allDrafts = deduplicateDrafts(p10Drafts, p5Drafts);

    // Step 4: Retrieve existing agent session to preserve other data
    const { data: existingSession, error: fetchSessionError } = await supabase
      .from('agent_sessions')
      .select('result, user_id, execution_metadata')  // Select user_id to verify ownership
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();

    if (fetchSessionError || !existingSession) {
      return Response.json(
        { error: 'SESSION_NOT_FOUND', message: 'Agent session not found' },
        { status: 404 }
      );
    }

    // Verify session belongs to user BEFORE using data (defensive check)
    if (existingSession.user_id !== user.id) {
      return Response.json(
        { error: 'FORBIDDEN', message: 'Session does not belong to authenticated user' },
        { status: 403 }
      );
    }

    // Update the session with the new draft tasks
    const generatedTimestamp = new Date().toISOString();
    const draftTelemetry = {
      total_duration_ms: totalDuration,
      p10_duration_ms: p10Duration,
      p5_duration_ms: p5Duration,
      p10_count: p10Drafts.length,
      phase5_final_count: finalPhase5Count,
      deduplication_stats: deduplicationStats,
      phase5_triggered: phase5Triggered,
      phase5_error: phase5Error,
      generated_at: generatedTimestamp,
    };

    const { error: sessionUpdateError } = await supabase
      .from('agent_sessions')
      .update({
        result: {
          ...(existingSession.result ?? {}),
          draft_tasks: {
            session_id: session_id,
            generated: allDrafts,
            accepted: [],
            dismissed: [],
            generated_at: generatedTimestamp,
            metadata: draftTelemetry,
          }
        },
        execution_metadata: {
          ...(existingSession.execution_metadata ?? {}),
          draft_generation: draftTelemetry,
        }
      })
      .eq('id', session_id)
      .eq('user_id', user.id);

    if (sessionUpdateError) {
      console.error('[API] Error updating agent session:', sessionUpdateError);
      return Response.json(
        { error: 'SESSION_UPDATE_FAILED', message: 'Failed to store generated drafts' },
        { status: 500 }
      );
    }

    const totalDuration = Date.now() - startTime;

    const finalPhase5Count = allDrafts.filter(d => d.source === 'phase5_dependency').length;
    const deduplicationStats = {
      phase5_total: p5Drafts.length,
      phase5_suppressed: Math.max(0, p5Drafts.length - finalPhase5Count),
      final_count: allDrafts.length,
    };

    console.log('[API:GenerateDrafts] Performance', draftTelemetry);

    return Response.json({
      drafts: allDrafts,
      phase5_triggered: phase5Triggered,
      phase5_error: phase5Error,
      generation_duration_ms: totalDuration,
      deduplication_stats: deduplicationStats,
    });
  } catch (error) {
    console.error('[API] Generate Draft Tasks Error:', error);
    
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }
    
    return Response.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Failed to generate draft tasks' },
      { status: 500 }
    );
  }
}
