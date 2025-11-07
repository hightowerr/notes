import { performance } from 'node:perf_hooks';
import { z } from 'zod';

import { supabase } from '@/lib/supabase';
import { enrichReflection, fetchRecentReflections } from '@/lib/services/reflectionService';
import { generateTaskId } from '@/lib/services/embeddingService';
import { EmbeddingQueue } from '@/lib/services/embeddingQueue';
import { taskOrchestratorAgent } from '@/lib/mastra/agents/taskOrchestrator';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
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
import { resolveOutcomeAlignedTasks } from '@/lib/services/lnoTaskService';
import type {
  AgentRuntimeContext,
  AgentRunResult,
  AgentSessionStatus,
  ExecutionMetadata,
  PrioritizedTaskPlan,
  ReasoningStep,
  ReasoningTraceRecord,
  TaskAnnotation,
  TaskDependency,
  TaskRemoval,
  TaskSummary,
} from '@/lib/types/agent';

type OrchestrateTaskOptions = {
  sessionId: string;
  userId: string;
  outcomeId: string;
  activeReflectionIds?: string[];
  dependencyOverrides?: TaskDependency[];
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

async function fetchRuntimeContext(
  userId: string,
  outcomeId: string,
  options: { activeReflectionIds?: string[] } = {}
): Promise<AgentRuntimeContext> {
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

  const activeReflectionIds =
    Array.isArray(options.activeReflectionIds) && options.activeReflectionIds.length > 0
      ? Array.from(new Set(options.activeReflectionIds))
      : [];

  const reflectionsPromise = (async () => {
    try {
      if (activeReflectionIds.length > 0) {
        const { data, error } = await supabase
          .from('reflections')
          .select('*')
          .eq('user_id', userId)
          .in('id', activeReflectionIds)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        const reflections = (data ?? [])
          .filter(reflection => reflection?.is_active_for_prioritization !== false);

        return reflections.map(enrichReflection);
      }

      return await fetchRecentReflections(userId, {
        limit: 50,
        activeOnly: true,
      });
    } catch (error) {
      console.error('[AgentOrchestration] Failed to fetch reflections', error);
      return [];
    }
  })();

  const tasksPromise = supabase
    .from('task_embeddings')
    .select('task_id, task_text, document_id')
    .eq('status', 'completed')
    .limit(200)
    .returns<TaskEmbeddingRow[]>();

  const previousPlanPromise = supabase
    .from('agent_sessions')
    .select('prioritized_plan')
    .eq('user_id', userId)
    .eq('outcome_id', outcomeId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const [reflections, taskResult, previousSession] = await Promise.all([
    reflectionsPromise,
    tasksPromise,
    previousPlanPromise,
  ]);

  const rawTaskSummaries: TaskSummary[] = (taskResult.data ?? []).map(toTaskSummary);
  let documentCount = new Set(rawTaskSummaries.map(task => task.document_id)).size;
  let previousPlan: PrioritizedTaskPlan | null = null;
  let previousAnnotations: TaskAnnotation[] = [];
  let previousRemovals: TaskRemoval[] = [];

  if (previousSession && previousSession.prioritized_plan) {
    try {
      const rawPlan = previousSession.prioritized_plan as unknown;
      if (typeof rawPlan === 'string') {
        const parsed = parsePlanFromAgentResponse(rawPlan);
        if (parsed.success) {
          previousPlan = ensurePlanConsistency(parsed.plan);
        }
      } else {
        const parsed = prioritizedPlanSchema.safeParse(rawPlan);
        if (parsed.success) {
          previousPlan = ensurePlanConsistency(parsed.data);
        }
      }
    } catch (error) {
      console.warn('[AgentOrchestration] Unable to parse previous prioritized plan', error);
    }
  }

  if (previousPlan) {
    previousAnnotations = Array.isArray(previousPlan.task_annotations)
      ? previousPlan.task_annotations.filter(
          annotation => annotation && typeof annotation.task_id === 'string'
        )
      : [];
    previousRemovals = Array.isArray(previousPlan.removed_tasks)
      ? previousPlan.removed_tasks.filter(
          removal => removal && typeof removal.task_id === 'string'
        )
      : [];
  }

  const annotationByTask = new Map<string, TaskAnnotation>();
  previousAnnotations.forEach(annotation => {
    annotationByTask.set(annotation.task_id, annotation);
  });

  const removalByTask = new Map<string, TaskRemoval>();
  previousRemovals.forEach(removal => {
    removalByTask.set(removal.task_id, removal);
  });

  const augmentTaskSummary = (task: TaskSummary): TaskSummary => {
    const annotation = annotationByTask.get(task.task_id);
    const fallbackRank = previousPlan
      ? previousPlan.ordered_task_ids.indexOf(task.task_id)
      : -1;
    const previousRank =
      annotation?.previous_rank ??
      (fallbackRank >= 0 ? fallbackRank + 1 : null);
    const previousConfidence =
      annotation?.confidence ??
      previousPlan?.confidence_scores?.[task.task_id] ??
      null;
    return {
      ...task,
      previous_rank: previousRank ?? null,
      previous_confidence:
        typeof previousConfidence === 'number' ? previousConfidence : null,
      previous_state: annotation?.state,
      removal_reason: annotation?.removal_reason ?? removalByTask.get(task.task_id)?.removal_reason ?? null,
      manual_override: annotation?.manual_override ?? false,
    };
  };

  let taskSummaries: TaskSummary[] = rawTaskSummaries.map(augmentTaskSummary);

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
        taskSummaries = hydrated.slice(0, 200).map(augmentTaskSummary);
      } else {
        taskSummaries = fallbackTasks.slice(0, 200).map(augmentTaskSummary);
      }
      documentCount = new Set(taskSummaries.map(task => task.document_id)).size;
    }
  }

  const alignedTasks = await alignTasksWithOutcome(taskSummaries, outcome.assembled_text);

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
    tasks: alignedTasks,
    metadata: {
      task_count: taskSummaries.length,
      document_count: documentCount,
      reflection_count: reflections.length,
      has_previous_plan: !!previousPlan,
    },
    history: previousPlan
      ? {
          previous_plan: {
            ordered_task_ids: previousPlan.ordered_task_ids,
            confidence_scores: previousPlan.confidence_scores,
            task_annotations: previousAnnotations,
            removed_tasks: previousRemovals,
          },
        }
      : undefined,
  };
}

async function alignTasksWithOutcome(
  tasks: TaskSummary[],
  outcomeText: string | null
): Promise<TaskSummary[]> {
  if (tasks.length === 0) {
    return [];
  }

  const alignment = await resolveOutcomeAlignedTasks(
    tasks.map(task => task.task_id),
    { outcome: outcomeText }
  );

  const aligned: TaskSummary[] = [];
  const dropped: string[] = [];

  tasks.forEach(task => {
    const meta = alignment[task.task_id];
    if (!meta || !meta.category) {
      dropped.push(task.task_id);
      return;
    }

    aligned.push({
      ...task,
      task_text: meta.title,
      lnoCategory: meta.category,
      outcomeAlignment: meta.rationale ?? null,
      sourceText: meta.original_text,
    });
  });

  if (aligned.length === 0) {
    console.warn('[AgentOrchestration] No LNO classification found for requested tasks. Falling back to original tasks.');
    return tasks;
  }

  if (dropped.length > 0) {
    console.warn('[AgentOrchestration] Dropping tasks without LNO alignment', {
      droppedCount: dropped.length,
    });
  }

  return aligned;
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
  dependencyOverrides?: TaskDependency[];
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
  const planWithoutOverrides = generateFallbackPlan(context.tasks, planSummary);
  const plan = {
    ...planWithoutOverrides,
    dependencies: mergePlanDependencies(
      planWithoutOverrides.dependencies ?? [],
      options.dependencyOverrides ?? []
    ),
  };
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

async function runAgent(
  context: AgentRuntimeContext,
  options: { dependencyOverrides?: TaskDependency[] } = {}
): Promise<AgentRunResult> {
  const startedAt = performance.now();
  let normalizedSteps: ReasoningStep[] = [];
  let lastNarrative: string | null = null;
  const previousPlan = context.history?.previous_plan;
  const dependencyOverrides = options.dependencyOverrides ?? [];
  const taskTitleLookup = new Map<string, string>();
  context.tasks.forEach(task => {
    taskTitleLookup.set(task.task_id, task.task_text);
  });

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
      dependencyOverrides,
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
          `Previous plan available: ${context.metadata.has_previous_plan ? 'yes' : 'no'}`,
          'Return ONLY the JSON structure described in your instructions.',
        ].join('\n'),
      },
    ];

    if (previousPlan) {
      const annotationByTask = new Map<string, TaskAnnotation>();
      previousPlan.task_annotations?.forEach(annotation => {
        if (annotation && typeof annotation.task_id === 'string') {
          annotationByTask.set(annotation.task_id, annotation);
        }
      });

      const topTasks = previousPlan.ordered_task_ids.slice(0, 10).map((taskId, index) => {
        const parts: string[] = [`${index + 1}. ${taskId}`];
        const annotation = annotationByTask.get(taskId);
        const confidence =
          (annotation?.confidence ?? previousPlan.confidence_scores?.[taskId]) ?? null;
        if (typeof confidence === 'number') {
          parts.push(`confidence=${confidence.toFixed(2)}`);
        }
        if (annotation?.confidence_delta && Math.abs(annotation.confidence_delta) >= 0.05) {
          const delta = annotation.confidence_delta > 0 ? '+' : '';
          parts.push(`Δ=${delta}${annotation.confidence_delta.toFixed(2)}`);
        }
        if (annotation?.state && annotation.state !== 'active') {
          parts.push(`state=${annotation.state}`);
        }
        if (annotation?.manual_override) {
          parts.push('manual_override=true');
        }
        if (annotation?.removal_reason) {
          parts.push(`note=${annotation.removal_reason}`);
        }
        return `- ${parts.join(' • ')}`;
      });

      const removals = (previousPlan.removed_tasks ?? [])
        .slice(0, 10)
        .map(removal => {
          const parts: string[] = [removal.task_id];
          if (typeof removal.previous_rank === 'number') {
            parts.push(`rank=${removal.previous_rank}`);
          }
          if (typeof removal.previous_confidence === 'number') {
            parts.push(`confidence=${removal.previous_confidence.toFixed(2)}`);
          }
          if (removal.removal_reason) {
            parts.push(`reason=${removal.removal_reason}`);
          }
          return `- ${parts.join(' • ')}`;
        });

      const manualOverrides = Array.from(annotationByTask.values()).filter(
        annotation => annotation?.manual_override
      );

      const summaryLines = [
        'Previous prioritization snapshot:',
        topTasks.length > 0 ? 'Top ranked tasks last run:' : 'No prior ranked tasks captured.',
        ...topTasks,
      ];

      if (manualOverrides.length > 0) {
        summaryLines.push(
          'Manual overrides preserved:',
          ...manualOverrides.map(annotation => `- ${annotation.task_id}`)
        );
      }

      if (removals.length > 0) {
        summaryLines.push('Tasks previously removed (with reasons):', ...removals);
      }

      messages.push({
        role: 'user',
        content: summaryLines.join('\n'),
      });
    }

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

    if (dependencyOverrides.length > 0) {
      messages.push({
        role: 'user',
        content: [
          'Handle these user-locked dependencies exactly as specified:',
          ...dependencyOverrides.map(dep => {
            const source =
              taskTitleLookup.get(dep.source_task_id) ?? dep.source_task_id;
            const target =
              taskTitleLookup.get(dep.target_task_id) ?? dep.target_task_id;
            return `- ${source} (${dep.source_task_id}) ➝ ${target} (${dep.relationship_type})`;
          }),
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
        dependencyOverrides,
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
    plan.dependencies = mergePlanDependencies(plan.dependencies ?? [], dependencyOverrides);

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
      dependencyOverrides,
    });
  }
}

function sanitizeDependencyOverrides(overrides?: TaskDependency[]): TaskDependency[] {
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return [];
  }
  const sanitized: TaskDependency[] = [];
  const seen = new Set<string>();
  overrides.forEach(override => {
    if (
      !override ||
      typeof override.source_task_id !== 'string' ||
      typeof override.target_task_id !== 'string'
    ) {
      return;
    }
    const source = override.source_task_id.trim();
    const target = override.target_task_id.trim();
    if (!source || !target || source === target) {
      return;
    }
    const key = `${source}->${target}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    sanitized.push({
      source_task_id: source,
      target_task_id: target,
      relationship_type: override.relationship_type ?? 'prerequisite',
      confidence:
        typeof override.confidence === 'number' && Number.isFinite(override.confidence)
          ? Math.min(1, Math.max(0, override.confidence))
          : 1,
      detection_method: 'stored_relationship',
    });
  });
  return sanitized;
}

function mergePlanDependencies(
  dependencies: TaskDependency[] = [],
  overrides: TaskDependency[]
): TaskDependency[] {
  if (!Array.isArray(overrides) || overrides.length === 0) {
    return dependencies ?? [];
  }
  const overrideKeys = new Set(
    overrides.map(dep => `${dep.source_task_id}->${dep.target_task_id}`)
  );
  const base = Array.isArray(dependencies) ? dependencies : [];
  const filtered = base.filter(
    dep => !overrideKeys.has(`${dep.source_task_id}->${dep.target_task_id}`)
  );
  return [...filtered, ...overrides];
}

function applyOverridesToContext(
  context: AgentRuntimeContext,
  overrides: TaskDependency[]
): AgentRuntimeContext {
  if (!overrides.length || !context.history?.previous_plan) {
    return context;
  }

  const mergedPlan = {
    ...context.history.previous_plan,
    dependencies: mergePlanDependencies(context.history.previous_plan.dependencies ?? [], overrides),
  };

  return {
    ...context,
    history: {
      ...context.history,
      previous_plan: mergedPlan,
    },
  };
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
  const { sessionId, userId, outcomeId, activeReflectionIds, dependencyOverrides: overrideInput } =
    options;
  const dependencyOverrides = sanitizeDependencyOverrides(overrideInput);

  let context: AgentRuntimeContext;
  try {
    context = await fetchRuntimeContext(userId, outcomeId, { activeReflectionIds });
    context = applyOverridesToContext(context, dependencyOverrides);
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

  const result = await runAgent(context, { dependencyOverrides });
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

  const updatedAt = new Date().toISOString();
  const baselinePlan =
    result.status === 'completed'
      ? {
          ...result.plan,
          created_at: updatedAt,
        }
      : null;

  const updatePayload: {
    status: AgentSessionStatus;
    prioritized_plan: PrioritizedTaskPlan | null;
    baseline_plan: (PrioritizedTaskPlan & { created_at?: string }) | null;
    execution_metadata: ExecutionMetadata;
    updated_at: string;
  } = {
    status: result.status,
    prioritized_plan: result.status === 'completed' ? result.plan : null,
    baseline_plan: baselinePlan,
    execution_metadata: result.metadata,
    updated_at: updatedAt,
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
