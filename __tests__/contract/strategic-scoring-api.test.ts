import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

import { agentMockTables, resetAgentMockTables } from '../mocks/agentSupabaseMock';
import { POST as prioritizeRoute } from '@/app/api/agent/prioritize/route';

const DEFAULT_USER_ID = 'default-user';

describe('Strategic scoring in prioritization API', () => {
  beforeEach(() => {
    resetAgentMockTables();
  });

  it('returns strategic scores and prioritized tasks in the trigger response', async () => {
    const outcomeId = randomUUID();
    const now = new Date().toISOString();

    agentMockTables.user_outcomes.push({
      id: outcomeId,
      user_id: DEFAULT_USER_ID,
      direction: 'increase',
      object_text: 'monthly recurring revenue',
      metric_text: '25% in 6 months',
      clarifier: 'enterprise focus',
      assembled_text: 'Increase monthly recurring revenue by 25% in 6 months',
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    agentMockTables.task_embeddings.push(
      {
        task_id: 'task-101',
        task_text: 'Implement payment flow for enterprise plan',
        document_id: 'doc-1',
        status: 'completed',
        created_at: now,
        updated_at: now,
      },
      {
        task_id: 'task-102',
        task_text: 'Document internal release checklist',
        document_id: 'doc-2',
        status: 'completed',
        created_at: now,
        updated_at: now,
      }
    );

    const request = new Request('http://localhost/api/agent/prioritize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome_id: outcomeId, user_id: DEFAULT_USER_ID }),
    });

    const response = await prioritizeRoute(request);
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.strategic_scores).toBeDefined();
    expect(Object.keys(payload.strategic_scores)).toContain('task-101');
    expect(payload.prioritized_tasks).toBeInstanceOf(Array);
    expect(payload.prioritized_tasks[0]).toMatchObject({
      id: expect.any(String),
      impact: expect.any(Number),
      effort: expect.any(Number),
      confidence: expect.any(Number),
      priority: expect.any(Number),
      quadrant: expect.stringMatching(/impact_/),
    });
  });
});
