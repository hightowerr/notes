import { z } from 'zod';

export const executionMetadataSchema = z.object({
  steps_taken: z.number().int().min(0),
  tool_call_count: z.record(z.number().int().min(0)).default({}),
  thinking_time_ms: z.number().int().min(0),
  tool_execution_time_ms: z.number().int().min(0),
  total_time_ms: z.number().int().min(0),
  error_count: z.number().int().min(0),
  success_rate: z.number().min(0).max(1),
  status_note: z.string().min(1).nullable().optional(),
  failed_tools: z.array(z.string().min(1)).default([]),
});

export type ExecutionMetadataSchema = typeof executionMetadataSchema;
