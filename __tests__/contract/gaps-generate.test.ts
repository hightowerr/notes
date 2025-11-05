import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/gaps/generate/route';
import * as taskGenerationService from '@/lib/services/taskGenerationService';

const mockGenerate = vi.spyOn(taskGenerationService, 'generateBridgingTasks');

describe('POST /api/gaps/generate - Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when request body is invalid', async () => {
    const request = new NextRequest('http://localhost:3000/api/gaps/generate', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('INVALID_GAP_GENERATION_PARAMS');
  });

  it('returns generation result when service succeeds', async () => {
    mockGenerate.mockResolvedValueOnce({
      bridging_tasks: [
        {
          id: 'bridge-1',
          gap_id: 'gap-1',
          task_text: 'Build the foundational frontend',
          estimated_hours: 80,
          cognition_level: 'high',
          confidence: 0.82,
          reasoning: 'Bridges design to launch by implementing the UI.',
          source: 'ai_generated',
          requires_review: true,
          created_at: '2025-10-28T14:35:00Z',
        },
      ],
      search_results_count: 3,
      generation_duration_ms: 4800,
    });

    const request = new NextRequest('http://localhost:3000/api/gaps/generate', {
      method: 'POST',
      body: JSON.stringify({
        gap_id: 'gap-1',
        predecessor_task_id: 'task-1',
        successor_task_id: 'task-2',
        outcome_statement: 'Launch the app successfully',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bridging_tasks).toHaveLength(1);
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        gapId: 'gap-1',
        predecessorTaskId: 'task-1',
        successorTaskId: 'task-2',
      })
    );
  });

  it('maps TaskGenerationError codes to HTTP status', async () => {
    mockGenerate.mockRejectedValueOnce(
      new taskGenerationService.TaskGenerationError('Tasks missing', 'TASK_NOT_FOUND')
    );

    const request = new NextRequest('http://localhost:3000/api/gaps/generate', {
      method: 'POST',
      body: JSON.stringify({
        gap_id: 'gap-1',
        predecessor_task_id: 'task-1',
        successor_task_id: 'task-2',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe('TASK_NOT_FOUND');
  });

  it('returns 500 for unexpected errors', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('Unexpected failure'));

    const request = new NextRequest('http://localhost:3000/api/gaps/generate', {
      method: 'POST',
      body: JSON.stringify({
        gap_id: 'gap-1',
        predecessor_task_id: 'task-1',
        successor_task_id: 'task-2',
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Task generation failed');
  });
});
