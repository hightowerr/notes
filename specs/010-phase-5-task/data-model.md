# Data Model

**Feature**: Task Gap Filling
**Date**: 2025-10-28

## Entities

### Gap

Represents a detected logical discontinuity between two tasks in a prioritized sequence.

**Schema** (`lib/schemas/gapSchema.ts`):
```typescript
const gapSchema = z.object({
  id: z.string().uuid(),                    // Generated UUID for gap reference
  predecessor_task_id: z.string().uuid(),   // Task before the gap
  successor_task_id: z.string().uuid(),     // Task after the gap
  indicators: z.object({
    time_gap: z.boolean(),                  // >1 week between tasks
    action_type_jump: z.boolean(),          // Skips 2+ workflow stages
    no_dependency: z.boolean(),             // Successor doesn't depend on predecessor
    skill_jump: z.boolean()                 // Different skill domains
  }),
  confidence: z.number().min(0).max(1),     // 0-1 score based on indicator count
  detected_at: z.string().datetime()        // ISO 8601 timestamp
});
```

**Validation Rules**:
- At least 3 indicators must be true (conservative threshold per FR-003)
- Confidence calculated as: `(indicator_count - 3) * 0.25 + 0.75` (3 indicators = 0.75, 4 indicators = 1.0)
- `predecessor_task_id` must exist in `task_embeddings` table
- `successor_task_id` must exist in `task_embeddings` table
- `predecessor_task_id` ≠ `successor_task_id`

**Persistence**: Transient (not stored in database, exists only in memory during detection session)

**Relationships**:
- References two existing `task_embeddings` records (predecessor and successor)
- One-to-many with BridgingTask (1 gap → 1-3 bridging tasks)

---

### BridgingTask

Represents an AI-generated task suggestion to fill a detected gap.

**Schema** (`lib/schemas/bridgingTaskSchema.ts`):
```typescript
const bridgingTaskSchema = z.object({
  id: z.string().uuid(),                              // Generated UUID (becomes task_embeddings.id if accepted)
  gap_id: z.string().uuid(),                          // Parent gap reference
  task_text: z.string().min(10).max(500),             // Task description
  estimated_hours: z.number().int().min(8).max(160),  // 1-4 weeks (8-160 hours)
  cognition_level: z.enum(['low', 'medium', 'high']), // Required cognitive load
  confidence: z.number().min(0).max(1),               // AI confidence score (target ≥0.7)
  reasoning: z.string().min(20).max(1000),            // Why this task is needed
  source: z.literal('ai_generated'),                  // Distinguishes from extracted tasks
  requires_review: z.boolean().default(true),         // Flag for user review tracking
  created_at: z.string().datetime(),                  // Generation timestamp

  // Editable fields (modified before acceptance)
  edited_task_text: z.string().min(10).max(500).optional(),     // User override
  edited_estimated_hours: z.number().int().min(8).max(160).optional()  // User override
});
```

**Validation Rules**:
- `task_text` must not semantically duplicate predecessor or successor (cosine similarity <0.9)
- `estimated_hours` must be reasonable for gap size (no hard validation, user can override)
- `confidence` should average ≥0.7 across all generated tasks (FR-012)
- `cognition_level` inferred from task description keywords (implementation detail)
- If `edited_task_text` provided, use it instead of `task_text` for insertion
- If `edited_estimated_hours` provided, use it instead of `estimated_hours` for insertion

**Persistence**:
- Pre-acceptance: Stored in React component state only
- Post-acceptance: Inserted into `task_embeddings` table with these mappings:
  ```
  task_embeddings.id = BridgingTask.id
  task_embeddings.text = BridgingTask.edited_task_text || BridgingTask.task_text
  task_embeddings.estimated_hours = BridgingTask.edited_estimated_hours || BridgingTask.estimated_hours
  task_embeddings.source = 'ai_generated'
  task_embeddings.metadata = { cognition_level, confidence, reasoning, original_gap_id }
  ```

**Relationships**:
- Belongs to one Gap (parent)
- Creates two entries in `task_relationships` upon acceptance:
  1. `predecessor_task_id → bridging_task_id` (type: 'prerequisite')
  2. `bridging_task_id → successor_task_id` (type: 'prerequisite')

---

### GapIndicators

Collection of heuristics used to identify potential gaps (embedded in Gap entity).

**Schema** (part of `gapSchema`):
```typescript
const gapIndicatorsSchema = z.object({
  time_gap: z.boolean(),           // Threshold: >7 days (1 week)
  action_type_jump: z.boolean(),   // Threshold: skips 2+ stages in workflow taxonomy
  no_dependency: z.boolean(),      // Check: task_relationships has no link between tasks
  skill_jump: z.boolean()          // Threshold: different skill domain tags
});
```

**Heuristic Computation**:

1. **time_gap**:
   ```typescript
   const timeDiff = successor.created_at - predecessor.created_at;
   time_gap = timeDiff > 7 * 24 * 60 * 60 * 1000; // 7 days in ms
   ```

2. **action_type_jump**:
   ```typescript
   const workflowStages = ['research', 'design', 'plan', 'build', 'test', 'deploy', 'launch'];
   const predStage = detectStage(predecessor.text);
   const succStage = detectStage(successor.text);
   action_type_jump = Math.abs(workflowStages.indexOf(succStage) - workflowStages.indexOf(predStage)) >= 2;
   ```

3. **no_dependency**:
   ```typescript
   const hasLink = await db.query(
     'SELECT 1 FROM task_relationships WHERE predecessor_id = $1 AND successor_id = $2',
     [predecessor.id, successor.id]
   );
   no_dependency = hasLink.rowCount === 0;
   ```

4. **skill_jump**:
   ```typescript
   const predSkills = extractSkills(predecessor.text); // e.g., ['design', 'ui']
   const succSkills = extractSkills(successor.text);   // e.g., ['backend', 'database']
   skill_jump = predSkills.every(s => !succSkills.includes(s));
   ```

**Validation Rules**:
- All 4 indicators must be computed for each task pair
- Gap flagged only if `sum(indicators) >= 3` (conservative threshold)

---

## Database Schema Changes

### Existing Tables (No Changes Required)

#### task_embeddings
Already supports bridging tasks via existing `source` field:
```sql
CREATE TABLE task_embeddings (
  id UUID PRIMARY KEY,
  text TEXT NOT NULL,
  embedding vector(1536),
  source TEXT,  -- 'extracted' | 'ai_generated'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Usage**:
- Insert accepted bridging tasks with `source = 'ai_generated'`
- Store additional fields in `metadata`: `{ cognition_level, confidence, reasoning, original_gap_id }`

#### task_relationships
Already supports dependency tracking:
```sql
CREATE TABLE task_relationships (
  id UUID PRIMARY KEY,
  predecessor_id UUID REFERENCES task_embeddings(id),
  successor_id UUID REFERENCES task_embeddings(id),
  relationship_type TEXT,  -- 'prerequisite' | 'blocking' | 'related'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Usage**:
- Insert two relationships per accepted bridging task
- Validate cycles via topological sort before INSERT

### New Tables (None Required)

Gap and BridgingTask entities are transient (exist only during detection/review session). No new tables needed.

---

## State Transitions

### Gap Detection Flow
```
[Task List]
  → detectGaps()
  → [Gap[]] (0-3 gaps with confidence scores)
  → generateBridgingTasks()
  → [BridgingTask[]] (1-3 tasks per gap)
  → User Review (accept/reject/edit)
  → [AcceptedBridgingTask[]]
  → insertTasks()
  → [Updated task_embeddings + task_relationships]
```

### BridgingTask States
```
Generated → Displayed → (User Edits?) → Accepted/Rejected
                                      ↓
                                  Inserted into DB
```

**State Fields**:
- **Generated**: `created_at` set, all fields populated by AI
- **Displayed**: Rendered in UI, user can check/uncheck
- **Edited**: `edited_task_text` or `edited_estimated_hours` modified
- **Accepted**: Checkbox checked when user clicks "Accept Selected"
- **Inserted**: Row exists in `task_embeddings` with `source='ai_generated'`

---

## API Contract Mapping

### POST /api/gaps/detect

**Request**:
```typescript
{
  task_ids: string[];  // IDs from task_embeddings to analyze
}
```

**Response**:
```typescript
{
  gaps: Gap[];  // 0-3 gaps detected
  metadata: {
    total_pairs_analyzed: number;
    gaps_detected: number;
    analysis_duration_ms: number;
  };
}
```

### POST /api/gaps/generate

**Request**:
```typescript
{
  gap_id: string;
  predecessor_task_id: string;
  successor_task_id: string;
  outcome_statement?: string;           // Optional context
  manual_examples?: string[];           // Optional if semantic search returns zero results
}
```

**Response**:
```typescript
{
  bridging_tasks: BridgingTask[];  // 1-3 suggestions
  search_results_count: number;    // Number of similar tasks found
  generation_duration_ms: number;
}
```

### POST /api/gaps/accept

**Request**:
```typescript
{
  accepted_tasks: {
    task: BridgingTask;              // Including any edits
    predecessor_id: string;
    successor_id: string;
  }[];
}
```

**Response**:
```typescript
{
  inserted_count: number;
  task_ids: string[];              // IDs of newly inserted tasks
  validation_errors?: string[];    // If cycle detected or duplicate found
}
```

---

## Indexes and Performance

### Required Indexes (Already Exist)
- `task_embeddings(id)` - Primary key
- `task_embeddings.embedding` - IVFFlat index for semantic search
- `task_relationships(predecessor_id, successor_id)` - Composite index for dependency lookups

### Query Optimization
- Gap detection: Single query to fetch all task pairs, process in memory
- Dependency validation: Single graph query, topological sort in memory
- Semantic search: Use existing optimized endpoint with IVFFlat index

**Expected Performance**:
- Gap detection: O(n²) for n tasks, ~50ms for 50 tasks
- Bridging task generation: O(1) per gap (parallel), <5s total
- Dependency validation: O(V+E) for V tasks and E relationships, <10ms for typical graphs

---

## Data Retention

**Gaps**: Not persisted (transient session data)
**BridgingTasks (rejected)**: Not persisted (discarded after session)
**BridgingTasks (accepted)**: Persisted indefinitely in `task_embeddings` (subject to same 30-day retention as extracted tasks)

---

## Observability Data

### Logged Metrics (per session)
- `gap_count`: Number of gaps detected (FR-041)
- `generation_latency_ms`: Time to generate suggestions per gap (FR-042)
- `acceptance_rate`: Ratio of accepted to suggested tasks (FR-043)

### Schema for Logging
```typescript
{
  session_id: string;
  user_id: string;
  timestamp: string;
  gap_count: number;
  suggestions_generated: number;
  suggestions_accepted: number;
  acceptance_rate: number;
  generation_latency_ms: number[];  // One per gap
  errors?: string[];
}
```

**Storage**: Log to console (development) and Supabase `processing_logs` table (production)

---

**Data Model Complete**: 2025-10-28
**Next**: Generate API contracts
