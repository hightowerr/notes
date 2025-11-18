import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { generateObject } from 'ai';

import {
  calculateConfidence,
  estimateEffort,
  estimateImpact,
  scoreAllTasks,
} from '@/lib/services/strategicScoring';
import { calculatePriority } from '@/lib/utils/strategicPriority';
import type { TaskSummary } from '@/lib/types/agent';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: () => () => 'mock-model',
}));

vi.mock('@/lib/supabase/admin', () => {
  const selectLimit = vi.fn().mockResolvedValue({ data: [{ strategic_scores: {} }], error: null });
  const selectBuilder = {
    eq: vi.fn().mockReturnThis(),
    limit: selectLimit,
  };
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const updateBuilder = {
    eq: updateEq,
  };
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table?: string) => {
    if (table === 'processing_logs') {
      return {
        insert,
      };
    }
    return {
      select: vi.fn(() => selectBuilder),
      update: vi.fn(() => updateBuilder),
    };
  });
  return {
    getSupabaseAdminClient: () => ({ from }),
    __mock: { from, selectLimit, updateEq, insert },
  };
});

const enqueueRetryJobMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/retryQueue', () => ({
  enqueueRetryJob: enqueueRetryJobMock,
}));

const baseTask: TaskSummary = {
  task_id: 'task-1',
  task_text: 'Implement payment flow and validate conversion tracking',
  document_id: 'doc-1',
  source: 'structured_output',
  previous_rank: 1,
  previous_confidence: 0.8,
};

const mockedGenerateObject = generateObject as unknown as vi.Mock;
const originalOpenAIKey = process.env.OPENAI_API_KEY;

afterAll(() => {
  if (typeof originalOpenAIKey === 'string') {
    process.env.OPENAI_API_KEY = originalOpenAIKey;
  } else {
    delete process.env.OPENAI_API_KEY;
  }
});

describe('strategicScoring service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGenerateObject.mockReset();
    delete process.env.OPENAI_API_KEY;
    enqueueRetryJobMock.mockReset();
  });

  it('boosts impact for payment tasks', async () => {
    const impactEstimate = await estimateImpact(baseTask, 'Increase revenue by 25%');
    expect(impactEstimate.impact).toBeGreaterThanOrEqual(7);
  });

  it('extracts effort hints when pattern is present', async () => {
    const task: TaskSummary = {
      ...baseTask,
      task_id: 'task-2',
      task_text: 'QA pass (4 hours) before launch',
    };
    const effortEstimate = await estimateEffort(task);
    expect(effortEstimate.source).toBe('extracted');
    expect(effortEstimate.effort).toBeCloseTo(4);
  });

  it('calculates priority using formula and clamps result', () => {
    const priority = calculatePriority(9, 4, 0.9);
    expect(priority).toBeLessThanOrEqual(100);
    expect(priority).toBeGreaterThan(0);
  });

  it('merges weighted confidence components', () => {
    const { value: confidence, breakdown } = calculateConfidence(baseTask, {
      similarityScore: 0.9,
      dependencyScore: 0.5,
      historyScore: 0.8,
    });
    expect(confidence).toBeCloseTo(0.6 * 0.9 + 0.3 * 0.5 + 0.1 * 0.8, 3);
    expect(breakdown.similarity.value).toBeCloseTo(0.9, 3);
    expect(breakdown.dependency.weight).toBeCloseTo(0.3);
  });

  it('scores all tasks and persists to Supabase', async () => {
    const scores = await scoreAllTasks([baseTask], 'Grow revenue', {
      sessionId: 'session-1',
    });
    expect(scores['task-1']).toBeDefined();
    expect(scores['task-1'].impact).toBeGreaterThan(0);
  });

  it('enqueues retry when impact estimation fails', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockedGenerateObject.mockRejectedValue(new Error('timeout exceeded'));
    const scores = await scoreAllTasks([baseTask], 'Grow revenue', {
      sessionId: 'session-retry',
    });
    expect(Object.keys(scores)).toHaveLength(0);
    expect(enqueueRetryJobMock).toHaveBeenCalledTimes(1);
  });

  it('uses LLM impact estimate when OpenAI key present', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockedGenerateObject.mockResolvedValue({
      object: {
        impact: 9,
        reasoning: 'LLM reasoning',
        keywords: ['growth', 'payments'],
        confidence: 0.9,
      },
    });
    const impactEstimate = await estimateImpact(baseTask, 'Increase revenue by 25%');
    expect(impactEstimate.impact).toBe(9);
    expect(impactEstimate.reasoning).toBe('LLM reasoning');
    expect(mockedGenerateObject).toHaveBeenCalled();
  });

  it('returns null when LLM request fails repeatedly with OpenAI key', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockedGenerateObject.mockRejectedValue(new Error('timeout exceeded'));
    const impactEstimate = await estimateImpact(baseTask, 'Increase revenue by 25%');
    expect(impactEstimate).toBeNull();
    expect(mockedGenerateObject).toHaveBeenCalled();
  });

  it('falls back to heuristic when OpenAI key is not configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const impactEstimate = await estimateImpact(baseTask, 'Increase revenue by 25%');
    expect(impactEstimate).not.toBeNull();
    expect(impactEstimate?.reasoning).toContain('Detected strategic keywords');
  });
});
