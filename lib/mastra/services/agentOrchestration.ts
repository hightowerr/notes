import { performance } from 'node:perf_hooks';
import { z } from 'zod';

import { supabase } from '@/lib/supabase';
import { fetchRecentReflections } from '@/lib/services/reflectionService';
import { generateTaskId } from '@/lib/services/embeddingService';
import { EmbeddingQueue } from '@/lib/services/embeddingQueue';
import { taskOrchestratorAgent } from '@/lib/mastra/agents/taskOrchestrator';
import {
  buildExecutionMetadata,
  buildPlanSummary,
  ensurePlanConsistency,
  generateFallbackPlan,
  generateFallbackTrace,
  MASRA_TOOL_NAMES,
  extractFailedTools,
  normalizeReasoningSteps,
  parsePlanFromAgentResponse,
  summariseToolUsage,
} from '@/lib/mastra/services/resultParser';
import type {
  AgentRuntimeContext,
  AgentRunResult,
  AgentSessionStatus,
  ExecutionMetadata,
  PrioritizedTaskPlan,
  ReasoningStep,
  ReasoningTraceRecord,
  TaskSummary,
} from '@/lib/types/agent';

type OrchestrateTaskOptions = {
  sessionId: string;
  userId: string;
  outcomeId: string;
};

type SupabaseOutcomeRow = {
  id: string;
  user_id: string;
  direction: string;
  object_text: string;
  metric_text: string;
  clarifier: string;
  assembled_text: string;
  state_preference: string | null;
  daily_capacity_hours: number | null;
};

type TaskEmbeddingRow = {
  task_id: string;
  task_text: string;
  document_id: string;
};

type ProcessedDocumentRow = {
  id: string;
  structured_output: {
    actions?: Array<{ text: string }>;
  } | null;
};

function toTaskSummary(row: TaskEmbeddingRow): TaskSummary {
  return {
    task_id: row.task_id,
    task_text: row.task_text,
    document_id: row.document_id,
    source: 'embedding',
  };
}

const embeddingQueue = new EmbeddingQueue();

async function hydrateFallbackEmbeddings(tasks: TaskSummary[]): Promise<TaskSummary[]> {
  if (tasks.length === 0) {
    return [];
  }

  const grouped = new Map<string, TaskSummary[]>();
  for (const task of tasks) {
    if (!task.document_id) {
      continue;
    }
    const bucket = grouped.get(task.document_id) ?? [];
    bucket.push(task);
    grouped.set(task.document_id, bucket);
  }

  for (const [documentId, docTasks] of grouped) {
    try {
      await embeddingQueue.enqueue(
        docTasks.map(({ task_id, task_text, document_id }) => ({
          task_id,
          task_text,
          document_id,
        })),
        documentId
      );
    } catch (error) {
      console.error(
        '[AgentOrchestration] Failed to enqueue embeddings for fallback tasks',
        { documentId, taskCount: docTasks.length },
        error
      );
    }
  }

  const taskIds = tasks.map(task => task.task_id);
  if (taskIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text, document_id')
    .in('task_id', taskIds)
    .eq('status', 'completed')
    .returns<TaskEmbeddingRow[]>();

  if (error) {
    console.error(
      '[AgentOrchestration] Unable to refresh embeddings after fallback hydration',
      error
    );
    return [];
  }

  return (data ?? []).map(toTaskSummary);
}

async function fetchRuntimeContext(userId: string, outcomeId: string): Promise<AgentRuntimeContext> {
  const [{ data: outcome, error: outcomeError }] = await Promise.all([
    supabase
      .from('user_outcomes')
      .select(
        'id, user_id, direction, object_text, metric_text, clarifier, assembled_text, state_preference, daily_capacity_hours'
      )
      .eq('id', outcomeId)
      .maybeSingle<SupabaseOutcomeRow>(),
  ]);

  if (outcomeError) {
    throw new Error(`Failed to load outcome: ${outcomeError.message}`);
  }

  if (!outcome) {
    throw new Error('Outcome not found for prioritization');
  }

  const reflectionsPromise = fetchRecentReflections(userId).catch(error => {
    console.error('[AgentOrchestration] Failed to fetch reflections', error);
    return [];
  });

  const tasksPromise = supabase
    .from('task_embeddings')
    .select('task_id, task_text, document_id')
    .eq('status', 'completed')
    .limit(200)
    .returns<TaskEmbeddingRow[]>();

  const [reflections, taskResult] = await Promise.all([reflectionsPromise, tasksPromise]);

  let taskSummaries: TaskSummary[] = (taskResult.data ?? []).map(toTaskSummary);
  let documentCount = new Set(taskSummaries.map(task => task.document_id)).size;

  if (taskSummaries.length === 0) {
    const { data: documents, error: documentsError } = await supabase
      .from('processed_documents')
      .select('id, structured_output')
      .limit(50)
      .returns<ProcessedDocumentRow[]>();

    if (documentsError) {
      console.error('[AgentOrchestration] Unable to read processed_documents fallback', documentsError);
    } else if (documents) {
      const fallbackTasks: TaskSummary[] = [];

      documents.forEach(doc => {
        const actions = doc.structured_output?.actions ?? [];
        actions.forEach((action, index) => {
          const text = typeof action === 'string' ? action : action?.text;
          if (!text) {
            return;
          }

          fallbackTasks.push({
            task_id: generateTaskId(`${text}:${index}`, doc.id),
            task_text: text,
            document_id: doc.id,
            source: 'structured_output',
          });
        });
      });

      const hydrated = await hydrateFallbackEmbeddings(fallbackTasks);

      if (hydrated.length > 0) {
        taskSummaries = hydrated.slice(0, 200);
        documentCount = new Set(taskSummaries.map(task => task.document_id)).size;
      } else {
        taskSummaries = fallbackTasks.slice(0, 200);
        documentCount = new Set(taskSummaries.map(task => task.document_id)).size;
      }
    }
  }

  return {
    outcome: {
      id: outcome.id,
      direction: outcome.direction,
      object_text: outcome.object_text,
      metric_text: outcome.metric_text,
      clarifier: outcome.clarifier,
      assembled_text: outcome.assembled_text,
      state_preference: outcome.state_preference,
      daily_capacity_hours: outcome.daily_capacity_hours,
    },
    reflections: reflections.map(reflection => ({
      id: reflection.id,
      text: reflection.text,
      created_at: reflection.created_at,
      weight: reflection.weight,
      relative_time: reflection.relative_time,
    })),
    tasks: taskSummaries,
    metadata: {
      task_count: taskSummaries.length,
      document_count: documentCount,
      reflection_count: reflections.length,
    },
  };
}

function condenseStatusText(value?: string | null, maxLength = 160): string | null {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return null;
  }
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function detectToolsInText(text?: string | null): string[] {
  if (!text) {
    return [];
  }
  const lowered = text.toLowerCase();
  return MASRA_TOOL_NAMES.filter(tool => lowered.includes(tool));
}

function toErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return null;
}

function inferFailureTools(
  steps: ReasoningStep[],
  narrative?: string | null,
  errorMessage?: string | null
): string[] {
  const collected = new Set<string>();
  extractFailedTools(steps, narrative ?? null).forEach(tool => collected.add(tool));
  detectToolsInText(narrative).forEach(tool => collected.add(tool));
  detectToolsInText(errorMessage).forEach(tool => collected.add(tool));
  return Array.from(collected);
}

function buildFailureThought(
  failedTools: string[],
  errorMessage?: string | null,
  narrative?: string | null
): string {
  if (failedTools.length > 0) {
    const label = failedTools.length === 1 ? 'tool' : 'tools';
    return condenseStatusText(
      `Failed to finish ${failedTools.join(', ')} ${label}. Showing partial results.`
    ) ?? 'Failed to finish one or more tools. Showing partial results.';
  }

  const narrativeSummary = condenseStatusText(narrative);
  if (narrativeSummary) {
    return narrativeSummary;
  }

  const errorSummary = condenseStatusText(errorMessage);
  if (errorSummary) {
    return errorSummary;
  }

  return 'Agent returned partial results after encountering an error.';
}

function buildPartialStatusNote(
  failedTools: string[],
  narrative?: string | null,
  errorMessage?: string | null
): string {
  if (failedTools.length > 0) {
    const base = `Some analysis steps failed (${failedTools.join(', ')}).`;
    const extra = condenseStatusText(narrative) ?? condenseStatusText(errorMessage);
    return extra ? `${base} ${extra}` : `${base} Partial results shown.`;
  }

  return (
    condenseStatusText(narrative) ??
    condenseStatusText(errorMessage) ??
    'Some analysis steps failed. Partial results shown.'
  );
}

type PartialResultOptions = {
  context: AgentRuntimeContext;
  startedAt: number;
  normalizedSteps: ReasoningStep[];
  narrative: string | null;
  error: unknown;
};

function buildPartialResult(options: PartialResultOptions): AgentRunResult {
  const { context, startedAt, normalizedSteps } = options;
  const narrative = condenseStatusText(options.narrative);
  const errorMessage = toErrorMessage(options.error);

  if (context.tasks.length === 0) {
    const failedSteps: ReasoningStep[] = normalizeReasoningSteps([
      {
        step_number: 1,
        timestamp: new Date().toISOString(),
        thought: 'No available tasks to prioritize. Agent cannot produce a plan.',
        tool_name: null,
        tool_input: null,
        tool_output: null,
        duration_ms: 10,
        status: 'failed' as const,
      },
    ]);

    const completedAt = performance.now();
    const metadata = buildExecutionMetadata({
      steps: failedSteps,
      startedAt,
      completedAt,
      errors: 1,
      statusNote: buildPartialStatusNote([], narrative, errorMessage),
      failedTools: [],
    });

    return {
      status: 'failed',
      error: 'No tasks available to prioritize.',
      metadata,
      trace: {
        session_id: '',
        steps: failedSteps,
        total_duration_ms: metadata.total_time_ms,
        total_steps: metadata.steps_taken,
        tools_used_count: metadata.tool_call_count,
      },
    };
  }

  const planSummary = buildPlanSummary(context);
  const plan = generateFallbackPlan(context.tasks, planSummary);
  const fallbackSteps = generateFallbackTrace(context.tasks, plan, { narrative: null });

  const provisionalFailedTools = inferFailureTools(normalizedSteps, narrative, errorMessage);
  const combinedRawSteps: Array<Record<string, unknown>> = [...normalizedSteps];
  const hasFailureStep = normalizedSteps.some(step => step.status === 'failed');

  if (!hasFailureStep) {
    combinedRawSteps.push({
      step_number: combinedRawSteps.length + 1,
      timestamp: new Date().toISOString(),
      thought: buildFailureThought(provisionalFailedTools, errorMessage, narrative),
      tool_name: provisionalFailedTools[0] ?? null,
      tool_input: null,
      tool_output: errorMessage ? { error: errorMessage } : null,
      duration_ms: 10,
      status: 'failed',
    });
  }

  combinedRawSteps.push(...fallbackSteps);

  const combinedSteps = normalizeReasoningSteps(combinedRawSteps);
  const failedTools = inferFailureTools(combinedSteps, narrative, errorMessage);
  const statusNote = buildPartialStatusNote(failedTools, narrative, errorMessage);

  const completedAt = performance.now();
  const metadata = buildExecutionMetadata({
    steps: combinedSteps,
    startedAt,
    completedAt,
    statusNote,
    failedTools,
  });

  return {
    status: 'completed',
    plan,
    metadata,
    trace: {
      session_id: '',
      steps: combinedSteps,
      total_duration_ms: metadata.total_time_ms,
      total_steps: metadata.steps_taken,
      tools_used_count: metadata.tool_call_count,
    },
  };
}

async function runAgent(context: AgentRuntimeContext): Promise<AgentRunResult> {
  const startedAt = performance.now();
  let normalizedSteps: ReasoningStep[] = [];
  let lastNarrative: string | null = null;

  const hasEmbeddingBackedTasks =
    context.tasks.length === 0 || context.tasks.some(task => task.source === 'embedding');

  if (context.tasks.length > 0 && !hasEmbeddingBackedTasks) {
    return buildPartialResult({
      context,
      startedAt,
      normalizedSteps,
      narrative: 'Task embeddings are still being generated.',
      error: new Error(
        'Task embeddings are still processing. Please retry once document ingestion completes.'
      ),
    });
  }

  try {
    const messages: Array<{ role: 'user'; content: string }> = [
      {
        role: 'user',
        content: [
          `Goal: Prioritize tasks for the following outcome -> ${context.outcome.assembled_text}`,
          `User state preference: ${context.outcome.state_preference ?? 'not specified'}`,
          `Daily capacity: ${context.outcome.daily_capacity_hours ?? 'unknown'} hours`,
          `Tasks available: ${context.metadata.task_count}`,
          `Reflections available: ${context.metadata.reflection_count}`,
          'Return ONLY the JSON structure described in your instructions.',
        ].join('\n'),
      },
    ];

    if (context.reflections.length > 0) {
      messages.push({
        role: 'user',
        content: [
          'Recent reflections:',
          ...context.reflections.map(
            reflection => `- (${reflection.relative_time ?? 'recent'}) ${reflection.text}`
          ),
        ].join('\n'),
      });
    }

    if (context.tasks.length > 0) {
      messages.push({
        role: 'user',
        content: [
          'Sample tasks:',
          ...context.tasks
            .slice(0, 15)
            .map(task => `- [${task.task_id}] ${task.task_text}`),
        ].join('\n'),
      });
    }

    const response = await taskOrchestratorAgent.generate(
      messages,
      {
        maxSteps: 10,
        toolChoice: 'auto',
      } as any
    );

    const rawOutput =
      (response as any)?.text ??
      (response as any)?.output ??
      (response as any)?.data ??
      (response as any);

    console.log('[AgentOrchestration] Raw agent output:', rawOutput);
    if (typeof rawOutput === 'string') {
      const text = rawOutput;
      console.log('[AgentOrchestration] Raw agent output TEXT:', text);
      console.log('[AgentOrchestration] Output length:', text.length);
      console.log('[AgentOrchestration] BeginsWith "{"?:', text.trim().startsWith('{'));
    } else {
      console.log('[AgentOrchestration] Raw agent output is not a string:', typeof rawOutput);
    }

    const parsedPlan = parsePlanFromAgentResponse(rawOutput);

    const rawSteps =
      (response as any)?.steps ??
      (response as any)?.trace?.steps ??
      (response as any)?.execution?.steps ??
      [];

    normalizedSteps = normalizeReasoningSteps(Array.isArray(rawSteps) ? rawSteps : []);
    console.log(
      '[AgentOrchestration] Tool execution summary:',
      summariseToolUsage(normalizedSteps)
    );

    if (!parsedPlan.success) {
      return buildPartialResult({
        context,
        startedAt,
        normalizedSteps,
        narrative: parsedPlan.narrative ?? null,
        error: parsedPlan.error,
      });
    }

    lastNarrative = condenseStatusText(parsedPlan.narrative ?? null);
    const completedAt = performance.now();

    const metadata = buildExecutionMetadata({
      steps: normalizedSteps,
      startedAt,
      completedAt,
      statusNote: lastNarrative,
      failedTools: extractFailedTools(normalizedSteps, lastNarrative),
    });

    const plan = ensurePlanConsistency(parsedPlan.plan);

    const trace: ReasoningTraceRecord = {
      session_id: '',
      steps: normalizedSteps,
      total_duration_ms: metadata.total_time_ms,
      total_steps: metadata.steps_taken,
      tools_used_count: metadata.tool_call_count,
    };

    return {
      status: 'completed',
      plan,
      metadata,
      trace,
    };
  } catch (error) {
    console.log('[AgentOrchestration] Agent decided to fallback narrative path.');
    console.warn('[AgentOrchestration] Agent execution failed, falling back', error);
    const fallbackNarrative =
      (error as { statusNote?: string | undefined })?.statusNote ?? lastNarrative ?? null;

    return buildPartialResult({
      context,
      startedAt,
      normalizedSteps,
      narrative: fallbackNarrative,
      error,
    });
  }
}

async function persistTrace(trace: ReasoningTraceRecord): Promise<void> {
  const payload = {
    session_id: trace.session_id,
    steps: trace.steps,
    total_duration_ms: trace.total_duration_ms,
    total_steps: trace.total_steps,
    tools_used_count: trace.tools_used_count,
  };

  const validation = z.object({
    session_id: z.string().uuid(),
    steps: z
      .array(z.object({
        step_number: z.number(),
      }))
      .min(1),
    total_duration_ms: z.number().int().min(0),
    total_steps: z.number().int().min(1),
    tools_used_count: z.record(z.number()),
  }).safeParse(payload);

  if (!validation.success) {
    console.error('[AgentOrchestration] Invalid trace payload', validation.error.flatten());
    return;
  }

  const { error } = await supabase.from('reasoning_traces').insert({
    session_id: trace.session_id,
    steps: trace.steps,
    total_duration_ms: trace.total_duration_ms,
    total_steps: trace.total_steps,
    tools_used_count: trace.tools_used_count,
  });

  if (error) {
    console.error('[AgentOrchestration] Failed to persist reasoning trace', error);
  }
}

export async function orchestrateTaskPriorities(options: OrchestrateTaskOptions): Promise<void> {
  const { sessionId, userId, outcomeId } = options;

  let context: AgentRuntimeContext;
  try {
    context = await fetchRuntimeContext(userId, outcomeId);
  } catch (error) {
    console.error('[AgentOrchestration] Unable to build runtime context', error);
    await supabase
      .from('agent_sessions')
      .update({
        status: 'failed' satisfies AgentSessionStatus,
        prioritized_plan: null,
        execution_metadata: {
          steps_taken: 0,
          tool_call_count: {},
          thinking_time_ms: 0,
          tool_execution_time_ms: 0,
          total_time_ms: 0,
          error_count: 1,
          success_rate: 0,
          status_note: 'Unable to build runtime context for prioritization.',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    return;
  }

  const result = await runAgent(context);
  const traceWithSession: ReasoningTraceRecord = result.trace
    ? {
        ...result.trace,
        session_id: sessionId,
      }
    : {
        session_id: sessionId,
        steps: [],
        total_duration_ms: result.metadata.total_time_ms,
        total_steps: result.metadata.steps_taken,
        tools_used_count: result.metadata.tool_call_count,
      };

  const updatePayload: {
    status: AgentSessionStatus;
    prioritized_plan: PrioritizedTaskPlan | null;
    execution_metadata: ExecutionMetadata;
    updated_at: string;
  } = {
    status: result.status,
    prioritized_plan: result.status === 'completed' ? result.plan : null,
    execution_metadata: result.metadata,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from('agent_sessions')
    .update(updatePayload)
    .eq('id', sessionId);

  if (updateError) {
    console.error('[AgentOrchestration] Failed to update agent session', updateError);
    return;
  }

  if (result.status === 'completed' || traceWithSession.steps.length > 0) {
    await persistTrace(traceWithSession);
  }
}
