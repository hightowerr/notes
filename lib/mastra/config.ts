import { Mastra } from '@mastra/core';

export const mastra = new Mastra({
  // Enable telemetry for tool execution logging
  telemetry: {
    enabled: true,
    provider: 'console', // P0: Log to console; P1: Switch to persistent storage
  },

  // Tool execution settings
  tools: {
    maxConcurrentExecutions: 10, // Global rate limit (FR-012)
    defaultTimeout: 10000, // 10s timeout (soft - allows completion)
    retryPolicy: {
      maxAttempts: 2, // 2 retries (FR-011)
      retryDelay: 2000, // 2s fixed delay (FR-011a)
      retryableErrors: ['NETWORK_TIMEOUT', 'DATABASE_UNAVAILABLE', 'RATE_LIMIT'],
    },
  },

  // Performance monitoring
  monitoring: {
    logSlowExecutions: true,
    slowExecutionThresholdMs: 5000, // P95 target (FR-009c)
  },
});
