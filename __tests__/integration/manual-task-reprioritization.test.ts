/**
 * Integration Test (T033): Manual task reprioritization with 1.2x boost
 * Expectation: generator instructions include manual-task boost and manual task surfaces at top of plan.
 */

import { describe, expect, it } from 'vitest';

import { prioritizeWithHybridLoop } from '@/lib/services/prioritizationLoop';
import type { TaskSummary } from '@/lib/types/agent';

const manualTask: TaskSummary = {
  task_id: 'manual-1',
  task_text: 'Email legal about Q4 contract',
  document_id: 'doc-manual',
  source: 'embedding',
  manual_override: true,
  previous_rank: 5,
} as any;

const docTask: TaskSummary = {
  task_id: 'doc-1',
  task_text: 'Ship new billing page',
  document_id: 'doc-1',
  source: 'embedding',
  manual_override: false,
  previous_rank: 1,
};

describe('manual task reprioritization (T033)', () => {
  it('boosts manual task (1.2x) and places it above similar impact doc tasks', async () => {
    const generatorFactory = (instructions: string) => {
      // RED phase guard: fail if instructions do not mention manual boost
      if (!instructions.includes('1.2') && !instructions.toLowerCase().includes('manual')) {
        throw new Error('Manual task boost instructions missing');
      }

      return {
        async generate() {
          return JSON.stringify({
            thoughts: {
              outcome_analysis: 'Manual task aligns strongly with outcome.',
              filtering_rationale: 'Manual task prioritized after boost.',
              prioritization_strategy: 'Boost manual tasks by 1.2x impact.',
              self_check_notes: 'Manual boost applied correctly.',
            },
            included_tasks: [
              {
                task_id: 'manual-1',
                inclusion_reason: 'Manual task with boosted impact',
                alignment_score: 9,
              },
              {
                task_id: 'doc-1',
                inclusion_reason: 'Document task baseline',
                alignment_score: 8,
              },
            ],
            excluded_tasks: [],
            ordered_task_ids: ['manual-1', 'doc-1'],
            per_task_scores: {
              'manual-1': {
                task_id: 'manual-1',
                impact: 10,
                effort: 5,
                confidence: 0.9,
                reasoning: 'Boosted impact places it above similar tasks',
              },
              'doc-1': {
                task_id: 'doc-1',
                impact: 9,
                effort: 5,
                confidence: 0.8,
                reasoning: 'Baseline impact without manual boost',
              },
            },
            confidence: 0.9,
            critical_path_reasoning: 'Manual task leads due to boost',
          });
        },
      };
    };

    const result = await prioritizeWithHybridLoop(
      {
        tasks: [manualTask, docTask],
        outcome: 'Increase payment conversion',
        reflections: [],
      },
      { createGeneratorAgent: generatorFactory }
    );

    expect(result.plan.ordered_task_ids[0]).toBe('manual-1');
  });

  it('applies 1.2x priority boost to manual tasks', async () => {
    const manualImpact = 8;
    const docImpact = 9;
    const impactById: Record<string, number> = {
      'manual-1': manualImpact,
      'doc-1': docImpact,
    };

    const parseTasksFromInstructions = (instructions: string) => {
      const match = instructions.match(/## NEW TASKS TO EVALUATE[^]*?\n([\s\S]*?)\n## PREVIOUS PLAN/);
      if (!match) {
        throw new Error('Unable to parse task block from instructions');
      }
      return match[1]
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => JSON.parse(line) as { id: string; text: string; is_manual?: boolean });
    };

    const generatorFactory = (instructions: string) => {
      const tasks = parseTasksFromInstructions(instructions);
      if (!instructions.includes('1.2') || !instructions.toLowerCase().includes('manual task boost')) {
        throw new Error('Manual task boost guidance missing from instructions');
      }

      const scored = tasks.map(task => {
        const baseImpact = impactById[task.id] ?? 0;
        const effectiveImpact = task.is_manual ? baseImpact * 1.2 : baseImpact;
        const cappedImpact = Math.min(10, Number(effectiveImpact.toFixed(1)));
        return {
          ...task,
          baseImpact,
          effectiveImpact: cappedImpact,
          effort: 5,
          confidence: 0.8,
          reasoning: task.is_manual
            ? `Manual task received 1.2x boost: ${baseImpact} → ${cappedImpact}`
            : 'Document task baseline impact',
        };
      });

      scored.sort((a, b) => {
        if (b.effectiveImpact === a.effectiveImpact) {
          return Number(b.is_manual) - Number(a.is_manual);
        }
        return b.effectiveImpact - a.effectiveImpact;
      });

      return {
        async generate() {
          return JSON.stringify({
            thoughts: {
              outcome_analysis: 'Manual boost applied per FR-015.',
              filtering_rationale: 'Both tasks align; manual boosted for visibility.',
              prioritization_strategy: 'Apply 1.2x impact multiplier to manual tasks before ranking.',
              self_check_notes: 'Verified boost changes ordering.',
            },
            included_tasks: scored.map(task => ({
              task_id: task.id,
              inclusion_reason: task.reasoning,
              alignment_score: Math.min(10, Math.round(task.effectiveImpact)),
            })),
            excluded_tasks: [],
            ordered_task_ids: scored.map(task => task.id),
            per_task_scores: scored.reduce<Record<string, unknown>>((acc, task) => {
              acc[task.id] = {
                task_id: task.id,
                impact: task.effectiveImpact,
                effort: task.effort,
                confidence: task.confidence,
                reasoning: task.reasoning,
              };
              return acc;
            }, {}),
            confidence: 0.85,
            critical_path_reasoning: 'Manual task edges out due to 1.2x boost.',
          });
        },
      };
    };

    const result = await prioritizeWithHybridLoop(
      {
        tasks: [manualTask, docTask],
        outcome: 'Increase payment conversion',
        reflections: [],
      },
      { createGeneratorAgent: generatorFactory }
    );

    expect(result.plan.ordered_task_ids[0]).toBe('manual-1');
    expect(result.plan.ordered_task_ids[1]).toBe('doc-1');
  });
});
