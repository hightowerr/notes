# Data Model: Task Gap Filling

**Feature**: 011-task-gap-filling
**Date**: 2025-11-05
**Phase**: Phase 1 - Design & Contracts

## Entity Definitions

### Gap

**Purpose**: Represents a detected logical discontinuity in a task sequence.

**Attributes**:
- `predecessor_id`: string (UUID of task before gap)
- `successor_id`: string (UUID of task after gap)
- `gap_type`: enum ['time', 'action_type', 'skill', 'dependency']
  - Primary gap characteristic used for display
- `confidence`: number (0-1)
  - Composite score from indicators
  - Formula: `(indicator_count - 2) / 2` (ranges 0.5-1.0 for 3-4 indicators)
- `indicators`: object
  - `time_gap`: boolean (estimated hours jump >40 hours between tasks)
  - `action_type_jump`: boolean (skips 2+ phases in workflow progression)
  - `no_dependency`: boolean (successor doesn't depend on predecessor)
  - `skill_jump`: boolean (different skill domains)

**State Transitions**:
```
detected → analyzed → (filled | dismissed)
```

**Relationships**:
- Belongs to: GapAnalysisSession (many-to-one)
- References: Task (predecessor), Task (successor)

**Validation Rules**:
- Confidence ≥0.75 to surface to user (3+ indicators required)
- Must have ≥3 indicators true to be considered valid
- predecessor_id !== successor_id

**Storage**:
- Not persisted as separate table
- Embedded in `agent_sessions.result` JSONB column under `detected_gaps` array
- Ephemeral: Only exists during analysis session

---

### BridgingTask

**Purpose**: AI-generated task designed to fill a specific gap.

**Attributes**:
- `text`: string (10-200 characters)
  - Task description (e.g., "Build MVP frontend with authentication")
  - Must be actionable (verb + object)
- `estimated_hours`: number (8-160)
  - Represents 1 day to 4 weeks of work
  - Validates against similar tasks in semantic search
- `required_cognition`: enum ['low', 'medium', 'high']
  - low: Routine, well-defined work (e.g., "Update documentation")
  - medium: Standard development (e.g., "Build API endpoint")
  - high: Complex, novel work (e.g., "Design distributed caching strategy")
- `confidence`: number (0-1)
  - Composite: 40% semantic search similarity + 30% gap indicator strength + 30% AI model confidence
  - Display as percentage (0-100%) in UI
- `reasoning`: string (50-300 characters)
  - AI explanation for why this task bridges the gap
  - Example: "Frontend implementation needed between design and launch. Builds on mockups from #2."
- `source`: 'ai_generated' (constant string literal)
- `generated_from`: object
  - `predecessor_id`: string
  - `successor_id`: string
- `requires_review`: true (constant boolean)
- `similarity_score`: number (0-1)
  - Maximum cosine similarity to any existing task
  - Used for deduplication (reject if >0.9)

**State Transitions**:
```
generated → reviewed → (accepted | rejected) → inserted (if accepted)
```

**Relationships**:
- Belongs to: GapAnalysisSession (many-to-one)
- References: Gap (via generated_from predecessor/successor IDs)

**Validation Rules**:
- text.length >= 10 && text.length <= 200
- estimated_hours >= 8 && estimated_hours <= 160
- confidence >= 0.0 && confidence <= 1.0
- similarity_score < 0.9 (deduplication threshold)
- Must not duplicate predecessor or successor task text (exact or >90% similar)

**Storage**:
- Embedded in `agent_sessions.result` JSONB column under `generated_tasks` array
- After acceptance, converted to regular Task entity in `agent_sessions.result.prioritized_tasks`

---

### TaskSuggestion

**Purpose**: User-facing representation of a bridging task during review (UI model).

**Attributes**:
- `id`: string (UUID for React component keys)
- `task_text`: string (editable, 10-200 chars)
- `estimated_hours`: number (editable, 8-160)
- `cognition_level`: enum ['low', 'medium', 'high'] (readonly)
- `confidence_percentage`: number (0-100, display only)
- `checked`: boolean (acceptance state, default true)
- `edit_mode`: boolean (inline editing active flag)
- `gap_context`: object
  - `predecessor_id`: string
  - `successor_id`: string
  - `gap_type`: string

**State Transitions** (client-side only):
```
displayed → (editing) → checked/unchecked → accepted/rejected
```

**Relationships**:
- Maps to: BridgingTask (one-to-one, transient)
- Groups by: Gap (many-to-one)

**Validation Rules**:
- Inherits BridgingTask validation rules for task_text and estimated_hours
- Edits must preserve: id, confidence_percentage, cognition_level (readonly)

**Storage**:
- Transient: Exists only in React component state
- Not persisted to database
- Reconstructed from BridgingTask on modal open

---

### GapAnalysisSession

**Purpose**: Audit trail and telemetry for gap detection and task generation.

**Attributes**:
- `session_id`: string (UUID, foreign key to `agent_sessions.id`)
- `trigger_timestamp`: timestamp (ISO 8601)
- `plan_snapshot`: JSONB
  - Array of {task_id, task_text, estimated_hours, depends_on} at analysis time
  - Preserves plan state before modifications
- `detected_gaps`: JSONB array of Gap objects
- `generated_tasks`: JSONB array of BridgingTask objects
- `user_acceptances`: JSONB array
  - Schema: {task_id: string, accepted: boolean, edited: boolean, final_text?: string, final_hours?: number}
- `insertion_result`: JSONB
  - `success`: boolean
  - `inserted_task_ids`: string[] (UUIDs of newly inserted tasks)
  - `error`: string | null (e.g., "Circular dependency detected")
- `performance_metrics`: JSONB
  - `detection_ms`: number (time to detect gaps)
  - `generation_ms`: number (time to generate all tasks)
  - `total_ms`: number (E2E from trigger to modal display)
  - `search_query_count`: number (semantic search calls)

**State Transitions**:
```
created → analysis_complete → (insertion_success | insertion_failure)
```

**Relationships**:
- Extends: AgentSession (one-to-one via session_id FK)
- Contains: Gap[] (embedded)
- Contains: BridgingTask[] (embedded)

**Validation Rules**:
- session_id must exist in `agent_sessions` table
- performance_metrics.total_ms should be <10000 (10s) for good UX
- insertion_result.success === false implies insertion_result.error !== null

**Storage**:
- Primary storage: Embedded in `agent_sessions.result` JSONB column
- Schema extension to existing agent_sessions table:
  ```sql
  agent_sessions.result = {
    ...existing_fields,
    gap_analysis?: {
      trigger_timestamp: string,
      plan_snapshot: Task[],
      detected_gaps: Gap[],
      generated_tasks: BridgingTask[],
      user_acceptances: Acceptance[],
      insertion_result: InsertionResult,
      performance_metrics: Metrics
    }
  }
  ```
- No new table needed (leverages existing agent infrastructure)

---

## Entity Relationships Diagram

```
AgentSession (existing table)
    ├── result.gap_analysis (JSONB)
    │   ├── detected_gaps: Gap[]
    │   │   └── references predecessor_id, successor_id (Task IDs)
    │   ├── generated_tasks: BridgingTask[]
    │   │   └── generated_from: {predecessor_id, successor_id}
    │   └── user_acceptances: Acceptance[]
    └── result.prioritized_tasks: Task[]
        └── (accepted BridgingTasks inserted here)

UI (React state)
    └── TaskSuggestion[] (transient, maps to BridgingTask)
```

---

## Data Flow

### 1. Gap Detection Flow
```
User clicks "Find Missing Tasks"
  ↓
API: POST /api/agent/suggest-gaps
  ↓
Load latest AgentSession.result.prioritized_tasks
  ↓
Analyze sequence → detect Gaps
  ↓
For each Gap (confidence ≥0.75):
  ↓
  Call Mastra tool: suggest-bridging-tasks
    ↓
    Generate BridgingTasks (1-3 per gap)
  ↓
Store in AgentSession.result.gap_analysis
  ↓
Return {gaps: Gap[], suggestions: TaskSuggestion[], analysis_session_id}
```

### 2. Task Acceptance Flow
```
User checks/unchecks TaskSuggestions
  ↓
User edits task_text or estimated_hours
  ↓
User clicks "Accept Selected"
  ↓
API: POST /api/agent/accept-suggestions
  ↓
Load GapAnalysisSession by analysis_session_id
  ↓
Map accepted TaskSuggestions to BridgingTasks
  ↓
For each accepted task:
  ↓
  Create new Task entity
  ↓
  Insert at calculated position (between predecessor & successor)
  ↓
  Update dependencies
  ↓
Validate dependency graph (Kahn's algorithm)
  ↓
If cycle detected:
  ↓
  Rollback, return 400 error
Else:
  ↓
  Commit changes to AgentSession.result.prioritized_tasks
  ↓
  Log user_acceptances and insertion_result
  ↓
Return {success: true, inserted_task_ids, updated_plan}
```

---

## Schema Definitions (Zod)

**Location**: `lib/schemas/gapAnalysis.ts`

```typescript
import { z } from 'zod';

export const GapSchema = z.object({
  predecessor_id: z.string().uuid(),
  successor_id: z.string().uuid(),
  gap_type: z.enum(['time', 'action_type', 'skill', 'dependency']),
  confidence: z.number().min(0).max(1),
  indicators: z.object({
    time_gap: z.boolean(),
    action_type_jump: z.boolean(),
    no_dependency: z.boolean(),
    skill_jump: z.boolean(),
  }),
});

export const BridgingTaskSchema = z.object({
  text: z.string().min(10).max(200),
  estimated_hours: z.number().min(8).max(160),
  required_cognition: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(50).max(300),
  source: z.literal('ai_generated'),
  generated_from: z.object({
    predecessor_id: z.string().uuid(),
    successor_id: z.string().uuid(),
  }),
  requires_review: z.literal(true),
  similarity_score: z.number().min(0).max(1),
});

export const TaskSuggestionSchema = z.object({
  id: z.string().uuid(),
  task_text: z.string().min(10).max(200),
  estimated_hours: z.number().min(8).max(160),
  cognition_level: z.enum(['low', 'medium', 'high']),
  confidence_percentage: z.number().int().min(0).max(100),
  checked: z.boolean(),
  gap_context: z.object({
    predecessor_id: z.string().uuid(),
    successor_id: z.string().uuid(),
    gap_type: z.enum(['time', 'action_type', 'skill', 'dependency']),
  }),
});

export const GapAnalysisSessionSchema = z.object({
  session_id: z.string().uuid(),
  trigger_timestamp: z.string().datetime(),
  plan_snapshot: z.array(z.object({
    task_id: z.string().uuid(),
    task_text: z.string(),
    estimated_hours: z.number().optional(),
    depends_on: z.array(z.string().uuid()).optional(),
  })),
  detected_gaps: z.array(GapSchema),
  generated_tasks: z.array(BridgingTaskSchema),
  user_acceptances: z.array(z.object({
    task_id: z.string().uuid(),
    accepted: z.boolean(),
    edited: z.boolean(),
    final_text: z.string().optional(),
    final_hours: z.number().optional(),
  })),
  insertion_result: z.object({
    success: z.boolean(),
    inserted_task_ids: z.array(z.string().uuid()),
    error: z.string().nullable(),
  }),
  performance_metrics: z.object({
    detection_ms: z.number(),
    generation_ms: z.number(),
    total_ms: z.number(),
    search_query_count: z.number(),
  }),
});
```

---

## Migration Requirements

**No database migrations needed** - all data stored in existing `agent_sessions.result` JSONB column.

**Backward compatibility**: Existing agent sessions without `gap_analysis` field remain valid.

**Index optimization** (optional, for future performance):
```sql
-- GIN index on result.gap_analysis for faster queries
CREATE INDEX IF NOT EXISTS idx_agent_sessions_gap_analysis
ON agent_sessions USING gin ((result->'gap_analysis'));
```

---

## Next Steps

1. **Phase 1 Continued**: Create API contracts (`contracts/suggest-gaps-api.yaml`)
2. **Phase 1 Continued**: Create quickstart manual test guide
3. **Phase 2**: Generate vertical slice tasks based on this data model
