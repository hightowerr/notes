/**
 * Zod Schemas for Data Validation
 * Implements validation rules from data-model.md
 */

import { z } from 'zod';

// File upload validation constants
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'text/plain',
  'text/markdown',
] as const;

export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;

// Upload file status enum
export const FileStatus = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'review_required',
]);

export type FileStatusType = z.infer<typeof FileStatus>;

// Error codes for API responses
export const ErrorCode = z.enum([
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FORMAT',
  'INVALID_FILE',
  'DUPLICATE_FILE',
  'STORAGE_ERROR',
  'PROCESSING_ERROR',
  'INVALID_REQUEST',
  'FILE_NOT_FOUND',
  'CONVERSION_ERROR',
  'SUMMARIZATION_ERROR',
]);

export type ErrorCodeType = z.infer<typeof ErrorCode>;

// UploadedFile entity schema (matches data-model.md)
export const UploadedFileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_FILE_SIZE),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), // SHA-256 hash
  uploadedAt: z.date(),
  storagePath: z.string().min(1),
  status: FileStatus,
});

export type UploadedFile = z.infer<typeof UploadedFileSchema>;

// Document output structure (matches data-model.md DocumentOutput)
export const DocumentOutputSchema = z.object({
  topics: z.array(z.string()).min(1).describe('Key topics/themes from document'),
  decisions: z.array(z.string()).describe('Decisions made or documented'),
  actions: z.array(z.string()).describe('Action items identified'),
  lno_tasks: z.object({
    leverage: z.array(z.string()).describe('High-impact strategic tasks'),
    neutral: z.array(z.string()).describe('Necessary operational tasks'),
    overhead: z.array(z.string()).describe('Low-value administrative tasks'),
  }),
});

export type DocumentOutput = z.infer<typeof DocumentOutputSchema>;

// ProcessedDocument entity schema (matches data-model.md)
export const ProcessedDocumentSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
  markdownContent: z.string(),
  markdownStoragePath: z.string(),
  structuredOutput: DocumentOutputSchema,
  jsonStoragePath: z.string(),
  confidence: z.number().min(0).max(1),
  processingDuration: z.number().int().nonnegative(),
  processedAt: z.date(),
  expiresAt: z.date(),
});

export type ProcessedDocument = z.infer<typeof ProcessedDocumentSchema>;

// Processing log operation enum
export const LogOperation = z.enum([
  'upload',
  'convert',
  'summarize',
  'store',
  'retry',
  'error',
]);

export type LogOperationType = z.infer<typeof LogOperation>;

// Processing log status enum
export const LogStatus = z.enum(['started', 'completed', 'failed']);

export type LogStatusType = z.infer<typeof LogStatus>;

// ProcessingLog entity schema (matches data-model.md)
export const ProcessingLogSchema = z.object({
  id: z.string().uuid(),
  fileId: z.string().uuid().nullable(),
  documentId: z.string().uuid().nullable(),
  operation: LogOperation,
  status: LogStatus,
  duration: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  timestamp: z.date(),
});

export type ProcessingLog = z.infer<typeof ProcessingLogSchema>;

// API Response Schemas

// Success response for upload endpoint
export const UploadSuccessResponseSchema = z.object({
  success: z.literal(true),
  fileId: z.string().uuid(),
  status: FileStatus,
  message: z.string(),
  queuePosition: z.number().int().positive().nullable().optional(),
});

export type UploadSuccessResponse = z.infer<typeof UploadSuccessResponseSchema>;

// Success response for process endpoint
export const ProcessSuccessResponseSchema = z.object({
  success: z.literal(true),
  documentId: z.string().uuid(),
  fileId: z.string().uuid(),
  markdownContent: z.string(),
  structuredOutput: DocumentOutputSchema,
  confidence: z.number().min(0).max(1),
  processingDuration: z.number().int().nonnegative(),
  metrics: z.object({
    fileHash: z.string(),
    processingDuration: z.number(),
    confidence: z.number(),
  }),
});

export type ProcessSuccessResponse = z.infer<typeof ProcessSuccessResponseSchema>;

// Success response for status endpoint
export const StatusResponseSchema = z.object({
  fileId: z.string().uuid(),
  status: FileStatus,
  summary: DocumentOutputSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  processingDuration: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

export type StatusResponse = z.infer<typeof StatusResponseSchema>;

// Error response schema
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: ErrorCode,
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// File validation helper
export function validateFileUpload(file: File): { valid: boolean; error?: string; code?: ErrorCodeType } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds 10MB limit. Size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`,
      code: 'FILE_TOO_LARGE',
    };
  }

  // Check file size is not zero
  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty',
      code: 'INVALID_FILE',
    };
  }

  // Check MIME type with proper type narrowing
  const isAllowedMimeType = (type: string): type is typeof ALLOWED_MIME_TYPES[number] => {
    return (ALLOWED_MIME_TYPES as readonly string[]).includes(type);
  };

  if (!isAllowedMimeType(file.type)) {
    return {
      valid: false,
      error: `Unsupported file format: ${file.type}. Supported formats: PDF, DOCX, TXT, MD`,
      code: 'UNSUPPORTED_FORMAT',
    };
  }

  // Check file extension as additional validation
  const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  const isAllowedExtension = (ext: string): ext is typeof ALLOWED_FILE_EXTENSIONS[number] => {
    return (ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(ext);
  };

  if (!isAllowedExtension(extension)) {
    return {
      valid: false,
      error: `Unsupported file extension: ${extension}. Supported extensions: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`,
      code: 'UNSUPPORTED_FORMAT',
    };
  }

  return { valid: true };
}

// Generate content hash (SHA-256) from file buffer
export async function generateContentHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Sanitize filename to prevent path traversal attacks
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
    .replace(/\.+/g, '.') // Replace multiple dots with single dot
    .replace(/^\./, '') // Remove leading dot
    .substring(0, 255); // Limit length
}
