/**
 * Contract Tests: Duplicate detection for manual tasks (T024)
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createManualTaskMock = vi.fn();

vi.mock('@/lib/services/manualTaskService', () => {
  class MockManualTaskServiceError extends Error {
    constructor(message = 'Manual task service error') {
      super(message);
      this.name = 'ManualTaskServiceError';
    }
  }

  class MockDuplicateManualTaskError extends MockManualTaskServiceError {
    existingTask: Record<string, unknown>;

    constructor(existingTask: Record<string, unknown>) {
      super('Similar task already exists');
      this.name = 'DuplicateManualTaskError';
      this.existingTask = existingTask;
    }
  }

  return {
    createManualTask: createManualTaskMock,
    ManualTaskServiceError: MockManualTaskServiceError,
    DuplicateManualTaskError: MockDuplicateManualTaskError,
  };
});

let POST: typeof import('@/app/api/tasks/manual/route')['POST'];
let DuplicateManualTaskError: typeof import('@/lib/services/manualTaskService')['DuplicateManualTaskError'];

beforeAll(async () => {
  ({ POST } = await import('@/app/api/tasks/manual/route'));
  ({ DuplicateManualTaskError } = await import('@/lib/services/manualTaskService'));
});

const mockCreateManualTask = vi.mocked(createManualTaskMock);

const buildRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost:3000/api/tasks/manual', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

describe('POST /api/tasks/manual - Duplicate detection contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 with conflict details when similarity > 0.85', async () => {
    const duplicate = new DuplicateManualTaskError({
      task_id: 'task-existing',
      task_text: 'Email legal about contract review',
      similarity: 0.92,
    } as Record<string, unknown>);

    mockCreateManualTask.mockRejectedValueOnce(duplicate);

    const request = buildRequest({
      task_text: 'Email legal about contract review',
      estimated_hours: 24,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('DUPLICATE_TASK');
    expect(body.existing_task).toEqual(duplicate.existingTask);
  });

  it('succeeds when similarity below threshold', async () => {
    mockCreateManualTask.mockResolvedValueOnce({
      taskId: 'task-manual-123',
      prioritizationTriggered: true,
      estimatedHours: 16,
      taskText: 'Write kickoff doc for mobile launch',
    });

    const request = buildRequest({
      task_text: 'Write kickoff doc for mobile launch',
      estimated_hours: 16,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.task_id).toBe('task-manual-123');
  });
});
