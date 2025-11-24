import { performance } from 'node:perf_hooks';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { buildAdjustedPlanFromReflections } from '@/lib/services/reflectionAdjustment';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables for adjustment endpoint');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const requestSchema = z.object({
  session_id: z.string().uuid(),
  active_reflection_ids: z.array(z.string().uuid()).max(50),
});

function parseBaselineCreatedAt(
  baselinePlan: z.infer<typeof prioritizedPlanSchema>,
  fallback: string | null
): Date | null {
  const candidate = typeof baselinePlan.created_at === 'string' ? baselinePlan.created_at : fallback;
  if (!candidate) {
    return null;
  }

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const HOURS_24_MS = 24 * 60 * 60 * 1000;
const DAYS_7_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const totalStart = performance.now();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request parameters' },
      { status: 400 }
    );
  }

  const { session_id: sessionId, active_reflection_ids: activeReflectionIds } = parsed.data;

  const { data: session, error: sessionError } = await supabase
    .from('agent_sessions')
    .select('id, user_id, baseline_plan, updated_at, created_at')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error('[AdjustPriorities] Failed to load agent session', sessionError);
    return NextResponse.json(
      { error: 'Failed to load agent session' },
      { status: 500 }
    );
  }

  if (!session) {
    return NextResponse.json(
      { error: 'Session not found' },
      { status: 400 }
    );
  }

  const baselineResult = prioritizedPlanSchema.safeParse(session.baseline_plan);
  if (!baselineResult.success) {
    console.error('[AdjustPriorities] Baseline plan failed validation', baselineResult.error.flatten());
    return NextResponse.json(
      { error: 'Baseline plan not found. Run analysis first.' },
      { status: 400 }
    );
  }

  const baselinePlan = baselineResult.data;
  const baselineCreatedAt = parseBaselineCreatedAt(
    baselinePlan,
    typeof session.updated_at === 'string' ? session.updated_at : session.created_at ?? null
  );

  const now = Date.now();
  const ageMs =
    baselineCreatedAt && Number.isFinite(baselineCreatedAt.getTime())
      ? now - baselineCreatedAt.getTime()
      : 0;

  if (ageMs > DAYS_7_MS) {
    return NextResponse.json(
      { error: 'Baseline plan too old (>7 days). Run full analysis.' },
      { status: 400 }
    );
  }

  const warnings: string[] = [];
  if (ageMs > HOURS_24_MS) {
    warnings.push('Baseline plan older than 24 hours. Consider running a fresh analysis soon.');
  }

  try {
    const { adjustedPlan, rankingMs } = await buildAdjustedPlanFromReflections({
      userId: session.user_id,
      baselinePlan,
      activeReflectionIds,
    });

    const updatePayload = {
      adjusted_plan: adjustedPlan,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('agent_sessions')
      .update(updatePayload)
      .eq('id', sessionId);

    if (updateError) {
      console.error('[AdjustPriorities] Failed to persist adjusted plan', updateError);
      return NextResponse.json(
        { error: 'Failed to store adjusted plan' },
        { status: 500 }
      );
    }

    const totalMs = performance.now() - totalStart;
    const roundedTotalMs = Math.max(0, Math.round(totalMs));
    const roundedRankingMs = Math.max(0, Math.round(rankingMs));

    const responsePayload: Record<string, unknown> = {
      adjusted_plan: adjustedPlan,
      performance: {
        total_ms: roundedTotalMs,
        ranking_ms: roundedRankingMs,
      },
    };

    if (warnings.length > 0) {
      responsePayload.warnings = warnings;
    }

    if (baselineCreatedAt) {
      responsePayload.baseline_created_at = baselineCreatedAt.toISOString();
    }

    const tasksMoved = Array.isArray(adjustedPlan.diff?.moved) ? adjustedPlan.diff.moved.length : 0;

    console.log(
      JSON.stringify({
        event: 'context_adjustment_completed',
        timestamp: new Date().toISOString(),
        session_id: sessionId,
        user_id: session.user_id,
        reflections_used: activeReflectionIds.length,
        tasks_moved: tasksMoved,
        total_ms: roundedTotalMs,
        ranking_ms: roundedRankingMs,
        warnings,
      })
    );

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('[AdjustPriorities] Failed to build adjusted plan', error);
    return NextResponse.json(
      { error: 'Failed to adjust priorities' },
      { status: 500 }
    );
  }
}
