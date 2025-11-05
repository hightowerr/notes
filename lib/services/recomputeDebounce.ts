/**
 * Debounce utility for recompute job triggering
 * Feature: 004-reflection-capture-quick
 *
 * Implements:
 * - 2-second debounce: Multiple rapid calls trigger single execution after 2s
 * - 10-second rate limit: Maximum 1 execution per 10 seconds per user
 *
 * Pattern: Map-based per-user timers (no external library)
 */

// Map to track active timers per user
const userTimers = new Map<string, NodeJS.Timeout>();

// Map to track last execution time per user (milliseconds since epoch)
const userLastExecution = new Map<string, number>();

/**
 * Debounce recompute job trigger with rate limiting
 *
 * Behavior:
 * - If called multiple times within debounceMs, only last call executes
 * - If called within rateLimitMs of last execution, silently skips
 * - Each user has independent timer and rate limit
 *
 * @param userId - User ID (UUID) for per-user tracking
 * @param triggerFn - Async function to execute after debounce
 * @param debounceMs - Debounce delay in milliseconds (default: 2000ms)
 * @param rateLimitMs - Rate limit window in milliseconds (default: 10000ms)
 */
export function debounceRecompute(
  userId: string,
  triggerFn: () => Promise<void>,
  debounceMs: number = 2000,
  rateLimitMs: number = 10000
): void {
  // Check rate limit
  const lastExec = userLastExecution.get(userId) || 0;
  const now = Date.now();
  const timeSinceLastExec = now - lastExec;

  if (timeSinceLastExec < rateLimitMs) {
    const waitTime = Math.ceil((rateLimitMs - timeSinceLastExec) / 1000);
    console.log(
      JSON.stringify({
        event: 'recompute_rate_limited',
        user_id: userId,
        timestamp: new Date().toISOString(),
        wait_seconds: waitTime,
        message: `Rate limit: User must wait ${waitTime}s`
      })
    );
    return; // Silently skip - rate limited
  }

  // Clear existing timer for this user
  const existingTimer = userTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    console.log(
      JSON.stringify({
        event: 'recompute_debounced',
        user_id: userId,
        timestamp: new Date().toISOString(),
        message: 'Previous timer cleared, new timer set'
      })
    );
  }

  // Set new debounced timer
  const timer = setTimeout(async () => {
    // Update last execution time
    userLastExecution.set(userId, Date.now());

    // Remove timer from map
    userTimers.delete(userId);

    console.log(
      JSON.stringify({
        event: 'recompute_executing',
        user_id: userId,
        timestamp: new Date().toISOString(),
        message: 'Debounce period complete, executing recompute'
      })
    );

    try {
      await triggerFn();
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'recompute_debounce_error',
          user_id: userId,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      );
    }
  }, debounceMs);

  // Store timer for this user
  userTimers.set(userId, timer);
}

/**
 * Clear debounce state for a user (useful for testing or cleanup)
 *
 * @param userId - User ID (UUID)
 */
export function clearDebounceState(userId: string): void {
  const timer = userTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    userTimers.delete(userId);
  }
  userLastExecution.delete(userId);
}
