import { performance } from 'node:perf_hooks';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { interpretReflection } from '@/lib/services/reflectionInterpreter';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const requestSchema = z.object({
  text: z.string().min(3).max(500),
  reflection_id: z.string().uuid().optional(),
});

const supabaseAdmin = getSupabaseAdminClient();

export async function POST(request: NextRequest) {
  const start = performance.now();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { text, reflection_id: reflectionId } = parsed.data;
  const { intent, latencyMs: interpreterLatency } = await interpretReflection(text);
  const totalLatencyMs = Math.max(0, Math.round(performance.now() - start));

  let persisted = false;
  if (reflectionId) {
    const { error } = await supabaseAdmin
      .from('reflection_intents')
      .upsert({
        reflection_id: reflectionId,
        type: intent.type,
        subtype: intent.subtype,
        keywords: intent.keywords ?? [],
        strength: intent.strength,
        duration: intent.duration ?? null,
        summary: intent.summary,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[ReflectionInterpret] Failed to persist intent', {
        reflectionId,
        error: error.message,
      });
    } else {
      persisted = true;
    }
  }

  return NextResponse.json({
    intent,
    persisted,
    latency_ms: totalLatencyMs,
    interpreter_latency_ms: interpreterLatency,
  });
}
