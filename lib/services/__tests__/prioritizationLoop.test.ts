import { describe, expect, it } from 'vitest';

import type { PrioritizationResult } from '@/lib/schemas/prioritizationResultSchema';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';
import { hasMajorMovement, needsEvaluation } from '@/lib/services/prioritizationLoop';

const TASK_IDS = Array.from({ length: 15 }, (_, index) => `task-${index + 1}`);

function createResult(options: {
  confidence?: number;
  includedTaskCount?: number;
  corrections?: string;
  orderedTaskIds?: string[];
} = {}): PrioritizationResult {
  const confidence = options.confidence ?? 0.82;
  const includedTaskCount = options.includedTaskCount ?? 12;
  const includedIds = TASK_IDS.slice(0, includedTaskCount);
  const orderedTaskIds = options.orderedTaskIds ?? includedIds;

  const included_tasks = includedIds.map(taskId => ({
    task_id: taskId,
    inclusion_reason: `Include ${taskId} to move the payments metric forward.`,
    alignment_score: 8,
  }));

  const per_task_scores: PrioritizationResult['per_task_scores'] = {};
  includedIds.forEach(taskId => {
    per_task_scores[taskId] = {
      task_id: taskId,
      impact: 8,
      effort: 12,
      confidence,
      reasoning: `Reasoning for ${taskId} ties directly to revenue impact and engineering feasibility.`,
      dependencies: [],
    };
  });

  return {
    thoughts: {
      outcome_analysis:
        'Increasing payment conversion requires unblocking checkout friction and launching key wallets.',
      filtering_rationale:
        'Kept tasks that unblock payments funnel and excluded docs/cleanup items.',
      prioritization_strategy:
        'Lead with checkout stabilization, then layer in wallets that accelerate conversion.',
      self_check_notes: 'Validated that reflections were honored and dependency order makes sense.',
    },
    included_tasks,
    excluded_tasks: [
      {
        task_id: 'excluded-1',
        task_text: 'Update documentation set',
        exclusion_reason: 'Docs work does not affect conversion this sprint.',
        alignment_score: 3,
      },
    ],
    ordered_task_ids: orderedTaskIds,
    per_task_scores,
    confidence,
    critical_path_reasoning: 'Address funnel leakage first, then expand wallet coverage.',
    corrections_made:
      options.corrections ??
      'Adjusted ordering to unblock checkout and removed low-impact documentation work.',
  };
}

function createPreviousPlan(taskIds: string[]): PrioritizedTaskPlan {
  return {
    ordered_task_ids: taskIds,
    execution_waves: [
      {
        wave_number: 1,
        task_ids: taskIds,
        parallel_execution: false,
      },
    ],
    dependencies: [],
    confidence_scores: Object.fromEntries(taskIds.map(id => [id, 0.8])),
    synthesis_summary: 'Historical ordering for reference.',
    task_annotations: [],
    removed_tasks: [],
  };
}

describe('needsEvaluation', () => {
  it('returns false when confidence is very high even if list is short', () => {
    const result = createResult({ confidence: 0.9, includedTaskCount: 5 });
    expect(needsEvaluation(result)).toBe(false);
  });

  it('requires evaluation when confidence is below 0.7', () => {
    const result = createResult({ confidence: 0.65 });
    expect(needsEvaluation(result)).toBe(true);
  });

  it('requires evaluation when fewer than 10 tasks are included', () => {
    const result = createResult({ includedTaskCount: 6 });
    expect(needsEvaluation(result)).toBe(true);
  });

  it('requires evaluation when corrections text is very long (agent uncertain)', () => {
    const result = createResult({ corrections: 'a'.repeat(150) });
    expect(needsEvaluation(result)).toBe(true);
  });

  it('requires evaluation when >30% of tasks moved more than 5 slots', () => {
    const previousPlan = createPreviousPlan(TASK_IDS.slice(0, 10));
    const reordered = [...TASK_IDS.slice(0, 10)].reverse();
    const result = createResult({
      includedTaskCount: 10,
      orderedTaskIds: reordered,
    });

    expect(hasMajorMovement(result, previousPlan)).toBe(true);
    expect(needsEvaluation(result, previousPlan)).toBe(true);
  });

  it('does not trigger evaluation when movement stays under threshold', () => {
    const previousPlan = createPreviousPlan(TASK_IDS.slice(0, 10));
    const slightShuffle = [...TASK_IDS.slice(0, 10)];
    [slightShuffle[0], slightShuffle[1]] = [slightShuffle[1], slightShuffle[0]];
    const result = createResult({
      includedTaskCount: 10,
      orderedTaskIds: slightShuffle,
    });

    expect(hasMajorMovement(result, previousPlan)).toBe(false);
    expect(needsEvaluation(result, previousPlan)).toBe(false);
  });
});
