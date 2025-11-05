import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { bridgingTaskSchema } from '@/lib/schemas/bridgingTaskSchema';
import {
  insertBridgingTasks,
  TaskInsertionError,
} from '@/lib/services/taskInsertionService';

const acceptedTaskSchema = z.object({
  task: bridgingTaskSchema,
  predecessor_id: z.string().min(1),
  successor_id: z.string().min(1),
});

const requestSchema = z.object({
  accepted_tasks: z.array(acceptedTaskSchema).min(1).max(9),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
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
        code: 'INVALID_ACCEPTED_TASKS',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  try {
    const result = await insertBridgingTasks(parsed.data.accepted_tasks);

    console.log('[GapAcceptance] Inserted bridging tasks', {
      inserted_count: result.inserted_count,
      relationships_created: result.relationships_created,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof TaskInsertionError) {
      const payload = {
        error: error.message,
        code: error.code,
        validation_errors: error.validationErrors,
      };

      switch (error.code) {
        case 'VALIDATION_ERROR':
          return NextResponse.json(payload, { status: 400 });
        case 'TASK_NOT_FOUND':
          return NextResponse.json(payload, { status: 404 });
        case 'CYCLE_DETECTED':
          return NextResponse.json(payload, { status: 409 });
        case 'DUPLICATE_TASK':
          return NextResponse.json(payload, { status: 422 });
        default:
          return NextResponse.json(payload, { status: 500 });
      }
    }

    // Log the full error for debugging
    console.error('[GapAcceptance] Unexpected error:', error);
    console.error('[GapAcceptance] Error details:', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Task acceptance failed',
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.stack?.split('\n').slice(0, 3) : undefined,
      },
      { status: 500 }
    );
  }
}
