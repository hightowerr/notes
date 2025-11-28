import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function POST(_request: Request, context: { params: { id: string } }) {
  const taskId = context.params.id;
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('manual_tasks')
      .select('task_id, status, deleted_at')
      .eq('task_id', taskId)
      .maybeSingle<{ task_id: string; status: string; deleted_at: string | null }>();

    if (!existing) {
      return NextResponse.json({ error: 'Manual task not found' }, { status: 404 });
    }

    if (existing.status !== 'not_relevant') {
      return NextResponse.json(
        { error: 'Task is not in discard pile', code: 'INVALID_STATE' },
        { status: 400 }
      );
    }

    const deletedAt = new Date().toISOString();
    const { error } = await supabase
      .from('manual_tasks')
      .update({ deleted_at: deletedAt })
      .eq('task_id', taskId);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Task discarded (recoverable for 30 days)',
        deleted_at: deletedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to discard manual task';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
