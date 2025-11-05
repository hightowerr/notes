# Data Model: Context-Aware Dynamic Re-Prioritization

**Feature**: 010-docs-shape-pitches
**Date**: 2025-10-26
**Status**: Draft

## Overview

This feature extends existing entities (Reflection, AgentSession) and introduces new types (AdjustedPlan, AdjustmentDiff) to support instant priority recalculation based on active reflections.

---

## Database Schema Changes

### 1. reflections (Existing Table - Extended)

**Purpose**: Store user-entered context notes with toggle state

**New Columns**:
```sql
ALTER TABLE reflections
ADD COLUMN is_active_for_prioritization BOOLEAN DEFAULT true;

CREATE INDEX idx_reflections_active
ON reflections(user_id, is_active_for_prioritization, created_at DESC);
```

**Complete Schema** (after migration):
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unique reflection identifier |
| user_id | UUID | FK, NOT NULL | User who created reflection |
| text | TEXT | NOT NULL | Reflection content |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| is_active_for_prioritization | BOOLEAN | NOT NULL, DEFAULT true | Toggle state (soft delete) |

**Validation Rules**:
- `text`: 3-500 characters (existing)
- `is_active_for_prioritization`: Toggle-only operation, no delete (FR-017, FR-018)

**State Transitions**:
- Created: `is_active_for_prioritization = true`
- Toggled OFF: `is_active_for_prioritization = false` (row preserved)
- Toggled ON: `is_active_for_prioritization = true`
- Never deleted: Append-only forever (FR-017)

---

### 2. agent_sessions (Existing Table - Extended)

**Purpose**: Store agent execution results with baseline/adjusted plans

**New Columns**:
```sql
ALTER TABLE agent_sessions
ADD COLUMN baseline_plan JSONB,
ADD COLUMN adjusted_plan JSONB;
```

**Baseline Plan Structure** (JSONB):
```typescript
{
  ordered_task_ids: string[],
  confidence_scores: Record<string, number>,
  task_metadata: Record<string, TaskMetadata>,
  dependencies: Dependency[],
  created_at: string // ISO timestamp
}
```

**Adjusted Plan Structure** (JSONB):
```typescript
{
  ordered_task_ids: string[],
  confidence_scores: Record<string, number>,
  diff: {
    moved: Array<{
      task_id: string,
      from: number, // 1-indexed rank
      to: number,   // 1-indexed rank
      reason: string
    }>,
    filtered: Array<{
      task_id: string,
      reason: string
    }>
  },
  adjustment_metadata: {
    reflections: Array<{
      id: string,
      text: string,
      recency_weight: number,
      created_at: string
    }>,
    tasks_moved: number,
    tasks_filtered: number,
    duration_ms: number
  }
}
```

**Validation Rules**:
- `baseline_plan`: Populated after full agent run (POST /api/agent/prioritize)
- `adjusted_plan`: Populated after reflection toggle adjustment
- Both nullable: Sessions before feature deployment have NULL values

---

## TypeScript Types (New)

### lib/types/adjustment.ts

```typescript
import { z } from 'zod';

// Adjustment Diff Schema
export const adjustmentDiffSchema = z.object({
  moved: z.array(z.object({
    task_id: z.string().uuid(),
    from: z.number().int().positive(),
    to: z.number().int().positive(),
    reason: z.string().min(1).max(200),
  })),
  filtered: z.array(z.object({
    task_id: z.string().uuid(),
    reason: z.string().min(1).max(200),
  })),
});

export type AdjustmentDiff = z.infer<typeof adjustmentDiffSchema>;

// Adjustment Metadata Schema
export const adjustmentMetadataSchema = z.object({
  reflections: z.array(z.object({
    id: z.string().uuid(),
    text: z.string().min(1),
    recency_weight: z.number().min(0).max(1),
    created_at: z.string().datetime(),
  })),
  tasks_moved: z.number().int().nonnegative(),
  tasks_filtered: z.number().int().nonnegative(),
  duration_ms: z.number().nonnegative(),
});

export type AdjustmentMetadata = z.infer<typeof adjustmentMetadataSchema>;

// Adjusted Plan Schema
export const adjustedPlanSchema = z.object({
  ordered_task_ids: z.array(z.string().uuid()),
  confidence_scores: z.record(z.string().uuid(), z.number().min(0).max(1)),
  diff: adjustmentDiffSchema,
  adjustment_metadata: adjustmentMetadataSchema,
});

export type AdjustedPlan = z.infer<typeof adjustedPlanSchema>;
```

---

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                         User                                │
│                       (existing)                            │
└────────────┬─────────────────────────────┬──────────────────┘
             │                             │
             │ 1:N                         │ 1:N
             ▼                             ▼
┌────────────────────────┐    ┌───────────────────────────────┐
│     reflections        │    │      agent_sessions           │
│   (extended table)     │    │     (extended table)          │
├────────────────────────┤    ├───────────────────────────────┤
│ + is_active_for_...    │    │ + baseline_plan JSONB         │
│                        │    │ + adjusted_plan JSONB         │
└────────────────────────┘    └───────────────────────────────┘
             │                             ▲
             │ N:M (via active_ids)        │
             │                             │
             └─────────────────────────────┘
                  Adjustment Operation
                (reflections → adjusted_plan)
```

**Key Relationships**:
1. **User → Reflections**: 1:N (one user, many reflections)
2. **User → AgentSessions**: 1:N (one user, many prioritization sessions)
3. **Reflections → AdjustedPlan**: N:M (many reflections influence one adjusted plan)

---

## Data Flow

### Baseline Plan Creation
```
POST /api/agent/prioritize
  ↓
Agent Orchestration Service
  ↓
Stores prioritized_plan + baseline_plan (same data initially)
  ↓
agent_sessions.baseline_plan = { ordered_task_ids, confidence_scores, ... }
```

### Adjustment Flow
```
User toggles reflection
  ↓
POST /api/agent/adjust-priorities { session_id, active_reflection_ids[] }
  ↓
Fetch baseline_plan from agent_sessions
  ↓
Fetch active reflections
  ↓
reflectionBasedRanking service:
  - Get task embeddings
  - Generate reflection embeddings
  - Calculate similarity matrix
  - Apply recency weights
  - Adjust confidence scores
  - Re-sort tasks
  - Generate diff
  ↓
Store adjusted_plan in agent_sessions
  ↓
Return { adjusted_plan, performance }
```

---

## Migration Strategy

**File**: `supabase/migrations/015_add_reflection_toggle.sql`

```sql
-- Step 1: Add toggle column (non-breaking)
ALTER TABLE reflections
ADD COLUMN is_active_for_prioritization BOOLEAN DEFAULT true;

-- Step 2: Add index for fast active reflection queries
CREATE INDEX idx_reflections_active
ON reflections(user_id, is_active_for_prioritization, created_at DESC);

-- Step 3: Add baseline/adjusted plan columns to agent_sessions
ALTER TABLE agent_sessions
ADD COLUMN baseline_plan JSONB,
ADD COLUMN adjusted_plan JSONB;

-- Step 4: Add index for baseline plan staleness checks (created_at in JSONB)
CREATE INDEX idx_agent_sessions_baseline
ON agent_sessions((baseline_plan->>'created_at'))
WHERE baseline_plan IS NOT NULL;
```

**Rollback Plan**:
```sql
-- Safe rollback (data preserved)
DROP INDEX IF EXISTS idx_reflections_active;
DROP INDEX IF EXISTS idx_agent_sessions_baseline;
ALTER TABLE reflections DROP COLUMN is_active_for_prioritization;
ALTER TABLE agent_sessions DROP COLUMN baseline_plan, DROP COLUMN adjusted_plan;
```

**Data Migration**: None required (existing rows default to `is_active=true`, nullable JSONB columns)

---

## Performance Considerations

### Query Patterns

1. **Fetch active reflections** (FR-001):
```sql
SELECT * FROM reflections
WHERE user_id = $1
  AND is_active_for_prioritization = true
ORDER BY created_at DESC
LIMIT 5;
```
**Index**: `idx_reflections_active` (covers user_id, is_active, created_at)

2. **Baseline staleness check** (FR-019):
```sql
SELECT id, (baseline_plan->>'created_at')::timestamptz as baseline_created
FROM agent_sessions
WHERE user_id = $1
  AND baseline_plan IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;
```
**Index**: `idx_agent_sessions_baseline` (partial index on baseline creation time)

### Storage Estimates

- **Reflection toggle column**: 1 byte per row (BOOLEAN)
- **Baseline plan**: ~5-10KB per session (JSON with 20-50 tasks)
- **Adjusted plan**: ~5-10KB per session (similar structure + diff)
- **Total overhead**: ~10-20KB per session, negligible for <1000 sessions/user

---

## Validation & Constraints

### Reflection Schema Updates

```typescript
// lib/schemas/reflectionSchema.ts (extended)
export const reflectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  text: z.string().min(3).max(500),
  created_at: z.string().datetime(),
  is_active_for_prioritization: z.boolean().default(true),
  recency_weight: z.number().min(0).max(1).optional(), // Computed on query
});

export type Reflection = z.infer<typeof reflectionSchema>;
```

### AgentSession Schema Updates

```typescript
// lib/schemas/agentSessionSchema.ts (extended)
export const agentSessionSchema = z.object({
  // ... existing fields ...
  baseline_plan: prioritizedPlanSchema.nullable(),
  adjusted_plan: adjustedPlanSchema.nullable(),
});
```

---

## Edge Cases

1. **No baseline plan exists** (FR-020):
   - Check: `session.baseline_plan === null`
   - Action: Return 400 error "Run analysis first"

2. **Baseline plan stale >24 hours** (FR-019):
   - Check: `Date.now() - baselinePlan.created_at > 24 * 60 * 60 * 1000`
   - Action: Show warning UI, allow adjustment

3. **Baseline plan stale >7 days** (FR-020):
   - Check: `Date.now() - baselinePlan.created_at > 7 * 24 * 60 * 60 * 1000`
   - Action: Block adjustment, return 400 error

4. **All reflections toggled OFF**:
   - Check: `active_reflection_ids.length === 0`
   - Action: Return baseline_plan as adjusted_plan (no modifications)

---

**Status**: Data model complete, ready for contract generation (Phase 1 continued)
