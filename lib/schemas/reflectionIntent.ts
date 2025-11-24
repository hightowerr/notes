import { z } from 'zod';

export const reflectionIntentTypeSchema = z.enum([
  'constraint',
  'opportunity',
  'capacity',
  'sequencing',
  'information',
]);

export const reflectionIntentSubtypeSchema = z.enum([
  'blocker',
  'soft-block',
  'boost',
  'energy-level',
  'dependency',
  'context-only',
]);

export const reflectionIntentStrengthSchema = z.enum(['hard', 'soft']);

export const reflectionIntentDurationSchema = z
  .object({
    until: z.string().datetime().optional(),
    from: z.string().datetime().optional(),
    days: z.number().positive().optional(),
  })
  .partial()
  .optional();

// Keywords are limited to prevent LLM over-extraction and keep matching performant
const keywordsSchema = z
  .array(z.string().min(1).max(50))
  .max(10)
  .default([]);

/**
 * Core interpretation payload returned by the interpreter before persistence.
 */
export const reflectionIntentCoreSchema = z.object({
  type: reflectionIntentTypeSchema,
  subtype: reflectionIntentSubtypeSchema,
  keywords: keywordsSchema,
  strength: reflectionIntentStrengthSchema.default('soft'),
  duration: reflectionIntentDurationSchema,
  summary: z.string().min(1).max(500),
});

/**
 * Persisted record shape (includes identifiers and timestamps).
 */
export const reflectionIntentSchema = reflectionIntentCoreSchema.extend({
  id: z.string().uuid().optional(),
  reflection_id: z.string().uuid().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type ReflectionIntentType = z.infer<typeof reflectionIntentTypeSchema>;
export type ReflectionIntentSubtype = z.infer<typeof reflectionIntentSubtypeSchema>;
export type ReflectionIntentStrength = z.infer<typeof reflectionIntentStrengthSchema>;
export type ReflectionIntentDuration = z.infer<typeof reflectionIntentDurationSchema>;
export type ReflectionIntent = z.infer<typeof reflectionIntentSchema>;
