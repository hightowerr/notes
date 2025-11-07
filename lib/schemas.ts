/**
 * Zod Schemas for Data Validation
 * Implements validation rules from data-model.md
 */

import { z } from 'zod';

import {
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  ALLOWED_FILE_EXTENSIONS,
  uploadedFileStatusEnum,
  type UploadedFileStatus,
  uploadedFileSchema,
  type UploadedFileRecord
} from '@/lib/schemas/uploadedFileSchema';

export { MAX_FILE_SIZE, ALLOWED_MIME_TYPES, ALLOWED_FILE_EXTENSIONS };

export const FileStatus = uploadedFileStatusEnum;
export type FileStatusType = UploadedFileStatus;

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
export const UploadedFileSchema = uploadedFileSchema;
export type UploadedFile = UploadedFileRecord;

// Action item schema with metadata (T017)
export const ActionSchema = z.object({
  text: z.string().describe('Action description'),
  estimated_hours: z.number().min(0.25).max(8).describe('Estimated time in hours (15min to full day)'),
  effort_level: z.enum(['high', 'low']).describe('Effort level: high (deep focus) or low (routine)'),
  relevance_score: z.number().min(0).max(1).optional().describe('Relevance to outcome (0-1, computed via semantic similarity)'),
});

export type Action = z.infer<typeof ActionSchema>;

// Document output structure (matches data-model.md DocumentOutput)
export const DocumentOutputSchema = z.object({
  topics: z.array(z.string()).min(1).describe('Key topics/themes from document'),
  decisions: z.array(z.string()).describe('Decisions made or documented'),
  actions: z.array(ActionSchema).describe('Action items with time/effort estimates'),
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
  'cleanup',
  'embed', // T023: Embedding generation operation
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

// Cleanup response schema (T006)
export const CleanupResponseSchema = z.object({
  success: z.literal(true),
  deleted: z.object({
    files: z.number().int().nonnegative(),
    storage_mb: z.number().nonnegative(),
  }),
  errors: z.array(z.string()),
  dryRun: z.boolean().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
});

export type CleanupResponse = z.infer<typeof CleanupResponseSchema>;

// File validation helper
const MARKDOWN_FALLBACK_MIME_TYPES = new Set([
  '',
  'text/plain',
  'application/octet-stream',
  'text/x-markdown',
]);

const EXTENSION_TO_MIME: Record<typeof ALLOWED_FILE_EXTENSIONS[number], typeof ALLOWED_MIME_TYPES[number]> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

type FileValidationSuccess = {
  valid: true;
  normalizedMimeType: typeof ALLOWED_MIME_TYPES[number];
  extension: typeof ALLOWED_FILE_EXTENSIONS[number];
};

type FileValidationFailure = {
  valid: false;
  error: string;
  code: ErrorCodeType;
};

export type FileValidationResult = FileValidationSuccess | FileValidationFailure;

export function validateFileUpload(file: File): FileValidationResult {
  console.log('[VALIDATE_FILE]', { name: file.name, type: file.type, size: file.size });
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    console.log('[VALIDATE_FILE] File too large');
    return {
      valid: false,
      error: `File size exceeds 10MB limit. Size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`,
      code: 'FILE_TOO_LARGE',
    };
  }

  // Check file size is not zero
  if (file.size === 0) {
    console.log('[VALIDATE_FILE] File is empty');
    return {
      valid: false,
      error: 'File is empty',
      code: 'INVALID_FILE',
    };
  }

  // Check file extension first (more reliable than MIME type for .md files)
  const extension = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '';
  const isAllowedExtension = (ext: string): ext is typeof ALLOWED_FILE_EXTENSIONS[number] => {
    return (ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(ext);
  };

  if (!isAllowedExtension(extension)) {
    console.log('[VALIDATE_FILE] Invalid extension');
    return {
      valid: false,
      error: `Unsupported file extension: ${extension}. Supported extensions: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`,
      code: 'UNSUPPORTED_FORMAT',
    };
  }

  const normalizedType = (file.type || '').toLowerCase();
  let normalizedMimeType: typeof ALLOWED_MIME_TYPES[number] | null = null;

  if (extension === '.md') {
    const allowedMarkdownTypes = new Set(['text/markdown', ...MARKDOWN_FALLBACK_MIME_TYPES]);
    if (normalizedType && !allowedMarkdownTypes.has(normalizedType)) {
      console.log('[VALIDATE_FILE] Invalid MIME type for markdown', { type: normalizedType });
      return {
        valid: false,
        error: `Unsupported file format: ${file.type}. Supported formats: PDF, DOCX, TXT, MD`,
        code: 'UNSUPPORTED_FORMAT',
      };
    }
    normalizedMimeType = 'text/markdown';
  } else if (extension === '.txt') {
    if (normalizedType && normalizedType !== 'text/plain') {
      console.log('[VALIDATE_FILE] Invalid MIME type for text file', { type: normalizedType });
      return {
        valid: false,
        error: `Unsupported file format: ${file.type}. Supported formats: PDF, DOCX, TXT, MD`,
        code: 'UNSUPPORTED_FORMAT',
      };
    }
    normalizedMimeType = 'text/plain';
  } else {
    const expectedMime = EXTENSION_TO_MIME[extension];
    if (!expectedMime) {
      console.log('[VALIDATE_FILE] Missing MIME mapping for extension', { extension });
      return {
        valid: false,
        error: `Unsupported file format: ${file.type}. Supported formats: PDF, DOCX, TXT, MD`,
        code: 'UNSUPPORTED_FORMAT',
      };
    }

    if (normalizedType && normalizedType !== expectedMime) {
      console.log('[VALIDATE_FILE] MIME type mismatch', { type: normalizedType, expected: expectedMime });
      return {
        valid: false,
        error: `Unsupported file format: ${file.type}. Supported formats: PDF, DOCX, TXT, MD`,
        code: 'UNSUPPORTED_FORMAT',
      };
    }

    normalizedMimeType = expectedMime;
  }

  if (!normalizedMimeType) {
    console.log('[VALIDATE_FILE] Failed to normalize MIME type', { name: file.name });
    return {
      valid: false,
      error: `Unsupported file format: ${file.type}. Supported formats: PDF, DOCX, TXT, MD`,
      code: 'UNSUPPORTED_FORMAT',
    };
  }

  console.log('[VALIDATE_FILE] File is valid', { normalizedMimeType, extension });
  return {
    valid: true,
    normalizedMimeType,
    extension,
  };
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
