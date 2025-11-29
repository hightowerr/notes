import { SupabaseClient } from '@supabase/supabase-js';

import { initializeMastra } from '@/lib/mastra/init';
import {
  createPrioritizationAgent,
  generatePrioritizationInstructions,
  type PrioritizationContext,
} from '@/lib/mastra/agents/prioritizationGenerator';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/lib/types/supabase';
import { Telemetry } from '@mastra/core';

const supabase = getSupabaseAdminClient();

export type ManualTaskAnalysisResult = {
  status: 'prioritized' | 'not_relevant' | 'conflict' | 'analyzing';
  rank?: number;
  placementReason?: string;
  exclusionReason?: string;
  conflictDetails?: {
    duplicateTaskId: string;
    similarityScore: number;
    existingTaskText: string;
  };
};

export class ManualTaskPlacementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualTaskPlacementError';
  }
}

export class ManualTaskNotFoundError extends ManualTaskPlacementError {
  constructor() {
    super('Manual task not found');
    this.name = 'ManualTaskNotFoundError';
  }
}

export class ManualTaskInvalidStateError extends ManualTaskPlacementError {
  constructor(message = 'Task is not in discard pile') {
    super(message);
    this.name = 'ManualTaskInvalidStateError';
  }
}

type ManualTaskRow = {
  task_id: string;
  status: ManualTaskAnalysisResult['status'];
  agent_rank?: number | null;
  placement_reason?: string | null;
  exclusion_reason?: string | null;
  outcome_id?: string | null;
  duplicate_task_id?: string | null;
  similarity_score?: number | null;
  deleted_at?: string | null;
  task_text?: string | null;
};

type OutcomeRow = {
  id: string;
  assembled_text?: string | null;
  direction?: string | null;
  object_text?: string | null;
  metric_text?: string | null;
  clarifier?: string | null;
  is_active?: boolean | null;
};

type SupabaseDbClient = SupabaseClient<Database>;

async function fetchManualTask(
  taskId: string,
  client: SupabaseDbClient = supabase
): Promise<ManualTaskRow> {
  const { data, error } = await client
    .from('manual_tasks')
    .select('*')
    .eq('task_id', taskId)
    .is('deleted_at', null)
    .maybeSingle<ManualTaskRow>();

  if (error) {
    throw new ManualTaskPlacementError(error.message ?? 'Failed to load manual task');
  }

  if (!data) {
    throw new ManualTaskNotFoundError();
  }

  return data;
}

async function fetchOutcome(
  outcomeId: string,
  client: SupabaseDbClient = supabase
): Promise<OutcomeRow | null> {
  const { data, error } = await client
    .from('user_outcomes')
    .select('id, assembled_text, direction, object_text, metric_text, clarifier, is_active')
    .eq('id', outcomeId)
    .maybeSingle<OutcomeRow>();

  if (error) {
    throw new ManualTaskPlacementError(error.message ?? 'Failed to load outcome');
  }

  return data;
}

function buildOutcomeText(outcome: OutcomeRow | null): string {
  if (!outcome) return 'No active outcome provided';
  if (outcome.assembled_text) return outcome.assembled_text;
  const parts = [outcome.direction, outcome.object_text, outcome.metric_text, outcome.clarifier]
    .filter(Boolean)
    .join(' ');
  return parts || 'No active outcome provided';
}

async function fetchTaskText(taskId: string, client: SupabaseDbClient = supabase) {
  const { data, error } = await client
    .from('task_embeddings')
    .select('task_text')
    .eq('task_id', taskId)
    .maybeSingle<{ task_text: string }>();

  if (error) {
    throw new ManualTaskPlacementError(error.message ?? 'Failed to load task text');
  }

  return data?.task_text ?? '';
}

function mapAgentDecision(result: Record<string, any>): ManualTaskAnalysisResult {
  console.info('[ManualTaskPlacement] Mapping agent decision', {
    decision: result?.decision,
    agent_rank: result?.agent_rank,
    placement_reason: result?.placement_reason,
    exclusion_reason: result?.exclusion_reason,
    duplicate_task_id: result?.duplicate_task_id,
    similarity_score: result?.similarity_score,
  });
  if (result?.decision === 'include') {
    return {
      status: 'prioritized',
      rank: typeof result.agent_rank === 'number' ? result.agent_rank : undefined,
      placementReason: result.placement_reason ?? result.reason ?? 'Agent included manual task',
    };
  }

  if (result?.decision === 'exclude') {
    return {
      status: 'not_relevant',
      exclusionReason:
        result.exclusion_reason ??
        result.reason ??
        'Agent excluded manual task due to low alignment',
    };
  }

  if (result?.decision === 'conflict') {
    return {
      status: 'conflict',
      conflictDetails: {
        duplicateTaskId: result.duplicate_task_id ?? '',
        similarityScore: typeof result.similarity_score === 'number' ? result.similarity_score : 0,
        existingTaskText: result.existing_task_text ?? '',
      },
    };
  }

  return {
    status: 'not_relevant',
    exclusionReason: 'Agent analysis failed - default exclusion (confidence: 0.2)',
  };
}

function removeLegacyManualBoost(instructions: string): string {
  if (!instructions) return instructions;
  // Guard against older prompt templates that mention a 1.2x manual task boost.
  return instructions.replace(/\*\*MANUAL TASK BOOST\*\*:[^\n]*\n?/gi, '');
}

function isTimeoutError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === 'ETIMEDOUT' || code === 'ETIME' || code === 'ECONNABORTED') {
    return true;
  }
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? '');
  return message.toLowerCase().includes('timeout');
}

export async function analyzeManualTask(params: {
  taskId: string;
  taskText: string;
  outcomeId: string;
}): Promise<ManualTaskAnalysisResult> {
  if (!params.taskId || !params.taskText) {
    throw new ManualTaskPlacementError('taskId and taskText are required');
  }

  const manualTask = await fetchManualTask(params.taskId);
  const outcome = await fetchOutcome(params.outcomeId);

  if (!outcome?.is_active) {
    console.info('[ManualTaskPlacement] Skipping analysis (inactive outcome)', {
      taskId: params.taskId,
      outcomeId: params.outcomeId,
      status: manualTask.status,
    });
    return { status: 'analyzing' };
  }

  const context: PrioritizationContext = {
    outcome: buildOutcomeText(outcome),
    reflections: 'Manual task placement',
    taskCount: 1,
    newTaskCount: 1,
    tasks: params.taskText,
    previousPlan: 'N/A',
    dependencyConstraints: 'None',
    baselineSummary: 'Manual task placement request',
  };

  const instructions = removeLegacyManualBoost(generatePrioritizationInstructions(context));
  const agent = createPrioritizationAgent(instructions, initializeMastra());
  const start = performance.now ? performance.now() : Date.now();

  let analysis: ManualTaskAnalysisResult;
  try {
    console.info('[ManualTaskPlacement] Running agent for manual task', {
      taskId: params.taskId,
      outcomeId: params.outcomeId,
      manualStatus: manualTask.status,
      placementReason: manualTask.placement_reason,
      exclusionReason: manualTask.exclusion_reason,
      instructionsPreview: instructions.slice(0, 200),
    });
    const agentResult = await agent.run({
      task_id: params.taskId,
      task_text: params.taskText,
      outcome_id: params.outcomeId,
      is_manual: true,
    });
    console.info('[ManualTaskPlacement] Agent raw result', {
      taskId: params.taskId,
      rawDecision: agentResult?.decision,
      rawRank: agentResult?.agent_rank,
      rawPlacementReason: agentResult?.placement_reason,
      rawExclusionReason: agentResult?.exclusion_reason,
      fullResult: agentResult,
    });
    analysis = mapAgentDecision(agentResult);
    console.info('[ManualTaskPlacement] Agent result', {
      taskId: params.taskId,
      decision: agentResult?.decision,
      rank: agentResult?.agent_rank,
      placement_reason: agentResult?.placement_reason,
      exclusion_reason: agentResult?.exclusion_reason,
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn('[manualTaskPlacement] Agent timeout, keeping task in analyzing state');
      return { status: 'analyzing' };
    }
    console.error('[manualTaskPlacement] Agent analysis failed', error);
    analysis = {
      status: 'not_relevant',
      exclusionReason: 'Agent analysis failed - default exclusion (confidence: 0.2)',
    };
  }

  const updatePayload: Partial<ManualTaskRow> = {
    status: analysis.status,
    agent_rank: analysis.rank ?? null,
    placement_reason: analysis.placementReason ?? null,
    exclusion_reason: analysis.exclusionReason ?? null,
    duplicate_task_id: analysis.conflictDetails?.duplicateTaskId ?? null,
    similarity_score: analysis.conflictDetails?.similarityScore ?? null,
  };

  console.info('[ManualTaskPlacement] Persisting analysis outcome', {
    taskId: manualTask.task_id,
    updatePayload,
  });

  await supabase.from('manual_tasks').update(updatePayload).eq('task_id', manualTask.task_id);

  // Telemetry: record latency and decision distribution
  const durationMs = (performance.now ? performance.now() : Date.now()) - start;
  const activeSpan = typeof Telemetry.getActiveSpan === 'function' ? Telemetry.getActiveSpan() : undefined;
  activeSpan?.setAttribute('manual_task.analysis_duration_ms', durationMs);
  activeSpan?.setAttribute('manual_task.status', analysis.status);
  if (analysis.rank) {
    activeSpan?.setAttribute('manual_task.rank', analysis.rank);
  }
  if (analysis.exclusionReason) {
    activeSpan?.setAttribute('manual_task.exclusion_reason', analysis.exclusionReason);
  }

  return analysis;
}

export async function getAnalysisStatus(
  taskId: string,
  client: SupabaseDbClient = supabase
): Promise<{
  status: ManualTaskAnalysisResult['status'];
  agent_rank?: number | null;
  placement_reason?: string | null;
  exclusion_reason?: string | null;
  duplicate_task_id?: string | null;
  similarity_score?: number | null;
}> {
  if (!taskId) {
    throw new ManualTaskPlacementError('taskId is required');
  }

  const manualTask = await fetchManualTask(taskId, client);

  return {
    status: manualTask.status,
    agent_rank: manualTask.agent_rank ?? null,
    placement_reason: manualTask.placement_reason ?? null,
    exclusion_reason: manualTask.exclusion_reason ?? null,
    duplicate_task_id: manualTask.duplicate_task_id ?? null,
    similarity_score: manualTask.similarity_score ?? null,
  };
}

export async function overrideDiscardDecision(params: {
  taskId: string;
  userJustification?: string;
}) {
  const { taskId, userJustification } = params;
  if (!taskId) {
    throw new ManualTaskPlacementError('taskId is required');
  }

  const manualTask = await fetchManualTask(taskId);
  if (manualTask.status !== 'not_relevant') {
    throw new ManualTaskInvalidStateError();
  }

  const taskText = await fetchTaskText(taskId);

  // Reset status and clear exclusion reason before re-analysis
  const { error: updateError } = await supabase
    .from('manual_tasks')
    .update({
      status: 'analyzing',
      exclusion_reason: null,
      placement_reason: manualTask.placement_reason ?? null,
    })
    .eq('task_id', taskId);

  if (updateError) {
    throw new ManualTaskPlacementError(updateError.message ?? 'Failed to reset manual task status');
  }

  // Fire-and-forget re-analysis
  void analyzeManualTask({
    taskId,
    taskText,
    outcomeId: manualTask.outcome_id ?? '',
  }).catch(error => {
    console.error('[manualTaskPlacement] override analysis failed', error);
  });
}

export async function invalidateManualTasks(params: { outcomeId: string }) {
  const { outcomeId } = params;
  if (!outcomeId) {
    throw new ManualTaskPlacementError('outcomeId is required');
  }

  const { data, error } = await supabase
    .from('manual_tasks')
    .update({
      status: 'not_relevant',
      exclusion_reason: 'Goal changed - manual tasks invalidated',
    })
    .eq('outcome_id', outcomeId)
    .eq('status', 'prioritized')
    .select('task_id');

  if (error) {
    throw new ManualTaskPlacementError(error.message ?? 'Failed to invalidate manual tasks');
  }

  return { invalidatedCount: data?.length ?? 0 };
}
