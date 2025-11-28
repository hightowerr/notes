# Data Model: Manual Task Creation (Phase 18)

**Feature**: 016-manual-task-creation
**Date**: 2025-01-26

## Overview

Phase 18 builds on Phase 9's manual task infrastructure by adding agent-driven placement and discard pile management. The core data model remains the same (`task_embeddings` with `is_manual` flag), with new migration for placement analysis results.

## Database Entities

### NEW: manual_tasks Table

**Purpose**: Stores manual task-specific metadata separate from task_embeddings

**Schema**:
```sql
CREATE TABLE manual_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id TEXT NOT NULL UNIQUE REFERENCES task_embeddings(task_id) ON DELETE CASCADE,

  -- Analysis state
  status TEXT NOT NULL DEFAULT 'analyzing' CHECK (status IN ('analyzing', 'prioritized', 'not_relevant', 'conflict')),
  agent_rank INTEGER,                    -- Position in priority list (1-indexed)
  placement_reason TEXT,                  -- Why agent included this task
  exclusion_reason TEXT,                  -- Why agent rejected this task

  -- Conflict details (duplicate detection)
  duplicate_task_id TEXT,                 -- ID of similar existing task
  similarity_score FLOAT,                 -- 0.0-1.0 similarity metric

  -- User actions
  marked_done_at TIMESTAMPTZ,             -- When user completed task
  deleted_at TIMESTAMPTZ,                 -- Soft delete timestamp

  -- Metadata
  outcome_id UUID REFERENCES user_outcomes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_manual_tasks_status ON manual_tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_manual_tasks_outcome ON manual_tasks(outcome_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_manual_tasks_created ON manual_tasks(created_at DESC);
```

**Key Relationships**:
- `task_id` → `task_embeddings.task_id` (ON DELETE CASCADE)
  - Links to core task storage
  - Inherits embedding, task_text, document_id
- `outcome_id` → `user_outcomes.id` (ON DELETE SET NULL)
  - Associates task with user goal
  - NULL outcome = no agent analysis yet

**Status State Machine**:
```
analyzing     → Initial state when task created
  ↓
  ├─→ prioritized    (agent included, agent_rank set)
  ├─→ not_relevant   (agent excluded, exclusion_reason set)
  └─→ conflict       (duplicate detected, duplicate_task_id set)
```

### EXTENDED: task_embeddings (from Phase 9)

**Existing columns used**:
```
task_id: TEXT NOT NULL UNIQUE
task_text: TEXT NOT NULL
embedding: vector(1536) NOT NULL
is_manual: BOOLEAN DEFAULT FALSE      -- Phase 9 addition
created_by: TEXT DEFAULT 'default-user' -- Phase 9 addition
```

**No schema changes needed** - manual_tasks table extends via foreign key.

## Runtime Entities (TypeScript)

### ManualTaskAnalysisResult

**Purpose**: Agent placement analysis output

**Type Definition**:
```typescript
type ManualTaskAnalysisResult = {
  status: 'prioritized' | 'not_relevant' | 'conflict';
  rank?: number;                  // 1-indexed position if prioritized
  placementReason?: string;       // Why included
  exclusionReason?: string;       // Why excluded
  conflictDetails?: {
    duplicateTaskId: string;
    similarityScore: number;
    existingTaskText: string;
  };
};
```

**Usage**: Returned from `analyzeManualTask()` service function.

### DiscardPileTask

**Purpose**: Client-side representation of not_relevant manual tasks

**Type Definition**:
```typescript
type DiscardPileTask = {
  taskId: string;
  taskText: string;
  exclusionReason: string;
  createdAt: string;
  isManual: boolean;              // Always true for this feature
};
```

**Lifecycle**:
1. Query `manual_tasks` WHERE `status = 'not_relevant'` AND `deleted_at IS NULL`
2. Join with `task_embeddings` to get `task_text`
3. Map to DiscardPileTask for UI display
4. Render in `DiscardPileSection.tsx` component

### ManualTaskPlacementBadge

**Purpose**: UI state indicator for manual task analysis

**Type Definition**:
```typescript
type PlacementBadgeState =
  | { type: 'analyzing' }
  | { type: 'manual', rank: number }
  | { type: 'conflict', existingTaskId: string }
  | { type: 'error', message: string };
```

**Display Logic**:
```typescript
function getBadgeContent(state: PlacementBadgeState): string {
  switch (state.type) {
    case 'analyzing': return '⏳ Analyzing...';
    case 'manual': return '✋ Manual';
    case 'conflict': return '⚠️ Duplicate';
    case 'error': return '❌ Error';
  }
}
```

## Data Flow Diagrams

### Manual Task Creation with Agent Placement

```
User Submits Task
  ↓
POST /api/tasks/manual
  ↓ [1] Validate input (Zod)
  ↓ [2] Generate embedding (OpenAI)
  ↓ [3] Check duplicates (>0.85 similarity)
  ↓     ├─→ Duplicate found → Return conflict
  ↓     └─→ No duplicate → Continue
  ↓ [4] Insert task_embeddings (is_manual=true)
  ↓ [5] Insert manual_tasks (status='analyzing')
  ↓ [6] Return task_id
  ↓
Background Agent Analysis (async)
  ↓ [7] Check for active outcome
  ↓     ├─→ No outcome → Keep status='analyzing'
  ↓     └─→ Has outcome → Send to agent
  ↓ [8] Agent evaluates task
  ↓     ├─→ Relevant → status='prioritized', agent_rank set
  ↓     └─→ Not relevant → status='not_relevant', exclusion_reason set
  ↓ [9] Update manual_tasks row
  ↓
UI Polling/WebSocket
  ↓ [10] Client polls GET /api/tasks/manual/[id]/status
  ↓ [11] Badge updates: "Analyzing..." → "✋ Manual"
  ↓ [12] Task moves to final position in list
```

### Discard Pile Override Flow

```
User Clicks "Override" on Discarded Task
  ↓
POST /api/tasks/manual/[id]/override
  ↓ [1] Load manual_tasks row
  ↓ [2] Verify status='not_relevant'
  ↓ [3] Set status='analyzing'
  ↓ [4] Optional: user_justification saved to metadata
  ↓ [5] Return success
  ↓
Re-analysis (same as background flow)
  ↓ [6] Send to agent with user justification
  ↓ [7] Agent re-evaluates
  ↓     ├─→ Still not relevant → status='not_relevant' (with note)
  ↓     └─→ Now relevant → status='prioritized'
  ↓ [8] Update manual_tasks
  ↓
UI Update
  ↓ [9] If prioritized: Remove from discard pile, add to active list
  ↓ [10] If still excluded: Show toast "Agent still recommends excluding"
```

### Goal Change Invalidation Flow

```
User Changes Outcome
  ↓
PATCH /api/outcomes/[id]
  ↓ [1] Update user_outcomes row
  ↓ [2] Trigger invalidation hook
  ↓
Invalidate Manual Tasks
  ↓ [3] UPDATE manual_tasks
  ↓     SET status = 'not_relevant',
  ↓         exclusion_reason = 'Goal changed - manual tasks invalidated'
  ↓     WHERE status = 'prioritized'
  ↓       AND outcome_id = old_outcome_id
  ↓ [4] Count affected tasks
  ↓ [5] Return count
  ↓
UI Notification
  ↓ [6] Toast: "Goal changed. X manual tasks moved to Discard Pile"
  ↓ [7] Expand discard pile section
  ↓ [8] User can review and override individually
```

## Validation Rules

### Manual Task Creation Input

**Schema** (from Phase 9, unchanged):
```typescript
const manualTaskInputSchema = z.object({
  task_text: z.string().min(1).max(500).trim(),
  estimated_hours: z.number().int().min(8).max(160).optional().default(40),
  outcome_id: z.string().uuid().optional(),
});
```

**New Phase 18 validation**: Check if outcome exists before analysis:
```typescript
// In POST /api/tasks/manual route
if (outcome_id) {
  const { data: outcome } = await supabase
    .from('user_outcomes')
    .select('id')
    .eq('id', outcome_id)
    .is('completed_at', null)
    .single();

  if (!outcome) {
    return NextResponse.json(
      { error: 'Outcome not found or completed', code: 'INVALID_OUTCOME' },
      { status: 400 }
    );
  }
}
```

### Agent Placement Response

**Expected Output** (from prioritization agent):
```json
{
  "thoughts": {
    "task_analysis": "Manual task 'Email legal about contract' directly enables V6 integration",
    "alignment_score": 8,
    "effort_estimate": 2
  },
  "decision": "include",
  "rank": 2,
  "placement_reason": "Unblocks payment integration development",
  "confidence": 0.85
}
```

**Fallback** if agent returns unexpected format:
```typescript
// Default to not_relevant with low confidence
const fallbackResult: ManualTaskAnalysisResult = {
  status: 'not_relevant',
  exclusionReason: 'Agent analysis failed - default exclusion (confidence: 0.2)',
};
```

## Query Patterns

### Fetch Active Manual Tasks

```sql
SELECT
  mt.task_id,
  te.task_text,
  mt.agent_rank,
  mt.placement_reason,
  te.created_at
FROM manual_tasks mt
JOIN task_embeddings te ON mt.task_id = te.task_id
WHERE mt.status = 'prioritized'
  AND mt.deleted_at IS NULL
ORDER BY mt.agent_rank ASC;
```

**Performance**: Uses `idx_manual_tasks_status` partial index.

### Fetch Discard Pile

```sql
SELECT
  mt.task_id,
  te.task_text,
  mt.exclusion_reason,
  mt.created_at
FROM manual_tasks mt
JOIN task_embeddings te ON mt.task_id = te.task_id
WHERE mt.status = 'not_relevant'
  AND mt.deleted_at IS NULL
ORDER BY mt.created_at DESC;
```

**Performance**: Same index, <50ms for 100+ tasks.

### Count Manual Tasks by Status

```sql
SELECT
  status,
  COUNT(*) as count
FROM manual_tasks
WHERE deleted_at IS NULL
GROUP BY status;
```

**Use case**: Dashboard metrics, discard pile count badge.

## Migration Strategy

### Migration 029: Create manual_tasks Table

**File**: `supabase/migrations/029_create_manual_tasks.sql`

**Approach**: Non-blocking (no existing data to migrate)

```sql
-- Create table
CREATE TABLE IF NOT EXISTS manual_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'analyzing' CHECK (status IN ('analyzing', 'prioritized', 'not_relevant', 'conflict')),
  agent_rank INTEGER,
  placement_reason TEXT,
  exclusion_reason TEXT,
  duplicate_task_id TEXT,
  similarity_score FLOAT,
  marked_done_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  outcome_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Foreign key to task_embeddings
  CONSTRAINT fk_manual_tasks_task_id
    FOREIGN KEY (task_id)
    REFERENCES task_embeddings(task_id)
    ON DELETE CASCADE,

  -- Foreign key to user_outcomes
  CONSTRAINT fk_manual_tasks_outcome_id
    FOREIGN KEY (outcome_id)
    REFERENCES user_outcomes(id)
    ON DELETE SET NULL
);

-- Indexes
CREATE INDEX idx_manual_tasks_status
  ON manual_tasks(status)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_manual_tasks_outcome
  ON manual_tasks(outcome_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_manual_tasks_created
  ON manual_tasks(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_manual_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manual_tasks_updated_at
  BEFORE UPDATE ON manual_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_manual_tasks_updated_at();
```

**Rollback**:
```sql
DROP TRIGGER IF EXISTS trigger_manual_tasks_updated_at ON manual_tasks;
DROP FUNCTION IF EXISTS update_manual_tasks_updated_at();
DROP TABLE IF EXISTS manual_tasks CASCADE;
```

**No data backfill needed** - new table for new feature.

## State Management Patterns

### Optimistic UI for Agent Placement

```typescript
// Component state in ManualTaskModal
const [submitting, setSubmitting] = useState(false);
const [tempTaskId, setTempTaskId] = useState<string | null>(null);

async function handleSubmit(data: ManualTaskInput) {
  setSubmitting(true);

  // 1. Optimistic update: Add task to UI immediately
  const tempId = `temp-${Date.now()}`;
  setTempTaskId(tempId);
  onTaskCreated({
    id: tempId,
    text: data.task_text,
    status: 'analyzing',
    isManual: true,
  });

  try {
    // 2. Call API
    const response = await fetch('/api/tasks/manual', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error('Failed to create task');

    const { task_id } = await response.json();

    // 3. Replace temp with real ID
    onTaskIdResolved(tempId, task_id);

    // 4. Start polling for analysis result
    pollAnalysisStatus(task_id);

  } catch (error) {
    // 5. Rollback on error
    onTaskCreationFailed(tempId);
    toast.error('Failed to create task');
  } finally {
    setSubmitting(false);
  }
}
```

### Polling for Analysis Completion

```typescript
async function pollAnalysisStatus(taskId: string) {
  const maxAttempts = 20;  // 20 seconds max (1s intervals)
  let attempts = 0;

  const interval = setInterval(async () => {
    attempts++;

    const response = await fetch(`/api/tasks/manual/${taskId}/status`);
    const { status, agent_rank, placement_reason, exclusion_reason } = await response.json();

    if (status === 'prioritized') {
      // Analysis complete: Task is relevant
      clearInterval(interval);
      onTaskPlaced(taskId, { rank: agent_rank, reason: placement_reason });
    } else if (status === 'not_relevant') {
      // Analysis complete: Task excluded
      clearInterval(interval);
      onTaskDiscarded(taskId, { reason: exclusion_reason });
    } else if (attempts >= maxAttempts) {
      // Timeout: Keep in analyzing state, show warning
      clearInterval(interval);
      toast.warning('Analysis taking longer than expected');
    }
    // else: status still 'analyzing', continue polling
  }, 1000);
}
```

## Performance Considerations

### Analysis Latency Budget

- Embedding generation: ~2s (OpenAI API)
- Duplicate check: <500ms (vector search)
- Agent analysis: 3-8s (GPT-4o with JSON mode)
- **Total**: <10s at P95 ✅ (meets success criteria SC-012)

### Caching Strategy

**Duplicate Detection Cache**:
- Cache recent embeddings for 5 minutes
- Key: `manual-task-embedding:${text_hash}`
- Reduces redundant OpenAI calls for similar submissions

**Agent Prompt Cache** (future optimization):
- Cache agent instructions template
- Only regenerate when outcome or reflections change
- Estimated savings: 30% token cost reduction

## Related Entities

**Integration Points**:

1. **task_embeddings**: Core task storage (Phase 1)
2. **user_outcomes**: Determines when to trigger analysis (Phase 4)
3. **agent_sessions**: Track agent execution for manual task analysis (Phase 3)
4. **reflections**: Future enhancement - reflection-driven manual task suggestions (Phase 15)
5. **task_relationships**: Manual tasks participate in dependency graph (Phase 10)

**No schema changes required** for existing entities - clean extension via foreign keys.
