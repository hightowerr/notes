import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function PATCH(_request: Request, context: { params: { id: string } }) {
  const taskId = context.params.id;
  if (!taskId) {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from('manual_tasks')
      .select('task_id, deleted_at, marked_done_at')
      .eq('task_id', taskId)
      .maybeSingle<{ task_id: string; deleted_at: string | null; marked_done_at: string | null }>();

    if (fetchError) {
      throw fetchError;
    }

    // Idempotent: if missing or already deleted, treat as success with already_marked flag
    if (!existing || existing.deleted_at) {
      return NextResponse.json(
        { success: true, task_id: taskId, already_marked: true },
        { status: 200 }
      );
    }

    const alreadyMarked = Boolean(existing.marked_done_at);

    if (alreadyMarked) {
      return NextResponse.json(
        { success: true, task_id: taskId, already_marked: true },
        { status: 200 }
      );
    }

    const { data, error } = await supabase
      .from('manual_tasks')
      .update({ marked_done_at: new Date().toISOString() })
      .eq('task_id', taskId)
      .select('task_id')
      .maybeSingle<{ task_id: string }>();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { success: true, task_id: taskId, already_marked: false },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mark task done';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
