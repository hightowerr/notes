import { describe, it, expect, beforeEach, vi } from 'vitest';

import { calculateCentroid, analyzeCoverage } from '@/lib/services/taskIntelligence';
import { calculateCosineSimilarity } from '@/lib/services/aiSummarizer';

vi.mock('ai', () => ({
  embed: vi.fn(),
  generateObject: vi.fn().mockResolvedValue({
    object: { missing_areas: ['pricing experiments', 'upsell flow'] }
  }),
}));

import { embed, generateObject } from 'ai';

const baseEmbeddings = [
  [0.6, 0.2, 0.2],
  [0.5, 0.3, 0.2],
  [0.7, 0.15, 0.15],
  [0.65, 0.25, 0.1],
  [0.55, 0.35, 0.1],
];

const mockTaskEmbeddings = [...baseEmbeddings, ...baseEmbeddings]; // 10 tasks per spec
const mockTaskIds = mockTaskEmbeddings.map((_, index) => `task-${index + 1}`);
const mockTaskTexts = mockTaskEmbeddings.map((_, index) => `Task ${index + 1}`);

const embedMock = vi.mocked(embed);
const generateObjectMock = vi.mocked(generateObject);

describe('Coverage Algorithm (T004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateObjectMock.mockResolvedValue({
      object: { missing_areas: ['pricing experiments', 'upsell flow'] }
    });
  });

  it('calculates the centroid as the average of all task embeddings', () => {
    const centroid = calculateCentroid(mockTaskEmbeddings);

    expect(centroid).toEqual([0.6, 0.25, 0.15]);
  });

  it('produces the expected cosine similarity (~0.76) between the outcome and centroid', async () => {
    const outcomeEmbedding = [0.3, 0.6, 0.3];
    embedMock.mockResolvedValue(outcomeEmbedding);

    const result = await analyzeCoverage(
      'Increase ARR by 25%',
      mockTaskIds,
      mockTaskTexts,
      mockTaskEmbeddings
    );

    const directSimilarity = calculateCosineSimilarity(
      outcomeEmbedding,
      result.task_cluster_centroid
    );

    expect(directSimilarity).toBeCloseTo(0.7649, 3);
    expect(result.coverage_percentage).toBe(Math.round(directSimilarity * 100));
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it('flags coverage below 70% as needing drafts and surfaces missing areas', async () => {
    const lowOutcomeEmbedding = [0.1, 0.2, 0.9];
    embedMock.mockResolvedValue(lowOutcomeEmbedding);
    generateObjectMock.mockResolvedValue({
      object: { missing_areas: ['pricing experiments', 'upsell flow'] }
    });

    const result = await analyzeCoverage(
      'Improve onboarding retention',
      mockTaskIds,
      mockTaskTexts,
      mockTaskEmbeddings
    );

    expect(result.coverage_percentage).toBeLessThan(70);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(result.missing_areas).toEqual(['pricing experiments', 'upsell flow']);
    expect(result.goal_embedding).toEqual(lowOutcomeEmbedding);
  });

  it('keeps should_generate_drafts false when coverage is ≥70%', async () => {
    const highOutcomeEmbedding = [0.3, 0.6, 0.3];
    embedMock.mockResolvedValue(highOutcomeEmbedding);

    const result = await analyzeCoverage(
      'Maintain existing ARR',
      mockTaskIds,
      mockTaskTexts,
      mockTaskEmbeddings
    );

    const shouldGenerateDrafts = result.coverage_percentage < 70;
    expect(result.coverage_percentage).toBeGreaterThanOrEqual(70);
    expect(shouldGenerateDrafts).toBe(false);
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});
