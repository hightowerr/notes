import { z } from 'zod';

export const adjustmentDiffSchema = z.object({
  moved: z.array(z.object({
    task_id: z.string().uuid(),
    from: z.number().int().positive(),
    to: z.number().int().positive(),
    reason: z.string().min(1).max(200),
  })),
  filtered: z.array(z.object({
    task_id: z.string().uuid(),
    reason: z.string().min(1).max(200),
  })),
});

export type AdjustmentDiff = z.infer<typeof adjustmentDiffSchema>;

export const adjustmentMetadataSchema = z.object({
  reflections: z.array(z.object({
    id: z.string().uuid(),
    text: z.string(),
    recency_weight: z.number().min(0).max(1),
    created_at: z.string().datetime(),
  })),
  tasks_moved: z.number().int().min(0),
  tasks_filtered: z.number().int().min(0),
  duration_ms: z.number().min(0),
});

export type AdjustmentMetadata = z.infer<typeof adjustmentMetadataSchema>;

export const adjustedPlanSchema = z.object({
  ordered_task_ids: z.array(z.string().uuid()),
  confidence_scores: z.record(z.number().min(0).max(1)),
  diff: adjustmentDiffSchema,
  adjustment_metadata: adjustmentMetadataSchema,
});

export type AdjustedPlan = z.infer<typeof adjustedPlanSchema>;
