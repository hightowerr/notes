# Implementation Tasks: Agent Runtime & Reasoning Loop

**Feature**: Phase 3 - Agent Runtime & Reasoning Loop (Mastra)
**Branch**: `007-docs-shape-pitches`
**Status**: Ready for Implementation

## Overview

This feature enables users to trigger autonomous task prioritization via a dedicated Task Priorities page. The system uses Mastra's agent runtime to analyze tasks through multi-step reasoning, automatically selecting tools to detect dependencies, semantic relationships, and execution waves. Users see prioritized results with execution waves, dependency graphs, confidence scores, and an expandable reasoning trace showing how the agent made decisions.

**Key User Journeys**:
1. Trigger prioritization → View execution waves → Expand reasoning trace
2. No outcome → See disabled state → Create outcome → Retry prioritization
3. Tool failure → See partial results with warning
4. New prioritization → Previous session replaced

## Tasks

### T001 [X] [SETUP] Database Schema for Agent Sessions and Reasoning Traces

**User Story**: As a developer, I can store agent session data and reasoning traces so that users can view prioritization results and reasoning history.

**Why Setup**: This is the only setup task - database schema is required for ALL subsequent slices to function. No user journeys can be completed without session persistence.

**Implementation Scope**:
- **Database Migrations**:
  - `supabase/migrations/011_create_agent_sessions.sql` - Agent sessions table with UNIQUE(user_id) constraint
  - `supabase/migrations/012_create_reasoning_traces.sql` - Reasoning traces with 7-day TTL
  - `supabase/migrations/013_add_trace_cleanup_trigger.sql` - Auto-delete trigger for expired traces
- **Validation**: Apply migrations via Supabase Dashboard SQL Editor
- **Feedback**: Query tables to confirm schema created: `\d agent_sessions`, `\d reasoning_traces`

**Test Scenario**:
1. Run migration 011 → Verify `agent_sessions` table exists with UNIQUE(user_id) index
2. Run migration 012 → Verify `reasoning_traces` table exists with session_id FK
3. Run migration 013 → Verify cleanup trigger created: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_cleanup_reasoning_traces';`
4. Insert test session → Verify UNIQUE constraint enforced (second insert for same user_id updates row)
5. Insert old trace (8 days ago) → Trigger new trace insert → Verify old trace auto-deleted

**Dependencies**: None - this enables all other tasks

**Files Created**:
- `supabase/migrations/011_create_agent_sessions.sql`
- `supabase/migrations/012_create_reasoning_traces.sql`
- `supabase/migrations/013_add_trace_cleanup_trigger.sql`

---

### T002 [X] [SLICE] User sees disabled state when no active outcome exists [P]

**User Story**: As a user without an active outcome, I see the Task Priorities page with disabled prioritization controls and a prompt to create an outcome first, so I understand what's required to use the feature.

**Implementation Scope**:
- **UI Entry Point**: `app/priorities/page.tsx` - Task Priorities page route
  - Fetch active outcome via GET `/api/outcomes`
  - Disable "Analyze Tasks" button if no outcome
  - Show prominent message: "Active outcome required for prioritization"
  - Display "Create Outcome" link/button to outcome creation flow
- **Backend**: Leverage existing GET `/api/outcomes` endpoint (T009)
- **Data Layer**: Read from `user_outcomes` table (existing)
- **Visible Outcome**: Disabled button + explanatory message + actionable link

**Test Scenario**:
1. Deactivate all outcomes: `UPDATE user_outcomes SET is_active = false;`
2. Navigate to `http://localhost:3000/priorities`
3. Verify "Analyze Tasks" button DISABLED (greyed out, not clickable)
4. Verify message displayed: "Active outcome required for prioritization"
5. Verify "Create Outcome" link visible
6. Click link → Verify navigates to outcome creation flow
7. Create outcome via UI
8. Return to `/priorities` → Verify button now ENABLED

**Dependencies**: T001 (database schema)

**Files Created/Modified**:
- `app/priorities/page.tsx` (new)
- `app/globals.css` (if new styles needed for disabled state)

---

### T003 [X] [SLICE] User triggers prioritization and sees progress indicator [P]

**User Story**: As a user with an active outcome and uploaded tasks, I can click "Analyze Tasks" and see a progress indicator while the agent analyzes, so I know the system is working.

**Implementation Scope**:
- **UI Entry Point**: `app/priorities/page.tsx` - "Analyze Tasks" button click handler
  - Trigger POST `/api/agent/prioritize` with outcome_id and user_id
  - Show progress indicator immediately (loading spinner + "Analyzing tasks..." message)
  - Disable button during analysis
  - Poll GET `/api/agent/sessions/[sessionId]` every 2 seconds
  - Hide progress indicator when status changes to 'completed' or 'failed'
- **Backend**:
  - `app/api/agent/prioritize/route.ts` - POST endpoint
    - Validate outcome exists
    - Create agent session (status='running')
    - Return session_id immediately (synchronous response)
    - **Note**: Actual agent execution stubbed for now (returns mock session)
  - `app/api/agent/sessions/[sessionId]/route.ts` - GET endpoint
    - Return session data by ID
    - Include status field for polling
- **Data Layer**:
  - INSERT into `agent_sessions` table
  - Read session via SELECT by id
- **Visible Outcome**: Progress indicator appears → polls every 2s → disappears when complete

**Test Scenario**:
1. Ensure active outcome exists + 3 documents uploaded
2. Navigate to `/priorities` → Click "Analyze Tasks"
3. Verify progress indicator appears immediately
4. Open DevTools Network tab → Verify polling requests to GET `/api/agent/sessions/[sessionId]` every ~2s
5. Verify button disabled during analysis
6. Mock session status change to 'completed' → Verify progress indicator disappears
7. Verify button re-enables

**Dependencies**: T001 (database), T002 (priorities page exists)

**Files Created/Modified**:
- `app/api/agent/prioritize/route.ts` (new)
- `app/api/agent/sessions/[sessionId]/route.ts` (new)
- `app/priorities/page.tsx` (modify - add trigger logic + polling)
- `lib/schemas/agentSessionSchema.ts` (new - Zod validation)
- `lib/types/agent.ts` (new - TypeScript types)

---

### T004 [X] [SLICE] Agent executes reasoning loop and stores prioritized results

**User Story**: As a user, when I trigger prioritization, the agent autonomously analyzes my tasks using tools and stores the prioritized execution plan, so I can view intelligent task ordering.

**Implementation Scope**:
- **Backend Services**:
  - `lib/mastra/agents/taskOrchestrator.ts` - Mastra agent definition
    - Configure with GPT-4o, temperature=0.2, maxSteps=10
    - Include instructions for tool selection (semantic-search → dependencies → clustering)
    - Pass Phase 2 tools array (semantic-search, detect-dependencies, cluster-by-similarity, get-document-context, query-task-graph)
  - `lib/mastra/services/agentOrchestration.ts` - `orchestrateTaskPriorities()` function
    - Build goal prompt with outcome context
    - Call `taskOrchestratorAgent.generate()`
    - Extract execution trace via `getExecutionTrace()`
    - Parse agent response to structured PrioritizedTaskPlan
    - Store in agent_sessions.prioritized_plan
    - Store reasoning trace in reasoning_traces table
  - `lib/mastra/services/resultParser.ts` - Result parsing utilities
    - `extractDependenciesFromTrace()` - Aggregate detect-dependencies tool outputs
    - `extractClustersFromTrace()` - Aggregate cluster-by-similarity outputs
    - `parseTasksFromResponse()` - JSON.parse with fallback to empty array
- **API Integration**:
  - Modify `app/api/agent/prioritize/route.ts` - Call `orchestrateTaskPriorities()` instead of stub
  - Update agent session status to 'completed' or 'failed'
- **Data Layer**:
  - UPDATE agent_sessions SET status='completed', prioritized_plan={...}, execution_metadata={...}
  - INSERT INTO reasoning_traces
- **Visible Outcome**: Session status changes to 'completed', polling stops, results available via GET /api/agent/sessions/[sessionId]

**Test Scenario**:
1. Trigger prioritization via "Analyze Tasks" button
2. Agent executes for <30s
3. Query database: `SELECT status, prioritized_plan FROM agent_sessions WHERE id = '[sessionId]';`
4. Verify status='completed'
5. Verify prioritized_plan JSONB contains ordered_task_ids[], execution_waves[], dependencies[]
6. Query reasoning_traces: Verify steps[] array populated with 1-10 steps
7. Verify tool calls visible in steps (semantic-search, detect-dependencies, etc.)

**Dependencies**: T003 (API endpoints exist)

**Files Created/Modified**:
- `lib/mastra/agents/taskOrchestrator.ts` (new)
- `lib/mastra/services/agentOrchestration.ts` (new)
- `lib/mastra/services/resultParser.ts` (new)
- `app/api/agent/prioritize/route.ts` (modify - integrate agent execution)
- `lib/schemas/prioritizedPlanSchema.ts` (new - Zod validation)
- `lib/schemas/reasoningTraceSchema.ts` (new)
- `lib/schemas/reasoningStepSchema.ts` (new)
- `lib/schemas/executionMetadataSchema.ts` (new)

---

### T005 [X] [SLICE] User views prioritized execution waves and dependencies

**User Story**: As a user, after prioritization completes, I can see tasks organized into execution waves (parallel vs sequential) with dependency relationships and confidence scores, so I understand the optimal task order.

**Implementation Scope**:
- **UI Entry Point**: `app/priorities/page.tsx` - Results display section
  - Fetch session data when status='completed'
  - Parse prioritized_plan from response
  - Render execution waves (Wave 1, Wave 2, etc.)
  - Display task names within each wave
  - Show dependency relationships (arrows or text: "Task A must complete before Task B")
  - Display confidence scores per task (0.0-1.0)
- **Components**:
  - `app/components/PrioritizationPanel.tsx` - Results display component
    - Props: prioritizedPlan (PrioritizedTaskPlan schema)
    - Render execution waves with task cards
    - Show parallel vs sequential execution flags
    - Display dependency graph (text-based or simple visualization)
    - Show confidence scores with color coding (green >0.8, yellow 0.6-0.8, red <0.6)
    - Include synthesis summary from agent
- **Backend**: Leverage existing GET `/api/agent/sessions/[sessionId]` (T003)
- **Data Layer**: Read agent_sessions.prioritized_plan
- **Visible Outcome**: Execution waves displayed, dependencies shown, confidence scores visible

**Test Scenario**:
1. Complete T004 (agent execution)
2. Navigate to `/priorities` → Verify prioritized results displayed
3. Verify "Execution Waves" section shows Wave 1, Wave 2, etc.
4. Verify Wave 1 labeled "Can start immediately"
5. Verify Wave 2+ labeled "Depends on Wave X"
6. Verify task names displayed within each wave
7. Verify dependency relationships shown (e.g., "Task A → Task B")
8. Verify confidence scores displayed per task (e.g., "Task A: 0.92")
9. Verify synthesis summary text displayed

**Dependencies**: T004 (agent execution complete)

**Files Created/Modified**:
- `app/components/PrioritizationPanel.tsx` (new)
- `app/priorities/page.tsx` (modify - add results display)

---

### T006 [X] [SLICE] User expands reasoning trace to see agent decision-making

**User Story**: As a user, after prioritization completes, I can expand a "View Reasoning" panel to see step-by-step how the agent made decisions (thoughts, tool calls, inputs/outputs), so I understand and trust the prioritization.

**Implementation Scope**:
- **UI Entry Point**: `app/priorities/page.tsx` - "View Reasoning" toggle button
  - Positioned below prioritization results
  - Click toggles ReasoningTracePanel visibility
- **Components**:
  - `app/components/ReasoningTracePanel.tsx` - Collapsible reasoning trace viewer
    - Props: sessionId
    - Fetch GET `/api/agent/sessions/[sessionId]/trace` on expand (or use cached data from session)
    - Render ordered list of reasoning steps (Step 1, Step 2, etc.)
    - Show for each step:
      - Thought/rationale text
      - Tool called (if any)
      - Tool input parameters (collapsible JSON)
      - Tool output summary (collapsible JSON)
      - Step duration (ms)
      - Status indicator (success/failed/skipped)
    - Expandable/collapsible step details
- **Backend**:
  - `app/api/agent/sessions/[sessionId]/trace/route.ts` - GET endpoint
    - Return reasoning_traces.steps[] for session
    - Include total_duration_ms
- **Data Layer**: Read reasoning_traces table via session_id JOIN
- **Visible Outcome**: Reasoning panel expands, shows step-by-step trace with tool details

**Test Scenario**:
1. Complete T005 (prioritization results displayed)
2. Click "View Reasoning" toggle
3. Verify panel expands showing reasoning steps
4. Verify steps numbered (Step 1, Step 2, etc.)
5. Verify each step shows thought text
6. Verify tool calls displayed (e.g., "semantic-search", "detect-dependencies")
7. Click step to expand details → Verify tool input JSON shown
8. Verify tool output summary shown
9. Verify step duration displayed (e.g., "1250ms")
10. Verify status indicator (green checkmark for success, red X for failed)

**Dependencies**: T005 (results panel exists)

**Files Created/Modified**:
- `app/components/ReasoningTracePanel.tsx` (new)
- `app/api/agent/sessions/[sessionId]/trace/route.ts` (new)
- `app/priorities/page.tsx` (modify - add reasoning trace toggle)

---

### T007 [X] [SLICE] Agent handles tool failures gracefully with partial results

**User Story**: As a user, if a tool fails during prioritization (e.g., detect-dependencies unavailable), I see partial results with a warning explaining what analysis couldn't complete, so I still get value despite the failure.

**Implementation Scope**:
- **Backend Services**:
  - Modify `lib/mastra/services/agentOrchestration.ts`:
    - Catch tool execution failures
    - Continue reasoning loop (don't abort session)
    - Mark session status='completed' (not 'failed') with partial plan
    - Increment execution_metadata.error_count
    - Set success_rate < 1.0
  - Modify `lib/mastra/services/resultParser.ts`:
    - Handle null/missing tool outputs gracefully
    - Return partial dependencies/clusters arrays (not empty)
- **UI Components**:
  - Modify `app/components/PrioritizationPanel.tsx`:
    - Check execution_metadata.error_count > 0
    - Display warning banner if errors detected: "Some analysis steps failed"
    - Show which tool failed based on reasoning trace
    - Display partial results with caveat text
  - Modify `app/components/ReasoningTracePanel.tsx`:
    - Highlight failed steps with red status indicator
    - Show error message or null output for failed steps
    - Confirm subsequent steps continued (agent didn't abort)
- **Data Layer**: Read execution_metadata.error_count, success_rate from agent_sessions
- **Visible Outcome**: Warning banner displayed, partial results shown, failed steps visible in trace

**Test Scenario** (Manual - requires simulating tool failure):
1. Temporarily disable `detect-dependencies` endpoint (comment out handler)
2. Trigger prioritization via "Analyze Tasks"
3. Verify agent completes within 30s (doesn't timeout)
4. Verify warning banner: "Some analysis steps failed: Dependency detection unavailable"
5. Verify partial prioritization shown (tasks still ordered)
6. Expand reasoning trace → Verify failed step marked with red X
7. Verify error message shown for failed step
8. Verify subsequent steps continued (not aborted)
9. Verify execution_metadata.error_count = 1, success_rate < 1.0

**Dependencies**: T006 (reasoning trace panel exists)

**Files Created/Modified**:
- `lib/mastra/services/agentOrchestration.ts` (modify - graceful error handling)
- `lib/mastra/services/resultParser.ts` (modify - handle null outputs)
- `app/components/PrioritizationPanel.tsx` (modify - warning banner)
- `app/components/ReasoningTracePanel.tsx` (modify - failed step highlighting)

---

### T008 [X] [SLICE] New prioritization replaces previous session (single session per user)

**User Story**: As a user, when I trigger a new prioritization, my previous session is replaced (not accumulated), so I only see my most recent analysis and minimize database storage.

**Implementation Scope**:
- **Backend Services**:
  - Modify `app/api/agent/prioritize/route.ts`:
    - Use upsert logic: `INSERT INTO agent_sessions (...) ON CONFLICT (user_id) DO UPDATE SET ...`
    - Overwrite existing session for user_id
    - Reset created_at timestamp on replacement
    - Cascade delete will auto-remove old reasoning_traces (ON DELETE CASCADE)
- **UI Behavior**:
  - Modify `app/priorities/page.tsx`:
    - Each "Analyze Tasks" click triggers new session
    - Previous session_id no longer accessible
    - Results display updates to new session automatically
- **Data Layer**:
  - UNIQUE(user_id) constraint enforces single session per user
  - CASCADE DELETE removes old reasoning_traces when session replaced
- **Visible Outcome**: New session ID generated, old session inaccessible, only one row per user in agent_sessions table

**Test Scenario**:
1. Trigger initial prioritization → Note session_id from response
2. Verify session accessible: GET `/api/agent/sessions/[sessionId]` returns 200
3. Trigger second prioritization → Note new session_id (different from step 1)
4. Verify old session inaccessible: GET `/api/agent/sessions/[oldSessionId]` returns 404
5. Query database: `SELECT count(*) FROM agent_sessions WHERE user_id = '[userId]';` → Verify count = 1
6. Verify updated_at timestamp reflects most recent prioritization
7. Query reasoning_traces: Verify only new session's traces exist (old traces CASCADE deleted)

**Dependencies**: T005 (full prioritization flow works)

**Files Created/Modified**:
- `app/api/agent/prioritize/route.ts` (modify - upsert logic)

---

### T009 [X] [SLICE] Old reasoning traces auto-delete after 7 days

**User Story**: As a system administrator, reasoning traces older than 7 days are automatically deleted to minimize database storage, while sessions themselves remain accessible.

**Implementation Scope**:
- **Database Trigger**: Already created in T001 (migration 013)
  - Trigger fires on INSERT to reasoning_traces
  - Deletes traces where created_at < NOW() - INTERVAL '7 days'
- **Backend Validation**:
  - Modify `app/api/agent/sessions/[sessionId]/trace/route.ts`:
    - Handle case where session exists but trace deleted (404 response)
    - Return error message: "Trace not found or expired (older than 7 days)"
- **UI Behavior**:
  - Modify `app/components/ReasoningTracePanel.tsx`:
    - Handle 404 response from trace endpoint
    - Show message: "Reasoning trace expired (older than 7 days)"
    - Disable "View Reasoning" toggle if trace unavailable
- **Data Layer**: Cleanup trigger deletes old reasoning_traces rows
- **Visible Outcome**: Old traces deleted, 404 error returned, UI shows expired message

**Test Scenario** (Manual - requires database manipulation):
1. Complete prioritization → Verify trace exists
2. Simulate 7-day passage: `UPDATE reasoning_traces SET created_at = NOW() - INTERVAL '8 days' WHERE session_id = '[sessionId]';`
3. Trigger new prioritization (any user) → Verify cleanup trigger executes
4. Query: `SELECT count(*) FROM reasoning_traces WHERE created_at < NOW() - INTERVAL '7 days';` → Verify 0 rows
5. Attempt GET `/api/agent/sessions/[oldSessionId]/trace` → Verify 404 response
6. Verify error message: "Trace not found or expired"
7. Verify "View Reasoning" toggle shows expired message in UI

**Dependencies**: T006 (reasoning trace retrieval works)

**Files Created/Modified**:
- `app/api/agent/sessions/[sessionId]/trace/route.ts` (modify - handle missing traces)
- `app/components/ReasoningTracePanel.tsx` (modify - expired state handling)

---

### T010 [X] [POLISH] Add navigation link to Task Priorities page

**User Story**: As a user, I can easily navigate to the Task Priorities page from the main navigation, so I can access prioritization without typing the URL.

**Implementation Scope**:
- **UI Entry Point**: Main navigation component (likely `app/components/Header.tsx` or `app/layout.tsx`)
  - Add "Task Priorities" link to navigation menu
  - Link to `/priorities` route
  - Highlight active state when on priorities page
- **Design**: Follow existing navigation pattern (same styling as "Dashboard", "Upload", etc.)
- **Visible Outcome**: Navigation link visible, clicking navigates to `/priorities`

**Test Scenario**:
1. Navigate to homepage
2. Verify "Task Priorities" link in main navigation
3. Click link → Verify navigates to `/priorities` page
4. Verify link has active/highlighted state when on priorities page
5. Test from dashboard → Verify link still visible and functional

**Dependencies**: T002 (priorities page exists)

**Files Created/Modified**:
- `app/layout.tsx` or `app/components/Header.tsx` (modify - add nav link)

---

### T011 [X] [POLISH] Add contract tests for agent API endpoints

**User Story**: As a developer, I have automated tests validating agent API request/response schemas, so breaking changes are caught early.

**Implementation Scope**:
- **Test Files**:
  - `__tests__/contract/agent-prioritize.test.ts` - POST /api/agent/prioritize
    - Assert request body schema (outcome_id, user_id)
    - Assert response schema (session_id, status, execution_metadata)
    - Assert 403 when no active outcome
  - `__tests__/contract/agent-sessions.test.ts` - GET /api/agent/sessions/[sessionId]
    - Assert response schema (session, trace objects)
    - Assert 404 for invalid session_id
  - `__tests__/contract/agent-trace.test.ts` - GET /api/agent/sessions/[sessionId]/trace
    - Assert response schema (steps[], total_duration_ms)
    - Assert 404 for expired/missing traces
- **Test Framework**: Vitest with Zod schema validation
- **Visible Outcome**: `npm run test:contract` passes with 3 new test files

**Test Scenario**:
1. Run `npm run test:contract`
2. Verify all 3 contract tests pass
3. Modify response schema (e.g., remove required field) → Verify test fails
4. Restore schema → Verify test passes
5. Run in CI pipeline → Verify tests run automatically

**Dependencies**: T008 (all API endpoints implemented)

**Files Created**:
- `__tests__/contract/agent-prioritize.test.ts`
- `__tests__/contract/agent-sessions.test.ts`
- `__tests__/contract/agent-trace.test.ts`

---

### T012 [X] [POLISH] Add integration test for end-to-end agent session

**User Story**: As a developer, I have an automated integration test validating the complete prioritization flow (trigger → agent execution → results retrieval), so regressions are detected.

**Implementation Scope**:
- **Test Files**:
  - `__tests__/integration/agent-orchestration.test.ts` - End-to-end flow
    - Setup: Create active outcome, upload test documents with tasks
    - Trigger POST /api/agent/prioritize
    - Poll GET /api/agent/sessions/[sessionId] until status='completed'
    - Assert prioritized_plan contains ordered_task_ids, execution_waves, dependencies
    - Fetch GET /api/agent/sessions/[sessionId]/trace
    - Assert reasoning steps exist (1-10 steps)
    - Assert tool calls visible (semantic-search, detect-dependencies, etc.)
    - Verify execution_metadata.total_time_ms < 30000
- **Test Framework**: Vitest with database cleanup hooks
- **Visible Outcome**: `npm run test:integration` passes with new test file

**Test Scenario**:
1. Run `npm run test:integration`
2. Verify agent-orchestration test passes
3. Verify test executes full flow (trigger → poll → results)
4. Verify assertions pass for prioritized_plan structure
5. Verify reasoning trace assertions pass
6. Break agent execution (e.g., remove tool) → Verify test fails
7. Restore → Verify test passes

**Dependencies**: T008 (full flow implemented)

**Files Created**:
- `__tests__/integration/agent-orchestration.test.ts`

---

### T013 [POLISH] Add unit tests for result parser service

**User Story**: As a developer, I have unit tests for result parsing logic, so edge cases (invalid JSON, missing tool outputs) are handled correctly.

**Implementation Scope**:
- **Test File**:
  - `__tests__/unit/services/resultParser.test.ts`
    - Test `extractDependenciesFromTrace()` with mocked trace
    - Test `extractClustersFromTrace()` with mocked trace
    - Test `parseTasksFromResponse()` with valid JSON
    - Test `parseTasksFromResponse()` with invalid JSON (fallback to empty array)
    - Test edge cases: null tool outputs, empty steps array, missing fields
- **Test Framework**: Vitest with mocked Mastra execution traces
- **Visible Outcome**: `npm run test:unit` passes with new test file

**Test Scenario**:
1. Run `npm run test:unit`
2. Verify result parser tests pass
3. Verify JSON parsing fallback works (invalid JSON → empty array)
4. Verify null tool output handling (no crash, graceful degradation)
5. Break parser logic → Verify tests fail
6. Restore → Verify tests pass

**Dependencies**: T004 (result parser service exists)

**Files Created**:
- `__tests__/unit/services/resultParser.test.ts`

---

## Task Execution Order

**Phase 1: Foundation** (Setup + First Vertical Slice)
1. T001 [SETUP] Database schema - **REQUIRED FIRST** (enables all other tasks)
2. T002 [SLICE] Disabled state (no outcome) - **[P]** (independent, can run parallel with T003)
3. T003 [SLICE] Trigger + progress indicator - **[P]** (independent, needs T001)

**Phase 2: Core Agent Functionality** (Sequential - builds on previous)
4. T004 [SLICE] Agent execution + storage (needs T003 API endpoints)
5. T005 [SLICE] Results display (needs T004 agent data)
6. T006 [SLICE] Reasoning trace panel (needs T005 results panel)

**Phase 3: Edge Cases** (Sequential - modifies existing slices)
7. T007 [SLICE] Tool failure handling (needs T006 trace panel)
8. T008 [SLICE] Session replacement (needs T005 full flow)
9. T009 [SLICE] Trace expiry (needs T006 trace retrieval)

**Phase 4: Polish** (Parallel - independent improvements)
10. T010 [POLISH] Navigation link - **[P]**
11. T011 [POLISH] Contract tests - **[P]**
12. T012 [POLISH] Integration test - **[P]**
13. T013 [POLISH] Unit tests - **[P]**

**Parallel Execution Opportunities**:
- T002 + T003 can run in parallel (independent UI slices)
- T010 + T011 + T012 + T013 can all run in parallel (independent polish tasks)

**Critical Path**: T001 → T003 → T004 → T005 → T006 → T007 → T008 → T009 (9 tasks minimum before feature complete)

---

## Success Criteria

**Feature Complete When**:
- ✅ All 13 tasks completed
- ✅ User can trigger prioritization and view execution waves
- ✅ Reasoning trace shows agent decision-making
- ✅ Disabled state enforces outcome requirement
- ✅ Tool failures degrade gracefully with warnings
- ✅ Session replacement works (single session per user)
- ✅ 7-day trace cleanup functional
- ✅ Manual test scenarios from quickstart.md pass (7 scenarios)
- ✅ Automated tests pass (contract + integration + unit)
- ✅ Performance targets met: <30s execution (95th percentile), ≤10 reasoning steps (90% of sessions)

**Validation**: Run quickstart.md test scenarios 1-7 manually + automated test suite via `npm run test`

---

**Ready for `/implement` command** - Each task is a complete vertical slice delivering user-testable value.
