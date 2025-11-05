import { z } from 'zod';

import { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';

export const agentSessionStatusSchema = z.enum(['running', 'completed', 'failed']);

export const agentSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().min(1),
  outcome_id: z.string().uuid(),
  status: agentSessionStatusSchema,
  prioritized_plan: prioritizedPlanSchema.nullable(),
  execution_metadata: executionMetadataSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type AgentSessionSchema = typeof agentSessionSchema;
