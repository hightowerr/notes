/**
 * File Upload API Endpoint
 * Implements upload-api.yaml contract
 *
 * Functional Requirements:
 * - FR-001: Automatic detection on upload
 * - FR-016: Reject files > 10MB
 * - FR-008: Handle invalid formats gracefully
 * - FR-012: Generate content hash for deduplication
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import {
  validateFileUpload,
  generateContentHash,
  sanitizeFilename,
  type UploadSuccessResponse,
  type ErrorResponse,
} from '@/lib/schemas';
import { randomUUID } from 'crypto';
import { processingQueue } from '@/lib/services/processingQueue';

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Extract file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // Validate file exists
    if (!file) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'No file provided in request',
        code: 'INVALID_FILE',
      };
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Validate file size and format
    const validation = validateFileUpload(file);
    if (!validation.valid) {
      // Enhanced error message with filename
      const enhancedError = validation.code === 'FILE_TOO_LARGE'
        ? `File too large: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum size: 10MB`
        : validation.code === 'UNSUPPORTED_FORMAT'
        ? `Unsupported file type: ${file.name}. Please use PDF, DOCX, or TXT files.`
        : validation.error!;

      const errorResponse: ErrorResponse = {
        success: false,
        error: enhancedError,
        code: validation.code!,
      };

      // Log rejection for observability (FR-007)
      console.error('[UPLOAD] File validation failed:', {
        filename: file.name,
        size: file.size,
        type: file.type,
        error: enhancedError,
        code: validation.code,
        timestamp: new Date().toISOString(),
      });

      // Log rejected upload to processing_logs table (T004)
      const duration = Date.now() - startTime;
      await supabase
        .from('processing_logs')
        .insert({
          file_id: null, // No file ID yet for rejected uploads
          operation: 'upload',
          status: 'failed',
          duration,
          error: enhancedError,
          metadata: {
            filename: file.name,
            size: file.size,
            mime_type: file.type,
            rejection_reason: validation.code,
          },
          timestamp: new Date().toISOString(),
        });

      // Return appropriate HTTP status code (413 for size, 400 for format)
      const statusCode = validation.code === 'FILE_TOO_LARGE' ? 413 : 400;
      return NextResponse.json(errorResponse, { status: statusCode });
    }

    // Generate unique file ID
    const fileId = randomUUID();

    // Read file content to generate hash (FR-012: Content hash for deduplication)
    const arrayBuffer = await file.arrayBuffer();
    const contentHash = await generateContentHash(arrayBuffer);

    // Sanitize filename to prevent path traversal
    const safeName = sanitizeFilename(file.name);

    // Create storage path with hash prefix for uniqueness
    const storagePath = `${contentHash.substring(0, 8)}-${safeName}`;

    // Upload file to Supabase storage
    const { error: uploadError } = await supabase
      .storage
      .from('notes')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false, // Prevent overwriting existing files
      });

    if (uploadError) {
      // Check if file already exists (duplicate hash)
      if (uploadError.message.includes('already exists')) {
        console.log('[UPLOAD] Duplicate file detected:', {
          contentHash,
          filename: file.name,
          timestamp: new Date().toISOString(),
        });

        // Check if this hash already exists in database
        const { data: existingFile } = await supabase
          .from('uploaded_files')
          .select('id, name, status')
          .eq('content_hash', contentHash)
          .single();

        const errorResponse: ErrorResponse = {
          success: false,
          error: `Duplicate file detected. A file with identical content already exists${existingFile ? ` (${existingFile.name})` : ''}.`,
          code: 'DUPLICATE_FILE',
        };

        return NextResponse.json(errorResponse, { status: 409 });
      }

      const errorResponse: ErrorResponse = {
        success: false,
        error: `Failed to store file: ${uploadError.message}`,
        code: 'STORAGE_ERROR',
      };

      console.error('[UPLOAD] Storage error:', {
        fileId,
        filename: file.name,
        error: uploadError.message,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(errorResponse, { status: 500 });
    }

    // Check queue status and enqueue job (T005: Concurrent upload management)
    const queueResult = processingQueue.enqueue(fileId, file.name);

    // Determine initial status based on queue result
    const initialStatus = queueResult.immediate ? 'processing' : 'pending';

    // Insert file metadata into uploaded_files table
    const { error: dbError } = await supabase
      .from('uploaded_files')
      .insert({
        id: fileId,
        name: file.name,
        size: file.size,
        mime_type: file.type,
        content_hash: contentHash,
        uploaded_at: new Date().toISOString(),
        storage_path: storagePath,
        status: initialStatus,
        queue_position: queueResult.queuePosition, // T005: Track queue position
      });

    if (dbError) {
      // Rollback: Delete uploaded file from storage
      await supabase.storage.from('notes').remove([storagePath]);

      // Check if error is due to duplicate content_hash (UNIQUE constraint)
      if (dbError.message.includes('duplicate key') || dbError.message.includes('content_hash')) {
        console.log('[UPLOAD] Duplicate content hash detected in database:', {
          contentHash,
          filename: file.name,
          timestamp: new Date().toISOString(),
        });

        // Find existing file with same hash
        const { data: existingFile } = await supabase
          .from('uploaded_files')
          .select('id, name, status')
          .eq('content_hash', contentHash)
          .single();

        const errorResponse: ErrorResponse = {
          success: false,
          error: `Duplicate file detected. A file with identical content already exists${existingFile ? ` (${existingFile.name})` : ''}.`,
          code: 'DUPLICATE_FILE',
        };

        return NextResponse.json(errorResponse, { status: 409 });
      }

      const errorResponse: ErrorResponse = {
        success: false,
        error: `Failed to save file metadata: ${dbError.message}`,
        code: 'STORAGE_ERROR',
      };

      console.error('[UPLOAD] Database error:', {
        fileId,
        filename: file.name,
        error: dbError.message,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(errorResponse, { status: 500 });
    }

    // Log successful upload for observability (FR-007)
    const duration = Date.now() - startTime;
    console.log('[UPLOAD] File uploaded successfully:', {
      fileId,
      filename: file.name,
      size: file.size,
      contentHash,
      storagePath,
      duration,
      timestamp: new Date().toISOString(),
    });

    // Insert processing log entry
    await supabase
      .from('processing_logs')
      .insert({
        file_id: fileId,
        operation: 'upload',
        status: 'completed',
        duration,
        metadata: {
          filename: file.name,
          size: file.size,
          mime_type: file.type,
          content_hash: contentHash,
        },
        timestamp: new Date().toISOString(),
      });

    // Trigger automatic processing only if not queued (FR-001 + T005)
    if (queueResult.immediate) {
      const processUrl = new URL('/api/process', request.url);
      if (processUrl.hostname === 'localhost' || processUrl.hostname === '127.0.0.1') {
        processUrl.protocol = 'http:';
      }

      fetch(processUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      }).catch(error => {
        console.error('[UPLOAD] Failed to trigger processing:', error);
      });
    }

    // Return success response (T005: Include queue position)
    const successResponse: UploadSuccessResponse = {
      success: true,
      fileId,
      status: initialStatus,
      message: queueResult.immediate
        ? `File uploaded successfully. Processing started.`
        : `File uploaded successfully. Queued at position ${queueResult.queuePosition}.`,
      queuePosition: queueResult.queuePosition,
    };

    return NextResponse.json(successResponse, { status: 201 });

  } catch (error) {
    console.error('[UPLOAD] Unexpected error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    const errorResponse: ErrorResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'STORAGE_ERROR',
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
