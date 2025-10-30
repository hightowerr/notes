import { z } from 'zod';

export const gapIndicatorsSchema = z.object({
  time_gap: z.boolean(),
  action_type_jump: z.boolean(),
  no_dependency: z.boolean(),
  skill_jump: z.boolean(),
});

export const gapSchema = z.object({
  id: z.string().uuid(),
  predecessor_task_id: z.string().min(1),
  successor_task_id: z.string().min(1),
  indicators: gapIndicatorsSchema,
  confidence: z.number().min(0).max(1),
  detected_at: z.string().datetime(),
});

export const gapDetectionResponseSchema = z.object({
  gaps: z.array(gapSchema),
  metadata: z.object({
    total_pairs_analyzed: z.number().int().nonnegative(),
    gaps_detected: z.number().int().nonnegative(),
    analysis_duration_ms: z.number().int().nonnegative(),
  }),
});

export type Gap = z.infer<typeof gapSchema>;
export type GapDetectionResponse = z.infer<typeof gapDetectionResponseSchema>;
