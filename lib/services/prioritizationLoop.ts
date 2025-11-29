import { performance } from 'node:perf_hooks';

import { createPrioritizationAgent, generatePrioritizationInstructions, type PrioritizationContext } from '@/lib/mastra/agents/prioritizationGenerator';
import { prioritizationEvaluator } from '@/lib/mastra/agents/prioritizationEvaluator';
import { initializeMastra } from '@/lib/mastra/init';
import { evaluationResultSchema, type EvaluationResult } from '@/lib/schemas/evaluationResultSchema';
import {
  hybridLoopMetadataSchema,
  type ChainOfThoughtStep,
  type HybridLoopMetadata,
} from '@/lib/schemas/hybridLoopMetadataSchema';
import {
  prioritizationResultSchema,
  type PrioritizationResult,
} from '@/lib/schemas/prioritizationResultSchema';
import type { PrioritizedTaskPlan, TaskDependency, TaskSummary } from '@/lib/types/agent';

type AgentLike = {
  generate: (messages: unknown[], options?: Record<string, unknown>) => Promise<unknown>;
};

export type PrioritizationLoopOptions = {
  tasks: TaskSummary[];
  outcome: string;
  reflections: string[];
  previousPlan?: PrioritizedTaskPlan;
  dependencyOverrides?: TaskDependency[];
  maxIterations?: number;
  onProgress?: (update: PrioritizationProgressUpdate) => void;
};

export type PrioritizationLoopDependencies = {
  createGeneratorAgent?: (instructions: string) => AgentLike;
  evaluatorAgent?: AgentLike;
};

export type PrioritizationLoopResult = {
  plan: PrioritizedTaskPlan;
  result: PrioritizationResult;
  metadata: HybridLoopMetadata;
  evaluation?: EvaluationResult;
};

export type PrioritizationProgressUpdate = {
  stage: 'started' | 'draft' | 'refining' | 'completed';
  iteration: number;
  totalIterations: number;
  totalTasks: number;
  scoredTasks: number;
  orderedCount: number;
  confidence: number;
  progressPct: number;
  plan?: PrioritizedTaskPlan;
};

const DEFAULT_MAX_ITERATIONS = 3;
const MIN_ITERATIONS = 1;

export function needsEvaluation(
  result: PrioritizationResult,
  previousPlan?: PrioritizedTaskPlan
): boolean {
  if (result.confidence >= 0.85) {
    return false;
  }

  if (result.confidence < 0.7) {
    return true;
  }

  if (result.included_tasks.length < 10) {
    return true;
  }

  if ((result.corrections_made?.length ?? 0) > 100) {
    return true;
  }

  if (previousPlan && hasMajorMovement(result, previousPlan)) {
    return true;
  }

  return false;
}

export function hasMajorMovement(
  result: PrioritizationResult,
  previousPlan: PrioritizedTaskPlan
): boolean {
  if (!previousPlan?.ordered_task_ids?.length || !result.ordered_task_ids.length) {
    return false;
  }

  const previousPositions = new Map<string, number>();
  previousPlan.ordered_task_ids.forEach((taskId, index) => {
    previousPositions.set(taskId, index + 1);
  });

  let majorMoves = 0;
  result.ordered_task_ids.forEach((taskId, index) => {
    const previousPos = previousPositions.get(taskId);
    if (typeof previousPos === 'number' && Math.abs(previousPos - (index + 1)) > 5) {
      majorMoves++;
    }
  });

  if (result.ordered_task_ids.length === 0) {
    return false;
  }

  return majorMoves / result.ordered_task_ids.length > 0.3;
}

export async function prioritizeWithHybridLoop(
  options: PrioritizationLoopOptions,
  dependencies: PrioritizationLoopDependencies = {}
): Promise<PrioritizationLoopResult> {
  const {
    tasks,
    outcome,
    reflections,
    previousPlan,
    dependencyOverrides = [],
    maxIterations = DEFAULT_MAX_ITERATIONS,
    onProgress,
  } = options;

  const clampedMaxIterations = Math.min(
    DEFAULT_MAX_ITERATIONS,
    Math.max(MIN_ITERATIONS, Math.floor(maxIterations))
  );
  const totalTasks = tasks.length;

  const generatorContext = buildGeneratorContext({
    tasks,
    outcome,
    reflections,
    previousPlan,
    dependencyOverrides,
  });

  const generatorFactory =
    dependencies.createGeneratorAgent ??
    ((instructions: string) => createPrioritizationAgent(instructions, initializeMastra()));
  const evaluatorAgent = dependencies.evaluatorAgent ?? prioritizationEvaluator;

  const startTime = performance.now();
  const chainOfThought: ChainOfThoughtStep[] = [];

  let iteration = 1;
  let converged = false;
  let evaluationTriggered = false;
  let lastEvaluation: EvaluationResult | undefined;

  reportProgress(onProgress, {
    stage: 'started',
    iteration: 0,
    totalIterations: clampedMaxIterations,
    totalTasks,
    scoredTasks: 0,
    orderedCount: 0,
    confidence: 0,
  });

  const initialInstructions = buildGeneratorInstructions(generatorContext, iteration, clampedMaxIterations);
  let currentResult = await runGeneratorIterationWithRetry(generatorFactory, initialInstructions);
  chainOfThought.push(createChainStep(iteration, currentResult));
  reportProgress(onProgress, {
    stage: 'draft',
    iteration,
    totalIterations: clampedMaxIterations,
    totalTasks,
    scoredTasks: currentResult.included_tasks.length + currentResult.excluded_tasks.length,
    orderedCount: currentResult.ordered_task_ids.length,
    confidence: currentResult.confidence,
    plan: convertResultToPlan(currentResult),
  });

  const shouldEvaluate = needsEvaluation(currentResult, previousPlan);
  evaluationTriggered = shouldEvaluate;

  if (shouldEvaluate) {
    while (true) {
      const evaluation = await runEvaluator(evaluatorAgent, currentResult, generatorContext);

      if (!evaluation) {
        // Evaluation failed to parse; return best effort
        converged = false;
        break;
      }

      lastEvaluation = evaluation;
      applyEvaluationFeedback(chainOfThought, evaluation.feedback);

      if (evaluation.status === 'PASS') {
        converged = true;
        break;
      }

      if (iteration >= clampedMaxIterations) {
        converged = false;
        break;
      }

      iteration += 1;
      const refinementInstructions = buildGeneratorInstructions(generatorContext, iteration, clampedMaxIterations, {
        evaluationFeedback: evaluation.feedback,
        chainOfThought,
      });

      currentResult = await runGeneratorIterationWithRetry(generatorFactory, refinementInstructions);
      chainOfThought.push(createChainStep(iteration, currentResult));
      reportProgress(onProgress, {
        stage: 'refining',
        iteration,
        totalIterations: clampedMaxIterations,
        totalTasks,
        scoredTasks: currentResult.included_tasks.length + currentResult.excluded_tasks.length,
        orderedCount: currentResult.ordered_task_ids.length,
        confidence: currentResult.confidence,
        plan: convertResultToPlan(currentResult),
      });
    }
  } else {
    converged = true;
  }

  const duration = Math.max(0, Math.round(performance.now() - startTime));
  const plan = convertResultToPlan(currentResult);

  const metadata = hybridLoopMetadataSchema.parse({
    iterations: chainOfThought.length,
    duration_ms: duration,
    evaluation_triggered: evaluationTriggered,
    chain_of_thought: chainOfThought,
    converged,
    final_confidence: currentResult.confidence,
  });

  reportProgress(onProgress, {
    stage: 'completed',
    iteration,
    totalIterations: clampedMaxIterations,
    totalTasks,
    scoredTasks: currentResult.included_tasks.length + currentResult.excluded_tasks.length,
    orderedCount: currentResult.ordered_task_ids.length,
    confidence: currentResult.confidence,
    plan,
  });

  return {
    plan,
    result: currentResult,
    metadata,
    evaluation: lastEvaluation,
  };
}

function reportProgress(
  handler: PrioritizationLoopOptions['onProgress'],
  update: Omit<PrioritizationProgressUpdate, 'progressPct'>
): void {
  if (!handler) {
    return;
  }

  const { iteration, totalIterations, totalTasks, scoredTasks, stage } = update;
  const coverage = totalTasks > 0 ? Math.min(scoredTasks / totalTasks, 1) : 0;
  const iterationRatio = totalIterations > 0 ? Math.min(iteration / totalIterations, 1) : 0;
  const blended = Math.max(0, Math.min(0.95, 0.35 * coverage + 0.25 * iterationRatio));
  const progressPct =
    stage === 'completed' ? 1 : Math.max(update.scoredTasks === 0 ? 0 : 0.05, blended);

  handler({
    ...update,
    progressPct,
  });
}

export function convertResultToPlan(result: PrioritizationResult): PrioritizedTaskPlan {
  const confidence_scores: Record<string, number> = {};
  Object.values(result.per_task_scores).forEach(score => {
    if (!score) {
      return;
    }
    confidence_scores[score.task_id] = score.confidence;
  });

  const task_annotations = result.included_tasks.map(task => ({
    task_id: task.task_id,
    reasoning: task.inclusion_reason,
    confidence: result.per_task_scores[task.task_id]?.confidence,
  }));

  const removed_tasks = result.excluded_tasks.map(task => ({
    task_id: task.task_id,
    removal_reason: task.exclusion_reason,
  }));

  const execution_waves = [
    {
      wave_number: 1,
      task_ids: result.ordered_task_ids,
      parallel_execution: false,
    },
  ];

  const dependencies: TaskDependency[] = [];
  Object.values(result.per_task_scores).forEach(score => {
    if (score?.dependencies && Array.isArray(score.dependencies)) {
      score.dependencies.forEach(depId => {
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
    excluded_tasks: result.excluded_tasks,
    created_at: new Date().toISOString(),
  };
}

type GeneratorContextInput = {
  tasks: TaskSummary[];
  outcome: string;
  reflections: string[];
  previousPlan?: PrioritizedTaskPlan;
  dependencyOverrides: TaskDependency[];
};

function buildGeneratorContext(input: GeneratorContextInput): PrioritizationContext & {
  reflectionsText: string;
  previousPlanText: string;
} {
  const reflectionsText =
    input.reflections.length > 0
      ? input.reflections.map(line => `- ${line}`).join('\n')
      : 'No active reflections.';

  const tasksText = input.tasks
    .map(task =>
      JSON.stringify({
        id: task.task_id,
        text: task.task_text,
        source: task.source ?? 'embedding',
        is_manual: Boolean(task.manual_override || task.previous_state === 'manual_override'),
      })
    )
    .join('\n');

  const previousPlanText = input.previousPlan
    ? JSON.stringify(input.previousPlan, null, 2)
    : 'No previous plan available.';

  const dependencyText =
    input.dependencyOverrides.length > 0
      ? input.dependencyOverrides
          .map(
            dep =>
              `- ${dep.source_task_id} ${dep.relationship_type} ${dep.target_task_id} (Confidence: ${dep.confidence})`
          )
          .join('\n')
      : 'No manual dependency overrides.';

  return {
    outcome: input.outcome,
    reflections: reflectionsText,
    taskCount: input.tasks.length,
    tasks: tasksText,
    previousPlan: previousPlanText,
    dependencyConstraints: dependencyText,
    reflectionsText,
    previousPlanText,
  };
}

type InstructionExtras = {
  evaluationFeedback?: string;
  chainOfThought?: ChainOfThoughtStep[];
};

function buildGeneratorInstructions(
  context: ReturnType<typeof buildGeneratorContext>,
  iteration: number,
  maxIterations: number,
  extras: InstructionExtras = {}
): string {
  let instructions = generatePrioritizationInstructions({
    outcome: context.outcome,
    reflections: context.reflections,
    taskCount: context.taskCount,
    tasks: context.tasks,
    previousPlan: context.previousPlan,
    dependencyConstraints: context.dependencyConstraints,
  });

  instructions += `\n\n## ITERATION CONTEXT\nYou are running iteration ${iteration} of ${maxIterations}.`;

  if (extras.chainOfThought?.length) {
    instructions += `\n\n## PRIOR ITERATION SUMMARY\n${summarizeChainOfThought(extras.chainOfThought)}`;
  }

  if (extras.evaluationFeedback) {
    instructions += `\n\n## EVALUATION FEEDBACK TO ADDRESS\n${extras.evaluationFeedback}`;
  }

  return instructions;
}

function summarizeChainOfThought(steps: ChainOfThoughtStep[]): string {
  return steps
    .map(step => {
      const base = `Iteration ${step.iteration}: confidence ${step.confidence.toFixed(
        2
      )}. Corrections: ${step.corrections || 'N/A'}.`;
      return step.evaluator_feedback
        ? `${base} Evaluator feedback: ${step.evaluator_feedback}`
        : base;
    })
    .join('\n');
}

async function runGeneratorIteration(
  factory: (instructions: string) => AgentLike,
  instructions: string
): Promise<PrioritizationResult> {
  const agent = factory(instructions);
  const response = await agent.generate([], {
    maxSteps: 1,
    toolChoice: 'none',
    response_format: { type: 'json_object' },
  });

  const payload = extractAgentPayload(response);
  try {
    const json = typeof payload === 'string' ? safeJsonParse(payload) : payload;
    const prepared = normalizePerTaskScores(json);
    return prioritizationResultSchema.parse(prepared);
  } catch (error) {
    const validationError = new Error(
      `[PrioritizationLoop] Generator returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    (validationError as any).code = 'GENERATOR_VALIDATION_FAILED';
    (validationError as any).payload = (() => {
      try {
        const json = typeof payload === 'string' ? safeJsonParse(payload) : payload;
        return normalizePerTaskScores(json);
      } catch {
        return undefined;
      }
    })();
    throw validationError;
  }
}

async function runGeneratorIterationWithRetry(
  factory: (instructions: string) => AgentLike,
  instructions: string,
  maxAttempts = 3
): Promise<PrioritizationResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const instructionsWithHint =
      attempt === 1
        ? instructions
        : [
            instructions,
            '',
            `## RETRY HINT ${attempt}`,
            'Ensure every included task has brief_reasoning (<=20 words), outcome/dependency linked, no generic phrases like "important" or "critical".',
          ].join('\n');
    try {
      return await runGeneratorIteration(factory, instructionsWithHint);
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string })?.code;
      const isRetryable = code === 'GENERATOR_VALIDATION_FAILED';
      console.log(
        `[PrioritizationLoop] Generator attempt ${attempt} failed`,
        error instanceof Error ? error.message : error
      );
      if (!isRetryable && attempt === maxAttempts) {
        break;
      }
      if (attempt === maxAttempts && isRetryable) {
        const fallbackPayload = (error as any).payload;
        if (fallbackPayload && typeof fallbackPayload === 'object') {
          try {
            applyBriefReasoningFallbackToPayload(fallbackPayload);
            console.log('[PrioritizationLoop] Applied brief_reasoning fallback after max retries');
            return prioritizationResultSchema.parse(fallbackPayload);
          } catch (parseError) {
            console.warn(
              '[PrioritizationLoop] Fallback parse failed after applying brief_reasoning',
              parseError
            );
          }
        }
      }
    }
  }
  // Should be unreachable
  throw lastError instanceof Error ? lastError : new Error('Generator failed after retries');
}

async function runEvaluator(
  evaluator: AgentLike,
  result: PrioritizationResult,
  context: ReturnType<typeof buildGeneratorContext>
): Promise<EvaluationResult | undefined> {
  const prompt = buildEvaluatorPrompt(result, {
    outcome: context.outcome,
    reflectionsText: context.reflectionsText,
    previousPlanText: context.previousPlanText,
  });

  const response = await evaluator.generate([{ role: 'user', content: prompt }]);
  const payload = extractAgentPayload(response);
  try {
    const json = typeof payload === 'string' ? safeJsonParse(payload) : payload;
    return evaluationResultSchema.parse(json);
  } catch (error) {
    console.warn('[PrioritizationLoop] Evaluator returned invalid JSON', error);
    return undefined;
  }
}

function normalizePerTaskScores(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') {
    return raw;
  }
  const result = Array.isArray(raw) ? raw : { ...(raw as Record<string, unknown>) };
  const included = Array.isArray((result as any).included_tasks)
    ? ((result as any).included_tasks as Array<{ task_id: string; inclusion_reason?: string }>)
    : [];
  const includedIds = new Set(included.map(task => task.task_id).filter(Boolean));
  const inclusionReasonById = new Map(
    included.map(task => [task.task_id, task.inclusion_reason]).filter(([id]) => Boolean(id))
  );
  const scoresRecord =
    (result as any).per_task_scores && typeof (result as any).per_task_scores === 'object'
      ? { ...(result as any).per_task_scores }
      : {};

  Object.keys(scoresRecord).forEach(taskId => {
    if (!includedIds.has(taskId)) {
      delete scoresRecord[taskId];
    }
  });

  const defaultConfidence =
    typeof (result as any).confidence === 'number' ? (result as any).confidence : 0.5;

  Object.entries(scoresRecord).forEach(([taskId, score]) => {
    if (score && typeof score === 'object' && !(score as any).brief_reasoning) {
      (score as any).brief_reasoning = buildBriefReasoningFallback(
        taskId,
        inclusionReasonById.get(taskId)
      );
    }
  });

  included.forEach(task => {
    if (!scoresRecord[task.task_id]) {
      scoresRecord[task.task_id] = {
        task_id: task.task_id,
        impact: 5,
        effort: 8,
        confidence: defaultConfidence,
        reasoning:
          typeof task.inclusion_reason === 'string'
            ? task.inclusion_reason.slice(0, 300)
            : 'Auto-generated fallback score based on inclusion reasoning.',
        brief_reasoning: buildBriefReasoningFallback(
          task.task_id,
          task.inclusion_reason ?? 'Outcome-linked placeholder reasoning'
        ),
      };
    }
  });

  (result as any).per_task_scores = scoresRecord;
  return result;
}

function buildEvaluatorPrompt(
  result: PrioritizationResult,
  context: { outcome: string; reflectionsText: string; previousPlanText: string }
): string {
  return [
    'Evaluate whether the prioritization below meets the outcome and reflections.',
    '## OUTCOME',
    context.outcome,
    '## REFLECTIONS',
    context.reflectionsText,
    '## PREVIOUS PLAN',
    context.previousPlanText,
    '## PRIORITIZATION RESULT (JSON)',
    JSON.stringify(result, null, 2),
  ].join('\n\n');
}

function extractAgentPayload(response: unknown): unknown {
  if (response && typeof response === 'object') {
    const candidate =
      (response as any).text ?? (response as any).output ?? (response as any).data;

    if (typeof candidate !== 'undefined') {
      return candidate;
    }
  }

  return response;
}

function safeJsonParse(value: string): unknown {
  let trimmed = value.trim();
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
  }

  return JSON.parse(trimmed);
}

function truncate(text: string, maxLength: number): string {
  if (!text) {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function limitToTwentyWords(text: string): string {
  const words = text.trim().split(/\s+/);
  return words.slice(0, 20).join(' ');
}

function buildBriefReasoningFallback(taskId: string, inclusionReason?: string): string {
  if (typeof inclusionReason === 'string' && inclusionReason.trim().length > 0) {
    return truncate(limitToTwentyWords(inclusionReason), 150);
  }
  return `Fallback reasoning for task ${taskId}`;
}

function applyBriefReasoningFallbackToPayload(payload: any): void {
  if (!payload || typeof payload !== 'object') {
    return;
  }
  const orderedIds: string[] = Array.isArray(payload.ordered_task_ids) ? payload.ordered_task_ids : [];
  if (!payload.per_task_scores || typeof payload.per_task_scores !== 'object') {
    payload.per_task_scores = {};
  }
  orderedIds.forEach((taskId: string, index: number) => {
    if (!payload.per_task_scores[taskId]) {
      payload.per_task_scores[taskId] = {};
    }
    if (!payload.per_task_scores[taskId].brief_reasoning) {
      payload.per_task_scores[taskId].brief_reasoning = `Priority: ${index + 1}`;
    }
  });
}

function createChainStep(iteration: number, result: PrioritizationResult): ChainOfThoughtStep {
  const fallback =
    iteration === 1
      ? 'Initial draft - awaiting evaluator feedback.'
      : 'Refinement iteration completed.';

  return {
    iteration,
    confidence: result.confidence,
    corrections: truncate(result.corrections_made || fallback, 500),
    timestamp: new Date().toISOString(),
  };
}

function applyEvaluationFeedback(steps: ChainOfThoughtStep[], feedback: string): void {
  if (steps.length === 0) {
    return;
  }
  steps[steps.length - 1] = {
    ...steps[steps.length - 1],
    evaluator_feedback: truncate(feedback, 1000),
  };
}
