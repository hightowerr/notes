import { beforeEach, describe, expect, it, vi } from 'vitest';

const manualTasks: Array<{
  task_id: string;
  status: 'analyzing' | 'prioritized' | 'not_relevant' | 'conflict';
  agent_rank?: number | null;
  placement_reason?: string | null;
  exclusion_reason?: string | null;
  outcome_id?: string | null;
  deleted_at?: string | null;
}> = [];

const taskEmbeddings: Array<{
  task_id: string;
  task_text: string;
  is_manual?: boolean | null;
  outcome_id?: string | null;
}> = [];

const userOutcomes: Array<{
  id: string;
  is_active: boolean;
}> = [];

function buildQuery<T extends Record<string, any>>(table: T[]) {
  const filters: Array<(row: T) => boolean> = [];
  let limitCount: number | null = null;

  const applyFilters = () => {
    let results = table.filter(row => filters.every(predicate => predicate(row)));
    if (limitCount !== null) {
      results = results.slice(0, limitCount);
    }
    return results;
  };

  const builder: any = {
    eq(field: keyof T, value: unknown) {
      filters.push(row => row[field] === value);
      return builder;
    },
    is(field: keyof T, value: unknown) {
      filters.push(row => row[field] === value);
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    select() {
      return builder;
    },
    async maybeSingle() {
      return { data: applyFilters()[0] ?? null, error: null };
    },
    then(onFulfilled?: (value: { data: unknown; error: null }) => unknown) {
      const result = { data: applyFilters(), error: null };
      return Promise.resolve(onFulfilled ? onFulfilled(result) : (result as any));
    },
    update(payload: Partial<T>) {
      table.forEach(row => {
        if (filters.every(predicate => predicate(row))) {
          Object.assign(row, payload);
        }
      });
      return {
        select: async () => ({ data: applyFilters(), error: null }),
      };
    },
    insert(payload: T | T[]) {
      const rows = Array.isArray(payload) ? payload : [payload];
      table.push(...rows);
      return {
        select: async () => ({ data: rows, error: null }),
      };
    },
  };

  return builder;
}

vi.mock('@/lib/supabase/admin', () => {
  const supabase = {
    from: (tableName: string) => {
      if (tableName === 'manual_tasks') {
        return {
          select: () => buildQuery(manualTasks),
          update: (payload: Partial<(typeof manualTasks)[number]>) => ({
            eq(field: keyof (typeof manualTasks)[number], value: unknown) {
              manualTasks.forEach(row => {
                if ((row as any)[field] === value) {
                  Object.assign(row, payload);
                }
              });
              return {
                select: async () => ({
                  data: manualTasks.filter(row => (row as any)[field] === value),
                  error: null,
                }),
              };
            },
          }),
          insert: (payload: (typeof manualTasks)[number] | Array<(typeof manualTasks)[number]>) =>
            buildQuery(manualTasks).insert(payload),
        };
      }
      if (tableName === 'task_embeddings') {
        return {
          select: () => buildQuery(taskEmbeddings),
          update: (payload: Partial<(typeof taskEmbeddings)[number]>) => ({
            eq(field: keyof (typeof taskEmbeddings)[number], value: unknown) {
              taskEmbeddings.forEach(row => {
                if ((row as any)[field] === value) {
                  Object.assign(row, payload);
                }
              });
              return {
                select: async () => ({
                  data: taskEmbeddings.filter(row => (row as any)[field] === value),
                  error: null,
                }),
              };
            },
          }),
          insert: (payload: (typeof taskEmbeddings)[number] | Array<(typeof taskEmbeddings)[number]>) =>
            buildQuery(taskEmbeddings).insert(payload),
        };
      }
      if (tableName === 'user_outcomes') {
        return {
          select: () => buildQuery(userOutcomes),
          insert: (payload: (typeof userOutcomes)[number] | Array<(typeof userOutcomes)[number]>) =>
            buildQuery(userOutcomes).insert(payload),
        };
      }
      throw new Error(`Unexpected table: ${tableName}`);
    },
  };
  return {
    getSupabaseAdminClient: () => supabase,
  };
});

vi.mock('@/lib/mastra/init', () => ({
  initializeMastra: () => ({}),
}));

const runPrioritization = vi.fn();
vi.mock('@/lib/mastra/agents/prioritizationGenerator', () => ({
  createPrioritizationAgent: () => ({
    run: (...args: any[]) => runPrioritization(...args),
  }),
  generatePrioritizationInstructions: () => 'prompt',
}));

const span = { setAttribute: vi.fn() };
vi.mock('@mastra/core', async () => {
  const actual = await vi.importActual<typeof import('@mastra/core')>('@mastra/core');
  return {
    ...actual,
    Telemetry: {
      ...actual.Telemetry,
      getActiveSpan: () => span,
    },
  };
});

describe('manualTaskPlacement telemetry', () => {
  beforeEach(() => {
    manualTasks.length = 0;
    taskEmbeddings.length = 0;
    span.setAttribute.mockClear();
    runPrioritization.mockReset();
    userOutcomes.length = 0;
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(25);
  });

  it('records duration, status, and rank for prioritized manual tasks', async () => {
    const taskId = 'manual-telemetry-1';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Manual legal task',
      is_manual: true,
    });
    manualTasks.push({
      task_id: taskId,
      status: 'analyzing',
      outcome_id: 'outcome-1',
      deleted_at: null,
    });
    userOutcomes.push({
      id: 'outcome-1',
      is_active: true,
    });

    runPrioritization.mockResolvedValueOnce({
      decision: 'include',
      agent_rank: 1,
      placement_reason: 'High impact manual task',
    });

    const { analyzeManualTask } = await import('@/lib/services/manualTaskPlacement');
    await analyzeManualTask({
      taskId,
      taskText: 'Manual legal task',
      outcomeId: 'outcome-1',
    });

    const calls = span.setAttribute.mock.calls;
    const durationCall = calls.find(([key]) => key === 'manual_task.analysis_duration_ms');
    expect(durationCall).toBeTruthy();
    expect(durationCall?.[1]).toBeGreaterThan(0);
    expect(durationCall?.[1]).toBeLessThan(10_000);

    expect(span.setAttribute).toHaveBeenCalledWith('manual_task.status', 'prioritized');
    expect(span.setAttribute).toHaveBeenCalledWith('manual_task.rank', 1);
  });

  it('records exclusion reason when task is not relevant', async () => {
    const taskId = 'manual-telemetry-2';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Manual cleanup task',
      is_manual: true,
    });
    manualTasks.push({
      task_id: taskId,
      status: 'analyzing',
      outcome_id: 'outcome-2',
      deleted_at: null,
    });
    userOutcomes.push({
      id: 'outcome-2',
      is_active: true,
    });

    runPrioritization.mockResolvedValueOnce({
      decision: 'exclude',
      exclusion_reason: 'Low impact',
    });

    const { analyzeManualTask } = await import('@/lib/services/manualTaskPlacement');
    await analyzeManualTask({
      taskId,
      taskText: 'Manual cleanup task',
      outcomeId: 'outcome-2',
    });

    expect(span.setAttribute).toHaveBeenCalledWith('manual_task.status', 'not_relevant');
    expect(span.setAttribute).toHaveBeenCalledWith('manual_task.exclusion_reason', 'Low impact');
  });

  it('keeps analyzing state on agent timeout', async () => {
    const taskId = 'manual-telemetry-3';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Manual timeout task',
      is_manual: true,
    });
    manualTasks.push({
      task_id: taskId,
      status: 'analyzing',
      outcome_id: 'outcome-3',
      deleted_at: null,
    });
    userOutcomes.push({
      id: 'outcome-3',
      is_active: true,
    });

    const timeoutError = Object.assign(new Error('request timeout'), { code: 'ETIMEDOUT' });
    runPrioritization.mockRejectedValueOnce(timeoutError);

    const { analyzeManualTask } = await import('@/lib/services/manualTaskPlacement');
    const result = await analyzeManualTask({
      taskId,
      taskText: 'Manual timeout task',
      outcomeId: 'outcome-3',
    });

    expect(result.status).toBe('analyzing');
    expect(manualTasks.find(row => row.task_id === taskId)?.status).toBe('analyzing');
    expect(span.setAttribute).not.toHaveBeenCalled();
  });
});
