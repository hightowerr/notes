import { describe, it, expect, beforeAll, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockIntent = {
  type: 'constraint',
  subtype: 'blocker',
  keywords: ['legal', 'outreach'],
  strength: 'hard',
  duration: null,
  summary: 'Blocks outreach tasks until legal approves',
} as const;

const interpretReflection = vi.fn(async () => ({
  intent: mockIntent,
  latencyMs: 42,
}));

vi.mock('@/lib/services/reflectionInterpreter', () => ({
  interpretReflection,
}));

const upsertResult = { data: { id: 'intent-1' }, error: null };
const upsert = vi.fn(() => ({
  select: () => ({
    maybeSingle: async () => upsertResult,
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      upsert,
    }),
  }),
}));

let POST: typeof import('@/app/api/reflections/interpret/route')['POST'];

beforeAll(async () => {
  ({ POST } = await import('@/app/api/reflections/interpret/route'));
});

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/reflections/interpret', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/reflections/interpret', () => {
  it('returns structured intent with latency_ms under 200ms and persists when reflection_id provided', async () => {
    const response = await POST(
      buildRequest({
        text: 'Legal blocked outreach',
        reflection_id: '00000000-0000-4000-8000-000000000001',
      })
    );
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.intent).toMatchObject({
      type: mockIntent.type,
      subtype: mockIntent.subtype,
      summary: mockIntent.summary,
    });
    expect(typeof payload.latency_ms).toBe('number');
    // Note: latency check validates plumbing; real 200ms target requires live API tests
    expect(payload.latency_ms).toBeLessThan(200);
    expect(payload.persisted).toBe(true);
    expect(interpretReflection).toHaveBeenCalledWith('Legal blocked outreach');
    expect(upsert).toHaveBeenCalled();
  });

  it('rejects invalid payloads', async () => {
    const response = await POST(buildRequest({ text: 'ok' })); // too short
    expect(response.status).toBe(400);
  });
});
