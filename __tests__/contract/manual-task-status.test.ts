/**
 * Contract Tests: GET /api/tasks/manual/[id]/status
 * Validates the manual task status polling endpoint against its OpenAPI contract.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type ManualTaskRow = {
  task_id: string;
  status: 'analyzing' | 'prioritized' | 'not_relevant' | 'conflict';
  agent_rank?: number | null;
  placement_reason?: string | null;
  exclusion_reason?: string | null;
  duplicate_task_id?: string | null;
  similarity_score?: number | null;
  deleted_at?: string | null;
};

const manualTasks: ManualTaskRow[] = [];

vi.mock('@/lib/supabase/server', () => {
  const buildQuery = () => {
    const filters: Array<(row: ManualTaskRow) => boolean> = [];

    const applyFilters = () =>
      manualTasks.find(row => filters.every(predicate => predicate(row))) ?? null;

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
        return { data: applyFilters(), error: null };
      },
      async single() {
        const data = applyFilters();
        return data ? { data, error: null } : { data: null, error: { message: 'No rows found' } };
      },
    };

    return builder;
  };

  const supabaseClient = {
    from: vi.fn((table: string) => {
      if (table !== 'manual_tasks') {
        throw new Error(`Unexpected table requested: ${table}`);
      }

      return {
        select: vi.fn(() => buildQuery()),
      };
    }),
  };

  return {
    createClient: async () => supabaseClient,
  };
});

let GET: typeof import('@/app/api/tasks/manual/[id]/status/route')['GET'];

beforeAll(async () => {
  ({ GET } = await import('@/app/api/tasks/manual/[id]/status/route'));
});

const buildRequest = (taskId: string) =>
  new NextRequest(`http://localhost:3000/api/tasks/manual/${taskId}/status`, {
    method: 'GET',
  });

describe('GET /api/tasks/manual/[id]/status - Contract', () => {
  beforeEach(() => {
    manualTasks.length = 0;
  });

  it('returns analyzing status immediately after creation', async () => {
    manualTasks.push({
      task_id: 'task-analyzing-1',
      status: 'analyzing',
      deleted_at: null,
    });

    const response = await GET(buildRequest('task-analyzing-1'), {
      params: { id: 'task-analyzing-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'analyzing',
    });
  });

  it('returns prioritized status with agent rank and placement reason', async () => {
    manualTasks.push({
      task_id: 'task-prioritized-1',
      status: 'prioritized',
      agent_rank: 2,
      placement_reason: 'Directly enables payment feature work',
      deleted_at: null,
    });

    const response = await GET(buildRequest('task-prioritized-1'), {
      params: { id: 'task-prioritized-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'prioritized',
      agent_rank: 2,
      placement_reason: 'Directly enables payment feature work',
    });
  });

  it('returns not_relevant status with exclusion reason', async () => {
    manualTasks.push({
      task_id: 'task-not-relevant-1',
      status: 'not_relevant',
      exclusion_reason: 'No impact on payment conversion metric',
      deleted_at: null,
    });

    const response = await GET(buildRequest('task-not-relevant-1'), {
      params: { id: 'task-not-relevant-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'not_relevant',
      exclusion_reason: 'No impact on payment conversion metric',
    });
  });

  it('returns 404 for unknown task id', async () => {
    const response = await GET(buildRequest('task-missing-1'), {
      params: { id: 'task-missing-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error || payload.message).toBeDefined();
  });
});
