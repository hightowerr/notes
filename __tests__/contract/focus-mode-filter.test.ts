import { describe, expect, it } from 'vitest';

import type { Quadrant } from '@/lib/schemas/quadrant';
import { SortingStrategySchema, STRATEGY_CONFIGS, HIGH_IMPACT_THRESHOLD, LOW_EFFORT_THRESHOLD } from '@/lib/schemas/sortingStrategy';
import type { TaskWithScores } from '@/lib/schemas/strategicScore';

describe('focus_mode sorting strategy contract', () => {
  it('exposes focus_mode in SortingStrategySchema with a config entry', () => {
    expect(() => SortingStrategySchema.parse('focus_mode')).not.toThrow();

    const focusModeConfig = STRATEGY_CONFIGS.focus_mode;
    expect(focusModeConfig).toBeDefined();
    expect(focusModeConfig.label).toMatch(/Focus Mode/i);
    expect(typeof focusModeConfig.filter).toBe('function');
    expect(typeof focusModeConfig.sort).toBe('function');
  });

  it('includes only Quick Wins and Strategic Bets tasks while excluding Neutral and Overhead work', () => {
    const focusModeConfig = STRATEGY_CONFIGS.focus_mode;
    const filter = focusModeConfig.filter ?? (() => true);

    const filtered = SAMPLE_TASKS.filter(filter);
    const filteredIds = filtered.map(task => task.id);

    expect(new Set(filteredIds)).toEqual(new Set(FOCUS_EXPECTED_IDS));

    const reductionPercentage = (SAMPLE_TASKS.length - filtered.length) / SAMPLE_TASKS.length;
    expect(reductionPercentage).toBeGreaterThanOrEqual(0.4);
    expect(reductionPercentage).toBeLessThanOrEqual(0.6);
  });

  it('sorts focused tasks by descending priority to keep the highest leverage work on top', () => {
    const focusModeConfig = STRATEGY_CONFIGS.focus_mode;
    const filter = focusModeConfig.filter ?? (() => true);

    const ranked = SAMPLE_TASKS.filter(filter).sort(focusModeConfig.sort);
    const priorities = ranked.map(task => task.priority);

    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});

const FOCUS_EXPECTED_IDS = [
  'quick-win-1',
  'quick-win-2',
  'strategic-bet-strict',
  'strategic-bet-fallback',
];

const SAMPLE_TASKS: TaskWithScores[] = [
  createTask({ id: 'quick-win-1', impact: 8, effort: 4, priority: 98 }),
  createTask({ id: 'quick-win-2', impact: 6, effort: 6, priority: 85 }),
  createTask({ id: 'strategic-bet-strict', impact: 8, effort: 64, priority: 80 }),
  createTask({ id: 'strategic-bet-fallback', impact: 6, effort: 18, priority: 78 }),
  createTask({ id: 'neutral', impact: 4, effort: 6, priority: 70 }),
  createTask({ id: 'overhead', impact: 3, effort: 28, priority: 50 }),
  createTask({ id: 'maintenance', impact: 4, effort: 20, priority: 55 }),
  createTask({ id: 'ops-runbook', impact: 3, effort: 10, priority: 52 }),
];

type TaskOverrides = {
  id: string;
  impact: number;
  effort: number;
  priority: number;
};

function createTask({ id, impact, effort, priority }: TaskOverrides): TaskWithScores {
  return {
    id,
    title: id,
    content: id,
    impact,
    effort,
    confidence: 0.8,
    priority,
    hasManualOverride: false,
    quadrant: deriveQuadrant(impact, effort),
  } as TaskWithScores;
}

function deriveQuadrant(impact: number, effort: number): Quadrant {
  const highImpact = impact >= HIGH_IMPACT_THRESHOLD;
  const lowEffort = effort <= LOW_EFFORT_THRESHOLD;

  if (highImpact && lowEffort) {
    return 'high_impact_low_effort';
  }
  if (highImpact && !lowEffort) {
    return 'high_impact_high_effort';
  }
  if (!highImpact && lowEffort) {
    return 'low_impact_low_effort';
  }
  return 'low_impact_high_effort';
}
