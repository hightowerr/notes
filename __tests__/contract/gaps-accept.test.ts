import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const insertBridgingTasksMock = vi.fn();

class MockTaskInsertionError extends Error {
  constructor(message: string, public readonly code: string, public readonly validationErrors?: string[]) {
    super(message);
    this.name = 'TaskInsertionError';
  }
}

vi.mock('@/lib/services/taskInsertionService', () => ({
  insertBridgingTasks: insertBridgingTasksMock,
  TaskInsertionError: MockTaskInsertionError,
}));

let POST: typeof import('@/app/api/gaps/accept/route')['POST'];
let TaskInsertionError: typeof import('@/lib/services/taskInsertionService')['TaskInsertionError'];

beforeAll(async () => {
  ({ POST } = await import('@/app/api/gaps/accept/route'));
  ({ TaskInsertionError } = await import('@/lib/services/taskInsertionService'));
});

const mockTaskPayload = {
  id: 'e5f6a7b8-c9d0-1234-ef56-7890abcdef12',
  gap_id: 'd4e5f6a7-b8c9-0123-def4-567890abcdef',
  task_text: 'Build mobile app frontend with React Native',
  estimated_hours: 80,
  cognition_level: 'high' as const,
  confidence: 0.85,
  reasoning: 'Bridges the gap between design and launch by implementing the application UI.',
  source: 'ai_generated' as const,
  requires_review: true,
  created_at: '2025-10-28T14:35:00Z',
};

describe('POST /api/gaps/accept - Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when request body is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('INVALID_ACCEPTED_TASKS');
  });

  it('returns 201 with insertion result when service succeeds', async () => {
    insertBridgingTasksMock.mockResolvedValueOnce({
      inserted_count: 1,
      task_ids: [mockTaskPayload.id],
      relationships_created: 2,
    });

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        accepted_tasks: [
          {
            task: mockTaskPayload,
            predecessor_id: 'task-predecessor',
            successor_id: 'task-successor',
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      inserted_count: 1,
      task_ids: [mockTaskPayload.id],
      relationships_created: 2,
    });
    expect(insertBridgingTasksMock).toHaveBeenCalledTimes(1);
  });

  it('maps validation errors to 400 responses', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Invalid data', 'VALIDATION_ERROR', ['Bad task'])
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        accepted_tasks: [
          {
            task: mockTaskPayload,
            predecessor_id: 'task-predecessor',
            successor_id: 'task-successor',
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.validation_errors).toEqual(['Bad task']);
  });

  it('maps not found errors to 404 responses', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Task missing', 'TASK_NOT_FOUND')
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        accepted_tasks: [
          {
            task: mockTaskPayload,
            predecessor_id: 'task-predecessor',
            successor_id: 'task-successor',
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('TASK_NOT_FOUND');
  });

  it('maps cycle detection errors to 409 responses', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Cycle detected', 'CYCLE_DETECTED', ['Cycle A → B → C → A'])
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        accepted_tasks: [
          {
            task: mockTaskPayload,
            predecessor_id: 'task-predecessor',
            successor_id: 'task-successor',
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe('CYCLE_DETECTED');
    expect(body.validation_errors).toEqual(['Cycle A → B → C → A']);
  });

  it('maps duplicate errors to 422 responses', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Duplicate task detected', 'DUPLICATE_TASK', ['Similarity 0.94'])
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        accepted_tasks: [
          {
            task: mockTaskPayload,
            predecessor_id: 'task-predecessor',
            successor_id: 'task-successor',
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe('DUPLICATE_TASK');
    expect(body.validation_errors).toEqual(['Similarity 0.94']);
  });

  it('falls back to 500 on unexpected insertion errors', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Storage failure', 'INSERTION_FAILED')
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        accepted_tasks: [
          {
            task: mockTaskPayload,
            predecessor_id: 'task-predecessor',
            successor_id: 'task-successor',
          },
        ],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('INSERTION_FAILED');
  });
});
