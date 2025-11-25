import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { orchestrateTaskPriorities } from '@/lib/mastra/services/agentOrchestration';
import { scoreAllTasks } from '@/lib/services/strategicScoring';
import { getQuadrant } from '@/lib/schemas/quadrant';
import type { StrategicScoresMap } from '@/lib/schemas/strategicScore';
import type { TaskDependency, TaskSummary } from '@/lib/types/agent';
import { resetRetryQueue } from '@/lib/services/retryQueue';
import {
  emitPrioritizationHeartbeat,
  subscribeToPrioritizationProgress,
  type PrioritizationStreamEvent,
} from '@/lib/services/prioritizationStream';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_USER_ID = 'default-user';

type TaskEmbeddingRow = {
  task_id: string;
  task_text: string | null;
  document_id: string | null;
  status?: string | null;
  manual_overrides?: boolean | null;
};

type PreparedStrategicData = {
  strategicScores: StrategicScoresMap;
  prioritizedTasks: Array<{
    id: string;
    content: string;
    semantic_similarity: number;
    impact: number;
    effort: number;
    confidence: number;
    priority: number;
    quadrant: ReturnType<typeof getQuadrant>;
  }>;
};

const defaultExecutionMetadata = {
  steps_taken: 0,
  tool_call_count: {},
  thinking_time_ms: 0,
  tool_execution_time_ms: 0,
  total_time_ms: 0,
  error_count: 0,
  success_rate: 0,
  status_note: null,
};

const dependencyOverrideSchema = z.object({
  source_task_id: z.string().min(1),
  target_task_id: z.string().min(1),
  relationship_type: z.enum(['prerequisite', 'blocks', 'related']),
});

const requestSchema = z.object({
  outcome_id: z.string().uuid(),
  user_id: z.string().min(1),
  active_reflection_ids: z.array(z.string().uuid()).max(50).optional(),
  dependency_overrides: z.array(dependencyOverrideSchema).optional(),
  excluded_document_ids: z.array(z.string().uuid()).max(100).optional(),
});

const progressQuerySchema = z.object({
  session_id: z.string().uuid(),
  heartbeat_ms: z.coerce.number().int().min(1000).max(15000).optional(),
});

async function prepareStrategicData(
  sessionId: string,
  outcomeText: string | null,
  excludedDocumentIds: string[] = []
): Promise<PreparedStrategicData> {
  try {
    let query = supabase
      .from('task_embeddings')
      .select('task_id, task_text, document_id, status, manual_overrides')
      .eq('status', 'completed')
      .not('document_id', 'is', null)
      .limit(200);

    if (excludedDocumentIds.length > 0) {
      const exclusionList = `(${excludedDocumentIds.map(id => `'${id}'`).join(',')})`;
      query = query.not('document_id', 'in', exclusionList);
    }

    const { data: taskRows, error } = await query;

    if (error) {
      console.error('[Agent Prioritize API] Failed to load tasks for scoring', error);
      return { strategicScores: {}, prioritizedTasks: [] };
    }

    const tasks: TaskSummary[] = (taskRows ?? [])
      .filter((row): row is TaskEmbeddingRow => typeof row?.task_id === 'string')
      .map(row => ({
        task_id: row.task_id,
        task_text: row.task_text ?? 'Task description unavailable',
        document_id: row.document_id ?? null,
        manual_override: Boolean(row.manual_overrides),
      }));

    if (tasks.length === 0) {
      return { strategicScores: {}, prioritizedTasks: [] };
    }

    const strategicScores = await scoreAllTasks(tasks, outcomeText, {
      sessionId,
    });

    const prioritizedTasks = tasks
      .map(task => {
        const score = strategicScores[task.task_id];
        if (!score) {
          return null;
        }
        return {
          id: task.task_id,
          content: task.task_text,
          semantic_similarity: Number((score.confidence ?? 0.6).toFixed(2)),
          impact: score.impact,
          effort: score.effort,
          confidence: score.confidence,
          priority: score.priority,
          quadrant: getQuadrant(score.impact, score.effort),
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort((a, b) => b.priority - a.priority);

    return { strategicScores, prioritizedTasks };
  } catch (error) {
    console.error('[Agent Prioritize API] Strategic scoring failed', error);
    return { strategicScores: {}, prioritizedTasks: [] };
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'outcome_id and user_id are required' },
        { status: 400 }
      );
    }

    const { outcome_id: outcomeId, user_id: userId } = parsed.data;
    const excludedDocumentIds = parsed.data.excluded_document_ids ?? [];
    const activeReflectionIds = parsed.data.active_reflection_ids ?? [];
    const dependencyOverrideEdges = parsed.data.dependency_overrides ?? [];
    const dependencyOverrides: TaskDependency[] = dependencyOverrideEdges.map(edge => ({
      source_task_id: edge.source_task_id,
      target_task_id: edge.target_task_id,
      relationship_type: edge.relationship_type,
      confidence: 1,
      detection_method: 'stored_relationship',
    }));

    if (userId !== DEFAULT_USER_ID) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Invalid user' },
        { status: 403 }
      );
    }

    const { data: activeOutcome, error: outcomeError } = await supabase
      .from('user_outcomes')
      .select('id, assembled_text')
      .eq('id', outcomeId)
      .eq('user_id', DEFAULT_USER_ID)
      .eq('is_active', true)
      .maybeSingle();

    if (outcomeError) {
      console.error('[Agent Prioritize API] Failed to validate outcome:', outcomeError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to validate outcome' },
        { status: 500 }
      );
    }

    if (!activeOutcome) {
      return NextResponse.json(
        {
          error: 'NO_ACTIVE_OUTCOME',
          message: 'Active outcome not found for prioritization',
        },
        { status: 403 }
      );
    }

    const { data: existingSession } = await supabase
      .from('agent_sessions')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .maybeSingle();

    if (existingSession?.id) {
      const { error: deleteError } = await supabase
        .from('agent_sessions')
        .delete()
        .eq('id', existingSession.id);

      if (deleteError) {
        console.error('[Agent Prioritize API] Failed to remove previous session:', deleteError);
        return NextResponse.json(
          { error: 'DATABASE_ERROR', message: 'Failed to reset previous session' },
          { status: 500 }
        );
      }
    }

    // Clear manual overrides to prevent stale annotations
    const { error: clearOverridesError } = await supabase
      .from('task_embeddings')
      .update({ manual_overrides: null })
      .not('manual_overrides', 'is', null);

    if (clearOverridesError) {
      console.error('[Agent Prioritize API] Failed to clear manual overrides:', clearOverridesError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to reset manual overrides' },
        { status: 500 }
      );
    }

    // BUGFIX: Clear task annotations from previous sessions to prevent duplicate "manual override" badges
    // This prevents tasks from being incorrectly marked as manual_override when documents are toggled
    console.log('[Agent Prioritize API] Cleared manual overrides to prevent duplicate task annotations');


    resetRetryQueue({ clearCache: false });

    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { data: session, error: insertError } = await supabase
      .from('agent_sessions')
      .insert({
        id: sessionId,
        user_id: DEFAULT_USER_ID,
        outcome_id: outcomeId,
        status: 'running',
        prioritized_plan: null,
        baseline_plan: null,
        adjusted_plan: null,
        execution_metadata: defaultExecutionMetadata,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError || !session) {
      console.error('[Agent Prioritize API] Failed to create session:', insertError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to create agent session' },
        { status: 500 }
      );
    }

    queueMicrotask(() => {
      orchestrateTaskPriorities({
        sessionId: session.id,
        userId: DEFAULT_USER_ID,
        outcomeId,
        activeReflectionIds,
        dependencyOverrides,
        excludedDocumentIds,
      }).catch((error) => {
        console.error('[Agent Prioritize API] Background orchestration failed', error);
      });
    });

    const { strategicScores, prioritizedTasks } = await prepareStrategicData(
      session.id,
      activeOutcome.assembled_text ?? null,
      excludedDocumentIds
    );

    return NextResponse.json(
      {
        session_id: session.id,
        status: session.status,
        prioritized_plan: session.prioritized_plan,
        excluded_tasks: session.excluded_tasks,
        execution_metadata: session.execution_metadata ?? defaultExecutionMetadata,
        evaluation_metadata: session.evaluation_metadata ?? null,
        strategic_scores: strategicScores,
        prioritized_tasks: prioritizedTasks,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Agent Prioritize API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Unexpected error triggering prioritization' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = progressQuerySchema.safeParse({
    session_id: url.searchParams.get('session_id'),
    heartbeat_ms: url.searchParams.get('heartbeat_ms') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { session_id: sessionId, heartbeat_ms: heartbeatMs = 5000 } = parsed.data;
  const encoder = new TextEncoder();
  const abortSignal = (request as { signal?: AbortSignal }).signal;

  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: PrioritizationStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch (error) {
          console.warn('[Agent Prioritize API] Failed to send progress event', error);
        }
      };

      const heartbeat = setInterval(() => emitPrioritizationHeartbeat(sessionId), heartbeatMs);
      const unsubscribe = subscribeToPrioritizationProgress(sessionId, send);

      send({
        type: 'heartbeat',
        session_id: sessionId,
        timestamp: new Date().toISOString(),
      });

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      const close = () => {
        cleanup?.();
        try {
          controller.close();
        } catch (error) {
          console.warn('[Agent Prioritize API] Failed to close stream', error);
        }
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', close);
      }
    },
    cancel() {
      cleanup?.();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
