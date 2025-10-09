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
      const errorResponse: ErrorResponse = {
        success: false,
        error: validation.error!,
        code: validation.code!,
      };

      // Log rejection for observability (FR-007)
      console.error('[UPLOAD] File validation failed:', {
        filename: file.name,
        size: file.size,
        type: file.type,
        error: validation.error,
        code: validation.code,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(errorResponse, { status: 400 });
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
        status: 'processing', // FR-001: Automatic processing starts immediately
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

    // Trigger automatic processing (FR-001: Automatic detection on upload)
    const processUrl = new URL('/api/process', request.url);
    fetch(processUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    }).catch(error => {
      console.error('[UPLOAD] Failed to trigger processing:', error);
    });

    // Return success response
    const successResponse: UploadSuccessResponse = {
      success: true,
      fileId,
      status: 'processing',
      message: `File uploaded successfully. Processing started.`,
      queuePosition: null, // Will be implemented in T005 (concurrent uploads)
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
