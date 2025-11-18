import { z } from 'zod';

import type { Quadrant } from '@/lib/schemas/quadrant';

export const EffortSourceSchema = z.enum(['extracted', 'heuristic', 'llm']);
export type EffortSource = z.infer<typeof EffortSourceSchema>;

export const ImpactEstimateSchema = z.object({
  impact: z.number().min(0).max(10),
  reasoning: z.string().min(1),
  keywords: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
});

export type ImpactEstimate = z.infer<typeof ImpactEstimateSchema>;

export const EffortEstimateSchema = z.object({
  effort: z.number().min(0.5).max(160),
  source: EffortSourceSchema,
  hint: z.string().min(1).optional(),
  complexity_modifiers: z.array(z.string().min(1)).optional(),
});

export type EffortEstimate = z.infer<typeof EffortEstimateSchema>;

export const UnifiedStrategicEstimateSchema = z.object({
  impact: z.number().min(0).max(10),
  impact_reasoning: z.string().min(1).max(800),
  effort: z.number().min(0.5).max(160),
  effort_reasoning: z.string().min(1).max(800),
  keywords: z.array(z.string().min(1)).max(10),
  complexity_factors: z.array(z.string().min(1)).max(10),
  confidence: z.number().min(0).max(1),
});

export type UnifiedStrategicEstimate = z.infer<typeof UnifiedStrategicEstimateSchema>;

const StrategicScoreReasoningSchema = z.object({
  impact_keywords: z.array(z.string().min(1)),
  effort_source: EffortSourceSchema,
  effort_hint: z.string().min(1).optional(),
  complexity_modifiers: z.array(z.string().min(1)).optional(),
});

const ConfidenceComponentSchema = z.object({
  label: z.string().min(1),
  weight: z.number().min(0).max(1),
  value: z.number().min(0).max(1),
  source: z.enum(['similarity', 'dependency', 'history']),
});

const ConfidenceBreakdownSchema = z.object({
  similarity: ConfidenceComponentSchema,
  dependency: ConfidenceComponentSchema,
  history: ConfidenceComponentSchema,
});

export const StrategicScoreSchema = z.object({
  impact: z.number().min(0).max(10),
  effort: z.number().min(0.5).max(160),
  confidence: z.number().min(0).max(1),
  priority: z.number().min(0).max(100),
  reasoning: StrategicScoreReasoningSchema,
  scored_at: z.string().datetime(),
  confidence_breakdown: ConfidenceBreakdownSchema.optional(),
});

export type StrategicScore = z.infer<typeof StrategicScoreSchema>;
export type ConfidenceBreakdown = z.infer<typeof ConfidenceBreakdownSchema>;

export const StrategicScoresMapSchema = z.record(z.string().min(1), StrategicScoreSchema);

export type StrategicScoresMap = z.infer<typeof StrategicScoresMapSchema>;

export type TaskWithScores = {
  id: string;
  title?: string;
  content: string;
  impact: number;
  effort: number;
  confidence: number;
  priority: number;
  hasManualOverride: boolean;
  quadrant: Quadrant;
  reasoning?: {
    impact_keywords: string[];
    effort_source: EffortSource;
    effort_hint?: string;
    complexity_modifiers?: string[];
  };
  confidenceBreakdown?: ConfidenceBreakdown | null;
};
