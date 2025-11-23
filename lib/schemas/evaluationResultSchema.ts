import { z } from 'zod';

const criteriaScoreSchema = z.object({
  score: z
    .number()
    .min(0, 'Criteria score must be at least 0')
    .max(10, 'Criteria score cannot exceed 10'),
  notes: z.string().max(500, 'Criteria notes cannot exceed 500 characters').optional(),
});

export const evaluationResultSchema = z.object({
  status: z.enum(['PASS', 'NEEDS_IMPROVEMENT', 'FAIL']),
  feedback: z
    .string()
    .min(20, 'Feedback must be at least 20 characters')
    .max(2000, 'Feedback cannot exceed 2000 characters'),
  criteria_scores: z.object({
    outcome_alignment: criteriaScoreSchema,
    strategic_coherence: criteriaScoreSchema,
    reflection_integration: criteriaScoreSchema,
    continuity: criteriaScoreSchema,
  }),
  evaluation_duration_ms: z
    .number()
    .int('Evaluation duration must be an integer')
    .min(0, 'Evaluation duration must be non-negative'),
  evaluator_model: z
    .string()
    .min(1, 'Evaluator model is required'),
});

export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
