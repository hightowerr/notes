import { z } from 'zod';

export const cognitionLevelSchema = z.enum(['low', 'medium', 'high']);

export const bridgingTaskSchema = z.object({
  id: z.string().uuid(),
  gap_id: z.string().uuid(),
  task_text: z.string().min(10).max(500),
  estimated_hours: z.number().int().min(8).max(160),
  cognition_level: cognitionLevelSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(20).max(1000),
  source: z.literal('ai_generated'),
  requires_review: z.boolean(),
  created_at: z.string().datetime(),
  edited_task_text: z.string().min(10).max(500).optional(),
  edited_estimated_hours: z.number().int().min(8).max(160).optional(),
});

export const bridgingTaskResponseSchema = z.object({
  bridging_tasks: z.array(bridgingTaskSchema),
  search_results_count: z.number().int().min(0),
  generation_duration_ms: z.number().int().min(0),
});

export type CognitionLevel = z.infer<typeof cognitionLevelSchema>;
export type BridgingTask = z.infer<typeof bridgingTaskSchema>;
export type BridgingTaskResponse = z.infer<typeof bridgingTaskResponseSchema>;
