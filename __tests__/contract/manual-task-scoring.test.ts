import { describe, expect, it } from 'vitest';

import { prioritizeWithHybridLoop } from '@/lib/services/prioritizationLoop';
import type { TaskSummary } from '@/lib/types/agent';

describe('manual task scoring parity', () => {
  it('scores manual tasks identically to AI tasks with the same inputs', async () => {
    const baseImpact = 8;
    const effort = 12;

    const manualTask: TaskSummary = {
      task_id: 'manual-1',
      task_text: 'Manual task with explicit scores',
      source: 'manual',
      manual_override: true,
      previous_rank: 3,
    } as any;

    const aiTask: TaskSummary = {
      task_id: 'ai-1',
      task_text: 'AI task with identical scores',
      source: 'embedding',
      manual_override: false,
      previous_rank: 2,
    } as any;

    const generatorFactory = (instructions: string) => {
      const containsBoost = /manual task boost|1\.2x|1\.2/.test(instructions.toLowerCase());
      const manualImpact = containsBoost ? Number((baseImpact * 1.2).toFixed(1)) : baseImpact;
      const aiImpact = baseImpact;

      const scores: Record<string, any> = {
        [manualTask.task_id]: {
          task_id: manualTask.task_id,
          impact: manualImpact,
          effort,
          confidence: 0.9,
          reasoning: 'Manual task scored without special treatment',
          brief_reasoning: 'Same scoring as AI task',
        },
        [aiTask.task_id]: {
          task_id: aiTask.task_id,
          impact: aiImpact,
          effort,
          confidence: 0.9,
          reasoning: 'AI task baseline scoring',
          brief_reasoning: 'Baseline scoring, no boost',
        },
      };

      const ordered = [manualTask.task_id, aiTask.task_id].sort((left, right) => {
        const delta = scores[right]!.impact - scores[left]!.impact;
        return delta !== 0 ? delta : 0;
      });

      return {
        async generate() {
          return JSON.stringify({
            thoughts: {
              outcome_analysis: 'Outcome alignment based on impact and effort parity.',
              filtering_rationale: 'Both tasks align equally with outcome.',
              prioritization_strategy: 'No manual boost should apply.',
              self_check_notes: 'Verified parity between manual and AI tasks.',
            },
            included_tasks: [
              {
                task_id: manualTask.task_id,
                inclusion_reason: 'Manual task treated identically to AI.',
                alignment_score: 8,
              },
              {
                task_id: aiTask.task_id,
                inclusion_reason: 'AI task with the same scores.',
                alignment_score: 8,
              },
            ],
            excluded_tasks: [],
            ordered_task_ids: ordered,
            per_task_scores: scores,
            confidence: 0.9,
            critical_path_reasoning: 'Equal impact/effort means identical prioritization treatment.',
          });
        },
      };
    };

    const result = await prioritizeWithHybridLoop(
      {
        tasks: [manualTask, aiTask],
        outcome: 'Increase outcome with parity scoring',
        reflections: [],
      },
      { createGeneratorAgent: generatorFactory }
    );

    expect(result.result.per_task_scores[manualTask.task_id]?.impact).toBe(baseImpact);
    expect(result.result.per_task_scores[aiTask.task_id]?.impact).toBe(baseImpact);
    expect(result.plan.ordered_task_ids.slice(0, 2).sort()).toEqual([
      manualTask.task_id,
      aiTask.task_id,
    ].sort());
  });
});
