import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET as prioritizeStreamGET } from '@/app/api/agent/prioritize/route';
import { emitPrioritizationProgress } from '@/lib/services/prioritizationStream';

const decoder = new TextDecoder();

async function collectSseEvents(
  response: Response,
  expectedCount: number
): Promise<Record<string, unknown>[]> {
  const events: Record<string, unknown>[] = [];
  const reader = response.body?.getReader();

  if (!reader) {
    return events;
  }

  let buffer = '';

  while (events.length < expectedCount) {
    const { value, done } = await reader.read();
    if (done || !value) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let delimiterIndex = buffer.indexOf('\n\n');

    while (delimiterIndex !== -1) {
      const chunk = buffer.slice(0, delimiterIndex);
      buffer = buffer.slice(delimiterIndex + 2);
      const dataLine = chunk.split('\n').find(line => line.startsWith('data: '));
      if (dataLine) {
        try {
          const payload = JSON.parse(dataLine.replace(/^data:\s*/, ''));
          events.push(payload);
        } catch (error) {
          console.warn('[progressive-disclosure.test] Failed to parse SSE event', error);
        }
      }
      delimiterIndex = buffer.indexOf('\n\n');
    }
  }

  return events;
}

describe('progressive prioritization stream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams progressive updates as prioritization advances', async () => {
    const sessionId = '7f6b1634-7778-4f94-b5b8-dadca7f25d63';
    const controller = new AbortController();
    const response = await prioritizeStreamGET(
      new Request(`http://localhost/api/agent/prioritize?session_id=${sessionId}`, {
        signal: controller.signal,
      })
    );

    expect(response.headers.get('Content-Type')).toContain('text/event-stream');

    const progressPlan = {
      ordered_task_ids: ['task-1', 'task-2', 'task-3', 'task-4'],
      execution_waves: [{ wave_number: 1, task_ids: ['task-1', 'task-2', 'task-3', 'task-4'], parallel_execution: false }],
      dependencies: [],
      confidence_scores: { 'task-1': 0.9, 'task-2': 0.85 },
      synthesis_summary: 'Streaming progress plan',
      task_annotations: [],
      removed_tasks: [],
      excluded_tasks: [],
      created_at: new Date().toISOString(),
    };

    const eventsPromise = collectSseEvents(response, 4);

    emitPrioritizationProgress(sessionId, {
      type: 'progress',
      progress_pct: 0.24,
      iteration: 1,
      total_iterations: 3,
      scored_tasks: 50,
      total_tasks: 200,
      ordered_count: 50,
      status: 'draft',
      plan: progressPlan,
    });

    emitPrioritizationProgress(sessionId, {
      type: 'progress',
      progress_pct: 0.52,
      iteration: 2,
      total_iterations: 3,
      scored_tasks: 100,
      total_tasks: 200,
      ordered_count: 100,
      status: 'refining',
      plan: progressPlan,
    });

    emitPrioritizationProgress(sessionId, {
      type: 'progress',
      progress_pct: 1,
      iteration: 3,
      total_iterations: 3,
      scored_tasks: 200,
      total_tasks: 200,
      ordered_count: 200,
      status: 'completed',
      plan: progressPlan,
    });

    const events = await eventsPromise;
    controller.abort();

    const progressEvents = events.filter(event => event?.type === 'progress');

    expect(progressEvents.length).toBeGreaterThanOrEqual(3);
    expect(progressEvents[0]?.progress_pct).toBeLessThan(progressEvents[progressEvents.length - 1]?.progress_pct as number);
    expect(progressEvents[progressEvents.length - 1]?.status).toBe('completed');
    expect(progressEvents[progressEvents.length - 1]?.plan).toBeDefined();
  });
});
