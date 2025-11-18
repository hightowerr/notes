import { randomUUID } from 'node:crypto';

import type { ImpactEstimate } from '@/lib/schemas/strategicScore';
import type { RetryStatusEntry } from '@/lib/schemas/retryStatus';

type RetryJobOptions = {
  taskId: string;
  sessionId: string;
  estimateFn: () => Promise<ImpactEstimate | null>;
  onSuccess: (estimate: ImpactEstimate) => Promise<void>;
  onFailure?: (error: unknown, attempts: number, lastError?: string) => Promise<void>;
  maxAttempts?: number;
  cacheKey?: string;
};

type RetryStatus = RetryStatusEntry['status'];

type RetryJob = RetryJobOptions & {
  key: string;
  attempts: number;
  status: RetryStatus;
  lastError?: string;
  updatedAt: Date;
  createdAt: Date;
  cancelled: boolean;
  runner?: Promise<void>;
  maxAttempts: number;
  cacheKey: string;
};

const RETRY_DELAYS_MS = [1000, 2000, 4000];
const RECENT_RESTART_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const STALLED_JOB_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const STALLED_JOB_PRUNE_INTERVAL_MS = 60 * 1000; // 1 minute

type RetryQueueState = {
  queue: Map<string, RetryJob>;
  activeRunners: Set<Promise<void>>;
  bootId: string;
  bootedAt: Date;
  completedEstimates: Map<string, ImpactEstimate>;
};

const globalWithRetryQueueState = globalThis as typeof globalThis & {
  __retryQueueState?: RetryQueueState;
};

const retryQueueState: RetryQueueState = globalWithRetryQueueState.__retryQueueState ?? {
  queue: new Map<string, RetryJob>(),
  activeRunners: new Set<Promise<void>>(),
  bootId: randomUUID(),
  bootedAt: new Date(),
  completedEstimates: new Map<string, ImpactEstimate>(),
};

if (!globalWithRetryQueueState.__retryQueueState) {
  globalWithRetryQueueState.__retryQueueState = retryQueueState;
}

const queue = retryQueueState.queue;
const activeRunners = retryQueueState.activeRunners;
const completedEstimates = retryQueueState.completedEstimates;
let lastStalledPruneAt = 0;

function jobKey(taskId: string, sessionId: string) {
  return `${sessionId}:${taskId}`;
}

function delay(ms: number) {
  if (ms <= 0 || process.env.NODE_ENV === 'test') {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runJob(job: RetryJob) {
  while (!job.cancelled && job.attempts < job.maxAttempts) {
    const delayMs = RETRY_DELAYS_MS[Math.min(job.attempts, RETRY_DELAYS_MS.length - 1)];
    await delay(delayMs);
    if (job.cancelled) {
      break;
    }

    job.status = 'in_progress';
    job.attempts += 1;
    job.updatedAt = new Date();

    try {
      const estimate = await job.estimateFn();
      if (!estimate) {
        throw new Error('Impact estimate unavailable');
      }
      if (job.cancelled) {
        break;
      }
      await job.onSuccess(estimate);
      completedEstimates.set(job.cacheKey, estimate);
      job.status = 'completed';
      job.updatedAt = new Date();
      queue.delete(job.key);
      return;
    } catch (error) {
      job.lastError =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
      const exhausted = job.attempts >= job.maxAttempts;
      job.status = exhausted ? 'failed' : 'pending';
      job.updatedAt = new Date();

      if (exhausted) {
        if (!job.cancelled && job.onFailure) {
          await job.onFailure(error, job.attempts, job.lastError);
        }
        queue.delete(job.key);
        return;
      }
    }
  }

  queue.delete(job.key);
}

function pruneStuckJobs(now = Date.now()) {
  for (const [key, job] of queue.entries()) {
    if (job.cancelled) {
      continue;
    }
    const lastTouched = job.updatedAt?.getTime?.() ?? job.createdAt.getTime();
    if (now - lastTouched < STALLED_JOB_MAX_AGE_MS) {
      continue;
    }
    job.cancelled = true;
    queue.delete(key);
    console.warn('[RetryQueue] Pruned stalled retry job', {
      taskId: job.taskId,
      sessionId: job.sessionId,
      attempts: job.attempts,
    });
    if (job.onFailure) {
      void job
        .onFailure(new Error('Retry job stale and was pruned'), job.attempts, job.lastError)
        .catch(error => console.error('[RetryQueue] Failed to run onFailure for pruned job', error));
    }
  }
}

function maybePruneStuckJobs() {
  const now = Date.now();
  if (now - lastStalledPruneAt < STALLED_JOB_PRUNE_INTERVAL_MS) {
    return;
  }
  lastStalledPruneAt = now;
  pruneStuckJobs(now);
}

function scheduleJob(job: RetryJob) {
  if (job.runner) {
    return;
  }
  const runner = runJob(job).finally(() => {
    activeRunners.delete(runner);
  });
  job.runner = runner;
  activeRunners.add(runner);
}

export function enqueueRetryJob(options: RetryJobOptions) {
  maybePruneStuckJobs();
  const key = jobKey(options.taskId, options.sessionId);
  if (queue.has(key)) {
    return;
  }

  const cacheKey = options.cacheKey ?? options.taskId;
  const cachedEstimate = completedEstimates.get(cacheKey);
  if (cachedEstimate) {
    void options
      .onSuccess(cachedEstimate)
      .catch(error => console.error('[RetryQueue] Failed to reuse cached impact estimate', error));
    return;
  }

  const job: RetryJob = {
    ...options,
    key,
    attempts: 0,
    status: 'pending',
    updatedAt: new Date(),
    createdAt: new Date(),
    cancelled: false,
    maxAttempts: options.maxAttempts ?? 3,
    cacheKey,
  };

  queue.set(key, job);
  scheduleJob(job);
}

export function getRetryStatusSnapshot(sessionId?: string): Record<string, RetryStatusEntry> {
  maybePruneStuckJobs();
  const entries: Record<string, RetryStatusEntry> = {};
  for (const job of queue.values()) {
    if (sessionId && job.sessionId !== sessionId) {
      continue;
    }
    entries[job.taskId] = {
      status: job.status,
      attempts: job.attempts,
      last_error: job.lastError,
      updated_at: job.updatedAt.toISOString(),
      max_attempts: job.maxAttempts,
    };
  }
  return entries;
}

export function clearRetryJobs(sessionId?: string) {
  for (const [key, job] of queue.entries()) {
    if (sessionId && job.sessionId !== sessionId) {
      continue;
    }
    job.cancelled = true;
    queue.delete(key);
  }
}

export function resetRetryQueue(options?: { clearCache?: boolean }) {
  clearRetryJobs();
  if (options?.clearCache !== false) {
    completedEstimates.clear();
  }
  lastStalledPruneAt = Date.now();
}

export type RetryQueueDiagnostics = {
  boot_id: string;
  booted_at: string;
  pending_jobs: number;
  restarted_recently: boolean;
};

export function getRetryQueueDiagnostics(): RetryQueueDiagnostics {
  const bootedAtMs = retryQueueState.bootedAt.getTime();
  return {
    boot_id: retryQueueState.bootId,
    booted_at: retryQueueState.bootedAt.toISOString(),
    pending_jobs: queue.size,
    restarted_recently: Date.now() - bootedAtMs < RECENT_RESTART_WINDOW_MS,
  };
}

export function forcePruneStuckRetryJobs() {
  pruneStuckJobs();
}

export async function waitForRetryQueueIdle() {
  if (activeRunners.size === 0) {
    return;
  }
  await Promise.all(Array.from(activeRunners.values()));
}
