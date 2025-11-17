import { describe, it, expect } from 'vitest';

import { evaluateQualityHeuristics } from '../qualityEvaluation';

describe('Quality heuristics fallback (T007)', () => {
  it('assigns a 0.7 base score when task length is between 10 and 30 characters', () => {
    const task = 'Clarify spec details';
    const result = evaluateQualityHeuristics(task);

    expect(result.clarity_score).toBeCloseTo(0.7, 5);
  });

  it('assigns a 0.9 base score when task length is between 31 and 80 characters', () => {
    const task = 'Outline onboarding checklist for new enterprise customers';
    const result = evaluateQualityHeuristics(task);

    expect(result.clarity_score).toBeCloseTo(0.9, 5);
  });

  it('adds +0.1 bonus when the task starts with a strong verb', () => {
    const task = 'Build secure admin portal';
    const result = evaluateQualityHeuristics(task);

    expect(result.verb_strength).toBe('strong');
    expect(result.clarity_score).toBeCloseTo(0.8, 5); // 0.7 base + 0.1 verb bonus
  });

  it('adds +0.2 bonus when metrics are detected in the task text', () => {
    const task = 'Plan reduce churn from 5 to 3';
    const result = evaluateQualityHeuristics(task);

    expect(result.specificity_indicators.has_metrics).toBe(true);
    expect(result.clarity_score).toBeCloseTo(0.9, 5); // 0.7 base + 0.2 metrics
  });

  it('caps the combined score at 1.0 even when all bonuses apply', () => {
    const task = 'Build pricing experiment reducing churn from 5 to 3 within 6 weeks';
    const result = evaluateQualityHeuristics(task);

    expect(result.verb_strength).toBe('strong');
    expect(result.specificity_indicators.has_metrics).toBe(true);
    expect(result.clarity_score).toBe(1.0);
  });
});
