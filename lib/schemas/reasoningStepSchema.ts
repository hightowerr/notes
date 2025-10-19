import { z } from 'zod';

export const reasoningStepSchema = z.object({
  step_number: z.number().int().min(1).max(10),
  timestamp: z.string().datetime(),
  thought: z.string().min(1).optional().nullable(),
  tool_name: z.string().min(1).optional().nullable(),
  tool_input: z.unknown().optional().nullable(),
  tool_output: z.unknown().optional().nullable(),
  duration_ms: z.number().int().min(0),
  status: z.enum(['success', 'failed', 'skipped']),
});

export type ReasoningStepSchema = typeof reasoningStepSchema;
