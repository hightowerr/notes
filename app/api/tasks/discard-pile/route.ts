import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

type DiscardPileTask = {
  task_id: string;
  task_text: string;
  exclusion_reason: string | null;
  created_at: string | null;
  is_manual: boolean;
  outcome_id?: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const outcomeId = url.searchParams.get('outcome_id');

  try {
    const supabase = await createClient();

    let query = supabase
      .from('manual_tasks')
      .select('task_id, exclusion_reason, created_at, deleted_at, outcome_id, status')
      .eq('status', 'not_relevant')
      .is('deleted_at', null);

    if (outcomeId) {
      query = query.eq('outcome_id', outcomeId);
    }

    const { data: manualTasks, error } = await query.returns<{
      task_id: string;
      exclusion_reason: string | null;
      created_at: string | null;
      deleted_at: string | null;
      outcome_id: string | null;
      status: string;
    }[]>();

    if (error) {
      throw error;
    }

    console.info('[DiscardPile][Query]', {
      outcomeId: outcomeId ?? 'all',
      manualCount: manualTasks.length,
    });

    const filtered = manualTasks.filter(task =>
      outcomeId ? task.outcome_id === outcomeId : true
    );

    const taskIds = filtered.map(task => task.task_id);
    if (taskIds.length === 0) {
      return NextResponse.json({ tasks: [] }, { status: 200 });
    }

    const { data: embeddings, error: embeddingError } = await supabase
      .from('task_embeddings')
      .select('task_id, task_text, is_manual')
      .in('task_id', taskIds)
      .returns<{
        task_id: string;
        task_text: string;
        is_manual: boolean | null;
      }[]>();

    if (embeddingError) {
      throw embeddingError;
    }

    console.info('[DiscardPile][Embeddings]', {
      requested: taskIds.length,
      found: embeddings.length,
    });

    const embeddingMap = new Map(embeddings.map(row => [row.task_id, row]));

    const tasks: DiscardPileTask[] = filtered
      .map(task => {
        const embedding = embeddingMap.get(task.task_id);
        if (!embedding) return null;
        return {
          task_id: task.task_id,
          task_text: embedding.task_text,
          exclusion_reason: task.exclusion_reason,
          created_at: task.created_at,
          is_manual: Boolean(embedding.is_manual ?? true),
          outcome_id: task.outcome_id,
        };
      })
      .filter(Boolean) as DiscardPileTask[];

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load discard pile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
