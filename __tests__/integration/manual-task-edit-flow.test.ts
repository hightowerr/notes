/**
 * Integration Test (T019): Manual task edit flow
 * Scenario: create manual task → edit description → re-analysis triggered → status updates
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type ManualTaskRow = {
  task_id: string;
  status: 'analyzing' | 'prioritized' | 'not_relevant' | 'conflict';
  exclusion_reason?: string | null;
  agent_rank?: number | null;
  placement_reason?: string | null;
  outcome_id?: string | null;
};

type TaskEmbeddingRow = {
  task_id: string;
  task_text: string;
  is_manual?: boolean | null;
  created_by?: string | null;
  outcome_id?: string | null;
  embedding?: number[] | null;
};

const manualTasks: ManualTaskRow[] = [];
const taskEmbeddings: TaskEmbeddingRow[] = [];

vi.mock('@/lib/supabase/admin', () => {
  const buildQuery = <T extends Record<string, any>>(table: T[]) => {
    const filters: Array<(row: T) => boolean> = [];
    const applyFilters = () => table.filter(row => filters.every(predicate => predicate(row)));

    const builder: any = {
      eq(field: keyof T, value: unknown) {
        filters.push(row => row[field] === value);
        return builder;
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
      select() {
        return builder;
      },
      async maybeSingle() {
        return { data: applyFilters()[0] ?? null, error: null };
      },
      async single() {
        const data = applyFilters()[0];
        return data ? { data, error: null } : { data: null, error: { message: 'No rows' } };
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
  };

  const supabase = {
    from: (table: string) => {
      if (table === 'manual_tasks') {
        return {
          select: () => buildQuery(manualTasks),
          update: (payload: Partial<ManualTaskRow>) => buildQuery(manualTasks).update(payload),
          insert: (payload: ManualTaskRow | ManualTaskRow[]) =>
            buildQuery(manualTasks).insert(payload),
        };
      }
      if (table === 'task_embeddings') {
        return {
          select: () => buildQuery(taskEmbeddings),
          update: (payload: Partial<TaskEmbeddingRow>) => buildQuery(taskEmbeddings).update(payload),
          insert: (payload: TaskEmbeddingRow | TaskEmbeddingRow[]) =>
            buildQuery(taskEmbeddings).insert(payload),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { getSupabaseAdminClient: () => supabase };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const supabase = await vi.importActual('@/lib/supabase/admin');
    return supabase.getSupabaseAdminClient();
  },
}));

vi.mock('@/lib/mastra/agents/prioritizationGenerator', () => {
  const runPrioritization = vi.fn(async () => ({
    decision: 'include',
    agent_rank: 3,
    placement_reason: 'Updated text now aligns with outcome',
  }));
  return {
    createPrioritizationAgent: () => ({
      run: runPrioritization,
    }),
    generatePrioritizationInstructions: () => 'prompt',
    runPrioritization,
  };
});

let PATCH: typeof import('@/app/api/tasks/[id]/route')['PATCH'];
let analyzeManualTask: typeof import('@/lib/services/manualTaskPlacement')['analyzeManualTask'];

beforeEach(async () => {
  manualTasks.length = 0;
  taskEmbeddings.length = 0;
  ({ PATCH } = await import('@/app/api/tasks/[id]/route'));
  ({ analyzeManualTask } = await import('@/lib/services/manualTaskPlacement'));
});

const buildPatchRequest = (taskId: string, body: Record<string, unknown>) =>
  new Request(`http://localhost:3000/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('Manual task edit flow (T019)', () => {
  it('restarts analysis on manual task edit and updates status after agent run', async () => {
    const taskId = 'task-edit-1';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Draft launch plan',
      is_manual: true,
      created_by: 'default-user',
      embedding: [],
    });
    manualTasks.push({
      task_id: taskId,
      status: 'prioritized',
      agent_rank: 1,
      placement_reason: 'Initial reasoning',
      exclusion_reason: null,
      outcome_id: 'outcome-1',
    });

    const response = await PATCH(
      buildPatchRequest(taskId, { task_text: 'Draft launch plan with mobile focus' }),
      { params: { id: taskId } }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.prioritization_triggered).toBe(true);

    const updatedManualTask = manualTasks.find(task => task.task_id === taskId);
    expect(updatedManualTask?.status).toBe('analyzing');

    const analysis = await analyzeManualTask({
      taskId,
      taskText: 'Draft launch plan with mobile focus',
      outcomeId: 'outcome-1',
    });

    expect(analysis.status).toBe('prioritized');
    expect(updatedManualTask?.placement_reason || analysis.placementReason).toBeDefined();
  });

  it('rejects invalid edit (empty description) with 400', async () => {
    const taskId = 'task-edit-invalid';
    taskEmbeddings.push({
      task_id: taskId,
      task_text: 'Review onboarding',
      is_manual: true,
      created_by: 'default-user',
    });
    manualTasks.push({
      task_id: taskId,
      status: 'prioritized',
      exclusion_reason: null,
      outcome_id: 'outcome-1',
    });

    const response = await PATCH(
      buildPatchRequest(taskId, { task_text: '' }),
      { params: { id: taskId } }
    );
    expect(response.status).toBe(400);
  });
});
