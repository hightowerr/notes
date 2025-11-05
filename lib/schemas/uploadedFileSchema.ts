import { z } from 'zod';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown'
] as const;

export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;

export const uploadedFileStatusEnum = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'review_required'
]);

export type UploadedFileStatus = z.infer<typeof uploadedFileStatusEnum>;

export const uploadedFileSourceEnum = z.enum([
  'manual_upload',
  'google_drive',
  'text_input'
]);

export type UploadedFileSource = z.infer<typeof uploadedFileSourceEnum>;

export const uploadedFileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_FILE_SIZE),
  mime_type: z.enum(ALLOWED_MIME_TYPES),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  uploaded_at: z.string().datetime(),
  storage_path: z.string().min(1).nullable(),
  status: uploadedFileStatusEnum,
  source: uploadedFileSourceEnum,
  external_id: z.string().min(1).nullable(),
  sync_enabled: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type UploadedFileRecord = z.infer<typeof uploadedFileSchema>;
