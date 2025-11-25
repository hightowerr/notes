
import { z } from 'zod';

import { supabase } from '@/lib/supabase';
import { enrichReflection, fetchRecentReflections } from '@/lib/services/reflectionService';
import { generateTaskId } from '@/lib/services/embeddingService';
import { EmbeddingQueue } from '@/lib/services/embeddingQueue';
import { Agent } from '@mastra/core/agent';
import { initializeMastra } from '@/lib/mastra/init';
import { prioritizationGenerator, GENERATOR_PROMPT, createPrioritizationAgent, generatePrioritizationInstructions } from '@/lib/mastra/agents/prioritizationGenerator';
import {
  prioritizationResultSchema,
  type PrioritizationResult,
} from '@/lib/schemas/prioritizationResultSchema';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import { prioritizeWithHybridLoop, type PrioritizationProgressUpdate } from '@/lib/services/prioritizationLoop';
import { USE_UNIFIED_PRIORITIZATION } from '@/lib/config/featureFlags';
import {
  buildExecutionMetadata,
  MASRA_TOOL_NAMES,
  extractFailedTools,
  normalizeReasoningSteps,
  summariseToolUsage,
} from '@/lib/mastra/services/resultParser';
import { resolveOutcomeAlignedTasks } from '@/lib/services/lnoTaskService';
import { emitPrioritizationProgress } from '@/lib/services/prioritizationStream';
import {
  buildIncrementalContext,
  buildIncrementalPromptContext,
  formatBaselineSummary,
  formatNewTasks,
  type IncrementalContext,
} from '@/lib/services/incrementalContext';
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
  excludedDocumentIds?: string[];
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

type AgentRunEnvelope = {
  primary: AgentRunResult;
  shadow?: AgentRunResult | null;
  primaryEngine: 'unified' | 'legacy';
  shadowEngine?: 'unified' | 'legacy';
};

function toTaskSummary(row: TaskEmbeddingRow): TaskSummary {
  return {
    task_id: row.task_id,
    task_text: row.task_text || 'Task description unavailable', // Fallback for empty/null task text
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
  options: { activeReflectionIds?: string[]; excludedDocumentIds?: string[] } = {}
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

  let tasksQuery = supabase
    .from('task_embeddings')
    .select('task_id, task_text, document_id')
    .eq('status', 'completed')
    .not('document_id', 'is', null)
    .limit(200);

  if (options.excludedDocumentIds && options.excludedDocumentIds.length > 0) {
    const exclusionList = `(${options.excludedDocumentIds.map(id => `'${id}'`).join(',')})`;
    tasksQuery = tasksQuery.not('document_id', 'in', exclusionList);
  }

  const tasksPromise = tasksQuery.returns<TaskEmbeddingRow[]>();

  const previousPlanPromise = supabase
    .from('agent_sessions')
    .select('prioritized_plan, baseline_document_ids, created_at')
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

  const legacyPlanSchema = z.object({
    ordered_task_ids: z.array(z.string()),
    confidence_scores: z.record(z.number()),
    task_annotations: z.array(z.any()).optional(),
    removed_tasks: z.array(z.any()).optional(),
  });

  if (previousSession && previousSession.prioritized_plan) {
    try {
      const rawPlan = previousSession.prioritized_plan as unknown;
      
      // 1. Try new schema (PrioritizedTaskPlan) first
      const planParsed = prioritizedPlanSchema.safeParse(rawPlan);
      if (planParsed.success) {
        previousPlan = planParsed.data;
      } else {
        // 2. Try intermediate schema (PrioritizationResult) and map it
        const resultParsed = prioritizationResultSchema.safeParse(rawPlan);
        if (resultParsed.success) {
          previousPlan = mapAgentResultToPlan(resultParsed.data);
        } else {
          // 3. Fallback to legacy schema
          const legacyParsed = legacyPlanSchema.safeParse(rawPlan);
          if (legacyParsed.success) {
            // Map legacy to new structure (partial) for internal use
            previousAnnotations = legacyParsed.data.task_annotations || [];
            previousRemovals = legacyParsed.data.removed_tasks || [];
            
            // Create a pseudo-plan for the context
            // We cast to any because we're constructing a partial plan that satisfies the shape
            // needed for context, even if it doesn't strictly match the full schema validation
            previousPlan = {
              ordered_task_ids: legacyParsed.data.ordered_task_ids,
              execution_waves: [],
              dependencies: [],
              confidence_scores: legacyParsed.data.confidence_scores,
              synthesis_summary: '',
              task_annotations: [],
              removed_tasks: [],
              excluded_tasks: [],
              created_at: new Date().toISOString(),
            } as unknown as PrioritizedTaskPlan; 
          }
        }
      }
    } catch (error) {
      console.warn('[AgentOrchestration] Unable to parse previous prioritized plan', error);
    }
  }

  if (previousPlan) {
    // If it's a new plan, extract annotations/removals from it
    if (previousPlan.task_annotations) {
         previousAnnotations = previousPlan.task_annotations;
    }
    if (previousPlan.removed_tasks) {
         previousRemovals = previousPlan.removed_tasks;
    }
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
      (previousPlan?.confidence_scores as Record<string, number>)?.[task.task_id] ??
      null;
    return {
      ...task,
      previous_rank: previousRank ?? null,
      previous_confidence:
        typeof previousConfidence === 'number' ? previousConfidence : null,
      previous_state: annotation?.state,
      removal_reason: (annotation as any)?.removal_reason ?? removalByTask.get(task.task_id)?.removal_reason ?? null,
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

  // BUGFIX: Deduplicate tasks by task_id to prevent duplicate "manual override" badges
  // This can happen when LNO alignment processes the same task twice
  const deduplicatedTasks: TaskSummary[] = [];
  const seenTaskIds = new Set<string>();

  alignedTasks.forEach(task => {
    if (!seenTaskIds.has(task.task_id)) {
      seenTaskIds.add(task.task_id);
      deduplicatedTasks.push(task);
    } else {
      console.warn('[AgentOrchestration] Duplicate task ID detected and removed:', {
        task_id: task.task_id.substring(0, 16) + '...',
        task_text: task.task_text.substring(0, 50) + '...',
      });
    }
  });

  if (deduplicatedTasks.length < alignedTasks.length) {
    console.log('[AgentOrchestration] Deduplication removed', alignedTasks.length - deduplicatedTasks.length, 'duplicate tasks');
  }

  // Build incremental context for token-efficient prioritization
  const baselineDocumentIds = Array.isArray(previousSession?.baseline_document_ids)
    ? previousSession.baseline_document_ids.filter((id): id is string => typeof id === 'string')
    : [];
  const baselineCreatedAt = typeof previousSession?.created_at === 'string'
    ? previousSession.created_at
    : null;

  const incrementalContext = buildIncrementalContext(
    deduplicatedTasks,
    baselineDocumentIds,
    baselineCreatedAt
  );

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
    tasks: deduplicatedTasks,
    metadata: {
      task_count: deduplicatedTasks.length,
      document_count: documentCount,
      reflection_count: reflections.length,
      has_previous_plan: !!previousPlan,
    },
    history: previousPlan
      ? {
          previous_plan: previousPlan,
        }
      : undefined,
    incrementalContext: {
      baseline_document_ids: baselineDocumentIds,
      baseline_created_at: baselineCreatedAt,
      is_first_run: incrementalContext.is_first_run,
      new_task_count: incrementalContext.new_tasks.length,
      token_savings_estimate: incrementalContext.token_savings_estimate,
    },
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
  const { startedAt, normalizedSteps } = options;
  const narrative = condenseStatusText(options.narrative);
  const errorMessage = toErrorMessage(options.error);

  const completedAt = performance.now();
  const metadata = buildExecutionMetadata({
    steps: normalizedSteps,
    startedAt,
    completedAt,
    errors: 1,
    statusNote: buildPartialStatusNote([], narrative, errorMessage),
    failedTools: [],
  });

  return {
    status: 'failed',
    error: errorMessage ?? 'Unknown error during prioritization',
    metadata,
    trace: {
      session_id: '',
      steps: normalizedSteps,
      total_duration_ms: metadata.total_time_ms,
      total_steps: metadata.steps_taken,
      tools_used_count: metadata.tool_call_count as Record<string, number>,
    },
    evaluationMetadata: null,
  };
}

function mapAgentResultToPlan(result: PrioritizationResult): PrioritizedTaskPlan {
  // Extract confidence scores from per_task_scores
  const confidence_scores: Record<string, number> = {};
  Object.values(result.per_task_scores).forEach((score: any) => {
    confidence_scores[score.task_id] = score.confidence;
  });

  // Map included tasks to task annotations
  const task_annotations = result.included_tasks.map((task: any) => ({
    task_id: task.task_id,
    reasoning: task.inclusion_reason,
    confidence: result.per_task_scores[task.task_id]?.confidence,
  }));

  // Map excluded tasks to removed tasks
  const removed_tasks = result.excluded_tasks.map((task: any) => ({
    task_id: task.task_id,
    removal_reason: task.exclusion_reason,
  }));

  // Create a single execution wave for now
  const execution_waves = [
    {
      wave_number: 1,
      task_ids: result.ordered_task_ids,
      parallel_execution: false,
    },
  ];

  // Map dependencies from per_task_scores if available
  const dependencies: TaskDependency[] = [];
  Object.values(result.per_task_scores).forEach((score: any) => {
    if (score.dependencies && Array.isArray(score.dependencies)) {
      score.dependencies.forEach((depId: string) => {
        dependencies.push({
          source_task_id: depId,
          target_task_id: score.task_id,
          relationship_type: 'prerequisite',
          confidence: 1,
          detection_method: 'ai_inference',
        });
      });
    }
  });

  return {
    ordered_task_ids: result.ordered_task_ids,
    execution_waves,
    dependencies,
    confidence_scores,
    synthesis_summary: result.thoughts.prioritization_strategy,
    task_annotations,
    removed_tasks,
    excluded_tasks: result.excluded_tasks, // Keep excluded_tasks for frontend compatibility
    created_at: new Date().toISOString(),
  };
}

function withStatusNote(metadata: ExecutionMetadata, note: string): ExecutionMetadata {
  return {
    ...metadata,
    status_note: metadata.status_note ? `${metadata.status_note} ${note}` : note,
  };
}

function backfillMissingPerTaskScores(payload: any): any {
  if (!payload || !Array.isArray(payload.included_tasks)) {
    return payload;
  }

  const scores = typeof payload.per_task_scores === 'object' && payload.per_task_scores !== null
    ? payload.per_task_scores
    : {};

  const confidenceFallback =
    typeof payload.confidence === 'number' && Number.isFinite(payload.confidence)
      ? Math.min(1, Math.max(0, payload.confidence))
      : 0.5;

  payload.included_tasks.forEach((task: any) => {
    if (!task || typeof task.task_id !== 'string') {
      return;
    }
    const taskId = task.task_id;
    if (scores[taskId]) {
      return;
    }
    const alignmentScore =
      typeof task.alignment_score === 'number' && Number.isFinite(task.alignment_score)
        ? task.alignment_score
        : 5;
    scores[taskId] = {
      task_id: taskId,
      impact: alignmentScore,
      effort: 8,
      confidence: confidenceFallback,
      reasoning: 'Backfilled score for missing per_task_scores entry',
      dependencies: [],
    };
  });

  payload.per_task_scores = scores;
  return payload;
}

async function runAgent(
  context: AgentRuntimeContext,
  options: { dependencyOverrides?: TaskDependency[]; sessionId: string }
): Promise<AgentRunEnvelope> {
  if (!USE_UNIFIED_PRIORITIZATION) {
    return {
      primary: await runLegacyAgent(context, options),
      shadow: null,
      primaryEngine: 'legacy',
    };
  }

  const [hybridResult, legacyResult] = await Promise.all([
    runHybridAgent(context, options),
    runLegacyAgent(context, options),
  ]);

  if (hybridResult.status === 'completed') {
    return {
      primary: hybridResult,
      shadow: legacyResult,
      primaryEngine: 'unified',
      shadowEngine: 'legacy',
    };
  }

  if (legacyResult.status === 'completed') {
    return {
      primary: {
        ...legacyResult,
        metadata: withStatusNote(
          legacyResult.metadata,
          'Legacy plan returned after unified loop fallback.'
        ),
      },
      shadow: hybridResult,
      primaryEngine: 'legacy',
      shadowEngine: 'unified',
    };
  }

  return {
    primary: hybridResult,
    shadow: legacyResult,
    primaryEngine: 'unified',
    shadowEngine: 'legacy',
  };
}

async function runHybridAgent(
  context: AgentRuntimeContext,
  options: { dependencyOverrides?: TaskDependency[]; sessionId: string }
): Promise<AgentRunResult> {
  const startedAt = performance.now();
  const normalizedSteps: ReasoningStep[] = [];
  const dependencyOverrides = options.dependencyOverrides ?? [];
  const previousPlan = context.history?.previous_plan;
  const sessionId = options.sessionId;

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
    const reflections = context.reflections.map(reflection => reflection.text).filter(Boolean);

    const publishProgress = (update: PrioritizationProgressUpdate) => {
      emitPrioritizationProgress(sessionId, {
        type: 'progress',
        progress_pct: update.progressPct,
        iteration: update.iteration,
        total_iterations: update.totalIterations,
        scored_tasks: update.scoredTasks,
        total_tasks: update.totalTasks,
        ordered_count: update.orderedCount,
        status: update.stage,
        plan: update.plan,
        note: update.stage === 'completed' ? 'Prioritization finished' : 'Streaming progress',
      });
    };

    const { plan, metadata: loopMetadata } = await prioritizeWithHybridLoop(
      {
        tasks: context.tasks,
        outcome: context.outcome.assembled_text,
        reflections,
        previousPlan,
        dependencyOverrides,
        onProgress: publishProgress,
      },
      {}
    );

    const mergedPlan: PrioritizedTaskPlan = {
      ...plan,
      dependencies: mergePlanDependencies(plan.dependencies, dependencyOverrides),
    };

    const completedAt = performance.now();
    const metadata = buildExecutionMetadata({
      steps: [],
      startedAt,
      completedAt,
      statusNote: loopMetadata.evaluation_triggered
        ? `Hybrid loop completed in ${loopMetadata.iterations} iteration(s).`
        : 'Hybrid loop fast path completed.',
      failedTools: [],
    });

    const trace: ReasoningTraceRecord = {
      session_id: '',
      steps: [],
      total_duration_ms: metadata.total_time_ms,
      total_steps: 1,
      tools_used_count: {},
    };

    return {
      status: 'completed',
      plan: mergedPlan,
      metadata,
      trace,
      evaluationMetadata: loopMetadata,
    };
  } catch (error) {
    console.error('[AgentOrchestration] Hybrid loop execution failed', error);
    emitPrioritizationProgress(sessionId, {
      type: 'progress',
      progress_pct: 0,
      iteration: 0,
      total_iterations: 0,
      scored_tasks: 0,
      total_tasks: context.tasks.length,
      ordered_count: 0,
      status: 'failed',
      note: 'Hybrid loop execution failed.',
    });
    return buildPartialResult({
      context,
      startedAt,
      normalizedSteps,
      narrative: 'Hybrid loop execution failed.',
      error,
      dependencyOverrides,
    });
  }
}

async function runLegacyAgent(
  context: AgentRuntimeContext,
  options: { dependencyOverrides?: TaskDependency[]; sessionId: string }
): Promise<AgentRunResult> {
  const startedAt = performance.now();
  let normalizedSteps: ReasoningStep[] = [];
  const previousPlan = context.history?.previous_plan;
  const dependencyOverrides = options.dependencyOverrides ?? [];

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
    const outcomeText = context.outcome.assembled_text;
    const reflectionsText = context.reflections.length > 0
      ? context.reflections.map(r => `- ${r.text}`).join('\n')
      : 'No active reflections.';

    // Build incremental context-aware prompt for token efficiency
    const baselineDocIds = context.incrementalContext?.baseline_document_ids ?? [];
    const baselineCreatedAt = context.incrementalContext?.baseline_created_at ?? null;
    const isFirstRun = context.incrementalContext?.is_first_run ?? true;

    const incrementalCtx = buildIncrementalContext(context.tasks, baselineDocIds, baselineCreatedAt);

    let tasksText: string;
    let baselineSummaryText = '';

    if (isFirstRun || incrementalCtx.new_tasks.length === context.tasks.length) {
      // First run or no baseline: send all tasks
      tasksText = context.tasks.map(t =>
        JSON.stringify({ id: t.task_id, text: t.task_text, source: t.source, lnoCategory: t.lnoCategory })
      ).join('\n');
    } else {
      // Incremental run: send baseline summary + new tasks
      baselineSummaryText = formatBaselineSummary(incrementalCtx.baseline);
      tasksText = formatNewTasks(incrementalCtx.new_tasks);

      // Log token savings for monitoring
      console.log('[AgentOrchestration] Incremental context built:', {
        total_tasks: context.tasks.length,
        new_tasks: incrementalCtx.new_tasks.length,
        baseline_tasks: context.tasks.length - incrementalCtx.new_tasks.length,
        token_savings_estimate: incrementalCtx.token_savings_estimate,
      });
    }

    const previousPlanText = previousPlan
      ? JSON.stringify(previousPlan, null, 2)
      : 'No previous plan available.';

    const dependencyConstraintsText = dependencyOverrides.length > 0
      ? dependencyOverrides.map(d =>
          `- ${d.source_task_id} ${d.relationship_type} ${d.target_task_id} (Confidence: ${d.confidence})`
        ).join('\n')
      : 'No manual dependency overrides.';

    const filledInstructions = generatePrioritizationInstructions({
      outcome: outcomeText,
      reflections: reflectionsText,
      taskCount: context.tasks.length,
      newTaskCount: incrementalCtx.new_tasks.length,
      tasks: tasksText,
      baselineSummary: baselineSummaryText,
      previousPlan: previousPlanText,
      dependencyConstraints: dependencyConstraintsText,
    });

    const agent = createPrioritizationAgent(filledInstructions, initializeMastra());

    const response = await agent.generate([], {
      maxSteps: 1,
      toolChoice: 'none',
      response_format: { type: 'json_object' },
    });

    const rawOutput =
      (response as any)?.text ??
      (response as any)?.output ??
      (response as any)?.data ??
      (response as any);

    console.log('[AgentOrchestration] Raw agent output:', rawOutput);

    let parsedResult;
    try {
      let json;
      if (typeof rawOutput === 'string') {
        let cleaned = rawOutput.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        json = JSON.parse(cleaned);
      } else {
        json = rawOutput;
      }
      parsedResult = prioritizationResultSchema.safeParse(
        backfillMissingPerTaskScores(json)
      );
    } catch (e) {
      console.error('[AgentOrchestration] Failed to parse JSON', e);
      return buildPartialResult({
        context,
        startedAt,
        normalizedSteps,
        narrative: 'Agent returned invalid JSON.',
        error: e,
        dependencyOverrides,
      });
    }

    if (!parsedResult.success) {
      console.error('[AgentOrchestration] Schema validation failed', parsedResult.error);
      return buildPartialResult({
        context,
        startedAt,
        normalizedSteps,
        narrative: 'Agent output did not match schema.',
        error: parsedResult.error,
        dependencyOverrides,
      });
    }



    const plan = mapAgentResultToPlan(parsedResult.data);
    const completedAt = performance.now();

    // Create metadata from the single step
    const metadata = buildExecutionMetadata({
      steps: [], // No reasoning steps in this single-shot agent
      startedAt,
      completedAt,
      statusNote: 'Prioritization complete.',
      failedTools: [],
    });

    const trace: ReasoningTraceRecord = {
      session_id: '',
      steps: [],
      total_duration_ms: metadata.total_time_ms,
      total_steps: 1,
      tools_used_count: {},
    };

    return {
      status: 'completed',
      plan,
      metadata,
      trace,
      evaluationMetadata: null,
    };
  } catch (error) {
    console.error('[AgentOrchestration] Agent execution failed', error);
    return buildPartialResult({
      context,
      startedAt,
      normalizedSteps,
      narrative: 'Agent execution failed.',
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
  // New plan structure doesn't support dependencies in the same way.
  // We will pass overrides to the agent via prompt instead.
  return context;
}

function summarizePlan(plan: PrioritizedTaskPlan | null | undefined) {
  if (!plan) {
    return {
      ordered_task_count: 0,
      excluded_task_count: 0,
      dependency_count: 0,
    };
  }

  return {
    ordered_task_count: Array.isArray(plan.ordered_task_ids) ? plan.ordered_task_ids.length : 0,
    excluded_task_count: Array.isArray(plan.excluded_tasks) ? plan.excluded_tasks.length : 0,
    dependency_count: Array.isArray(plan.dependencies) ? plan.dependencies.length : 0,
  };
}

async function logPrioritizationPerformance(params: {
  sessionId: string;
  status: AgentSessionStatus;
  durationMs?: number | null;
  evaluationTriggered?: boolean | null;
}) {
  const { sessionId, status, durationMs, evaluationTriggered } = params;
  if (durationMs === undefined || durationMs === null || Number.isNaN(durationMs)) {
    return;
  }
  try {
    await supabase.from('processing_logs').insert({
      operation: 'prioritization_run',
      status,
      timestamp: new Date().toISOString(),
      metadata: {
        session_id: sessionId,
        duration_ms: Math.round(Math.max(0, durationMs)),
        evaluation_triggered: Boolean(evaluationTriggered),
      },
    });
  } catch (error) {
    console.error('[AgentOrchestration] Failed to log prioritization performance', error);
  }
}

async function logShadowPrioritizationRun(params: {
  sessionId: string;
  engine: 'legacy' | 'unified';
  result: AgentRunResult | null | undefined;
}) {
  if (!params.result || params.result.status !== 'completed') {
    return;
  }

  try {
    const { ordered_task_count, excluded_task_count, dependency_count } = summarizePlan(
      params.result.plan
    );

    await supabase.from('processing_logs').insert({
      operation: 'prioritization_shadow_run',
      status: 'completed',
      timestamp: new Date().toISOString(),
      metadata: {
        session_id: params.sessionId,
        engine: params.engine,
        ordered_task_count,
        excluded_task_count,
        dependency_count,
        status_note: params.result.metadata.status_note ?? null,
      },
    });
  } catch (error) {
    console.error('[AgentOrchestration] Failed to log shadow prioritization run', error);
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
      .min(0),
    total_duration_ms: z.number().int().min(0),
    total_steps: z.number().int().min(0),
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
  const {
    sessionId,
    userId,
    outcomeId,
    activeReflectionIds,
    dependencyOverrides: overrideInput,
    excludedDocumentIds = [],
  } =
    options;
  const dependencyOverrides = sanitizeDependencyOverrides(overrideInput);

  let context: AgentRuntimeContext;
  try {
    context = await fetchRuntimeContext(userId, outcomeId, {
      activeReflectionIds,
      excludedDocumentIds,
    });
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

  const agentRun = await runAgent(context, { dependencyOverrides, sessionId });
  const traceWithSession: ReasoningTraceRecord = agentRun.primary.trace
    ? {
        ...agentRun.primary.trace,
        session_id: sessionId,
      }
    : {
        session_id: sessionId,
        steps: [],
        total_duration_ms: agentRun.primary.metadata.total_time_ms,
        total_steps: agentRun.primary.metadata.steps_taken,
        tools_used_count: agentRun.primary.metadata.tool_call_count as Record<string, number>,
      };

  const updatedAt = new Date().toISOString();
  const baselineDocumentIds = Array.from(
    new Set(
      (context.tasks ?? [])
        .map(task => task.document_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  
  const prioritizedPlan =
    agentRun.primary.status === 'completed' ? agentRun.primary.plan : null;

  const baselinePlan =
    agentRun.primary.status === 'completed' && prioritizedPlan
      ? {
          ...prioritizedPlan,
          created_at: updatedAt,
        }
      : null;

  const updatePayload = {
    status: agentRun.primary.status,
    prioritized_plan: prioritizedPlan,
    excluded_tasks:
      agentRun.primary.status === 'completed' ? agentRun.primary.plan?.excluded_tasks : null,
    baseline_plan: baselinePlan,
    baseline_document_ids: agentRun.primary.status === 'completed' ? baselineDocumentIds : null,
    execution_metadata: agentRun.primary.metadata,
    evaluation_metadata: agentRun.primary.evaluationMetadata ?? null,
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

  if (agentRun.primary.status === 'completed') {
    await logPrioritizationPerformance({
      sessionId,
      status: agentRun.primary.status,
      durationMs:
        agentRun.primary.evaluationMetadata?.duration_ms ?? agentRun.primary.metadata.total_time_ms,
      evaluationTriggered: agentRun.primary.evaluationMetadata?.evaluation_triggered ?? null,
    });
  }

  if (agentRun.shadow && agentRun.shadowEngine) {
    await logShadowPrioritizationRun({
      sessionId,
      engine: agentRun.shadowEngine,
      result: agentRun.shadow,
    });
  }

  if (agentRun.primary.status === 'completed' || traceWithSession.steps.length > 0) {
    await persistTrace(traceWithSession);
  }
}
