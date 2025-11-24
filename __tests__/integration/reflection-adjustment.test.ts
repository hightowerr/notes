import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

import type { ReflectionEffect } from '@/lib/services/reflectionAdjuster';

const mockEffects: ReflectionEffect[] = [
  {
    reflection_id: '00000000-0000-4000-8000-000000000001',
    task_id: '00000000-0000-4000-8000-000000000101',
    effect: 'boosted',
    magnitude: 2,
    reason: 'Matches reflection focus',
  },
];

const applyReflectionEffects = vi.fn(async () => ({
  effects: mockEffects,
  tasksAffected: 1,
}));

vi.mock('@/lib/services/reflectionAdjuster', () => ({
  applyReflectionEffects,
}));

let POST: typeof import('@/app/api/reflections/adjust/route')['POST'];

beforeEach(async () => {
  ({ POST } = await import('@/app/api/reflections/adjust/route'));
  applyReflectionEffects.mockClear();
});

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/reflections/adjust', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/reflections/adjust', () => {
  it('returns effects and tasks_affected from adjuster', async () => {
    const response = await POST(
      buildRequest({
        reflection_ids: ['00000000-0000-4000-8000-000000000001'],
        task_ids: ['00000000-0000-4000-8000-000000000101'],
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.effects).toEqual(mockEffects);
    expect(payload.tasks_affected).toBe(1);
    expect(applyReflectionEffects).toHaveBeenCalledWith(
      ['00000000-0000-4000-8000-000000000001'],
      ['00000000-0000-4000-8000-000000000101']
    );
  });

  it('handles zero-match scenario', async () => {
    applyReflectionEffects.mockResolvedValueOnce({
      effects: [],
      tasksAffected: 0,
      message: 'No tasks matched this reflection',
    });

    const response = await POST(
      buildRequest({
        reflection_ids: ['00000000-0000-4000-8000-000000000001'],
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.effects).toEqual([]);
    expect(payload.tasks_affected).toBe(0);
    expect(payload.message).toMatch(/No tasks matched/i);
  });

  it('rejects invalid payload', async () => {
    const response = await POST(buildRequest({ reflection_ids: [] }));
    expect(response.status).toBe(400);
  });
});
