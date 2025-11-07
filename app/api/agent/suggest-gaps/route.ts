import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { detectGaps, MissingTaskError } from '@/lib/services/gapDetectionService';
import { getTaskRecordsByIds } from '@/lib/services/taskRepository';
import { TaskGenerationError } from '@/lib/services/taskGenerationService';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import { bridgingTaskSchema } from '@/lib/schemas/bridgingTaskSchema';
import {
  GapAnalysisSessionSchema,
  GapTypeEnum,
  type GapAnalysisSession,
} from '@/lib/schemas/gapAnalysis';
import type { Gap } from '@/lib/schemas/gapSchema';
import { parsePlanFromAgentResponse } from '@/lib/mastra/services/resultParser';
import { suggestBridgingTasksTool } from '@/lib/mastra/tools/suggestBridgingTasks';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables for suggest gaps endpoint');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const requestSchema = z.object({
  session_id: z.string().uuid(),
});

type BridgingTask = z.infer<typeof bridgingTaskSchema>;

type SuggestionStatus = 'success' | 'requires_examples' | 'error';

type SuggestionPayload = {
  gap_id: string;
  status: SuggestionStatus;
  tasks: BridgingTask[];
  metadata?: {
    search_results_count: number;
    generation_duration_ms: number;
  };
  error?: string;
  requires_manual_examples?: boolean;
};

function deriveGapType(indicators: Gap['indicators']): z.infer<typeof GapTypeEnum> {
  if (indicators.time_gap) {
    return 'time';
  }
  if (indicators.action_type_jump) {
    return 'action_type';
  }
  if (indicators.skill_jump) {
    return 'skill';
  }
  return 'dependency';
}

function buildPlanSnapshot(
  orderedTaskIds: string[],
  dependencyPairs: Array<{ source_task_id: string; target_task_id: string }>,
  taskTextMap: Map<string, string>
) {
  const dependencyMap = new Map<string, string[]>();
  dependencyPairs.forEach(({ source_task_id, target_task_id }) => {
    if (!dependencyMap.has(target_task_id)) {
      dependencyMap.set(target_task_id, []);
    }
    dependencyMap.get(target_task_id)!.push(source_task_id);
  });

  return orderedTaskIds.map(taskId => {
    const snapshot: {
      task_id: string;
      task_text: string;
      estimated_hours?: number;
      depends_on?: string[];
    } = {
      task_id: taskId,
      task_text: taskTextMap.get(taskId) ?? 'Task description unavailable',
    };

    const dependsOn = dependencyMap.get(taskId);
    if (dependsOn && dependsOn.length > 0) {
      snapshot.depends_on = dependsOn;
    }

    return snapshot;
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request body',
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { session_id: sessionId } = parsed.data;

  const { data: session, error: sessionError } = await supabase
    .from('agent_sessions')
    .select('id, user_id, outcome_id, prioritized_plan, result')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error('[Suggest Gaps] Failed to load agent session', sessionError);
    return NextResponse.json({ error: 'Failed to load agent session' }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (!session.prioritized_plan) {
    return NextResponse.json(
      { error: 'Session is missing prioritized plan. Run full analysis first.' },
      { status: 400 }
    );
  }

  let planCandidate: unknown = session.prioritized_plan;
  if (typeof planCandidate === 'string') {
    const parsedPlan = parsePlanFromAgentResponse(planCandidate);
    if (parsedPlan.success) {
      planCandidate = parsedPlan.plan;
    } else {
      try {
        planCandidate = JSON.parse(planCandidate);
      } catch (error) {
        console.error('[Suggest Gaps] Failed to parse prioritized_plan string', error);
        return NextResponse.json(
          { error: 'Session prioritized plan is invalid JSON' },
          { status: 422 }
        );
      }
    }
  }

  const planParseResult = prioritizedPlanSchema.safeParse(planCandidate);
  if (!planParseResult.success) {
    console.error(
      '[Suggest Gaps] Prioritized plan validation failed',
      planParseResult.error.flatten()
    );
    return NextResponse.json(
      {
        error: 'Session prioritized plan failed validation',
        issues: planParseResult.error.flatten(),
      },
      { status: 422 }
    );
  }

  const prioritizedPlan = planParseResult.data;
  const orderedTaskIds = prioritizedPlan.ordered_task_ids ?? [];

  if (!Array.isArray(orderedTaskIds) || orderedTaskIds.length < 2) {
    const pairsAnalyzed = Math.max(0, orderedTaskIds.length - 1);
    return NextResponse.json({
      gaps: [],
      metadata: {
        total_pairs_analyzed: pairsAnalyzed,
        gaps_detected: 0,
        analysis_duration_ms: 0,
      },
      suggestions: [],
      analysis_session_id: randomUUID(),
      generation_metrics: {
        attempted_gap_count: 0,
        successful_gap_count: 0,
        total_ms: 0,
      },
    });
  }

  let outcomeStatement: string | null = null;
  if (session.outcome_id) {
    const { data: outcome, error: outcomeError } = await supabase
      .from('user_outcomes')
      .select('assembled_text')
      .eq('id', session.outcome_id)
      .maybeSingle();

    if (outcomeError) {
      console.warn('[Suggest Gaps] Failed to load outcome statement', outcomeError);
    } else {
      outcomeStatement = typeof outcome?.assembled_text === 'string' ? outcome.assembled_text : null;
    }
  }

  let detectionResult;
  try {
    detectionResult = await detectGaps(orderedTaskIds);
  } catch (error) {
    if (error instanceof MissingTaskError) {
      return NextResponse.json(
        {
          error: error.message ?? 'Missing task embeddings for detected gaps',
          code: 'TASKS_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    console.error('[Suggest Gaps] Gap detection failed', error);
    return NextResponse.json({ error: 'Gap detection failed' }, { status: 500 });
  }

  console.log('[Suggest Gaps] Gap detection completed', {
    session_id: sessionId,
    user_id: session.user_id,
    gaps_detected: detectionResult.metadata.gaps_detected,
    total_pairs_analyzed: detectionResult.metadata.total_pairs_analyzed,
  });

  const analysisSessionId = randomUUID();
  const suggestionPayloads: SuggestionPayload[] = [];

  let totalGenerationDurationMs = 0;
  let successfulGapCount = 0;
  let totalSearchResults = 0;
  const friendlyGenerationError = 'Unable to generate suggestions. Please try again.';
  let fatalGenerationError: { message: string; code?: string; details?: unknown } | null = null;

  for (const gap of detectionResult.gaps) {
    if (gap.confidence < 0.75) {
      suggestionPayloads.push({
        gap_id: gap.id,
        status: 'error',
        tasks: [],
        error: 'Gap confidence below threshold for AI suggestions. Review tasks manually.',
      });
      continue;
    }

    const generationStart = Date.now();
    try {
      const result = await suggestBridgingTasksTool.execute({
        gap_id: gap.id,
        predecessor_id: gap.predecessor_task_id,
        successor_id: gap.successor_task_id,
        outcome_text: outcomeStatement ?? undefined,
      });

      const parsedTasks = z.array(bridgingTaskSchema).parse(result.bridging_tasks ?? []);

      suggestionPayloads.push({
        gap_id: gap.id,
        status: 'success',
        tasks: parsedTasks,
        metadata: {
          search_results_count: result.search_results_count ?? 0,
          generation_duration_ms: result.generation_duration_ms ?? Math.max(0, Date.now() - generationStart),
        },
      });

      totalGenerationDurationMs += result.generation_duration_ms ?? Math.max(0, Date.now() - generationStart);
      totalSearchResults += result.search_results_count ?? 0;
      successfulGapCount += 1;
    } catch (error) {
      const elapsed = Math.max(0, Date.now() - generationStart);
      totalGenerationDurationMs += elapsed;

      if (error instanceof TaskGenerationError) {
        if (error.code === 'REQUIRES_MANUAL_EXAMPLES') {
          suggestionPayloads.push({
            gap_id: gap.id,
            status: 'requires_examples',
            tasks: [],
            error: error.message,
            requires_manual_examples: true,
          });
          continue;
        }

        if (['AI_SERVICE_ERROR', 'GENERATION_FAILED', 'TIMEOUT'].includes(error.code)) {
          console.error('[Suggest Gaps] AI generation failed', {
            gap_id: gap.id,
            code: error.code,
            message: error.message,
            metadata: error.metadata ?? null,
          });
          fatalGenerationError = {
            message: friendlyGenerationError,
            code: error.code,
            details: error.message,
          };
          break;
        }

        suggestionPayloads.push({
          gap_id: gap.id,
          status: 'error',
          tasks: [],
          error: error.message,
        });
        continue;
      }

      console.error('[Suggest Gaps] Unexpected error during task generation', error);
      fatalGenerationError = {
        message: friendlyGenerationError,
        code: 'UNEXPECTED_AI_ERROR',
        details: error instanceof Error ? error.message : String(error),
      };
      break;
    }
  }

  const { tasks: planTasks } = await getTaskRecordsByIds(orderedTaskIds, {
    recoverMissing: true,
  });

  const taskTextMap = new Map(planTasks.map(task => [task.task_id, task.task_text]));
  const planSnapshot = buildPlanSnapshot(
    orderedTaskIds,
    (prioritizedPlan.dependencies ?? []).map(({ source_task_id, target_task_id }) => ({
      source_task_id,
      target_task_id,
    })),
    taskTextMap
  );

  const storedGaps = detectionResult.gaps.map(gap => ({
    predecessor_id: gap.predecessor_task_id,
    successor_id: gap.successor_task_id,
    gap_type: deriveGapType(gap.indicators),
    confidence: Math.max(0, Math.min(1, gap.confidence)),
    indicators: gap.indicators,
  }));

  const generatedTasksForSession = suggestionPayloads
    .filter(payload => payload.status === 'success')
    .flatMap(payload => {
      const matchingGap = detectionResult.gaps.find(gap => gap.id === payload.gap_id);
      if (!matchingGap) {
        return [];
      }

      return payload.tasks.map(task => ({
        text: task.task_text,
        estimated_hours: task.estimated_hours,
        required_cognition: task.cognition_level,
        confidence: Math.max(0, Math.min(1, task.confidence)),
        reasoning: task.reasoning,
        source: task.source,
        generated_from: {
          predecessor_id: matchingGap.predecessor_task_id,
          successor_id: matchingGap.successor_task_id,
        },
        requires_review: true,
        similarity_score: 0,
      }));
    });

  const detectionDurationMs = detectionResult.metadata.analysis_duration_ms ?? 0;
  const generationDurationMs = Math.round(totalGenerationDurationMs);

  const gapAnalysisSession: GapAnalysisSession = {
    session_id: analysisSessionId,
    trigger_timestamp: new Date().toISOString(),
    plan_snapshot: planSnapshot,
    detected_gaps: storedGaps,
    generated_tasks: generatedTasksForSession,
    user_acceptances: [],
    insertion_result: {
      success: false,
      inserted_task_ids: [],
      error: fatalGenerationError?.message ?? null,
    },
    performance_metrics: {
      detection_ms: detectionDurationMs,
      generation_ms: generationDurationMs,
      total_ms: detectionDurationMs + generationDurationMs,
      search_query_count: suggestionPayloads.length,
    },
  };

  const parsedSession = GapAnalysisSessionSchema.safeParse(gapAnalysisSession);
  if (!parsedSession.success) {
    console.error(
      '[Suggest Gaps] Gap analysis session failed validation',
      parsedSession.error.flatten()
    );
  }

  let existingResult: unknown = session.result;
  if (typeof existingResult === 'string') {
    try {
      existingResult = JSON.parse(existingResult);
    } catch (error) {
      console.warn('[Suggest Gaps] Failed to parse existing result JSON string', error);
      existingResult = {};
    }
  }

  const normalizedResult =
    existingResult && typeof existingResult === 'object' && !Array.isArray(existingResult)
      ? (existingResult as Record<string, unknown>)
      : {};

  const updatedResult = {
    ...normalizedResult,
    gap_analysis: parsedSession.success ? parsedSession.data : gapAnalysisSession,
  };

  const { error: updateError } = await supabase
    .from('agent_sessions')
    .update({ result: updatedResult })
    .eq('id', sessionId);

  if (updateError) {
    console.error('[Suggest Gaps] Failed to store gap analysis session', updateError);
  }

  if (fatalGenerationError) {
    return NextResponse.json(
      {
        error: fatalGenerationError.message,
        code: fatalGenerationError.code ?? 'AI_GENERATION_ERROR',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    gaps: detectionResult.gaps,
    metadata: detectionResult.metadata,
    suggestions: suggestionPayloads,
    analysis_session_id: analysisSessionId,
    performance_metrics: gapAnalysisSession.performance_metrics,
    generation_metrics: {
      attempted_gap_count: suggestionPayloads.length,
      successful_gap_count: successfulGapCount,
      detection_ms: detectionDurationMs,
      generation_ms: generationDurationMs,
      total_ms: detectionDurationMs + generationDurationMs,
      total_search_results: totalSearchResults,
    },
  });
}

export const dynamic = 'force-dynamic';
