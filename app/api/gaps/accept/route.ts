import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { bridgingTaskSchema } from '@/lib/schemas/bridgingTaskSchema';
import {
  insertBridgingTasks,
  TaskInsertionError,
} from '@/lib/services/taskInsertionService';
import { supabase } from '@/lib/supabase';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import { parsePlanFromAgentResponse } from '@/lib/mastra/services/resultParser';
import {
  GapAnalysisSessionSchema,
  type GapAnalysisSession,
} from '@/lib/schemas/gapAnalysis';
import {
  integrateAcceptedTasksIntoPlan,
  type AcceptedSuggestionForPlan,
} from '@/lib/services/planIntegration';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';

const acceptedTaskSchema = z.object({
  task: bridgingTaskSchema,
  predecessor_id: z.string().min(1),
  successor_id: z.string().min(1),
});

const requestSchema = z.object({
  analysis_session_id: z.string().uuid(),
  agent_session_id: z.string().uuid(),
  accepted_tasks: z.array(acceptedTaskSchema).min(1).max(9),
});

type AcceptedTaskInput = z.infer<typeof acceptedTaskSchema>;

type LoadedSessionContext = {
  plan: PrioritizedTaskPlan;
  result: Record<string, unknown>;
  gapAnalysis: GapAnalysisSession;
};

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function loadSessionContext(
  agentSessionId: string,
  analysisSessionId: string
): Promise<LoadedSessionContext | NextResponse> {
  const { data: session, error } = await supabase
    .from('agent_sessions')
    .select('id, prioritized_plan, result')
    .eq('id', agentSessionId)
    .maybeSingle();

  if (error) {
    console.error('[GapAcceptance] Failed to load agent session', error);
    return NextResponse.json(
      { error: 'Failed to load agent session', code: 'SESSION_LOAD_FAILED' },
      { status: 500 }
    );
  }

  if (!session) {
    return NextResponse.json(
      { error: 'Agent session not found', code: 'SESSION_NOT_FOUND' },
      { status: 404 }
    );
  }

  if (!session.prioritized_plan) {
    return NextResponse.json(
      {
        error: 'Session is missing prioritized plan. Run prioritization before accepting tasks.',
        code: 'PLAN_MISSING',
      },
      { status: 409 }
    );
  }

  let planCandidate: unknown = session.prioritized_plan;
  if (typeof planCandidate === 'string') {
    const parsedPlan = parsePlanFromAgentResponse(planCandidate);
    if (parsedPlan.success) {
      planCandidate = parsedPlan.plan;
    } else {
      planCandidate = parseJson(planCandidate);
    }
  }

  const planResult = prioritizedPlanSchema.safeParse(planCandidate);
  if (!planResult.success) {
    console.error(
      '[GapAcceptance] Prioritized plan validation failed',
      planResult.error.flatten()
    );
    return NextResponse.json(
      {
        error: 'Stored prioritized plan failed validation',
        code: 'PLAN_INVALID',
        details: planResult.error.flatten(),
      },
      { status: 422 }
    );
  }

  let normalizedResult: unknown = parseJson(session.result ?? {});
  if (
    !normalizedResult ||
    typeof normalizedResult !== 'object' ||
    Array.isArray(normalizedResult)
  ) {
    normalizedResult = {};
  }

  const gapAnalysisRaw = (normalizedResult as Record<string, unknown>).gap_analysis;
  if (!gapAnalysisRaw || typeof gapAnalysisRaw !== 'object') {
    return NextResponse.json(
      {
        error: 'Gap analysis session not found. Generate suggestions before accepting tasks.',
        code: 'GAP_SESSION_MISSING',
      },
      { status: 404 }
    );
  }

  const gapAnalysisResult = GapAnalysisSessionSchema.safeParse(gapAnalysisRaw);
  if (!gapAnalysisResult.success) {
    console.error(
      '[GapAcceptance] Gap analysis session failed validation',
      gapAnalysisResult.error.flatten()
    );
    return NextResponse.json(
      {
        error: 'Stored gap analysis session is invalid',
        code: 'GAP_SESSION_INVALID',
        details: gapAnalysisResult.error.flatten(),
      },
      { status: 422 }
    );
  }

  const gapAnalysis = gapAnalysisResult.data;
  if (gapAnalysis.session_id !== analysisSessionId) {
    return NextResponse.json(
      {
        error: 'Gap analysis session mismatch. Refresh suggestions and try again.',
        code: 'GAP_SESSION_MISMATCH',
      },
      { status: 409 }
    );
  }

  return {
    plan: planResult.data,
    result: normalizedResult as Record<string, unknown>,
    gapAnalysis,
  };
}

function buildAcceptancePayloads(acceptedTasks: AcceptedTaskInput[]) {
  const acceptedForPlan: AcceptedSuggestionForPlan[] = [];
  const acceptanceLogs: GapAnalysisSession['user_acceptances'] = [];
  const acceptedTaskIds: string[] = [];

  for (const input of acceptedTasks) {
    const originalTrimmed = input.task.task_text.trim();
    const editedTrimmed = input.task.edited_task_text?.trim();
    const finalText =
      editedTrimmed && editedTrimmed.length > 0 ? editedTrimmed : originalTrimmed;
    const finalHours =
      typeof input.task.edited_estimated_hours === 'number'
        ? input.task.edited_estimated_hours
        : input.task.estimated_hours;

    const edited =
      (editedTrimmed && editedTrimmed.length > 0 && editedTrimmed !== originalTrimmed) ||
      (typeof input.task.edited_estimated_hours === 'number' &&
        input.task.edited_estimated_hours !== input.task.estimated_hours);

    acceptedTaskIds.push(input.task.id);

    acceptedForPlan.push({
      task: input.task,
      gap: {
        predecessor_task_id: input.predecessor_id,
        successor_task_id: input.successor_id,
      },
      finalText,
      finalHours,
    });

    acceptanceLogs.push({
      task_id: input.task.id,
      accepted: true,
      edited,
      final_text: finalText,
      final_hours: finalHours,
    });
  }

  return { acceptedForPlan, acceptanceLogs, acceptedTaskIds };
}

function mergeAcceptances(
  existing: GapAnalysisSession['user_acceptances'],
  incoming: GapAnalysisSession['user_acceptances'],
  acceptedTaskIds: string[]
) {
  const filteredExisting = existing.filter(
    entry => !acceptedTaskIds.includes(entry.task_id)
  );
  return [...filteredExisting, ...incoming];
}

async function persistGapAnalysisResult(
  sessionId: string,
  resultPayload: Record<string, unknown>,
  plan?: PrioritizedTaskPlan
) {
  const update: Record<string, unknown> = { result: resultPayload };
  if (plan) {
    update.prioritized_plan = plan;
  }

  const { error } = await supabase.from('agent_sessions').update(update).eq('id', sessionId);
  if (error) {
    throw Object.assign(new Error('Failed to update agent session'), {
      code: 'SESSION_UPDATE_FAILED',
      details: error.message,
    });
  }
}

async function rollbackInsertedTasks(taskIds: string[]) {
  if (taskIds.length === 0) {
    return;
  }

  try {
    await supabase.from('task_relationships').delete().in('source_task_id', taskIds);
    await supabase.from('task_relationships').delete().in('target_task_id', taskIds);
    await supabase.from('task_embeddings').delete().in('task_id', taskIds);
  } catch (error) {
    console.error('[GapAcceptance] Failed to rollback inserted tasks', error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: 'Invalid JSON payload',
        code: 'INVALID_BODY',
      },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        code: 'INVALID_ACCEPTED_TASKS',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const { analysis_session_id, agent_session_id, accepted_tasks } = parsed.data;

  const context = await loadSessionContext(agent_session_id, analysis_session_id);
  if (context instanceof NextResponse) {
    return context;
  }

  const { acceptedForPlan, acceptanceLogs, acceptedTaskIds } =
    buildAcceptancePayloads(accepted_tasks);

  let gapAnalysis: GapAnalysisSession = {
    ...context.gapAnalysis,
    user_acceptances: mergeAcceptances(
      context.gapAnalysis.user_acceptances,
      acceptanceLogs,
      acceptedTaskIds
    ),
    insertion_result: {
      success: false,
      inserted_task_ids: [],
      error: null,
    },
  };

  let normalizedResult: Record<string, unknown> = { ...context.result };

  const insertionStart = Date.now();

  try {
    const insertionResult = await insertBridgingTasks(accepted_tasks);

    const updatedPlan = integrateAcceptedTasksIntoPlan(context.plan, acceptedForPlan);
    const insertionDuration = Math.max(0, Date.now() - insertionStart);

    gapAnalysis = {
      ...gapAnalysis,
      insertion_result: {
        success: true,
        inserted_task_ids: insertionResult.task_ids,
        error: null,
      },
      performance_metrics: {
        ...gapAnalysis.performance_metrics,
        total_ms:
          (gapAnalysis.performance_metrics?.detection_ms ?? 0) +
          (gapAnalysis.performance_metrics?.generation_ms ?? 0) +
          insertionDuration,
      },
    };

    normalizedResult = {
      ...normalizedResult,
      gap_analysis: gapAnalysis,
    };

    try {
      await persistGapAnalysisResult(agent_session_id, normalizedResult, updatedPlan);
    } catch (updateError) {
      console.error('[GapAcceptance] Failed to persist session update', updateError);
      await rollbackInsertedTasks(insertionResult.task_ids);

      const message =
        updateError instanceof Error && 'details' in updateError
          ? `${updateError.message}: ${updateError.details}`
          : 'Failed to update agent session.';

      return NextResponse.json(
        { error: message, code: 'SESSION_UPDATE_FAILED' },
        { status: 500 }
      );
    }

    console.log('[GapAcceptance] Inserted bridging tasks', {
      inserted_count: insertionResult.inserted_count,
      relationships_created: insertionResult.relationships_created,
      cycles_resolved: insertionResult.cycles_resolved ?? 0,
    });

    return NextResponse.json(
      {
        ...insertionResult,
        updated_plan: updatedPlan,
        gap_analysis_session_id: gapAnalysis.session_id,
      },
      { status: 201 }
    );
  } catch (error) {
    const basePayload = {
      user_acceptances: gapAnalysis.user_acceptances,
    };

    if (error instanceof TaskInsertionError) {
      gapAnalysis = {
        ...gapAnalysis,
        insertion_result: {
          success: false,
          inserted_task_ids: [],
          error: error.message,
        },
      };

      normalizedResult = {
        ...normalizedResult,
        gap_analysis: gapAnalysis,
      };

      try {
        await persistGapAnalysisResult(agent_session_id, normalizedResult);
      } catch (updateError) {
        console.error(
          '[GapAcceptance] Failed to record insertion failure in session result',
          updateError
        );
      }

      const payload = {
        error: error.message,
        code: error.code,
        validation_errors: error.validationErrors,
        ...basePayload,
      };

      switch (error.code) {
        case 'VALIDATION_ERROR':
          return NextResponse.json(payload, { status: 400 });
        case 'TASK_NOT_FOUND':
          return NextResponse.json(payload, { status: 404 });
        case 'CYCLE_DETECTED':
          return NextResponse.json(payload, { status: 409 });
        case 'DUPLICATE_TASK':
          return NextResponse.json(payload, { status: 422 });
        default:
          return NextResponse.json(payload, { status: 500 });
      }
    }

    console.error('[GapAcceptance] Unexpected error:', error);
    console.error('[GapAcceptance] Error details:', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    gapAnalysis = {
      ...gapAnalysis,
      insertion_result: {
        success: false,
        inserted_task_ids: [],
        error: error instanceof Error ? error.message : 'Task acceptance failed',
      },
    };

    normalizedResult = {
      ...normalizedResult,
      gap_analysis: gapAnalysis,
    };

    try {
      await persistGapAnalysisResult(agent_session_id, normalizedResult);
    } catch (updateError) {
      console.error(
        '[GapAcceptance] Failed to record unexpected error in session result',
        updateError
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Task acceptance failed',
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.stack?.split('\n').slice(0, 3) : undefined,
        ...basePayload,
      },
      { status: 500 }
    );
  }
}
