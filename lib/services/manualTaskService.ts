import crypto from 'crypto';

import type { ManualTaskInput, TaskEditInput } from '@/lib/schemas/manualTaskSchemas';
import { manualTaskInputSchema, taskEditInputSchema } from '@/lib/schemas/manualTaskSchemas';
import { generateEmbedding, generateTaskId } from '@/lib/services/embeddingService';
import { searchSimilarTasks } from '@/lib/services/vectorStorage';
import type { SimilaritySearchResult } from '@/lib/types/embedding';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import embeddingCache from '@/lib/services/embeddingCache';

const supabase = getSupabaseAdminClient();

const DEFAULT_USER_ID = 'default-user';
const DUPLICATE_THRESHOLD = 0.85;
const EMBEDDING_DIFF_THRESHOLD = 0.1;

export class ManualTaskServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualTaskServiceError';
  }
}

export class DuplicateManualTaskError extends ManualTaskServiceError {
  constructor(public readonly existingTask: SimilaritySearchResult) {
    super('Similar task already exists');
    this.name = 'DuplicateManualTaskError';
  }
}

export class ManualTaskValidationError extends ManualTaskServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ManualTaskValidationError';
  }
}

export class ManualTaskNotFoundError extends ManualTaskServiceError {
  constructor() {
    super('Task not found');
    this.name = 'ManualTaskNotFoundError';
  }
}

export class ManualTaskPermissionError extends ManualTaskServiceError {
  constructor() {
    super('You can only edit your own manual tasks');
    this.name = 'ManualTaskPermissionError';
  }
}

type CreateManualTaskParams = ManualTaskInput & {
  created_by?: string;
  force_create?: boolean;
};

type ManualTaskInsertResult = {
  taskId: string;
  prioritizationTriggered: boolean;
  estimatedHours: number;
  taskText: string;
  outcomeId?: string;
};

type UploadedFileRow = {
  id: string;
};

type ProcessedDocumentRow = {
  id: string;
};

type TaskEmbeddingRow = {
  task_id: string;
  task_text: string;
  is_manual: boolean | null;
  created_by: string | null;
  updated_at: string;
};

type UpdateTaskParams = TaskEditInput & {
  taskId: string;
  userId?: string | null;
};

type TaskUpdateResult = {
  taskId: string;
  taskText: string;
  isManual: boolean;
  updatedAt: string;
  embeddingRegenerated: boolean;
};

function buildFallbackEmbedding(taskText: string): number[] {
  // Deterministic pseudo-embedding to preserve shape when OpenAI is unavailable.
  const seed = crypto.createHash('sha256').update(taskText).digest();
  const values: number[] = new Array(1536);
  for (let i = 0; i < 1536; i += 1) {
    const byte = seed[i % seed.length];
    values[i] = (byte / 255) * 2 - 1; // Normalize to [-1, 1]
  }
  return values;
}

async function ensureManualFile(userId: string): Promise<{ fileId: string; slug: string }> {
  const slug = `manual-tasks-${userId}`;

  const { data, error } = await supabase
    .from('uploaded_files')
    .select('id')
    .eq('content_hash', slug)
    .maybeSingle<UploadedFileRow>();

  if (error) {
    throw new ManualTaskServiceError(`Failed to load manual task container: ${error.message}`);
  }

  if (data?.id) {
    return { fileId: data.id, slug };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('uploaded_files')
    .insert({
      name: slug,
      size: 1024,
      mime_type: 'text/plain',
      content_hash: slug,
      storage_path: `manual/${slug}.md`,
      status: 'completed',
      source: 'text_input',
      sync_enabled: false,
    })
    .select('id')
    .single<UploadedFileRow>();

  if (insertError || !inserted) {
    throw new ManualTaskServiceError(
      insertError?.message ?? 'Failed to create placeholder upload for manual tasks'
    );
  }

  return { fileId: inserted.id, slug };
}

async function ensureManualDocument(userId: string): Promise<string> {
  const { fileId, slug } = await ensureManualFile(userId);

  const { data, error } = await supabase
    .from('processed_documents')
    .select('id')
    .eq('file_id', fileId)
    .maybeSingle<ProcessedDocumentRow>();

  if (error) {
    throw new ManualTaskServiceError(`Failed to load manual document: ${error.message}`);
  }

  if (data?.id) {
    return data.id;
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from('processed_documents')
    .insert({
      file_id: fileId,
      markdown_content: `Manual tasks for ${userId}`,
      markdown_storage_path: `manual/${slug}.md`,
      structured_output: {},
      json_storage_path: `manual/${slug}.json`,
      confidence: 1,
      processing_duration: 0,
      processed_at: now,
    })
    .select('id')
    .single<ProcessedDocumentRow>();

  if (insertError || !inserted) {
    throw new ManualTaskServiceError(
      insertError?.message ?? 'Failed to create manual document container'
    );
  }

  return inserted.id;
}

function detectDuplicate(matches: SimilaritySearchResult[]): SimilaritySearchResult | null {
  if (!matches?.length) {
    return null;
  }

  const sorted = [...matches].sort((a, b) => b.similarity - a.similarity);
  const top = sorted[0];
  if (top && typeof top.similarity === 'number' && top.similarity >= DUPLICATE_THRESHOLD) {
    return top;
  }
  return null;
}



export async function createManualTask(params: CreateManualTaskParams): Promise<ManualTaskInsertResult> {
  const parsed = manualTaskInputSchema.safeParse({
    task_text: params.task_text,
    estimated_hours: params.estimated_hours,
    outcome_id: params.outcome_id,
  });

  if (!parsed.success) {
    throw new ManualTaskServiceError('Invalid manual task input');
  }

  const { task_text, estimated_hours, outcome_id } = parsed.data;
  const createdBy = params.created_by ?? DEFAULT_USER_ID;
  const hours = estimated_hours ?? 40;

  const documentId = await ensureManualDocument(createdBy);
  const taskId = generateTaskId(task_text, documentId);

  // Hard guard against duplicate task_id collisions (even when embeddings fallback is used)
  const { data: existingEmbedding, error: existingEmbeddingError } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text, document_id')
    .eq('task_id', taskId)
    .maybeSingle();

  if (existingEmbeddingError) {
    throw new ManualTaskServiceError(
      existingEmbeddingError.message ?? 'Failed to check manual task uniqueness'
    );
  }

  if (existingEmbedding && !params.force_create) {
    throw new DuplicateManualTaskError({
      task_id: existingEmbedding.task_id,
      task_text: existingEmbedding.task_text,
      document_id: existingEmbedding.document_id,
      similarity: 1,
    });
  }

  let embedding: number[];
  let usingFallbackEmbedding = false;
  try {
    embedding = await generateEmbedding(task_text);
  } catch (error) {
    usingFallbackEmbedding = true;
    const message = error instanceof Error ? error.message : 'Unknown embedding error';
    console.warn('[ManualTaskService] Falling back to deterministic embedding', { message });
    embedding = buildFallbackEmbedding(task_text);
  }

  if (!usingFallbackEmbedding) {
    const similarTasks = await searchSimilarTasks(embedding, DUPLICATE_THRESHOLD, 5);
    const duplicate = detectDuplicate(similarTasks);
    if (duplicate && !params.force_create) {
      // Record conflict in manual_tasks for visibility
      const conflictPayload = {
        task_id: taskId,
        status: 'conflict',
        duplicate_task_id: duplicate.task_id,
        similarity_score: duplicate.similarity,
        exclusion_reason: 'Potential duplicate task',
      };
      await supabase.from('manual_tasks').upsert(conflictPayload, { onConflict: 'task_id' });

      throw new DuplicateManualTaskError(duplicate);
    }
  }

  const { error: insertError } = await supabase.from('task_embeddings').upsert({
    task_id: taskId,
    task_text,
    document_id: documentId,
    embedding,
    status: 'completed',
    error_message: null,
    is_manual: true,
    created_by: createdBy,
  });

  if (insertError) {
    throw new ManualTaskServiceError(
      insertError.message ?? 'Failed to store manual task embedding'
    );
  }

  const { error: manualTaskInsertError } = await supabase.from('manual_tasks').insert({
    task_id: taskId,
    outcome_id: outcome_id ?? null,
    status: 'analyzing',
  });

  if (manualTaskInsertError) {
    throw new ManualTaskServiceError(
      manualTaskInsertError.message ?? 'Failed to initialize manual task status'
    );
  }

  return {
    taskId,
    prioritizationTriggered: Boolean(outcome_id),
    estimatedHours: hours,
    taskText: task_text,
    outcomeId: outcome_id,
  };
}

export async function updateTask(params: UpdateTaskParams): Promise<TaskUpdateResult> {
  const taskId = params.taskId?.trim();
  if (!taskId) {
    throw new ManualTaskValidationError('Task identifier is required');
  }

  const parsed = taskEditInputSchema.safeParse({
    task_text: params.task_text,
    estimated_hours: params.estimated_hours,
  });

  if (!parsed.success) {
    throw new ManualTaskValidationError('Invalid edit payload');
  }

  const { data: existing, error: fetchError } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text, is_manual, created_by, updated_at')
    .eq('task_id', taskId)
    .maybeSingle<TaskEmbeddingRow>();

  if (fetchError) {
    throw new ManualTaskServiceError(fetchError.message ?? 'Failed to load task');
  }

  if (!existing) {
    throw new ManualTaskNotFoundError();
  }

  const actingUser = params.userId ?? DEFAULT_USER_ID;
  const isManualTask = Boolean(existing.is_manual);
  if (isManualTask && existing.created_by && existing.created_by !== actingUser) {
    throw new ManualTaskPermissionError();
  }

  const nextText = parsed.data.task_text;
  if (!nextText || nextText === existing.task_text) {
    return {
      taskId: existing.task_id,
      taskText: existing.task_text,
      isManual: isManualTask,
      updatedAt: existing.updated_at,
      embeddingRegenerated: false,
    };
  }

  const changeRatio = embeddingCache.computeChangeRatio(existing.task_text, nextText);
  let nextEmbedding: number[] | null = null;
  let embeddingRegenerated = false;

  if (changeRatio > EMBEDDING_DIFF_THRESHOLD) {
    embeddingRegenerated = true;
    const cachedEmbedding = embeddingCache.getCachedEmbedding(taskId, nextText);
    if (cachedEmbedding) {
      nextEmbedding = cachedEmbedding;
    } else {
      nextEmbedding = await generateEmbedding(nextText);
      embeddingCache.setCachedEmbedding(taskId, nextText, nextEmbedding);
    }
  }

  const updates: Record<string, unknown> = {
    task_text: nextText,
  };

  if (nextEmbedding) {
    updates.embedding = nextEmbedding;
  }

  const { data: updated, error: updateError } = await supabase
    .from('task_embeddings')
    .update(updates)
    .eq('task_id', taskId)
    .select('task_id, task_text, is_manual, created_by, updated_at')
    .single<TaskEmbeddingRow>();

  if (updateError || !updated) {
    throw new ManualTaskServiceError(updateError?.message ?? 'Failed to update task');
  }

  // If this is a manual task, reset manual_tasks status and trigger re-analysis
  if (isManualTask) {
    await supabase
      .from('manual_tasks')
      .update({
        status: 'analyzing',
        agent_rank: null,
        placement_reason: null,
        exclusion_reason: null,
      })
      .eq('task_id', taskId);

    // Fire-and-forget background analysis; outcomeId may be null if not set
    void (async () => {
      try {
        const outcomeId = params.outcomeId ?? null;
        await (await import('@/lib/services/manualTaskPlacement')).analyzeManualTask({
          taskId,
          taskText: nextText,
          outcomeId: outcomeId ?? '',
        });
      } catch (error) {
        console.error('[ManualTaskService] Failed to trigger re-analysis after edit', error);
      }
    })();
  }

  return {
    taskId: updated.task_id,
    taskText: updated.task_text,
    isManual: Boolean(updated.is_manual),
    updatedAt: updated.updated_at,
    embeddingRegenerated,
  };
}
