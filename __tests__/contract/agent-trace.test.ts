/**
 * Contract Tests: GET /api/agent/sessions/[sessionId]/trace
 * Ensures reasoning trace retrieval adheres to contract.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const API_BASE = 'http://localhost:3000';
const DEFAULT_USER_ID = 'default-user';

async function purgeAgentRecords() {
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

describe('GET /api/agent/sessions/[sessionId]/trace', () => {
  beforeEach(async () => {
    await purgeAgentRecords();
  });

  afterAll(async () => {
    await purgeAgentRecords();
  });

  it('returns 404 when trace does not exist', async () => {
    const response = await fetch(
      `${API_BASE}/api/agent/sessions/${randomUUID()}/trace`
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('NOT_FOUND');
  });

  it('returns 200 with reasoning trace when data exists', async () => {
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
    const sessionId = randomUUID();

    const prioritizedPlan = {
      ordered_task_ids: ['task-001'],
      execution_waves: [
        { wave_number: 1, task_ids: ['task-001'], parallel_execution: false },
      ],
      dependencies: [],
      confidence_scores: { 'task-001': 0.9 },
      synthesis_summary: 'Execute task-001 to unlock revenue gains.',
    };

    const { error: sessionError } = await supabase.from('agent_sessions').insert({
      id: sessionId,
      user_id: DEFAULT_USER_ID,
      outcome_id: outcome.id,
      status: 'completed',
      prioritized_plan: prioritizedPlan,
      execution_metadata: {
        steps_taken: 2,
        tool_call_count: { 'semantic-search': 1 },
        thinking_time_ms: 500,
        tool_execution_time_ms: 1200,
        total_time_ms: 1700,
        error_count: 0,
        success_rate: 1,
        status_note: null,
      },
      created_at: now,
      updated_at: now,
    });

    if (sessionError) {
      throw sessionError;
    }

    const stepTimestamp = new Date().toISOString();
    const { error: traceError } = await supabase.from('reasoning_traces').insert({
      id: randomUUID(),
      session_id: sessionId,
      steps: [
        {
          step_number: 1,
          timestamp: stepTimestamp,
          thought: 'Identify revenue-impacting tasks',
          tool_name: 'semantic-search',
          tool_input: { query: 'increase revenue', limit: 10 },
          tool_output: { tasks: [{ id: 'task-001', score: 0.9 }] },
          duration_ms: 800,
          status: 'success',
        },
        {
          step_number: 2,
          timestamp: stepTimestamp,
          thought: 'Summarize findings',
          tool_name: null,
          tool_input: null,
          tool_output: null,
          duration_ms: 150,
          status: 'success',
        },
      ],
      total_duration_ms: 950,
      total_steps: 2,
      tools_used_count: { 'semantic-search': 1 },
      created_at: now,
    });

    if (traceError) {
      throw traceError;
    }

    const response = await fetch(
      `${API_BASE}/api/agent/sessions/${sessionId}/trace`
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.trace).toBeDefined();
    expect(payload.trace.session_id).toBe(sessionId);
    expect(payload.trace.total_steps).toBe(2);
    expect(payload.trace.total_duration_ms).toBe(950);
    expect(payload.trace.steps).toHaveLength(2);
    expect(payload.trace.steps[0]).toEqual(
      expect.objectContaining({
        step_number: 1,
        tool_name: 'semantic-search',
        duration_ms: 800,
        status: 'success',
      })
    );
  });
});
