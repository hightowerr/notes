import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type ManualTaskRow = {
  task_id: string;
  status: 'analyzing' | 'prioritized' | 'not_relevant' | 'conflict';
  exclusion_reason?: string | null;
  deleted_at?: string | null;
};

const manualTasks: ManualTaskRow[] = [];

vi.mock('@/lib/supabase/server', () => {
  const buildQuery = () => {
    const filters: Array<(row: ManualTaskRow) => boolean> = [];

    const applyFilters = () => manualTasks.find(row => filters.every(predicate => predicate(row)));

    const builder: any = {
      eq(field: keyof ManualTaskRow, value: unknown) {
        filters.push(row => row[field] === value);
        return builder;
      },
      is(field: keyof ManualTaskRow, value: unknown) {
        filters.push(row => row[field] === value);
        return builder;
      },
      async maybeSingle() {
        return { data: applyFilters() ?? null, error: null };
      },
      async single() {
        const data = applyFilters();
        return data ? { data, error: null } : { data: null, error: { message: 'No rows found' } };
      },
      update(payload: Partial<ManualTaskRow>) {
        manualTasks.forEach(row => {
          if (filters.every(predicate => predicate(row))) {
            Object.assign(row, payload);
          }
        });
        return {
          select: async () => ({ data: manualTasks.filter(row => filters.every(predicate => predicate(row))), error: null }),
        };
      },
    };

    return builder;
  };

  const supabaseClient = {
    from: (table: string) => {
      if (table !== 'manual_tasks') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: () => buildQuery(),
        update: (_payload: Partial<ManualTaskRow>) => buildQuery().update(_payload),
      };
    },
  };

  return {
    createClient: async () => supabaseClient,
  };
});

let POST: typeof import('@/app/api/tasks/manual/[id]/override/route')['POST'];

beforeAll(async () => {
  ({ POST } = await import('@/app/api/tasks/manual/[id]/override/route'));
});

const buildRequest = (taskId: string, body?: Record<string, unknown>) =>
  new NextRequest(`http://localhost:3000/api/tasks/manual/${taskId}/override`, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
  });

describe('POST /api/tasks/manual/[id]/override - Contract', () => {
  beforeEach(() => {
    manualTasks.length = 0;
  });

  it('accepts override and returns analyzing status', async () => {
    manualTasks.push({
      task_id: 'task-discard-1',
      status: 'not_relevant',
      exclusion_reason: 'Out of scope',
      deleted_at: null,
    });

    const response = await POST(buildRequest('task-discard-1', { user_justification: 'Critical now' }), {
      params: { id: 'task-discard-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'analyzing',
      message: 'Task sent back for re-analysis',
    });
    const updated = manualTasks.find(task => task.task_id === 'task-discard-1');
    expect(updated?.status).toBe('analyzing');
    expect(updated?.exclusion_reason).toBeNull();
  });

  it('returns 400 if task not in discard pile', async () => {
    manualTasks.push({
      task_id: 'task-not-discarded',
      status: 'prioritized',
      exclusion_reason: null,
      deleted_at: null,
    });

    const response = await POST(buildRequest('task-not-discarded'), {
      params: { id: 'task-not-discarded' },
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error || payload.message).toBeDefined();
  });

  it('returns 404 if task not found', async () => {
    const response = await POST(buildRequest('missing-task'), {
      params: { id: 'missing-task' },
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error || payload.message).toBeDefined();
  });
});
