import { performance } from 'node:perf_hooks';
import { z } from 'zod';

import { supabase } from '@/lib/supabase';
import { fetchRecentReflections } from '@/lib/services/reflectionService';
import { generateTaskId } from '@/lib/services/embeddingService';
import { taskOrchestratorAgent } from '@/lib/mastra/agents/taskOrchestrator';
import {
  buildExecutionMetadata,
  buildPlanSummary,
  ensurePlanConsistency,
  generateFallbackPlan,
  generateFallbackTrace,
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

      taskSummaries = fallbackTasks.slice(0, 200);
      documentCount = new Set(taskSummaries.map(task => task.document_id)).size;
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

async function runAgent(context: AgentRuntimeContext): Promise<AgentRunResult> {
  const startedAt = performance.now();

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

    const parsedPlan = parsePlanFromAgentResponse(rawOutput);

    if (!parsedPlan.success) {
      throw parsedPlan.error;
    }

    const rawSteps =
      (response as any)?.steps ??
      (response as any)?.trace?.steps ??
      (response as any)?.execution?.steps ??
      [];

    const normalizedSteps = normalizeReasoningSteps(Array.isArray(rawSteps) ? rawSteps : []);
    const completedAt = performance.now();

    const metadata = buildExecutionMetadata({
      steps: normalizedSteps,
      startedAt,
      completedAt,
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
    console.warn('[AgentOrchestration] Agent execution failed, falling back', error);

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
          status: 'failed',
        },
      ]);

      const metadata = buildExecutionMetadata({
        steps: failedSteps,
        startedAt,
        completedAt: performance.now(),
        errors: 1,
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
    const steps = generateFallbackTrace(context.tasks, plan);
    const completedAt = performance.now();
    const metadata = buildExecutionMetadata({
      steps,
      startedAt,
      completedAt,
    });

    return {
      status: 'completed',
      plan,
      metadata,
      trace: {
        session_id: '',
        steps,
        total_duration_ms: metadata.total_time_ms,
        total_steps: metadata.steps_taken,
        tools_used_count: metadata.tool_call_count,
      },
    };
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
