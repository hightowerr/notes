import { z } from 'zod';

export const ManualOverrideSchema = z.object({
  impact: z.number().min(0).max(10),
  effort: z.number().min(0.5).max(160),
  reason: z.string().trim().max(500).optional(),
  timestamp: z.string().datetime(),
  session_id: z.string().uuid(),
});

export type ManualOverride = z.infer<typeof ManualOverrideSchema>;
export type ManualOverrideState = Omit<ManualOverride, 'timestamp' | 'session_id'> &
  Partial<Pick<ManualOverride, 'timestamp' | 'session_id'>> & {
    optimistic?: boolean;
  };

export const ManualOverrideInputSchema = z
  .object({
    task_id: z.string().min(1),
    impact: z.number().min(0).max(10).optional(),
    effort: z.number().min(0.5).max(160).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine(
    data =>
      typeof data.impact === 'number' ||
      typeof data.effort === 'number' ||
      (typeof data.reason === 'string' && data.reason.length > 0),
    {
      message: 'Provide at least one override value',
      path: ['impact'],
    }
  );

export type ManualOverrideInput = z.infer<typeof ManualOverrideInputSchema>;
