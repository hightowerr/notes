# Tasks: Manual Task Creation (Phase 18)

**Feature**: 016-manual-task-creation
**Branch**: `016-manual-task-creation`
**Input**: Design documents from `specs/016-manual-task-creation/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

## Format: `[ID] [P?] [SLICE/SETUP/POLISH] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[SLICE]**: Complete vertical slice (UI + Backend + Data + Feedback)
- **[SETUP]**: Infrastructure task blocking slices
- **[POLISH]**: Enhancement to existing working slice
- **[Story]**: User story ID (US1-US6)

## Path Conventions

- **Next.js App Router**: `app/` (routes + server components)
- **API Routes**: `app/api/` (Next.js route handlers)
- **Services**: `lib/services/` (business logic)
- **Schemas**: `lib/schemas/` (Zod validation)
- **Components**: `app/components/` (shared), `app/priorities/components/` (feature-specific)
- **Tests**: `__tests__/contract/`, `__tests__/integration/`, `__tests__/unit/`
- **Database**: `supabase/migrations/`

---

## Phase 1: Database Foundation (Blocking All Slices)

**Purpose**: Create `manual_tasks` table for agent placement metadata

**⚠️ CRITICAL**: No user story work can begin until this is complete

- [ ] T001 [SETUP] Create manual_tasks table migration
  - **File**: `supabase/migrations/029_create_manual_tasks.sql`
  - **SEE**: Migration file in supabase/migrations/
  - **DO**: Run `supabase db push` applies schema
  - **VERIFY**: Query `SELECT * FROM manual_tasks` returns empty result
  - **Details**:
    - Create table with columns: id, task_id (FK to task_embeddings), status, agent_rank, placement_reason, exclusion_reason, duplicate_task_id, similarity_score, marked_done_at, deleted_at, outcome_id, created_at, updated_at
    - Add CHECK constraint: status IN ('analyzing', 'prioritized', 'not_relevant', 'conflict')
    - Add indexes: idx_manual_tasks_status (partial WHERE deleted_at IS NULL), idx_manual_tasks_outcome, idx_manual_tasks_created
    - Add updated_at trigger
    - Add foreign keys: task_id → task_embeddings (CASCADE), outcome_id → user_outcomes (SET NULL)
  - **Contract**: See `contracts/database-migration.sql` for exact schema
  - **Test**: Run migration in local Supabase, verify indexes created

**Checkpoint**: Database ready - slice implementation can begin

---

## Phase 2: User Story 1 - Create Manual Task with Agent Placement (Priority: P1) 🎯 MVP

**Goal**: Enable users to add manual tasks that agent automatically places in priority list or discard pile

**Independent Test**: Click "+ Add Task", enter "Email legal about Q4 contract", verify task appears with "Analyzing..." then "Manual" badge at agent-assigned rank

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T002 [P] [SLICE] [US1] Contract test for manual task status polling
  - **File**: `__tests__/contract/manual-task-status.test.ts`
  - **SEE**: Test file in contract directory
  - **DO**: Write test that verifies GET /api/tasks/manual/[id]/status returns correct status schema
  - **VERIFY**: Test fails with "route not found" (RED phase)
  - **CRITICAL TDD WORKFLOW**:
    1. Write the test code.
    2. Run `pnpm test:run __tests__/contract/manual-task-status.test.ts`.
    3. Confirm it FAILS (expected "route not found") to establish RED.
    4. Only after RED is confirmed, proceed to implementation tasks (T004+).
  - **Test Cases**:
    - Returns `{status: 'analyzing'}` immediately after creation
    - Returns `{status: 'prioritized', agent_rank: 2, placement_reason: '...'}` after analysis
    - Returns `{status: 'not_relevant', exclusion_reason: '...'}` if excluded
    - Returns 404 for non-existent task
  - **Contract**: GET /api/tasks/manual/{id}/status
    - Path param: `id` (string)
    - 200 response: Manual task status schema (analyzing | prioritized | not_relevant | conflict)
    - 404: NotFound error schema
    - Reference: `contracts/manual-task-placement-api.yaml`
  - **Dependencies**: None (runs in parallel with T003)

- [ ] T003 [P] [SLICE] [US1] Integration test for manual task placement flow
  - **File**: `__tests__/integration/manual-task-placement-flow.test.ts`
  - **SEE**: Test file in integration directory
  - **DO**: Write end-to-end test: create outcome → create manual task → wait for analysis → verify placement
  - **VERIFY**: Test fails with "manualTaskPlacement service not found" (RED phase)
  - **CRITICAL TDD WORKFLOW**:
    1. Write the test code.
    2. Run `pnpm test:run __tests__/integration/manual-task-placement-flow.test.ts`.
    3. Confirm it FAILS with missing service (RED) before any implementation.
    4. Proceed to implementation only after RED is observed.
  - **Test Implementation**:
    - Use polling with max 20 attempts (≈20s timeout)
    - Poll `GET /api/tasks/manual/[id]/status` every 1s
    - Assert terminal status is 'prioritized' or 'not_relevant'
    - Fail if status remains 'analyzing' after 20s
  - **Test Scenarios**:
    - Task with relevant description → status='prioritized', agent_rank assigned
    - Task with irrelevant description → status='not_relevant', exclusion_reason set
    - Task without active outcome → status remains 'analyzing' (no agent call)
  - **Contract**: Integration test validates full user journey
  - **Dependencies**: None (runs in parallel with T002)

### Service Layer for User Story 1

- [ ] T004 [P] [SLICE] [US1] Create manual task placement service (extend existing)
  - **File**: `lib/services/manualTaskPlacement.ts`
  - **SEE**: Service file already exists; extend to meet spec
  - **DO**: Ensure `analyzeManualTask()` and `getAnalysisStatus()`:
    - Apply 1.2x priority boost for manual tasks (FR-015) in prompt or post-processing
    - Use prioritizationGenerator safely for single-task analysis (minimal context)
    - Handle agent timeouts/unavailability → default to `not_relevant` with safe message
    - Persist manual_tasks rows (status/agent_rank/reasons/conflicts) and respect RLS via server client
  - **VERIFY**: T003 integration test passes (GREEN phase)
  - **Functions**:
    ```typescript
    export async function analyzeManualTask(params: {
      taskId: string;
      taskText: string;
      outcomeId: string;
    }): Promise<ManualTaskAnalysisResult>;

    export async function getAnalysisStatus(taskId: string): Promise<{
      status: 'analyzing' | 'prioritized' | 'not_relevant' | 'conflict';
      agent_rank?: number;
      placement_reason?: string;
      exclusion_reason?: string;
    }>;
    ```
  - **Logic**:
    - Check if outcome exists and is active
    - If no outcome: skip analysis, return early
    - If outcome: call prioritization agent with manual task in candidate set
    - Apply 1.2x priority boost to manual tasks (per spec FR-015)
    - Parse agent response: decision='include' → 'prioritized', decision='exclude' → 'not_relevant'
    - Update manual_tasks table with status, agent_rank, and reasons
  - **Dependencies**: Extends `lib/mastra/agents/prioritizationGenerator.ts` (existing)
    - Clarify: reuse existing agent; add manual-task priority boost and single-task context handling
  - **Contract**: See data-model.md ManualTaskAnalysisResult type
  - **Test**: T003 integration test validates end-to-end flow

- [ ] T005 [P] [SLICE] [US1] Create manual task placement schemas
  - **File**: `lib/schemas/manualTaskPlacementSchemas.ts`
  - **SEE**: Schema file with Zod validators
  - **DO**: Define schemas for analyzeManualTaskInputSchema, manualTaskAnalysisResultSchema
  - **VERIFY**: Schemas validate correct inputs, reject invalid ones (unit test)
  - **Schemas**:
    ```typescript
    export const analyzeManualTaskInputSchema = z.object({
      taskId: z.string().uuid(),
      taskText: z.string().min(1).max(500),
      outcomeId: z.string().uuid(),
    });

    export const manualTaskAnalysisResultSchema = z.object({
      status: z.enum(['analyzing', 'prioritized', 'not_relevant', 'conflict']),
      rank: z.number().int().min(1).optional(),
      placementReason: z.string().optional(),
      exclusionReason: z.string().optional(),
      conflictDetails: z.object({
        duplicateTaskId: z.string(),
        similarityScore: z.number().min(0).max(1),
        existingTaskText: z.string(),
      }).optional(),
    });
    ```
  - **Dependencies**: None (runs in parallel with T004)
  - **Test**: Create unit test in `__tests__/unit/schemas/manualTaskPlacementSchemas.test.ts`

### API Layer for User Story 1

- [ ] T006 [SLICE] [US1] Implement GET /api/tasks/manual/[id]/status endpoint
  - **File**: `app/api/tasks/manual/[id]/status/route.ts`
  - **SEE**: API route responds to GET requests
  - **DO**: Implement route handler that calls `getAnalysisStatus()` service
  - **VERIFY**: T002 contract test passes (GREEN phase), polling works in UI
  - **Implementation**:
    - Use `lib/supabase/server.ts` (server client with cookies)
    - Query manual_tasks table by task_id
    - Return status, agent_rank, placement_reason, or exclusion_reason
    - Return 404 if task not found
    - No auth check needed (user sees only their tasks via RLS)
  - **Contract**: See `contracts/manual-task-placement-api.yaml` GET /api/tasks/manual/{id}/status
  - **Dependencies**: Requires T004 (manualTaskPlacement service)
  - **Test**: T002 contract test validates response schemas

### Background Job for User Story 1

- [ ] T007 [SLICE] [US1] Trigger agent analysis on manual task creation
  - **Files**:
    - `app/api/tasks/manual/route.ts` (extend existing from Phase 9)
    - `lib/services/manualTaskPlacement.ts` (extend from T004)
  - **SEE**: Manual task creation triggers background analysis
  - **DO**: After manual task inserted, call `analyzeManualTask()` in background
  - **VERIFY**: Create task → wait 10s → status changes to 'prioritized' or 'not_relevant'
  - **Implementation**:
    - In POST /api/tasks/manual: After inserting task_embeddings and manual_tasks rows
    - Spawn background job: `analyzeManualTask({ taskId, taskText, outcomeId })`
    - Don't await (return task_id immediately for optimistic UI)
    - Background job updates manual_tasks.status when complete
  - **Performance**: Analysis must complete in <10s at P95 (spec SC-012)
  - **Dependencies**: Requires T004 (analyzeManualTask service)
  - **Test**: T003 integration test validates background processing

### UI Components for User Story 1

- [ ] T008 [P] [SLICE] [US1] Create ManualTaskBadge component
  - **File**: `app/priorities/components/ManualTaskBadge.tsx`
  - **SEE**: Badge component renders different states
  - **DO**: Create component that displays "⏳ Analyzing...", "✋ Manual", "⚠️ Duplicate", "❌ Error"
  - **VERIFY**: Component renders with correct icon and text for each status
  - **States**:
    - `analyzing`: Gray badge with "⏳ Analyzing..."
    - `manual`: Accent color badge with "✋ Manual"
    - `conflict`: Warning color badge with "⚠️ Duplicate"
    - `error`: Error color badge with "❌ Error"
  - **Design**: Follow design system in `.claude/standards.md` (no borders, two-layer shadows, accent colors)
  - **Dependencies**: None (runs in parallel with T009)
  - **Test**: Create component test in `__tests__/unit/components/ManualTaskBadge.test.tsx`

- [ ] T009 [P] [SLICE] [US1] Extend TaskRow to display manual task badge
  - **File**: `app/priorities/components/TaskRow.tsx` (extend existing)
  - **SEE**: Manual tasks show badge next to task text
  - **DO**: Add badge rendering logic: if task.is_manual → render ManualTaskBadge
  - **VERIFY**: Create manual task → see badge in task list
  - **Implementation**:
    - Check `task.is_manual` flag (from task_embeddings)
    - Fetch manual_tasks.status for manual tasks
    - Render `<ManualTaskBadge status={manualStatus} />` if manual
  - **Dependencies**: None (runs in parallel with T008)
  - **Test**: Extend existing TaskRow tests

- [ ] T010 [SLICE] [US1] Implement status polling in priorities page
  - **File**: `app/priorities/page.tsx` (extend existing)
  - **SEE**: Manual task badge updates from "Analyzing..." to "Manual" after analysis
  - **DO**: Add polling logic that checks status every 1s for tasks in 'analyzing' state
  - **VERIFY**: Create task → badge starts as "Analyzing..." → updates to "Manual" after 3-10s
  - **Implementation**:
    - Filter tasks with status='analyzing'
    - Poll GET /api/tasks/manual/[id]/status every 1s (max 20 attempts = 20s)
    - Update task status in state when analysis completes
    - Clear interval when status changes to 'prioritized' or 'not_relevant'
    - Show toast warning if timeout (>20s): "Analysis taking longer than expected"
  - **Optimistic UI**: Task appears immediately in list (from Phase 9), badge shows progress
  - **Dependencies**: Requires T006 (status endpoint), T008 (badge component)
  - **Test**: Manual test - create task and observe badge transition

**Checkpoint**: User Story 1 complete - users can create manual tasks and see agent placement

---

## Phase 3: User Story 2 - Handle Discard Pile Tasks (Priority: P2)

**Goal**: Enable users to review tasks agent marked "not relevant" and override if they disagree

**Independent Test**: Create task that agent excludes → verify appears in discard pile → click Override → verify re-analyzed

### Tests for User Story 2

- [ ] T011 [P] [SLICE] [US2] Contract test for discard pile endpoint
  - **File**: `__tests__/contract/discard-pile.test.ts`
  - **SEE**: Test file validates GET /api/tasks/discard-pile
  - **DO**: Write test that verifies discard pile returns tasks with status='not_relevant'
  - **VERIFY**: Test fails with "route not found" (RED phase)
  - **Test Cases**:
    - Returns array of discarded tasks with task_text, exclusion_reason, created_at
    - Filters by outcome_id if provided in query params
    - Excludes soft-deleted tasks (deleted_at IS NOT NULL)
    - Returns empty array if no discarded tasks
  - **Contract**: See `contracts/manual-task-placement-api.yaml` GET /api/tasks/discard-pile
  - **Dependencies**: None (runs in parallel with T012)

- [ ] T012 [P] [SLICE] [US2] Contract test for override endpoint
  - **File**: `__tests__/contract/discard-override.test.ts`
  - **SEE**: Test file validates POST /api/tasks/manual/[id]/override
  - **DO**: Write test that verifies override triggers re-analysis
  - **VERIFY**: Test fails with "route not found" (RED phase)
  - **Test Cases**:
    - Returns 200 with status='analyzing' when override accepted
    - Returns 400 if task not in discard pile (status != 'not_relevant')
    - Returns 404 if task not found
    - Accepts optional user_justification in request body
  - **Contract**: See `contracts/manual-task-placement-api.yaml` POST /api/tasks/manual/{id}/override
  - **Dependencies**: None (runs in parallel with T011)

### Service Layer for User Story 2

- [ ] T013 [SLICE] [US2] Implement override discard decision service
  - **File**: `lib/services/manualTaskPlacement.ts` (extend from T004)
  - **SEE**: Service exports `overrideDiscardDecision()` function
  - **DO**: Add function that re-triggers agent analysis for discarded tasks
  - **VERIFY**: T012 contract test passes (GREEN phase)
  - **Function**:
    ```typescript
    export async function overrideDiscardDecision(params: {
      taskId: string;
      userJustification?: string;
    }): Promise<void>;
    ```
  - **Logic**:
    - Load manual_tasks row, verify status='not_relevant'
    - If valid: update status='analyzing', clear exclusion_reason
    - Store user_justification in metadata (optional)
    - Call `analyzeManualTask()` with user context
    - Agent re-evaluates with justification hint
  - **Dependencies**: Extends T004 (manualTaskPlacement service)
  - **Test**: T012 contract test + integration test in `__tests__/integration/discard-override-flow.test.ts`

### API Layer for User Story 2

- [ ] T014 [P] [SLICE] [US2] Implement GET /api/tasks/discard-pile endpoint
  - **File**: `app/api/tasks/discard-pile/route.ts`
  - **SEE**: API route returns list of discarded tasks
  - **DO**: Implement route that queries manual_tasks WHERE status='not_relevant' AND deleted_at IS NULL
  - **VERIFY**: T011 contract test passes (GREEN phase)
  - **Implementation**:
    - Use `lib/supabase/server.ts`
    - JOIN manual_tasks with task_embeddings to get task_text
    - Filter by outcome_id if query param provided
    - Order by created_at DESC
    - Return array of DiscardPileTask objects
  - **Contract**: See `contracts/manual-task-placement-api.yaml` GET /api/tasks/discard-pile
  - **Dependencies**: None (runs in parallel with T015)
  - **Test**: T011 contract test validates response

- [ ] T015 [P] [SLICE] [US2] Implement POST /api/tasks/manual/[id]/override endpoint
  - **File**: `app/api/tasks/manual/[id]/override/route.ts`
  - **SEE**: API route accepts override requests
  - **DO**: Implement route that calls `overrideDiscardDecision()` service
  - **VERIFY**: T012 contract test passes (GREEN phase)
  - **Implementation**:
    - Validate request body with Zod: `{ user_justification?: string }`
    - Call `overrideDiscardDecision({ taskId, userJustification })`
    - Return `{ status: 'analyzing', message: 'Task sent back for re-analysis' }`
    - Handle errors: 400 if not in discard pile, 404 if not found
  - **Contract**: See `contracts/manual-task-placement-api.yaml` POST /api/tasks/manual/{id}/override
  - **Dependencies**: Requires T013 (overrideDiscardDecision service)
  - **Test**: T012 contract test validates behavior

### UI Components for User Story 2

- [ ] T016 [SLICE] [US2] Create DiscardPileSection component
  - **File**: `app/priorities/components/DiscardPileSection.tsx`
  - **SEE**: Collapsible section at bottom of priorities page
  - **DO**: Create component that displays discarded tasks with expand/collapse
  - **VERIFY**: Create task that gets discarded → see in collapsed section → expand to view
  - **Features**:
    - Default state: Collapsed with count badge "▼ Show 3 discarded tasks"
    - Expanded state: List of tasks with exclusion_reason, Override and Confirm Discard buttons
    - Fetches data from GET /api/tasks/discard-pile on mount
    - Updates when tasks move in/out of discard pile
  - **Design**: Follow existing patterns from `BlockedTasksSection.tsx`, `ExcludedTasksSection.tsx`
  - **Dependencies**: Requires T014 (discard-pile endpoint)
  - **Test**: Create component test in `__tests__/unit/components/DiscardPileSection.test.tsx`

- [ ] T017 [SLICE] [US2] Integrate DiscardPileSection into priorities page
  - **File**: `app/priorities/page.tsx` (extend existing)
  - **SEE**: Discard pile section appears at bottom of page
  - **DO**: Add `<DiscardPileSection />` component to priorities page layout
  - **VERIFY**: Navigate to /priorities → see discard pile section (collapsed by default)
  - **Implementation**:
    - Render after active task list
    - Pass current outcome_id as prop for filtering
    - Handle state updates when tasks move between active and discard pile
  - **Dependencies**: Requires T016 (DiscardPileSection component)
  - **Test**: Manual test + integration test in `__tests__/integration/discard-pile-ui.test.tsx`

- [ ] T018 [SLICE] [US2] Implement override action in DiscardPileSection
  - **File**: `app/priorities/components/DiscardPileSection.tsx` (extend from T016)
  - **SEE**: Override button in discard pile triggers re-analysis
  - **DO**: Add click handler that calls POST /api/tasks/manual/[id]/override
  - **VERIFY**: Click Override → task removed from discard pile → badge shows "Analyzing..." → re-analysis completes
  - **Implementation**:
    - onClick: Call override endpoint
    - Update local state: Remove task from discard pile
    - Add task to active list with status='analyzing'
    - Start polling for re-analysis completion
    - Show toast: "Task sent back for re-analysis"
  - **Edge case**: If re-analysis still excludes → show toast "Agent still recommends excluding" + add back to discard pile
  - **Dependencies**: Requires T015 (override endpoint), T016 (DiscardPileSection base)
  - **Test**: Integration test in `__tests__/integration/discard-override-flow.test.ts`

**Checkpoint**: User Story 2 complete - users can review and override discard pile decisions

---

## Phase 4: User Story 3 - Manage Manual Tasks (Priority: P2)

**Goal**: Enable users to edit, mark as done, or delete manual tasks

**Independent Test**: Create manual task → edit description → verify re-analyzed → mark done → verify in completed section

### Tests for User Story 3

- [ ] T019 [SLICE] [US3] Integration test for manual task edit flow
  - **File**: `__tests__/integration/manual-task-edit-flow.test.ts`
  - **SEE**: Test file validates edit → re-analysis → placement update
  - **DO**: Write test: create task → edit description → verify re-analysis triggered → check new placement
  - **VERIFY**: Test fails initially (RED phase)
  - **Test Cases**:
    - Edit task description → status changes to 'analyzing'
    - Re-analysis completes → new agent_rank assigned if relevance changed
    - Invalid edit (empty description) → returns 400 error
  - **Dependencies**: None
  - **Test**: Validates existing PATCH /api/tasks/[id] endpoint (Phase 9) with new re-analysis behavior

### Service Layer for User Story 3

- [ ] T020 [SLICE] [US3] Extend manual task service to trigger re-analysis on edit
  - **File**: `lib/services/manualTaskService.ts` (extend existing from Phase 9)
  - **SEE**: Edit function triggers agent re-analysis
  - **DO**: Add re-analysis trigger to `updateTask()` function
  - **VERIFY**: T019 integration test passes (GREEN phase)
  - **Logic**:
    - After updating task_embeddings.task_text
    - Generate new embedding (OpenAI)
    - Update manual_tasks.status = 'analyzing'
    - Clear previous agent_rank, placement_reason, exclusion_reason
    - Trigger `analyzeManualTask()` in background
  - **Dependencies**: Uses T004 (analyzeManualTask service)
  - **Test**: T019 integration test validates behavior

### UI Components for User Story 3

- [ ] T021 [P] [SLICE] [US3] Add Edit action to manual task rows
  - **File**: `app/priorities/components/TaskRow.tsx` (extend existing)
  - **SEE**: Manual tasks show Edit button in actions menu
  - **DO**: Add Edit button that opens ManualTaskModal with current task text
  - **VERIFY**: Click Edit → modal opens with pre-filled text → save → task re-analyzed
  - **Implementation**:
    - Check `task.is_manual` flag
    - Render Edit button in actions menu (alongside existing Mark Done, Delete)
    - Click handler: Open modal with `initialValue={task.task_text}`
    - On save: Call PATCH /api/tasks/[id]
    - Show "Analyzing..." badge during re-analysis
  - **Dependencies**: Uses existing `ManualTaskModal.tsx` from Phase 9
  - **Test**: Manual test + component test

- [ ] T022 [P] [SLICE] [US3] Add Mark Done action to manual task rows
  - **File**: `app/priorities/components/TaskRow.tsx` (extend existing)
  - **SEE**: Manual tasks show Mark Done button
  - **DO**: Add button that updates manual_tasks.marked_done_at timestamp
  - **VERIFY**: Click Mark Done → task moves to "Completed Tasks" collapsed section
  - **Implementation**:
    - Click handler: Call PATCH /api/tasks/manual/[id]/mark-done (new endpoint)
    - Update manual_tasks.marked_done_at = NOW()
    - Remove task from active list
    - Add to "Completed Tasks" section (create if doesn't exist)
  - **New endpoint**: `app/api/tasks/manual/[id]/mark-done/route.ts` (simple PATCH)
  - **Dependencies**: None (runs in parallel with T021, T023)
  - **Test**: Integration test validates task moves to completed section

- [ ] T023 [P] [SLICE] [US3] Add Delete action to manual task rows
  - **File**: `app/priorities/components/TaskRow.tsx` (extend existing)
  - **SEE**: Manual tasks show Delete button with confirmation
  - **DO**: Add button that soft-deletes task (updates deleted_at timestamp)
  - **VERIFY**: Click Delete → confirm modal → task removed from UI with toast "Task deleted (recoverable for 30 days)"
  - **Implementation**:
    - Click handler: Show confirmation dialog
    - On confirm: Call DELETE /api/tasks/manual/[id] (extend existing from Phase 9)
    - Update manual_tasks.deleted_at = NOW()
    - Remove task from UI
    - Show toast notification
  - **Soft delete**: Task remains in database for 30 days (per spec FR-022)
  - **Dependencies**: None (runs in parallel with T021, T022)
  - **Test**: Integration test validates soft delete behavior

**Checkpoint**: User Story 3 complete - users can fully manage manual tasks (edit, done, delete)

---

## Phase 5: User Story 4 - Duplicate Detection (Priority: P3)

**Goal**: Warn users when creating tasks similar to existing ones

**Independent Test**: Create task "Email legal about contract" → create similar task "Email legal about V6 contract" → see conflict warning

### Tests for User Story 4

- [ ] T024 [SLICE] [US4] Contract test for duplicate detection
  - **File**: `__tests__/contract/duplicate-detection.test.ts`
  - **SEE**: Test validates duplicate detection in manual task creation
  - **DO**: Write test that verifies POST /api/tasks/manual returns 400 conflict when duplicate detected
  - **VERIFY**: Test fails initially (RED phase)
  - **Test Cases**:
    - Create task A → create task B with >85% similarity → returns 400 with conflict details
    - Conflict response includes: duplicate_task_id, similarity_score, existing_task_text
    - Create task with <85% similarity → succeeds normally
  - **Contract**: Extends Phase 9's POST /api/tasks/manual endpoint
  - **Dependencies**: None
  - **Test**: Validates enhanced duplicate detection from Phase 9 (threshold lowered from 0.9 to 0.85)

### Service Layer for User Story 4

- [ ] T025 [SLICE] [US4] Enhance duplicate detection threshold and conflict handling
  - **File**: `lib/services/manualTaskService.ts` (extend existing)
  - **SEE**: Duplicate detection uses 0.85 threshold (per spec FR-006)
  - **DO**: Lower threshold from 0.9 (Phase 9) to 0.85, return structured conflict details
  - **VERIFY**: T024 contract test passes (GREEN phase)
  - **Logic**:
    - Before creating task: Query task_embeddings with cosine similarity >0.85
    - If duplicate found: Set manual_tasks.status = 'conflict'
    - Store duplicate_task_id, similarity_score in manual_tasks table
    - Return error with conflict details (not throw exception)
  - **Dependencies**: Uses existing embedding similarity query from Phase 9
  - **Test**: T024 contract test validates behavior

### UI Components for User Story 4

- [ ] T026 [SLICE] [US4] Create conflict warning modal
  - **File**: `app/components/ConflictWarningModal.tsx`
  - **SEE**: Modal displays when duplicate detected
  - **DO**: Create modal component that shows existing task and allows user to proceed or cancel
  - **VERIFY**: Trigger duplicate → see modal with similarity score and existing task text
  - **Features**:
    - Display: "Similar task found" heading
    - Show existing task text with similarity score (e.g., "92% similar")
    - Actions: "Edit Description" (back to input), "Create Anyway" (force), "Cancel"
    - Force creation: Add `force_create=true` flag to POST /api/tasks/manual
  - **Design**: Use existing modal patterns from `TextInputModal.tsx`
  - **Dependencies**: Requires T025 (conflict detection service)
  - **Test**: Component test validates modal behavior

- [ ] T027 [SLICE] [US4] Integrate conflict warning into manual task creation flow
  - **File**: `app/components/ManualTaskModal.tsx` (extend existing from Phase 9)
  - **SEE**: Conflict modal appears during task creation if duplicate detected
  - **DO**: Add error handling for 400 conflict response → show ConflictWarningModal
  - **VERIFY**: Create duplicate task → see conflict modal → click "Edit Description" → modify → submit succeeds
  - **Implementation**:
    - On POST /api/tasks/manual response:
      - If 200: Close modal, show task with "Analyzing..." badge
      - If 400 + code='DUPLICATE_CONFLICT': Open ConflictWarningModal with conflict details
      - If other error: Show toast error
    - ConflictWarningModal actions:
      - "Edit Description": Return to input field with pre-filled text
      - "Create Anyway": Retry POST with `force_create=true` query param
      - "Cancel": Close both modals
  - **Dependencies**: Requires T026 (ConflictWarningModal component)
  - **Test**: Integration test in `__tests__/integration/duplicate-task-flow.test.ts`

**Checkpoint**: User Story 4 complete - users warned about duplicate tasks with override option

---

## Phase 6: User Story 5 - Goal Change Invalidation (Priority: P3)

**Goal**: Auto-invalidate manual tasks when outcome goal changes

**Independent Test**: Create 3 manual tasks → change outcome → verify all tasks moved to discard pile with toast notification

### Tests for User Story 5

- [ ] T028 [SLICE] [US5] Contract test for invalidate endpoint
  - **File**: `__tests__/contract/invalidate-manual-tasks.test.ts`
  - **SEE**: Test validates POST /api/outcomes/[id]/invalidate-manual-tasks
  - **DO**: Write test that verifies invalidation moves manual tasks to discard pile
  - **VERIFY**: Test fails with "route not found" (RED phase)
  - **Test Cases**:
    - Returns count of invalidated tasks
    - Updates manual_tasks.status = 'not_relevant' for all prioritized tasks
    - Sets exclusion_reason = "Goal changed - manual tasks invalidated"
    - Only affects tasks for specific outcome_id
    - Returns 404 if outcome not found
  - **Contract**: See `contracts/manual-task-placement-api.yaml` POST /api/outcomes/{id}/invalidate-manual-tasks
  - **Dependencies**: None

### Service Layer for User Story 5

- [ ] T029 [SLICE] [US5] Implement invalidate manual tasks service
  - **File**: `lib/services/manualTaskPlacement.ts` (extend from T004)
  - **SEE**: Service exports `invalidateManualTasks()` function
  - **DO**: Add function that bulk-updates manual tasks when outcome changes
  - **VERIFY**: T028 contract test passes (GREEN phase)
  - **Function**:
    ```typescript
    export async function invalidateManualTasks(params: {
      outcomeId: string;
    }): Promise<{ invalidatedCount: number }>;
    ```
  - **Logic**:
    - UPDATE manual_tasks SET status='not_relevant', exclusion_reason='Goal changed - manual tasks invalidated'
    - WHERE status='prioritized' AND outcome_id = outcomeId
    - Return count of affected rows
  - **Dependencies**: None
  - **Test**: T028 contract test validates behavior

### API Layer for User Story 5

- [ ] T030 [SLICE] [US5] Implement POST /api/outcomes/[id]/invalidate-manual-tasks endpoint
  - **File**: `app/api/outcomes/[id]/invalidate-manual-tasks/route.ts`
  - **SEE**: API route handles invalidation requests
  - **DO**: Implement route that calls `invalidateManualTasks()` service
  - **VERIFY**: T028 contract test passes (GREEN phase)
  - **Implementation**:
    - Verify outcome exists
    - Call `invalidateManualTasks({ outcomeId })`
    - Return `{ invalidated_count: N, message: 'N manual tasks moved to discard pile' }`
  - **Contract**: See `contracts/manual-task-placement-api.yaml` POST /api/outcomes/{id}/invalidate-manual-tasks
  - **Dependencies**: Requires T029 (invalidateManualTasks service)
  - **Test**: T028 contract test validates response

### UI Integration for User Story 5

- [ ] T031 [SLICE] [US5] Trigger invalidation on outcome update
  - **File**: `app/api/outcomes/[id]/route.ts` (extend existing)
  - **SEE**: Changing outcome triggers manual task invalidation
  - **DO**: Add invalidation call to PATCH /api/outcomes/[id] endpoint
  - **VERIFY**: Change outcome → manual tasks moved to discard pile → toast shown
  - **Implementation**:
    - After updating user_outcomes.outcome_text
    - Call POST /api/outcomes/[id]/invalidate-manual-tasks internally
    - Return invalidated_count in response
    - Frontend shows toast: "Goal changed. X manual tasks moved to Discard Pile for review"
  - **Dependencies**: Requires T030 (invalidate endpoint)
  - **Test**: Integration test in `__tests__/integration/goal-change-invalidation.test.ts`

- [ ] T032 [SLICE] [US5] Display invalidation toast notification
  - **File**: `app/priorities/page.tsx` (extend existing)
  - **SEE**: Toast notification after outcome change shows invalidation count
  - **DO**: Add toast trigger when invalidated_count > 0 in outcome update response
  - **VERIFY**: Change outcome with 3 manual tasks → see toast "Goal changed. 3 manual tasks moved to Discard Pile"
  - **Implementation**:
    - Listen for outcome update event
    - Check response.invalidated_count
    - If > 0: Show toast with count
    - Auto-expand discard pile section to show invalidated tasks
  - **Dependencies**: Requires T031 (invalidation trigger)
  - **Test**: Manual test validates toast appearance

**Checkpoint**: User Story 5 complete - manual tasks auto-invalidated on goal change with user notification

---

## Phase 7: User Story 6 - Reprioritization Integration (Priority: P3)

**Goal**: Ensure manual tasks maintain position during reprioritization with 1.2x boost

**Independent Test**: Create manual tasks → trigger reprioritization → verify tasks maintain relative position with slight boost

### Tests for User Story 6

- [ ] T033 [SLICE] [US6] Integration test for manual task reprioritization
  - **File**: `__tests__/integration/manual-task-reprioritization.test.ts`
  - **SEE**: Test validates manual tasks behavior during reprioritization
  - **DO**: Write test: create manual + document tasks → reprioritize → verify manual tasks get 1.2x boost
  - **VERIFY**: Test fails initially (RED phase)
  - **Test Cases**:
    - Manual task with impact=10 receives boost → effective impact=12 (10 * 1.2)
    - Manual tasks maintain relative order to similar-impact document tasks
    - Manual task that drops >5 positions triggers notification
  - **Contract**: Validates prioritization agent applies boost per spec FR-015
  - **Dependencies**: None
  - **Test**: End-to-end reprioritization flow with manual tasks

### Service Layer for User Story 6

- [ ] T034 [SLICE] [US6] Apply 1.2x priority boost to manual tasks in agent
  - **File**: `lib/mastra/agents/prioritizationGenerator.ts` (extend existing)
  - **SEE**: Agent applies boost to manual tasks during scoring
  - **DO**: Add boost logic: `if (task.is_manual) { task.impact_score *= 1.2; }`
  - **VERIFY**: T033 integration test passes (GREEN phase)
  - **Implementation**:
    - In agent prompt or post-processing: Identify manual tasks (is_manual=true)
    - Apply 1.2x multiplier to impact_score before ranking
    - Document boost in agent reasoning trace
  - **Location**: Either in agent prompt instructions or in post-processing step
  - **Dependencies**: Extends existing prioritizationGenerator agent
  - **Test**: T033 integration test validates boost applied correctly

### UI Components for User Story 6

- [ ] T035 [SLICE] [US6] Show notification for manual tasks with significant rank drops
  - **File**: `app/priorities/page.tsx` (extend existing)
  - **SEE**: Toast notification when manual task drops >5 positions
  - **DO**: Add comparison logic: previous rank vs new rank, show notification if delta >5
  - **VERIFY**: Trigger reprioritization that drops manual task by 6 positions → see toast explaining change
  - **Implementation**:
    - Before reprioritization: Store current ranks for manual tasks
    - After reprioritization: Compare new ranks to stored ranks
    - If delta >5: Show toast "Manual task '[task text]' dropped 6 positions due to new priorities"
    - Include reasoning from agent in notification
  - **Dependencies**: Uses existing reprioritization flow from Phase 11
  - **Test**: Manual test validates notification appears

**Checkpoint**: User Story 6 complete - manual tasks properly integrated with reprioritization system

---

## Phase 8: Confirm Discard Action (Additional Feature)

**Goal**: Allow users to permanently discard tasks from discard pile

**Independent Test**: Move task to discard pile → click "Confirm Discard" → verify soft-deleted with 30-day recovery

### Implementation for Confirm Discard

- [ ] T036 [SLICE] [POLISH] Implement POST /api/tasks/manual/[id]/confirm-discard endpoint
  - **File**: `app/api/tasks/manual/[id]/confirm-discard/route.ts`
  - **SEE**: API route soft-deletes discarded tasks
  - **DO**: Implement route that updates manual_tasks.deleted_at timestamp
  - **VERIFY**: Call endpoint → task marked deleted, hidden from UI
  - **Implementation**:
    - Verify task exists and status='not_relevant'
    - UPDATE manual_tasks SET deleted_at=NOW() WHERE task_id=id
    - Return `{ success: true, message: 'Task discarded (recoverable for 30 days)', deleted_at: timestamp }`
  - **Soft delete**: Task remains in database for 30 days per spec FR-022
  - **Contract**: See `contracts/manual-task-placement-api.yaml` POST /api/tasks/manual/{id}/confirm-discard
  - **Test**: Contract test validates soft delete behavior

- [ ] T037 [SLICE] [POLISH] Add Confirm Discard button to discard pile
  - **File**: `app/priorities/components/DiscardPileSection.tsx` (extend from T016)
  - **SEE**: Confirm Discard button appears next to Override button
  - **DO**: Add button that calls confirm-discard endpoint with confirmation dialog
  - **VERIFY**: Click Confirm Discard → confirmation modal → confirm → task removed from UI
  - **Implementation**:
    - Show confirmation dialog: "Are you sure? Task will be recoverable for 30 days"
    - On confirm: Call POST /api/tasks/manual/[id]/confirm-discard
    - Remove task from discard pile UI
    - Show toast: "Task discarded (recoverable for 30 days)"
  - **Dependencies**: Requires T036 (confirm-discard endpoint)
  - **Test**: Integration test validates full flow

**Checkpoint**: Confirm discard feature complete - users can permanently remove tasks from discard pile

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Enhancements and documentation for production readiness

- [ ] T038 [P] [POLISH] Add cleanup job for soft-deleted tasks
  - **File**: `lib/services/manualTaskCleanup.ts` (new)
  - **SEE**: Cron job purges tasks older than 30 days
  - **DO**: Create service that deletes manual_tasks rows WHERE deleted_at < NOW() - INTERVAL '30 days'
  - **VERIFY**: Run job → verify old deleted tasks removed from database
  - **Implementation**:
    - Create daily cron job (via Vercel Cron or similar)
    - Query manual_tasks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'
    - DELETE rows (hard delete after 30-day recovery window)
    - Log count of purged tasks
  - **Schedule**: Daily at 2 AM UTC
  - **Dependencies**: None (runs in parallel with T039, T040)
  - **Test**: Unit test validates query logic

- [ ] T039 [P] [POLISH] Add telemetry for manual task metrics
  - **File**: `lib/services/manualTaskPlacement.ts` (extend from T004)
  - **SEE**: Agent execution traces include manual task metrics
  - **DO**: Add logging for analysis latency, rejection rate, override rate
  - **VERIFY**: Create tasks → check agent_sessions table for metrics
  - **Metrics to track**:
    - Analysis latency (P50, P95, P99) - must be <10s at P95 per spec SC-012
    - Rejection rate (not_relevant / total) - alert if >50% per spec mitigation
    - Override success rate (re-accepted after override)
    - Duplicate detection accuracy
  - **Storage**: Store in agent_sessions.metadata JSON field
  - **Dependencies**: None (runs in parallel with T038, T040)
  - **Test**: Verify metrics stored correctly in database

- [ ] T040 [P] [POLISH] Documentation updates
  - **Files**:
    - `specs/016-manual-task-creation/quickstart.md` (verify accuracy)
    - `README.md` (add Phase 18 to feature list)
  - **SEE**: Documentation reflects implemented feature
  - **DO**: Update quickstart guide with final implementation details, add to README
  - **VERIFY**: Follow quickstart guide successfully
  - **Updates**:
    - Verify all manual test steps in quickstart.md work
    - Add Phase 18 to README.md feature list
    - Update performance metrics with actual measurements
    - Document any gotchas or edge cases discovered during implementation
  - **Dependencies**: None (runs in parallel with T038, T039)
  - **Test**: Manual QA using quickstart guide

- [ ] T041 [POLISH] Run quickstart.md validation
  - **File**: `specs/016-manual-task-creation/quickstart.md`
  - **SEE**: All manual test flows complete successfully
  - **DO**: Execute each test scenario in quickstart guide
  - **VERIFY**: All tests pass, guide is accurate
  - **Test Scenarios** (from quickstart.md):
    - Test 1: Create manual task with agent placement ✅
    - Test 2: Discard pile interaction ✅
    - Test 3: Duplicate detection ✅
    - Test 4: Override discarded task ✅
    - Test 5: Goal change invalidation ✅
  - **Dependencies**: Requires all previous tasks complete
  - **Test**: Manual QA validates end-to-end user experience

**Checkpoint**: Phase 18 complete and production-ready

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Database)**: No dependencies - start immediately ⚡ BLOCKING
- **Phase 2 (US1)**: Depends on Phase 1 complete - 🎯 MVP priority
- **Phase 3 (US2)**: Depends on Phase 2 complete (uses manual_tasks table + status polling)
- **Phase 4 (US3)**: Depends on Phase 2 complete (uses manual task infrastructure)
- **Phase 5 (US4)**: Depends on Phase 2 complete (extends duplicate detection)
- **Phase 6 (US5)**: Depends on Phase 2 complete (uses invalidation service)
- **Phase 7 (US6)**: Depends on Phase 2 complete (extends prioritization agent)
- **Phase 8 (Confirm Discard)**: Depends on Phase 3 (US2) complete
- **Phase 9 (Polish)**: Depends on all desired user stories complete

### User Story Dependencies

- **US1 (P1)**: Foundation - all other stories depend on this ⚡
- **US2 (P2)**: Independent after US1
- **US3 (P2)**: Independent after US1
- **US4 (P3)**: Independent after US1
- **US5 (P3)**: Independent after US1
- **US6 (P3)**: Independent after US1

### Within Each User Story

- Tests MUST be written and FAIL before implementation (TDD)
- Service layer before API layer
- API layer before UI components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

Tasks marked [P] can run in parallel:

**Phase 2 (US1)**:
- T002 + T003 (tests in parallel)
- T004 + T005 (service + schemas in parallel)
- T008 + T009 (UI components in parallel)

**Phase 3 (US2)**:
- T011 + T012 (contract tests in parallel)
- T014 + T015 (API endpoints in parallel)

**Phase 4 (US3)**:
- T021 + T022 + T023 (all actions in parallel)

**Phase 9 (Polish)**:
- T038 + T039 + T040 (all polish tasks in parallel)

**After Phase 2 complete**: Phases 3-7 can run in parallel (if team capacity allows)

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 only)

1. Complete Phase 1: Database (T001) ⚡ CRITICAL
2. Complete Phase 2: User Story 1 (T002-T010) 🎯 MVP
3. **STOP and VALIDATE**: Test manual task creation → agent placement → badge updates
4. Deploy/demo if ready

**MVP delivers**: Users can create manual tasks, agent automatically places them, users see "Manual" badge

### Incremental Delivery (Recommended)

1. Phase 1 (Database) → Foundation ready
2. Phase 2 (US1) → Test independently → Deploy/Demo (MVP! ✅)
3. Phase 3 (US2) → Test independently → Deploy/Demo (Discard pile added ✅)
4. Phase 4 (US3) → Test independently → Deploy/Demo (Task management added ✅)
5. Continue with P3 stories (US4-US6) as needed
6. Phase 9 (Polish) → Production-ready ✅

Each user story adds value without breaking previous stories.

### Parallel Team Strategy

With multiple developers:

1. Team completes Phase 1 (Database) together ⚡
2. Once Phase 1 done + Phase 2 (US1) complete:
   - Developer A: Phase 3 (US2 - Discard pile)
   - Developer B: Phase 4 (US3 - Task management)
   - Developer C: Phase 5 (US4 - Duplicate detection)
3. After P2 priorities (US2-US3) complete:
   - Developers work on P3 priorities (US5-US6) in parallel

Stories complete and integrate independently.

---

## Vertical Slice Validation ✅

Each task has been validated against vertical slice principles:

**User Story 1 (T002-T010)**:
- ✅ SEE: User clicks "+ Add Task", modal opens
- ✅ DO: User enters task, submits
- ✅ VERIFY: Task appears with "Analyzing..." → "Manual" badge at agent-assigned rank
- ✅ Complete UI + Backend + Data + Feedback loop

**User Story 2 (T011-T018)**:
- ✅ SEE: Discarded task in collapsible section
- ✅ DO: User clicks Override
- ✅ VERIFY: Task re-analyzed, moved to active list or remains discarded with reason
- ✅ Complete UI + Backend + Data + Feedback loop

**User Story 3 (T019-T023)**:
- ✅ SEE: Edit/Done/Delete buttons on manual tasks
- ✅ DO: User performs action
- ✅ VERIFY: Task updated/moved/deleted with visual confirmation
- ✅ Complete UI + Backend + Data + Feedback loop

**User Story 4 (T024-T027)**:
- ✅ SEE: Conflict warning modal with similar task
- ✅ DO: User reviews and decides to edit or force-create
- ✅ VERIFY: Task created or user returns to edit
- ✅ Complete UI + Backend + Data + Feedback loop

**User Story 5 (T028-T032)**:
- ✅ SEE: Toast notification "3 manual tasks moved to discard pile"
- ✅ DO: User changes outcome
- ✅ VERIFY: Manual tasks appear in discard pile for review
- ✅ Complete UI + Backend + Data + Feedback loop

**User Story 6 (T033-T035)**:
- ✅ SEE: Manual tasks maintain position with slight boost
- ✅ DO: User triggers reprioritization
- ✅ VERIFY: Manual tasks ranked correctly, notification if significant drop
- ✅ Complete UI + Backend + Data + Feedback loop

---

## Notes

- [P] tasks = different files, no shared dependencies
- [Story] label maps task to user story for traceability
- Each user story independently completable and testable
- TDD: Tests fail before implementation (RED → GREEN → REFACTOR)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Performance target: Manual task analysis <10s at P95 (spec SC-012)
- Design: Follow `.claude/standards.md` (no borders, two-layer shadows, accent colors)

---

**Tasks Status**: ✅ Ready for `/implement` phase
**Total Tasks**: 41 vertical slice tasks across 6 user stories
**Estimated Effort**: ~15-20 hours for MVP (Phase 1-2), ~40-50 hours for all stories
