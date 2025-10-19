import { describe, expect, it, vi, afterEach } from 'vitest';
import { semanticSearchTool } from '@/lib/mastra/tools/semanticSearch';
import * as embeddingService from '@/lib/services/embeddingService';
import * as vectorStorage from '@/lib/services/vectorStorage';

const mockEmbedding = new Array(1536).fill(0.05);

const baseResult = [
  {
    task_id: 'task-1',
    task_text: 'Improve onboarding flow',
    document_id: 'doc-1',
    similarity: 0.91,
  },
  {
    task_id: 'task-2',
    task_text: 'Reduce churn with better support',
    document_id: 'doc-2',
    similarity: 0.82,
  },
];

describe('semanticSearchTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns filtered and sorted results when similarity meets threshold', async () => {
    vi.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue(mockEmbedding);
    vi.spyOn(vectorStorage, 'searchSimilarTasks').mockResolvedValue([...baseResult]);

    const result = await semanticSearchTool.execute({
      query: 'increase monthly revenue',
      limit: 10,
      threshold: 0.8,
    });

    expect(result.query).toBe('increase monthly revenue');
    expect(result.count).toBe(2);
    expect(result.tasks[0].similarity).toBeGreaterThanOrEqual(result.tasks[1].similarity);
    expect(vectorStorage.searchSimilarTasks).toHaveBeenCalledWith(mockEmbedding, 0.8, 10);
  });

  it('throws when threshold is out of range', async () => {
    await expect(
      semanticSearchTool.execute({ query: 'test', threshold: 1.5 })
    ).rejects.toMatchObject({ code: 'INVALID_THRESHOLD' });
  });

  it('maps embedding errors to retryable code when applicable', async () => {
    const timeoutError = Object.assign(new Error('request timeout'), { status: 408 });
    const error = new embeddingService.EmbeddingError('timeout', timeoutError);
    vi.spyOn(embeddingService, 'generateEmbedding').mockRejectedValue(error);

    await expect(
      semanticSearchTool.execute({ query: 'retry scenario' })
    ).rejects.toMatchObject({
      code: 'EMBEDDING_SERVICE_UNAVAILABLE',
      retryable: true,
    });
  });
});
