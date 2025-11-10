import { z } from 'zod';

export const manualTaskInputSchema = z.object({
  task_text: z
    .string({ required_error: 'Task text is required' })
    .trim()
    .min(10, 'Task text must be at least 10 characters')
    .max(500, 'Task text cannot exceed 500 characters'),
  estimated_hours: z
    .number()
    .int()
    .min(8, 'Estimated hours must be at least 8')
    .max(160, 'Estimated hours cannot exceed 160')
    .optional(),
  outcome_id: z.string().uuid().optional(),
});

export const manualTaskResponseSchema = z.object({
  task_id: z.string(),
  success: z.literal(true),
  prioritization_triggered: z.boolean(),
  message: z.string().optional(),
});

export const taskEditInputSchema = z
  .object({
    task_text: z
      .string({ required_error: 'Task text is required' })
      .trim()
      .min(10, 'Task text must be at least 10 characters')
      .max(500, 'Task text cannot exceed 500 characters')
      .optional(),
    estimated_hours: z
      .number()
      .int()
      .min(8, 'Estimated hours must be at least 8')
      .max(160, 'Estimated hours cannot exceed 160')
      .optional(),
    outcome_id: z.string().uuid().optional(),
  })
  .refine(
    payload => {
      return (
        typeof payload.task_text === 'string' ||
        typeof payload.estimated_hours === 'number'
      );
    },
    { message: 'NO_FIELDS_PROVIDED' }
  );

export type ManualTaskInput = z.infer<typeof manualTaskInputSchema>;
export type TaskEditInput = z.infer<typeof taskEditInputSchema>;
