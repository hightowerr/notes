import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { agentMockTables, resetAgentMockTables } from '../mocks/agentSupabaseMock';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-key';

let POST: typeof import('@/app/api/feedback/reflection-quality/route')['POST'];

beforeAll(async () => {
  ({ POST } = await import('@/app/api/feedback/reflection-quality/route'));
});

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/feedback/reflection-quality', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/feedback/reflection-quality', () => {
  beforeEach(() => {
    resetAgentMockTables();
  });

  it('stores feedback in processing_logs', async () => {
    const response = await POST(
      buildRequest({
        rating: 'up',
        session_id: '11111111-1111-4111-8111-111111111111',
        comment: 'Reflections were accurate',
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.received_at).toBeDefined();

    const logEntry = agentMockTables.processing_logs.find(
      entry => entry.operation === 'reflection_quality_feedback'
    );
    expect(logEntry?.metadata).toMatchObject({
      rating: 'up',
      session_id: '11111111-1111-4111-8111-111111111111',
      comment: 'Reflections were accurate',
      source: 'priorities_page',
    });
  });

  it('rejects invalid payloads', async () => {
    const response = await POST(buildRequest({ rating: 'maybe' }));
    expect(response.status).toBe(400);
  });
});
