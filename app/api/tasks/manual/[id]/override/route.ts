import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  ManualTaskInvalidStateError,
  ManualTaskNotFoundError,
  ManualTaskPlacementError,
  overrideDiscardDecision,
} from '@/lib/services/manualTaskPlacement';

const overrideSchema = z.object({
  user_justification: z.string().max(500).optional(),
});

export async function POST(request: Request, context: { params: { id: string } }) {
  const taskId = context.params.id;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = overrideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', code: 'INVALID_INPUT', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await overrideDiscardDecision({
      taskId,
      userJustification: parsed.data.user_justification,
    });

    return NextResponse.json(
      { status: 'analyzing', message: 'Task sent back for re-analysis' },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ManualTaskNotFoundError) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    if (error instanceof ManualTaskInvalidStateError) {
      return NextResponse.json({ error: 'Task is not in discard pile' }, { status: 400 });
    }
    const message =
      error instanceof ManualTaskPlacementError
        ? error.message
        : 'Failed to override discard decision';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
