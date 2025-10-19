import { z } from 'zod';

import { reasoningStepSchema } from '@/lib/schemas/reasoningStepSchema';

export const reasoningTraceSchema = z.object({
  session_id: z.string().uuid(),
  steps: z.array(reasoningStepSchema).min(1).max(10),
  total_duration_ms: z.number().int().min(0),
  total_steps: z.number().int().min(1).max(10),
  tools_used_count: z.record(z.number().int().min(0)).default({}),
  created_at: z.string().datetime().optional(),
});

export type ReasoningTraceSchema = typeof reasoningTraceSchema;
