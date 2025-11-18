import { NextRequest } from 'next/server';
import { z } from 'zod';
import { CoverageAnalysisSchema, type CoverageAnalysis } from '../../../../lib/schemas/taskIntelligence';
import { analyzeCoverage } from '../../../../lib/services/taskIntelligence';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';

// Define the request schema
const CoverageAnalysisRequestSchema = z.object({
  outcome_id: z.string().uuid(),
  task_ids: z.array(z.string()).min(1).max(50),
  session_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Initialize Supabase client for server operations
    const supabase = await createSupabaseClient();

    // Parse and validate the request body
    const body = await request.json();
    const { outcome_id, task_ids, session_id } = CoverageAnalysisRequestSchema.parse(body);

    // Validate that we have at least 5 tasks for meaningful analysis (per research.md)
    if (task_ids.length < 5) {
      // Return a warning but still calculate coverage
      console.warn(`[CoverageAnalysisAPI] Coverage analysis requested with only ${task_ids.length} tasks. Results may be less accurate.`);
    }

    // Check if outcome exists
    const { data: outcome, error: outcomeError } = await supabase
      .from('user_outcomes')
      .select('assembled_text')
      .eq('id', outcome_id)
      .single();

    if (outcomeError || !outcome) {
      return Response.json(
        { error: 'OUTCOME_NOT_FOUND', message: 'The specified outcome does not exist' },
        { status: 404 }
      );
    }

    // Fetch task embeddings from Supabase
    const { data: taskEmbeddings, error: embeddingsError } = await supabase
      .from('task_embeddings')
      .select('task_id, task_text, embedding')
      .in('task_id', task_ids);

    if (embeddingsError) {
      console.error('[CoverageAnalysisAPI] Error fetching task embeddings:', embeddingsError);
      return Response.json(
        { error: 'DATABASE_ERROR', message: 'Failed to fetch task embeddings' },
        { status: 500 }
      );
    }

    if (!taskEmbeddings || taskEmbeddings.length === 0) {
      return Response.json(
        { error: 'INSUFFICIENT_TASKS', message: 'No valid tasks found for the provided IDs' },
        { status: 400 }
      );
    }

    const createZeroVector = () => new Array(1536).fill(0);

    const parsedEmbeddings = taskEmbeddings.flatMap(row => {
      try {
        if (Array.isArray(row.embedding)) {
          return [{
            task_id: row.task_id,
            task_text: row.task_text,
            embedding: row.embedding as number[],
          }];
        }

        if (typeof row.embedding === 'string') {
          const vector = JSON.parse(row.embedding) as number[];
          return [{
            task_id: row.task_id,
            task_text: row.task_text,
            embedding: vector,
          }];
        }

        console.warn('[CoverageAnalysisAPI] Skipping task with unsupported embedding format', {
          task_id: row.task_id,
          embedding_type: typeof row.embedding,
        });
        return [];
      } catch (parseError) {
        console.error('[CoverageAnalysisAPI] Failed to parse embedding for task', row.task_id, parseError);
        return [];
      }
    });

    const foundTaskIds = parsedEmbeddings.map(entry => entry.task_id);
    const missingTaskIds = task_ids.filter(id => !foundTaskIds.includes(id));

    if (missingTaskIds.length > 0) {
      console.warn('[CoverageAnalysisAPI] Proceeding with partial task embeddings', {
        missing_task_ids: missingTaskIds,
        analyzed_task_count: parsedEmbeddings.length,
      });
    }

    const taskTexts = parsedEmbeddings.map(entry => entry.task_text);
    const embeddings = parsedEmbeddings.map(entry => entry.embedding);

    let coverageResult: CoverageAnalysis;
    let coverageCalculationMethod: 'ai' | 'heuristic' = 'ai';
    let executionTime = 0;

    if (parsedEmbeddings.length === 0) {
      console.warn('[CoverageAnalysisAPI] No embeddings available. Falling back to heuristic coverage result.');
      coverageCalculationMethod = 'heuristic';
      coverageResult = {
        coverage_percentage: 0,
        missing_areas: [],
        goal_embedding: createZeroVector(),
        task_cluster_centroid: createZeroVector(),
        analysis_timestamp: new Date().toISOString(),
        task_count: 0,
        threshold_used: 0.7,
      };
    } else {
      const startTime = Date.now();
      coverageResult = await analyzeCoverage(
        outcome.assembled_text,
        foundTaskIds,
        taskTexts,
        embeddings
      );
      executionTime = Date.now() - startTime;
    }

    // Validate the result against the schema
    CoverageAnalysisSchema.parse(coverageResult);

    // Log execution time for observability (per research.md requirement)
    console.log(`[CoverageAnalysisAPI] Coverage analysis completed in ${executionTime}ms for ${task_ids.length} tasks`);

    // Return the analysis result
    if (session_id) {
    const { data: sessionRecord, error: sessionFetchError } = await supabase
        .from('agent_sessions')
        .select('result, user_id, execution_metadata')
        .eq('id', session_id)
        .single();

      if (sessionFetchError) {
        console.warn(
          `[CoverageAnalysisAPI] Failed to load session ${session_id} for persistence:`,
          sessionFetchError
        );
      } else if (sessionRecord) {
        const coverageTelemetry = {
          duration_ms: executionTime,
          analyzed_task_count: foundTaskIds.length,
          requested_task_count: task_ids.length,
          missing_task_ids: missingTaskIds,
          task_cap_hit: task_ids.length >= 50,
          analyzed_at: new Date().toISOString(),
          calculation_method: coverageCalculationMethod,
        };

        const currentExecutionMetadata = sessionRecord.execution_metadata ?? {};

        const { error: sessionUpdateError } = await supabase
          .from('agent_sessions')
          .update({
            result: {
              ...(sessionRecord.result ?? {}),
              coverage_analysis: coverageResult,
            },
            execution_metadata: {
              ...currentExecutionMetadata,
              coverage_analysis: coverageTelemetry,
            },
          })
          .eq('id', session_id)
          .eq('user_id', sessionRecord.user_id);

        if (sessionUpdateError) {
          console.error(
            `[CoverageAnalysisAPI] Failed to persist coverage analysis for session ${session_id}:`,
            sessionUpdateError
          );
        } else {
          console.log('[CoverageAnalysisAPI] telemetry', coverageTelemetry);
        }
      }
    }

    return Response.json({
      ...coverageResult,
      should_generate_drafts: coverageResult.coverage_percentage < 70,
      analysis_metadata: {
        execution_time_ms: executionTime,
        analyzed_task_count: foundTaskIds.length,
        requested_task_count: task_ids.length,
        missing_task_ids: missingTaskIds,
        threshold_used: 0.7,
        calculation_method: coverageCalculationMethod,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { 
          error: 'VALIDATION_ERROR', 
          message: 'Invalid input parameters',
          details: error.errors 
        },
        { status: 400 }
      );
    }
    
    console.error('[CoverageAnalysisAPI] Unexpected error in coverage analysis API:', error);
    return Response.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred during coverage analysis'
      },
      { status: 500 }
    );
  }
}
