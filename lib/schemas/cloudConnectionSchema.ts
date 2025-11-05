import { z } from 'zod';

export const cloudProviderEnum = z.enum(['google_drive']);

export type CloudProvider = z.infer<typeof cloudProviderEnum>;

export const encryptedTokenSchema = z.string().min(1, 'Token is required');

export const cloudConnectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().min(1),
  provider: cloudProviderEnum,
  access_token: encryptedTokenSchema,
  refresh_token: encryptedTokenSchema,
  token_expires_at: z.string().datetime(),
  folder_id: z.string().min(1).nullable(),
  folder_name: z.string().min(1).nullable(),
  webhook_id: z.string().min(1).nullable(),
  status: z.enum(['active', 'error']),
  last_error_code: z.string().nullable(),
  last_error_message: z.string().nullable(),
  last_error_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type CloudConnection = z.infer<typeof cloudConnectionSchema>;
