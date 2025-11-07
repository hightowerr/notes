import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const insertBridgingTasksMock = vi.fn();

class MockTaskInsertionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly validationErrors?: string[]
  ) {
    super(message);
    this.name = 'TaskInsertionError';
  }
}

const maybeSingleMock = vi.fn();
const eqUpdateMock = vi.fn();
const relationshipsDeleteMock = vi.fn();
const relationshipsInMock = vi.fn();
const embeddingsDeleteMock = vi.fn();
const embeddingsInMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === 'agent_sessions') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock,
        })),
      })),
      update: vi.fn(() => ({
        eq: eqUpdateMock,
      })),
    };
  }

  if (table === 'task_relationships') {
    return {
      delete: relationshipsDeleteMock.mockReturnValue({
        in: relationshipsInMock,
      }),
    };
  }

  if (table === 'task_embeddings') {
    return {
      delete: embeddingsDeleteMock.mockReturnValue({
        in: embeddingsInMock,
      }),
    };
  }

  throw new Error(`Unexpected table requested in supabase mock: ${table}`);
});

vi.mock('@/lib/services/taskInsertionService', () => ({
  insertBridgingTasks: insertBridgingTasksMock,
  TaskInsertionError: MockTaskInsertionError,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
  },
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

function createSessionRecord() {
  return {
    id: '6dc3bef1-7b45-4c8e-9e3c-c454ab76f3d7',
    prioritized_plan: {
      ordered_task_ids: ['task-predecessor', 'task-successor'],
      execution_waves: [
        {
          wave_number: 1,
          task_ids: ['task-predecessor', 'task-successor'],
          parallel_execution: false,
          estimated_duration_hours: null,
        },
      ],
      dependencies: [
        {
          source_task_id: 'task-predecessor',
          target_task_id: 'task-successor',
          relationship_type: 'prerequisite',
          confidence: 0.7,
          detection_method: 'stored_relationship',
        },
      ],
      confidence_scores: {
        'task-predecessor': 0.8,
        'task-successor': 0.6,
      },
      task_annotations: [],
      removed_tasks: [],
      synthesis_summary: 'Baseline summary',
    },
    result: {
      gap_analysis: {
        session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
        trigger_timestamp: new Date('2025-10-28T00:00:00Z').toISOString(),
        plan_snapshot: [
          {
            task_id: 'task-predecessor',
            task_text: 'Design app mockups',
            estimated_hours: 80,
            depends_on: [],
          },
          {
            task_id: 'task-successor',
            task_text: 'Launch on app store',
            estimated_hours: 40,
            depends_on: ['task-predecessor'],
          },
        ],
        detected_gaps: [
          {
            predecessor_id: 'task-predecessor',
            successor_id: 'task-successor',
            gap_type: 'dependency',
            confidence: 0.8,
            indicators: {
              time_gap: true,
              action_type_jump: false,
              no_dependency: true,
              skill_jump: false,
            },
          },
        ],
        generated_tasks: [],
        user_acceptances: [],
        insertion_result: {
          success: false,
          inserted_task_ids: [],
          error: null,
        },
        performance_metrics: {
          detection_ms: 100,
          generation_ms: 200,
          total_ms: 300,
          search_query_count: 1,
        },
      },
    },
  };
}

describe('POST /api/gaps/accept - Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    maybeSingleMock.mockResolvedValue({ data: createSessionRecord(), error: null });
    eqUpdateMock.mockResolvedValue({ error: null });
    relationshipsDeleteMock.mockReturnValue({ in: relationshipsInMock });
    relationshipsInMock.mockResolvedValue({ error: null });
    embeddingsDeleteMock.mockReturnValue({ in: embeddingsInMock });
    embeddingsInMock.mockResolvedValue({ error: null });
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

  it('returns 201 with insertion result and updated plan when service succeeds', async () => {
    insertBridgingTasksMock.mockResolvedValueOnce({
      inserted_count: 1,
      task_ids: [mockTaskPayload.id],
      relationships_created: 2,
      cycles_resolved: 0,
    });

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        analysis_session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
        agent_session_id: '6dc3bef1-7b45-4c8e-9e3c-c454ab76f3d7',
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
    expect(body.inserted_count).toBe(1);
    expect(body.relationships_created).toBe(2);
    expect(body.updated_plan).toBeDefined();
    expect(body.updated_plan.ordered_task_ids).toContain(mockTaskPayload.id);
    expect(eqUpdateMock).toHaveBeenCalledTimes(1);
    expect(insertBridgingTasksMock).toHaveBeenCalledTimes(1);
  });

  it('maps validation errors to 400 responses', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Invalid data', 'VALIDATION_ERROR', ['Bad task'])
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        analysis_session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
        agent_session_id: '6dc3bef1-7b45-4c8e-9e3c-c454ab76f3d7',
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
    expect(eqUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('maps not found errors to 404 responses', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Task missing', 'TASK_NOT_FOUND')
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        analysis_session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
        agent_session_id: '6dc3bef1-7b45-4c8e-9e3c-c454ab76f3d7',
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
    expect(eqUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('maps cycle detection errors to 409 responses', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Cycle detected', 'CYCLE_DETECTED', ['Cycle A → B → C → A'])
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        analysis_session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
        agent_session_id: '6dc3bef1-7b45-4c8e-9e3c-c454ab76f3d7',
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
    expect(eqUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('maps duplicate errors to 422 responses', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Duplicate task detected', 'DUPLICATE_TASK', ['Similarity 0.94'])
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        analysis_session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
        agent_session_id: '6dc3bef1-7b45-4c8e-9e3c-c454ab76f3d7',
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
    expect(eqUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to 500 on unexpected insertion errors', async () => {
    insertBridgingTasksMock.mockRejectedValueOnce(
      new TaskInsertionError('Storage failure', 'INSERTION_FAILED')
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/accept', {
      method: 'POST',
      body: JSON.stringify({
        analysis_session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
        agent_session_id: '6dc3bef1-7b45-4c8e-9e3c-c454ab76f3d7',
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
    expect(eqUpdateMock).toHaveBeenCalledTimes(1);
  });
});
