/**
 * Contract Tests: POST /api/agent/prioritize
 * Validates request/response schema and error handling for prioritization trigger.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const API_BASE = 'http://localhost:3000';
const DEFAULT_USER_ID = 'default-user';

async function clearAgentState() {
  const { data: sessions } = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('user_id', DEFAULT_USER_ID);

  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map((session) => session.id);
    await supabase.from('reasoning_traces').delete().in('session_id', sessionIds);
    await supabase.from('agent_sessions').delete().in('id', sessionIds);
  }
}

describe('POST /api/agent/prioritize', () => {
  beforeEach(async () => {
    await clearAgentState();
    await supabase.from('user_outcomes').delete().eq('user_id', DEFAULT_USER_ID);
  });

  afterAll(async () => {
    await clearAgentState();
    await supabase.from('user_outcomes').delete().eq('user_id', DEFAULT_USER_ID);
  });

  it('returns 400 when required fields are missing', async () => {
    const response = await fetch(`${API_BASE}/api/agent/prioritize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('VALIDATION_ERROR');
    expect(data.message).toContain('outcome_id and user_id are required');
  });

  it('returns 403 when active outcome is not found', async () => {
    const response = await fetch(`${API_BASE}/api/agent/prioritize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outcome_id: randomUUID(),
        user_id: DEFAULT_USER_ID,
      }),
    });

    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('NO_ACTIVE_OUTCOME');
  });

  it('returns 200 and creates running session when payload is valid', async () => {
    const { data: outcome, error } = await supabase
      .from('user_outcomes')
      .insert({
        user_id: DEFAULT_USER_ID,
        direction: 'increase',
        object_text: 'monthly recurring revenue',
        metric_text: '25% within 6 months',
        clarifier: 'enterprise customer acquisition',
        assembled_text:
          'Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition',
        is_active: true,
      })
      .select()
      .single();

    if (error || !outcome) {
      throw error ?? new Error('Failed to create test outcome');
    }

    const response = await fetch(`${API_BASE}/api/agent/prioritize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outcome_id: outcome.id,
        user_id: DEFAULT_USER_ID,
      }),
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session_id).toBeDefined();
    expect(data.status).toBe('running');
    expect(data.prioritized_plan).toBeNull();
    expect(data.execution_metadata).toEqual(
      expect.objectContaining({
        steps_taken: 0,
        total_time_ms: expect.any(Number),
        error_count: expect.any(Number),
      })
    );

    const { data: dbSession } = await supabase
      .from('agent_sessions')
      .select('*')
      .eq('id', data.session_id)
      .maybeSingle();

    expect(dbSession).toBeTruthy();
    expect(dbSession?.status).toBe('running');
    expect(dbSession?.outcome_id).toBe(outcome.id);
  });
});

