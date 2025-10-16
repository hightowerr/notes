/**
 * Filtering Schema for Context-Aware Action Filtering (T018)
 * Defines validation rules for filtering decisions and user context
 */

import { z } from 'zod';
import { ActionSchema } from '../schemas';

// User context for filtering
export const UserContextSchema = z.object({
  goal: z.string().describe('User outcome statement'),
  state: z.enum(['Energized', 'Low energy']).describe('User energy state'),
  capacity_hours: z.number().min(0.25).max(24).describe('Daily time capacity in hours'),
  threshold: z.number().min(0).max(1).default(0.90).describe('Relevance threshold (default 90%)'),
});

export type UserContext = z.infer<typeof UserContextSchema>;

// Excluded action with reason
export const ExcludedActionSchema = z.object({
  text: z.string().describe('Action description'),
  relevance_score: z.number().min(0).max(1).describe('Relevance score'),
  estimated_hours: z.number().min(0.25).max(8).optional().describe('Estimated time'),
  effort_level: z.enum(['high', 'low']).optional().describe('Effort level'),
  reason: z.string().describe('Exclusion reason'),
});

export type ExcludedAction = z.infer<typeof ExcludedActionSchema>;

// Filtering decision structure (stored in processed_documents.filtering_decisions)
export const FilteringDecisionSchema = z.object({
  context: UserContextSchema.describe('Context snapshot at time of filtering'),
  included: z.array(ActionSchema).describe('Actions passing all filters'),
  excluded: z.array(ExcludedActionSchema).describe('Actions filtered out with reasons'),
  total_actions_extracted: z.number().int().nonnegative().describe('Total actions before filtering'),
  filtering_duration_ms: z.number().int().nonnegative().optional().describe('Time taken to filter'),
});

export type FilteringDecision = z.infer<typeof FilteringDecisionSchema>;

// Filtering result (return type from FilteringService)
export const FilteringResultSchema = z.object({
  included: z.array(ActionSchema).describe('Actions passing all filters'),
  excluded: z.array(ExcludedActionSchema).describe('Actions filtered out with reasons'),
  decision: FilteringDecisionSchema.describe('Complete filtering decision for storage'),
});

export type FilteringResult = z.infer<typeof FilteringResultSchema>;
