/**
 * Vector Storage Service - Store and retrieve task embeddings
 * Task: T023 - Automatic embedding generation during document processing
 *
 * Purpose: Store embeddings in task_embeddings table with pgvector
 * Used by: embeddingService.ts (storage after generation)
 */

import { createClient } from '@supabase/supabase-js';
import type {
  TaskEmbedding,
  TaskEmbeddingInsert,
  SimilaritySearchResult,
} from '@/lib/types/embedding';

export class StorageError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Initialize Supabase client
 * @throws StorageError if configuration is missing
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new StorageError('Supabase configuration missing');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Store embeddings to task_embeddings table
 * @param embeddings - Array of task embeddings to store
 * @returns Success and failure counts
 */
export async function storeEmbeddings(
  embeddings: TaskEmbeddingInsert[]
): Promise<{ success: number; failed: number }> {
  if (!embeddings || embeddings.length === 0) {
    console.log('[VectorStorage] No embeddings to store');
    return { success: 0, failed: 0 };
  }

  const supabase = getSupabaseClient();

  console.log('[VectorStorage] Storing embeddings:', {
    count: embeddings.length,
    documentId: embeddings[0]?.document_id,
  });

  try {
    // Bulk insert with upsert to handle conflicts
    const { data, error } = await supabase
      .from('task_embeddings')
      .upsert(embeddings, {
        onConflict: 'task_id',
        ignoreDuplicates: false, // Update if exists
      })
      .select();

    if (error) {
      console.error('[VectorStorage] Storage error:', {
        error: error.message,
        code: error.code,
      });

      // Don't throw - return partial success
      return {
        success: 0,
        failed: embeddings.length,
      };
    }

    const successCount = data?.length || 0;

    console.log('[VectorStorage] Embeddings stored:', {
      success: successCount,
      failed: embeddings.length - successCount,
    });

    return {
      success: successCount,
      failed: embeddings.length - successCount,
    };

  } catch (error) {
    console.error('[VectorStorage] Unexpected error during storage:', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: 0,
      failed: embeddings.length,
    };
  }
}

/**
 * Get all embeddings for a document
 * @param documentId - Document UUID
 * @returns Array of task embeddings
 */
export async function getEmbeddingsByDocumentId(
  documentId: string
): Promise<TaskEmbedding[]> {
  const supabase = getSupabaseClient();

  console.log('[VectorStorage] Fetching embeddings for document:', {
    documentId,
  });

  try {
    const { data, error } = await supabase
      .from('task_embeddings')
      .select('*')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[VectorStorage] Query error:', {
        error: error.message,
        documentId,
      });
      return [];
    }

    console.log('[VectorStorage] Embeddings retrieved:', {
      count: data?.length || 0,
      documentId,
    });

    return (data as TaskEmbedding[]) || [];

  } catch (error) {
    console.error('[VectorStorage] Unexpected error during retrieval:', {
      error: error instanceof Error ? error.message : String(error),
      documentId,
    });
    return [];
  }
}

/**
 * Delete embeddings for a document (manual cleanup)
 * Note: CASCADE delete handles automatic cleanup when document is deleted
 * @param documentId - Document UUID
 * @returns Number of embeddings deleted
 */
export async function deleteEmbeddingsByDocumentId(
  documentId: string
): Promise<number> {
  const supabase = getSupabaseClient();

  console.log('[VectorStorage] Deleting embeddings for document:', {
    documentId,
  });

  try {
    const { data, error } = await supabase
      .from('task_embeddings')
      .delete()
      .eq('document_id', documentId)
      .select();

    if (error) {
      console.error('[VectorStorage] Delete error:', {
        error: error.message,
        documentId,
      });
      return 0;
    }

    const deletedCount = data?.length || 0;

    console.log('[VectorStorage] Embeddings deleted:', {
      count: deletedCount,
      documentId,
    });

    return deletedCount;

  } catch (error) {
    console.error('[VectorStorage] Unexpected error during deletion:', {
      error: error instanceof Error ? error.message : String(error),
      documentId,
    });
    return 0;
  }
}

/**
 * Search for similar tasks using vector similarity
 * @param queryEmbedding - 1536-dimension query embedding
 * @param threshold - Minimum similarity score (0-1, default: 0.7)
 * @param limit - Maximum results (default: 20)
 * @returns Array of similar tasks with similarity scores
 */
export async function searchSimilarTasks(
  queryEmbedding: number[],
  threshold: number = 0.7,
  limit: number = 20
): Promise<SimilaritySearchResult[]> {
  const supabase = getSupabaseClient();

  console.log('[VectorStorage] Searching similar tasks:', {
    threshold,
    limit,
    embeddingDimensions: queryEmbedding.length,
  });

  try {
    // Call the search_similar_tasks RPC function
    const { data, error } = await supabase.rpc('search_similar_tasks', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('[VectorStorage] Search error:', {
        error: error.message,
        code: error.code,
      });
      return [];
    }

    console.log('[VectorStorage] Search complete:', {
      resultsCount: data?.length || 0,
    });

    return (data as SimilaritySearchResult[]) || [];

  } catch (error) {
    console.error('[VectorStorage] Unexpected error during search:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
