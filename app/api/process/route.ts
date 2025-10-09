/**
 * Processing Pipeline API Endpoint
 * POST /api/process
 *
 * Orchestrates the complete document processing workflow:
 * 1. Fetch uploaded file from Supabase storage
 * 2. Convert to Markdown (PDF/DOCX/TXT)
 * 3. Extract structured data with AI
 * 4. Store outputs (Markdown + JSON) in Supabase
 * 5. Log metrics and update file status
 *
 * Implements FR-002, FR-003, FR-004, FR-007, FR-009, FR-010, FR-011, FR-013
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { convertToMarkdown } from '@/lib/services/noteProcessor';
import { extractStructuredData, calculateLowConfidence } from '@/lib/services/aiSummarizer';
import type { LogOperationType, LogStatusType } from '@/lib/schemas';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let fileId: string | undefined;

  try {
    // 1. Validate request body
    const body = await request.json();
    fileId = body.fileId;

    if (!fileId) {
      return Response.json(
        {
          success: false,
          error: 'Missing required parameter: fileId',
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      );
    }

    console.log('[PROCESS START]', { fileId, timestamp: new Date().toISOString() });

    // 2. Fetch uploaded file metadata
    const { data: file, error: fetchError } = await supabase
      .from('uploaded_files')
      .select('*')
      .eq('id', fileId)
      .single();

    if (fetchError || !file) {
      console.error('[PROCESS ERROR] File not found:', { fileId, error: fetchError });
      return Response.json(
        {
          success: false,
          error: 'File not found',
          code: 'FILE_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // 3. Update status to processing
    await supabase
      .from('uploaded_files')
      .update({ status: 'processing' })
      .eq('id', fileId);

    // 4. Download file from Supabase storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('notes')
      .download(file.storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file from storage: ${downloadError?.message}`);
    }

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());

    // 5. Convert to Markdown (log operation)
    await logOperation(fileId, 'convert', 'started');
    const convertStartTime = Date.now();

    const { markdown, contentHash } = await convertToMarkdown(
      fileBuffer,
      file.mime_type,
      file.name
    );

    const convertDuration = Date.now() - convertStartTime;
    await logOperation(fileId, 'convert', 'completed', convertDuration);

    // 6. Extract structured data with AI (log operation)
    await logOperation(fileId, 'summarize', 'started');
    const summarizeStartTime = Date.now();

    let aiResult;
    let retryAttempted = false;

    // Handle test flags for controlled testing
    const forceInvalidJson = body.forceInvalidJson === true;
    const forceLowConfidence = body.forceLowConfidence === true;
    const forceFailure = body.forceFailure === true;

    if (forceFailure) {
      throw new Error('Forced failure for testing');
    }

    try {
      aiResult = await extractStructuredData(markdown);

      // FR-010: Simulate invalid JSON retry scenario
      if (forceInvalidJson && !retryAttempted) {
        retryAttempted = true;
        await logOperation(fileId, 'retry', 'started');
        console.log('[PROCESS] Simulating invalid JSON retry...');
        aiResult = await extractStructuredData(markdown, { retry: true });
        await logOperation(fileId, 'retry', 'completed');
      }

    } catch (error) {
      // FR-010: Retry logic for invalid JSON
      if (!retryAttempted) {
        await logOperation(fileId, 'retry', 'started');
        console.log('[PROCESS] AI extraction failed, retrying with adjusted parameters...');
        aiResult = await extractStructuredData(markdown, { retry: true });
        await logOperation(fileId, 'retry', 'completed');
      } else {
        throw error;
      }
    }

    // FR-011: Force low confidence for testing
    if (forceLowConfidence) {
      aiResult.confidence = calculateLowConfidence();
    }

    const summarizeDuration = Date.now() - summarizeStartTime;
    await logOperation(fileId, 'summarize', 'completed', summarizeDuration);

    // 7. Store Markdown and JSON in Supabase storage
    await logOperation(fileId, 'store', 'started');
    const storeStartTime = Date.now();

    const docId = crypto.randomUUID();
    const markdownPath = `processed/${docId}.md`;
    const jsonPath = `processed/${docId}.json`;

    await supabase.storage
      .from('notes')
      .upload(markdownPath, markdown, { contentType: 'text/markdown' });

    await supabase.storage
      .from('notes')
      .upload(jsonPath, JSON.stringify(aiResult.output, null, 2), {
        contentType: 'application/json',
      });

    const storeDuration = Date.now() - storeStartTime;
    await logOperation(fileId, 'store', 'completed', storeDuration);

    // 8. Create processed_documents record with expires_at
    const processingDuration = Date.now() - startTime;

    // Calculate expires_at (FR-018: 30 days retention)
    const processedAt = new Date();
    const expiresAt = new Date(processedAt);
    expiresAt.setDate(expiresAt.getDate() + 30); // Add 30 days

    const { error: insertError } = await supabase
      .from('processed_documents')
      .insert({
        id: docId,
        file_id: fileId,
        markdown_content: markdown,
        markdown_storage_path: markdownPath,
        structured_output: aiResult.output,
        json_storage_path: jsonPath,
        confidence: aiResult.confidence,
        processing_duration: processingDuration,
        processed_at: processedAt.toISOString(),
        expires_at: expiresAt.toISOString(), // ✅ FIX: Add expires_at field
      })
      .select()
      .single();

    if (insertError) {
      console.error('[PROCESS ERROR] Failed to create processed_documents record:', {
        fileId,
        docId,
        error: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      });
      throw new Error(`Failed to create processed_documents record: ${insertError.message}`);
    }

    // 9. Update file status (FR-011: review_required if confidence < 0.8)
    const finalStatus = aiResult.confidence < 0.8 ? 'review_required' : 'completed';
    await supabase
      .from('uploaded_files')
      .update({ status: finalStatus })
      .eq('id', fileId);

    // 10. Console log metrics (FR-007)
    console.log('[PROCESS COMPLETE]', {
      fileId,
      documentId: docId,
      fileHash: contentHash.substring(0, 16) + '...',
      duration: processingDuration,
      confidence: aiResult.confidence,
      status: finalStatus,
      expiresAt: expiresAt.toISOString(),
      topicsCount: aiResult.output.topics.length,
      decisionsCount: aiResult.output.decisions.length,
      actionsCount: aiResult.output.actions.length,
    });

    // 11. Return success response
    return Response.json({
      success: true,
      documentId: docId,
      fileId,
      markdownContent: markdown,
      structuredOutput: aiResult.output,
      confidence: aiResult.confidence,
      processingDuration,
      metrics: {
        fileHash: contentHash,
        processingDuration,
        confidence: aiResult.confidence,
      },
    });

  } catch (error) {
    const processingDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Processing failed';

    // Log error operation
    if (fileId) {
      await logOperation(fileId, 'error', 'failed', processingDuration, errorMessage);

      // Update file status to failed
      await supabase
        .from('uploaded_files')
        .update({ status: 'failed' })
        .eq('id', fileId);
    }

    console.error('[PROCESS ERROR]', {
      fileId: fileId || 'unknown',
      duration: processingDuration,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        success: false,
        error: errorMessage,
        code: 'PROCESSING_ERROR',
      },
      { status: 500 }
    );
  }
}

/**
 * Log operation to processing_logs table
 * Provides observability for each step in the pipeline
 */
async function logOperation(
  fileId: string,
  operation: LogOperationType,
  status: LogStatusType,
  duration?: number,
  error?: string
): Promise<void> {
  try {
    await supabase.from('processing_logs').insert({
      file_id: fileId,
      operation,
      status,
      duration,
      error,
      metadata: {},
      timestamp: new Date().toISOString(),
    });
  } catch (logError) {
    // Don't fail the main operation if logging fails
    console.error('[LOG ERROR]', { fileId, operation, status, error: logError });
  }
}
