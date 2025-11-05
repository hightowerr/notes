/**
 * Contract Tests: GET /api/agent/sessions/[sessionId]
 * Validates retrieval of agent session data.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const API_BASE = 'http://localhost:3000';
const DEFAULT_USER_ID = 'default-user';

async function resetAgentData() {
  const { data: sessions } = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('user_id', DEFAULT_USER_ID);

  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map((session) => session.id);
    await supabase.from('reasoning_traces').delete().in('session_id', sessionIds);
    await supabase.from('agent_sessions').delete().in('id', sessionIds);
  }

  await supabase.from('user_outcomes').delete().eq('user_id', DEFAULT_USER_ID);
}

describe('GET /api/agent/sessions/[sessionId]', () => {
  beforeEach(async () => {
    await resetAgentData();
  });

  afterAll(async () => {
    await resetAgentData();
  });

  it('returns 404 when sessionId does not exist', async () => {
    const response = await fetch(
      `${API_BASE}/api/agent/sessions/${randomUUID()}`
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('NOT_FOUND');
  });

  it('returns 200 with session payload when session exists', async () => {
    const { data: outcome, error: outcomeError } = await supabase
      .from('user_outcomes')
      .insert({
        user_id: DEFAULT_USER_ID,
        direction: 'increase',
        object_text: 'monthly recurring revenue',
        metric_text: '25% within 6 months',
        clarifier: 'enterprise acquisition channel',
        assembled_text:
          'Increase the monthly recurring revenue by 25% within 6 months via enterprise acquisition channel',
        is_active: true,
      })
      .select()
      .single();

    if (outcomeError || !outcome) {
      throw outcomeError ?? new Error('Failed to create test outcome');
    }

    const now = new Date().toISOString();
    const prioritizedPlan = {
      ordered_task_ids: ['task-001', 'task-002'],
      execution_waves: [
        { wave_number: 1, task_ids: ['task-001'], parallel_execution: false },
        {
          wave_number: 2,
          task_ids: ['task-002'],
          parallel_execution: false,
        },
      ],
      dependencies: [
        {
          source_task_id: 'task-002',
          target_task_id: 'task-001',
          relationship_type: 'prerequisite',
          confidence: 0.9,
          detection_method: 'ai_inference',
        },
      ],
      confidence_scores: {
        'task-001': 0.92,
        'task-002': 0.88,
      },
      synthesis_summary:
        'Complete task-001 before executing task-002 to unblock revenue impact.',
    };

    const executionMetadata = {
      steps_taken: 5,
      tool_call_count: {
        'semantic-search': 2,
        'detect-dependencies': 1,
      },
      thinking_time_ms: 1200,
      tool_execution_time_ms: 2400,
      total_time_ms: 3600,
      error_count: 0,
      success_rate: 1,
      status_note: null,
    };

    const { data: session, error: sessionError } = await supabase
      .from('agent_sessions')
      .insert({
        id: randomUUID(),
        user_id: DEFAULT_USER_ID,
        outcome_id: outcome.id,
        status: 'completed',
        prioritized_plan: prioritizedPlan,
        execution_metadata: executionMetadata,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (sessionError || !session) {
      throw sessionError ?? new Error('Failed to create agent session');
    }

    const response = await fetch(`${API_BASE}/api/agent/sessions/${session.id}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session).toBeDefined();
    expect(payload.session.id).toBe(session.id);
    expect(payload.session.status).toBe('completed');
    expect(payload.session.outcome_id).toBe(outcome.id);
    expect(payload.session.execution_metadata).toEqual(
      expect.objectContaining({
        steps_taken: 5,
        total_time_ms: 3600,
        error_count: 0,
        success_rate: 1,
      })
    );
    expect(payload.session.prioritized_plan).toEqual(
      expect.objectContaining({
        ordered_task_ids: ['task-001', 'task-002'],
        synthesis_summary: expect.stringContaining('Complete task-001'),
      })
    );
    expect(payload.trace).toBeNull();
  });
});

