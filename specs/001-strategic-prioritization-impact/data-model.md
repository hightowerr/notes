# Data Model: Strategic Prioritization (Impact-Effort Model)

**Feature Branch**: `001-strategic-prioritization-impact`
**Date**: 2025-11-17
**Status**: Draft

## Overview

This document defines the data structures, database schema changes, and type definitions for strategic task prioritization. All changes are additive (JSONB columns) to maintain backward compatibility.

---

## Database Schema Changes

### 1. agent_sessions Table (MODIFY)

**Add Column**: `strategic_scores` JSONB

Stores Impact, Effort, Confidence, and Priority scores for all tasks in the session.

```sql
-- Migration: 025_add_strategic_scores.sql
ALTER TABLE agent_sessions
ADD COLUMN strategic_scores JSONB DEFAULT '{}';

-- Index for faster lookups
CREATE INDEX idx_agent_sessions_strategic_scores
ON agent_sessions USING GIN (strategic_scores);

-- Example value:
{
  "task-abc-123": {
    "impact": 8.0,
    "effort": 4.0,
    "confidence": 0.85,
    "priority": 100,
    "reasoning": {
      "impact_keywords": ["revenue", "conversion"],
      "effort_source": "extracted",
      "effort_hint": "4h"
    },
    "scored_at": "2025-11-17T14:30:00Z"
  },
  "task-def-456": {
    "impact": 5.0,
    "effort": 16.0,
    "confidence": 0.6,
    "priority": 15,
    "reasoning": {
      "impact_keywords": [],
      "effort_source": "heuristic",
      "complexity_modifiers": ["integrate", "dependency"]
    },
    "scored_at": "2025-11-17T14:30:15Z"
  }
}
```

**Validation Rules**:
- `impact`: 0-10 (float)
- `effort`: 0.5-160 (float, in hours)
- `confidence`: 0-1 (float)
- `priority`: 0-100 (float)
- `reasoning`: Object containing score derivation details
- `scored_at`: ISO 8601 timestamp

---

### 2. task_embeddings Table (MODIFY)

**Add Column**: `manual_overrides` JSONB

Stores user-adjusted Impact and Effort values that override AI estimates.

```sql
-- Migration: 025_add_strategic_scores.sql
ALTER TABLE task_embeddings
ADD COLUMN manual_overrides JSONB DEFAULT NULL;

-- Index for filtering tasks with overrides
CREATE INDEX idx_task_embeddings_manual_overrides
ON task_embeddings ((manual_overrides IS NOT NULL));

-- Example value:
{
  "impact": 7.0,
  "effort": 8.0,
  "reason": "User knows this involves critical payment integration",
  "timestamp": "2025-11-17T15:45:00Z",
  "session_id": "session-xyz-789"
}
```

**Validation Rules**:
- `impact`: 0-10 (float)
- `effort`: 0.5-160 (float, in hours)
- `reason`: Optional string (max 500 chars)
- `timestamp`: ISO 8601 timestamp
- `session_id`: UUID of session when override was created

**Lifecycle**:
- Created when user adjusts Impact or Effort sliders
- Persists across page reloads within same session
- Cleared (`SET NULL`) when agent re-runs prioritization

---

### 3. processing_logs Table (MODIFY - existing)

**Use Existing Columns** for retry tracking:
- `status`: Add new enum value `'retry_exhausted'`
- `metadata`: Store retry attempt details

```sql
-- No migration needed, using existing table
-- Example metadata for failed retry:
{
  "retry_attempts": 3,
  "last_error": "OpenAI API timeout after 10s",
  "failed_at": "2025-11-17T14:35:00Z",
  "task_id": "task-abc-123"
}
```

---

## TypeScript Type Definitions

### Core Types

```typescript
// lib/schemas/strategicScore.ts
import { z } from 'zod'

export const ImpactEstimateSchema = z.object({
  impact: z.number().min(0).max(10),
  reasoning: z.string(),
  keywords: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})
export type ImpactEstimate = z.infer<typeof ImpactEstimateSchema>

export const EffortEstimateSchema = z.object({
  effort: z.number().min(0.5).max(160),
  source: z.enum(['extracted', 'heuristic']),
  hint: z.string().optional(), // Original text if extracted
  complexity_modifiers: z.array(z.string()).optional(),
})
export type EffortEstimate = z.infer<typeof EffortEstimateSchema>

export const StrategicScoreSchema = z.object({
  impact: z.number().min(0).max(10),
  effort: z.number().min(0.5).max(160),
  confidence: z.number().min(0).max(1),
  priority: z.number().min(0).max(100),
  reasoning: z.object({
    impact_keywords: z.array(z.string()),
    effort_source: z.enum(['extracted', 'heuristic']),
    effort_hint: z.string().optional(),
    complexity_modifiers: z.array(z.string()).optional(),
  }),
  scored_at: z.string().datetime(),
})
export type StrategicScore = z.infer<typeof StrategicScoreSchema>

export const StrategicScoresMapSchema = z.record(z.string(), StrategicScoreSchema)
export type StrategicScoresMap = z.infer<typeof StrategicScoresMapSchema>
```

### Manual Override Types

```typescript
// lib/schemas/manualOverride.ts
import { z } from 'zod'

export const ManualOverrideSchema = z.object({
  impact: z.number().min(0).max(10),
  effort: z.number().min(0.5).max(160),
  reason: z.string().max(500).optional(),
  timestamp: z.string().datetime(),
  session_id: z.string().uuid(),
})
export type ManualOverride = z.infer<typeof ManualOverrideSchema>

export const ManualOverrideInputSchema = z.object({
  task_id: z.string(),
  impact: z.number().min(0).max(10).optional(),
  effort: z.number().min(0.5).max(160).optional(),
  reason: z.string().max(500).optional(),
})
export type ManualOverrideInput = z.infer<typeof ManualOverrideInputSchema>
```

### Sorting Strategy Types

```typescript
// lib/schemas/sortingStrategy.ts
import { z } from 'zod'

export const SortingStrategySchema = z.enum([
  'balanced',
  'quick_wins',
  'strategic_bets',
  'urgent',
])
export type SortingStrategy = z.infer<typeof SortingStrategySchema>

export type StrategyConfig = {
  label: string
  description: string
  filter?: (task: TaskWithScores) => boolean
  sort: (a: TaskWithScores, b: TaskWithScores) => number
}

export const STRATEGY_CONFIGS: Record<SortingStrategy, StrategyConfig> = {
  balanced: {
    label: 'Balanced',
    description: 'All tasks sorted by priority score',
    sort: (a, b) => b.priority - a.priority,
  },
  quick_wins: {
    label: 'Quick Wins',
    description: 'Tasks ≤8h effort, sorted by impact × confidence',
    filter: (task) => task.effort <= 8,
    sort: (a, b) => (b.impact * b.confidence) - (a.impact * a.confidence),
  },
  strategic_bets: {
    label: 'Strategic Bets',
    description: 'High-impact (≥7) long-term tasks (>40h)',
    filter: (task) => task.impact >= 7 && task.effort > 40,
    sort: (a, b) => b.impact - a.impact,
  },
  urgent: {
    label: 'Urgent',
    description: 'Tasks with urgent/critical/blocking keywords (2× priority)',
    sort: (a, b) => {
      const aMultiplier = isUrgent(a) ? 2 : 1
      const bMultiplier = isUrgent(b) ? 2 : 1
      return (b.priority * bMultiplier) - (a.priority * aMultiplier)
    },
  },
}

function isUrgent(task: TaskWithScores): boolean {
  const urgentKeywords = /\b(urgent|critical|blocking|blocker)\b/i
  return urgentKeywords.test(task.content)
}
```

### Quadrant Types

```typescript
// lib/schemas/quadrant.ts
import { z } from 'zod'

export const QuadrantSchema = z.enum([
  'high_impact_low_effort',   // Top-left: Green
  'high_impact_high_effort',  // Top-right: Blue
  'low_impact_low_effort',    // Bottom-left: Yellow
  'low_impact_high_effort',   // Bottom-right: Red
])
export type Quadrant = z.infer<typeof QuadrantSchema>

export type QuadrantConfig = {
  label: string
  emoji: string
  color: string
  description: string
}

export const QUADRANT_CONFIGS: Record<Quadrant, QuadrantConfig> = {
  high_impact_low_effort: {
    label: 'Quick Wins',
    emoji: '🌟',
    color: '#10b981', // green-500
    description: 'High impact, low effort - do these first',
  },
  high_impact_high_effort: {
    label: 'Strategic Bets',
    emoji: '🚀',
    color: '#3b82f6', // blue-500
    description: 'High impact, high effort - plan carefully',
  },
  low_impact_low_effort: {
    label: 'Incremental',
    emoji: '⚡',
    color: '#eab308', // yellow-500
    description: 'Low impact, low effort - fill time gaps',
  },
  low_impact_high_effort: {
    label: 'Avoid',
    emoji: '⏸',
    color: '#ef4444', // red-500
    description: 'Low impact, high effort - deprioritize or eliminate',
  },
}

export function getQuadrant(impact: number, effort: number): Quadrant {
  const highImpact = impact >= 5
  const lowEffort = effort <= 8

  if (highImpact && lowEffort) return 'high_impact_low_effort'
  if (highImpact && !lowEffort) return 'high_impact_high_effort'
  if (!highImpact && lowEffort) return 'low_impact_low_effort'
  return 'low_impact_high_effort'
}
```

### Retry Queue Types

```typescript
// lib/services/retryQueue.ts
export type RetryStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type RetryJob = {
  task_id: string
  session_id: string
  estimate_fn: () => Promise<ImpactEstimate>
  attempts: number
  max_attempts: number
  status: RetryStatus
  last_error?: string
  created_at: Date
  updated_at: Date
}

export type RetryQueueState = Map<string, RetryJob>
```

### Component Props Types

```typescript
// app/priorities/components/types.ts
export type TaskWithScores = {
  id: string
  content: string
  impact: number
  effort: number
  confidence: number
  priority: number
  has_manual_override: boolean
  quadrant: Quadrant
  reasoning?: {
    impact_keywords: string[]
    effort_source: 'extracted' | 'heuristic'
    effort_hint?: string
  }
}

export type QuadrantVizProps = {
  tasks: TaskWithScores[]
  onTaskClick: (taskId: string) => void
  clusterThreshold?: {
    impact: number  // default: 0.5
    effortPercent: number  // default: 0.2 (20%)
  }
}

export type ScoreBreakdownModalProps = {
  task: TaskWithScores
  open: boolean
  onOpenChange: (open: boolean) => void
}

export type ManualOverrideControlsProps = {
  task: TaskWithScores
  onUpdate: (override: ManualOverrideInput) => Promise<void>
}
```

---

## API Request/Response Types

### POST /api/agent/prioritize (MODIFY)

**Request** (unchanged):
```typescript
{
  outcome_id?: string
}
```

**Response** (ADD strategic_scores):
```typescript
{
  session_id: string
  prioritized_tasks: Array<{
    id: string
    content: string
    semantic_similarity: number
    impact: number           // NEW
    effort: number           // NEW
    confidence: number       // NEW
    priority: number         // NEW
    quadrant: Quadrant       // NEW
  }>
  reasoning_trace: string
  strategic_scores: StrategicScoresMap  // NEW
}
```

### GET /api/tasks/metadata

**New endpoint** for polling retry queue status and fetching scores.

**Query Params**:
```typescript
{
  session_id?: string  // Filter by session
  status?: 'all' | 'retry' | 'failed'  // Filter by retry status
}
```

**Response**:
```typescript
{
  scores: Record<task_id, StrategicScore>
  retry_status: Record<task_id, {
    status: RetryStatus
    attempts: number
    last_error?: string
  }>
}
```

### PATCH /api/tasks/{id}/override

**New endpoint** for saving manual overrides.

**Request**:
```typescript
{
  impact?: number  // 0-10
  effort?: number  // 0.5-160
  reason?: string  // max 500 chars
}
```

**Response**:
```typescript
{
  task_id: string
  override: ManualOverride
  updated_priority: number
}
```

---

## Data Flow Diagrams

### 1. Strategic Scoring Flow

```
User triggers prioritization
    ↓
POST /api/agent/prioritize
    ↓
lib/services/strategicScoring.ts
    ├─→ For each task:
    │   ├─→ estimateImpact() [LLM + heuristics]
    │   │   └─→ If fails: enqueue in retryQueue
    │   ├─→ estimateEffort() [text extraction + heuristic]
    │   └─→ calculateConfidence() [similarity + deps]
    │
    ├─→ calculatePriority() for all tasks
    └─→ Bulk upsert to agent_sessions.strategic_scores
        ↓
Return response with scores
    ↓
UI displays tasks with Impact/Effort/Priority
```

### 2. Async Retry Flow

```
LLM call fails during initial scoring
    ↓
RetryQueue.enqueue(task_id, estimate_fn)
    ↓
Background: exponential backoff (1s, 2s, 4s)
    ↓
    ├─→ Success: Update agent_sessions.strategic_scores
    │            Emit event for UI polling
    │
    └─→ Max retries exhausted: Mark in processing_logs
                                Show "Scores unavailable" in UI
```

### 3. Manual Override Flow

```
User adjusts Impact slider
    ↓
Optimistic UI update (instant)
    ↓
Debounced (500ms) PATCH /api/tasks/{id}/override
    ↓
Update task_embeddings.manual_overrides
    ↓
Recalculate priority (override values + AI confidence)
    ↓
Return updated_priority
    ↓
UI confirms save (checkmark animation)
```

### 4. Quadrant Clustering Flow

```
Render QuadrantViz component
    ↓
For each task:
    ├─→ Calculate (impact, effort) coordinates
    └─→ Check if within threshold of existing cluster
        ├─→ Yes: Add to cluster
        └─→ No: Create new cluster
            ↓
Render clustered bubbles
    ↓
User clicks cluster bubble
    ↓
Expand to show all tasks in cluster (dropdown)
```

---

## State Transitions

### Task Scoring Status

```
[unscored] → [scoring] → [completed]
                ↓
            [retry_pending] → [retry_in_progress] → [completed]
                                     ↓
                                [retry_exhausted]
```

### Manual Override Status

```
[no_override] → [override_pending] → [override_saved]
                                          ↓
                               [cleared_on_rerun]
```

---

## Validation Rules Summary

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `impact` | float | 0-10 | Required |
| `effort` | float | 0.5-160 | Required |
| `confidence` | float | 0-1 | Required |
| `priority` | float | 0-100 | Calculated |
| `manual_overrides.reason` | string | max 500 chars | Optional |
| `retry_attempts` | integer | 0-3 | 0 |
| `scored_at` | datetime | ISO 8601 | Now |

---

## Migration Rollback Plan

```sql
-- Rollback: Remove added columns
ALTER TABLE agent_sessions DROP COLUMN IF EXISTS strategic_scores;
ALTER TABLE task_embeddings DROP COLUMN IF EXISTS manual_overrides;

-- Drop indexes
DROP INDEX IF EXISTS idx_agent_sessions_strategic_scores;
DROP INDEX IF EXISTS idx_task_embeddings_manual_overrides;
```

**Impact**: No data loss for existing features. Strategic prioritization UI will fall back to semantic-only sorting.

---

## Performance Considerations

### Index Strategy
- GIN index on `agent_sessions.strategic_scores` for JSONB queries
- Partial index on `task_embeddings.manual_overrides IS NOT NULL` for filtering

### Query Optimization
- Batch fetch all scores in single query (avoid N+1)
- Use JSONB operators (`->`, `->>`) for filtering by score thresholds

### Storage Estimates
- Strategic scores: ~500 bytes per task × 1000 tasks = 500KB per session
- Manual overrides: ~200 bytes per task × 200 overrides = 40KB per session
- Total: <1MB additional per session (negligible)

---

## Summary

This data model adds strategic scoring capabilities with minimal schema changes (2 JSONB columns). All changes are backward-compatible, performance-optimized, and fully typed with Zod schemas. The retry queue enables graceful degradation for LLM failures, and manual overrides provide user control while maintaining AI alignment through reset-on-rerun.

**Next Steps**: Generate API contracts in Phase 1.
