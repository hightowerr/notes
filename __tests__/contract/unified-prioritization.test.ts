/**
 * Contract Tests: Unified Prioritization API
 * Validates the unified prioritization flow with excluded tasks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

import { agentMockTables, resetAgentMockTables } from '../mocks/agentSupabaseMock';
import { POST as prioritizeRoute } from '@/app/api/agent/prioritize/route';
import { GET as sessionRoute } from '@/app/api/agent/sessions/[sessionId]/route';

const DEFAULT_USER_ID = 'default-user';

describe('Unified Prioritization API Contract', () => {
  beforeEach(() => {
    resetAgentMockTables();
  });

  it('should trigger prioritization and return a session ID', async () => {
    const outcomeId = randomUUID();
    const now = new Date().toISOString();

    // Add outcome to mock tables
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

    // Add some sample tasks
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
      body: JSON.stringify({
        outcome_id: outcomeId,
        user_id: DEFAULT_USER_ID,
      }),
    });

    const response = await prioritizeRoute(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session_id).toBeDefined();
    expect(data.status).toBe('running');
  });

  it('should return excluded tasks in session details', async () => {
    const outcomeId = randomUUID();
    const sessionId = randomUUID();
    const now = new Date().toISOString();

    // Add outcome to mock tables
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

    // Create excluded tasks
    const excludedTasks = [
      {
        task_id: 'task-excluded-1',
        task_text: 'Update documentation',
        exclusion_reason: 'Does not advance revenue metric',
        alignment_score: 2,
      },
    ];

    // Add session with excluded tasks to mock tables
    agentMockTables.agent_sessions.push({
      id: sessionId,
      user_id: DEFAULT_USER_ID,
      outcome_id: outcomeId,
      status: 'completed',
      prioritized_plan: {
        ordered_task_ids: [],
        execution_waves: [],
        dependencies: [],
        confidence_scores: {},
        synthesis_summary: 'Test session',
      },
      baseline_plan: null,
      excluded_tasks: excludedTasks,
      execution_metadata: {
        steps_taken: 1,
        tool_call_count: {},
        thinking_time_ms: 0,
        tool_execution_time_ms: 0,
        total_time_ms: 100,
        error_count: 0,
        success_rate: 1,
        status_note: null,
      },
      created_at: now,
      updated_at: now,
    });

    const request = new Request(
      `http://localhost/api/agent/sessions/${sessionId}`,
      {
        method: 'GET',
      }
    );

    const params = Promise.resolve({ sessionId });
    const response = await sessionRoute(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session.excluded_tasks).toHaveLength(1);
    expect(data.session.excluded_tasks[0].exclusion_reason).toBe(
      'Does not advance revenue metric'
    );
  });
});
