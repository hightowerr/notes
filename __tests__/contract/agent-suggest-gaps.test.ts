import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const MissingTaskError = class extends Error {};
const detectGapsMock = vi.fn();

vi.mock('@/lib/services/gapDetectionService', () => ({
  detectGaps: detectGapsMock,
  MissingTaskError,
}));

const getTaskRecordsByIdsMock = vi.fn();

vi.mock('@/lib/services/taskRepository', () => ({
  getTaskRecordsByIds: getTaskRecordsByIdsMock,
}));

const suggestExecuteMock = vi.fn();

vi.mock('@/lib/mastra/tools/suggestBridgingTasks', () => ({
  suggestBridgingTasksTool: {
    execute: suggestExecuteMock,
  },
}));

const parsePlanMock = vi.fn();

vi.mock('@/lib/mastra/services/resultParser', () => ({
  parsePlanFromAgentResponse: parsePlanMock,
}));

class TaskGenerationError extends Error {
  constructor(message: string, public code?: string, public metadata?: unknown) {
    super(message);
  }
}

vi.mock('@/lib/services/taskGenerationService', () => ({
  TaskGenerationError,
}));

const sessionMaybeSingleMock = vi.fn();
const sessionUpdateEqMock = vi.fn();
const userOutcomeMaybeSingleMock = vi.fn();

const agentSessionsSelectMock = vi.fn();
const agentSessionsUpdateMock = vi.fn();
const userOutcomeSelectMock = vi.fn();

const fromMock = vi.fn();
const createClientMock = vi.fn(() => ({
  from: fromMock,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

let POST: typeof import('@/app/api/agent/suggest-gaps/route')['POST'];

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';

  agentSessionsSelectMock.mockReturnValue({
    eq: vi.fn(() => ({ maybeSingle: sessionMaybeSingleMock })),
  });

  agentSessionsUpdateMock.mockReturnValue({
    eq: sessionUpdateEqMock,
  });

  userOutcomeSelectMock.mockReturnValue({
    eq: vi.fn(() => ({ maybeSingle: userOutcomeMaybeSingleMock })),
  });

  fromMock.mockImplementation((table: string) => {
    if (table === 'agent_sessions') {
      return {
        select: agentSessionsSelectMock,
        update: agentSessionsUpdateMock,
      };
    }
    if (table === 'user_outcomes') {
      return {
        select: userOutcomeSelectMock,
      };
    }
    throw new Error(`Unexpected table requested in supabase mock: ${table}`);
  });

  ({ POST } = await import('@/app/api/agent/suggest-gaps/route'));
});

function createValidSession() {
  return {
    id: '6dc3bef1-7b45-4c8e-9e3c-c454ab76f3d7',
    user_id: 'user-123',
    outcome_id: 'outcome-456',
    prioritized_plan: {
      ordered_task_ids: ['task-1', 'task-2'],
      execution_waves: [
        {
          wave_number: 1,
          task_ids: ['task-1'],
          parallel_execution: false,
        },
        {
          wave_number: 2,
          task_ids: ['task-2'],
          parallel_execution: false,
        },
      ],
      dependencies: [
        {
          source_task_id: 'task-1',
          target_task_id: 'task-2',
          relationship_type: 'prerequisite',
          confidence: 0.8,
          detection_method: 'stored_relationship',
        },
      ],
      confidence_scores: {
        'task-1': 0.9,
        'task-2': 0.7,
      },
      synthesis_summary: 'Summary of prioritized plan',
      task_annotations: [],
      removed_tasks: [],
    },
    result: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  agentSessionsSelectMock.mockReturnValue({
    eq: vi.fn(() => ({ maybeSingle: sessionMaybeSingleMock })),
  });
  agentSessionsUpdateMock.mockReturnValue({
    eq: sessionUpdateEqMock,
  });
  userOutcomeSelectMock.mockReturnValue({
    eq: vi.fn(() => ({ maybeSingle: userOutcomeMaybeSingleMock })),
  });
  fromMock.mockImplementation((table: string) => {
    if (table === 'agent_sessions') {
      return {
        select: agentSessionsSelectMock,
        update: agentSessionsUpdateMock,
      };
    }
    if (table === 'user_outcomes') {
      return {
        select: userOutcomeSelectMock,
      };
    }
    throw new Error(`Unexpected table requested in supabase mock: ${table}`);
  });

  parsePlanMock.mockReturnValue({ success: false, plan: null });

  sessionMaybeSingleMock.mockResolvedValue({ data: createValidSession(), error: null });
  sessionUpdateEqMock.mockResolvedValue({ error: null });
  userOutcomeMaybeSingleMock.mockResolvedValue({
    data: { assembled_text: 'Launch the MVP successfully' },
    error: null,
  });

  detectGapsMock.mockResolvedValue({
    gaps: [
      {
        id: '37b6f57a-f87d-4a4d-8a25-7d0354dced0c',
        predecessor_task_id: 'task-1',
        successor_task_id: 'task-2',
        indicators: {
          time_gap: true,
          action_type_jump: false,
          no_dependency: true,
          skill_jump: false,
        },
        confidence: 0.82,
        detected_at: '2025-10-28T10:00:00.000Z',
      },
    ],
    metadata: {
      analysis_duration_ms: 120,
      total_pairs_analyzed: 1,
      gaps_detected: 1,
    },
  });

  suggestExecuteMock.mockResolvedValue({
    bridging_tasks: [
      {
        id: '1f3a5b7c-9d8e-4f2a-b6c1-2d3e4f5a6b7c',
        gap_id: '37b6f57a-f87d-4a4d-8a25-7d0354dced0c',
        task_text: 'Implement the application backend API layer for user data',
        estimated_hours: 80,
        cognition_level: 'high',
        confidence: 0.86,
        reasoning:
          'Provides the necessary backend capabilities between design and launch to handle user requests securely.',
        source: 'ai_generated',
        requires_review: true,
        created_at: '2025-10-28T10:05:00.000Z',
      },
    ],
    search_results_count: 4,
    generation_duration_ms: 1500,
  });

  getTaskRecordsByIdsMock.mockResolvedValue({
    tasks: [
      {
        task_id: 'task-1',
        task_text: 'Design mobile app mockups',
        created_at: null,
        document_id: null,
        source: 'embedding',
      },
      {
        task_id: 'task-2',
        task_text: 'Launch app to beta users',
        created_at: null,
        document_id: null,
        source: 'embedding',
      },
    ],
    missingIds: [],
    recoveredTaskIds: [],
  });
});

describe('POST /api/agent/suggest-gaps - Contract', () => {
  it('returns 400 when session_id is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/agent/suggest-gaps', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid request body');
  });

  it('returns 404 when session is not found', async () => {
    sessionMaybeSingleMock.mockResolvedValueOnce({ data: null, error: null });

    const request = new NextRequest('http://localhost:3000/api/agent/suggest-gaps', {
      method: 'POST',
      body: JSON.stringify({
        session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Session not found');
  });

  it('propagates MissingTaskError from gap detection as 404', async () => {
    detectGapsMock.mockRejectedValueOnce(new MissingTaskError('Task embeddings missing'));

    const request = new NextRequest('http://localhost:3000/api/agent/suggest-gaps', {
      method: 'POST',
      body: JSON.stringify({
        session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('TASKS_NOT_FOUND');
  });

  it('returns 200 with gaps and suggestions on success', async () => {
    const request = new NextRequest('http://localhost:3000/api/agent/suggest-gaps', {
      method: 'POST',
      body: JSON.stringify({
        session_id: 'a39bca3e-d1a5-4048-9b9a-80f4b41c1cb5',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);

    expect(Array.isArray(body.gaps)).toBe(true);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps[0]).toMatchObject({
      predecessor_task_id: 'task-1',
      successor_task_id: 'task-2',
      confidence: 0.82,
    });

    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions[0]).toMatchObject({
      gap_id: '37b6f57a-f87d-4a4d-8a25-7d0354dced0c',
      status: 'success',
    });
    expect(body.suggestions[0].tasks).toHaveLength(1);
    expect(body.analysis_session_id).toEqual(expect.any(String));
    expect(body.performance_metrics).toMatchObject({
      detection_ms: expect.any(Number),
      generation_ms: expect.any(Number),
      total_ms: expect.any(Number),
    });

    expect(detectGapsMock).toHaveBeenCalledWith(['task-1', 'task-2']);
    expect(suggestExecuteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        gap_id: '37b6f57a-f87d-4a4d-8a25-7d0354dced0c',
        predecessor_id: 'task-1',
        successor_id: 'task-2',
      })
    );
    expect(sessionUpdateEqMock).toHaveBeenCalled();
  });
});
