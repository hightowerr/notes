import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateTaskId } from '@/lib/services/embeddingService';
import { getTaskRecordsByIds, type TaskRecord } from '@/lib/services/taskRepository';
import { ManualOverrideSchema, type ManualOverrideState } from '@/lib/schemas/manualOverride';

const supabase = getSupabaseAdminClient();

const CATEGORY_LABELS: Record<LnoCategory, string> = {
  leverage: 'Leverage',
  neutral: 'Neutral',
  overhead: 'Overhead',
};

const CATEGORY_VERBS: Record<LnoCategory, string> = {
  leverage: 'accelerates',
  neutral: 'keeps',
  overhead: 'removes drag from',
};

const CATEGORY_CONTEXT: Record<LnoCategory, string> = {
  leverage: 'high-impact work that pushes forward',
  neutral: 'operational work that safeguards',
  overhead: 'supporting work that protects',
};

export type LnoCategory = 'leverage' | 'neutral' | 'overhead';

type TaskEmbeddingRow = {
  task_id: string;
  task_text: string | null;
  document_id: string | null;
  is_manual?: boolean | null;
  manual_overrides?: unknown;
};

type ProcessedDocumentRow = {
  id: string;
  structured_output: {
    lno_tasks?: {
      leverage?: Array<string | null> | null;
      neutral?: Array<string | null> | null;
      overhead?: Array<string | null> | null;
    } | null;
  } | null;
  uploaded_files?: {
    name?: string | null;
  } | null;
};

export type OutcomeAlignedTask = {
  task_id: string;
  document_id: string | null;
  document_name?: string | null;
  original_text: string;
  title: string;
  category: LnoCategory | null;
  rationale: string | null;
  is_manual?: boolean;
  manual_override?: ManualOverrideState | null;
};

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildOutcomeAlignment(
  text: string,
  category: LnoCategory,
  outcome?: string | null
): { title: string; rationale: string } {
  const outcomeLabel = normalizeText(outcome) ?? 'your stated outcome';
  const quotedOutcome = normalizeText(outcome) ? `"${outcomeLabel}"` : outcomeLabel;
  const label = CATEGORY_LABELS[category];
  const verb = CATEGORY_VERBS[category];
  const context = CATEGORY_CONTEXT[category];

  // Return clean title without brackets - category will be displayed separately in UI
  const title = text;
  const rationale = `${context} ${quotedOutcome} by ensuring ${text}. This ${label.toLowerCase()} task ${verb} momentum toward ${quotedOutcome}.`;

  return { title, rationale };
}

function buildLnoIndex(docs: ProcessedDocumentRow[]): Map<string, { category: LnoCategory; text: string }> {
  const index = new Map<string, { category: LnoCategory; text: string }>();

  docs.forEach(doc => {
    if (!doc || typeof doc.id !== 'string') {
      return;
    }

    const lnoTasks = doc.structured_output?.lno_tasks;
    if (!lnoTasks) {
      return;
    }

    (['leverage', 'neutral', 'overhead'] as const).forEach(category => {
      const tasks = lnoTasks[category];
      if (!Array.isArray(tasks)) {
        return;
      }

      tasks.forEach(taskText => {
        const normalized = normalizeText(taskText);
        if (!normalized) {
          return;
        }
        const taskId = generateTaskId(normalized, doc.id);
        index.set(taskId, { category, text: normalized });
      });
    });
  });

  return index;
}

export async function resolveOutcomeAlignedTasks(
  taskIds: string[],
  options: { outcome?: string | null } = {}
): Promise<Record<string, OutcomeAlignedTask>> {
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return {};
  }

  const uniqueTaskIds = Array.from(new Set(taskIds));

  // 🔍 DIAGNOSTIC: Log input task IDs
  console.log('[LNOTaskService] Input:', {
    taskIdsCount: uniqueTaskIds.length,
    sampleIds: uniqueTaskIds.slice(0, 3).map(id => id.slice(0, 16) + '...')
  });

  const { data: taskRows, error: taskError } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text, document_id, is_manual, manual_overrides')
    .in('task_id', uniqueTaskIds)
    .returns<TaskEmbeddingRow[]>();

  if (taskError) {
    throw new Error(`Failed to load task embeddings: ${taskError.message}`);
  }

  // 🔍 DIAGNOSTIC: Log query results
  console.log('[LNOTaskService] Task embeddings query:', {
    rowsReturned: taskRows?.length ?? 0,
    sampleRows: (taskRows ?? []).slice(0, 2).map(row => ({
      id: row.task_id?.slice(0, 16) + '...',
      hasText: !!row.task_text,
      hasDocId: !!row.document_id
    }))
  });

  const taskRowMap = new Map<string, TaskEmbeddingRow>();
  (taskRows ?? []).forEach(row => {
    if (row?.task_id) {
      taskRowMap.set(row.task_id, row);
    }
  });

  const idsNeedingRecovery = uniqueTaskIds.filter(taskId => {
    const row = taskRowMap.get(taskId);
    return !row || !normalizeText(row.task_text);
  });

  let recoveredRecords: TaskRecord[] = [];
  if (idsNeedingRecovery.length > 0) {
    try {
      const recovery = await getTaskRecordsByIds(idsNeedingRecovery, { recoverMissing: true });
      recoveredRecords = recovery.tasks;
      console.log('[LNOTaskService] Text recovery summary:', {
        requested: idsNeedingRecovery.length,
        recovered: recovery.tasks.length,
        stillMissing: recovery.missingIds.length,
        sampleRecovered: recovery.tasks.slice(0, 2).map(task => ({
          id: task.task_id.slice(0, 16) + '...',
          hasText: !!task.task_text,
          documentId: task.document_id,
        })),
      });
    } catch (error) {
      console.error('[LNOTaskService] Failed to recover task texts', error);
    }
  }

  const recoveredMap = new Map<string, TaskRecord>();
  recoveredRecords.forEach(record => {
    recoveredMap.set(record.task_id, record);
    if (!taskRowMap.has(record.task_id)) {
      taskRowMap.set(record.task_id, {
        task_id: record.task_id,
        task_text: record.task_text,
        document_id: record.document_id,
        is_manual: false,
        manual_overrides: null,
      });
    }
  });

  const documentIdSet = new Set<string>();
  (taskRows ?? []).forEach(row => {
    if (row?.document_id) {
      documentIdSet.add(row.document_id);
    }
  });
  recoveredRecords.forEach(record => {
    if (record.document_id) {
      documentIdSet.add(record.document_id);
    }
  });

  let lnoIndex = new Map<string, { category: LnoCategory; text: string }>();
  const documentNameMap = new Map<string, string | null>();

  if (documentIdSet.size > 0) {
    const { data: docs, error: docError } = await supabase
      .from('processed_documents')
      .select('id, structured_output, uploaded_files(name)')
      .in('id', Array.from(documentIdSet))
      .returns<ProcessedDocumentRow[]>();

    if (docError) {
      throw new Error(`Failed to load processed documents: ${docError.message}`);
    }

    (docs ?? []).forEach(doc => {
      if (doc?.id) {
        documentNameMap.set(doc.id, doc.uploaded_files?.name ?? null);
      }
    });

    lnoIndex = buildLnoIndex(docs ?? []);

    // 🔍 DIAGNOSTIC: Log LNO index contents
    console.log('[LNOTaskService] LNO index built:', {
      indexSize: lnoIndex.size,
      sampleEntries: Array.from(lnoIndex.entries()).slice(0, 2).map(([id, data]) => ({
        id: id.slice(0, 16) + '...',
        category: data.category,
        textLength: data.text.length,
      })),
    });
  }

  const outcome = options.outcome;

  // 🔍 DIAGNOSTIC: Log detailed info about task rows
  console.log('[LNOTaskService] Processing task rows:', {
    totalRows: taskRows?.length ?? 0,
    rowsWithMissingText:
      taskRows?.filter(row => !normalizeText(row.task_text)).length ?? 0,
    sampleMissingText: taskRows
      ?.filter(row => !normalizeText(row.task_text))
      .slice(0, 2)
      .map(row => ({
        id: row.task_id.slice(0, 16) + '...',
        textIsNull: row.task_text === null,
        textIsEmpty: row.task_text === '',
        textLength: typeof row.task_text === 'string' ? row.task_text.length : 'not string',
        hasDocId: !!row.document_id,
        isManual: row.is_manual,
      })),
  });

  const result: Record<string, OutcomeAlignedTask> = {};

  for (const taskId of uniqueTaskIds) {
    const row = taskRowMap.get(taskId) ?? null;
    const recovered = recoveredMap.get(taskId);

    const manualOverrideResult = ManualOverrideSchema.safeParse(
      row?.manual_overrides ?? null
    );
    const manualOverride: ManualOverrideState | null = manualOverrideResult.success
      ? manualOverrideResult.data
      : null;

    const classification = lnoIndex.get(taskId);
    if (classification) {
      const { title, rationale } = buildOutcomeAlignment(
        classification.text,
        classification.category,
        outcome
      );
      result[taskId] = {
        task_id: taskId,
        document_id: row?.document_id ?? recovered?.document_id ?? null,
        original_text: classification.text,
        title,
        category: classification.category,
        rationale,
        document_name: documentNameMap.get(row?.document_id ?? recovered?.document_id ?? '') ?? null,
        is_manual: Boolean(row?.is_manual),
        manual_override: manualOverride,
      };
      continue;
    }

    const fallbackText =
      normalizeText(row?.task_text) ?? normalizeText(recovered?.task_text);
    if (fallbackText) {
      const fallbackCategory: LnoCategory = 'neutral';
      const { title, rationale } = buildOutcomeAlignment(
        fallbackText,
        fallbackCategory,
        outcome
      );
      result[taskId] = {
        task_id: taskId,
        document_id: row?.document_id ?? recovered?.document_id ?? null,
        original_text: fallbackText,
        title,
        category: fallbackCategory,
        rationale,
        document_name: documentNameMap.get(row?.document_id ?? recovered?.document_id ?? '') ?? null,
        is_manual: Boolean(row?.is_manual),
        manual_override: manualOverride,
      };
      continue;
    }

    console.warn('[LNOTaskService] Unable to recover text for task, using fallback title', {
      taskId: taskId.slice(0, 16) + '...',
      hasRow: Boolean(row),
      hasRecoveredRecord: Boolean(recovered),
    });

    const fallbackTitle = 'Untitled task';
    result[taskId] = {
      task_id: taskId,
      document_id: row?.document_id ?? recovered?.document_id ?? null,
      original_text: fallbackTitle,
      title: fallbackTitle,
      category: null,
      rationale: null,
      is_manual: Boolean(row?.is_manual),
      manual_override: manualOverride,
    };
  }

  return result;
}

export function filterAlignedTaskSummaries<T extends { task_id: string }>(
  tasks: T[],
  alignmentMap: Record<string, OutcomeAlignedTask>
): Array<T & { title: string; lnoCategory: LnoCategory; outcomeAlignment: string | null; sourceText: string }>
{
  const aligned: Array<T & { title: string; lnoCategory: LnoCategory; outcomeAlignment: string | null; sourceText: string }>
    = [];

  tasks.forEach(task => {
    const meta = alignmentMap[task.task_id];
    if (!meta || !meta.category) {
      return;
    }

    aligned.push({
      ...task,
      title: meta.title,
      lnoCategory: meta.category,
      outcomeAlignment: meta.rationale,
      sourceText: meta.original_text,
    });
  });

  return aligned;
}

export { buildOutcomeAlignment };
