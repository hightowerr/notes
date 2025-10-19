import { z } from 'zod';

export const executionWaveSchema = z.object({
  wave_number: z.number().int().min(1),
  task_ids: z.array(z.string().min(1)).min(1),
  parallel_execution: z.boolean(),
  estimated_duration_hours: z.number().min(0).max(200).nullable().optional(),
});

export const taskDependencySchema = z.object({
  source_task_id: z.string().min(1),
  target_task_id: z.string().min(1),
  relationship_type: z.enum(['prerequisite', 'blocks', 'related']),
  confidence: z.number().min(0).max(1),
  detection_method: z.enum(['ai_inference', 'stored_relationship']),
});

export const prioritizedPlanSchema = z.object({
  ordered_task_ids: z.array(z.string().min(1)).min(1),
  execution_waves: z.array(executionWaveSchema),
  dependencies: z.array(taskDependencySchema),
  confidence_scores: z.record(z.number().min(0).max(1)),
  synthesis_summary: z.string().min(1),
});

export type ExecutionWaveSchema = typeof executionWaveSchema;
export type TaskDependencySchema = typeof taskDependencySchema;
export type PrioritizedPlanSchema = typeof prioritizedPlanSchema;
