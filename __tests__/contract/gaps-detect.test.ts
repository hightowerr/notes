import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const detectGapsMock = vi.fn();

vi.mock('@/lib/services/gapDetectionService', () => {
  class MockMissingTaskError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'MissingTaskError';
    }
  }

  return {
    detectGaps: detectGapsMock,
    MissingTaskError: MockMissingTaskError,
  };
});

let POST: typeof import('@/app/api/gaps/detect/route')['POST'];
let MissingTaskError: typeof import('@/lib/services/gapDetectionService')['MissingTaskError'];

beforeAll(async () => {
  ({ POST } = await import('@/app/api/gaps/detect/route'));
  ({ MissingTaskError } = await import('@/lib/services/gapDetectionService'));
});

const mockDetectGaps = vi.mocked(detectGapsMock);

describe('POST /api/gaps/detect - Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when request body is missing task_ids', async () => {
    const request = new NextRequest('http://localhost:3000/api/gaps/detect', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: 'Invalid request',
      code: 'INVALID_TASK_IDS',
    });
  });

  it('returns 400 when fewer than two task_ids are provided', async () => {
    const request = new NextRequest('http://localhost:3000/api/gaps/detect', {
      method: 'POST',
      body: JSON.stringify({ task_ids: ['task-1'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('INVALID_TASK_IDS');
  });

  it('returns gap results when service succeeds', async () => {
    const mockResult = {
      gaps: [
        {
          id: 'gap-1',
          predecessor_task_id: 'task-1',
          successor_task_id: 'task-2',
          indicators: {
            time_gap: true,
            action_type_jump: true,
            no_dependency: true,
            skill_jump: false,
          },
          confidence: 0.75,
          detected_at: '2025-10-28T00:00:00.000Z',
        },
      ],
      metadata: {
        total_pairs_analyzed: 1,
        gaps_detected: 1,
        analysis_duration_ms: 42,
      },
    };

    mockDetectGaps.mockResolvedValueOnce(mockResult);

    const request = new NextRequest('http://localhost:3000/api/gaps/detect', {
      method: 'POST',
      body: JSON.stringify({ task_ids: ['task-1', 'task-2'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(mockResult);
    expect(mockDetectGaps).toHaveBeenCalledWith(['task-1', 'task-2']);
  });

  it('returns 404 when the service reports missing tasks', async () => {
    const error = new MissingTaskError('Missing task(s)');
    mockDetectGaps.mockRejectedValueOnce(error);

    const request = new NextRequest('http://localhost:3000/api/gaps/detect', {
      method: 'POST',
      body: JSON.stringify({ task_ids: ['task-1', 'task-2'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain('Missing task');
  });

  it('returns 500 when an unexpected error occurs', async () => {
    mockDetectGaps.mockRejectedValueOnce(new Error('Unexpected failure'));

    const request = new NextRequest('http://localhost:3000/api/gaps/detect', {
      method: 'POST',
      body: JSON.stringify({ task_ids: ['task-1', 'task-2'] }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Gap detection failed');
  });
});
