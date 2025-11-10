/**
 * Contract Tests: POST /api/tasks/manual
 * Validates the manual task creation endpoint against its OpenAPI contract.
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

describe('POST /api/tasks/manual - Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 and does not trigger prioritization when outcome_id is omitted', async () => {
    mockCreateManualTask.mockResolvedValueOnce({
      taskId: 'task-manual-123',
      prioritizationTriggered: false,
      estimatedHours: 24,
      taskText: 'Email legal about contract review',
    });

    const request = buildRequest({
      task_text: 'Email legal about contract review',
      estimated_hours: 24,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      task_id: 'task-manual-123',
      success: true,
      prioritization_triggered: false,
    });
    expect(mockCreateManualTask).toHaveBeenCalledWith({
      task_text: 'Email legal about contract review',
      estimated_hours: 24,
    });
  });

  it('returns 201 and prioritization flag when outcome_id is provided', async () => {
    mockCreateManualTask.mockResolvedValueOnce({
      taskId: 'task-manual-456',
      prioritizationTriggered: true,
      estimatedHours: 40,
      taskText: 'Schedule team sync',
    });

    const request = buildRequest({
      task_text: 'Schedule team sync',
      estimated_hours: 32,
      outcome_id: '11111111-2222-3333-4444-555555555555',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.prioritization_triggered).toBe(true);
    expect(body.task_id).toBe('task-manual-456');
    expect(mockCreateManualTask).toHaveBeenCalledWith({
      task_text: 'Schedule team sync',
      estimated_hours: 32,
      outcome_id: '11111111-2222-3333-4444-555555555555',
    });
  });

  it('returns 400 when task_text fails validation', async () => {
    const request = buildRequest({
      task_text: 'short',
      estimated_hours: 16,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('INVALID_INPUT');
    expect(body.details?.fieldErrors?.task_text?.[0]).toContain('at least 10');
    expect(mockCreateManualTask).not.toHaveBeenCalled();
  });

  it('returns 400 with DUPLICATE_TASK code when similar task exists', async () => {
    const duplicate = new DuplicateManualTaskError({
      task_id: 'task-existing',
      task_text: 'Email legal about contract review',
      similarity: 0.95,
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
});
