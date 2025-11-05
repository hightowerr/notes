import {
  prioritizedPlanSchema,
  executionWaveSchema,
  taskDependencySchema,
  taskAnnotationSchema,
  taskRemovalSchema,
} from '@/lib/schemas/prioritizedPlanSchema';
import { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import { reasoningStepSchema } from '@/lib/schemas/reasoningStepSchema';
import type {
  ExecutionMetadata,
  PrioritizedTaskPlan,
  ReasoningStep,
  TaskDependency,
  ExecutionWave,
  AgentRuntimeContext,
  TaskAnnotation,
  TaskRemoval,
  TaskSummary,
} from '@/lib/types/agent';

type MaybePlan =
  | { success: true; plan: PrioritizedTaskPlan; narrative?: string }
  | { success: false; error: Error; narrative?: string };

type RawTraceStep = Record<string, unknown>;

const DEFAULT_CONFIDENCE_LOW = 0.55;
const DEFAULT_CONFIDENCE_HIGH = 0.9;

export const MASRA_TOOL_NAMES = [
  'semantic-search',
  'detect-dependencies',
  'cluster-by-similarity',
  'get-document-context',
  'query-task-graph',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeTaskIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(entry => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (typeof entry === 'number' || typeof entry === 'boolean') {
        return String(entry);
      }
      if (entry && typeof entry === 'object' && 'task_id' in entry && typeof (entry as { task_id?: unknown }).task_id === 'string') {
        return ((entry as { task_id?: string }).task_id ?? '').trim();
      }
      return '';
    })
    .map(text => text.trim())
    .filter(text => text.length > 0);
}

function buildDefaultExecutionWaves(taskIds: string[]): ExecutionWave[] {
  if (taskIds.length === 0) {
    return [];
  }

  const chunkSize = 5;
  const waves: ExecutionWave[] = [];

  for (let index = 0; index < taskIds.length; index += chunkSize) {
    const chunk = taskIds.slice(index, index + chunkSize);
    waves.push(
      executionWaveSchema.parse({
        wave_number: waves.length + 1,
        task_ids: chunk,
        parallel_execution: chunk.length > 1,
        estimated_duration_hours: null,
      })
    );
  }

  return waves;
}

function parseTaskAnnotations(source: unknown, orderedTaskIds: string[]): TaskAnnotation[] {
  if (!Array.isArray(source)) {
    return [];
  }

  const annotations: TaskAnnotation[] = [];
  source.forEach(candidate => {
    if (!isRecord(candidate)) {
      return;
    }

    const sanitized: Record<string, unknown> = {
      ...candidate,
    };

    if (typeof candidate.task_id === 'string') {
      sanitized.task_id = candidate.task_id.trim();
    }
    if (typeof candidate.reasoning === 'string') {
      sanitized.reasoning = candidate.reasoning.trim();
    }
    if (typeof candidate.dependency_notes === 'string') {
      sanitized.dependency_notes = candidate.dependency_notes.trim();
    }
    if (typeof candidate.removal_reason === 'string') {
      sanitized.removal_reason = candidate.removal_reason.trim();
    }

    const parsed = taskAnnotationSchema.safeParse(sanitized);
    if (parsed.success && parsed.data.task_id) {
      annotations.push(parsed.data);
    }
  });

  if (annotations.length === 0) {
    return [];
  }

  return annotations.filter(annotation => {
    if (!annotation.task_id) {
      return false;
    }
    return orderedTaskIds.includes(annotation.task_id) || annotation.state === 'manual_override';
  });
}

function parseRemovedTasks(source: unknown): TaskRemoval[] {
  if (!Array.isArray(source)) {
    return [];
  }

  const removals: TaskRemoval[] = [];

  source.forEach(candidate => {
    if (!isRecord(candidate)) {
      return;
    }

    const sanitized: Record<string, unknown> = {
      ...candidate,
    };

    if (typeof candidate.task_id === 'string') {
      sanitized.task_id = candidate.task_id.trim();
    }
    if (typeof candidate.removal_reason === 'string') {
      sanitized.removal_reason = candidate.removal_reason.trim();
    }

    const parsed = taskRemovalSchema.safeParse(sanitized);
    if (parsed.success && parsed.data.task_id) {
      removals.push(parsed.data);
    }
  });

  return removals;
}

function coercePlanCandidate(raw: unknown, narrative?: string): PrioritizedTaskPlan {
  if (!isRecord(raw)) {
    throw new Error('Agent response was not a JSON object.');
  }

  const orderedTaskIds = sanitizeTaskIds(raw.ordered_task_ids);

  if (orderedTaskIds.length === 0) {
    throw new Error('Agent response missing ordered_task_ids.');
  }

  const waveCandidates = Array.isArray(raw.execution_waves) ? raw.execution_waves : [];
  const normalizedWaves: ExecutionWave[] = [];

  waveCandidates.forEach(candidate => {
    if (!isRecord(candidate)) {
      return;
    }

    const candidateTaskIds = sanitizeTaskIds(candidate.task_ids);
    const taskIds = candidateTaskIds.length > 0 ? candidateTaskIds : [orderedTaskIds[Math.min(normalizedWaves.length, orderedTaskIds.length - 1)]];

    const parsedWave = executionWaveSchema.safeParse({
      wave_number:
        typeof candidate.wave_number === 'number' && Number.isFinite(candidate.wave_number) && candidate.wave_number > 0
          ? candidate.wave_number
          : normalizedWaves.length + 1,
      task_ids: taskIds,
      parallel_execution:
        typeof candidate.parallel_execution === 'boolean'
          ? candidate.parallel_execution
          : taskIds.length > 1,
      estimated_duration_hours:
        typeof candidate.estimated_duration_hours === 'number' && Number.isFinite(candidate.estimated_duration_hours)
          ? Math.max(0, Math.min(200, candidate.estimated_duration_hours))
          : null,
    });

    if (parsedWave.success) {
      normalizedWaves.push(parsedWave.data);
    } else {
      normalizedWaves.push(
        executionWaveSchema.parse({
          wave_number: normalizedWaves.length + 1,
          task_ids: taskIds,
          parallel_execution: taskIds.length > 1,
          estimated_duration_hours: null,
        })
      );
    }
  });

  const fallbackWaves = buildDefaultExecutionWaves(orderedTaskIds);
  const executionWaves = normalizedWaves.length > 0 ? normalizedWaves : fallbackWaves;

  const dependencyCandidates = Array.isArray(raw.dependencies) ? raw.dependencies : [];
  const dependencies: TaskDependency[] = dependencyCandidates
    .map(candidate => {
      if (!isRecord(candidate)) {
        return null;
      }

      const relationship = typeof candidate.relationship_type === 'string' ? candidate.relationship_type : '';
      const detection = typeof candidate.detection_method === 'string' ? candidate.detection_method : '';

      try {
        return taskDependencySchema.parse({
          source_task_id: typeof candidate.source_task_id === 'string' ? candidate.source_task_id.trim() : '',
          target_task_id: typeof candidate.target_task_id === 'string' ? candidate.target_task_id.trim() : '',
          relationship_type:
            relationship === 'prerequisite' || relationship === 'blocks' || relationship === 'related'
              ? (relationship as 'prerequisite' | 'blocks' | 'related')
              : 'prerequisite',
          confidence:
            typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)
              ? Math.min(1, Math.max(0, candidate.confidence))
              : DEFAULT_CONFIDENCE_LOW,
          detection_method:
            detection === 'stored_relationship' ? 'stored_relationship' : 'ai_inference',
        });
      } catch {
        return null;
      }
    })
    .filter((dependency): dependency is TaskDependency => dependency !== null);

  const confidenceSource = isRecord(raw.confidence_scores) ? raw.confidence_scores : {};
  const confidenceScores = {
    ...buildConfidenceScores(orderedTaskIds),
  };

  for (const [taskId, value] of Object.entries(confidenceSource)) {
    const trimmedId = taskId.trim();
    if (!trimmedId) {
      continue;
    }
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      continue;
    }
    confidenceScores[trimmedId] = clampConfidence(numericValue);
  }

  let summary =
    typeof raw.synthesis_summary === 'string' && raw.synthesis_summary.trim().length > 0
      ? raw.synthesis_summary.trim()
      : '';

  if (!summary && narrative) {
    summary = condenseThoughtText(narrative) ?? narrative.trim();
  }

  if (!summary) {
    summary = 'Prioritization completed with limited data.';
  }

  const taskAnnotations = parseTaskAnnotations(raw.task_annotations, orderedTaskIds);
  const removedTasks = parseRemovedTasks(raw.removed_tasks);

  const planCandidate = {
    ordered_task_ids: orderedTaskIds,
    execution_waves: executionWaves,
    dependencies,
    confidence_scores: confidenceScores,
    synthesis_summary: summary,
    task_annotations: taskAnnotations,
    removed_tasks: removedTasks,
  };

  const parsedPlan = prioritizedPlanSchema.safeParse(planCandidate);
  if (!parsedPlan.success) {
    console.error('[ResultParser] Plan validation failed', parsedPlan.error.flatten());
    throw new Error('Plan did not match prioritizedPlanSchema');
  }

  const plan = parsedPlan.data;
  return {
    ...plan,
    task_annotations: Array.isArray(plan.task_annotations) ? plan.task_annotations : [],
    removed_tasks: Array.isArray(plan.removed_tasks) ? plan.removed_tasks : [],
  };
}

function buildPlanFromJson(raw: unknown, narrative?: string): PrioritizedTaskPlan {
  return coercePlanCandidate(raw, narrative);
}

export function parsePlanFromAgentResponse(raw: unknown): MaybePlan {
  if (raw === null || typeof raw === 'undefined') {
    return { success: false, error: new Error('Empty response from agent') };
  }

  let narrative: string | undefined;
  const assignNarrative = (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) {
      return;
    }

    narrative = cleaned.length > 500 ? `${cleaned.slice(0, 497)}...` : cleaned;
  };

  try {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error('Agent response string is empty');
      }

      console.log('[ResultParser] trimmed output:', trimmed);
      console.log('[ResultParser] trimmed first 100 chars:', trimmed.substring(0, 100));

      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          const result = buildPlanFromJson(parsed);
          return { success: true, plan: result };
        } catch (error) {
          console.error('[ResultParser] JSON.parse failed for direct JSON', error);
          throw new Error(
            `Failed to parse direct JSON: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      const codeBlockRegex = /```json\s*([\s\S]*?)```/i;
      const codeBlockMatch = codeBlockRegex.exec(trimmed);
      if (codeBlockMatch && codeBlockMatch[1]) {
        const leading = trimmed.slice(0, codeBlockMatch.index ?? 0);
        assignNarrative(leading);

        const jsonContent = codeBlockMatch[1].trim();
        try {
          const parsed = JSON.parse(jsonContent);
          const result = buildPlanFromJson(parsed, narrative);
          return { success: true, plan: result, narrative };
        } catch (error) {
          console.error('[ResultParser] JSON.parse failed for code block JSON', error);
          throw new Error(
            `Failed to parse JSON from code block: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const leading = trimmed.slice(0, firstBrace);
        assignNarrative(leading);

        const sliced = trimmed.slice(firstBrace, lastBrace + 1);
        try {
          const parsed = JSON.parse(sliced);
          const result = buildPlanFromJson(parsed, narrative);
          return { success: true, plan: result, narrative };
        } catch (error) {
          console.error('[ResultParser] JSON.parse failed for sliced JSON', error);
          throw error;
        }
      }

      assignNarrative(trimmed);
      console.error('[ResultParser] No valid JSON found in agent output.', trimmed);
      throw new Error('No valid JSON found in agent output.');
    }

    if (typeof raw === 'object') {
      const result = buildPlanFromJson(raw, narrative);
      return { success: true, plan: result };
    }

    throw new Error('Unsupported agent response format');
  } catch (error) {
    console.error('[ResultParser] Failed to parse agent response', {
      raw,
      error,
    });
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: new Error(`Failed to parse agent output: ${message}`),
      narrative,
    };
  }
}

function coerceThought(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map(item => coerceThought(item))
      .filter((text): text is string => Boolean(text && text.trim()))
      .join('\n');
    return joined.length > 0 ? joined : null;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') {
      return record.text;
    }
    if (typeof record.message === 'string') {
      return record.message;
    }
    if (typeof record.reasoning === 'string') {
      return record.reasoning;
    }
  }

  return null;
}

function condenseThoughtText(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const withoutCode = value.replace(/```[\s\S]*?```/g, ' ');
  const cleaned = withoutCode
    .replace(/[#*_`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return null;
  }

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);

  if (sentences.length === 0) {
    return cleaned.slice(0, 160).trimEnd();
  }

  const firstSentence = sentences[0].trim();
  if (firstSentence.length <= 160) {
    return firstSentence;
  }

  return `${firstSentence.slice(0, 157).trimEnd()}…`;
}

function toolsMentioned(text?: string | null): string[] {
  if (!text) {
    return [];
  }
  const lowered = text.toLowerCase();
  return MASRA_TOOL_NAMES.filter(tool => lowered.includes(tool));
}

export function normalizeReasoningSteps(rawSteps: unknown[]): ReasoningStep[] {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return [];
  }

  return rawSteps
    .map((raw, index) => {
      const base = typeof raw === 'object' && raw !== null ? { ...raw } : {};
      if (typeof base.step_number !== 'number') {
        (base as Record<string, unknown>).step_number = index + 1;
      }

      if (typeof base.timestamp !== 'string') {
        (base as Record<string, unknown>).timestamp = new Date().toISOString();
      }

      if (typeof base.duration_ms !== 'number') {
        (base as Record<string, unknown>).duration_ms = 0;
      }

      if (typeof base.status !== 'string') {
        (base as Record<string, unknown>).status = 'success';
      }

      if (typeof (base as { thought?: unknown }).thought !== 'string') {
        const fallbackThought =
          coerceThought((base as Record<string, unknown>).thought) ??
          coerceThought((base as Record<string, unknown>).content) ??
          coerceThought((base as Record<string, unknown>).reasoning) ??
          coerceThought((base as Record<string, unknown>).observation) ??
          coerceThought((base as Record<string, unknown>).summary);

        if (fallbackThought && fallbackThought.trim().length > 0) {
          (base as Record<string, unknown>).thought = fallbackThought.trim();
        } else {
          (base as Record<string, unknown>).thought = null;
        }
      }

      try {
        const parsed = reasoningStepSchema.parse(base);
        return {
          ...parsed,
          thought: condenseThoughtText(parsed.thought),
        };
      } catch (error) {
        const fallback = {
          step_number: index + 1,
          timestamp: new Date().toISOString(),
          thought: 'Unable to parse reasoning step',
          tool_name: null,
          tool_input: null,
          tool_output: null,
          duration_ms: 0,
          status: 'failed' as const,
        };

        console.error('[ResultParser] Failed to normalize reasoning step', {
          error,
          raw,
        });

        return fallback;
      }
    })
    .slice(0, 10);
}

export function summariseToolUsage(steps: ReasoningStep[]): Record<string, number> {
  return steps.reduce<Record<string, number>>((acc, step) => {
    if (step.tool_name) {
      acc[step.tool_name] = (acc[step.tool_name] ?? 0) + 1;
    }
    return acc;
  }, {});
}

export function extractFailedTools(steps: ReasoningStep[], statusNote?: string | null): string[] {
  const failed = new Set<string>();

  steps.forEach(step => {
    if (step.status === 'failed' && step.tool_name) {
      failed.add(step.tool_name);
    }
  });

  toolsMentioned(statusNote).forEach(tool => failed.add(tool));

  return Array.from(failed);
}

export function buildExecutionMetadata(options: {
  steps: ReasoningStep[];
  startedAt: number;
  completedAt: number;
  toolExecutionTimeMs?: number;
  errors?: number;
  statusNote?: string | null;
  failedTools?: string[];
}): ExecutionMetadata {
  const { steps, startedAt, completedAt } = options;
  const totalTime = Math.max(0, Math.round(completedAt - startedAt));
  const toolExec = options.toolExecutionTimeMs ?? steps.reduce((sum, step) => sum + step.duration_ms, 0);
  const errorCount = options.errors ?? steps.filter(step => step.status === 'failed').length;
  const successCount = steps.length - errorCount;
  const successRate = steps.length === 0 ? 1 : successCount / steps.length;
  const statusNote = options.statusNote?.trim() ? options.statusNote.trim() : null;
  const failedTools = Array.from(
    new Set(
      (options.failedTools ?? extractFailedTools(steps, statusNote)).filter(tool => tool && tool.trim().length > 0)
    )
  );

  const metadata = executionMetadataSchema.safeParse({
    steps_taken: steps.length,
    tool_call_count: summariseToolUsage(steps),
    thinking_time_ms: Math.max(0, totalTime - toolExec),
    tool_execution_time_ms: toolExec,
    total_time_ms: totalTime,
    error_count: errorCount,
    success_rate: Number(successRate.toFixed(2)),
    status_note: statusNote,
    failed_tools: failedTools,
  });

  if (!metadata.success) {
    const fallback: ExecutionMetadata = {
      steps_taken: steps.length,
      tool_call_count: summariseToolUsage(steps),
      thinking_time_ms: Math.max(0, totalTime - toolExec),
      tool_execution_time_ms: toolExec,
      total_time_ms: totalTime,
      error_count: errorCount,
      success_rate: Math.max(0, Math.min(1, successRate)),
      status_note: statusNote ?? null,
      failed_tools: failedTools,
    };

    console.error('[ResultParser] Failed to validate execution metadata', metadata.error.flatten());
    return fallback;
  }

  return metadata.data;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIDENCE_LOW;
  }

  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}

export function buildConfidenceScores(taskIds: string[]): Record<string, number> {
  if (taskIds.length === 0) {
    return {};
  }

  const maxIndex = Math.max(1, taskIds.length - 1);

  return taskIds.reduce<Record<string, number>>((scores, taskId, index) => {
    const weight = 1 - index / maxIndex;
    const confidence = DEFAULT_CONFIDENCE_LOW + (DEFAULT_CONFIDENCE_HIGH - DEFAULT_CONFIDENCE_LOW) * weight;
    scores[taskId] = clampConfidence(confidence);
    return scores;
  }, {});
}

export function generateFallbackPlan(tasks: TaskSummary[], outcomeSummary: string): PrioritizedTaskPlan {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('No tasks available to generate fallback prioritized plan');
  }

  const uniqueTasks = tasks.filter((task, index, array) => {
    return array.findIndex(t => t.task_id === task.task_id) === index;
  });

  uniqueTasks.sort((a, b) => a.task_text.localeCompare(b.task_text));

  const orderedTaskIds = uniqueTasks.map(task => task.task_id);

  const executionWaves = buildDefaultExecutionWaves(orderedTaskIds);
  const dependencies: TaskDependency[] = [];

  const planCandidate = {
    ordered_task_ids: orderedTaskIds,
    execution_waves: executionWaves,
    dependencies,
    confidence_scores: buildConfidenceScores(orderedTaskIds),
    synthesis_summary: outcomeSummary,
    task_annotations: [],
    removed_tasks: [],
  };

  return prioritizedPlanSchema.parse(planCandidate);
}

export function generateFallbackTrace(
  tasks: TaskSummary[],
  plan: PrioritizedTaskPlan,
  options?: { narrative?: string | null }
): ReasoningStep[] {
  const summariseNarrative = (text: string): string => {
    const withoutCode = text.replace(/```[\s\S]*?```/g, ' ');
    const cleaned = withoutCode
      .replace(/[#*_`]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) {
      return '';
    }

    const patterns: Array<{ test: (value: string) => boolean; summary: string }> = [
      {
        test: value => /no tasks were found/i.test(value) || /no tasks were directly related/i.test(value),
        summary: 'No tasks matched the goal; sharing a fallback plan grouped by usefulness.',
      },
      {
        test: value => /clustering process/i.test(value),
        summary: 'Tasks did not cluster; organizing them into simple waves instead.',
      },
      {
        test: value => /manual assessment/i.test(value),
        summary: 'Using a lightweight manual ordering since automatic alignment failed.',
      },
    ];

    for (const pattern of patterns) {
      if (pattern.test(cleaned)) {
        return condenseThoughtText(pattern.summary) ?? pattern.summary;
      }
    }

    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length === 0) {
      return condenseThoughtText(cleaned) ?? '';
    }

    return condenseThoughtText(sentences[0]) ?? sentences[0];
  };

  const callTimestamp = new Date();
  const baseTime = callTimestamp.getTime();

  const steps: RawTraceStep[] = [];
  let elapsedMs = 0;

  const pushStep = (payload: {
    thought: string | null;
    tool_name: string | null;
    tool_input: unknown;
    tool_output: unknown;
    duration_ms: number;
    status?: ReasoningStep['status'];
  }) => {
    const stepNumber = steps.length + 1;
    const timestamp = new Date(baseTime + elapsedMs).toISOString();

    steps.push({
      step_number: stepNumber,
      timestamp,
      thought: payload.thought,
      tool_name: payload.tool_name,
      tool_input: payload.tool_input,
      tool_output: payload.tool_output,
      duration_ms: payload.duration_ms,
      status: payload.status ?? 'success',
    });

    elapsedMs += Math.max(0, payload.duration_ms);
  };

  const trimmedNarrative = options?.narrative?.trim();
  if (trimmedNarrative && trimmedNarrative.length > 0) {
    pushStep({
      thought: summariseNarrative(trimmedNarrative),
      tool_name: null,
      tool_input: null,
      tool_output: null,
      duration_ms: 15,
    });
  }

  pushStep({
    thought: `Collected ${tasks.length} tasks from stored embeddings to use as candidate work.`,
    tool_name: null,
    tool_input: null,
    tool_output: {
      task_sample: tasks.slice(0, 3).map(task => ({ task_id: task.task_id, text: task.task_text })),
    },
    duration_ms: 20,
  });

  pushStep({
    thought: 'Sorted tasks lexicographically to provide deterministic prioritization.',
    tool_name: 'semantic-search',
    tool_input: { strategy: 'lexicographic-sort' },
    tool_output: { ordered_task_ids: plan.ordered_task_ids.slice(0, 5) },
    duration_ms: 30,
  });

  pushStep({
    thought: 'Chunked tasks into execution waves of up to five items each.',
    tool_name: 'cluster-by-similarity',
    tool_input: { chunk_size: 5 },
    tool_output: {
      execution_waves: plan.execution_waves.map(wave => ({
        wave_number: wave.wave_number,
        size: wave.task_ids.length,
      })),
    },
    duration_ms: 25,
  });

  return normalizeReasoningSteps(steps);
}

export function ensurePlanConsistency(plan: PrioritizedTaskPlan): PrioritizedTaskPlan {
  const uniqueIds = Array.from(new Set(plan.ordered_task_ids));
  const updatedWaves = plan.execution_waves.map(wave => {
    const filtered = wave.task_ids.filter(taskId => uniqueIds.includes(taskId));
    return executionWaveSchema.parse({
      ...wave,
      task_ids: filtered,
    });
  });

  const sanitizedDependencies = plan.dependencies.filter(dep =>
    uniqueIds.includes(dep.source_task_id) && uniqueIds.includes(dep.target_task_id)
  ).map(dep => taskDependencySchema.parse(dep));

  const filteredAnnotations = Array.isArray(plan.task_annotations)
    ? plan.task_annotations.filter(
        annotation =>
          annotation &&
          typeof annotation.task_id === 'string' &&
          (uniqueIds.includes(annotation.task_id) || annotation.state === 'manual_override')
      )
    : [];

  const annotationMap = new Map<string, TaskAnnotation>();
  filteredAnnotations.forEach(annotation => {
    annotationMap.set(annotation.task_id, annotation);
  });

  uniqueIds.forEach(taskId => {
    if (annotationMap.has(taskId)) {
      return;
    }
    const candidate: Record<string, unknown> = {
      task_id: taskId,
      state: 'active',
    };
    const confidence = plan.confidence_scores?.[taskId];
    if (typeof confidence === 'number' && Number.isFinite(confidence)) {
      candidate.confidence = clampConfidence(confidence);
    }
    const parsed = taskAnnotationSchema.safeParse(candidate);
    if (parsed.success) {
      annotationMap.set(taskId, parsed.data);
    }
  });

  const canonicalAnnotations = Array.from(annotationMap.values());

  const filteredRemovals = Array.isArray(plan.removed_tasks)
    ? plan.removed_tasks.filter(
        removal => removal && typeof removal.task_id === 'string'
      )
    : [];

  return prioritizedPlanSchema.parse({
    ...plan,
    ordered_task_ids: uniqueIds,
    execution_waves: updatedWaves,
    dependencies: sanitizedDependencies,
    confidence_scores: plan.confidence_scores,
    task_annotations: canonicalAnnotations,
    removed_tasks: filteredRemovals,
  });
}

export function buildPlanSummary(context: AgentRuntimeContext): string {
  const { outcome, metadata } = context;
  return [
    `Fallback prioritization for outcome "${outcome.assembled_text}".`,
    `Task count: ${metadata.task_count}.`,
    metadata.reflection_count > 0 ? `Reflections considered: ${metadata.reflection_count}.` : 'No recent reflections available.',
    'Ordering derived from document task list while agent runtime is unavailable.',
  ].join(' ');
}
