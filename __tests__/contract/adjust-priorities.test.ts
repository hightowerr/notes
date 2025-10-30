/**
 * Contract Tests: POST /api/agent/adjust-priorities
 * Validates schema expectations for instant adjustment endpoint.
 *
 * NOTE: These tests currently fail because the endpoint is not implemented.
 * They codify the contract to guide the slice implementation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const API_BASE = 'http://localhost:3000';
const TEST_USER_ID = 'anonymous-user-p0';

async function clearAgentSessions() {
  const { data: sessions } = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('user_id', TEST_USER_ID);

  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map((session) => session.id);
    await supabase.from('reasoning_traces').delete().in('session_id', sessionIds);
    await supabase.from('agent_sessions').delete().in('id', sessionIds);
  }
}

async function clearReflections() {
  await supabase.from('reflections').delete().eq('user_id', TEST_USER_ID);
}

function buildBaselinePlan() {
  return {
    ordered_task_ids: ['task-a', 'task-b', 'task-c'],
    execution_waves: [
      { wave_number: 1, task_ids: ['task-a'], parallel_execution: false },
      { wave_number: 2, task_ids: ['task-b', 'task-c'], parallel_execution: true },
    ],
    dependencies: [],
    confidence_scores: {
      'task-a': 0.9,
      'task-b': 0.7,
      'task-c': 0.6,
    },
    synthesis_summary: 'Baseline plan created by full agent run.',
  };
}

async function createSessionWithBaseline() {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const baselinePlan = buildBaselinePlan();

  const { error } = await supabase.from('agent_sessions').insert({
    id: sessionId,
    user_id: TEST_USER_ID,
    outcome_id: randomUUID(),
    status: 'completed',
    prioritized_plan: baselinePlan,
    baseline_plan: baselinePlan,
    adjusted_plan: null,
    execution_metadata: {
      steps_taken: 3,
      tool_call_count: { 'semantic-search': 1 },
      thinking_time_ms: 500,
      tool_execution_time_ms: 800,
      total_time_ms: 1300,
      error_count: 0,
      success_rate: 1,
      failed_tools: [],
      status_note: null,
    },
    created_at: now,
    updated_at: now,
  });

  if (error) {
    throw new Error(
      `Failed to seed agent session with baseline plan. Ensure migration 015_add_reflection_toggle.sql is applied. ${error.message}`,
    );
  }

  return { sessionId, baselinePlan };
}

async function createSessionWithoutBaseline() {
  const sessionId = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('agent_sessions').insert({
    id: sessionId,
    user_id: TEST_USER_ID,
    outcome_id: randomUUID(),
    status: 'completed',
    prioritized_plan: null,
    baseline_plan: null,
    adjusted_plan: null,
    execution_metadata: {
      steps_taken: 0,
      tool_call_count: {},
      thinking_time_ms: 0,
      tool_execution_time_ms: 0,
      total_time_ms: 0,
      error_count: 0,
      success_rate: 0,
      failed_tools: [],
      status_note: null,
    },
    created_at: now,
    updated_at: now,
  });

  if (error) {
    throw error;
  }

  return sessionId;
}

async function createReflection(text: string) {
  const { data, error } = await supabase
    .from('reflections')
    .insert({
      user_id: TEST_USER_ID,
      text,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to create test reflection');
  }

  return data.id as string;
}

describe('POST /api/agent/adjust-priorities', () => {
  beforeAll(async () => {
    await clearAgentSessions();
    await clearReflections();
  });

  afterAll(async () => {
    await clearAgentSessions();
    await clearReflections();
  });

  it('returns 400 when baseline plan is missing', async () => {
    const sessionId = await createSessionWithoutBaseline();

    const response = await fetch(`${API_BASE}/api/agent/adjust-priorities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        active_reflection_ids: [],
      }),
    });

    expect(response.status).toBe(400);
    const contentType = response.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    const payload = await response.json();
    expect(payload).toHaveProperty('error');
    expect(payload.error).toMatch(/Baseline plan/);
  });

  it('returns 200 with adjusted plan structure matching contract', async () => {
    const { sessionId } = await createSessionWithBaseline();
    const reflectionIdA = await createReflection('Design sprint focus for the next two weeks.');
    const reflectionIdB = await createReflection('Avoid late-night deployments due to fatigue.');

    const response = await fetch(`${API_BASE}/api/agent/adjust-priorities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        active_reflection_ids: [reflectionIdA, reflectionIdB],
      }),
    });

    expect(response.status).toBe(200);
    const contentType = response.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    const payload = await response.json();

    expect(payload).toHaveProperty('adjusted_plan');
    expect(payload.adjusted_plan).toEqual(
      expect.objectContaining({
        ordered_task_ids: expect.arrayContaining([expect.any(String)]),
        confidence_scores: expect.any(Object),
        diff: expect.objectContaining({
          moved: expect.any(Array),
          filtered: expect.any(Array),
        }),
        adjustment_metadata: expect.objectContaining({
          reflections: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              text: expect.any(String),
              recency_weight: expect.any(Number),
              created_at: expect.any(String),
            }),
          ]),
          tasks_moved: expect.any(Number),
          tasks_filtered: expect.any(Number),
          duration_ms: expect.any(Number),
        }),
      }),
    );

    expect(payload).toHaveProperty('performance');
    expect(payload.performance).toEqual(
      expect.objectContaining({
        total_ms: expect.any(Number),
        ranking_ms: expect.any(Number),
      }),
    );
  });
});
