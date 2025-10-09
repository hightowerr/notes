/**
 * Processing Status API Endpoint
 * GET /api/status/[fileId]
 *
 * Returns current processing status for a file.
 * Used by frontend for polling during processing.
 *
 * Implements status tracking for T002 user journey
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  console.log('[STATUS] Checking status for file:', fileId);

  try {
    // Fetch file metadata
    const { data: file, error: fileError } = await supabase
      .from('uploaded_files')
      .select('status')
      .eq('id', fileId)
      .single();

    if (fileError || !file) {
      console.error('[STATUS ERROR] File not found:', { fileId, error: fileError });
      return Response.json(
        {
          success: false,
          error: 'File not found',
          code: 'FILE_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    // If completed or review_required, fetch processed document
    if (file.status === 'completed' || file.status === 'review_required') {
      const { data: processed, error: processedError } = await supabase
        .from('processed_documents')
        .select('structured_output, confidence, processing_duration')
        .eq('file_id', fileId)
        .single();

      if (processedError) {
        console.error('[STATUS ERROR] Failed to fetch processed document:', {
          fileId,
          error: processedError,
        });
        // Return status without summary if processed document not found
        return Response.json({
          fileId,
          status: file.status,
        });
      }

      if (processed) {
        console.log('[STATUS] Returning completed status with summary:', {
          fileId,
          status: file.status,
          confidence: processed.confidence,
        });

        return Response.json({
          fileId,
          status: file.status,
          summary: processed.structured_output,
          confidence: processed.confidence,
          processingDuration: processed.processing_duration,
        });
      }
    }

    // If failed, fetch error details from processing logs
    if (file.status === 'failed') {
      const { data: errorLog } = await supabase
        .from('processing_logs')
        .select('error')
        .eq('file_id', fileId)
        .eq('status', 'failed')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      const errorMessage = errorLog?.error || 'Processing failed';

      console.log('[STATUS] Returning failed status:', {
        fileId,
        error: errorMessage,
      });

      return Response.json({
        fileId,
        status: file.status,
        error: errorMessage,
      });
    }

    // Return current status for pending or processing
    console.log('[STATUS] Returning in-progress status:', {
      fileId,
      status: file.status,
    });

    return Response.json({
      fileId,
      status: file.status,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch status';

    console.error('[STATUS ERROR] Unexpected error:', {
      fileId,
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
