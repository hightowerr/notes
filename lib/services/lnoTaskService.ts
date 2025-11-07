import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateTaskId } from '@/lib/services/embeddingService';

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
};

export type OutcomeAlignedTask = {
  task_id: string;
  document_id: string | null;
  original_text: string;
  title: string;
  category: LnoCategory | null;
  rationale: string | null;
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

  const title = `[${label}] ${text}`;
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

  const { data: taskRows, error: taskError } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text, document_id')
    .in('task_id', taskIds)
    .returns<TaskEmbeddingRow[]>();

  if (taskError) {
    throw new Error(`Failed to load task embeddings: ${taskError.message}`);
  }

  const documentIds = Array.from(
    new Set(
      (taskRows ?? [])
        .map(row => row.document_id)
        .filter((value): value is string => typeof value === 'string')
    )
  );

  let lnoIndex = new Map<string, { category: LnoCategory; text: string }>();
  if (documentIds.length > 0) {
    const { data: docs, error: docError } = await supabase
      .from('processed_documents')
      .select('id, structured_output')
      .in('id', documentIds)
      .returns<ProcessedDocumentRow[]>();

    if (docError) {
      throw new Error(`Failed to load processed documents: ${docError.message}`);
    }

    lnoIndex = buildLnoIndex(docs ?? []);
  }

  const outcome = options.outcome;
  const result: Record<string, OutcomeAlignedTask> = {};

  for (const row of taskRows ?? []) {
    if (!row || typeof row.task_id !== 'string') {
      continue;
    }

    const classification = lnoIndex.get(row.task_id);
    if (classification) {
      const { title, rationale } = buildOutcomeAlignment(classification.text, classification.category, outcome);
      result[row.task_id] = {
        task_id: row.task_id,
        document_id: row.document_id,
        original_text: classification.text,
        title,
        category: classification.category,
        rationale,
      };
      continue;
    }

    const fallbackText = normalizeText(row.task_text);
    if (fallbackText) {
      const fallbackCategory: LnoCategory = 'neutral';
      const { title, rationale } = buildOutcomeAlignment(fallbackText, fallbackCategory, outcome);
      result[row.task_id] = {
        task_id: row.task_id,
        document_id: row.document_id,
        original_text: fallbackText,
        title,
        category: fallbackCategory,
        rationale,
      };
    } else {
      const fallbackTitle = row.task_id;
      result[row.task_id] = {
        task_id: row.task_id,
        document_id: row.document_id,
        original_text: fallbackTitle,
        title: fallbackTitle,
        category: null,
        rationale: null,
      };
    }
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
