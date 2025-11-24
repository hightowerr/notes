/**
 * Contract Tests: PATCH /api/reflections/[id]
 * Validates schema, persistence, and error handling for reflection toggles.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const API_BASE = 'http://localhost:3000';
const TEST_USER_ID = 'anonymous-user-p0';

async function clearReflections() {
  await supabase.from('reflections').delete().eq('user_id', TEST_USER_ID);
}

async function seedReflection(text: string) {
  const { data, error } = await supabase
    .from('reflections')
    .insert({
      id: randomUUID(),
      user_id: TEST_USER_ID,
      text,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw error ?? new Error('Failed to insert test reflection');
  }

  return data;
}

describe('PATCH /api/reflections/[id]', () => {
  beforeAll(async () => {
    await clearReflections();
  });

  afterAll(async () => {
    await clearReflections();
  });

  it('returns 400 when request body fails validation', async () => {
    const response = await fetch(`${API_BASE}/api/reflections/${randomUUID()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const contentType = response.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    const payload = await response.json();
    expect(payload).toHaveProperty('error');
    expect(payload.error).toMatch(/Validation/i);
  });

  it('toggles the reflection state and persists it', async () => {
    const reflection = await seedReflection('Ship better onboarding before launch week.');

    const toggleResponse = await fetch(`${API_BASE}/api/reflections/${reflection.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });

    expect(toggleResponse.status).toBe(200);
    const contentType = toggleResponse.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    const payload = await toggleResponse.json();

    expect(payload).toEqual(
      expect.objectContaining({
        success: true,
        reflection: expect.objectContaining({
          id: reflection.id,
          is_active_for_prioritization: false,
        }),
      }),
    );

    const { data: dbReflection } = await supabase
      .from('reflections')
      .select('id, is_active_for_prioritization')
      .eq('id', reflection.id)
      .maybeSingle();

    expect(dbReflection).toBeTruthy();
    expect(dbReflection?.is_active_for_prioritization).toBe(false);
  });

  it('returns 404 when the reflection does not exist', async () => {
    const response = await fetch(`${API_BASE}/api/reflections/${randomUUID()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    });

    expect(response.status).toBe(404);
    const contentType = response.headers.get('content-type') ?? '';
    expect(contentType).toContain('application/json');
    const payload = await response.json();
    expect(payload).toHaveProperty('error');
    expect(payload.error).toMatch(/not found/i);
  });
});
