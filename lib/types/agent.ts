import type { z } from 'zod';

import type { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import type { HybridLoopMetadata } from '@/lib/schemas/hybridLoopMetadataSchema';
import type { reasoningStepSchema } from '@/lib/schemas/reasoningStepSchema';
import type { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';

export type AgentSessionStatus = 'running' | 'completed' | 'failed';

export type ExecutionMetadata = z.infer<typeof executionMetadataSchema>;

export type ReasoningStep = z.infer<typeof reasoningStepSchema>;

export type PrioritizedTaskPlan = z.infer<typeof prioritizedPlanSchema>;
export type TaskAnnotation = any;
export type TaskRemoval = any;
export type TaskDependency = {
  source_task_id: string;
  target_task_id: string;
  relationship_type: 'prerequisite' | 'blocks' | 'related';
  confidence: number;
  detection_method: 'ai_inference' | 'stored_relationship';
};

export interface ReasoningTraceRecord {
  session_id: string;
  steps: ReasoningStep[];
  total_duration_ms: number;
  total_steps: number;
  tools_used_count: Record<string, number>;
}

export interface AgentSessionRecord {
  id: string;
  user_id: string;
  outcome_id: string;
  status: AgentSessionStatus;
  prioritized_plan: PrioritizedTaskPlan | null;
  execution_metadata: ExecutionMetadata;
  created_at: string;
  updated_at: string;
}

export interface OutcomeContext {
  id: string;
  direction: string;
  object_text: string;
  metric_text: string;
  clarifier: string;
  assembled_text: string;
  state_preference: string | null;
  daily_capacity_hours: number | null;
}

export interface ReflectionContext {
  id: string;
  text: string;
  created_at: string;
  weight?: number;
  relative_time?: string;
}

export interface TaskSummary {
  task_id: string;
  task_text: string;
  document_id: string;
  source?: 'structured_output' | 'embedding';
  previous_rank?: number | null;
  previous_confidence?: number | null;
  previous_state?: 'active' | 'completed' | 'discarded' | 'manual_override' | 'reintroduced';
  removal_reason?: string | null;
  manual_override?: boolean;
  lnoCategory?: 'leverage' | 'neutral' | 'overhead';
  outcomeAlignment?: string | null;
  sourceText?: string | null;
}

export interface AgentRuntimeContext {
  outcome: OutcomeContext;
  reflections: ReflectionContext[];
  tasks: TaskSummary[];
  metadata: {
    task_count: number;
    document_count: number;
    reflection_count: number;
    has_previous_plan: boolean;
  };
  history?: {
    previous_plan?: PrioritizedTaskPlan;
  };
}

export interface AgentRunSuccess {
  status: 'completed';
  plan: PrioritizedTaskPlan;
  metadata: ExecutionMetadata;
  trace: ReasoningTraceRecord;
  evaluationMetadata?: HybridLoopMetadata | null;
}

export interface AgentRunFailure {
  status: 'failed';
  error: string;
  metadata: ExecutionMetadata;
  trace?: ReasoningTraceRecord;
  evaluationMetadata?: null;
}

export type AgentRunResult = AgentRunSuccess | AgentRunFailure;
