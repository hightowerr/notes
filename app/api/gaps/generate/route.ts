import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { generateBridgingTasks, TaskGenerationError } from '@/lib/services/taskGenerationService';

const requestSchema = z.object({
  gap_id: z.string().uuid(),
  predecessor_task_id: z.string().min(1),
  successor_task_id: z.string().min(1),
  outcome_statement: z.string().min(10).max(500).optional(),
  manual_examples: z.array(z.string().min(10).max(200)).min(1).max(2).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid JSON payload',
        code: 'INVALID_BODY',
      },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        code: 'INVALID_GAP_GENERATION_PARAMS',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { gap_id: gapId, predecessor_task_id, successor_task_id, outcome_statement, manual_examples } =
    parsed.data;

  try {
    const result = await generateBridgingTasks({
      gapId,
      predecessorTaskId: predecessor_task_id,
      successorTaskId: successor_task_id,
      outcomeStatement: outcome_statement,
      manualExamples: manual_examples,
    });

    console.log('[GapGeneration] Generated bridging tasks', {
      gapId,
      count: result.bridging_tasks.length,
      searchResults: result.search_results_count,
      durationMs: result.generation_duration_ms,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof TaskGenerationError) {
      const baseResponse = {
        error: error.message,
        code: error.code,
        ...(error.metadata && { metadata: error.metadata }),
      };

      // T005: Add timeout and AI service error handling
      switch (error.code) {
        case 'VALIDATION_ERROR':
          return NextResponse.json(baseResponse, { status: 400 });
        case 'TASK_NOT_FOUND':
          return NextResponse.json(baseResponse, { status: 404 });
        case 'NO_SUGGESTIONS':
          return NextResponse.json(baseResponse, { status: 422 });
        case 'REQUIRES_MANUAL_EXAMPLES':
          return NextResponse.json(baseResponse, { status: 422 });
        case 'EMBEDDING_ERROR':
          return NextResponse.json(baseResponse, { status: 502 });
        case 'TIMEOUT':
          // T005: 504 Gateway Timeout for AI generation timeout
          console.error('[GapGeneration] AI generation timeout', {
            gapId,
            timeout_ms: error.metadata?.timeout_ms,
          });
          return NextResponse.json(baseResponse, { status: 504 });
        case 'AI_SERVICE_ERROR':
          // T005: 500 Internal Server Error for AI service failures
          console.error('[GapGeneration] AI service error', {
            gapId,
            error: error.metadata?.original_error,
          });
          return NextResponse.json(baseResponse, { status: 500 });
        case 'GENERATION_FAILED':
          // T005: Log generation failures for debugging
          console.error('[GapGeneration] Generation failed', {
            gapId,
            error: error.metadata?.original_error,
          });
          return NextResponse.json(baseResponse, { status: 500 });
        default:
          return NextResponse.json(baseResponse, { status: 500 });
      }
    }

    console.error('[GapGeneration] Unexpected error', error);
    return NextResponse.json(
      {
        error: 'Task generation failed',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
