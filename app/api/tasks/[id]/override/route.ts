import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ManualOverrideInputSchema, ManualOverrideSchema } from '@/lib/schemas/manualOverride';
import { StrategicScoresMapSchema } from '@/lib/schemas/strategicScore';
import { calculatePriority } from '@/lib/utils/strategicPriority';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const supabase = getSupabaseAdminClient();
const DEFAULT_USER_ID = 'default-user';

type RouteContext = {
  params: {
    id?: string;
  };
};

function buildErrorResponse(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const taskId = context.params?.id;
  if (!taskId) {
    return buildErrorResponse(400, {
      error: 'INVALID_TASK_ID',
      message: 'Task identifier is required',
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.warn('[Manual Override API] Invalid JSON payload', error);
    return buildErrorResponse(400, {
      error: 'INVALID_INPUT',
      message: 'Request body must be valid JSON',
    });
  }

  const parsed = ManualOverrideInputSchema.safeParse({ task_id: taskId, ...body });
  if (!parsed.success) {
    return buildErrorResponse(400, {
      error: 'INVALID_INPUT',
      details: parsed.error.flatten(),
    });
  }

  const hasImpactField = Object.prototype.hasOwnProperty.call(parsed.data, 'impact');
  const hasEffortField = Object.prototype.hasOwnProperty.call(parsed.data, 'effort');
  const hasReasonField = Object.prototype.hasOwnProperty.call(parsed.data, 'reason');
  const { impact, effort, reason } = parsed.data;

  try {
    const { data: taskRecord, error: taskError } = await supabase
      .from('task_embeddings')
      .select('task_id, manual_overrides')
      .eq('task_id', taskId)
      .maybeSingle();

    if (taskError) {
      console.error('[Manual Override API] Failed to load task', taskError);
      return buildErrorResponse(500, {
        error: 'DATABASE_ERROR',
        message: 'Failed to load task for override',
      });
    }

    if (!taskRecord) {
      return buildErrorResponse(404, {
        error: 'TASK_NOT_FOUND',
        message: 'Task not found',
      });
    }

    const { data: session, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('id, strategic_scores')
      .eq('user_id', DEFAULT_USER_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      console.error('[Manual Override API] Failed to load session', sessionError);
      return buildErrorResponse(500, {
        error: 'DATABASE_ERROR',
        message: 'Failed to load prioritization session',
      });
    }

    if (!session || typeof session.id !== 'string') {
      return buildErrorResponse(409, {
        error: 'SESSION_REQUIRED',
        message: 'Run prioritization before applying overrides',
      });
    }

    const strategicScoresResult = StrategicScoresMapSchema.safeParse(session.strategic_scores ?? {});
    const strategicScores = strategicScoresResult.success ? strategicScoresResult.data : {};
    const aiScore = strategicScores[taskId];

    if (!aiScore) {
      return buildErrorResponse(409, {
        error: 'SCORES_UNAVAILABLE',
        message: 'Strategic scores are required before overrides can be applied',
      });
    }

    const existingOverrideResult = ManualOverrideSchema.safeParse(taskRecord.manual_overrides ?? null);
    const existingOverride = existingOverrideResult.success ? existingOverrideResult.data : null;

    const resolvedImpact =
      hasImpactField && typeof impact === 'number'
        ? impact
        : existingOverride?.impact ?? aiScore.impact;
    const resolvedEffort =
      hasEffortField && typeof effort === 'number'
        ? effort
        : existingOverride?.effort ?? aiScore.effort;

    if (typeof resolvedImpact !== 'number' || typeof resolvedEffort !== 'number') {
      return buildErrorResponse(422, {
        error: 'MISSING_BASELINE_SCORES',
        message: 'Unable to determine baseline impact/effort for override',
      });
    }

    let resolvedReason: string | undefined = existingOverride?.reason;
    if (hasReasonField) {
      resolvedReason = typeof reason === 'string' && reason.length > 0 ? reason : undefined;
    }

    const now = new Date().toISOString();
    const overridePayload = ManualOverrideSchema.parse({
      impact: resolvedImpact,
      effort: resolvedEffort,
      reason: resolvedReason,
      timestamp: now,
      session_id: session.id,
    });

    const { data: sessionStillCurrent, error: sessionCheckError } = await supabase
      .from('agent_sessions')
      .select('id')
      .eq('id', session.id)
      .maybeSingle();

    if (sessionCheckError) {
      console.error('[Manual Override API] Failed to verify session state', sessionCheckError);
      return buildErrorResponse(500, {
        error: 'DATABASE_ERROR',
        message: 'Failed to verify prioritization session',
      });
    }

    if (!sessionStillCurrent) {
      return buildErrorResponse(409, {
        error: 'SESSION_CHANGED',
        message: 'Prioritization restarted. Please wait for the new results before overriding scores.',
      });
    }

    const { error: updateError } = await supabase
      .from('task_embeddings')
      .update({ manual_overrides: overridePayload })
      .eq('task_id', taskId);

    if (updateError) {
      console.error('[Manual Override API] Failed to persist override', updateError);
      return buildErrorResponse(500, {
        error: 'DATABASE_ERROR',
        message: 'Failed to persist manual override',
      });
    }

    const updatedPriority = calculatePriority(
      overridePayload.impact,
      overridePayload.effort,
      aiScore.confidence
    );

    await supabase.from('processing_logs').insert({
      operation: 'manual_override',
      status: 'completed',
      timestamp: now,
      metadata: {
        session_id: session.id,
        task_id: taskId,
        override_type: 'manual_score_change',
        original_decision: {
          impact: aiScore.impact,
          effort: aiScore.effort,
          confidence: aiScore.confidence,
        },
        user_decision: {
          impact: overridePayload.impact,
          effort: overridePayload.effort,
          confidence: aiScore.confidence,
          reason: overridePayload.reason ?? null,
        },
      },
    });

    return NextResponse.json(
      {
        task_id: taskId,
        override: overridePayload,
        updated_priority: updatedPriority,
        has_manual_override: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Manual Override API] Unexpected error', error);
    return buildErrorResponse(500, {
      error: 'INTERNAL_ERROR',
      message: 'Unexpected error applying override',
    });
  }
}
