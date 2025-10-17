/**
 * Integration Test: Embedding API Failure Handling (T025)
 * Tests graceful degradation when OpenAI embedding API is unavailable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateBatchEmbeddings } from '@/lib/services/embeddingService';
import { generateAndStoreEmbeddings } from '@/lib/services/aiSummarizer';
import type { Action } from '@/lib/schemas';

// Mock the AI SDK embed function
vi.mock('ai', () => ({
  embed: vi.fn(),
  generateObject: vi.fn(),
}));

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({
          data: [{ id: 'test' }],
          error: null
        })),
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  })),
}));

describe('Embedding API Failure Handling (T025)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateBatchEmbeddings - API unavailable', () => {
    it('should mark all tasks as pending when API key is missing', async () => {
      const { embed } = await import('ai');

      // Simulate API key missing error
      vi.mocked(embed).mockRejectedValue(
        new Error('OPENAI_API_KEY environment variable is not set')
      );

      const tasks = Array(10).fill(null).map((_, i) => ({
        task_id: `task-${i}`,
        task_text: `Test task ${i}`,
        document_id: 'doc-123',
      }));

      const results = await generateBatchEmbeddings(tasks);

      // FR-024: Document marked "completed" despite embedding failure
      expect(results).toHaveLength(10);
      expect(results.every(r => r.status === 'pending')).toBe(true);
      expect(results.every(r => r.embedding === null)).toBe(true);

      // FR-025, FR-028: Embeddings marked "pending" with error message
      expect(results.every(r => r.error_message !== null)).toBe(true);
      expect(results.every(r =>
        r.error_message?.includes('OPENAI_API_KEY') ||
        r.error_message?.includes('API')
      )).toBe(true);
    });

    it('should mark tasks as pending on API timeout', async () => {
      const { embed } = await import('ai');

      // Simulate timeout error
      vi.mocked(embed).mockRejectedValue(
        new Error('Embedding generation timeout')
      );

      const tasks = [
        {
          task_id: 'task-1',
          task_text: 'Review insurance policy',
          document_id: 'doc-456',
        },
      ];

      const results = await generateBatchEmbeddings(tasks);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('pending');
      expect(results[0].error_message).toContain('timeout');
    });

    it('should mark tasks as pending on API rate limit error', async () => {
      const { embed } = await import('ai');

      // Simulate rate limit error
      vi.mocked(embed).mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      const tasks = Array(20).fill(null).map((_, i) => ({
        task_id: `task-${i}`,
        task_text: `Test task ${i}`,
        document_id: 'doc-789',
      }));

      const results = await generateBatchEmbeddings(tasks);

      expect(results).toHaveLength(20);
      expect(results.every(r => r.status === 'pending')).toBe(true);
      expect(results.every(r => r.error_message?.includes('Rate limit'))).toBe(true);
    });
  });

  describe('generateAndStoreEmbeddings - graceful degradation', () => {
    it('should return pending status when all embeddings fail', async () => {
      const { embed } = await import('ai');

      // Simulate complete API failure
      vi.mocked(embed).mockRejectedValue(
        new Error('OpenAI API unavailable')
      );

      const actions: Action[] = [
        { text: 'Review document', estimated_hours: 1.0, effort_level: 'low', relevance_score: 1.0 },
        { text: 'Schedule meeting', estimated_hours: 0.5, effort_level: 'low', relevance_score: 1.0 },
        { text: 'Prepare presentation', estimated_hours: 4.0, effort_level: 'high', relevance_score: 1.0 },
      ];

      const result = await generateAndStoreEmbeddings('doc-999', actions);

      // FR-024: Document remains usable, embeddings marked pending
      expect(result.embeddingsStatus).toBe('pending');
      expect(result.success).toBe(0);
      expect(result.pending).toBe(3);
      expect(result.failed).toBe(0); // We use 'pending' instead of 'failed'
    });

    it('should return pending status when some embeddings fail', async () => {
      const { embed } = await import('ai');
      const mockEmbedding = Array(1536).fill(0.5);

      // First 2 succeed, third fails
      let callCount = 0;
      vi.mocked(embed).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve({ embedding: mockEmbedding });
        }
        return Promise.reject(new Error('API timeout'));
      });

      const actions: Action[] = [
        { text: 'Task 1', estimated_hours: 1.0, effort_level: 'low', relevance_score: 1.0 },
        { text: 'Task 2', estimated_hours: 1.0, effort_level: 'low', relevance_score: 1.0 },
        { text: 'Task 3', estimated_hours: 1.0, effort_level: 'low', relevance_score: 1.0 },
      ];

      const result = await generateAndStoreEmbeddings('doc-partial', actions);

      // Partial success still returns 'pending' status (FR-024)
      expect(result.embeddingsStatus).toBe('pending');
      expect(result.success).toBe(2);
      expect(result.pending).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should return completed status only when all embeddings succeed', async () => {
      const { embed } = await import('ai');
      const mockEmbedding = Array(1536).fill(0.5);

      // All succeed
      vi.mocked(embed).mockResolvedValue({ embedding: mockEmbedding });

      const actions: Action[] = [
        { text: 'Task 1', estimated_hours: 1.0, effort_level: 'low', relevance_score: 1.0 },
        { text: 'Task 2', estimated_hours: 1.0, effort_level: 'low', relevance_score: 1.0 },
      ];

      const result = await generateAndStoreEmbeddings('doc-complete', actions);

      expect(result.embeddingsStatus).toBe('completed');
      expect(result.success).toBe(2);
      expect(result.pending).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle empty actions array gracefully', async () => {
      const result = await generateAndStoreEmbeddings('doc-empty', []);

      expect(result.embeddingsStatus).toBe('completed');
      expect(result.success).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('Error logging context (FR-026, FR-027, FR-028)', () => {
    it('should log error with full context on embedding failure', async () => {
      const { embed } = await import('ai');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(embed).mockRejectedValue(
        new Error('OpenAI API error')
      );

      const tasks = [
        {
          task_id: 'task-log-test',
          task_text: 'Test logging',
          document_id: 'doc-log-123',
        },
      ];

      await generateBatchEmbeddings(tasks);

      // Verify error was logged with context
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EmbeddingService]'),
        expect.objectContaining({
          task_id: 'task-log-test',
          document_id: 'doc-log-123',
          error: expect.any(String),
          timestamp: expect.any(String),
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('No automatic retry (FR-031)', () => {
    it('should not retry failed embeddings automatically', async () => {
      const { embed } = await import('ai');

      // Track how many times embed is called
      let embedCallCount = 0;
      vi.mocked(embed).mockImplementation(() => {
        embedCallCount++;
        return Promise.reject(new Error('API failure'));
      });

      const tasks = [
        {
          task_id: 'task-no-retry',
          task_text: 'Test no retry',
          document_id: 'doc-retry-test',
        },
      ];

      await generateBatchEmbeddings(tasks);

      // Verify embed was called only once per task (no automatic retry)
      expect(embedCallCount).toBe(1);
    });
  });
});
