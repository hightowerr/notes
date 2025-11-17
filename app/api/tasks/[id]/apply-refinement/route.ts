import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { getAuthUser } from '@/lib/services/planIntegration';
import { generateEmbedding } from '@/lib/services/embeddingService';
import { evaluateQuality } from '@/lib/services/qualityEvaluation';
import { validateRequestSchema } from '@/lib/utils/validation';
import { createClient } from '@/lib/supabase/server';

const applyRefinementRequestSchema = z.object({
  suggestion_id: z.string().uuid(),
  new_task_texts: z.array(z.string().min(10).max(500)).min(1).max(5),
  action: z.enum(['split', 'merge', 'rephrase']),
});

type ApplyRefinementRequest = z.infer<typeof applyRefinementRequestSchema>;

type TaskEmbeddingRow = {
  task_id: string;
  document_id: string;
  created_by?: string | null;
  is_manual?: boolean | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const taskId = params.id;
    if (!taskId) {
      return Response.json({ error: 'VALIDATION_ERROR', message: 'Task id parameter is required' }, { status: 400 });
    }

    const body = await request.json();
    const { suggestion_id, new_task_texts, action }: ApplyRefinementRequest = validateRequestSchema(
      applyRefinementRequestSchema,
      body
    );

    const supabase = await createClient();

    const { data: originalTask, error: fetchError } = await supabase
      .from('task_embeddings')
      .select('task_id, document_id, created_by, is_manual')
      .eq('task_id', taskId)
      .single<TaskEmbeddingRow>();

    if (fetchError || !originalTask) {
      console.error('[ApplyRefinement] Failed to load task for refinement', fetchError);
      return Response.json({ error: 'TASK_NOT_FOUND', message: 'Original task not found' }, { status: 404 });
    }

    if (originalTask.created_by && originalTask.created_by !== user.id) {
      return Response.json({ error: 'FORBIDDEN', message: 'You cannot refine this task' }, { status: 403 });
    }

    const { error: archiveError } = await supabase
      .from('task_embeddings')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('task_id', taskId);

    if (archiveError) {
      console.error('[ApplyRefinement] Failed to archive original task', archiveError);
      return Response.json({ error: 'ARCHIVE_FAILED', message: 'Unable to archive original task' }, { status: 500 });
    }

    const tasksToInsert = await Promise.all(
      new_task_texts.map(async taskText => {
        const trimmed = taskText.trim();
        const [embedding, qualityMetadata] = await Promise.all([
          generateEmbedding(trimmed),
          evaluateQuality(trimmed),
        ]);

        return {
          task_id: randomUUID(),
          task_text: trimmed,
          document_id: originalTask.document_id,
          embedding,
          status: 'completed' as const,
          error_message: null,
          is_manual: originalTask.is_manual ?? false,
          created_by: originalTask.created_by ?? user.id,
          quality_metadata: qualityMetadata,
        };
      })
    );

    const { data: insertedRows, error: insertError } = await supabase
      .from('task_embeddings')
      .insert(tasksToInsert)
      .select('task_id');

    if (insertError) {
      console.error('[ApplyRefinement] Failed to insert refined tasks', insertError);
      return Response.json({ error: 'INSERT_FAILED', message: 'Failed to insert refined tasks' }, { status: 500 });
    }

    const insertedIds = insertedRows?.map(row => row.task_id) ?? [];

    return Response.json({
      suggestion_id,
      action,
      inserted_task_ids: insertedIds,
      archived_task_id: taskId,
    });
  } catch (error) {
    console.error('[ApplyRefinement] Unexpected error', error);

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid request body', details: error.errors },
        { status: 400 }
      );
    }

    return Response.json({ error: 'INTERNAL_SERVER_ERROR', message: 'Failed to apply refinement' }, { status: 500 });
  }
}
