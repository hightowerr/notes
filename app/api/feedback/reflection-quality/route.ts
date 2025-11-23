import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const supabase = getSupabaseAdminClient();

const feedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  session_id: z.string().uuid().optional(),
  comment: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    console.warn('[Reflection Feedback API] Invalid JSON payload', error);
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const parsed = feedbackSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_INPUT', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { rating, session_id: sessionId, comment } = parsed.data;

  const { error } = await supabase.from('processing_logs').insert({
    operation: 'reflection_quality_feedback',
    status: 'completed',
    timestamp: now,
    metadata: {
      rating,
      session_id: sessionId ?? null,
      comment: comment ?? null,
      source: 'priorities_page',
    },
  });

  if (error) {
    console.error('[Reflection Feedback API] Failed to store feedback', error);
    return NextResponse.json(
      { error: 'DATABASE_ERROR', message: 'Failed to store feedback' },
      { status: 500 }
    );
  }

  return NextResponse.json({ received_at: now }, { status: 200 });
}
