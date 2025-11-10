/**
 * Contract Tests: PATCH /api/tasks/[id]
 * Validates the task edit endpoint against its OpenAPI contract.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const updateTaskMock = vi.fn();

vi.mock('@/lib/services/manualTaskService', () => {
  class MockManualTaskServiceError extends Error {
    constructor(message = 'Manual task service error') {
      super(message);
      this.name = 'ManualTaskServiceError';
    }
  }

  class MockManualTaskValidationError extends MockManualTaskServiceError {
    constructor(message = 'Invalid edit payload') {
      super(message);
      this.name = 'ManualTaskValidationError';
    }
  }

  class MockManualTaskNotFoundError extends MockManualTaskServiceError {
    constructor(message = 'Task not found') {
      super(message);
      this.name = 'ManualTaskNotFoundError';
    }
  }

  class MockManualTaskPermissionError extends MockManualTaskServiceError {
    constructor(message = 'You can only edit your own manual tasks') {
      super(message);
      this.name = 'ManualTaskPermissionError';
    }
  }

  return {
    updateTask: updateTaskMock,
    ManualTaskServiceError: MockManualTaskServiceError,
    ManualTaskValidationError: MockManualTaskValidationError,
    ManualTaskNotFoundError: MockManualTaskNotFoundError,
    ManualTaskPermissionError: MockManualTaskPermissionError,
  };
});

let PATCH: typeof import('@/app/api/tasks/[id]/route')['PATCH'];
let ManualTaskValidationError: typeof import('@/lib/services/manualTaskService')['ManualTaskValidationError'];
let ManualTaskNotFoundError: typeof import('@/lib/services/manualTaskService')['ManualTaskNotFoundError'];
let ManualTaskPermissionError: typeof import('@/lib/services/manualTaskService')['ManualTaskPermissionError'];
let ManualTaskServiceError: typeof import('@/lib/services/manualTaskService')['ManualTaskServiceError'];

beforeAll(async () => {
  ({ PATCH } = await import('@/app/api/tasks/[id]/route'));
  ({
    ManualTaskValidationError,
    ManualTaskNotFoundError,
    ManualTaskPermissionError,
    ManualTaskServiceError,
  } = await import('@/lib/services/manualTaskService'));
});

const mockUpdateTask = vi.mocked(updateTaskMock);

const buildRequest = (body: Record<string, unknown>, taskId = 'task-123') =>
  new NextRequest(`http://localhost:3000/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

const callPatch = (body: Record<string, unknown>, taskId = 'task-123') =>
  PATCH(buildRequest(body, taskId), {
    params: { id: taskId },
  });

describe('PATCH /api/tasks/[id] - Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateTask.mockReset();
  });

  it('returns 200 with embedding_regenerated flag when manual task text changes significantly', async () => {
    const updatedAt = '2025-01-08T12:00:00Z';
    mockUpdateTask.mockResolvedValueOnce({
      taskId: 'task-manual-1',
      taskText: 'Updated manual description',
      isManual: true,
      updatedAt,
      embeddingRegenerated: true,
    });

    const response = await callPatch(
      {
        task_text: 'Updated manual description',
      },
      'task-manual-1'
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      task: {
        task_id: 'task-manual-1',
        task_text: 'Updated manual description',
        is_manual: true,
        updated_at: updatedAt,
      },
      embedding_regenerated: true,
      prioritization_triggered: false,
    });
    expect(mockUpdateTask).toHaveBeenCalledWith({
      taskId: 'task-manual-1',
      task_text: 'Updated manual description',
    });
  });

  it('returns 200 for AI tasks and reports embedding_regenerated=false for minor edits', async () => {
    const updatedAt = '2025-01-08T13:00:00Z';
    mockUpdateTask.mockResolvedValueOnce({
      taskId: 'task-ai-2',
      taskText: 'AI generated task tweak',
      isManual: false,
      updatedAt,
      embeddingRegenerated: false,
    });

    const response = await callPatch(
      {
        task_text: 'AI generated task tweak',
        estimated_hours: 48,
      },
      'task-ai-2'
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.embedding_regenerated).toBe(false);
    expect(body.task.is_manual).toBe(false);
    expect(mockUpdateTask).toHaveBeenCalledWith({
      taskId: 'task-ai-2',
      task_text: 'AI generated task tweak',
      estimated_hours: 48,
    });
  });

  it('returns 400 with NO_FIELDS_PROVIDED when body has no editable fields', async () => {
    const response = await callPatch({});
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('NO_FIELDS_PROVIDED');
    expect(body.error).toBe('At least one field must be provided');
    expect(mockUpdateTask).not.toHaveBeenCalled();
  });

  it('returns 404 when the task cannot be found', async () => {
    mockUpdateTask.mockRejectedValueOnce(new ManualTaskNotFoundError());

    const response = await callPatch({ task_text: 'Updated manual text' }, 'task-missing');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('TASK_NOT_FOUND');
  });

  it('returns 403 when editing a manual task owned by another user', async () => {
    mockUpdateTask.mockRejectedValueOnce(new ManualTaskPermissionError());

    const response = await callPatch({ task_text: 'Forbidden edit attempt' }, 'task-owned');
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe('PERMISSION_DENIED');
  });

  it('returns 400 when service reports validation error', async () => {
    mockUpdateTask.mockRejectedValueOnce(new ManualTaskValidationError('Invalid edit payload'));

    const response = await callPatch({ task_text: 'Valid content change' }, 'task-invalid');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('INVALID_INPUT');
    expect(body.error).toBe('Invalid edit payload');
  });

  it('returns 500 on unexpected service failures', async () => {
    mockUpdateTask.mockRejectedValueOnce(new ManualTaskServiceError('Database offline'));

    const response = await callPatch({ task_text: 'Another valid update' }, 'task-error');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.error).toBe('Failed to update task');
  });
});
