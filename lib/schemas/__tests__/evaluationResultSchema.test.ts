import { describe, expect, it } from 'vitest';
import { evaluationResultSchema } from '../evaluationResultSchema';

const createValidPayload = () => ({
  status: 'PASS' as const,
  feedback:
    'Strong alignment to the stated outcome, only minor sequencing tweaks suggested.',
  criteria_scores: {
    outcome_alignment: { score: 8.5, notes: 'Covers payment conversion blockers.' },
    strategic_coherence: { score: 8 },
    reflection_integration: { score: 7.5 },
    continuity: { score: 8.2 },
  },
  evaluation_duration_ms: 14500,
  evaluator_model: 'openai/gpt-4o-mini',
});

describe('evaluationResultSchema', () => {
  it('accepts a valid evaluation result', () => {
    const payload = createValidPayload();
    expect(() => evaluationResultSchema.parse(payload)).not.toThrow();
  });

  it('rejects invalid status values', () => {
    const payload = createValidPayload();
    // @ts-expect-error verifying runtime schema guard
    payload.status = 'MAYBE';
    const result = evaluationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(/Invalid enum/);
  });

  it('rejects criteria scores outside 0-10', () => {
    const payload = createValidPayload();
    payload.criteria_scores.outcome_alignment.score = 12;
    const result = evaluationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(/Criteria score/);
  });

  it('requires detailed feedback text', () => {
    const payload = createValidPayload();
    payload.feedback = 'Too short';
    const result = evaluationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(/Feedback/i);
  });
});
