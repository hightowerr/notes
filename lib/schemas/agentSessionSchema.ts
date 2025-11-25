import { z } from 'zod';

import { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';
import { adjustedPlanSchema } from '@/lib/types/adjustment';

export const agentSessionStatusSchema = z.enum(['running', 'completed', 'failed']);

export const agentSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().min(1),
  outcome_id: z.string().uuid(),
  status: agentSessionStatusSchema,
  prioritized_plan: prioritizedPlanSchema.nullable(),
  baseline_document_ids: z.array(z.string().uuid()).nullable(),
  baseline_plan: prioritizedPlanSchema.nullable(),
  adjusted_plan: adjustedPlanSchema.nullable(),
  execution_metadata: executionMetadataSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type AgentSessionSchema = typeof agentSessionSchema;
