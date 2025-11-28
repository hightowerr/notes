import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type ManualTaskRow = {
  task_id: string;
  status: string;
  exclusion_reason?: string | null;
  outcome_id?: string | null;
};

type OutcomeRow = {
  id: string;
};

const manualTasks: ManualTaskRow[] = [];
const outcomes: OutcomeRow[] = [];

vi.mock('@/lib/supabase/server', () => {
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
      then(onFulfilled?: (value: { data: unknown; error: null }) => unknown) {
        const result = { data: applyFilters(), error: null };
        return Promise.resolve(onFulfilled ? onFulfilled(result as any) : (result as any));
      },
    };
    return builder;
  };

  const supabaseClient = {
    from: (table: string) => {
      if (table === 'manual_tasks') {
        return {
          update: (payload: Partial<ManualTaskRow>) => buildQuery(manualTasks).update(payload),
          select: () => buildQuery(manualTasks),
        };
      }
      if (table === 'user_outcomes') {
        return {
          select: () => buildQuery(outcomes),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { createClient: async () => supabaseClient };
});

let POST: typeof import('@/app/api/outcomes/[id]/invalidate-manual-tasks/route')['POST'];

beforeAll(async () => {
  ({ POST } = await import('@/app/api/outcomes/[id]/invalidate-manual-tasks/route'));
});

const buildRequest = (outcomeId: string) =>
  new NextRequest(`http://localhost:3000/api/outcomes/${outcomeId}/invalidate-manual-tasks`, {
    method: 'POST',
  });

describe('POST /api/outcomes/[id]/invalidate-manual-tasks - Contract', () => {
  beforeEach(() => {
    manualTasks.length = 0;
    outcomes.length = 0;
  });

  it('invalidates manual tasks for the outcome and returns count', async () => {
    outcomes.push({ id: 'outcome-1' });
    manualTasks.push(
      {
        task_id: 'task-1',
        status: 'prioritized',
        outcome_id: 'outcome-1',
        exclusion_reason: null,
      },
      {
        task_id: 'task-2',
        status: 'prioritized',
        outcome_id: 'outcome-2',
        exclusion_reason: null,
      }
    );

    const response = await POST(buildRequest('outcome-1'), { params: { id: 'outcome-1' } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.invalidated_count).toBe(1);
    expect(payload.message).toContain('moved to discard pile');

    const updated = manualTasks.find(task => task.task_id === 'task-1');
    expect(updated?.status).toBe('not_relevant');
    expect(updated?.exclusion_reason).toBe('Goal changed - manual tasks invalidated');
  });

  it('returns 404 when outcome not found', async () => {
    const response = await POST(buildRequest('missing-outcome'), { params: { id: 'missing-outcome' } });
    expect(response.status).toBe(404);
  });
});
