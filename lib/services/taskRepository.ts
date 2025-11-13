import { supabase } from '@/lib/supabase';
import { generateTaskId } from '@/lib/services/embeddingService';

type TaskSource = 'embedding' | 'recovered';

export type TaskRecord = {
  task_id: string;
  task_text: string;
  created_at: string | null;
  document_id: string | null;
  source: TaskSource;
};

type FetchOptions = {
  recoverMissing?: boolean;
  pageSize?: number;
};

type TaskEmbeddingsRow = {
  task_id: string | null;
  task_text: string | null;
  created_at: string | null;
  document_id: string | null;
};

type ProcessedDocumentRow = {
  id: string;
  processed_at: string | null;
  structured_output: {
    actions?: Array<string | { text?: string | null } | null> | null;
    lno_tasks?: {
      leverage?: Array<string | null> | null;
      neutral?: Array<string | null> | null;
      overhead?: Array<string | null> | null;
    } | null;
  } | null;
};

const DEFAULT_PAGE_SIZE = 100;

export async function getTaskRecordsByIds(
  taskIds: string[],
  options: FetchOptions = {}
): Promise<{
  tasks: TaskRecord[];
  missingIds: string[];
  recoveredTaskIds: string[];
}> {
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return { tasks: [], missingIds: [], recoveredTaskIds: [] };
  }

  const { data, error } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text, created_at, document_id')
    .in('task_id', taskIds)
    .returns<TaskEmbeddingsRow[]>();

  if (error) {
    throw new Error(`Failed to load task embeddings: ${error.message}`);
  }

  // 🔍 DIAGNOSTIC: Log tasks found in the database
  console.log('[TaskRepository] Loaded task embeddings from DB:', {
    requestedCount: taskIds.length,
    foundCount: data?.length ?? 0,
    missingCount: taskIds.length - (data?.length ?? 0),
    missingSample: taskIds.filter(id => !(data ?? []).some(row => row.task_id === id)).slice(0, 5),
    nullTextCount: (data ?? []).filter(row => row.task_text === null).length,
    emptyTextCount: (data ?? []).filter(row => row.task_text === '').length,
    sampleNullText: (data ?? [])
      .filter(row => row.task_text === null)
      .slice(0, 3)
      .map(row => ({ id: row.task_id.slice(0, 16) + '...', text: row.task_text })),
    sampleEmptyText: (data ?? [])
      .filter(row => row.task_text === '')
      .slice(0, 3)
      .map(row => ({ id: row.task_id.slice(0, 16) + '...', text: row.task_text }))
  });

  const taskMap = new Map<string, TaskRecord>();

  (data ?? []).forEach(row => {
    if (!row || typeof row.task_id !== 'string' || typeof row.task_text !== 'string') {
      return;
    }

    taskMap.set(row.task_id, {
      task_id: row.task_id,
      task_text: row.task_text,
      created_at: row.created_at ?? null,
      document_id: row.document_id ?? null,
      source: 'embedding',
    });
  });

  const recoveredTaskIds: string[] = [];
  let missingIds = taskIds.filter(id => !taskMap.has(id));

  if (missingIds.length > 0 && options.recoverMissing !== false) {
    const recovered = await recoverTasksFromDocuments(missingIds, options.pageSize);

    recovered.forEach(task => {
      taskMap.set(task.task_id, task);
      recoveredTaskIds.push(task.task_id);
    });

    missingIds = taskIds.filter(id => !taskMap.has(id));
  }

  const orderedTasks: TaskRecord[] = taskIds
    .map(id => taskMap.get(id))
    .filter((task): task is TaskRecord => Boolean(task));

  return {
    tasks: orderedTasks,
    missingIds,
    recoveredTaskIds,
  };
}

async function recoverTasksFromDocuments(
  targetTaskIds: string[],
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<TaskRecord[]> {
  const remaining = new Set(targetTaskIds);
  if (remaining.size === 0) {
    return [];
  }

  const recovered: TaskRecord[] = [];
  let rangeStart = 0;

  while (remaining.size > 0) {
    const rangeEnd = rangeStart + pageSize - 1;

    const { data, error } = await supabase
      .from('processed_documents')
      .select('id, processed_at, structured_output')
      .range(rangeStart, rangeEnd)
      .returns<ProcessedDocumentRow[]>();

    if (error) {
      console.error('[TaskRepository] Failed to fetch processed_documents during recovery', error);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const doc of data) {
      if (!doc || typeof doc.id !== 'string') {
        continue;
      }

      const candidateTexts = extractTaskTexts(doc.structured_output);

      for (const taskText of candidateTexts) {
        const computedId = generateTaskId(taskText, doc.id);

        if (!remaining.has(computedId)) {
          continue;
        }

        recovered.push({
          task_id: computedId,
          task_text: taskText,
          created_at: doc.processed_at ?? null,
          document_id: doc.id,
          source: 'recovered',
        });

        remaining.delete(computedId);

        if (remaining.size === 0) {
          break;
        }
      }

      if (remaining.size === 0) {
        break;
      }
    }

    if (data.length < pageSize) {
      break;
    }

    rangeStart += pageSize;
  }

  return recovered;
}

function extractTaskTexts(
  structuredOutput: ProcessedDocumentRow['structured_output']
): string[] {
  if (!structuredOutput || typeof structuredOutput !== 'object') {
    return [];
  }

  const texts = new Set<string>();

  const addText = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }
    const normalized = value.trim();
    if (normalized.length === 0) {
      return;
    }
    texts.add(normalized);
  };

  const { actions, lno_tasks: lnoTasks } = structuredOutput;

  if (Array.isArray(actions)) {
    actions.forEach(action => {
      if (typeof action === 'string') {
        addText(action);
        return;
      }

      if (action && typeof action === 'object' && 'text' in action) {
        const maybeText = (action as { text?: string | null }).text;
        if (typeof maybeText === 'string') {
          addText(maybeText);
        }
      }
    });
  }

  const candidateGroups: Array<Array<string | null> | null | undefined> = [
    lnoTasks?.leverage,
    lnoTasks?.neutral,
    lnoTasks?.overhead,
  ];

  candidateGroups.forEach(group => {
    if (!Array.isArray(group)) {
      return;
    }
    group.forEach(task => addText(task ?? ''));
  });

  return Array.from(texts);
}
