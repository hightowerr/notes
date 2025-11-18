import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ManualOverrideInputSchema, ManualOverrideSchema } from '@/lib/schemas/manualOverride';
import { QUADRANT_CONFIGS, QuadrantSchema, getQuadrant } from '@/lib/schemas/quadrant';
import {
  EffortEstimateSchema,
  ImpactEstimateSchema,
  StrategicScoreSchema,
  StrategicScoresMapSchema,
  type TaskWithScores,
} from '@/lib/schemas/strategicScore';
import {
  STRATEGY_CONFIGS,
  SortingStrategySchema,
  isUrgent,
} from '@/lib/schemas/sortingStrategy';

describe('strategic score schemas', () => {
  const baseScore = {
    impact: 8,
    effort: 6,
    confidence: 0.8,
    priority: 72,
    reasoning: {
      impact_keywords: ['revenue'],
      effort_source: 'heuristic' as const,
      effort_hint: 'Estimated from historical data',
      complexity_modifiers: ['external-dependency'],
    },
    scored_at: new Date().toISOString(),
  };

  const baseTask: TaskWithScores = {
    id: 'task-123',
    content: 'Handle urgent payment blocker',
    impact: 8,
    effort: 6,
    confidence: 0.9,
    priority: 80,
    hasManualOverride: false,
    quadrant: 'high_impact_low_effort',
    reasoning: {
      impact_keywords: ['payments'],
      effort_source: 'heuristic',
    },
  };

  it('validates impact and effort estimate payloads', () => {
    expect(() => ImpactEstimateSchema.parse({
      impact: 6,
      reasoning: 'Directly tied to ARR',
      keywords: ['ARR', 'enterprise'],
      confidence: 0.7,
    })).not.toThrow();

    expect(() => EffortEstimateSchema.parse({
      effort: 12,
      source: 'extracted',
      hint: '"2-3 days" mentioned in brief',
    })).not.toThrow();
  });

  it('accepts valid strategic scores and rejects out-of-range values', () => {
    expect(() => StrategicScoreSchema.parse(baseScore)).not.toThrow();

    expect(() =>
      StrategicScoreSchema.parse({
        ...baseScore,
        impact: 12,
      })
    ).toThrowError();
  });

  it('parses map of task ids to scores', () => {
    expect(() => StrategicScoresMapSchema.parse({
      [baseTask.id]: baseScore,
    })).not.toThrow();

    expect(() => StrategicScoresMapSchema.parse({ invalid: { ...baseScore, effort: 0.1 } })).toThrow();
  });

  it('validates manual overrides', () => {
    expect(() => ManualOverrideSchema.parse({
      impact: 9,
      effort: 20,
      reason: 'User-adjusted after team sync',
      timestamp: new Date().toISOString(),
      session_id: randomUUID(),
    })).not.toThrow();

    const longReason = 'x'.repeat(600);
    expect(() =>
      ManualOverrideSchema.parse({
        impact: 9,
        effort: 20,
        reason: longReason,
        timestamp: new Date().toISOString(),
        session_id: randomUUID(),
      })
    ).toThrowError();

    expect(() => ManualOverrideInputSchema.parse({ task_id: 'task-1', impact: 7 })).not.toThrow();
    expect(() => ManualOverrideInputSchema.parse({ task_id: '' })).toThrow();
  });

  it('enforces supported sorting strategies', () => {
    expect(SortingStrategySchema.parse('balanced')).toBe('balanced');
    expect(() => SortingStrategySchema.parse('random')).toThrowError();
  });

  it('applies strategy filters and urgent sorting correctly', () => {
    const quickWinsFilter = STRATEGY_CONFIGS.quick_wins.filter!;
    expect(quickWinsFilter(baseTask)).toBe(true);
    expect(quickWinsFilter({ ...baseTask, effort: 12 })).toBe(false);

    const urgentTask = baseTask;
    const normalTask = { ...baseTask, content: 'Review retention analysis', priority: 90 };
    const sorted = [urgentTask, normalTask].sort(STRATEGY_CONFIGS.urgent.sort);
    expect(sorted[0]).toBe(urgentTask);
    expect(isUrgent(urgentTask)).toBe(true);
    expect(isUrgent(normalTask)).toBe(false);
  });

  it('classifies quadrants from impact/effort values', () => {
    expect(getQuadrant(8, 6)).toBe('high_impact_low_effort');
    expect(getQuadrant(8, 20)).toBe('high_impact_high_effort');
    expect(getQuadrant(2, 3)).toBe('low_impact_low_effort');
    expect(getQuadrant(3, 12)).toBe('low_impact_high_effort');

    expect(() => QuadrantSchema.parse('high_impact_low_effort')).not.toThrow();
    expect(() => QuadrantSchema.parse('unknown')).toThrow();
    expect(QUADRANT_CONFIGS.high_impact_low_effort.label).toBe('Quick Wins');
  });
});
