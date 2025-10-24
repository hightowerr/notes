# Data Model: Reasoning Trace Enhancements

**Feature**: 009-docs-shape-pitches
**Date**: 2025-10-23

## Overview

This feature reuses existing data schemas for reasoning traces. No new database tables or API endpoints are required. All enhancements are client-side UI improvements that consume existing data structures.

---

## Existing Schemas (No Changes)

### ReasoningTraceRecord

**Source**: `lib/types/reasoning-trace.ts` (existing)

**Purpose**: Represents the complete execution history for an agent session

**Schema**:
```typescript
interface ReasoningTraceRecord {
  id: string;                    // UUID
  session_id: string;            // References agent_sessions.id
  step_number: number;           // Sequential step counter (1-based)
  tool_name: string;             // e.g., 'semantic-search', 'detect-dependencies'
  status: 'success' | 'failed' | 'skipped';
  input: Record<string, any>;    // Tool input parameters (JSON)
  output: Record<string, any> | null; // Tool output (JSON, null if failed)
  error_message: string | null;  // Error details if status === 'failed'
  duration_ms: number;           // Execution time in milliseconds
  created_at: string;            // ISO 8601 timestamp
}
```

**Database Table**: `reasoning_traces`
- Indexed on `session_id` for efficient retrieval
- 7-day retention (automatic cleanup via trigger)

**Usage in This Feature**:
- Filter by `tool_name` (dropdown filter)
- Filter by `status` (checkbox filter)
- Highlight when `status === 'failed'` (error styling)
- Display `error_message` in failed steps (inline error display)
- Sort by `step_number` (maintain original order in filtered views)

---

### AgentSessionRecord

**Source**: `lib/types/agent.ts` (existing)

**Purpose**: Links a reasoning trace to a specific agent execution and user context

**Schema**:
```typescript
interface AgentSessionRecord {
  id: string;                    // UUID (session_id in traces)
  user_id: string;               // References auth.users.id
  outcome_id: string | null;     // References user_outcomes.id
  status: 'running' | 'completed' | 'failed';
  execution_metadata: {
    started_at: string;          // ISO 8601
    completed_at: string | null;
    total_steps: number;
    failed_steps: number;
    tools_used: string[];        // Array of tool names
  };
  created_at: string;
  updated_at: string;
}
```

**Database Table**: `agent_sessions`

**Usage in This Feature**:
- Display `execution_metadata.total_steps` in "View Reasoning" button (step count)
- Use `execution_metadata.tools_used` to populate tool filter dropdown
- Export includes full `execution_metadata` (context for debugging)

---

## Client-Side Data Structures (New)

These are UI-only structures, not persisted to database.

### FilterState

**Purpose**: Tracks active filters for reasoning trace display

**Schema**:
```typescript
interface FilterState {
  toolType: string;              // 'all' | specific tool name
  statusFilters: {
    success: boolean;
    failed: boolean;
    skipped: boolean;
  };
  showOnlyFailed: boolean;       // Quick toggle for failed-only view
}
```

**Storage**: React component state (resets on page reload per clarification)

**Validation**:
- At least one status filter must be true (if all unchecked, default to all true)
- `toolType` must be 'all' or valid Mastra tool name

---

### StoragePreferences

**Purpose**: Persists user preferences across page reloads

**Schema**:
```typescript
interface StoragePreferences {
  // localStorage (persists across page reloads)
  traceCollapsed: boolean;       // Collapse/expand state for trace panel

  // sessionStorage (resets on tab close)
  hasSeenTrace: boolean;         // First-visit auto-expand tracking
}
```

**Storage**:
- `traceCollapsed`: `localStorage` key `reasoning-trace-collapsed`
- `hasSeenTrace`: `sessionStorage` key `trace-first-visit`

**Default Values**:
- `traceCollapsed`: `false` (expanded by default)
- `hasSeenTrace`: `false` (trigger auto-expand)

---

### ExportPayload

**Purpose**: JSON structure for exported reasoning traces

**Schema**:
```typescript
interface ExportPayload {
  session_id: string;
  exported_at: string;           // ISO 8601 timestamp of export
  execution_metadata: {
    started_at: string;
    completed_at: string | null;
    total_steps: number;
    failed_steps: number;
    tools_used: string[];
  };
  steps: ReasoningTraceRecord[];
}
```

**Generation Logic**:
```typescript
const payload: ExportPayload = {
  session_id: session.id,
  exported_at: new Date().toISOString(),
  execution_metadata: session.execution_metadata,
  steps: traceSteps, // Full array from API response
};

const filename = `reasoning-trace-${session.id}-${Date.now()}.json`;
const json = JSON.stringify(payload, null, 2); // Pretty-print with 2-space indent
```

---

## Data Flow

### 1. Trace Fetching (Existing)

```
User navigates to /priorities → page.tsx loads
                              ↓
GET /api/agent/sessions/latest?outcome_id={id}
                              ↓
Returns: AgentSessionRecord with session_id
                              ↓
GET /api/agent/sessions/{session_id}/trace
                              ↓
Returns: ReasoningTraceRecord[] (sorted by step_number)
                              ↓
Pass to ReasoningTracePanel component
```

**No changes to existing flow**

---

### 2. Filtering (New - Client-Side)

```
User selects filter (tool type or status)
                ↓
Update FilterState (React useState)
                ↓
useMemo recalculates filteredSteps:
  - Filter by toolType (if not 'all')
  - Filter by status (if unchecked in statusFilters)
  - Preserve original step_number for display
                ↓
Re-render trace with filtered array
```

**Performance**: <100ms via memoization (no API calls)

---

### 3. Export (New - Client-Side)

```
User clicks Export button
                ↓
Build ExportPayload from session + traceSteps
                ↓
Try: Blob → URL.createObjectURL → download link
                ↓
Catch: navigator.clipboard.writeText(json)
                ↓
Show toast notification (success or fallback)
```

**Performance**: <500ms for typical traces (10-20 steps)

---

### 4. Auto-Expand (New - Client-Side)

```
Component mount → Read sessionStorage 'trace-first-visit'
                ↓
If false (first visit this session):
  - Set trace panel to expanded
  - Write true to sessionStorage
                ↓
If true (subsequent visit this session):
  - Read localStorage 'reasoning-trace-collapsed'
  - Apply saved preference
```

**Lifecycle**: sessionStorage cleared on tab close, localStorage persists

---

## Validation Rules

### FilterState Validation

- **toolType**: Must be 'all' or one of `['semantic-search', 'detect-dependencies', 'get-document-context', 'query-task-graph', 'cluster-by-similarity']`
- **statusFilters**: At least one must be true (enforce in UI or default to all true)
- **showOnlyFailed**: Boolean (no validation needed)

### StoragePreferences Validation

- **traceCollapsed**: Boolean, defaults to `false` if missing or invalid
- **hasSeenTrace**: Boolean, defaults to `false` if missing or invalid
- **Quota Exceeded**: Gracefully handle `QuotaExceededError` by falling back to in-memory state

### ExportPayload Validation

- **session_id**: Must be valid UUID
- **exported_at**: Must be valid ISO 8601 timestamp
- **steps**: Must be non-empty array (show error if trace has 0 steps)
- **Total size**: Typical trace (20 steps) ~50KB JSON, max expected ~500KB (50 steps with verbose tool outputs)

---

## Error Handling

### Missing Data

- **No trace steps** (length === 0): Show "No reasoning trace available" message, disable export button
- **Missing execution_metadata**: Fallback to `{ total_steps: steps.length, failed_steps: steps.filter(s => s.status === 'failed').length }`
- **Invalid step_number**: Log warning, render with "Step ?" placeholder

### Storage Errors

- **localStorage disabled**: Fallback to in-memory state, trace preference lost on reload (acceptable degradation)
- **sessionStorage disabled**: Auto-expand triggers every page load (acceptable degradation)
- **QuotaExceededError**: Clear old keys, retry once, then fallback to in-memory state

### Export Errors

- **Blob creation fails**: Immediately fallback to clipboard copy (no retry)
- **Clipboard API unavailable**: Show error toast "Export failed, please copy trace manually" (display JSON in modal)
- **JSON serialization fails** (circular reference, BigInt, etc.): Log error, export with `{ error: 'Serialization failed', session_id }` placeholder

---

## Performance Considerations

### Filtering Performance

- **Target**: <100ms for 50 steps
- **Strategy**: `useMemo` with dependencies on `[traceSteps, filterState]`
- **Complexity**: O(n) array filter operations (linear with step count)

### Export Performance

- **Target**: <500ms for typical traces (10-20 steps)
- **Bottleneck**: `JSON.stringify` (fast for <1MB payloads)
- **Optimization**: Pre-calculate payload structure, avoid redundant cloning

### Auto-Expand Performance

- **sessionStorage read**: <1ms (synchronous browser API)
- **localStorage read**: <1ms (synchronous browser API)
- **No network overhead**: All client-side logic

---

## Testing Strategy

### Contract Tests (Manual)

- **Filter application**: Given trace with 10 steps (3 failed), when filter "failed only", expect 3 steps shown with original numbering preserved
- **Export structure**: Given session with 5 steps, when export, expect JSON with all required fields (session_id, exported_at, execution_metadata, steps)
- **Auto-expand logic**: Given first visit (hasSeenTrace === false), when page loads, expect trace expanded and sessionStorage updated

### Edge Cases (Manual)

- **Zero steps**: Verify "No reasoning trace available" message shown
- **50+ steps**: Verify no performance degradation (<100ms filter, no scroll jank)
- **localStorage disabled**: Verify trace still functional (in-memory state fallback)
- **Export failure**: Verify clipboard fallback triggers with toast notification

---

## Migration Notes

**No database migrations required** - this feature uses existing schemas without modifications.

**Future Considerations**:
- If trace comparison feature added (Phase 6+), may need `trace_snapshots` table to store historical exports
- If advanced filtering added (regex search), may need full-text search index on `tool_name` and `error_message`

---

## References

- Existing types: `lib/types/reasoning-trace.ts`, `lib/types/agent.ts`
- Database schema: `supabase/migrations/012_create_reasoning_traces.sql`
- API endpoints: `app/api/agent/sessions/[sessionId]/trace/route.ts`
