import { z } from 'zod';

/**
 * Outcome direction enum - controls the verb used in outcome assembly
 */
export const outcomeDirectionEnum = z.enum(
  ['increase', 'decrease', 'maintain', 'launch', 'ship'],
  {
    errorMap: () => ({
      message: 'Invalid direction. Must be one of: increase, decrease, maintain, launch, ship'
    })
  }
);

export type OutcomeDirection = z.infer<typeof outcomeDirectionEnum>;

/**
 * State preference enum - user's energy/motivation state for effort-based filtering
 */
export const statePreferenceEnum = z.enum(
  ['Energized', 'Low energy'],
  {
    errorMap: () => ({
      message: 'Invalid state. Must be "Energized" or "Low energy"'
    })
  }
);

export type StatePreference = z.infer<typeof statePreferenceEnum>;

/**
 * Input validation schema for creating/updating outcomes
 * Used for client-side and server-side validation
 */
export const outcomeInputSchema = z.object({
  direction: outcomeDirectionEnum,
  object: z.string()
    .min(3, 'Object must be at least 3 characters')
    .max(100, 'Object must not exceed 100 characters')
    .trim(),
  metric: z.string()
    .min(3, 'Metric must be at least 3 characters')
    .max(100, 'Metric must not exceed 100 characters')
    .trim(),
  clarifier: z.string()
    .min(3, 'Clarifier must be at least 3 characters')
    .max(150, 'Clarifier must not exceed 150 characters')
    .trim(),
  state_preference: statePreferenceEnum.optional(),
  daily_capacity_hours: z.number()
    .min(0.25, 'Capacity must be at least 0.25 hours (15 minutes)')
    .max(24, 'Capacity must not exceed 24 hours')
    .optional()
});

export type OutcomeInput = z.infer<typeof outcomeInputSchema>;

/**
 * Response schema for outcome API endpoints
 * Represents a complete outcome record from the database
 */
export const outcomeResponseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  direction: outcomeDirectionEnum,
  object_text: z.string(),
  metric_text: z.string(),
  clarifier: z.string(),
  assembled_text: z.string(),
  is_active: z.boolean(),
  state_preference: statePreferenceEnum.nullable(),
  daily_capacity_hours: z.number().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type OutcomeResponse = z.infer<typeof outcomeResponseSchema>;

/**
 * API response schema for GET /api/outcomes
 */
export const getOutcomeResponseSchema = z.object({
  outcome: outcomeResponseSchema.nullable()
});

/**
 * API response schema for POST /api/outcomes (create)
 */
export const createOutcomeResponseSchema = z.object({
  id: z.string().uuid(),
  assembled_text: z.string(),
  created_at: z.string().datetime(),
  message: z.string()
});

/**
 * API response schema for POST /api/outcomes (update)
 */
export const updateOutcomeResponseSchema = z.object({
  id: z.string().uuid(),
  assembled_text: z.string(),
  updated_at: z.string().datetime(),
  message: z.string()
});
