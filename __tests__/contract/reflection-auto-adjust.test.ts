import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import type { ReflectionEffect } from '@/lib/services/reflectionAdjuster';

const mockReflection: ReflectionWithWeight = {
  id: '00000000-0000-4000-8000-000000000099',
  user_id: 'user-123',
  text: 'Legal blocked outreach',
  created_at: new Date().toISOString(),
  weight: 1,
  relative_time: 'just now',
  recency_weight: 1,
  is_active_for_prioritization: true,
};

const mockIntent = {
  type: 'constraint',
  subtype: 'blocker',
  keywords: ['legal', 'outreach'],
  strength: 'hard',
  duration: null,
  summary: 'Blocks outreach tasks until legal approves',
};

const mockEffects: ReflectionEffect[] = [
  {
    reflection_id: mockReflection.id,
    task_id: '00000000-0000-4000-8000-000000000201',
    effect: 'blocked',
    magnitude: -10,
    reason: 'Blocked by reflection context',
  },
];

const interpretReflection = vi.fn(async () => ({
  intent: mockIntent,
  latencyMs: 42,
}));

const applyReflectionEffects = vi.fn(async () => ({
  effects: mockEffects,
  tasksAffected: 1,
}));

const createReflection = vi.fn(async () => mockReflection);

const upsert = vi.fn(() => ({
  select: () => ({
    maybeSingle: async () => ({ data: { id: 'intent-1' }, error: null }),
  }),
}));

const reflectionsEq = vi.fn(async () => ({ count: 1, data: null, error: null }));

const outcomeMaybeSingle = vi.fn(async () => ({ data: { id: 'outcome-1' }, error: null }));
const outcomeEq = vi.fn(() => ({ eq: () => ({ maybeSingle: outcomeMaybeSingle }) }));
const outcomeSelect = vi.fn(() => ({ eq: outcomeEq }));

vi.mock('@/app/api/reflections/utils', () => ({
  getAuthenticatedUserId: vi.fn(async () => 'user-123'),
}));

vi.mock('@/lib/services/reflectionInterpreter', () => ({
  interpretReflection,
}));

vi.mock('@/lib/services/reflectionAdjuster', () => ({
  applyReflectionEffects,
}));

vi.mock('@/lib/services/reflectionService', () => ({
  createReflection,
  fetchRecentReflections: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'user_outcomes') {
        return {
          select: outcomeSelect,
        };
      }
      if (table === 'reflection_intents') {
        return {
          upsert,
        };
      }
      if (table === 'reflections') {
        return {
          select: () => ({
            eq: reflectionsEq,
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
      };
    },
  }),
}));

let POST: typeof import('@/app/api/reflections/route')['POST'];

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  ({ POST } = await import('@/app/api/reflections/route'));
});

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/reflections', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/reflections (auto-adjust)', () => {
  it('creates reflection, interprets intent, applies effects, and returns combined payload', async () => {
    const response = await POST(buildRequest({ text: mockReflection.text }));

    expect(response.status).toBe(201);
    const payload = await response.json();

    expect(payload.reflection).toMatchObject({ id: mockReflection.id, text: mockReflection.text });
    expect(payload.intent).toMatchObject({ type: mockIntent.type, subtype: mockIntent.subtype });
    expect(payload.effects).toEqual(mockEffects);
    expect(payload.tasks_affected).toBe(1);
    expect(typeof payload.latency_ms).toBe('number');
    expect(interpretReflection).toHaveBeenCalledWith(mockReflection.text);
    expect(applyReflectionEffects).toHaveBeenCalledWith([mockReflection.id]);
    expect(createReflection).toHaveBeenCalledWith('user-123', mockReflection.text);
    expect(upsert).toHaveBeenCalled();
  });

  it('rejects invalid payloads', async () => {
    const response = await POST(buildRequest({ text: 'short' }));
    expect(response.status).toBe(400);
  });
});
