import { z } from 'zod';

import {
  prioritizedPlanSchema,
  executionWaveSchema,
  taskDependencySchema,
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
  TaskSummary,
} from '@/lib/types/agent';

type MaybePlan =
  | { success: true; plan: PrioritizedTaskPlan }
  | { success: false; error: Error };

type RawTraceStep = Record<string, unknown>;

const DEFAULT_CONFIDENCE_LOW = 0.55;
const DEFAULT_CONFIDENCE_HIGH = 0.9;

export function parsePlanFromAgentResponse(raw: unknown): MaybePlan {
  if (raw === null || typeof raw === 'undefined') {
    return { success: false, error: new Error('Empty response from agent') };
  }

  try {
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error('Agent response string is empty');
      }

      const parsed = JSON.parse(trimmed);
      const result = prioritizedPlanSchema.parse(parsed);
      return { success: true, plan: result };
    }

    if (typeof raw === 'object') {
      const result = prioritizedPlanSchema.parse(raw);
      return { success: true, plan: result };
    }

    throw new Error('Unsupported agent response format');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: new Error(`Failed to parse agent output: ${message}`) };
  }
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

      try {
        return reasoningStepSchema.parse(base);
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

export function buildExecutionMetadata(options: {
  steps: ReasoningStep[];
  startedAt: number;
  completedAt: number;
  toolExecutionTimeMs?: number;
  errors?: number;
}): ExecutionMetadata {
  const { steps, startedAt, completedAt } = options;
  const totalTime = Math.max(0, Math.round(completedAt - startedAt));
  const toolExec = options.toolExecutionTimeMs ?? steps.reduce((sum, step) => sum + step.duration_ms, 0);
  const errorCount = options.errors ?? steps.filter(step => step.status === 'failed').length;
  const successCount = steps.length - errorCount;
  const successRate = steps.length === 0 ? 1 : successCount / steps.length;

  const metadata = executionMetadataSchema.safeParse({
    steps_taken: steps.length,
    tool_call_count: summariseToolUsage(steps),
    thinking_time_ms: Math.max(0, totalTime - toolExec),
    tool_execution_time_ms: toolExec,
    total_time_ms: totalTime,
    error_count: errorCount,
    success_rate: Number(successRate.toFixed(2)),
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

  const chunkSize = 5;
  const executionWaves: ExecutionWave[] = [];
  for (let i = 0; i < orderedTaskIds.length; i += chunkSize) {
    const chunk = orderedTaskIds.slice(i, i + chunkSize);
    executionWaves.push(
      executionWaveSchema.parse({
        wave_number: executionWaves.length + 1,
        task_ids: chunk,
        parallel_execution: chunk.length > 1,
        estimated_duration_hours: null,
      })
    );
  }

  const dependencies: TaskDependency[] = [];

  const planCandidate = {
    ordered_task_ids: orderedTaskIds,
    execution_waves: executionWaves,
    dependencies,
    confidence_scores: buildConfidenceScores(orderedTaskIds),
    synthesis_summary: outcomeSummary,
  };

  return prioritizedPlanSchema.parse(planCandidate);
}

export function generateFallbackTrace(tasks: TaskSummary[], plan: PrioritizedTaskPlan): ReasoningStep[] {
  const callTimestamp = new Date();

  const steps: RawTraceStep[] = [
    {
      step_number: 1,
      timestamp: callTimestamp.toISOString(),
      thought: `Collected ${tasks.length} tasks from stored embeddings to use as candidate work.`,
      tool_name: null,
      tool_input: null,
      tool_output: {
        task_sample: tasks.slice(0, 3).map(task => ({ task_id: task.task_id, text: task.task_text })),
      },
      duration_ms: 20,
      status: 'success',
    },
    {
      step_number: 2,
      timestamp: new Date(callTimestamp.getTime() + 20).toISOString(),
      thought: 'Sorted tasks lexicographically to provide deterministic prioritization.',
      tool_name: 'semantic-search',
      tool_input: { strategy: 'lexicographic-sort' },
      tool_output: { ordered_task_ids: plan.ordered_task_ids.slice(0, 5) },
      duration_ms: 30,
      status: 'success',
    },
    {
      step_number: 3,
      timestamp: new Date(callTimestamp.getTime() + 55).toISOString(),
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
      status: 'success',
    },
  ];

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

  return prioritizedPlanSchema.parse({
    ...plan,
    ordered_task_ids: uniqueIds,
    execution_waves: updatedWaves,
    dependencies: sanitizedDependencies,
    confidence_scores: plan.confidence_scores,
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
