# Data Model: Agent Runtime & Reasoning Loop

**Feature**: Phase 3 - Agent Runtime & Reasoning Loop
**Date**: 2025-10-19
**Status**: Complete

## Entity Definitions

### 1. Agent Session

**Purpose**: Represents a single execution of the task prioritization agent.

**Fields**:
- `id` (UUID, PRIMARY KEY) - Unique session identifier
- `user_id` (UUID, NOT NULL, UNIQUE) - User who triggered prioritization (enforces FR-036: single session per user)
- `outcome_id` (UUID, NOT NULL, FOREIGN KEY → user_outcomes.id) - Active outcome statement used for context
- `status` (ENUM['running', 'completed', 'failed'], NOT NULL) - Current execution state
- `prioritized_plan` (JSONB, NULLABLE) - Final output (PrioritizedTaskPlan schema), null while running
- `execution_metadata` (JSONB, NOT NULL) - Performance data (ExecutionMetadata schema)
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()) - Session start time
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()) - Last status update

**Relationships**:
- Belongs to: `user_outcomes` (via `outcome_id`)
- Has many: `reasoning_traces` (CASCADE delete per FR-037)

**Validation Rules**:
- UNIQUE constraint on `user_id` (FR-036: only most recent session)
- `status` must be one of: 'running', 'completed', 'failed'
- `prioritized_plan` required when `status = 'completed'`, null otherwise

**State Transitions**:
```
pending → running (on agent execution start)
running → completed (on successful prioritization)
running → failed (on error or timeout)
```

**Indexes**:
- PRIMARY KEY on `id`
- UNIQUE INDEX on `user_id`
- INDEX on `created_at` (for 7-day cleanup query)

---

### 2. Reasoning Trace

**Purpose**: Complete log of agent's decision-making process for a single session.

**Fields**:
- `id` (UUID, PRIMARY KEY) - Unique trace identifier
- `session_id` (UUID, NOT NULL, FOREIGN KEY → agent_sessions.id ON DELETE CASCADE) - Associated session
- `steps` (JSONB[], NOT NULL) - Ordered array of ReasoningStep objects
- `total_duration_ms` (INTEGER, NOT NULL) - Sum of all step durations
- `total_steps` (INTEGER, NOT NULL) - Count of steps (≤10 per FR-002)
- `tools_used_count` (JSONB, NOT NULL) - Map of {tool_name: count} for observability
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()) - Trace creation time

**Relationships**:
- Belongs to: `agent_sessions` (via `session_id`, CASCADE delete)

**Validation Rules**:
- `total_steps` ≤ 10 (enforced by Mastra `maxSteps`, validated in schema)
- `created_at` ≥ NOW() - INTERVAL '7 days' (FR-020: 7-day retention)
- Each element in `steps[]` must conform to ReasoningStep schema

**Indexes**:
- PRIMARY KEY on `id`
- INDEX on `session_id` (for trace retrieval queries)
- INDEX on `created_at` WHERE `created_at` < NOW() - INTERVAL '7 days' (for cleanup trigger)

**TTL Strategy**:
- Auto-delete via trigger when `created_at` > 7 days old (migration 013)
- Triggered on INSERT to `reasoning_traces` table

---

### 3. Reasoning Step

**Purpose**: Individual action within reasoning loop (embedded in Reasoning Trace, not separate table).

**Schema** (JSON object, stored in `reasoning_traces.steps[]`):
```typescript
{
  step_number: number;         // 1-indexed position in reasoning loop
  timestamp: string;           // ISO 8601 timestamp
  thought: string | null;      // Agent's rationale for this step
  tool_name: string | null;    // Name of tool called ('semantic-search', 'detect-dependencies', etc.)
  tool_input: object | null;   // Parameters passed to tool (Zod-validated)
  tool_output: object | null;  // Structured response from tool
  duration_ms: number;         // Step execution time
  status: 'success' | 'failed' | 'skipped';  // Step outcome
}
```

**Validation Rules** (Zod schema `reasoningStepSchema`):
- `step_number` MUST be 1-10 (inclusive, per FR-002)
- `timestamp` MUST be valid ISO 8601 format
- If `tool_name` present, `tool_input` and `tool_output` MUST be non-null
- `status = 'failed'` implies `tool_output` may be null (error case)
- `duration_ms` MUST be non-negative integer

**Usage Pattern**:
- Agent generates steps during execution
- Mastra `getExecutionTrace()` returns steps array
- Stored in `reasoning_traces.steps` JSONB column

---

### 4. Prioritized Task Plan

**Purpose**: Final output of agent session (embedded in Agent Session, not separate table).

**Schema** (JSON object, stored in `agent_sessions.prioritized_plan`):
```typescript
{
  ordered_task_ids: string[];            // Task IDs in execution order
  execution_waves: ExecutionWave[];      // Grouped tasks (parallel vs sequential)
  dependencies: TaskDependency[];        // Prerequisite/blocking relationships
  confidence_scores: Record<string, number>;  // Task ID → confidence (0.0-1.0)
  synthesis_summary: string;             // Agent's explanation of prioritization
}
```

**Validation Rules** (Zod schema `prioritizedPlanSchema`):
- `ordered_task_ids[]` MUST NOT be empty (FR-011)
- Each `task_id` MUST reference existing task in `processed_documents.structured_output`
- `confidence_scores` keys MUST match `ordered_task_ids` (FR-014)
- `execution_waves[]` MUST cover all `ordered_task_ids` (no orphaned tasks)

**Relationships** (logical, not FK):
- Task IDs reference tasks extracted from `processed_documents` table

---

### 5. Task Dependency

**Purpose**: Relationship between two tasks extracted during reasoning (embedded in Prioritized Task Plan, not separate table).

**Schema** (JSON object, element of `prioritized_plan.dependencies[]`):
```typescript
{
  source_task_id: string;          // Task that depends on target
  target_task_id: string;          // Task that blocks source
  relationship_type: 'prerequisite' | 'blocks' | 'related';
  confidence: number;              // 0.0-1.0 (AI inference confidence)
  detection_method: 'ai_inference' | 'stored_relationship';  // How dependency discovered
}
```

**Validation Rules** (Zod schema `taskDependencySchema`):
- `source_task_id` ≠ `target_task_id` (no self-dependencies)
- `relationship_type` MUST be one of: 'prerequisite', 'blocks', 'related'
- `confidence` MUST be 0.0-1.0 (inclusive)
- `detection_method` indicates if from AI reasoning or `task_relationships` table query

**Usage Pattern**:
- Agent calls `detect-dependencies` tool → AI infers relationships
- Agent calls `query-task-graph` tool → retrieves stored relationships
- Combined in final `prioritized_plan.dependencies[]` array

---

### 6. Execution Wave

**Purpose**: Group of tasks that can be executed together (embedded in Prioritized Task Plan, not separate table).

**Schema** (JSON object, element of `prioritized_plan.execution_waves[]`):
```typescript
{
  wave_number: number;             // 1-indexed execution order
  task_ids: string[];              // Tasks in this wave
  parallel_execution: boolean;     // Can all tasks run simultaneously?
  estimated_duration_hours: number | null;  // Optional effort estimate
}
```

**Validation Rules** (Zod schema `executionWaveSchema`):
- `wave_number` MUST be positive integer
- `task_ids[]` MUST NOT be empty (FR-012)
- `task_ids` MUST be subset of `prioritized_plan.ordered_task_ids` (no orphans)
- Waves MUST partition all tasks (no overlaps, no gaps)
- Wave 1 has no prerequisites, Wave N depends on Waves 1..N-1

**Usage Pattern**:
- Agent clusters tasks by dependencies and similarity
- Tasks with no dependencies → Wave 1 (parallel execution candidate)
- Tasks blocked by Wave N → Wave N+1 (sequential execution)

---

### 7. Execution Metadata

**Purpose**: Performance and diagnostic data for agent session (embedded in Agent Session, not separate table).

**Schema** (JSON object, stored in `agent_sessions.execution_metadata`):
```typescript
{
  steps_taken: number;                    // Total reasoning steps (≤10)
  tool_call_count: Record<string, number>;  // {tool_name: count}
  thinking_time_ms: number;               // Time spent in AI reasoning
  tool_execution_time_ms: number;         // Time spent executing tools
  total_time_ms: number;                  // End-to-end session duration
  error_count: number;                    // Failed tool executions
  success_rate: number;                   // Successful steps / total steps
}
```

**Validation Rules** (Zod schema `executionMetadataSchema`):
- `steps_taken` ≤ 10 (FR-002, NFR-001)
- `total_time_ms` < 30000 (30s, NFR-002 - logged warning if exceeded)
- `success_rate` = (steps with status='success') / `steps_taken`
- `tool_call_count` keys MUST be valid tool names

**Usage Pattern**:
- Mastra telemetry provides `steps.length`, `durationMs`, tool names
- Result parser calculates derived metrics (success_rate, thinking_time)
- Stored in `agent_sessions.execution_metadata` for observability

---

## Database Migrations

### Migration 011: Create agent_sessions Table

```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  outcome_id UUID NOT NULL REFERENCES user_outcomes(id),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  prioritized_plan JSONB,
  execution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)  -- FR-036: Single session per user
);

CREATE INDEX idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX idx_agent_sessions_created_at ON agent_sessions(created_at);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_agent_sessions_updated_at
BEFORE UPDATE ON agent_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

### Migration 012: Create reasoning_traces Table

```sql
CREATE TABLE reasoning_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  steps JSONB[] NOT NULL,
  total_duration_ms INTEGER NOT NULL,
  total_steps INTEGER NOT NULL CHECK (total_steps <= 10),  -- FR-002
  tools_used_count JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reasoning_traces_session_id ON reasoning_traces(session_id);
CREATE INDEX idx_reasoning_traces_created_at ON reasoning_traces(created_at) WHERE created_at < NOW() - INTERVAL '7 days';
```

### Migration 013: Add 7-Day Cleanup Trigger

```sql
CREATE OR REPLACE FUNCTION cleanup_old_reasoning_traces()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM reasoning_traces WHERE created_at < NOW() - INTERVAL '7 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_reasoning_traces
AFTER INSERT ON reasoning_traces
FOR EACH STATEMENT
EXECUTE FUNCTION cleanup_old_reasoning_traces();
```

---

## Entity Relationship Diagram

```
┌─────────────────────┐
│  user_outcomes      │
│ (existing table)    │
└──────────┬──────────┘
           │
           │ 1:N (outcome_id)
           ▼
┌─────────────────────┐
│  agent_sessions     │  1:1 per user (UNIQUE user_id)
│ ──────────────────  │
│ + id (PK)           │
│ + user_id (UNIQUE)  │
│ + outcome_id (FK)   │
│ + status            │
│ + prioritized_plan  │◄────── Embedded: PrioritizedTaskPlan
│ + execution_metadata│◄────── Embedded: ExecutionMetadata
│ + created_at        │
│ + updated_at        │
└──────────┬──────────┘
           │
           │ 1:1 (CASCADE delete)
           ▼
┌─────────────────────┐
│  reasoning_traces   │
│ ──────────────────  │
│ + id (PK)           │
│ + session_id (FK)   │
│ + steps[]           │◄────── Array of: ReasoningStep
│ + total_duration_ms │
│ + total_steps       │
│ + tools_used_count  │
│ + created_at        │◄────── TTL: Auto-delete if >7 days
└─────────────────────┘
```

**Embedded Schemas** (not separate tables):
- `PrioritizedTaskPlan` contains:
  - `ExecutionWave[]` (grouped tasks)
  - `TaskDependency[]` (relationships)
- `ReasoningStep` (individual step in `reasoning_traces.steps[]`)
- `ExecutionMetadata` (performance metrics in `agent_sessions`)

---

## Validation Summary

**Schema Enforcement**:
- **Zod Schemas** (`lib/schemas/`):
  - `agentSessionSchema.ts` - Validates `agent_sessions` row data
  - `reasoningTraceSchema.ts` - Validates `reasoning_traces` row + embedded steps
  - `prioritizedPlanSchema.ts` - Validates `prioritized_plan` JSONB structure
  - `reasoningStepSchema.ts` - Validates individual step objects
  - `executionMetadataSchema.ts` - Validates metadata JSONB structure

- **Database Constraints**:
  - UNIQUE(user_id) enforces FR-036 (single session per user)
  - CHECK(total_steps <= 10) enforces FR-002 (max 10 reasoning steps)
  - CHECK(status IN (...)) enforces valid state transitions
  - CASCADE DELETE enforces FR-037 (session replacement deletes traces)

- **Application Logic**:
  - Mastra `maxSteps: 10` prevents >10 steps at runtime
  - Result parser validates JSON structure before database insert
  - API endpoints validate request/response with Zod before processing

---

## Performance Considerations

**Query Patterns**:
1. **GET /api/agent/sessions/[sessionId]** - Single row query by PK (`id`), <10ms
2. **GET /api/agent/sessions/[sessionId]/trace** - JOIN query on `session_id` index, <50ms
3. **Cleanup trigger** - DELETE WHERE `created_at` < NOW() - INTERVAL '7 days', runs on INSERT (minimal overhead)

**Storage Estimates** (P0 scale):
- Agent Session: ~2 KB per row (JSONB fields)
- Reasoning Trace: ~10 KB per session (10 steps × 1 KB per step)
- Total: ~12 KB per prioritization session
- With 7-day retention: ~100 sessions × 12 KB = 1.2 MB (negligible)

**Scalability** (future):
- Current design supports 1000s of users (UNIQUE user_id, no historical accumulation)
- If multi-session history needed: Add `is_active` BOOLEAN column, remove UNIQUE constraint
- If >10K sessions/day: Consider partitioning `reasoning_traces` by `created_at` (monthly)

---

**Next Phase**: Phase 1 - API Contracts (generate OpenAPI schemas from endpoints)
