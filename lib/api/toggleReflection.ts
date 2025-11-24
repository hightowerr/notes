'use client';

import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';

export async function toggleReflection(
  reflectionId: string,
  isActive: boolean
): Promise<ReflectionWithWeight> {
  const response = await fetch(`/api/reflections/${reflectionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_active: isActive,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const message =
      typeof errorPayload?.message === 'string'
        ? errorPayload.message
        : 'Failed to update reflection';
    throw new Error(message);
  }

  const payload = await response.json();

  if (!payload?.reflection) {
    throw new Error('Missing reflection in response');
  }

  return payload.reflection as ReflectionWithWeight;
}
