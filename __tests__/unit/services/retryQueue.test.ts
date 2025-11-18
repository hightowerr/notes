import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { enqueueRetryJob, resetRetryQueue, waitForRetryQueueIdle } from '@/lib/services/retryQueue';

const impactEstimate = {
  impact: 5,
  reasoning: 'Test impact estimation',
  keywords: ['test'],
  confidence: 0.8,
};

describe('retryQueue exponential backoff', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetRetryQueue();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    resetRetryQueue();
    vi.useRealTimers();
  });

  it('waits 1s, 2s, 4s between retry attempts outside of test environment', async () => {
    process.env.NODE_ENV = 'production';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    let attempt = 0;
    const estimateFn = vi.fn().mockImplementation(() => {
      attempt += 1;
      if (attempt < 3) {
        return Promise.reject(new Error('LLM timeout'));
      }
      return Promise.resolve(impactEstimate);
    });
    const onSuccess = vi.fn().mockResolvedValue(undefined);

    enqueueRetryJob({
      taskId: 'task-delay',
      sessionId: 'session-delay',
      estimateFn,
      onSuccess,
    });

    const flush = async () => {
      await Promise.resolve();
    };

    expect(estimateFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    await flush();
    expect(estimateFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await flush();
    expect(estimateFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000 - 1);
    await flush();
    expect(estimateFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await flush();
    expect(estimateFn).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(4000);
    await flush();
    await waitForRetryQueueIdle();

    expect(estimateFn).toHaveBeenCalledTimes(3);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('bypasses delays entirely when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    vi.useRealTimers();

    const estimateFn = vi.fn().mockResolvedValue(impactEstimate);
    const onSuccess = vi.fn().mockResolvedValue(undefined);

    enqueueRetryJob({
      taskId: 'task-test-env',
      sessionId: 'session-test-env',
      estimateFn,
      onSuccess,
    });

    await waitForRetryQueueIdle();

    expect(estimateFn).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
