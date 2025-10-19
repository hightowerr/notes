import type { z } from 'zod';

import type { executionMetadataSchema } from '@/lib/schemas/executionMetadataSchema';
import type { reasoningStepSchema } from '@/lib/schemas/reasoningStepSchema';
import type { prioritizedPlanSchema } from '@/lib/schemas/prioritizedPlanSchema';

export type AgentSessionStatus = 'running' | 'completed' | 'failed';

export type ExecutionMetadata = z.infer<typeof executionMetadataSchema>;

export type ReasoningStep = z.infer<typeof reasoningStepSchema>;

export type PrioritizedTaskPlan = z.infer<typeof prioritizedPlanSchema>;

export type TaskDependency = PrioritizedTaskPlan['dependencies'][number];

export type ExecutionWave = PrioritizedTaskPlan['execution_waves'][number];

export type ConfidenceScores = PrioritizedTaskPlan['confidence_scores'];

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
}

export interface AgentRuntimeContext {
  outcome: OutcomeContext;
  reflections: ReflectionContext[];
  tasks: TaskSummary[];
  metadata: {
    task_count: number;
    document_count: number;
    reflection_count: number;
  };
}

export interface AgentRunSuccess {
  status: 'completed';
  plan: PrioritizedTaskPlan;
  metadata: ExecutionMetadata;
  trace: ReasoningTraceRecord;
}

export interface AgentRunFailure {
  status: 'failed';
  error: string;
  metadata: ExecutionMetadata;
  trace?: ReasoningTraceRecord;
}

export type AgentRunResult = AgentRunSuccess | AgentRunFailure;
