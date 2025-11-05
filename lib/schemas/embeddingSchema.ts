import { z } from 'zod';

/**
 * Embedding Schema - Zod schemas for embedding API requests and responses
 *
 * Purpose: Type-safe validation for vector embedding operations
 * Used by: embeddingService.ts, vectorStorage.ts, /api/embeddings/search
 */

// Status enum for embedding lifecycle
export const EmbeddingStatusSchema = z.enum(['completed', 'pending', 'failed']);

// Complete task embedding entity (matches database schema)
export const TaskEmbeddingSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().min(1, 'Task ID cannot be empty'),
  task_text: z.string().min(1, 'Task text cannot be empty'),
  document_id: z.string().uuid(),
  embedding: z.array(z.number()).length(1536, 'Embedding must be exactly 1536 dimensions'),
  status: EmbeddingStatusSchema,
  error_message: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

// Similarity search request schema
export const SimilaritySearchRequestSchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  limit: z.number().int().positive().max(100).default(20),
  threshold: z.number().min(0).max(1).default(0.7),
});

// Similarity search result schema (single result)
export const SimilaritySearchResultSchema = z.object({
  task_id: z.string(),
  task_text: z.string(),
  document_id: z.string().uuid(),
  similarity: z.number().min(0).max(1),
});

// Similarity search response schema (full API response)
export const SimilaritySearchResponseSchema = z.object({
  tasks: z.array(SimilaritySearchResultSchema),
  query: z.string(),
  count: z.number().int().nonnegative(),
});

// Export types derived from schemas
export type EmbeddingStatus = z.infer<typeof EmbeddingStatusSchema>;
export type TaskEmbedding = z.infer<typeof TaskEmbeddingSchema>;
export type SimilaritySearchRequest = z.infer<typeof SimilaritySearchRequestSchema>;
export type SimilaritySearchResult = z.infer<typeof SimilaritySearchResultSchema>;
export type SimilaritySearchResponse = z.infer<typeof SimilaritySearchResponseSchema>;
