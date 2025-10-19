# Quickstart: Agent Runtime & Reasoning Loop

**Feature**: Phase 3 - Agent Runtime & Reasoning Loop
**Date**: 2025-10-19
**Purpose**: Manual test scenarios for end-to-end validation

## Prerequisites

Before running these scenarios:

1. **Database Migrations Applied**:
   - `011_create_agent_sessions.sql` - Agent sessions table
   - `012_create_reasoning_traces.sql` - Reasoning traces with 7-day TTL
   - `013_add_trace_cleanup_trigger.sql` - Auto-cleanup trigger

2. **Dependencies Available**:
   - Phase 2 tools implemented (Spec 006): semantic-search, get-document-context, detect-dependencies, query-task-graph, cluster-by-similarity
   - Active outcome statement exists (T008-T011 complete)
   - Uploaded documents with extracted tasks (T001-T002 complete)
   - Vector embeddings generated (T020-T027 complete)

3. **Environment Configuration**:
   - Mastra agent configured with `maxSteps: 10`
   - OpenAI API key set (GPT-4o for agent reasoning)
   - Supabase connection active

---

## Scenario 1: Happy Path - Complete Prioritization Flow

**User Story**: As a user with an active outcome and uploaded tasks, I can trigger agent prioritization and view prioritized execution waves.

**Setup**:
1. Ensure active outcome exists: "Increase monthly recurring revenue by 25% within 6 months"
2. Ensure 3+ documents uploaded with at least 50 extracted tasks
3. Navigate to `http://localhost:3000`

**Steps**:
1. Click "Task Priorities" link in main navigation
   - **Verify**: Page loads without errors
   - **Verify**: "Analyze Tasks" button is visible and enabled

2. Click "Analyze Tasks" button
   - **Verify**: Progress indicator appears immediately
   - **Verify**: Button becomes disabled during analysis
   - **Verify**: Status message shows "Analyzing tasks..."

3. Wait for prioritization to complete (<30 seconds)
   - **Verify**: Progress indicator disappears
   - **Verify**: "Analyze Tasks" button re-enables
   - **Verify**: Prioritized task list displays

4. Inspect prioritized results
   - **Verify**: Tasks organized into "Execution Waves" (Wave 1, Wave 2, etc.)
   - **Verify**: Each wave shows task names and wave number
   - **Verify**: Dependency relationships indicated (e.g., "Task A must complete before Task B")
   - **Verify**: Confidence scores displayed for each task (0.0-1.0 range)

5. Click "View Reasoning" panel toggle
   - **Verify**: Panel expands showing reasoning trace
   - **Verify**: Step-by-step decisions visible (Step 1, Step 2, etc.)
   - **Verify**: Each step shows: thought, tool called (if any), duration

6. Inspect specific reasoning step details
   - **Verify**: Tool input parameters displayed (e.g., `semantic-search` with query text)
   - **Verify**: Tool output summary shown (e.g., "Found 15 tasks")
   - **Verify**: Step status indicated (success/failed/skipped)

**Expected Outcome**: User sees prioritized tasks in execution order with reasoning trace available for transparency.

**Exit Criteria**: All 6 verification points pass.

---

## Scenario 2: Progress Indicator During Analysis

**User Story**: As a user, I see progress feedback while the agent analyzes tasks, and can view the reasoning trace after completion.

**Setup**:
1. Ensure active outcome and documents exist (as Scenario 1)
2. Open browser DevTools Network tab

**Steps**:
1. Navigate to `/priorities` page and click "Analyze Tasks"
   - **Verify**: Progress indicator displays with "Analyzing..." message
   - **Verify**: UI remains responsive (not frozen)

2. Observe network requests (every 2 seconds)
   - **Verify**: Polling requests to `GET /api/agent/sessions/[sessionId]`
   - **Verify**: Request interval ~2 seconds

3. Wait for status change to 'completed'
   - **Verify**: Progress indicator disappears automatically
   - **Verify**: Polling stops after completion
   - **Verify**: Results render immediately after last poll

4. Expand "View Reasoning" panel
   - **Verify**: Panel loads without additional network request (data already fetched)
   - **Verify**: All reasoning steps (1-10) displayed in order
   - **Verify**: Each step shows thought process and tool usage

5. Click on individual reasoning step
   - **Verify**: Step details expand showing full tool input/output
   - **Verify**: Timestamps shown for each step
   - **Verify**: Step duration displayed in milliseconds

**Expected Outcome**: User experiences smooth progress feedback with detailed reasoning trace available post-completion.

**Exit Criteria**: All 5 verification points pass.

---

## Scenario 3: View Dependencies and Confidence Scores

**User Story**: As a user, I can see which tasks must complete first (prerequisites), which are blocked, and which can run in parallel, with confidence scores.

**Setup**:
1. Ensure outcome and documents with dependent tasks exist
2. Trigger prioritization (Scenario 1 steps 1-3)

**Steps**:
1. Review prioritization results page
   - **Verify**: "Execution Waves" section visible
   - **Verify**: Wave 1 tasks labeled "Can start immediately"
   - **Verify**: Wave 2+ tasks labeled "Depends on Wave X"

2. Inspect dependency graph (if visualized)
   - **Verify**: Arrows/lines connecting dependent tasks
   - **Verify**: Relationship type shown (prerequisite/blocks/related)
   - **Verify**: Confidence score displayed per dependency (0.0-1.0)

3. Review confidence scores section
   - **Verify**: Each task has confidence score (e.g., "Task A: 0.92")
   - **Verify**: Scores range from 0.0 to 1.0
   - **Verify**: Lower confidence tasks flagged or highlighted (< 0.7 threshold)

4. Expand "View Reasoning" panel
   - **Verify**: "detect-dependencies" tool call visible in trace
   - **Verify**: Tool output shows discovered relationships
   - **Verify**: "cluster-by-similarity" tool call shows task grouping

5. Review synthesis summary
   - **Verify**: Agent's explanation of prioritization displayed
   - **Verify**: Summary mentions key dependencies and rationale

**Expected Outcome**: User understands task execution order, dependencies, and confidence in prioritization decisions.

**Exit Criteria**: All 5 verification points pass.

---

## Scenario 4: Partial Results on Tool Failure

**User Story**: As a user, if tool execution fails during analysis, I see partial prioritization results with a warning about missing analysis.

**Setup**:
1. Simulate tool failure (e.g., temporarily disable `detect-dependencies` endpoint)
2. Ensure active outcome and documents exist

**Steps**:
1. Trigger prioritization via "Analyze Tasks" button
   - **Verify**: Analysis proceeds despite tool failure
   - **Verify**: Agent completes within 30 seconds

2. Review results page
   - **Verify**: Warning banner displayed: "Some analysis steps failed"
   - **Verify**: Warning specifies which tool failed (e.g., "Dependency detection unavailable")
   - **Verify**: Partial prioritization shown (based on available data)

3. Inspect reasoning trace
   - **Verify**: Failed step visible with `status: 'failed'`
   - **Verify**: Error message or null output indicated
   - **Verify**: Subsequent steps continued (agent didn't abort)

4. Review prioritized tasks
   - **Verify**: Tasks still ordered (even without full dependency info)
   - **Verify**: Confidence scores reflect incomplete analysis (lower scores)
   - **Verify**: Synthesis summary mentions limitations ("without dependency analysis...")

5. Check execution metadata
   - **Verify**: `error_count` > 0 in metadata
   - **Verify**: `success_rate` < 1.0 (some steps failed)

**Expected Outcome**: User receives best-effort prioritization with clear indication of analysis gaps (FR-022 compliance).

**Exit Criteria**: All 5 verification points pass.

---

## Scenario 5: Disabled State Without Active Outcome

**User Story**: As a user without an active outcome, I see prioritization controls disabled with a prompt to create an outcome first.

**Setup**:
1. Ensure NO active outcome exists (deactivate any existing outcomes)
2. Ensure documents with tasks uploaded (to test outcome dependency, not task availability)

**Steps**:
1. Navigate to `/priorities` page
   - **Verify**: Page loads without errors
   - **Verify**: "Analyze Tasks" button is DISABLED (greyed out, not clickable)

2. Review page content
   - **Verify**: Prominent message displayed: "Active outcome required for prioritization"
   - **Verify**: Message explains why feature disabled
   - **Verify**: Link/button to create outcome visible ("Create Outcome" or similar)

3. Attempt to click disabled "Analyze Tasks" button
   - **Verify**: No API request triggered
   - **Verify**: No error message (button simply non-interactive)

4. Click "Create Outcome" link
   - **Verify**: Navigates to outcome creation flow
   - **Verify**: User can create outcome without returning to priorities page

5. After creating outcome, return to `/priorities` page
   - **Verify**: "Analyze Tasks" button now ENABLED
   - **Verify**: Prompt message replaced with instructions ("Click Analyze to prioritize...")

**Expected Outcome**: User understands outcome requirement and can easily create one to enable prioritization (FR-031, FR-032, FR-033 compliance).

**Exit Criteria**: All 5 verification points pass.

---

## Scenario 6: Session Replacement (Most Recent Only)

**User Story**: As a user, when I trigger a new prioritization, the previous session is replaced (no historical accumulation per FR-036, FR-037).

**Setup**:
1. Ensure active outcome and documents exist
2. Complete Scenario 1 (initial prioritization)

**Steps**:
1. Note current session ID from results page or network DevTools
   - **Verify**: Session ID visible (e.g., in URL or metadata section)

2. Trigger second prioritization (click "Analyze Tasks" again)
   - **Verify**: New analysis starts
   - **Verify**: Progress indicator shows

3. Wait for completion
   - **Verify**: New session ID generated (different from step 1)
   - **Verify**: Results display new prioritization

4. Attempt to access previous session via API (if session ID saved)
   - **Verify**: GET `/api/agent/sessions/[oldSessionId]` returns 404 or "not found"
   - **Verify**: Only most recent session accessible

5. Check database (via Supabase dashboard or SQL query)
   - **Verify**: Single row in `agent_sessions` table for user
   - **Verify**: `updated_at` timestamp reflects most recent prioritization
   - **Verify**: Previous session's `reasoning_traces` deleted (CASCADE)

**Expected Outcome**: User can only access most recent prioritization session, previous session data overwritten (FR-036, FR-037 compliance).

**Exit Criteria**: All 5 verification points pass.

---

## Scenario 7: Reasoning Trace Expiry (7-Day TTL)

**User Story**: As a user, reasoning traces are automatically deleted after 7 days to minimize storage (FR-020 compliance).

**Setup**:
1. Complete Scenario 1 (create agent session)
2. Access Supabase SQL Editor

**Steps**:
1. Query `reasoning_traces` table immediately after session
   ```sql
   SELECT id, session_id, created_at FROM reasoning_traces WHERE session_id = '[sessionId]';
   ```
   - **Verify**: Row exists with current timestamp

2. Simulate 7-day passage (update `created_at` manually for testing)
   ```sql
   UPDATE reasoning_traces SET created_at = NOW() - INTERVAL '8 days' WHERE session_id = '[sessionId]';
   ```
   - **Verify**: Timestamp updated to 8 days ago

3. Trigger new prioritization session (any user)
   - **Verify**: Cleanup trigger executes on INSERT

4. Query `reasoning_traces` again
   ```sql
   SELECT id, session_id, created_at FROM reasoning_traces WHERE created_at < NOW() - INTERVAL '7 days';
   ```
   - **Verify**: Old trace deleted (zero rows returned)

5. Attempt to access expired trace via API
   - **Verify**: GET `/api/agent/sessions/[oldSessionId]/trace` returns 404
   - **Verify**: Error message: "Trace not found or expired"

**Expected Outcome**: Reasoning traces older than 7 days auto-deleted, minimizing database storage (FR-020 compliance).

**Exit Criteria**: All 5 verification points pass.

---

## Performance Validation

### Target Metrics (from spec NFR-001, NFR-002, NFR-003)

Run Scenarios 1-3 with varying task counts and measure:

**Execution Time** (NFR-002):
- 50 tasks: <10 seconds
- 100 tasks: <20 seconds
- 200 tasks: <30 seconds (95th percentile target)

**Reasoning Steps** (NFR-001):
- 90% of sessions: ≤10 steps
- Check: `execution_metadata.steps_taken` in response

**Tool Selection Accuracy** (NFR-003):
- Manual review: Agent picks relevant tools (>80% appropriate)
- Check: Reasoning trace shows semantic-search → dependencies → clustering (logical sequence)

**Test Procedure**:
1. Run 10 prioritization sessions with 50-200 tasks each
2. Record `execution_metadata.total_time_ms` for each
3. Calculate 95th percentile execution time
4. Count sessions with `steps_taken ≤ 10`
5. Manually review 5 reasoning traces for tool relevance

**Pass Criteria**:
- 95th percentile time <30,000 ms
- ≥9 out of 10 sessions use ≤10 steps
- ≥8 out of 10 traces show logical tool usage

---

## Troubleshooting

### Issue: "Analyze Tasks" button stays disabled

**Cause**: No active outcome exists (FR-031)

**Fix**:
1. Check outcome status: `SELECT * FROM user_outcomes WHERE is_active = true;`
2. If no row: Create outcome via UI or API
3. Refresh `/priorities` page

---

### Issue: Progress indicator never completes

**Cause**: Agent execution timeout or infinite loop

**Debug**:
1. Check agent session status: `SELECT status FROM agent_sessions WHERE id = '[sessionId]';`
2. If `status = 'running'` after >60s: Agent hung
3. Check Mastra logs for error or step count >10
4. Verify `maxSteps: 10` configured in agent definition

**Fix**: Restart agent execution, check tool availability

---

### Issue: Reasoning trace shows empty steps

**Cause**: Mastra telemetry not capturing step data

**Debug**:
1. Check `reasoning_traces.steps` column: `SELECT steps FROM reasoning_traces WHERE session_id = '[sessionId]';`
2. If `steps = []`: Result parser not extracting from Mastra `getExecutionTrace()`
3. Verify Mastra telemetry enabled in config

**Fix**: Enable telemetry, re-run session

---

### Issue: 404 on trace retrieval after <7 days

**Cause**: Cleanup trigger deleting too aggressively

**Debug**:
1. Check trigger logic: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_cleanup_reasoning_traces';`
2. Verify condition: `created_at < NOW() - INTERVAL '7 days'`
3. Check actual `created_at` value: `SELECT created_at FROM reasoning_traces WHERE id = '[traceId]';`

**Fix**: Correct trigger condition if too aggressive, or restore from backup if needed

---

## Success Checklist

After running all scenarios:

- [ ] Scenario 1: Happy path complete (prioritized tasks + reasoning trace visible)
- [ ] Scenario 2: Progress indicator works (polling, trace expansion)
- [ ] Scenario 3: Dependencies and confidence shown correctly
- [ ] Scenario 4: Partial results on tool failure (graceful degradation)
- [ ] Scenario 5: Disabled state without outcome (FR-031/32/33)
- [ ] Scenario 6: Session replacement (single session per user)
- [ ] Scenario 7: 7-day TTL cleanup works
- [ ] Performance targets met (95th percentile <30s, ≤10 steps, >80% tool accuracy)

**Phase 1 Complete** → Ready for Phase 2 (/tasks command)
