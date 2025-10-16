/**
 * Filtering Service for Context-Aware Action Filtering (T018, T020)
 *
 * Implements three-phase cascade filtering:
 * 1. Relevance filter (≥90% threshold)
 * 2. State-based sorting (effort preference)
 * 3. Capacity filter (cumulative time constraint)
 *
 * T020: Includes logging to processing_logs table for transparency
 */

import { Action, LogOperation } from '../schemas';
import {
  UserContext,
  ExcludedAction,
  FilteringResult,
  FilteringDecision,
} from '../schemas/filteringSchema';
import { supabase } from '@/lib/supabase';

/**
 * Filter actions based on user context (outcome, state, capacity)
 *
 * @param actions - Actions with relevance_score, estimated_hours, effort_level
 * @param context - User context (goal, state, capacity, threshold)
 * @returns FilteringResult with included/excluded actions and decision metadata
 */
export function filterActions(
  actions: Action[],
  context: UserContext
): FilteringResult {
  const startTime = performance.now();
  const totalActions = actions.length;

  console.log('[FilteringService] Starting context-aware filtering', {
    totalActions,
    context: {
      goal: context.goal,
      state: context.state,
      capacity: context.capacity_hours,
      threshold: context.threshold,
    },
  });

  // Phase 1: Relevance filter (≥90% threshold)
  const relevantActions = actions.filter(action => {
    const score = action.relevance_score ?? 1.0;
    return score >= context.threshold;
  });

  console.log(`[FilteringService] Phase 1 - Relevance filter: ${relevantActions.length}/${totalActions} passed (≥${context.threshold * 100}%)`);

  // Track excluded actions
  const excluded: ExcludedAction[] = [];

  // Add actions that failed relevance filter
  actions
    .filter(action => {
      const score = action.relevance_score ?? 1.0;
      return score < context.threshold;
    })
    .forEach(action => {
      excluded.push({
        text: action.text,
        relevance_score: action.relevance_score ?? 1.0,
        estimated_hours: action.estimated_hours,
        effort_level: action.effort_level,
        reason: `Below ${context.threshold * 100}% relevance threshold (scored ${((action.relevance_score ?? 1.0) * 100).toFixed(0)}%)`,
      });
    });

  // Phase 2: State-based sorting
  // Low energy: Prefer low-effort (ascending), then relevance (descending)
  // Energized: Prefer high-effort (descending), then relevance (descending)
  const sortedActions = [...relevantActions].sort((a, b) => {
    if (context.state === 'Low energy') {
      // Low-effort first
      if (a.effort_level !== b.effort_level) {
        return a.effort_level === 'low' ? -1 : 1;
      }
    } else {
      // High-effort first
      if (a.effort_level !== b.effort_level) {
        return a.effort_level === 'high' ? -1 : 1;
      }
    }

    // Tie-breaker: Higher relevance first
    const scoreA = a.relevance_score ?? 1.0;
    const scoreB = b.relevance_score ?? 1.0;
    return scoreB - scoreA;
  });

  console.log(`[FilteringService] Phase 2 - State-based sorting: ${context.state} (prioritized ${context.state === 'Low energy' ? 'low' : 'high'}-effort)`);

  // Phase 3: Capacity filter (cumulative time constraint)
  const included: Action[] = [];
  let cumulativeTime = 0;

  for (const action of sortedActions) {
    const actionTime = action.estimated_hours;

    if (cumulativeTime + actionTime <= context.capacity_hours) {
      included.push(action);
      cumulativeTime += actionTime;
    } else {
      // Exceeded capacity
      excluded.push({
        text: action.text,
        relevance_score: action.relevance_score ?? 1.0,
        estimated_hours: action.estimated_hours,
        effort_level: action.effort_level,
        reason: `Exceeds daily capacity (requires ${actionTime}h, ${(context.capacity_hours - cumulativeTime).toFixed(2)}h available)`,
      });
    }
  }

  const duration = Math.round(performance.now() - startTime);

  console.log('[FilteringService] Phase 3 - Capacity filter:', {
    included: included.length,
    totalTime: cumulativeTime.toFixed(2) + 'h',
    capacity: context.capacity_hours + 'h',
    excluded: excluded.length,
  });

  console.log('[FilteringService] Filtering complete:', {
    duration: duration + 'ms',
    totalActions,
    included: included.length,
    excluded: excluded.length,
    exclusionReasons: {
      belowThreshold: excluded.filter(e => e.reason.includes('Below')).length,
      exceedsCapacity: excluded.filter(e => e.reason.includes('Exceeds')).length,
    },
  });

  // Build filtering decision for storage
  const decision: FilteringDecision = {
    context: {
      goal: context.goal,
      state: context.state,
      capacity_hours: context.capacity_hours,
      threshold: context.threshold,
    },
    included,
    excluded,
    total_actions_extracted: totalActions,
    filtering_duration_ms: duration,
  };

  return {
    included,
    excluded,
    decision,
  };
}

/**
 * Check if filtering should be applied based on outcome context
 *
 * @param outcome - User outcome with state and capacity fields
 * @returns true if outcome has state + capacity, false otherwise
 */
export function shouldApplyFiltering(outcome: {
  state_preference?: string | null;
  daily_capacity_hours?: number | null;
}): boolean {
  return (
    outcome.state_preference !== null &&
    outcome.state_preference !== undefined &&
    outcome.daily_capacity_hours !== null &&
    outcome.daily_capacity_hours !== undefined &&
    outcome.daily_capacity_hours > 0
  );
}

/**
 * Edge case handler: No actions meet threshold
 * Returns empty included array with all actions in excluded
 */
export function handleNoRelevantActions(
  actions: Action[],
  context: UserContext
): FilteringResult {
  console.warn('[FilteringService] No actions meet relevance threshold');

  const excluded: ExcludedAction[] = actions.map(action => ({
    text: action.text,
    relevance_score: action.relevance_score ?? 1.0,
    estimated_hours: action.estimated_hours,
    effort_level: action.effort_level,
    reason: `Below ${context.threshold * 100}% relevance threshold (scored ${((action.relevance_score ?? 1.0) * 100).toFixed(0)}%)`,
  }));

  const decision: FilteringDecision = {
    context: {
      goal: context.goal,
      state: context.state,
      capacity_hours: context.capacity_hours,
      threshold: context.threshold,
    },
    included: [],
    excluded,
    total_actions_extracted: actions.length,
    filtering_duration_ms: 0,
  };

  return {
    included: [],
    excluded,
    decision,
  };
}

/**
 * Edge case handler: All actions exceed capacity
 * Returns top 1-2 highest relevance actions with overflow warning
 */
export function handleCapacityOverflow(
  actions: Action[],
  context: UserContext
): FilteringResult {
  console.warn('[FilteringService] All actions exceed capacity, returning top 2 by relevance');

  // Sort by relevance (descending)
  const sortedByRelevance = [...actions].sort((a, b) => {
    const scoreA = a.relevance_score ?? 1.0;
    const scoreB = b.relevance_score ?? 1.0;
    return scoreB - scoreA;
  });

  // Take top 1-2 actions
  const included = sortedByRelevance.slice(0, 2);
  const excludedActions = sortedByRelevance.slice(2);

  const excluded: ExcludedAction[] = excludedActions.map(action => ({
    text: action.text,
    relevance_score: action.relevance_score ?? 1.0,
    estimated_hours: action.estimated_hours,
    effort_level: action.effort_level,
    reason: `Exceeds capacity (all actions require more than ${context.capacity_hours}h)`,
  }));

  const decision: FilteringDecision = {
    context: {
      goal: context.goal,
      state: context.state,
      capacity_hours: context.capacity_hours,
      threshold: context.threshold,
    },
    included,
    excluded,
    total_actions_extracted: actions.length,
    filtering_duration_ms: 0,
  };

  return {
    included,
    excluded,
    decision,
  };
}

/**
 * Log filtering operation to processing_logs table (T020)
 * Provides transparency and debugging for filtering decisions
 *
 * @param fileId - File ID for logging context
 * @param context - User context (goal, state, capacity)
 * @param result - Filtering result with included/excluded counts
 * @param duration - Filtering duration in milliseconds
 */
export async function logFilteringOperation(
  fileId: string,
  context: UserContext,
  result: {
    includedCount: number;
    excludedCount: number;
    totalActions: number;
    belowThresholdCount: number;
    exceedsCapacityCount: number;
  },
  duration: number
): Promise<void> {
  try {
    const { error } = await supabase.from('processing_logs').insert({
      file_id: fileId,
      operation: LogOperation.enum.action_filtering_applied,
      status: 'completed',
      duration,
      metadata: {
        goal: context.goal,
        state: context.state,
        capacity_hours: context.capacity_hours,
        threshold: context.threshold,
        total_actions: result.totalActions,
        included_count: result.includedCount,
        excluded_count: result.excludedCount,
        exclusions: {
          below_threshold: result.belowThresholdCount,
          exceeds_capacity: result.exceedsCapacityCount,
        },
      },
      timestamp: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    // Development mode: Enhanced console logging (T020)
    if (process.env.NODE_ENV === 'development') {
      console.log('[FilteringService] Applied context-aware filtering');
      console.log(`- Goal: "${context.goal}"`);
      console.log(`- State: ${context.state}`);
      console.log(`- Capacity: ${context.capacity_hours}h`);
      console.log(`- Actions: ${result.totalActions} total → ${result.includedCount} included, ${result.excludedCount} excluded`);
      console.log(`- Duration: ${duration}ms`);
      console.log(
        `- Exclusions: ${result.belowThresholdCount} below threshold, ${result.exceedsCapacityCount} exceed capacity`
      );
    }
  } catch (error) {
    // Don't fail filtering operation if logging fails
    console.error('[FilteringService] Failed to log filtering operation:', error);
  }
}
