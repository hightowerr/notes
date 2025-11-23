import { z } from 'zod';

export const chainOfThoughtStepSchema = z.object({
  iteration: z
    .number()
    .int('Iteration must be an integer')
    .min(1, 'Iteration must be at least 1')
    .max(3, 'Iteration cannot exceed 3'),
  confidence: z
    .number()
    .min(0, 'Confidence must be at least 0')
    .max(1, 'Confidence cannot exceed 1'),
  corrections: z
    .string()
    .max(500, 'Corrections text cannot exceed 500 characters'),
  evaluator_feedback: z
    .string()
    .max(1000, 'Evaluator feedback cannot exceed 1000 characters')
    .optional(),
  timestamp: z.string().datetime('Timestamp must be an ISO 8601 datetime string'),
});

export const hybridLoopMetadataSchema = z
  .object({
    iterations: z
      .number()
      .int('Iterations must be an integer')
      .min(1, 'At least one iteration is required')
      .max(3, 'Iterations cannot exceed 3'),
    duration_ms: z
      .number()
      .int('Duration must be an integer')
      .min(0, 'Duration must be non-negative'),
    evaluation_triggered: z.boolean(),
    chain_of_thought: z
      .array(chainOfThoughtStepSchema)
      .min(1, 'At least one chain-of-thought step is required')
      .max(3, 'Chain-of-thought cannot exceed 3 steps'),
    converged: z.boolean(),
    final_confidence: z
      .number()
      .min(0, 'Final confidence must be at least 0')
      .max(1, 'Final confidence cannot exceed 1'),
  })
  .superRefine((value, ctx) => {
    if (value.chain_of_thought.length !== value.iterations) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'iterations must match chain_of_thought length',
        path: ['chain_of_thought'],
      });
    }
  });

export type ChainOfThoughtStep = z.infer<typeof chainOfThoughtStepSchema>;
export type HybridLoopMetadata = z.infer<typeof hybridLoopMetadataSchema>;
