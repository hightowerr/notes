/**
 * Contract Tests: GET /api/reflections (recency extensions)
 * Ensures recency weights and toggle state are exposed for context-aware reprioritization.
 *
 * NOTE: Endpoint currently lacks these fields, so tests will fail until implemented.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const API_BASE = 'http://localhost:3000';
const TEST_USER_ID = 'contract-recency-user';

async function clearReflections() {
  await supabase.from('reflections').delete().eq('user_id', TEST_USER_ID);
}

async function addReflection(text: string, daysAgo: number, isActive: boolean) {
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('reflections')
    .insert({
      user_id: TEST_USER_ID,
      text,
      created_at: createdAt,
    })
    .select()
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to insert test reflection');
  }

  if (!isActive) {
    const { error: toggleError } = await supabase
      .from('reflections')
      .update({ is_active_for_prioritization: false })
      .eq('id', data.id);

    if (toggleError) {
      throw new Error(
        `Failed to toggle reflection state. Ensure migration 015_add_reflection_toggle.sql is applied. ${toggleError.message}`,
      );
    }
  }
}

describe('GET /api/reflections?limit=5&within_days=30', () => {
  beforeAll(async () => {
    await clearReflections();
  });

  afterAll(async () => {
    await clearReflections();
  });

  it('returns recency weights and toggle state for recent reflections', async () => {
    await clearReflections();
    await addReflection('Launched beta yesterday', 1, true);   // Expected weight 1.0
    await addReflection('Design sprint ended last week', 10, true); // Expected weight 0.5
    await addReflection('Post-launch retrospective from earlier this month', 20, false); // Expected weight 0.25

    const response = await fetch(`${API_BASE}/api/reflections?limit=5&within_days=30`);

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(Array.isArray(payload.reflections)).toBe(true);
    expect(payload.reflections.length).toBeGreaterThanOrEqual(3);

    const byText = new Map<string, any>();
    for (const reflection of payload.reflections) {
      byText.set(reflection.text, reflection);
    }

    const fresh = byText.get('Launched beta yesterday');
    const weekOld = byText.get('Design sprint ended last week');
    const stale = byText.get('Post-launch retrospective from earlier this month');

    expect(fresh).toBeDefined();
    expect(fresh.recency_weight).toBe(1.0);
    expect(fresh.is_active_for_prioritization).toBe(true);

    expect(weekOld).toBeDefined();
    expect(weekOld.recency_weight).toBe(0.5);
    expect(weekOld.is_active_for_prioritization).toBe(true);

    expect(stale).toBeDefined();
    expect(stale.recency_weight).toBe(0.25);
    expect(stale.is_active_for_prioritization).toBe(false);
  });
});
