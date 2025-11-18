import { z } from 'zod';

import type { TaskWithScores } from '@/lib/schemas/strategicScore';

export const SortingStrategySchema = z.enum([
  'balanced',
  'quick_wins',
  'strategic_bets',
  'urgent',
]);

export type SortingStrategy = z.infer<typeof SortingStrategySchema>;

export type StrategyConfig = {
  label: string;
  description: string;
  filter?: (task: TaskWithScores) => boolean;
  sort: (a: TaskWithScores, b: TaskWithScores) => number;
};

const URGENT_KEYWORDS = /\b(urgent|critical|blocking|blocker)\b/i;

export function isUrgent(task: TaskWithScores): boolean {
  const haystack = task.title ?? task.content;
  return URGENT_KEYWORDS.test(haystack);
}

export const STRATEGY_CONFIGS: Record<SortingStrategy, StrategyConfig> = {
  balanced: {
    label: 'Balanced',
    description: 'All tasks sorted by priority score',
    sort: (a, b) => b.priority - a.priority,
  },
  quick_wins: {
    label: 'Quick Wins',
    description: 'Tasks ≤8h effort, ranked by impact × confidence',
    filter: task => task.effort <= 8,
    sort: (a, b) => b.impact * b.confidence - a.impact * a.confidence,
  },
  strategic_bets: {
    label: 'Strategic Bets',
    description: 'High-impact (≥7) longer efforts (>40h)',
    filter: task => task.impact >= 7 && task.effort > 40,
    sort: (a, b) => b.impact - a.impact,
  },
  urgent: {
    label: 'Urgent',
    description: 'Tasks mentioning urgent or blocking keywords (2× priority boost)',
    sort: (a, b) => {
      const aMultiplier = isUrgent(a) ? 2 : 1;
      const bMultiplier = isUrgent(b) ? 2 : 1;
      return b.priority * bMultiplier - a.priority * aMultiplier;
    },
  },
};
