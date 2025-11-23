import { describe, expect, it } from 'vitest';

import { prioritizationEvaluator, EVALUATOR_PROMPT } from '@/lib/mastra/agents/prioritizationEvaluator';
import { evaluationResultSchema } from '@/lib/schemas/evaluationResultSchema';

describe('prioritizationEvaluator agent (T012)', () => {
  it('configures GPT-4o-mini single-pass JSON evaluation', async () => {
    const defaultOptions = await prioritizationEvaluator.getDefaultGenerateOptions();

    expect(prioritizationEvaluator.name).toBe('prioritization-evaluator');
    expect(prioritizationEvaluator.model).toBe('openai/gpt-4o-mini');
    expect(prioritizationEvaluator.maxRetries).toBe(1);
    expect(defaultOptions).toMatchObject({
      maxSteps: 1,
      toolChoice: 'none',
      response_format: { type: 'json_object' },
    });
  });

  it('documents all four evaluation criteria and threshold rules', async () => {
    const instructions = await prioritizationEvaluator.getInstructions();

    expect(instructions).toBe(EVALUATOR_PROMPT);
    expect(instructions).toContain('Outcome Alignment');
    expect(instructions).toContain('Strategic Coherence');
    expect(instructions).toContain('Reflection Integration');
    expect(instructions).toContain('Continuity');
    expect(instructions).toMatch(/\*\*PASS\*\* → Every criteria score ≥ 7/);
    expect(instructions).toMatch(/\*\*NEEDS_IMPROVEMENT\*\* → At least one criteria score < 7/);
    expect(instructions).toMatch(/\*\*FAIL\*\* → Outcome alignment or strategic coherence < 5/);
  });

  it('accepts NEEDS_IMPROVEMENT evaluation for poor payment prioritization', () => {
    const evaluation = evaluationResultSchema.parse({
      status: 'NEEDS_IMPROVEMENT',
      feedback:
        'Payment tasks wrongly excluded - these advance the revenue metric. Restore wallet launch tasks and remove generic docs work.',
      criteria_scores: {
        outcome_alignment: { score: 3.2, notes: 'Wallet and checkout optimizations missing.' },
        strategic_coherence: { score: 5.1, notes: 'Ordering fixable once key tasks return.' },
        reflection_integration: { score: 5.5, notes: 'Negation about docs ignored.' },
        continuity: { score: 6.2, notes: 'Plan drifted from prior iteration.' },
      },
      evaluation_duration_ms: 3840,
      evaluator_model: 'openai/gpt-4o-mini',
    });

    expect(evaluation.status).toBe('NEEDS_IMPROVEMENT');
    expect(evaluation.criteria_scores.outcome_alignment.score).toBeLessThan(7);
    expect(evaluation.feedback).toContain('Payment tasks wrongly excluded');
  });

  it('accepts PASS evaluation when all criteria remain green', () => {
    const evaluation = evaluationResultSchema.parse({
      status: 'PASS',
      feedback:
        'Prioritization is outcome aligned, dependencies respected, and reflections handled. No adjustments needed.',
      criteria_scores: {
        outcome_alignment: { score: 8.4, notes: 'Checkout + payments tasks dominate top 5.' },
        strategic_coherence: { score: 8.1, notes: 'Ordering follows dependency chain.' },
        reflection_integration: { score: 7.8, notes: 'Urgency reflection applied to fraud fixes.' },
        continuity: { score: 7.6, notes: 'Plan honors prior commitments.' },
      },
      evaluation_duration_ms: 2850,
      evaluator_model: 'openai/gpt-4o-mini',
    });

    expect(evaluation.status).toBe('PASS');
    for (const { score } of Object.values(evaluation.criteria_scores)) {
      expect(score).toBeGreaterThanOrEqual(7);
    }
  });
});
