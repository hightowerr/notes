import { z } from 'zod';

/**
 * Zod schema for reflection input validation.
 *
 * Enforces:
 * - Text length: 10-500 characters
 * - Automatic trimming of whitespace
 */
export const reflectionInputSchema = z.object({
  text: z.string()
    .min(10, 'Reflection must be at least 10 characters')
    .max(500, 'Reflection must be at most 500 characters')
    .trim()
});

/**
 * Reflection entity schema for persisted rows.
 * Adds toggle state and optional recency weight returned by APIs.
 */
export const reflectionSchema = reflectionInputSchema.extend({
  id: z.string().uuid(),
  user_id: z.string().min(1),
  created_at: z
    .string()
    .refine(value => !Number.isNaN(Date.parse(value)), {
      message: 'Invalid datetime',
    }),
  is_active_for_prioritization: z.boolean().default(true),
  recency_weight: z.number().min(0).max(1).optional()
});

/**
 * Schema for reflections returned to the client with computed metadata.
 * `weight` retained for backward compatibility until recency_weight rollout completes.
 */
export const reflectionWithWeightSchema = reflectionSchema.extend({
  weight: z.number().min(0).max(1),
  relative_time: z.string().min(1)
});

export type ReflectionInput = z.infer<typeof reflectionInputSchema>;
export type Reflection = z.infer<typeof reflectionSchema>;
export type ReflectionWithWeight = z.infer<typeof reflectionWithWeightSchema>;
