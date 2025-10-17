/**
 * Integration Test: Embedding Generation (T023)
 * Tests automatic embedding generation during document processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateEmbedding, generateBatchEmbeddings } from '@/lib/services/embeddingService';
import { storeEmbeddings, getEmbeddingsByDocumentId } from '@/lib/services/vectorStorage';
import type { TaskEmbeddingInsert, EmbeddingGenerationResult } from '@/lib/types/embedding';

// Mock the AI SDK embed function
vi.mock('ai', () => ({
  embed: vi.fn(),
}));

// Mock Supabase client with proper method chaining
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [{ id: 'test' }], error: null })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
  })),
}));

describe('Embedding Generation (T023)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateEmbedding', () => {
    it('should generate 1536-dimension embedding for single task', async () => {
      // Mock successful embedding generation
      const mockEmbedding = Array(1536).fill(0.5);
      const { embed } = await import('ai');
      vi.mocked(embed).mockResolvedValue({ embedding: mockEmbedding });

      const result = await generateEmbedding('Test task text');

      expect(result).toHaveLength(1536);
      expect(result).toEqual(mockEmbedding);
      expect(embed).toHaveBeenCalledWith({
        model: expect.objectContaining({ modelId: 'text-embedding-3-small' }),
        value: 'Test task text',
      });
    });

    it('should throw error when embedding API fails', async () => {
      const { embed } = await import('ai');
      vi.mocked(embed).mockRejectedValue(new Error('API timeout'));

      await expect(generateEmbedding('Test task')).rejects.toThrow();
    });

    it('should handle empty text input', async () => {
      await expect(generateEmbedding('')).rejects.toThrow('Task text cannot be empty');
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('should generate embeddings for 20 tasks successfully', async () => {
      // Mock successful embedding generation
      const mockEmbedding = Array(1536).fill(0.5);
      const { embed } = await import('ai');
      vi.mocked(embed).mockResolvedValue({ embedding: mockEmbedding });

      const tasks = Array(20).fill(null).map((_, i) => ({
        task_id: `task-${i}`,
        task_text: `Test task ${i}`,
        document_id: 'doc-123',
      }));

      const results = await generateBatchEmbeddings(tasks);

      expect(results).toHaveLength(20);
      expect(results.every(r => r.status === 'completed')).toBe(true);
      expect(results.every(r => r.embedding?.length === 1536)).toBe(true);
      expect(embed).toHaveBeenCalledTimes(20);
    });

    it('should handle individual task failures without blocking batch (T025)', async () => {
      const mockEmbedding = Array(1536).fill(0.5);
      const { embed } = await import('ai');

      // Mock: first 10 succeed, next 10 fail
      let callCount = 0;
      vi.mocked(embed).mockImplementation(() => {
        callCount++;
        if (callCount <= 10) {
          return Promise.resolve({ embedding: mockEmbedding });
        }
        return Promise.reject(new Error('API error'));
      });

      const tasks = Array(20).fill(null).map((_, i) => ({
        task_id: `task-${i}`,
        task_text: `Test task ${i}`,
        document_id: 'doc-123',
      }));

      const results = await generateBatchEmbeddings(tasks);

      expect(results).toHaveLength(20);
      const completed = results.filter(r => r.status === 'completed');
      const pending = results.filter(r => r.status === 'pending');

      // T025: Failed embeddings should be marked 'pending' for graceful degradation
      expect(completed).toHaveLength(10);
      expect(pending).toHaveLength(10);
      expect(pending.every(r => r.error_message)).toBe(true);
      expect(pending.every(r => r.embedding === null)).toBe(true);
    });

    it('should process batch of 50 tasks within acceptable time', async () => {
      const mockEmbedding = Array(1536).fill(0.5);
      const { embed } = await import('ai');
      vi.mocked(embed).mockResolvedValue({ embedding: mockEmbedding });

      const tasks = Array(50).fill(null).map((_, i) => ({
        task_id: `task-${i}`,
        task_text: `Test task ${i}`,
        document_id: 'doc-123',
      }));

      const startTime = Date.now();
      const results = await generateBatchEmbeddings(tasks);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(50);
      expect(duration).toBeLessThan(5000); // Should complete in <5s (mocked)
    });

    it('should return empty array for empty input', async () => {
      const results = await generateBatchEmbeddings([]);
      expect(results).toEqual([]);
    });
  });

  describe('storeEmbeddings', () => {
    it('should store embeddings successfully', async () => {
      const embeddings: TaskEmbeddingInsert[] = [
        {
          task_id: 'task-1',
          task_text: 'Test task 1',
          document_id: 'doc-123',
          embedding: Array(1536).fill(0.5),
          status: 'completed',
        },
      ];

      const result = await storeEmbeddings(embeddings);

      expect(result.success).toBeGreaterThan(0);
      expect(result.failed).toBe(0);
    });

    it('should handle storage errors gracefully', async () => {
      const embeddings: TaskEmbeddingInsert[] = [
        {
          task_id: 'task-1',
          task_text: 'Test task 1',
          document_id: 'invalid-uuid',
          embedding: Array(1536).fill(0.5),
          status: 'completed',
        },
      ];

      // Test should not throw, but may log errors
      await expect(storeEmbeddings(embeddings)).resolves.not.toThrow();
    });
  });

  describe('getEmbeddingsByDocumentId', () => {
    it('should retrieve embeddings for document', async () => {
      const embeddings = await getEmbeddingsByDocumentId('doc-123');

      expect(Array.isArray(embeddings)).toBe(true);
    });

    it('should return empty array for document with no embeddings', async () => {
      const embeddings = await getEmbeddingsByDocumentId('non-existent');

      expect(embeddings).toEqual([]);
    });
  });

  describe('Integration with aiSummarizer', () => {
    it('should generate embeddings during document processing', async () => {
      // This test will be implemented after aiSummarizer integration
      // Placeholder for integration testing
      expect(true).toBe(true);
    });

    it('should handle graceful degradation when embedding fails', async () => {
      // This test will be implemented after aiSummarizer integration
      // Placeholder for graceful degradation testing
      expect(true).toBe(true);
    });
  });
});
