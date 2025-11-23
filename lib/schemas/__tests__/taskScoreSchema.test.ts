import { describe, expect, it } from 'vitest';
import { taskScoreSchema } from '../taskScoreSchema';

const createValidScore = () => ({
  task_id: '123e4567-e89b-12d3-a456-426614174000',
  impact: 8.2,
  effort: 12,
  confidence: 0.77,
  reasoning: 'Increases payment conversion while staying inside the quarter scope.',
  dependencies: ['223e4567-e89b-12d3-a456-426614174001'],
});

describe('taskScoreSchema', () => {
  it('accepts a valid task score entry', () => {
    const payload = createValidScore();
    expect(() => taskScoreSchema.parse(payload)).not.toThrow();
  });

  it('rejects effort estimates below 0.5h', () => {
    const payload = createValidScore();
    payload.effort = 0.3;
    const result = taskScoreSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(/Effort must be at least 0\.5/);
  });

  it('accepts structured reasoning objects with impact/effort details', () => {
    const payload = createValidScore();
    payload.reasoning = {
      impact_keywords: ['payments', 'conversion'],
      effort_source: 'heuristic',
      complexity_modifiers: ['integration_work'],
      reasoning: 'Refocuses on wallet adoption that drives the outcome.',
    };
    expect(() => taskScoreSchema.parse(payload)).not.toThrow();
  });
});
