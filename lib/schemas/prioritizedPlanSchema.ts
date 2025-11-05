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

export const taskAnnotationSchema = z.object({
  task_id: z.string().min(1),
  reasoning: z.string().min(1).optional(),
  dependency_notes: z.string().min(1).optional(),
  state: z.enum(['active', 'completed', 'discarded', 'manual_override', 'reintroduced']).optional(),
  previous_rank: z.number().int().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  confidence_delta: z.number().min(-1).max(1).nullable().optional(),
  manual_override: z.boolean().optional(),
  removal_reason: z.string().min(1).optional(),
});

export const taskRemovalSchema = z.object({
  task_id: z.string().min(1),
  removal_reason: z.string().min(1).optional(),
  previous_rank: z.number().int().min(1).nullable().optional(),
  previous_confidence: z.number().min(0).max(1).nullable().optional(),
});

export const prioritizedPlanSchema = z.object({
  ordered_task_ids: z.array(z.string().min(1)).min(1),
  execution_waves: z.array(executionWaveSchema),
  dependencies: z.array(taskDependencySchema),
  confidence_scores: z.record(z.number().min(0).max(1)),
  synthesis_summary: z.string().min(1),
  task_annotations: z.array(taskAnnotationSchema).optional(),
  removed_tasks: z.array(taskRemovalSchema).optional(),
  created_at: z.string().datetime().optional(),
});

export type ExecutionWaveSchema = typeof executionWaveSchema;
export type TaskDependencySchema = typeof taskDependencySchema;
export type TaskAnnotationSchema = typeof taskAnnotationSchema;
export type TaskRemovalSchema = typeof taskRemovalSchema;
export type PrioritizedPlanSchema = typeof prioritizedPlanSchema;
