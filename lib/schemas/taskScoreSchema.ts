import { z } from 'zod';

const GENERIC_BRIEF_REASON_PATTERNS = [
  /^(important|critical|high priority)$/i,
  /^this is (important|critical|urgent)$/i,
];

export const BriefReasoningSchema = z
  .string()
  .min(5, 'Brief reasoning must be at least 5 characters')
  .max(150, 'Brief reasoning must be at most 150 characters')
  .refine(
    value => value.trim().split(/\s+/).length <= 20,
    'Brief reasoning must be at most 20 words'
  )
  .refine(
    value => !GENERIC_BRIEF_REASON_PATTERNS.some(pattern => pattern.test(value.trim())),
    'Brief reasoning must be specific, not generic phrases like "important"'
  );

// Allow structured reasoning payloads for richer UI (impact keywords, effort hints, etc.)
const reasoningDetailSchema = z
  .object({
    impact_keywords: z.array(z.string()).optional(),
    effort_source: z.string().optional(),
    effort_hint: z.string().optional(),
    complexity_modifiers: z.array(z.string()).optional(),
    reasoning: z.string().optional(),
  })
  .passthrough();

const reasoningSchema = z.union([
  z
    .string()
    .min(10, 'Reasoning must be at least 10 characters')
    .max(500, 'Reasoning cannot exceed 500 characters'),
  reasoningDetailSchema,
]);

// Task IDs can be UUIDs or SHA-256 hashes (64-char hex strings)
// The database uses TEXT for task_id, so we accept any non-empty string
export const taskScoreSchema = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  impact: z
    .number()
    .min(0, 'Impact must be at least 0')
    .max(10, 'Impact cannot exceed 10'),
  effort: z
    .number()
    .min(0.5, 'Effort must be at least 0.5 hours')
    .max(160, 'Effort cannot exceed 160 hours'),
  confidence: z
    .number()
    .min(0, 'Confidence must be at least 0')
    .max(1, 'Confidence cannot exceed 1'),
  reasoning: reasoningSchema,
  brief_reasoning: BriefReasoningSchema,
  dependencies: z.array(z.string().min(1)).optional(),
  reflection_influence: z
    .string()
    .max(300, 'Reflection influence cannot exceed 300 characters')
    .optional(),
});

export type TaskScore = z.infer<typeof taskScoreSchema>;
export type BriefReasoning = z.infer<typeof BriefReasoningSchema>;
