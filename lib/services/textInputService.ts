'use server';

/**
 * Text Input Service
 * Implements virtual document creation for direct text submissions.
 *
 * Responsibilities:
 * - Validate text input content and metadata
 * - Ensure size limits and deduplication via content hash
 * - Create virtual uploaded_files record (source='text_input')
 * - Enqueue processing job via shared processing queue
 */

import { randomUUID } from 'crypto';
import { supabase } from '@/lib/supabase';
import { generateContentHash } from '@/lib/schemas';
import { processingQueue } from '@/lib/services/processingQueue';

const MAX_TEXT_BYTES = 102_400; // 100KB limit

export type TextInputPayload = {
  content: string;
  title?: string | null;
};

export type TextInputResult =
  | {
      success: true;
      fileId: string;
      filename: string;
      initialStatus: 'processing' | 'pending';
      queuePosition: number | null;
      rawContent: string;
      contentHash: string;
    }
  | {
      success: false;
      statusCode: number;
      message: string;
      code: 'INVALID_REQUEST' | 'FILE_TOO_LARGE' | 'DUPLICATE_FILE' | 'STORAGE_ERROR';
    };

const TEXT_ENCODER = new TextEncoder();

export async function createTextInputDocument(payload: TextInputPayload): Promise<TextInputResult> {
  const rawContent = typeof payload.content === 'string' ? payload.content : '';
  const trimmedContent = rawContent.trim();

  if (!trimmedContent) {
    return {
      success: false,
      statusCode: 400,
      message: 'Content cannot be empty.',
      code: 'INVALID_REQUEST',
    };
  }

  const encoded = TEXT_ENCODER.encode(rawContent);
  const byteLength = encoded.byteLength;

  if (byteLength > MAX_TEXT_BYTES) {
    return {
      success: false,
      statusCode: 413,
      message: 'Text input exceeds the 100KB limit. Please shorten the content.',
      code: 'FILE_TOO_LARGE',
    };
  }

  const contentBuffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  const contentHash = await generateContentHash(contentBuffer);

  // Deduplication: reuse existing document if identical content already processed
  const { data: existingDocument, error: fetchError } = await supabase
    .from('uploaded_files')
    .select('id, name')
    .eq('content_hash', contentHash)
    .maybeSingle();

  if (fetchError) {
    console.error('[TextInputService] Failed to check for duplicates:', fetchError);
    return {
      success: false,
      statusCode: 500,
      message: 'Failed to validate text input. Please try again.',
      code: 'STORAGE_ERROR',
    };
  }

  if (existingDocument) {
    return {
      success: false,
      statusCode: 409,
      message: `Duplicate content detected. A document with identical text already exists (${existingDocument.name}).`,
      code: 'DUPLICATE_FILE',
    };
  }

  const fileId = randomUUID();
  const timestamp = new Date();
  const isoTimestamp = timestamp.toISOString();
  const filename =
    typeof payload.title === 'string' && payload.title.trim().length > 0
      ? payload.title.trim()
      : `Text Input - ${isoTimestamp.replace('T', ' ').replace('Z', '')}`;

  // Enqueue processing job prior to persistence (mirrors manual upload flow)
  const queueResult = processingQueue.enqueue(fileId, filename, {
    inlineContent: rawContent,
    contentHash,
  });
  const initialStatus = queueResult.immediate ? 'processing' : 'pending';

  const { error: insertError } = await supabase.from('uploaded_files').insert({
    id: fileId,
    name: filename,
    size: byteLength,
    mime_type: 'text/markdown',
    content_hash: contentHash,
    uploaded_at: isoTimestamp,
    storage_path: null,
    status: initialStatus,
    queue_position: queueResult.queuePosition,
    source: 'text_input',
    external_id: null,
    sync_enabled: false,
  });

  if (insertError) {
    console.error('[TextInputService] Failed to create virtual document:', insertError);
    return {
      success: false,
      statusCode: 500,
      message: 'Failed to create text input document. Please try again.',
      code: 'STORAGE_ERROR',
    };
  }

  // Log creation event for observability
  await supabase.from('processing_logs').insert({
    file_id: fileId,
    operation: 'upload',
    status: 'completed',
    duration: 0,
    metadata: {
      filename,
      mime_type: 'text/markdown',
      content_hash: contentHash,
      source: 'text_input',
      size: byteLength,
    },
    timestamp: isoTimestamp,
  });

  return {
    success: true,
    fileId,
    filename,
    initialStatus,
    queuePosition: queueResult.queuePosition,
    rawContent,
    contentHash,
  };
}
