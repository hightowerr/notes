import { z } from 'zod';

export const documentStatusSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  uploaded_at: z.string().nullable(),
  task_count: z.number().int().min(0),
  status: z.enum(['included', 'excluded', 'pending']),
  included_at: z.string().nullable(),
});

export const documentStatusResponseSchema = z.object({
  documents: z.array(documentStatusSchema),
  summary: z.object({
    included_count: z.number().int().min(0),
    excluded_count: z.number().int().min(0),
    pending_count: z.number().int().min(0),
    total_task_count: z.number().int().min(0),
  }),
  total: z.number().int().min(0).optional(),
});

export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type DocumentStatusResponse = z.infer<typeof documentStatusResponseSchema>;
