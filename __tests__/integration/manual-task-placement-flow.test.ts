/**
 * Integration Test (T003): Manual task placement flow
 * Flow: create outcome → create manual task → agent analyzes → status reflects placement
 *
 * Expected RED phase: manualTaskPlacement service not implemented yet.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type ManualTaskStatus = 'analyzing' | 'prioritized' | 'not_relevant' | 'conflict';

type ManualTaskRow = {
  task_id: string;
  status: ManualTaskStatus;
  agent_rank?: number | null;
  placement_reason?: string | null;
  exclusion_reason?: string | null;
  duplicate_task_id?: string | null;
  similarity_score?: number | null;
  outcome_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

type TaskEmbeddingRow = {
  task_id: string;
  task_text: string;
  is_manual?: boolean | null;
  created_by?: string | null;
  outcome_id?: string | null;
  embedding?: number[];
  created_at?: string;
  updated_at?: string;
};

type OutcomeRow = {
  id: string;
  user_id: string;
  direction: string;
  object_text: string;
  metric_text: string;
  clarifier: string;
  assembled_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const manualTasks: ManualTaskRow[] = [];
const taskEmbeddings: TaskEmbeddingRow[] = [];
const userOutcomes: OutcomeRow[] = [];

const agentDecisions: Array<
  | { decision: 'include'; rank: number; reason: string }
  | { decision: 'exclude'; reason: string }
> = [];

vi.mock('@/lib/mastra/agents/prioritizationGenerator', () => {
  const runPrioritization = vi.fn(async () => {
    const nextDecision = agentDecisions.shift();
    if (!nextDecision) {
      return {
        decision: 'exclude',
        exclusion_reason: 'No decision provided',
      };
    }
    if (nextDecision.decision === 'include') {
      return {
        decision: 'include',
        agent_rank: nextDecision.rank,
        placement_reason: nextDecision.reason,
      };
    }
    return {
      decision: 'exclude',
      exclusion_reason: nextDecision.reason,
    };
  });

  return {
    createPrioritizationAgent: () => ({
      run: runPrioritization,
    }),
    runPrioritization,
    generatePrioritizationInstructions: vi.fn(),
  };
});

function buildQuery<T extends Record<string, any>>(table: T[]) {
  const filters: Array<(row: T) => boolean> = [];
  let orderField: keyof T | null = null;
  let orderAscending = true;
  let limitCount: number | null = null;

  const applyFilters = () => {
    let results = table.filter(row => filters.every(predicate => predicate(row)));
    if (orderField) {
      const factor = orderAscending ? 1 : -1;
      results = [...results].sort((a, b) => {
        const aValue = a[orderField!];
        const bValue = b[orderField!];
        if (aValue === bValue) return 0;
        return aValue > bValue ? factor : -factor;
      });
    }
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
    in(field: keyof T, values: unknown[]) {
      filters.push(row => values.includes(row[field]));
      return builder;
    },
    order(field: keyof T, options?: { ascending?: boolean }) {
      orderField = field;
      orderAscending = options?.ascending ?? true;
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    async maybeSingle() {
      const data = applyFilters()[0] ?? null;
      return { data, error: null };
    },
    async single() {
      const data = applyFilters()[0] ?? null;
      if (!data) {
        return { data: null, error: { message: 'No rows found' } };
      }
      return { data, error: null };
    },
    then(onFulfilled?: (value: { data: unknown; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      try {
        const result = { data: applyFilters(), error: null };
        return Promise.resolve(onFulfilled ? onFulfilled(result) : (result as any));
      } catch (error) {
        if (onRejected) {
          return Promise.resolve(onRejected(error));
        }
        return Promise.reject(error);
      }
    },
  };

  return builder;
}

vi.mock('@/lib/supabase/admin', () => {
  const supabase = {
    from: (tableName: string) => {
      switch (tableName) {
        case 'manual_tasks':
          return {
            select: () => buildQuery(manualTasks),
            insert: (payload: ManualTaskRow | ManualTaskRow[]) => {
              const rows = Array.isArray(payload) ? payload : [payload];
              manualTasks.push(...rows);
              return {
                select: async () => ({ data: rows, error: null }),
              };
            },
            update: (payload: Partial<ManualTaskRow>) => ({
              eq(field: keyof ManualTaskRow, value: unknown) {
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
          };
        case 'task_embeddings':
          return {
            select: () => buildQuery(taskEmbeddings),
            insert: (payload: TaskEmbeddingRow | TaskEmbeddingRow[]) => {
              const rows = Array.isArray(payload) ? payload : [payload];
              taskEmbeddings.push(...rows);
              return {
                select: async () => ({ data: rows, error: null }),
              };
            },
            update: (payload: Partial<TaskEmbeddingRow>) => ({
              eq(field: keyof TaskEmbeddingRow, value: unknown) {
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
          };
        case 'user_outcomes':
          return {
            select: () => buildQuery(userOutcomes),
            insert: (payload: OutcomeRow | OutcomeRow[]) => {
              const rows = Array.isArray(payload) ? payload : [payload];
              userOutcomes.push(...rows);
              return {
                select: async () => ({ data: rows, error: null }),
              };
            },
          };
        default:
          throw new Error(`Unexpected table: ${tableName}`);
      }
    },
  };
  return {
    getSupabaseAdminClient: () => supabase,
  };
});

type ManualTaskPlacementModule = {
  analyzeManualTask: (params: { taskId: string; taskText: string; outcomeId: string }) => Promise<{
    status: ManualTaskStatus;
    rank?: number;
    placementReason?: string;
    exclusionReason?: string;
  }>;
  getAnalysisStatus: (
    taskId: string
  ) => Promise<{
    status: ManualTaskStatus;
    agent_rank?: number;
    placement_reason?: string;
    exclusion_reason?: string;
  }>;
};

let analyzeManualTask: ManualTaskPlacementModule['analyzeManualTask'];
let getAnalysisStatus: ManualTaskPlacementModule['getAnalysisStatus'];

describe('Manual task placement flow (T003)', () => {
  beforeEach(async () => {
    manualTasks.length = 0;
    taskEmbeddings.length = 0;
    userOutcomes.length = 0;
    agentDecisions.length = 0;

    // Module does not exist yet; this import will intentionally fail until implementation lands
    // @ts-expect-error - manualTaskPlacement service will be implemented in T004
    const module = (await import('@/lib/services/manualTaskPlacement')) as ManualTaskPlacementModule;
    analyzeManualTask = module.analyzeManualTask;
    getAnalysisStatus = module.getAnalysisStatus;
  });

  it('prioritizes relevant manual task with agent rank and placement reason', async () => {
    const outcomeId = 'outcome-123';
    userOutcomes.push({
      id: outcomeId,
      user_id: 'default-user',
      direction: 'Increase',
      object_text: 'Payment conversion',
      metric_text: '5%',
      clarifier: '',
      assembled_text: 'Increase payment conversion by 5%',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const taskId = 'task-relevant-1';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Email legal about Q4 contract',
      is_manual: true,
      outcome_id: outcomeId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    manualTasks.push({
      task_id: taskId,
      status: 'analyzing',
      outcome_id: outcomeId,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    agentDecisions.push({ decision: 'include', rank: 2, reason: 'Directly enables outcome' });

    const result = await analyzeManualTask({
      taskId,
      taskText: 'Email legal about Q4 contract',
      outcomeId,
    });

    expect(result.status).toBe('prioritized');
    expect(result.rank).toBe(2);
    expect(result.placementReason).toContain('Directly enables outcome');

    const status = await getAnalysisStatus(taskId);
    expect(status).toMatchObject({
      status: 'prioritized',
      agent_rank: 2,
      placement_reason: 'Directly enables outcome',
    });
  });

  it('marks irrelevant manual task as not_relevant with exclusion reason', async () => {
    const outcomeId = 'outcome-irrelevant';
    userOutcomes.push({
      id: outcomeId,
      user_id: 'default-user',
      direction: 'Improve',
      object_text: 'Activation',
      metric_text: '10%',
      clarifier: '',
      assembled_text: 'Improve activation by 10%',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const taskId = 'task-irrelevant-1';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Refactor legacy CSS',
      is_manual: true,
      outcome_id: outcomeId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    manualTasks.push({
      task_id: taskId,
      status: 'analyzing',
      outcome_id: outcomeId,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    agentDecisions.push({ decision: 'exclude', reason: 'No impact on activation metric' });

    const result = await analyzeManualTask({
      taskId,
      taskText: 'Refactor legacy CSS',
      outcomeId,
    });

    expect(result.status).toBe('not_relevant');
    expect(result.exclusionReason).toContain('No impact');

    const status = await getAnalysisStatus(taskId);
    expect(status).toMatchObject({
      status: 'not_relevant',
      exclusion_reason: 'No impact on activation metric',
    });
  });

  it('keeps analyzing state when no active outcome exists', async () => {
    const taskId = 'task-no-outcome';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Document internal processes',
      is_manual: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    manualTasks.push({
      task_id: taskId,
      status: 'analyzing',
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await analyzeManualTask({
      taskId,
      taskText: 'Document internal processes',
      outcomeId: 'inactive-outcome',
    });

    expect(result.status).toBe('analyzing');
    const status = await getAnalysisStatus(taskId);
    expect(status.status).toBe('analyzing');
  });
});
