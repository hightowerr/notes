import { z } from 'zod';

import { HIGH_IMPACT_THRESHOLD, LOW_EFFORT_THRESHOLD } from '@/lib/schemas/sortingStrategy';

export const QuadrantSchema = z.enum([
  'high_impact_low_effort',
  'high_impact_high_effort',
  'low_impact_low_effort',
  'low_impact_high_effort',
]);

export type Quadrant = z.infer<typeof QuadrantSchema>;

export type QuadrantConfig = {
  label: string;
  emoji: string;
  color: string;
  description: string;
};

export const QUADRANT_CONFIGS: Record<Quadrant, QuadrantConfig> = {
  high_impact_low_effort: {
    label: 'Quick Wins',
    emoji: '🌟',
    color: '#10b981',
    description: 'High impact, low effort - do these first',
  },
  high_impact_high_effort: {
    label: 'Strategic Bets',
    emoji: '🚀',
    color: '#3b82f6',
    description: 'High impact, high effort - plan carefully',
  },
  low_impact_low_effort: {
    label: 'Incremental',
    emoji: '⚡',
    color: '#eab308',
    description: 'Low impact, low effort - fill time gaps',
  },
  low_impact_high_effort: {
    label: 'Avoid',
    emoji: '⏸',
    color: '#ef4444',
    description: 'Low impact, high effort - deprioritize or eliminate',
  },
};

export function getQuadrant(impact: number, effort: number): Quadrant {
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

