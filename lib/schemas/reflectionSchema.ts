import { z } from 'zod';

const reflectionEffectsSummarySchema = z.object({
  total: z.number().int().min(0),
  blocked: z.number().int().min(0),
  demoted: z.number().int().min(0),
  boosted: z.number().int().min(0),
});

/**
 * Zod schema for reflection input validation.
 *
 * Enforces:
 * - Text length: 10-500 characters
 * - Minimum word count: 3 words to ensure actionable context
 * - Automatic trimming of whitespace
 */
export const reflectionInputSchema = z.object({
  text: z.string()
    .min(10, 'Reflection must be at least 10 characters')
    .max(500, 'Reflection must be at most 500 characters')
    .trim()
    .refine(
      value => value.trim().split(/\s+/).filter(Boolean).length >= 3,
      'Reflection must include at least 3 words so we can act on it'
    )
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
  relative_time: z.string().min(1),
  effects_summary: reflectionEffectsSummarySchema.optional(),
});

export type ReflectionInput = z.infer<typeof reflectionInputSchema>;
export type Reflection = z.infer<typeof reflectionSchema>;
export type ReflectionWithWeight = z.infer<typeof reflectionWithWeightSchema>;
export type ReflectionEffectsSummary = z.infer<typeof reflectionEffectsSummarySchema>;
