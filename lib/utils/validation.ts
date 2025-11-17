import { z } from 'zod';

/**
 * Validates request body against a Zod schema
 * 
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns The validated and parsed data
 * @throws Error with validation details if validation fails
 */
export function validateRequestSchema<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): z.infer<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    // Re-throw the ZodError so callers can map to consistent error codes
    throw result.error;
  }

  return result.data;
}
