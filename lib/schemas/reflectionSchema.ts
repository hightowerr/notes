import { z } from 'zod';

/**
 * Zod schema for reflection input validation
 * Feature: 004-reflection-capture-quick
 *
 * Enforces:
 * - Text length: 10-500 characters
 * - Automatic trimming of whitespace
 */
export const reflectionSchema = z.object({
  text: z.string()
    .min(10, 'Reflection must be at least 10 characters')
    .max(500, 'Reflection must be at most 500 characters')
    .trim()
});

/**
 * TypeScript type for reflection input (client-side)
 */
export type ReflectionInput = z.infer<typeof reflectionSchema>;

/**
 * TypeScript type for reflection entity (database)
 * Note: user_id is TEXT (not UUID) to support anonymous users in P0
 */
export interface Reflection {
  id: string;
  user_id: string;  // TEXT field - can be UUID string or 'anonymous-user-p0'
  text: string;
  created_at: string; // ISO timestamp
}

/**
 * TypeScript type for reflection with calculated fields
 * Used in API responses and UI components
 */
export interface ReflectionWithWeight extends Reflection {
  weight: number;        // Calculated: 0.5^(age_in_days/7)
  relative_time: string; // Calculated: "Just now", "3h ago", "2 days ago"
}
