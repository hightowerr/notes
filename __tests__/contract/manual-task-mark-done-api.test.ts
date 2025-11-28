/**
 * Contract Tests: PATCH /api/tasks/manual/[id]/mark-done
 * Validates idempotent marking of manual tasks as done.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type ManualTaskRow = { task_id: string; deleted_at: string | null; marked_done_at: string | null };

const manualTasks: ManualTaskRow[] = [];

vi.mock('@/lib/supabase/server', () => {
  const buildSelectQuery = () => {
    let taskIdFilter: string | null = null;

    const query: any = {
      eq(field: keyof ManualTaskRow, value: unknown) {
        if (field === 'task_id') {
          taskIdFilter = value as string;
        }
        return query;
      },
      async maybeSingle() {
        const row = manualTasks.find(task => task.task_id === taskIdFilter);
        return { data: row ? { ...row } : null, error: null };
      },
    };

    return query;
  };

  const buildUpdateQuery = (payload: Partial<ManualTaskRow>) => {
    let taskIdFilter: string | null = null;

    const query: any = {
      eq(field: keyof ManualTaskRow, value: unknown) {
        if (field === 'task_id') {
          taskIdFilter = value as string;
        }
        return query;
      },
      select() {
        return query;
      },
      async maybeSingle() {
        const index = manualTasks.findIndex(task => task.task_id === taskIdFilter);
        if (index === -1) {
          return { data: null, error: null };
        }
        manualTasks[index] = { ...manualTasks[index], ...payload };
        return {
          data: { task_id: manualTasks[index].task_id },
          error: null,
        };
      },
    };

    return query;
  };

  const supabaseClient = {
    from: vi.fn((table: string) => {
      if (table !== 'manual_tasks') {
        throw new Error(`Unexpected table requested: ${table}`);
      }

      return {
        select: vi.fn(() => buildSelectQuery()),
        update: vi.fn((payload: Partial<ManualTaskRow>) => buildUpdateQuery(payload)),
      };
    }),
  };

  return {
    createClient: async () => supabaseClient,
  };
});

let PATCH: typeof import('@/app/api/tasks/manual/[id]/mark-done/route')['PATCH'];

beforeAll(async () => {
  ({ PATCH } = await import('@/app/api/tasks/manual/[id]/mark-done/route'));
});

const buildRequest = (taskId: string) =>
  new NextRequest(`http://localhost:3000/api/tasks/manual/${taskId}/mark-done`, {
    method: 'PATCH',
  });

describe('PATCH /api/tasks/manual/[id]/mark-done - Contract', () => {
  beforeEach(() => {
    manualTasks.length = 0;
  });

  it('marks an existing manual task as done', async () => {
    manualTasks.push({ task_id: 'task-done-1', deleted_at: null, marked_done_at: null });

    const response = await PATCH(buildRequest('task-done-1'), {
      params: { id: 'task-done-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      task_id: 'task-done-1',
      already_marked: false,
    });
    expect(manualTasks[0].marked_done_at).toBeTruthy();
  });

  it('returns success when manual task is already marked done', async () => {
    manualTasks.push({
      task_id: 'task-already-done',
      deleted_at: null,
      marked_done_at: '2024-01-01T00:00:00.000Z',
    });

    const response = await PATCH(buildRequest('task-already-done'), {
      params: { id: 'task-already-done' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      task_id: 'task-already-done',
      already_marked: true,
    });
    expect(manualTasks[0].marked_done_at).toBe('2024-01-01T00:00:00.000Z');
  });

  it('is idempotent when manual task is missing or deleted', async () => {
    manualTasks.push({
      task_id: 'task-deleted',
      deleted_at: '2024-01-01T00:00:00.000Z',
      marked_done_at: null,
    });

    const responseDeleted = await PATCH(buildRequest('task-deleted'), {
      params: { id: 'task-deleted' },
    });
    const payloadDeleted = await responseDeleted.json();

    const responseMissing = await PATCH(buildRequest('task-missing'), {
      params: { id: 'task-missing' },
    });
    const payloadMissing = await responseMissing.json();

    expect(responseDeleted.status).toBe(200);
    expect(payloadDeleted.already_marked).toBe(true);
    expect(responseMissing.status).toBe(200);
    expect(payloadMissing.already_marked).toBe(true);
  });
});
