import type { TaskSummary } from '@/lib/types/agent';

export type BaselineSummary = {
  document_ids: string[];
  document_count: number;
  task_count: number;
  top_task_ids: string[];
  created_at: string | null;
  age_hours: number | null;
};

export type IncrementalContext = {
  baseline: BaselineSummary | null;
  new_tasks: TaskSummary[];
  all_tasks: TaskSummary[];
  is_first_run: boolean;
  token_savings_estimate: number;
};

/**
 * Builds an incremental context that separates baseline (previously processed)
 * documents from new documents for token-efficient LLM calls.
 *
 * @param tasks - All tasks to be prioritized
 * @param baselineDocumentIds - Document IDs from the last successful prioritization
 * @param baselineCreatedAt - When the baseline was created
 * @returns Incremental context with baseline summary and new tasks
 */
export function buildIncrementalContext(
  tasks: TaskSummary[],
  baselineDocumentIds: string[] = [],
  baselineCreatedAt: string | null = null
): IncrementalContext {
  const isFirstRun = baselineDocumentIds.length === 0;
  const baselineDocSet = new Set(baselineDocumentIds);

  // Separate tasks into baseline and new
  const baselineTasks: TaskSummary[] = [];
  const newTasks: TaskSummary[] = [];

  tasks.forEach(task => {
    if (task.document_id && baselineDocSet.has(task.document_id)) {
      baselineTasks.push(task);
    } else {
      newTasks.push(task);
    }
  });

  // Calculate baseline summary
  const baseline = isFirstRun
    ? null
    : createBaselineSummary(baselineTasks, baselineDocumentIds, baselineCreatedAt);

  // Estimate token savings (assume avg 50 tokens per task, summary ~100 tokens)
  const baselineTokenEstimate = baselineTasks.length * 50;
  const summaryTokenEstimate = 100;
  const tokenSavings = isFirstRun ? 0 : Math.max(0, baselineTokenEstimate - summaryTokenEstimate);

  return {
    baseline,
    new_tasks: newTasks,
    all_tasks: tasks,
    is_first_run: isFirstRun,
    token_savings_estimate: tokenSavings,
  };
}

/**
 * Creates a compact summary of baseline tasks for the LLM prompt.
 */
function createBaselineSummary(
  baselineTasks: TaskSummary[],
  baselineDocumentIds: string[],
  baselineCreatedAt: string | null
): BaselineSummary {
  const uniqueDocIds = Array.from(
    new Set(baselineTasks.map(t => t.document_id).filter((id): id is string => Boolean(id)))
  );

  // Get top task IDs (up to 10) by priority or first N
  const topTaskIds = baselineTasks.slice(0, 10).map(t => t.task_id);

  // Calculate age in hours
  let ageHours: number | null = null;
  if (baselineCreatedAt) {
    try {
      const baselineTime = new Date(baselineCreatedAt).getTime();
      if (!Number.isNaN(baselineTime)) {
        const now = Date.now();
        ageHours = Math.max(0, (now - baselineTime) / (1000 * 60 * 60));
      }
    } catch {
      ageHours = null;
    }
  }

  return {
    document_ids: uniqueDocIds.length > 0 ? uniqueDocIds : baselineDocumentIds,
    document_count: uniqueDocIds.length || baselineDocumentIds.length,
    task_count: baselineTasks.length,
    top_task_ids: topTaskIds,
    created_at: baselineCreatedAt,
    age_hours: ageHours,
  };
}

/**
 * Formats baseline summary as a compact text block for the LLM prompt.
 */
export function formatBaselineSummary(baseline: BaselineSummary | null): string {
  if (!baseline) {
    return 'No previous baseline.';
  }

  const ageText = baseline.age_hours !== null
    ? ` (${baseline.age_hours < 1 ? 'less than 1 hour' : `${Math.round(baseline.age_hours)} hours`} ago)`
    : '';

  const lines = [
    `BASELINE CONTEXT (previously analyzed${ageText}):`,
    `- ${baseline.document_count} document${baseline.document_count === 1 ? '' : 's'} with ${baseline.task_count} task${baseline.task_count === 1 ? '' : 's'}`,
  ];

  if (baseline.document_ids.length > 0 && baseline.document_ids.length <= 10) {
    lines.push(`- Document IDs: ${baseline.document_ids.join(', ')}`);
  } else if (baseline.document_ids.length > 10) {
    lines.push(`- Document IDs: ${baseline.document_ids.slice(0, 10).join(', ')}, ... (${baseline.document_ids.length - 10} more)`);
  }

  if (baseline.top_task_ids.length > 0) {
    lines.push(`- Top task IDs from baseline: ${baseline.top_task_ids.join(', ')}`);
  }

  lines.push('');
  lines.push('NOTE: Baseline tasks have already been analyzed and prioritized. Focus on integrating NEW tasks below with the existing baseline.');

  return lines.join('\n');
}

/**
 * Formats new tasks as JSON for the LLM prompt.
 */
export function formatNewTasks(newTasks: TaskSummary[]): string {
  if (newTasks.length === 0) {
    return 'No new tasks to analyze.';
  }

  return newTasks
    .map(task =>
      JSON.stringify({
        id: task.task_id,
        text: task.task_text,
        document_id: task.document_id,
        source: task.source,
        lnoCategory: task.lnoCategory,
      })
    )
    .join('\n');
}

/**
 * Builds the complete prompt context with baseline summary + new tasks.
 */
export function buildIncrementalPromptContext(context: IncrementalContext): {
  baseline_summary: string;
  new_tasks_text: string;
  task_count: number;
  new_task_count: number;
} {
  return {
    baseline_summary: formatBaselineSummary(context.baseline),
    new_tasks_text: formatNewTasks(context.new_tasks),
    task_count: context.all_tasks.length,
    new_task_count: context.new_tasks.length,
  };
}
