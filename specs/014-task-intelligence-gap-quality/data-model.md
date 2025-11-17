# Data Model: Task Intelligence (Gap & Quality Detection)

**Feature Branch**: `014-task-intelligence-gap-quality`
**Created**: 2025-01-13

## Overview

This feature extends existing tables (`task_embeddings`, `agent_sessions`) to support goal coverage analysis, task quality evaluation, and draft task generation. No new tables required—leverages JSONB columns for schema flexibility.

## Database Schema Changes

### 1. task_embeddings Table Extension

**Migration**: `025_add_quality_metadata_to_task_embeddings.sql`

```sql
-- Add quality metadata column to task_embeddings table
-- Stores clarity scores, quality indicators, and improvement suggestions
ALTER TABLE task_embeddings
  ADD COLUMN IF NOT EXISTS quality_metadata JSONB DEFAULT '{}'::jsonb;

-- Create GIN index for fast quality score filtering
CREATE INDEX IF NOT EXISTS idx_task_embeddings_quality_metadata
  ON task_embeddings
  USING gin (quality_metadata);

-- Create partial index for tasks needing review (clarity_score < 0.5)
CREATE INDEX IF NOT EXISTS idx_task_embeddings_needs_work
  ON task_embeddings ((quality_metadata->>'clarity_score'))
  WHERE (quality_metadata->>'clarity_score')::numeric < 0.5;
```

**quality_metadata Schema**:

```typescript
{
  clarity_score: number;              // 0.0-1.0 overall quality score
  verb_strength: 'strong' | 'weak';   // Action verb quality
  specificity_indicators: {
    has_metrics: boolean;             // Contains numbers/measurable criteria
    has_acceptance_criteria: boolean; // Has explicit success conditions
    contains_numbers: boolean;        // Numeric values present
  };
  granularity_flags: {
    estimated_size: 'small' | 'medium' | 'large'; // Task scope estimate
    is_atomic: boolean;                           // Can't be meaningfully split
  };
  improvement_suggestions: string[];  // AI-generated refinement actions
  calculated_at: string;              // ISO timestamp of last calculation
  calculation_method: 'ai' | 'heuristic'; // How score was derived
}
```

**Example**:

```json
{
  "clarity_score": 0.85,
  "verb_strength": "strong",
  "specificity_indicators": {
    "has_metrics": true,
    "has_acceptance_criteria": false,
    "contains_numbers": true
  },
  "granularity_flags": {
    "estimated_size": "small",
    "is_atomic": true
  },
  "improvement_suggestions": [
    "Add acceptance criteria: 'Checkout completes in <3s on 4G'",
    "Split into 2 sub-tasks if scope grows beyond 8 hours"
  ],
  "calculated_at": "2025-01-13T14:30:00Z",
  "calculation_method": "ai"
}
```

### 2. agent_sessions Table Extension

**Existing Column**: `result JSONB` (added in migration 022)

**New Sub-Schema**: `result.coverage_analysis`

```typescript
result: {
  coverage_analysis?: {
    coverage_percentage: number;        // 0-100 semantic coverage score
    missing_areas: string[];            // Conceptual gaps (e.g., ["pricing experiments", "upsell flow"])
    goal_embedding: number[];           // 1536-dim outcome embedding (cached)
    task_cluster_centroid: number[];    // Average of all task embeddings
    analysis_timestamp: string;         // ISO timestamp
    task_count: number;                 // Number of tasks analyzed
    threshold_used: number;             // Similarity threshold (typically 0.7)
  };
  quality_summary?: {
    average_clarity: number;            // Mean clarity score across all tasks
    high_quality_count: number;         // Tasks with score ≥0.8
    needs_review_count: number;         // Tasks with score 0.5-0.8
    needs_work_count: number;           // Tasks with score <0.5
    analyzed_at: string;                // ISO timestamp
  };
  draft_tasks?: {
    session_id: string;                 // UUID for this generation session
    generated: DraftTask[];             // AI-suggested tasks
    accepted: string[];                 // IDs of accepted drafts
    dismissed: string[];                // IDs of dismissed drafts (persist in session)
    generated_at: string;               // ISO timestamp
  };
  gap_analysis?: {
    // Phase 5 dependency gaps (existing schema, preserved)
  };
}
```

**DraftTask Schema**:

```typescript
{
  id: string;                   // UUID for draft task
  task_text: string;            // Draft task description
  estimated_hours: number;      // 0.25-8.0 hour estimate
  cognition_level: 'low' | 'medium' | 'high';
  reasoning: string;            // Why this task fills the gap
  gap_area: string;             // Missing concept addressed (e.g., "pricing experiments")
  confidence_score: number;     // 0.0-1.0 AI confidence
  source: 'phase10_semantic' | 'phase5_dependency'; // Source system (FR-026)
  embedding: number[];          // 1536-dim vector for deduplication (FR-027)
  deduplication_hash: string;   // SHA-256 of normalized task text
}
```

**Example**:

```json
{
  "result": {
    "coverage_analysis": {
      "coverage_percentage": 72,
      "missing_areas": ["pricing experiments", "upsell flow"],
      "goal_embedding": [0.023, -0.015, ...],  // 1536 dimensions
      "task_cluster_centroid": [0.018, -0.012, ...],
      "analysis_timestamp": "2025-01-13T14:30:00Z",
      "task_count": 15,
      "threshold_used": 0.7
    },
    "quality_summary": {
      "average_clarity": 0.68,
      "high_quality_count": 5,
      "needs_review_count": 7,
      "needs_work_count": 3,
      "analyzed_at": "2025-01-13T14:30:05Z"
    },
    "draft_tasks": {
      "session_id": "550e8400-e29b-41d4-a716-446655440000",
      "generated": [
        {
          "id": "draft-001",
          "task_text": "Run pricing A/B test: $49 vs $59 tier for SMB segment",
          "estimated_hours": 4.0,
          "cognition_level": "medium",
          "reasoning": "Addresses gap in 'pricing experiments' - outcome mentions 25% ARR increase, pricing optimization is key lever",
          "gap_area": "pricing experiments",
          "confidence_score": 0.85,
          "source": "phase10_semantic",
          "embedding": [0.034, -0.021, ...],
          "deduplication_hash": "a3f5b2c..."
        }
      ],
      "accepted": ["draft-001"],
      "dismissed": [],
      "generated_at": "2025-01-13T14:30:10Z"
    }
  }
}
```

## TypeScript Types & Zod Schemas

**Location**: `lib/schemas/taskIntelligence.ts` (new file)

```typescript
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
```

## Service Layer Interfaces

**Location**: `lib/services/taskIntelligence.ts` (new file)

```typescript
export interface CoverageAnalysisInput {
  outcomeText: string;
  taskIds: string[];
  threshold?: number; // Default 0.7
}

export interface CoverageAnalysisOutput {
  coverage_percentage: number;
  missing_areas: string[];
  should_generate_drafts: boolean; // true if coverage <70%
}

export interface QualityEvaluationInput {
  taskId: string;
  taskText: string;
  forceHeuristic?: boolean; // Skip AI, use fallback
}

export interface QualityEvaluationOutput {
  clarity_score: number;
  badge_color: 'green' | 'yellow' | 'red'; // 🟢🟡🔴
  badge_label: 'Clear' | 'Review' | 'Needs Work';
  quality_metadata: QualityMetadata;
}

export interface DraftTaskGenerationInput {
  outcomeText: string;
  missingAreas: string[];
  existingTaskTexts: string[];
  maxDraftsPerArea?: number; // Default 3
}

export interface DraftTaskGenerationOutput {
  drafts: DraftTask[];
  generation_duration_ms: number;
}

export interface QualityRefinementInput {
  taskId: string;
  taskText: string;
  qualityIssues: string[]; // From improvement_suggestions
}

export interface QualityRefinementOutput {
  suggestions: {
    action: 'split' | 'merge' | 'rephrase';
    new_task_texts: string[];
    reasoning: string;
  }[];
}
```

## Data Flow Diagrams

### 1. Coverage Analysis Flow

```
User triggers prioritization
  ↓
API: POST /api/agent/prioritize
  ↓
Load outcome + task embeddings from DB
  ↓
Calculate task cluster centroid (avg embedding)
  ↓
Cosine similarity: outcome ↔ centroid
  ↓
Coverage percentage: similarity × 100
  ↓
If <70%: Extract missing concepts via GPT-4o-mini
  ↓
Store in agent_sessions.result.coverage_analysis
  ↓
Return to UI: { coverage_percentage, missing_areas }
  ↓
UI renders coverage bar + auto-opens modal if <70%
```

### 2. Quality Evaluation Flow

```
Task created/edited
  ↓
Debounce 300ms (rapid edit protection)
  ↓
Background job: Evaluate quality
  ↓
Try AI evaluation (GPT-4o-mini)
  ↓
If AI fails (timeout/rate limit):
  → Retry once (2s delay)
  → If still fails: Fallback to heuristics
  ↓
Calculate clarity_score + metadata
  ↓
Store in task_embeddings.quality_metadata
  ↓
Return to UI: { badge_color, badge_label }
  ↓
UI updates quality badge with pulsing animation
```

### 3. Draft Task Generation + Deduplication Flow

```
User clicks "Generate Draft Tasks"
  ↓
API: POST /api/agent/suggest-quality-gaps
  ↓
Input: missing_areas from coverage analysis
  ↓
For each missing area:
  → GPT-4o-mini generates max 3 draft tasks
  → Generate embedding for each draft
  → Calculate deduplication_hash
  ↓
Check Phase 5 dependency gaps (if any)
  ↓
For each P5 draft:
  → Compare embedding similarity to all P10 drafts
  → If similarity >0.85: suppress P5 draft (FR-027)
  ↓
Store surviving drafts in agent_sessions.result.draft_tasks
  ↓
Return to UI: { drafts: [...P10, ...P5_deduped] }
  ↓
UI renders Gap Detection Modal with labels
```

## Indexing Strategy

### Performance Requirements

- **Coverage analysis**: <3s for 50 tasks (FR-012)
- **Quality badge render**: <500ms per page load (SC-007)
- **Real-time recalculation**: <500ms for single task edit (SC-009)

### Indexes Created

1. **task_embeddings.quality_metadata (GIN)**
   - Enables fast filtering by quality score
   - Use case: `WHERE (quality_metadata->>'clarity_score')::numeric < 0.5`

2. **task_embeddings.needs_work (Partial)**
   - Indexes only tasks with clarity_score <0.5
   - Smaller index size, faster scans for "Needs Work" badge queries

3. **agent_sessions.result (GIN)**
   - Existing index on `result -> 'gap_analysis'` (migration 022)
   - Supports both Phase 5 and Phase 10 JSONB queries

## Migration Checklist

- [ ] Create migration 025: Add `quality_metadata JSONB` to `task_embeddings`
- [ ] Create GIN index on `quality_metadata`
- [ ] Create partial index on `clarity_score <0.5`
- [ ] Test index performance with 1000+ tasks
- [ ] Verify backward compatibility with Phase 5 gap analysis
- [ ] Add Zod schemas to `lib/schemas/taskIntelligence.ts`
- [ ] Create service layer in `lib/services/taskIntelligence.ts`

## Backward Compatibility

### Phase 5 Gap Filling

- `agent_sessions.result.gap_analysis` preserved
- Phase 10 uses `result.coverage_analysis` and `result.draft_tasks`
- Both schemas coexist in same `result` JSONB field
- Deduplication logic prevents conflicts (FR-027)

### Existing Quality Checks

- No breaking changes to `aiSummarizer.ts` confidence scoring
- Phase 10 quality scores are additive, not replacement
- Existing `review_required` flag unaffected

## Next Steps

1. **API Contracts**: Define endpoint schemas in `contracts/` directory
2. **Quickstart Guide**: User journey walkthrough
3. **Task Breakdown**: Vertical slice task list in `tasks.md`
