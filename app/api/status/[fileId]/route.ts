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
        .select('structured_output, confidence, processing_duration, filtering_decisions')
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
        // T025: Query task_embeddings to determine embeddings_status
        const { data: embeddings, error: embeddingsError } = await supabase
          .from('task_embeddings')
          .select('status')
          .eq('document_id', fileId);

        let embeddingsStatus: 'completed' | 'pending' | 'failed' = 'completed';

        if (embeddingsError) {
          console.error('[STATUS] Failed to query embeddings:', {
            fileId,
            error: embeddingsError,
          });
          embeddingsStatus = 'pending'; // Default to pending if query fails
        } else if (embeddings && embeddings.length > 0) {
          const completedCount = embeddings.filter(e => e.status === 'completed').length;
          const pendingCount = embeddings.filter(e => e.status === 'pending').length;
          const failedCount = embeddings.filter(e => e.status === 'failed').length;

          // Determine overall status
          if (completedCount === embeddings.length) {
            embeddingsStatus = 'completed';
          } else if (pendingCount > 0 || failedCount > 0) {
            embeddingsStatus = 'pending';
          }

          console.log('[STATUS] Embeddings status calculated:', {
            fileId,
            total: embeddings.length,
            completed: completedCount,
            pending: pendingCount,
            failed: failedCount,
            embeddingsStatus,
          });
        } else {
          // No embeddings found - document may have no tasks
          embeddingsStatus = 'completed';
        }

        const filteringApplied = !!processed.filtering_decisions;

        // T019: Construct response with both filtered and unfiltered action lists
        const allActions = filteringApplied && processed.filtering_decisions
          ? [...processed.filtering_decisions.included, ...processed.filtering_decisions.excluded]
          : processed.structured_output.actions;

        // Build exclusion reasons map for frontend
        type ExcludedAction = {
          text: string;
          reason: string;
        };
        const exclusionReasons = filteringApplied && processed.filtering_decisions
          ? processed.filtering_decisions.excluded.map((action: ExcludedAction) => ({
              action_text: action.text,
              reason: action.reason,
            }))
          : [];

        console.log('[STATUS] Returning completed status with summary:', {
          fileId,
          status: file.status,
          confidence: processed.confidence,
          filteringApplied,
          filteredActions: processed.structured_output.actions.length,
          totalActions: allActions.length,
          embeddingsStatus, // T025
        });

        return Response.json({
          fileId,
          status: file.status,
          embeddingsStatus, // T025: Include embedding generation status
          summary: processed.structured_output,
          confidence: processed.confidence,
          processingDuration: processed.processing_duration,
          filteringDecisions: processed.filtering_decisions || null, // T018: Include filtering metadata
          // T019: Additional fields for toggle functionality
          allActions, // Unfiltered list (included + excluded)
          filteringApplied,
          exclusionReasons,
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
