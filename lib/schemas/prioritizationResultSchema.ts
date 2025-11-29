import { z } from 'zod';
import { excludedTaskSchema } from './excludedTaskSchema';
import { taskScoreSchema } from './taskScoreSchema';

const detailedThought = z
  .string()
  .min(10, 'Thought entries must provide meaningful detail (min 10 chars)')
  .max(1000, 'Thought entries cannot exceed 1000 characters');

const includedTaskSchema = z.object({
  task_id: z.string().min(1),
  inclusion_reason: z
    .string()
    .min(10, 'Inclusion reason must be at least 10 characters')
    .max(300, 'Inclusion reason cannot exceed 300 characters'),
  alignment_score: z
    .number()
    .min(0, 'Alignment score must be at least 0')
    .max(10, 'Alignment score cannot exceed 10'),
});

const prioritizationCoreSchema = z.object({
    thoughts: z.object({
      outcome_analysis: detailedThought,
      filtering_rationale: detailedThought,
      prioritization_strategy: detailedThought,
      self_check_notes: detailedThought,
    }),
    included_tasks: z
      .array(includedTaskSchema)
      .min(1, 'At least one task must be included')
      .max(500, 'Included tasks cannot exceed 500 items'),
    excluded_tasks: z
      .array(excludedTaskSchema)
      .max(500, 'Excluded tasks cannot exceed 500 items'),
    ordered_task_ids: z
      .array(z.string().min(1))
      .min(1, 'At least one ordered task id is required')
      .max(500, 'Ordered task ids cannot exceed 500 items'),
    per_task_scores: z.record(z.string().min(1), taskScoreSchema),
    confidence: z
      .number()
      .min(0, 'Confidence must be at least 0')
      .max(1, 'Confidence cannot exceed 1'),
    critical_path_reasoning: z
      .string()
      .min(10, 'Critical path reasoning must be at least 10 characters')
      .max(1000, 'Critical path reasoning cannot exceed 1000 characters'),
    corrections_made: z
      .string()
      .max(500, 'Corrections made cannot exceed 500 characters')
      .optional(),
  });

export const prioritizationResultSchema = prioritizationCoreSchema.superRefine((value, ctx) => {
  const includedIds = new Set(value.included_tasks.map(task => task.task_id));

  value.included_tasks.forEach(task => {
    if (!value.per_task_scores[task.task_id]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing per_task_scores entry for included task ${task.task_id}`,
        path: ['per_task_scores', task.task_id],
      });
    }
  });

  Object.keys(value.per_task_scores).forEach(taskId => {
    if (!includedIds.has(taskId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `per_task_scores entry found for non-included task ${taskId}`,
        path: ['per_task_scores', taskId],
      });
    }
  });
});

export type PrioritizationResult = z.infer<typeof prioritizationResultSchema>;
export { BriefReasoningSchema } from './taskScoreSchema';
