import { z } from 'zod';

export const excludedTaskSchema = z.object({
  task_id: z.string().min(1),
  task_text: z
    .string()
    .min(1, 'Task text must not be empty')
    .max(1000, 'Task text cannot exceed 1000 characters'),
  exclusion_reason: z
    .string()
    .min(10, 'Exclusion reason must be at least 10 characters')
    .max(300, 'Exclusion reason cannot exceed 300 characters'),
  alignment_score: z
    .number()
    .min(0, 'Alignment score must be at least 0')
    .max(10, 'Alignment score cannot exceed 10'),
});

export type ExcludedTask = z.infer<typeof excludedTaskSchema>;
