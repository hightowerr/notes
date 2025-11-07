import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveOutcomeAlignedTasks } from '@/lib/services/lnoTaskService';

const requestSchema = z.object({
  taskIds: z.array(z.string().min(1)).max(400),
  outcome: z.string().min(3).max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsed = requestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { taskIds, outcome } = parsed.data;

    if (taskIds.length === 0) {
      return NextResponse.json({ tasks: [] }, { status: 200 });
    }

    const metadata = await resolveOutcomeAlignedTasks(taskIds, { outcome });
    const tasks = taskIds
      .map(taskId => metadata[taskId])
      .filter((task): task is NonNullable<typeof task> => Boolean(task));

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error) {
    console.error('[TaskMetadata API] Failed to build metadata', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Unable to load task metadata' },
      { status: 500 }
    );
  }
}
