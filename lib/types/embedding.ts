// lib/types/embedding.ts
// TypeScript types for task embeddings (Phase 1 - Vector Storage Foundation)

/**
 * Embedding status lifecycle states
 */
export type EmbeddingStatus = 'completed' | 'pending' | 'failed';

/**
 * Complete task embedding entity (matches task_embeddings table schema)
 */
export interface TaskEmbedding {
  id: string;
  task_id: string;
  task_text: string;
  document_id: string;
  embedding: number[];  // 1536-dimension array
  status: EmbeddingStatus;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Insert payload for new task embeddings (excludes auto-generated fields)
 */
export interface TaskEmbeddingInsert {
  task_id: string;
  task_text: string;
  document_id: string;
  embedding: number[];
  status: EmbeddingStatus;
  error_message?: string | null;
}

/**
 * Similarity search result from vector database
 */
export interface SimilaritySearchResult {
  task_id: string;
  task_text: string;
  document_id: string;
  similarity: number;  // 0.0 to 1.0 (cosine similarity)
}

/**
 * Result from embedding generation service
 */
export interface EmbeddingGenerationResult {
  task_id: string;
  status: EmbeddingStatus;
  embedding: number[] | null;
  error_message: string | null;
}
