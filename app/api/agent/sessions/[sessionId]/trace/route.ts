import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { reasoningTraceSchema } from '@/lib/schemas/reasoningTraceSchema';
import { reasoningStepSchema } from '@/lib/schemas/reasoningStepSchema';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

type RouteParams = {
  sessionId: string;
};

export async function GET(_: Request, { params }: { params: Promise<RouteParams> }) {
  const { sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'sessionId is required' },
      { status: 400 }
    );
  }

  try {
    const { data: trace, error } = await supabase
      .from('reasoning_traces')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[ReasoningTrace API] Failed to fetch reasoning trace:', error);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to fetch reasoning trace' },
        { status: 500 }
      );
    }

    if (!trace) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Trace not found or expired (older than 7 days)' },
        { status: 404 }
      );
    }

    const parsedSteps = Array.isArray(trace.steps) ? trace.steps : [];
    const validatedSteps = [];

    for (const step of parsedSteps) {
      const validation = reasoningStepSchema.safeParse(step);
      if (!validation.success) {
        console.error('[ReasoningTrace API] Invalid reasoning step payload', validation.error.flatten());
        return NextResponse.json(
          { error: 'INVALID_TRACE', message: 'Reasoning trace contains invalid steps' },
          { status: 500 }
        );
      }
      validatedSteps.push(validation.data);
    }

    let createdAtIso: string | undefined;
    if (typeof trace.created_at === 'string') {
      const parsedDate = new Date(trace.created_at);
      if (!Number.isNaN(parsedDate.getTime())) {
        createdAtIso = parsedDate.toISOString();
      } else {
        console.warn('[ReasoningTrace API] Unable to convert created_at to ISO string', trace.created_at);
      }
    }

    const validation = reasoningTraceSchema.safeParse({
      session_id: trace.session_id,
      steps: validatedSteps,
      total_duration_ms: trace.total_duration_ms,
      total_steps: trace.total_steps,
      tools_used_count:
        trace.tools_used_count && typeof trace.tools_used_count === 'object'
          ? (trace.tools_used_count as Record<string, number>)
          : {},
      created_at: createdAtIso,
    });

    if (!validation.success) {
      console.error('[ReasoningTrace API] Invalid reasoning trace payload', validation.error.flatten());
      return NextResponse.json(
        { error: 'INVALID_TRACE', message: 'Reasoning trace is malformed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ trace: validation.data }, { status: 200 });
  } catch (err) {
    console.error('[ReasoningTrace API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Unexpected error fetching reasoning trace' },
      { status: 500 }
    );
  }
}
