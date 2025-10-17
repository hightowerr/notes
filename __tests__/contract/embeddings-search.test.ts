/**
 * Contract Tests: POST /api/embeddings/search
 * Task: T024 - Semantic search endpoint validation
 *
 * Tests API contract compliance, request/response schemas, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/embeddings/search/route';
import { NextRequest } from 'next/server';
import * as embeddingService from '@/lib/services/embeddingService';
import * as vectorStorage from '@/lib/services/vectorStorage';

// Mock modules
vi.mock('@/lib/services/embeddingService', () => ({
  generateEmbedding: vi.fn(),
}));

vi.mock('@/lib/services/vectorStorage', () => ({
  searchSimilarTasks: vi.fn(),
}));

describe('POST /api/embeddings/search - Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Validation', () => {
    it('should return 400 for empty query', async () => {
      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: '' }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body).toMatchObject({
        error: 'Invalid request',
        code: 'INVALID_QUERY',
      });
      expect(body.message).toContain('empty');
    });

    it('should return 400 for missing query field', async () => {
      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ limit: 20 }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('INVALID_QUERY');
    });

    it('should return 400 for threshold > 1', async () => {
      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test', threshold: 1.5 }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('INVALID_QUERY');
    });

    it('should return 400 for threshold < 0', async () => {
      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test', threshold: -0.5 }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('INVALID_QUERY');
    });

    it('should return 400 for negative limit', async () => {
      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test', limit: -5 }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('INVALID_QUERY');
    });

    it('should accept valid request with defaults', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      const mockResults = [
        {
          task_id: 'task123',
          task_text: 'Test task',
          document_id: '550e8400-e29b-41d4-a716-446655440000',
          similarity: 0.85,
        },
      ];

      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue(mockEmbedding);
      vi.mocked(vectorStorage.searchSimilarTasks).mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'increase revenue' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('increase revenue');
      expect(vectorStorage.searchSimilarTasks).toHaveBeenCalledWith(mockEmbedding, 0.7, 20);
    });

    it('should accept custom threshold and limit', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      const mockResults: any[] = [];

      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue(mockEmbedding);
      vi.mocked(vectorStorage.searchSimilarTasks).mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test', threshold: 0.8, limit: 10 }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(vectorStorage.searchSimilarTasks).toHaveBeenCalledWith(mockEmbedding, 0.8, 10);
    });
  });

  describe('Response Schema', () => {
    it('should return correct schema with results', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      const mockResults = [
        {
          task_id: 'abc123',
          task_text: 'Implement revenue tracking',
          document_id: '550e8400-e29b-41d4-a716-446655440000',
          similarity: 0.89,
        },
        {
          task_id: 'def456',
          task_text: 'Analyze subscription growth',
          document_id: '550e8400-e29b-41d4-a716-446655440001',
          similarity: 0.82,
        },
      ];

      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue(mockEmbedding);
      vi.mocked(vectorStorage.searchSimilarTasks).mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'increase revenue' }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        tasks: mockResults,
        query: 'increase revenue',
        count: 2,
      });

      // Verify task structure
      expect(body.tasks[0]).toMatchObject({
        task_id: expect.any(String),
        task_text: expect.any(String),
        document_id: expect.any(String),
        similarity: expect.any(Number),
      });
    });

    it('should return empty array when no matches', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      const mockResults: any[] = [];

      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue(mockEmbedding);
      vi.mocked(vectorStorage.searchSimilarTasks).mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'quantum computing algorithms' }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        tasks: [],
        query: 'quantum computing algorithms',
        count: 0,
      });
    });

    it('should echo query back in response', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      const mockResults: any[] = [];

      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue(mockEmbedding);
      vi.mocked(vectorStorage.searchSimilarTasks).mockResolvedValue(mockResults);

      const queryText = 'optimize database performance';
      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: queryText }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(body.query).toBe(queryText);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when embedding generation fails', async () => {
      vi.mocked(embeddingService.generateEmbedding).mockRejectedValue(
        new Error('Embedding generation failed')
      );

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test query' }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        error: 'Internal server error',
        message: 'Failed to generate embedding for query',
        code: 'EMBEDDING_GENERATION_FAILED',
      });
    });

    it('should return 503 when embedding API is unavailable', async () => {
      vi.mocked(embeddingService.generateEmbedding).mockRejectedValue(
        new Error('Embedding generation timeout')
      );

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test query' }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        error: 'Service unavailable',
        message: 'Embedding service temporarily unavailable',
        code: 'EMBEDDING_SERVICE_UNAVAILABLE',
      });
    });

    it('should return 503 when OpenAI API key is missing', async () => {
      vi.mocked(embeddingService.generateEmbedding).mockRejectedValue(
        new Error('OPENAI_API_KEY environment variable is not set')
      );

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test query' }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.code).toBe('EMBEDDING_SERVICE_UNAVAILABLE');
    });

    it('should return 500 when vector search fails', async () => {
      const mockEmbedding = Array(1536).fill(0.1);

      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue(mockEmbedding);
      vi.mocked(vectorStorage.searchSimilarTasks).mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test query' }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        error: 'Internal server error',
        message: 'Vector search query failed',
        code: 'DATABASE_ERROR',
      });
    });
  });

  describe('Performance Requirements', () => {
    it('should complete search in reasonable time', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      const mockResults = [
        {
          task_id: 'task1',
          task_text: 'Test task',
          document_id: '550e8400-e29b-41d4-a716-446655440000',
          similarity: 0.85,
        },
      ];

      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue(mockEmbedding);
      vi.mocked(vectorStorage.searchSimilarTasks).mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      const startTime = Date.now();
      await POST(request);
      const duration = Date.now() - startTime;

      // Mock should be instant, but with overhead should be well under 500ms
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Similarity Score Filtering', () => {
    it('should only return tasks above threshold', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      const mockResults = [
        {
          task_id: 'task1',
          task_text: 'High similarity task',
          document_id: '550e8400-e29b-41d4-a716-446655440000',
          similarity: 0.92,
        },
        {
          task_id: 'task2',
          task_text: 'Medium similarity task',
          document_id: '550e8400-e29b-41d4-a716-446655440001',
          similarity: 0.81,
        },
      ];

      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue(mockEmbedding);
      vi.mocked(vectorStorage.searchSimilarTasks).mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test', threshold: 0.8 }),
      });

      const response = await POST(request);
      const body = await response.json();

      // Verify vectorStorage was called with correct threshold
      expect(vectorStorage.searchSimilarTasks).toHaveBeenCalledWith(
        mockEmbedding,
        0.8,
        20
      );

      // Results should already be filtered by RPC function
      expect(body.tasks.length).toBeGreaterThan(0);
      body.tasks.forEach((task: any) => {
        expect(task.similarity).toBeGreaterThanOrEqual(0.8);
      });
    });
  });

  describe('Result Ordering', () => {
    it('should return results sorted by similarity descending', async () => {
      const mockEmbedding = Array(1536).fill(0.1);
      const mockResults = [
        {
          task_id: 'task1',
          task_text: 'Highest similarity',
          document_id: '550e8400-e29b-41d4-a716-446655440000',
          similarity: 0.95,
        },
        {
          task_id: 'task2',
          task_text: 'High similarity',
          document_id: '550e8400-e29b-41d4-a716-446655440001',
          similarity: 0.89,
        },
        {
          task_id: 'task3',
          task_text: 'Medium similarity',
          document_id: '550e8400-e29b-41d4-a716-446655440002',
          similarity: 0.75,
        },
      ];

      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue(mockEmbedding);
      vi.mocked(vectorStorage.searchSimilarTasks).mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/embeddings/search', {
        method: 'POST',
        body: JSON.stringify({ query: 'test' }),
      });

      const response = await POST(request);
      const body = await response.json();

      // Verify results are sorted (RPC function handles sorting)
      expect(body.tasks).toHaveLength(3);
      for (let i = 0; i < body.tasks.length - 1; i++) {
        expect(body.tasks[i].similarity).toBeGreaterThanOrEqual(body.tasks[i + 1].similarity);
      }
    });
  });
});
