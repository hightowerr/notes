import { z } from 'zod';

import type { TaskWithScores } from '@/lib/schemas/strategicScore';

export const SortingStrategySchema = z.enum([
  'balanced',
  'quick_wins',
  'strategic_bets',
  'urgent',
  'focus_mode',
]);

export type SortingStrategy = z.infer<typeof SortingStrategySchema>;

export type StrategyConfig = {
  label: string;
  description: string;
  filter?: (task: TaskWithScores) => boolean;
  sort: (a: TaskWithScores, b: TaskWithScores) => number;
};

const URGENT_KEYWORDS = /\b(urgent|critical|blocking|blocker)\b/i;

export const LOW_EFFORT_THRESHOLD = 8;
export const HIGH_IMPACT_THRESHOLD = 5;
const STRICT_STRATEGIC_IMPACT = 7;
const STRICT_STRATEGIC_EFFORT = 40;

const hasScores = (impact?: number, effort?: number): boolean =>
  typeof impact === 'number' && Number.isFinite(impact) && typeof effort === 'number' && Number.isFinite(effort);

export function isQuickWinTask(task: TaskWithScores): boolean {
  const { matchesQuickWin } = classifyStrategyScores(task.impact, task.effort);
  return matchesQuickWin;
}

export function isStrategicBetTask(task: TaskWithScores): boolean {
  const { matchesStrategicBet } = classifyStrategyScores(task.impact, task.effort);
  return matchesStrategicBet;
}

export function isUrgent(task: TaskWithScores): boolean {
  const haystack = task.title ?? task.content;
  return URGENT_KEYWORDS.test(haystack);
}

export function classifyStrategyScores(impact?: number | null, effort?: number | null) {
  if (!hasScores(impact ?? undefined, effort ?? undefined)) {
    return {
      matchesQuickWin: false,
      matchesStrategicBet: false,
    };
  }

  const matchesQuickWin = impact! >= HIGH_IMPACT_THRESHOLD && effort! <= LOW_EFFORT_THRESHOLD;
  const strictStrategicBet = impact! >= STRICT_STRATEGIC_IMPACT && effort! > STRICT_STRATEGIC_EFFORT;
  const fallbackStrategicBet = impact! >= HIGH_IMPACT_THRESHOLD && effort! > LOW_EFFORT_THRESHOLD;

  return {
    matchesQuickWin,
    matchesStrategicBet: strictStrategicBet || fallbackStrategicBet,
  };
}

export const STRATEGY_CONFIGS: Record<SortingStrategy, StrategyConfig> = {
  balanced: {
    label: 'Balanced',
    description: 'All tasks sorted by priority score',
    sort: (a, b) => b.priority - a.priority,
  },
  quick_wins: {
    label: 'Quick Wins',
    description: 'High-impact tasks ≤8h effort, ranked by impact × confidence',
    filter: task => isQuickWinTask(task),
    sort: (a, b) => b.impact * b.confidence - a.impact * a.confidence,
  },
  strategic_bets: {
    label: 'Strategic Bets',
    description: 'High-impact bets that need more than a quick win window',
    filter: task => isStrategicBetTask(task),
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
  focus_mode: {
    label: 'Focus Mode (Recommended)',
    description: 'High-leverage work only (Quick Wins + Strategic Bets)',
    filter: task => isQuickWinTask(task) || isStrategicBetTask(task),
    sort: (a, b) => b.priority - a.priority,
  },
};
