const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000] as const;

type TimeoutHandle = ReturnType<typeof setTimeout>;

const scheduledRetries = new Map<string, TimeoutHandle>();

export type WebhookRetryTask = {
  eventId: string;
  attempt: number;
  handler: () => Promise<void> | void;
  delayOverrideMs?: number;
};

/**
 * Schedule a retry attempt using exponential backoff.
 *
 * @returns delay in milliseconds if scheduled, otherwise null (max attempts reached)
 */
export function scheduleWebhookRetry(task: WebhookRetryTask): number | null {
  const delay =
    typeof task.delayOverrideMs === 'number'
      ? task.delayOverrideMs
      : RETRY_DELAYS_MS[task.attempt] ?? null;

  if (delay === null) {
    return null;
  }

  cancelWebhookRetry(task.eventId);

  const timeout = setTimeout(async () => {
    scheduledRetries.delete(task.eventId);
    try {
      await task.handler();
    } catch (error) {
      console.error('[WebhookRetry] Retry handler failed', error);
    }
  }, delay);

  scheduledRetries.set(task.eventId, timeout);
  return delay;
}

export function cancelWebhookRetry(eventId: string) {
  const timeout = scheduledRetries.get(eventId);
  if (timeout) {
    clearTimeout(timeout);
    scheduledRetries.delete(eventId);
  }
}

export const __testing = {
  getPendingRetryCount: () => scheduledRetries.size,
  isRetryScheduled: (eventId: string) => scheduledRetries.has(eventId),
  clearAllRetries: () => {
    for (const timeout of scheduledRetries.values()) {
      clearTimeout(timeout);
    }
    scheduledRetries.clear();
  },
  getDelayForAttempt: (attempt: number) => RETRY_DELAYS_MS[attempt] ?? null,
};

export { RETRY_DELAYS_MS };
