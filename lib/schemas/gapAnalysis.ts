import { z } from 'zod';

export const GapTypeEnum = z.enum(['time', 'action_type', 'skill', 'dependency']);

const TaskIdentifierSchema = z
  .string()
  .min(1, 'Task identifier is required')
  .transform(value => value.trim());

export const GapIndicatorsSchema = z.object({
  time_gap: z.boolean(),
  action_type_jump: z.boolean(),
  no_dependency: z.boolean(),
  skill_jump: z.boolean(),
});

const MIN_GAP_INDICATORS = 2;
const MIN_GAP_CONFIDENCE = 0.6;

export const GapSchema = z
  .object({
    predecessor_id: TaskIdentifierSchema,
    successor_id: TaskIdentifierSchema,
    gap_type: GapTypeEnum,
    confidence: z.number().min(MIN_GAP_CONFIDENCE).max(1),
    indicators: GapIndicatorsSchema,
  })
  .superRefine((gap, ctx) => {
    if (gap.predecessor_id === gap.successor_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'predecessor_id and successor_id must be different',
        path: ['successor_id'],
      });
    }

    const indicatorCount = Object.values(gap.indicators).filter(Boolean).length;
    if (indicatorCount < MIN_GAP_INDICATORS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `At least ${MIN_GAP_INDICATORS} indicators must be true`,
        path: ['indicators'],
      });
    }
  });

export const BridgingTaskSchema = z
  .object({
    text: z.string().min(10).max(200),
    estimated_hours: z.number().min(8).max(160),
    required_cognition: z.enum(['low', 'medium', 'high']),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().min(50).max(300),
    source: z.literal('ai_generated'),
    generated_from: z.object({
      predecessor_id: TaskIdentifierSchema,
      successor_id: TaskIdentifierSchema,
    }),
    requires_review: z.literal(true),
    similarity_score: z.number().min(0).max(0.9),
  })
  .superRefine((task, ctx) => {
    if (task.text.trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'text must contain at least 10 non-whitespace characters',
        path: ['text'],
      });
    }

    if (task.reasoning.trim().length < 50) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reasoning must contain at least 50 non-whitespace characters',
        path: ['reasoning'],
      });
    }
  });

export const TaskSuggestionSchema = z.object({
  id: z.string().uuid(),
  task_text: z.string().min(10).max(200),
  estimated_hours: z.number().min(8).max(160),
  cognition_level: z.enum(['low', 'medium', 'high']),
  confidence_percentage: z.number().int().min(0).max(100),
  checked: z.boolean(),
  edit_mode: z.boolean(),
  gap_context: z.object({
    predecessor_id: TaskIdentifierSchema,
    successor_id: TaskIdentifierSchema,
    gap_type: GapTypeEnum,
  }),
});

export const GapAnalysisSessionSchema = z.object({
  session_id: z.string().uuid(),
  trigger_timestamp: z.string().datetime(),
  plan_snapshot: z.array(
    z.object({
      task_id: TaskIdentifierSchema,
      task_text: z.string(),
      estimated_hours: z.number().optional(),
      depends_on: z.array(TaskIdentifierSchema).optional(),
    })
  ),
  detected_gaps: z.array(GapSchema),
  generated_tasks: z.array(BridgingTaskSchema),
  user_acceptances: z.array(
    z.object({
      task_id: z.string().uuid(),
      accepted: z.boolean(),
      edited: z.boolean(),
      final_text: z.string().min(10).max(200).optional(),
      final_hours: z.number().min(8).max(160).optional(),
    })
  ),
  insertion_result: z.object({
    success: z.boolean(),
    inserted_task_ids: z.array(z.string().uuid()),
    error: z.string().nullable(),
  }),
  performance_metrics: z.object({
    detection_ms: z.number().int().nonnegative(),
    generation_ms: z.number().int().nonnegative(),
    total_ms: z.number().int().nonnegative(),
    search_query_count: z.number().int().nonnegative(),
  }),
});

export type Gap = z.infer<typeof GapSchema>;
export type BridgingTask = z.infer<typeof BridgingTaskSchema>;
export type TaskSuggestion = z.infer<typeof TaskSuggestionSchema>;
export type GapAnalysisSession = z.infer<typeof GapAnalysisSessionSchema>;
