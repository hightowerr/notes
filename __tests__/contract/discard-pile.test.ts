import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type ManualTaskRow = {
  task_id: string;
  status: string;
  exclusion_reason?: string | null;
  created_at?: string | null;
  outcome_id?: string | null;
  deleted_at?: string | null;
};

type TaskEmbeddingRow = {
  task_id: string;
  task_text: string;
  is_manual?: boolean | null;
};

const manualTasks: ManualTaskRow[] = [];
const taskEmbeddings: TaskEmbeddingRow[] = [];

vi.mock('@/lib/supabase/server', () => {
  const buildQuery = <T extends Record<string, any>>(table: T[]) => {
    const filters: Array<(row: T) => boolean> = [];

    const applyFilters = () => table.filter(row => filters.every(predicate => predicate(row)));

    const builder: any = {
      eq(field: keyof T, value: unknown) {
        filters.push(row => row[field] === value);
        return builder;
      },
      is(field: keyof T, value: unknown) {
        filters.push(row => row[field] === value);
        return builder;
      },
      async select() {
        return { data: applyFilters(), error: null };
      },
    };

    return builder;
  };

  const supabaseClient = {
    from: (table: string) => {
      if (table === 'manual_tasks') {
        return {
          select: () => buildQuery(manualTasks),
        };
      }
      if (table === 'task_embeddings') {
        return {
          select: () => buildQuery(taskEmbeddings),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return {
    createClient: async () => supabaseClient,
  };
});

let GET: typeof import('@/app/api/tasks/discard-pile/route')['GET'];

beforeAll(async () => {
  ({ GET } = await import('@/app/api/tasks/discard-pile/route'));
});

const buildRequest = (params?: { outcomeId?: string }) => {
  const url = new URL('http://localhost:3000/api/tasks/discard-pile');
  if (params?.outcomeId) {
    url.searchParams.set('outcome_id', params.outcomeId);
  }
  return new NextRequest(url, { method: 'GET' });
};

describe('GET /api/tasks/discard-pile - Contract', () => {
  beforeEach(() => {
    manualTasks.length = 0;
    taskEmbeddings.length = 0;
  });

  it('returns discarded tasks with task_text and exclusion_reason', async () => {
    taskEmbeddings.push({
      task_id: 'task-1',
      task_text: 'Reorganize Notion workspace',
      is_manual: true,
    });
    manualTasks.push({
      task_id: 'task-1',
      status: 'not_relevant',
      exclusion_reason: 'No impact on payment conversion metric',
      created_at: '2025-01-26T10:30:00Z',
      deleted_at: null,
    });

    const response = await GET(buildRequest(), {});
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(payload.tasks)).toBe(true);
    expect(payload.tasks[0]).toMatchObject({
      task_id: 'task-1',
      task_text: 'Reorganize Notion workspace',
      exclusion_reason: 'No impact on payment conversion metric',
      is_manual: true,
    });
  });

  it('filters by outcome_id when provided', async () => {
    manualTasks.push(
      {
        task_id: 'task-1',
        status: 'not_relevant',
        exclusion_reason: 'Out of scope',
        outcome_id: 'outcome-a',
        created_at: '2025-01-26T09:15:00Z',
        deleted_at: null,
      },
      {
        task_id: 'task-2',
        status: 'not_relevant',
        exclusion_reason: 'Not aligned',
        outcome_id: 'outcome-b',
        created_at: '2025-01-26T09:45:00Z',
        deleted_at: null,
      }
    );
    taskEmbeddings.push(
      { task_id: 'task-1', task_text: 'Outcome A task', is_manual: true },
      { task_id: 'task-2', task_text: 'Outcome B task', is_manual: true }
    );

    const response = await GET(buildRequest({ outcomeId: 'outcome-a' }), {});
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tasks).toHaveLength(1);
    expect(payload.tasks[0].task_id).toBe('task-1');
  });

  it('excludes soft-deleted tasks and returns empty array when none found', async () => {
    manualTasks.push({
      task_id: 'task-deleted',
      status: 'not_relevant',
      exclusion_reason: 'Duplicate',
      created_at: '2025-01-26T08:00:00Z',
      deleted_at: '2025-01-27T08:00:00Z',
    });
    taskEmbeddings.push({
      task_id: 'task-deleted',
      task_text: 'Old discarded task',
      is_manual: true,
    });

    const response = await GET(buildRequest(), {});
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tasks).toEqual([]);
  });
});
