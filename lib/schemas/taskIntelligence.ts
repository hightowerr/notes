import { z } from 'zod';

// Quality Metadata Schemas
export const VerbStrengthEnum = z.enum(['strong', 'weak']);

export const SpecificityIndicatorsSchema = z.object({
  has_metrics: z.boolean(),
  has_acceptance_criteria: z.boolean(),
  contains_numbers: z.boolean(),
});

export const GranularityFlagsSchema = z.object({
  estimated_size: z.enum(['small', 'medium', 'large']),
  is_atomic: z.boolean(),
});

export const QualityMetadataSchema = z.object({
  clarity_score: z.number().min(0).max(1),
  verb_strength: VerbStrengthEnum,
  specificity_indicators: SpecificityIndicatorsSchema,
  granularity_flags: GranularityFlagsSchema,
  improvement_suggestions: z.array(z.string()),
  calculated_at: z.string().datetime(),
  calculation_method: z.enum(['ai', 'heuristic']),
});

// Coverage Analysis Schemas
export const CoverageAnalysisSchema = z.object({
  coverage_percentage: z.number().int().min(0).max(100),
  missing_areas: z.array(z.string()),
  goal_embedding: z.array(z.number()).length(1536),
  task_cluster_centroid: z.array(z.number()).length(1536),
  analysis_timestamp: z.string().datetime(),
  task_count: z.number().int().min(0),
  threshold_used: z.number().min(0).max(1),
});

// Quality Summary Schemas
export const QualitySummarySchema = z.object({
  average_clarity: z.number().min(0).max(1),
  high_quality_count: z.number().int().min(0),
  needs_review_count: z.number().int().min(0),
  needs_work_count: z.number().int().min(0),
  analyzed_at: z.string().datetime(),
});

// Draft Task Schemas
export const DraftTaskSourceEnum = z.enum(['phase10_semantic', 'phase5_dependency']);

export const DraftTaskSchema = z.object({
  id: z.string().uuid(),
  task_text: z.string().min(10).max(200),
  estimated_hours: z.number().min(0.25).max(8.0),
  cognition_level: z.enum(['low', 'medium', 'high']),
  reasoning: z.string().min(50).max(300),
  gap_area: z.string().min(1),
  confidence_score: z.number().min(0).max(1),
  source: DraftTaskSourceEnum,
  source_label: z.enum(['🎯 Semantic Gap', '🔗 Dependency Gap']),
  embedding: z.array(z.number()).length(1536),
  deduplication_hash: z.string().regex(/^[a-f0-9]{64}$/), // SHA-256 hex
});

export const DraftTasksSessionSchema = z.object({
  session_id: z.string().uuid(),
  generated: z.array(DraftTaskSchema),
  accepted: z.array(z.string().uuid()),
  dismissed: z.array(z.string().uuid()),
  generated_at: z.string().datetime(),
});

// Agent Session Result Extension
export const AgentSessionResultSchema = z.object({
  coverage_analysis: CoverageAnalysisSchema.optional(),
  quality_summary: QualitySummarySchema.optional(),
  draft_tasks: DraftTasksSessionSchema.optional(),
  gap_analysis: z.any().optional(), // Phase 5 schema (preserve compatibility)
});

// Type exports
export type QualityMetadata = z.infer<typeof QualityMetadataSchema>;
export type CoverageAnalysis = z.infer<typeof CoverageAnalysisSchema>;
export type QualitySummary = z.infer<typeof QualitySummarySchema>;
export type DraftTask = z.infer<typeof DraftTaskSchema>;
export type DraftTasksSession = z.infer<typeof DraftTasksSessionSchema>;
export type AgentSessionResult = z.infer<typeof AgentSessionResultSchema>;
