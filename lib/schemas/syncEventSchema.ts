import { z } from 'zod';

export const syncEventTypeEnum = z.enum([
  'file_added',
  'file_modified',
  'file_deleted',
  'sync_error'
]);

export type SyncEventType = z.infer<typeof syncEventTypeEnum>;

export const syncEventStatusEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed'
]);

export type SyncEventStatus = z.infer<typeof syncEventStatusEnum>;

export const syncEventSchema = z.object({
  id: z.string().uuid(),
  connection_id: z.string().uuid(),
  event_type: syncEventTypeEnum,
  external_file_id: z.string().min(1),
  file_name: z.string().min(1).nullable(),
  status: syncEventStatusEnum,
  error_message: z.string().nullable(),
  retry_count: z.number().int().min(0).default(0),
  next_retry_at: z.string().datetime().nullable(),
  created_at: z.string().datetime()
});

export type SyncEvent = z.infer<typeof syncEventSchema>;
