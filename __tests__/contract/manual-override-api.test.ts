import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { agentMockTables, resetAgentMockTables } from '../mocks/agentSupabaseMock';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-key';

let PATCH: typeof import('@/app/api/tasks/[id]/override/route')['PATCH'];

const DEFAULT_USER_ID = 'default-user';

beforeAll(async () => {
  ({ PATCH } = await import('@/app/api/tasks/[id]/override/route'));
});

function buildRequest(body: Record<string, unknown>, taskId = 'task-override-1') {
  return new NextRequest(`http://localhost:3000/api/tasks/${taskId}/override`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PATCH /api/tasks/[id]/override', () => {
  beforeEach(() => {
    resetAgentMockTables();
  });

  it('persists manual override and returns recalculated priority', async () => {
    const now = new Date().toISOString();
    const sessionId = '11111111-1111-1111-1111-111111111111';

    agentMockTables.task_embeddings.push({
      task_id: 'task-override-1',
      task_text: 'Streamline payment capture flow',
      document_id: 'doc-1',
      status: 'completed',
      created_at: now,
      updated_at: now,
    });

    agentMockTables.agent_sessions.push({
      id: sessionId,
      user_id: DEFAULT_USER_ID,
      outcome_id: 'outcome-1',
      status: 'running',
      prioritized_plan: null,
      baseline_plan: null,
      strategic_scores: {
        'task-override-1': {
          impact: 5,
          effort: 16,
          confidence: 0.6,
          priority: 15,
          reasoning: {
            impact_keywords: ['payment'],
            effort_source: 'heuristic',
          },
          scored_at: now,
        },
      },
      execution_metadata: {},
      created_at: now,
      updated_at: now,
    });

    const response = await PATCH(
      buildRequest({
        impact: 8,
        effort: 8,
        reason: 'Critical payment flow',
      }),
      { params: { id: 'task-override-1' } }
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      task_id: 'task-override-1',
      updated_priority: 48,
      has_manual_override: true,
      override: {
        impact: 8,
        effort: 8,
        reason: 'Critical payment flow',
        session_id: sessionId,
      },
    });
    expect(typeof payload.override.timestamp).toBe('string');

    const updatedTask = agentMockTables.task_embeddings.find(
      task => task.task_id === 'task-override-1'
    );
    expect(updatedTask?.manual_overrides).toMatchObject({
      impact: 8,
      effort: 8,
      reason: 'Critical payment flow',
      session_id: sessionId,
    });
  });

  it('rejects requests without override values', async () => {
    const now = new Date().toISOString();

    agentMockTables.task_embeddings.push({
      task_id: 'task-override-1',
      task_text: 'Streamline payment capture flow',
      document_id: 'doc-1',
      status: 'completed',
      created_at: now,
      updated_at: now,
    });

    agentMockTables.agent_sessions.push({
      id: '22222222-1111-1111-1111-111111111111',
      user_id: DEFAULT_USER_ID,
      outcome_id: 'outcome-1',
      status: 'running',
      prioritized_plan: null,
      baseline_plan: null,
      strategic_scores: {
        'task-override-1': {
          impact: 5,
          effort: 16,
          confidence: 0.6,
          priority: 15,
          reasoning: {
            impact_keywords: ['payment'],
            effort_source: 'heuristic',
          },
          scored_at: now,
        },
      },
      execution_metadata: {},
      created_at: now,
      updated_at: now,
    });

    const response = await PATCH(buildRequest({}), { params: { id: 'task-override-1' } });
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toBe('INVALID_INPUT');
  });
});
