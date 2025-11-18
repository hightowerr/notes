import { NextRequest } from 'next/server';
import { z } from 'zod';
import { QualityMetadataSchema, QualitySummarySchema } from '../../../../lib/schemas/taskIntelligence';
import { batchEvaluateQuality } from '../../../../lib/services/qualityEvaluation';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

// Define the request schema
const QualityEvaluationRequestSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      text: z.string().min(1).max(500)
    })
  ).min(1).max(50), // Max 50 tasks per request (FR-017)
  force_heuristic: z.boolean().optional().default(false)
});

export async function POST(request: NextRequest) {
  try {
    // Initialize Supabase admin client (needs service role per CLAUDE.md)
    let supabase: ReturnType<typeof getSupabaseAdminClient> | null = null;
    try {
      supabase = getSupabaseAdminClient();
    } catch (clientError) {
      console.warn('[QualityEvaluationAPI] Supabase admin client unavailable. Skipping persistence.', clientError);
    }

    // Parse and validate the request body
    const body = await request.json();
    const { tasks, force_heuristic } = QualityEvaluationRequestSchema.parse(body);

    // Perform quality evaluations in parallel
    const startTime = Date.now();
    const evaluations = await batchEvaluateQuality(
      tasks,
      force_heuristic
    );
    const executionTime = Date.now() - startTime;

    // Calculate quality summary
    const summary = {
      average_clarity: evaluations.reduce((sum, evalItem) => sum + evalItem.clarity_score, 0) / evaluations.length,
      high_quality_count: evaluations.filter(evalItem => evalItem.clarity_score >= 0.8).length,
      needs_review_count: evaluations.filter(evalItem => evalItem.clarity_score >= 0.5 && evalItem.clarity_score < 0.8).length,
      needs_work_count: evaluations.filter(evalItem => evalItem.clarity_score < 0.5).length,
      analyzed_at: new Date().toISOString()
    };

    // Validate summary against schema
    QualitySummarySchema.parse(summary);

    // Update quality metadata in database
    if (supabase) {
      for (const evaluation of evaluations) {
        const { error } = await supabase
          .from('task_embeddings')
          .update({
            quality_metadata: evaluation.quality_metadata
          })
          .eq('task_id', evaluation.task_id);

        if (error) {
          console.error(`Failed to update quality metadata for task ${evaluation.task_id}:`, error);
          // Continue with other updates even if one fails
        }
      }
    }

    const methodCounts = evaluations.reduce<Record<string, number>>((acc, evaluation) => {
      const method = evaluation.quality_metadata?.calculation_method ?? 'unknown';
      acc[method] = (acc[method] ?? 0) + 1;
      return acc;
    }, {});

    // Log execution time for observability (per research.md requirement)
    console.log('[QualityEvaluationAPI] telemetry', {
      duration_ms: executionTime,
      task_count: tasks.length,
      method_counts: methodCounts,
    });

    // Return the evaluations and summary
    return Response.json({
      evaluations,
      summary,
      metadata: {
        execution_time_ms: executionTime,
        task_count: tasks.length,
        calculation_method: force_heuristic ? 'heuristic' : 'ai_with_fallback'
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
    
    console.error('Unexpected error in quality evaluation API:', error);
    return Response.json(
      { 
        error: 'INTERNAL_SERVER_ERROR', 
        message: 'An unexpected error occurred during quality evaluation' 
      },
      { status: 500 }
    );
  }
}
