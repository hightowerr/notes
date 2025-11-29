import { describe, expect, it, vi } from 'vitest';

import type { EvaluationResult } from '@/lib/schemas/evaluationResultSchema';
import type { PrioritizationResult } from '@/lib/schemas/prioritizationResultSchema';
import type { TaskSummary } from '@/lib/types/agent';
import {
  prioritizeWithHybridLoop,
  type PrioritizationLoopDependencies,
} from '@/lib/services/prioritizationLoop';

const SAMPLE_TASKS: TaskSummary[] = [
  { task_id: 'task-checkout', task_text: 'Optimize checkout flow', document_id: 'doc-1', source: 'embedding' },
  { task_id: 'task-apple-pay', task_text: 'Implement Apple Pay', document_id: 'doc-1', source: 'embedding' },
  { task_id: 'task-docs', task_text: 'Refresh payment docs', document_id: 'doc-2', source: 'embedding' },
];

const REFLECTIONS = ['Focus on payment conversion', 'Skip documentation polish this sprint'];
const OUTCOME = 'Increase credit payment conversion by 20%';

function buildResult(options: {
  confidence: number;
  includedTaskIds?: string[];
  corrections?: string;
}): PrioritizationResult {
  const includedTaskIds = options.includedTaskIds ?? ['task-checkout', 'task-apple-pay'];
  const confidence = options.confidence;

  const included_tasks = includedTaskIds.map(taskId => ({
    task_id: taskId,
    inclusion_reason: `${taskId} directly impacts the revenue goal.`,
    alignment_score: 8,
  }));

  const per_task_scores: PrioritizationResult['per_task_scores'] = {};
  includedTaskIds.forEach(taskId => {
    per_task_scores[taskId] = {
      task_id: taskId,
      impact: 8,
      effort: 10,
      confidence,
      reasoning: `Reasoning for ${taskId} ties to conversion lift and required sequencing.`,
      brief_reasoning: `Unblocks ${taskId} for conversion gain`,
      dependencies: [],
    };
  });

  return {
    thoughts: {
      outcome_analysis: 'Outcome requires unlocking checkout throughput and wallet availability.',
      filtering_rationale: 'Kept direct payment tasks, removed docs.',
      prioritization_strategy: 'First stabilize checkout, then ship wallets.',
      self_check_notes: 'Confirmed reflections were honored and no blockers remain.',
    },
    included_tasks,
    excluded_tasks: [
      {
        task_id: 'task-docs',
        task_text: 'Refresh payment docs',
        exclusion_reason: 'Docs do not immediately affect conversion metrics.',
        alignment_score: 2,
      },
    ],
    ordered_task_ids: includedTaskIds,
    per_task_scores,
    confidence,
    critical_path_reasoning: 'Checkout fixes unblock wallet launch for conversion lift.',
    corrections_made:
      options.corrections ??
      'Initial pass based on current reflections and known dependency order.',
  };
}

function buildEvaluation(status: EvaluationResult['status'], feedback: string): EvaluationResult {
  return {
    status,
    feedback,
    criteria_scores: {
      outcome_alignment: { score: status === 'PASS' ? 8 : 5.5, notes: 'Payment focus' },
      strategic_coherence: { score: status === 'PASS' ? 7.5 : 6.2, notes: 'Ordering review' },
      reflection_integration: { score: status === 'PASS' ? 7.2 : 6, notes: 'Reflection handling' },
      continuity: { score: 7, notes: 'Plan continuity assessed' },
    },
    evaluation_duration_ms: 2150,
    evaluator_model: 'openai/gpt-4o-mini',
  };
}

function createDependencies(
  generatorResponses: PrioritizationResult[],
  evaluationResponses: EvaluationResult[] = []
): PrioritizationLoopDependencies & {
  generatorSpy: ReturnType<typeof vi.fn>;
  evaluatorSpy: ReturnType<typeof vi.fn>;
} {
  const generatorSpy = vi.fn();
  generatorResponses.forEach(result => {
    generatorSpy.mockResolvedValueOnce({
      text: JSON.stringify(result),
    });
  });

  const evaluatorSpy = vi.fn();
  evaluationResponses.forEach(result => {
    evaluatorSpy.mockResolvedValueOnce({
      text: JSON.stringify(result),
    });
  });

  return {
    createGeneratorAgent: vi.fn(() => ({
      generate: generatorSpy,
    })),
    evaluatorAgent: {
      generate: evaluatorSpy,
    },
    generatorSpy,
    evaluatorSpy,
  };
}

describe('prioritizeWithHybridLoop integration', () => {
  it('returns fast-path results when confidence is high', async () => {
    const highConfidenceResult = buildResult({ confidence: 0.87 });
    const deps = createDependencies([highConfidenceResult]);

    const { plan, metadata, result } = await prioritizeWithHybridLoop(
      {
        tasks: SAMPLE_TASKS,
        outcome: OUTCOME,
        reflections: REFLECTIONS,
      },
      deps
    );

    expect(result.confidence).toBe(0.87);
    expect(plan.ordered_task_ids).toEqual(highConfidenceResult.ordered_task_ids);
    expect(metadata.evaluation_triggered).toBe(false);
    expect(metadata.iterations).toBe(1);
    expect(metadata.chain_of_thought).toHaveLength(1);
    expect(metadata.chain_of_thought[0]?.evaluator_feedback).toBeUndefined();
    expect(metadata.converged).toBe(true);
    expect(metadata.duration_ms).toBeGreaterThanOrEqual(0);
    expect(deps.generatorSpy).toHaveBeenCalledTimes(1);
    expect(deps.evaluatorSpy).not.toHaveBeenCalled();
  });

  it('runs evaluation loop and converges within three iterations when confidence is low', async () => {
    const firstPass = buildResult({
      confidence: 0.65,
      corrections: 'Skipped payment task due to uncertainty.',
    });
    const refined = buildResult({
      confidence: 0.82,
      corrections: 'Restored payment task and tightened ordering.',
    });
    const evaluationNeeds = buildEvaluation(
      'NEEDS_IMPROVEMENT',
      'Payment tasks wrongly excluded - bring wallet launch back.'
    );
    const evaluationPass = buildEvaluation('PASS', 'Improved ordering now aligns with outcome.');

    const deps = createDependencies([firstPass, refined], [evaluationNeeds, evaluationPass]);

    const response = await prioritizeWithHybridLoop(
      {
        tasks: SAMPLE_TASKS,
        outcome: OUTCOME,
        reflections: REFLECTIONS,
      },
      deps
    );

    expect(response.metadata.evaluation_triggered).toBe(true);
    expect(response.metadata.iterations).toBe(2);
    expect(response.metadata.chain_of_thought).toHaveLength(2);
    expect(response.metadata.chain_of_thought[0]?.evaluator_feedback).toContain('Payment tasks wrongly excluded');
    expect(response.metadata.chain_of_thought[1]?.evaluator_feedback).toContain('Improved ordering');
    expect(response.metadata.converged).toBe(true);
    expect(response.plan.ordered_task_ids).toEqual(refined.ordered_task_ids);
    expect(response.result.confidence).toBe(0.82);
    expect(deps.generatorSpy).toHaveBeenCalledTimes(2);
    expect(deps.evaluatorSpy).toHaveBeenCalledTimes(2);
  });

  it('returns best-effort when evaluation never passes within max iterations', async () => {
    const iterationOne = buildResult({
      confidence: 0.6,
      corrections: 'Initial draft missing key wallet task.',
    });
    const iterationTwo = buildResult({
      confidence: 0.68,
      corrections: 'Added wallet task but ordering still uncertain.',
    });
    const iterationThree = buildResult({
      confidence: 0.7,
      corrections: 'Attempted to justify ordering but evaluator still unhappy.',
    });

    const evaluationNeeds = [
      buildEvaluation('NEEDS_IMPROVEMENT', 'Still missing payments coverage.'),
      buildEvaluation('NEEDS_IMPROVEMENT', 'Ordering conflicts remain.'),
      buildEvaluation('NEEDS_IMPROVEMENT', 'Critical issues unresolved.'),
    ];

    const deps = createDependencies([iterationOne, iterationTwo, iterationThree], evaluationNeeds);

    const response = await prioritizeWithHybridLoop(
      {
        tasks: SAMPLE_TASKS,
        outcome: OUTCOME,
        reflections: REFLECTIONS,
      },
      deps
    );

    expect(response.metadata.iterations).toBe(3);
    expect(response.metadata.converged).toBe(false);
    expect(response.metadata.chain_of_thought).toHaveLength(3);
    expect(response.metadata.chain_of_thought[2]?.evaluator_feedback).toContain('Critical issues unresolved');
    expect(response.metadata.evaluation_triggered).toBe(true);
    expect(response.plan.ordered_task_ids).toEqual(iterationThree.ordered_task_ids);
    expect(response.evaluation?.feedback).toContain('Critical issues unresolved');
    expect(deps.evaluatorSpy).toHaveBeenCalledTimes(3);
    expect(deps.generatorSpy).toHaveBeenCalledTimes(3);
  });
});
