/**
 * Contract Tests: DELETE /api/tasks/manual/[id]/delete
 * Validates idempotent deletion for manual tasks.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type ManualTaskRow = { task_id: string; deleted_at: string | null };

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

let DELETE: typeof import('@/app/api/tasks/manual/[id]/delete/route')['DELETE'];

beforeAll(async () => {
  ({ DELETE } = await import('@/app/api/tasks/manual/[id]/delete/route'));
});

const buildRequest = (taskId: string) =>
  new NextRequest(`http://localhost:3000/api/tasks/manual/${taskId}/delete`, {
    method: 'DELETE',
  });

describe('DELETE /api/tasks/manual/[id]/delete - Contract', () => {
  beforeEach(() => {
    manualTasks.length = 0;
  });

  it('soft deletes an existing manual task and returns success', async () => {
    manualTasks.push({ task_id: 'task-delete-1', deleted_at: null });

    const response = await DELETE(buildRequest('task-delete-1'), {
      params: { id: 'task-delete-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      task_id: 'task-delete-1',
      already_removed: false,
    });
    expect(manualTasks[0].deleted_at).toBeTruthy();
  });

  it('returns success when the manual task is already deleted', async () => {
    manualTasks.push({
      task_id: 'task-deleted-1',
      deleted_at: '2024-01-01T00:00:00.000Z',
    });

    const response = await DELETE(buildRequest('task-deleted-1'), {
      params: { id: 'task-deleted-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      task_id: 'task-deleted-1',
      already_removed: true,
    });
    expect(manualTasks[0].deleted_at).toBe('2024-01-01T00:00:00.000Z');
  });

  it('is idempotent and succeeds even if the manual task is missing', async () => {
    const response = await DELETE(buildRequest('task-missing-1'), {
      params: { id: 'task-missing-1' },
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      task_id: 'task-missing-1',
      already_removed: true,
    });
  });
});
