import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { detectGaps, MissingTaskError } from '@/lib/services/gapDetectionService';

const requestSchema = z.object({
  task_ids: z.array(z.string().min(1)).min(2).max(100),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        {
          error: 'Invalid JSON payload',
          code: 'INVALID_BODY',
        },
        { status: 400 }
      );
    }

    const parseResult = requestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          code: 'INVALID_TASK_IDS',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { task_ids: taskIds } = parseResult.data;
    const result = await detectGaps(taskIds);

    console.log('[GapDetection] Completed analysis', {
      task_count: taskIds.length,
      gaps_detected: result.metadata.gaps_detected,
      analysis_duration_ms: result.metadata.analysis_duration_ms,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof MissingTaskError) {
      return NextResponse.json(
        {
          error: error.message ?? 'Missing task embeddings for requested IDs',
          code: 'TASKS_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    console.error('[GapDetection] Failed to detect gaps', error);

    return NextResponse.json(
      {
        error: 'Gap detection failed',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
