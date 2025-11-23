const unifiedFlagRaw =
  process.env.NEXT_PUBLIC_USE_UNIFIED_PRIORITIZATION ??
  process.env.USE_UNIFIED_PRIORITIZATION ??
  'true';

/**
 * Feature flag that gates the hybrid prioritization loop rollout.
 * Default: true (new system enabled) unless explicitly set to "false".
 */
export const USE_UNIFIED_PRIORITIZATION = unifiedFlagRaw.toLowerCase() === 'true';
