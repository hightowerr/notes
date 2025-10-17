import { describe, it, expect } from 'vitest';
import {
  EmbeddingStatusSchema,
  TaskEmbeddingSchema,
  SimilaritySearchRequestSchema,
  SimilaritySearchResultSchema,
  SimilaritySearchResponseSchema,
} from '@/lib/schemas/embeddingSchema';

describe('embeddingSchema', () => {
  describe('EmbeddingStatusSchema', () => {
    it('should accept valid status values', () => {
      expect(EmbeddingStatusSchema.parse('completed')).toBe('completed');
      expect(EmbeddingStatusSchema.parse('pending')).toBe('pending');
      expect(EmbeddingStatusSchema.parse('failed')).toBe('failed');
    });

    it('should reject invalid status values', () => {
      expect(() => EmbeddingStatusSchema.parse('invalid')).toThrow();
      expect(() => EmbeddingStatusSchema.parse('')).toThrow();
      expect(() => EmbeddingStatusSchema.parse(null)).toThrow();
    });
  });

  describe('TaskEmbeddingSchema', () => {
    const validEmbedding = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      task_id: 'task_123',
      task_text: 'Complete project documentation',
      document_id: '550e8400-e29b-41d4-a716-446655440001',
      embedding: new Array(1536).fill(0.1),
      status: 'completed' as const,
      error_message: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should accept valid task embedding', () => {
      const result = TaskEmbeddingSchema.parse(validEmbedding);
      expect(result.task_id).toBe('task_123');
      expect(result.embedding).toHaveLength(1536);
    });

    it('should reject empty task_id', () => {
      const invalid = { ...validEmbedding, task_id: '' };
      expect(() => TaskEmbeddingSchema.parse(invalid)).toThrow('Task ID cannot be empty');
    });

    it('should reject empty task_text', () => {
      const invalid = { ...validEmbedding, task_text: '' };
      expect(() => TaskEmbeddingSchema.parse(invalid)).toThrow('Task text cannot be empty');
    });

    it('should reject invalid UUID for id', () => {
      const invalid = { ...validEmbedding, id: 'not-a-uuid' };
      expect(() => TaskEmbeddingSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid UUID for document_id', () => {
      const invalid = { ...validEmbedding, document_id: 'not-a-uuid' };
      expect(() => TaskEmbeddingSchema.parse(invalid)).toThrow();
    });

    it('should enforce exactly 1536 dimensions for embedding', () => {
      const tooShort = { ...validEmbedding, embedding: new Array(1535).fill(0.1) };
      expect(() => TaskEmbeddingSchema.parse(tooShort)).toThrow('Embedding must be exactly 1536 dimensions');

      const tooLong = { ...validEmbedding, embedding: new Array(1537).fill(0.1) };
      expect(() => TaskEmbeddingSchema.parse(tooLong)).toThrow('Embedding must be exactly 1536 dimensions');
    });

    it('should reject invalid status', () => {
      const invalid = { ...validEmbedding, status: 'unknown' };
      expect(() => TaskEmbeddingSchema.parse(invalid)).toThrow();
    });

    it('should accept null error_message', () => {
      const result = TaskEmbeddingSchema.parse(validEmbedding);
      expect(result.error_message).toBeNull();
    });

    it('should accept non-null error_message', () => {
      const withError = { ...validEmbedding, error_message: 'API timeout' };
      const result = TaskEmbeddingSchema.parse(withError);
      expect(result.error_message).toBe('API timeout');
    });
  });

  describe('SimilaritySearchRequestSchema', () => {
    it('should accept valid search request with defaults', () => {
      const result = SimilaritySearchRequestSchema.parse({ query: 'test query' });
      expect(result.query).toBe('test query');
      expect(result.limit).toBe(20); // default
      expect(result.threshold).toBe(0.7); // default
    });

    it('should accept valid search request with custom values', () => {
      const result = SimilaritySearchRequestSchema.parse({
        query: 'increase revenue',
        limit: 10,
        threshold: 0.8,
      });
      expect(result.query).toBe('increase revenue');
      expect(result.limit).toBe(10);
      expect(result.threshold).toBe(0.8);
    });

    it('should reject empty query', () => {
      expect(() => SimilaritySearchRequestSchema.parse({ query: '' })).toThrow('Query cannot be empty');
    });

    it('should reject negative limit', () => {
      expect(() => SimilaritySearchRequestSchema.parse({ query: 'test', limit: -1 })).toThrow();
    });

    it('should reject zero limit', () => {
      expect(() => SimilaritySearchRequestSchema.parse({ query: 'test', limit: 0 })).toThrow();
    });

    it('should reject limit over 100', () => {
      expect(() => SimilaritySearchRequestSchema.parse({ query: 'test', limit: 101 })).toThrow();
    });

    it('should reject non-integer limit', () => {
      expect(() => SimilaritySearchRequestSchema.parse({ query: 'test', limit: 10.5 })).toThrow();
    });

    it('should reject threshold below 0', () => {
      expect(() => SimilaritySearchRequestSchema.parse({ query: 'test', threshold: -0.1 })).toThrow();
    });

    it('should reject threshold above 1', () => {
      expect(() => SimilaritySearchRequestSchema.parse({ query: 'test', threshold: 1.1 })).toThrow();
    });

    it('should accept threshold at boundaries (0 and 1)', () => {
      const resultMin = SimilaritySearchRequestSchema.parse({ query: 'test', threshold: 0 });
      expect(resultMin.threshold).toBe(0);

      const resultMax = SimilaritySearchRequestSchema.parse({ query: 'test', threshold: 1 });
      expect(resultMax.threshold).toBe(1);
    });
  });

  describe('SimilaritySearchResultSchema', () => {
    const validResult = {
      task_id: 'task_123',
      task_text: 'Complete documentation',
      document_id: '550e8400-e29b-41d4-a716-446655440000',
      similarity: 0.85,
    };

    it('should accept valid search result', () => {
      const result = SimilaritySearchResultSchema.parse(validResult);
      expect(result.task_id).toBe('task_123');
      expect(result.similarity).toBe(0.85);
    });

    it('should reject invalid UUID for document_id', () => {
      const invalid = { ...validResult, document_id: 'not-a-uuid' };
      expect(() => SimilaritySearchResultSchema.parse(invalid)).toThrow();
    });

    it('should reject similarity below 0', () => {
      const invalid = { ...validResult, similarity: -0.1 };
      expect(() => SimilaritySearchResultSchema.parse(invalid)).toThrow();
    });

    it('should reject similarity above 1', () => {
      const invalid = { ...validResult, similarity: 1.1 };
      expect(() => SimilaritySearchResultSchema.parse(invalid)).toThrow();
    });

    it('should accept similarity at boundaries (0 and 1)', () => {
      const resultMin = SimilaritySearchResultSchema.parse({ ...validResult, similarity: 0 });
      expect(resultMin.similarity).toBe(0);

      const resultMax = SimilaritySearchResultSchema.parse({ ...validResult, similarity: 1 });
      expect(resultMax.similarity).toBe(1);
    });
  });

  describe('SimilaritySearchResponseSchema', () => {
    const validResponse = {
      tasks: [
        {
          task_id: 'task_1',
          task_text: 'Complete documentation',
          document_id: '550e8400-e29b-41d4-a716-446655440000',
          similarity: 0.95,
        },
        {
          task_id: 'task_2',
          task_text: 'Update tests',
          document_id: '550e8400-e29b-41d4-a716-446655440001',
          similarity: 0.85,
        },
      ],
      query: 'documentation tasks',
      count: 2,
    };

    it('should accept valid search response', () => {
      const result = SimilaritySearchResponseSchema.parse(validResponse);
      expect(result.tasks).toHaveLength(2);
      expect(result.query).toBe('documentation tasks');
      expect(result.count).toBe(2);
    });

    it('should accept empty tasks array', () => {
      const emptyResponse = { ...validResponse, tasks: [], count: 0 };
      const result = SimilaritySearchResponseSchema.parse(emptyResponse);
      expect(result.tasks).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should reject negative count', () => {
      const invalid = { ...validResponse, count: -1 };
      expect(() => SimilaritySearchResponseSchema.parse(invalid)).toThrow();
    });

    it('should reject non-integer count', () => {
      const invalid = { ...validResponse, count: 2.5 };
      expect(() => SimilaritySearchResponseSchema.parse(invalid)).toThrow();
    });

    it('should reject invalid tasks array items', () => {
      const invalid = {
        ...validResponse,
        tasks: [
          {
            task_id: 'task_1',
            task_text: 'Valid task',
            document_id: '550e8400-e29b-41d4-a716-446655440000',
            similarity: 0.95,
          },
          {
            task_id: 'task_2',
            task_text: 'Invalid task',
            document_id: 'not-a-uuid', // Invalid UUID
            similarity: 0.85,
          },
        ],
      };
      expect(() => SimilaritySearchResponseSchema.parse(invalid)).toThrow();
    });
  });
});
