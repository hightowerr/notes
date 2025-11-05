# Research: Agent Runtime & Reasoning Loop

**Feature**: Phase 3 - Agent Runtime & Reasoning Loop (Mastra)
**Date**: 2025-10-19
**Status**: Complete

## Research Task 1: Mastra Agent Configuration Best Practices

### Decision
Use structured instruction format with explicit tool usage guidelines, low temperature (0.2) for deterministic reasoning, max steps configured to 10 (hard limit per NFR-001).

### Rationale
- **Instruction Format**: Mastra agents use natural language instructions that guide tool selection and reasoning approach. The Task Orchestrator agent needs clear reasoning steps (semantic search → dependencies → clustering → synthesis) to achieve >80% tool selection accuracy (NFR-003).
- **Temperature**: Lower temperature (0.2 vs default 0.7) reduces non-deterministic behavior in tool selection, ensuring consistent reasoning patterns across sessions. Critical for achieving 90% of sessions completing in ≤10 steps (NFR-001).
- **Max Steps**: Hard limit of 10 prevents infinite loops and ensures <30s execution time (NFR-002). Mastra `maxSteps` parameter enforces this automatically.

### Alternatives Considered
- **Higher Temperature (0.7)**: Rejected - Too much variance in tool selection, reduces predictability
- **No Max Steps Limit**: Rejected - Violates NFR-001, no guarantee of timely completion
- **Dynamic Temperature Adjustment**: Rejected - Adds complexity without proven benefit (P0 scope)

### Implementation Pattern
```typescript
export const taskOrchestratorAgent = createAgent({
  name: 'Task Orchestrator',
  instructions: `You are a Task Orchestration Agent...

  REASONING APPROACH:
  1. Start with semantic search to find relevant tasks
  2. Fetch document context to understand relationships
  3. Detect dependencies between tasks
  4. Query existing graph for known relationships
  5. Cluster similar tasks for batch execution
  6. Synthesize final prioritized sequence`,

  model: openai('gpt-4o', {
    temperature: 0.2,
    maxTokens: 4000,
  }),

  maxSteps: 10,  // Hard limit per NFR-001
});
```

---

## Research Task 2: Mastra Tool Integration Patterns

### Decision
Existing Phase 2 tools (Spec 006) work as-is with Mastra - no adapter pattern needed. Tools already use Zod parameter validation and return structured responses compatible with Mastra's tool execution framework.

### Rationale
- **Tool Compatibility**: Mastra expects tools to be functions with Zod-validated parameters and return structured data. Phase 2 tools (`semantic-search`, `get-document-context`, `detect-dependencies`, `query-task-graph`, `cluster-by-similarity`) already follow this pattern.
- **Error Handling**: Existing tools have retry logic (Mastra config: 2 retries with 2s delay) - Mastra's automatic retry complements this for transient failures.
- **Type Safety**: Zod schemas in tools provide runtime validation that Mastra uses to validate agent-generated parameters before execution.

### Alternatives Considered
- **Adapter Layer**: Rejected - Adds unnecessary indirection when tools already compatible
- **Tool Wrapper Functions**: Rejected - Tools already return structured responses Mastra can consume
- **Custom Tool Execution Logic**: Rejected - Violates "No Manual Tool Execution" no-go (spec line 298-299)

### Implementation Pattern
```typescript
import { agentTools } from '../tools';  // Phase 2 tools from Spec 006

export const taskOrchestratorAgent = createAgent({
  // ... other config
  tools: agentTools,  // Direct pass-through, no adapter needed
});
```

**Validation**: Existing tool tests (`__tests__/contract/mastra-tools.test.ts`) confirm compatibility.

---

## Research Task 3: Reasoning Trace Storage Strategy

### Decision
Use PostgreSQL table with `created_at` timestamp + automated trigger for 7-day cleanup. Index on `session_id` for trace retrieval queries.

### Rationale
- **TTL Implementation**: PostgreSQL doesn't have native TTL like Redis, but a daily cron trigger (`pg_cron` extension) or function-based cleanup on INSERT provides equivalent functionality with minimal overhead.
- **Trigger vs Cron**: Trigger approach (on INSERT, delete traces >7 days) keeps cleanup logic close to data modification and doesn't require external scheduling. More reliable for P0 scope.
- **Index Strategy**: `session_id` is the primary query pattern (GET /api/agent/sessions/[sessionId]/trace), so a B-tree index on this column ensures <100ms retrieval for traces up to 10 steps.

### Alternatives Considered
- **Redis with Native TTL**: Rejected - Adds new infrastructure dependency when Supabase PostgreSQL available
- **Cron-Based Cleanup**: Rejected - Requires Supabase Edge Functions or external scheduler (more complex than trigger)
- **Application-Level Cleanup**: Rejected - Error-prone if API process crashes, database trigger more robust

### Implementation Schema
```sql
CREATE TABLE reasoning_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  thought TEXT,
  tool_name TEXT,
  tool_input JSONB,
  tool_output JSONB,
  duration_ms INTEGER,
  status TEXT CHECK (status IN ('success', 'failed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id, step_number)
);

CREATE INDEX idx_reasoning_traces_session_id ON reasoning_traces(session_id);
CREATE INDEX idx_reasoning_traces_created_at ON reasoning_traces(created_at) WHERE created_at < NOW() - INTERVAL '7 days';
```

**Cleanup Trigger**:
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

## Research Task 4: Agent Result Parsing Approach

### Decision
Extract structured data from Mastra `getExecutionTrace()` API, which provides JSON-formatted trace with tool call history. Parse final agent response as JSON, with fallback to empty array if parsing fails (graceful degradation per FR-022).

### Rationale
- **Mastra Trace Format**: Mastra execution traces return structured data with `steps[]` array containing `{ toolName, toolInput, toolOutput, thought, duration }`. This eliminates need for custom NLP parsing of agent's natural language responses.
- **Final Response Parsing**: Agent instructed to output JSON in final response (e.g., `{ prioritized_tasks: [...], execution_waves: [...] }`). JSON.parse() with try/catch provides deterministic parsing with fallback.
- **Tool Output Aggregation**: Iterate through trace steps, filter by `toolName` (detect-dependencies, cluster-by-similarity), and collect `toolOutput` arrays.

### Alternatives Considered
- **Regex Parsing of Natural Language**: Rejected - Brittle, non-deterministic, violates Constitution Principle II (Deterministic Outputs)
- **Prompt Engineering for Guaranteed JSON**: Rejected - GPT-4o doesn't guarantee JSON format in all cases, fallback still needed
- **Streaming Parse**: Rejected - Spec requires "simple progress indicator" (not real-time streaming), over-engineered for P0

### Implementation Pattern
```typescript
export function extractDependenciesFromTrace(trace: MastraExecutionTrace) {
  const dependencySteps = trace.steps.filter(
    step => step.toolName === 'detect-dependencies'
  );

  const allDependencies = [];
  for (const step of dependencySteps) {
    if (step.toolOutput?.dependencies) {
      allDependencies.push(...step.toolOutput.dependencies);
    }
  }

  return allDependencies;
}

export function parseTasksFromResponse(responseText: string) {
  try {
    const parsed = JSON.parse(responseText);
    return parsed.prioritized_tasks || [];
  } catch (error) {
    console.error('[Parser] Failed to parse agent response:', error);
    return [];  // Graceful degradation per FR-022
  }
}
```

---

## Research Task 5: Synchronous vs Streaming Execution

### Decision
Use polling-based progress indicator with 2-second interval GET requests to `/api/agent/sessions/[sessionId]` checking `status` field. No SSE or WebSocket.

### Rationale
- **Spec Requirement**: FR-028 specifies "simple progress indicator" (not real-time streaming). Polling aligns with "show progress indicator while reasoning is in progress" without over-engineering.
- **Next.js Constraints**: API routes support streaming via SSE, but adds complexity (connection management, error handling, browser compatibility) not justified for 30s max execution time.
- **User Experience**: 2-second polling provides adequate responsiveness for <30s workflows. Users see "Analyzing..." state, then results appear when `status` changes to 'completed'.
- **Existing Pattern**: Project already uses polling for upload status (CLAUDE.md line 331: "Status polling (GET /api/status/[fileId])").

### Alternatives Considered
- **Server-Sent Events (SSE)**: Rejected - Over-engineered for 30s max execution time, requires connection management
- **WebSocket**: Rejected - Even more complex than SSE, bidirectional communication not needed
- **Long Polling**: Rejected - Similar complexity to SSE, no advantage over simple polling for <30s duration

### Implementation Pattern
```typescript
// Client-side (app/priorities/page.tsx)
const [status, setStatus] = useState<'idle' | 'running' | 'completed'>('idle');

useEffect(() => {
  if (status !== 'running') return;

  const interval = setInterval(async () => {
    const res = await fetch(`/api/agent/sessions/${sessionId}`);
    const data = await res.json();

    if (data.session.status === 'completed' || data.session.status === 'failed') {
      setStatus(data.session.status);
      clearInterval(interval);
    }
  }, 2000);  // Poll every 2 seconds

  return () => clearInterval(interval);
}, [status, sessionId]);
```

---

## Research Task 6: Session Overwrite vs History Accumulation

### Decision
Use Supabase `INSERT ... ON CONFLICT (user_id) DO UPDATE` pattern to replace previous session when new prioritization triggered. Single row per user in `agent_sessions` table enforces FR-036 (only most recent result).

### Rationale
- **Spec Requirement**: FR-036 explicitly states "display only the most recent prioritization result (no historical session access required)" and FR-037 requires "overwrite previous session data when new prioritization is triggered".
- **Data Model Simplicity**: Single row per user eliminates need for filtering "latest session" queries, reduces storage (no unbounded growth), aligns with 7-day trace retention policy.
- **Atomic Operation**: Upsert provides transaction safety - either INSERT succeeds or UPDATE replaces, no race condition between read-check-write operations.

### Alternatives Considered
- **History Table with Active Flag**: Rejected - Violates FR-036/FR-037 (no history), adds query complexity
- **Separate Delete + Insert**: Rejected - Not atomic, race condition if concurrent requests
- **Application-Level Deduplication**: Rejected - Less robust than database constraint, requires extra query

### Implementation Schema
```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  outcome_id UUID NOT NULL REFERENCES user_outcomes(id),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  prioritized_plan JSONB,
  execution_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)  -- Enforce single session per user
);

-- Upsert pattern (pseudo-code)
INSERT INTO agent_sessions (user_id, outcome_id, status)
VALUES ($1, $2, 'running')
ON CONFLICT (user_id)
DO UPDATE SET
  outcome_id = EXCLUDED.outcome_id,
  status = EXCLUDED.status,
  created_at = NOW(),  -- Reset timestamp on new session
  updated_at = NOW();
```

**Cascade Cleanup**: When agent_sessions row updated, associated reasoning_traces auto-deleted via CASCADE (FR-037 compliance).

---

## Summary of Decisions

| Research Task | Decision | Rationale Summary |
|---------------|----------|-------------------|
| 1. Agent Configuration | Structured instructions, temp=0.2, maxSteps=10 | Deterministic reasoning, <30s execution, >80% tool accuracy |
| 2. Tool Integration | Direct pass-through, no adapter | Phase 2 tools already Mastra-compatible |
| 3. Trace Storage | PostgreSQL with cleanup trigger, session_id index | 7-day TTL via trigger, <100ms retrieval |
| 4. Result Parsing | Mastra `getExecutionTrace()` + JSON.parse with fallback | Structured trace API, graceful degradation |
| 5. Progress Indicator | 2-second polling, no SSE/WebSocket | Adequate for <30s execution, existing pattern |
| 6. Session Management | Upsert with UNIQUE(user_id) constraint | Atomic overwrite, single session per user |

**All NEEDS CLARIFICATION Resolved**: YES - No unknowns remain for Phase 1 design.

**Next Phase**: Phase 1 - Design & Contracts (data-model.md, contracts/, quickstart.md)
