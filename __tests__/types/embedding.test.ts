// __tests__/types/embedding.test.ts
// Type checking tests for embedding types (compile-time validation)

import { describe, it, expect } from 'vitest';
import type {
  EmbeddingStatus,
  TaskEmbedding,
  TaskEmbeddingInsert,
  SimilaritySearchResult,
  EmbeddingGenerationResult,
} from '@/lib/types/embedding';

describe('Embedding Types', () => {
  describe('EmbeddingStatus', () => {
    it('should accept valid status values', () => {
      const completed: EmbeddingStatus = 'completed';
      const pending: EmbeddingStatus = 'pending';
      const failed: EmbeddingStatus = 'failed';

      expect(completed).toBe('completed');
      expect(pending).toBe('pending');
      expect(failed).toBe('failed');
    });

    // Type error test (compile-time only)
    // Uncomment to verify TypeScript rejects invalid values:
    // const invalid: EmbeddingStatus = 'invalid'; // Should error
  });

  describe('TaskEmbedding', () => {
    it('should accept valid TaskEmbedding objects', () => {
      const validEmbedding: TaskEmbedding = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        task_id: 'abc123def456',
        task_text: 'Implement feature X',
        document_id: '660e8400-e29b-41d4-a716-446655440001',
        embedding: new Array(1536).fill(0.5),
        status: 'completed',
        error_message: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(validEmbedding.id).toBeDefined();
      expect(validEmbedding.embedding).toHaveLength(1536);
      expect(validEmbedding.status).toBe('completed');
    });

    it('should accept failed status with error message', () => {
      const failedEmbedding: TaskEmbedding = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        task_id: 'abc123def456',
        task_text: 'Implement feature X',
        document_id: '660e8400-e29b-41d4-a716-446655440001',
        embedding: new Array(1536).fill(0),
        status: 'failed',
        error_message: 'OpenAI API timeout',
        created_at: new Date(),
        updated_at: new Date(),
      };

      expect(failedEmbedding.status).toBe('failed');
      expect(failedEmbedding.error_message).toBe('OpenAI API timeout');
    });

    // Type error test (compile-time only)
    // Uncomment to verify TypeScript rejects missing fields:
    // const invalid: TaskEmbedding = {
    //   id: '550e8400-e29b-41d4-a716-446655440000',
    //   task_id: 'abc123def456',
    //   // Missing required fields - should error
    // };
  });

  describe('TaskEmbeddingInsert', () => {
    it('should accept valid insert payload', () => {
      const insertPayload: TaskEmbeddingInsert = {
        task_id: 'abc123def456',
        task_text: 'Implement feature X',
        document_id: '660e8400-e29b-41d4-a716-446655440001',
        embedding: new Array(1536).fill(0.5),
        status: 'completed',
      };

      expect(insertPayload.task_id).toBeDefined();
      expect(insertPayload.embedding).toHaveLength(1536);
    });

    it('should accept optional error_message field', () => {
      const insertWithError: TaskEmbeddingInsert = {
        task_id: 'abc123def456',
        task_text: 'Implement feature X',
        document_id: '660e8400-e29b-41d4-a716-446655440001',
        embedding: new Array(1536).fill(0),
        status: 'failed',
        error_message: 'API error',
      };

      expect(insertWithError.error_message).toBe('API error');
    });

    // Type error test (compile-time only)
    // Uncomment to verify TypeScript rejects auto-generated fields:
    // const invalid: TaskEmbeddingInsert = {
    //   id: '550e8400-e29b-41d4-a716-446655440000', // Should error - id not in insert payload
    //   task_id: 'abc123def456',
    //   task_text: 'Implement feature X',
    //   document_id: '660e8400-e29b-41d4-a716-446655440001',
    //   embedding: new Array(1536).fill(0.5),
    //   status: 'completed',
    // };
  });

  describe('SimilaritySearchResult', () => {
    it('should accept valid search result', () => {
      const searchResult: SimilaritySearchResult = {
        task_id: 'abc123def456',
        task_text: 'Implement revenue tracking',
        document_id: '660e8400-e29b-41d4-a716-446655440001',
        similarity: 0.89,
      };

      expect(searchResult.similarity).toBe(0.89);
      expect(searchResult.task_text).toBeDefined();
    });

    it('should accept similarity scores between 0 and 1', () => {
      const minSimilarity: SimilaritySearchResult = {
        task_id: 'abc123',
        task_text: 'Low similarity task',
        document_id: '660e8400-e29b-41d4-a716-446655440001',
        similarity: 0.0,
      };

      const maxSimilarity: SimilaritySearchResult = {
        task_id: 'def456',
        task_text: 'Exact match task',
        document_id: '660e8400-e29b-41d4-a716-446655440001',
        similarity: 1.0,
      };

      expect(minSimilarity.similarity).toBe(0.0);
      expect(maxSimilarity.similarity).toBe(1.0);
    });
  });

  describe('EmbeddingGenerationResult', () => {
    it('should accept successful generation result', () => {
      const successResult: EmbeddingGenerationResult = {
        task_id: 'abc123def456',
        status: 'completed',
        embedding: new Array(1536).fill(0.5),
        error_message: null,
      };

      expect(successResult.status).toBe('completed');
      expect(successResult.embedding).toHaveLength(1536);
      expect(successResult.error_message).toBeNull();
    });

    it('should accept failed generation result', () => {
      const failedResult: EmbeddingGenerationResult = {
        task_id: 'abc123def456',
        status: 'failed',
        embedding: null,
        error_message: 'OpenAI API unavailable',
      };

      expect(failedResult.status).toBe('failed');
      expect(failedResult.embedding).toBeNull();
      expect(failedResult.error_message).toBe('OpenAI API unavailable');
    });

    it('should accept pending generation result', () => {
      const pendingResult: EmbeddingGenerationResult = {
        task_id: 'abc123def456',
        status: 'pending',
        embedding: null,
        error_message: 'Queued for processing',
      };

      expect(pendingResult.status).toBe('pending');
      expect(pendingResult.embedding).toBeNull();
    });
  });

  // Integration test: Verify types align with Zod schemas
  describe('Type alignment with schemas', () => {
    it('should have consistent field types across all embedding types', () => {
      // This test verifies type consistency at compile time
      const taskEmbedding: TaskEmbedding = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        task_id: 'abc123',
        task_text: 'Test task',
        document_id: '660e8400-e29b-41d4-a716-446655440001',
        embedding: new Array(1536).fill(0.5),
        status: 'completed',
        error_message: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const insertPayload: TaskEmbeddingInsert = {
        task_id: taskEmbedding.task_id,
        task_text: taskEmbedding.task_text,
        document_id: taskEmbedding.document_id,
        embedding: taskEmbedding.embedding,
        status: taskEmbedding.status,
        error_message: taskEmbedding.error_message,
      };

      const searchResult: SimilaritySearchResult = {
        task_id: taskEmbedding.task_id,
        task_text: taskEmbedding.task_text,
        document_id: taskEmbedding.document_id,
        similarity: 0.95,
      };

      expect(insertPayload.task_id).toBe(taskEmbedding.task_id);
      expect(searchResult.task_id).toBe(taskEmbedding.task_id);
    });
  });
});
