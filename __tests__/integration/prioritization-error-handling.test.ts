import { describe, expect, it, vi } from 'vitest';

import {
  prioritizeWithHybridLoop,
  type PrioritizationLoopOptions,
  type PrioritizationLoopDependencies,
} from '@/lib/services/prioritizationLoop';

const baseOptions: PrioritizationLoopOptions = {
  tasks: [
    { task_id: 't1', task_text: 'Do a thing' },
    { task_id: 't2', task_text: 'Do another' },
  ],
  outcome: 'Ship feature',
  reflections: [],
};

const validResult = {
  confidence: 0.9,
  included_tasks: [
    { task_id: 't1', inclusion_reason: 'This is an important task to do.', alignment_score: 0.95 },
  ],
  excluded_tasks: [
    {
      task_id: 't2',
      exclusion_reason: 'This task is less aligned with outcome.',
      task_text: 'Do another',
      alignment_score: 0.2,
    },
  ],
  ordered_task_ids: ['t1'],
  corrections_made: '',
  per_task_scores: {
    t1: {
      task_id: 't1',
      impact: 5,
      effort: 3,
      confidence: 0.9,
      reasoning: 'Reasoning meets required length for validation.',
      alignment_score: 0.8,
    },
  },
  thoughts: {
    prioritization_strategy: 'Top tasks first',
    architecture_notes: 'None',
    risk_mitigation: 'None',
    outcome_analysis: 'Outcome is aligned.',
    filtering_rationale: 'Filtered low impact tasks.',
    self_check_notes: 'Self check passed.',
    critical_path_reasoning: 't1 is required first',
  },
  critical_path_reasoning: 't1 is required first',
};

const buildGenerator = (responses: Array<string | object>) => {
  const generate = vi.fn().mockImplementation(() => {
    const next = responses.shift();
    if (!next) {
      throw new Error('No more responses');
    }
    return { text: next };
  });
  return { generate };
};

describe('prioritization loop retry handling', () => {
  it('retries once on validation failure then succeeds', async () => {
    const generator = buildGenerator(['not-json', validResult]);
    const deps: PrioritizationLoopDependencies = {
      createGeneratorAgent: () => generator,
    };

    const result = await prioritizeWithHybridLoop(baseOptions, deps);

    expect(generator.generate).toHaveBeenCalledTimes(2);
    expect(result.plan.ordered_task_ids).toEqual(['t1']);
  });

  it('fails after two validation attempts', async () => {
    const generator = buildGenerator(['bad', 'still-bad']);
    const deps: PrioritizationLoopDependencies = {
      createGeneratorAgent: () => generator,
    };

    await expect(prioritizeWithHybridLoop(baseOptions, deps)).rejects.toThrow(
      /failed after 2 attempts/i
    );
    expect(generator.generate).toHaveBeenCalledTimes(2);
  });
});
