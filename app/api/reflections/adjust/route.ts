import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { applyReflectionEffects } from '@/lib/services/reflectionAdjuster';

const requestSchema = z.object({
  reflection_ids: z.array(z.string().uuid()).min(1),
  task_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { reflection_ids: reflectionIds, task_ids: taskIds } = parsed.data;
    const { effects, tasksAffected, message } = await applyReflectionEffects(reflectionIds, taskIds);

    return NextResponse.json(
      {
        effects,
        tasks_affected: tasksAffected,
        message: message ?? undefined,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Reflections Adjust] Failed to apply effects', error);
    return NextResponse.json({ error: 'Failed to apply reflection effects' }, { status: 500 });
  }
}
