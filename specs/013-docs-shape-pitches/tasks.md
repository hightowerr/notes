# Tasks: Manual Task Control & Discard Approval

**Feature**: 013-docs-shape-pitches
**Input**: Design documents from `/specs/013-docs-shape-pitches/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/manual-task-api.yaml, quickstart.md

## Execution Flow (Slice-Based)
```
1. Load plan.md from feature directory ✅
   → Tech stack: Next.js 15.5.4, React 19, TypeScript 5, Supabase, OpenAI
   → User stories: Manual task creation, inline editing, discard approval

2. Load spec.md for user journeys ✅
   → Primary actions: Add task, edit task, approve discards
   → UI entry points: "+ Add Task" button, pencil icon, discard modal
   → Feedback: [MANUAL] badge, save indicators, modal confirmations

3. Load optional design documents ✅
   → contracts/: POST /api/tasks/manual, PATCH /api/tasks/[id]
   → data-model.md: Extended task_embeddings, ManualTask, DiscardCandidate
   → research.md: Semantic similarity (>0.9), 500ms debounce, embedding cache

4. Generate VERTICAL SLICE tasks ✅
   → Each user story = ONE complete slice task
   → All slices include: UI component + API endpoint + data layer + user feedback
   → Validated: Can user SEE, DO, and VERIFY this? ✅

5. Apply slice ordering rules ✅
   → P0 user journeys first (manual creation → editing → discard approval)
   → Setup tasks ONLY if blocking all P0 slices (migration required)
   → Database foundation + core slices → enhancements

6. Mark parallel execution ✅
   → Different user journeys = [P] (parallel)
   → Shared critical files = sequential

7. Validate EVERY task ✅
   → All tasks have user stories, UI entry points, backend work, visible outcomes, test scenarios
```

## Format: `[ID] [TYPE] [P?] User Story & Implementation Scope`
- **[SLICE]**: Complete vertical slice (UI → Backend → Data → Feedback)
- **[SETUP]**: Foundational work blocking ALL slices
- **[P]**: Can run in parallel with other [P] tasks

---

## Phase 1: Database Foundation (Required for All Slices)

### T001 [X] [SETUP] Apply database migration for manual task support
**Why Needed**: All slices require `is_manual` and `created_by` columns in `task_embeddings` table

**Implementation Scope**:
- **Migration**: Create `supabase/migrations/024_add_manual_task_support.sql`
  - Add `is_manual BOOLEAN DEFAULT FALSE` column
  - Add `created_by TEXT DEFAULT 'default-user'` column
  - Create partial index `idx_task_embeddings_manual` for manual task queries
  - Backfill existing rows with `is_manual = FALSE`
- **Validation**: Run migration via Supabase Dashboard or CLI
- **Database**: Query to verify columns exist and index created

**Validation**:
```sql
-- Verify columns added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'task_embeddings'
AND column_name IN ('is_manual', 'created_by');

-- Verify index created
SELECT indexname FROM pg_indexes
WHERE tablename = 'task_embeddings'
AND indexname = 'idx_task_embeddings_manual';
```

**Files Modified**:
- `supabase/migrations/024_add_manual_task_support.sql` (create)

---

## Phase 2: P0 User Journey - Manual Task Creation

### T002 [X] [SLICE] User can add manual task and see it appear in task list with [MANUAL] badge
**User Story**: As a user, I can click "+ Add Task" button, enter task text, and immediately see my task appear in the Active Priorities list with a [MANUAL] badge

**Implementation Scope**:
- **UI**: Manual task creation modal (`app/components/ManualTaskModal.tsx`)
  - Form with task_text input (10-500 chars) and estimated_hours (8-160, default 40)
  - Draft auto-save to localStorage every 500ms
  - Submit button triggers API call
  - Error display for validation failures
  - Success closes modal and clears draft

- **Backend**: Manual task service (`lib/services/manualTaskService.ts`)
  - `createManualTask(params)` function:
    * Validate input with Zod schema
    * Generate embedding via `generateEmbedding()` from embeddingService
    * Check for duplicates using `searchSimilarTasks()` (>0.9 threshold)
    * Get or create manual document (`manual-tasks-default-user`)
    * Insert into task_embeddings with `is_manual=true`
    * Return task_id

- **API**: POST `/api/tasks/manual` route (`app/api/tasks/manual/route.ts`)
  - Parse request body
  - Validate with `manualTaskSchema` (Zod)
  - Call `createManualTask()` from service
  - Return 201 with task_id or 400 for duplicate/validation errors

- **UI Integration**: Add button to TaskList (`app/priorities/components/TaskList.tsx`)
  - "+ Add Task" button in Active Priorities header
  - Modal state management (open/close)
  - Optimistic UI update: Add task to local state immediately
  - [MANUAL] badge rendering in TaskRow

- **Data**:
  - Zod schemas in `lib/schemas/manualTaskSchemas.ts`:
    * `manualTaskInputSchema` for POST body
    * `manualTaskResponseSchema` for API response
  - Supabase insert: task_embeddings row with is_manual=true, created_by='default-user'
  - Special document created if doesn't exist: file_name='manual-tasks-default-user', source='manual'

- **Feedback**:
  - Task appears in list with [MANUAL] badge
  - Modal closes on success
  - Toast notification: "Task added successfully"
  - Error toast for duplicates: "Similar task already exists: [task name]"

**Test Scenario**:
1. Navigate to `/priorities` page
2. Click "+ Add Task" button
3. Enter task text: "Email legal department about contract review"
4. Set estimated hours: 16
5. Click "Add Task"
6. Verify task appears in Active Priorities with [MANUAL] badge
7. Verify task persists after page refresh
8. Attempt to add duplicate: "Email legal about contract"
9. Verify error shown: "Similar task already exists"

**Files Modified**:
- `app/components/ManualTaskModal.tsx` (create)
- `lib/services/manualTaskService.ts` (create)
- `lib/schemas/manualTaskSchemas.ts` (create)
- `app/api/tasks/manual/route.ts` (create)
- `app/priorities/components/TaskList.tsx` (modify: add button, modal state)
- `app/priorities/components/TaskRow.tsx` (modify: add [MANUAL] badge)

**Dependencies**: T001 (migration must be applied first)

---

### T003 [X] [P] [SLICE] Write contract tests for manual task creation API
**User Story**: As a developer, I can verify the POST /api/tasks/manual endpoint meets its contract specification

**Implementation Scope**:
- **Test File**: `__tests__/contract/manual-task-api.test.ts`
  - Test: POST valid manual task → 201 with task_id
  - Test: POST invalid input (task_text too short) → 400 with validation errors
  - Test: POST duplicate task → 400 with DUPLICATE_TASK code
  - Test: POST without outcome_id → prioritization_triggered = false
  - Test: POST with valid outcome_id → prioritization_triggered = true

- **Test Setup**: Mock Supabase client, OpenAI embedding service
- **Assertions**: Response status, body structure, error codes match contract spec
- **Data**: Uses contract spec from `contracts/manual-task-api.yaml`

**Test Scenario**:
```typescript
describe('POST /api/tasks/manual', () => {
  it('creates manual task successfully', async () => {
    const response = await POST({ task_text: 'Email legal about contract', estimated_hours: 16 });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ task_id: expect.any(String), success: true });
  });

  it('rejects duplicate tasks', async () => {
    // Create first task
    await POST({ task_text: 'Email legal about contract' });
    // Attempt duplicate
    const response = await POST({ task_text: 'Email legal department about contract' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('DUPLICATE_TASK');
    expect(response.body.existing_task.similarity).toBeGreaterThan(0.9);
  });
});
```

**Files Modified**:
- `__tests__/contract/manual-task-api.test.ts` (create)

**Dependencies**: T002 (API endpoint must exist)
**Parallel**: Can run alongside T004

---

### T004 [X] [P] [SLICE] Manual tasks automatically trigger re-prioritization and appear in prioritized position
**User Story**: As a user, after adding a manual task, I can see it automatically get prioritized and move to its correct position in the list within 10 seconds

**Implementation Scope**:
- **UI**: Re-prioritization trigger in TaskList (`app/priorities/components/TaskList.tsx`)
  - After manual task creation success, check if active outcome exists
  - If outcome exists, call `/api/agent/prioritize` (existing endpoint)
  - Show "Prioritizing..." indicator on the new task
  - Poll for prioritization completion (existing pattern)
  - Update task position when prioritization completes

- **Backend**: Extend POST `/api/tasks/manual` response (`app/api/tasks/manual/route.ts`)
  - Check if `outcome_id` provided in request
  - If yes, trigger re-prioritization via existing service
  - Return `prioritization_triggered: true` in response

- **UI Enhancement**: TaskRow priority indicator (`app/priorities/components/TaskRow.tsx`)
  - Show spinner icon when task status is 'prioritizing'
  - Show rank number when prioritization completes
  - Animate position change when task moves

- **Data**: No new data structures needed (uses existing agent_sessions table)

- **Feedback**:
  - Task shows "Prioritizing..." spinner immediately after creation
  - Task smoothly animates to final position
  - Rank number (e.g., #3) appears when complete
  - Process completes within 10 seconds (P95 target)

**Test Scenario**:
1. Add manual task: "Review architecture diagrams" (with active outcome)
2. Verify "Prioritizing..." indicator appears below task
3. Wait for re-prioritization to complete (<10 seconds)
4. Verify task moves to prioritized position (e.g., #3 in list)
5. Verify rank number appears
6. Refresh page, verify task maintains position
7. Add manual task without active outcome
8. Verify NO re-prioritization triggered (task stays at bottom)

**Files Modified**:
- `app/priorities/components/TaskList.tsx` (modify: add re-prioritization trigger)
- `app/priorities/components/TaskRow.tsx` (modify: add priority status indicators)
- `app/api/tasks/manual/route.ts` (modify: add prioritization trigger logic)

**Dependencies**: T002 (manual task creation must work)
**Parallel**: Can run alongside T003

---

## Phase 3: P0 User Journey - Inline Task Editing

### T005 [X] [SLICE] User can edit task text inline and see changes saved with visual feedback
**User Story**: As a user, I can click a pencil icon on any task, edit its text, press Enter or click away, and see a save indicator confirming my changes were saved

**Implementation Scope**:
- **UI**: Inline editing in TaskRow (`app/priorities/components/TaskRow.tsx`)
  - Display mode: Show pencil icon (✏️) on hover
  - Edit mode state: `{ mode: 'idle' | 'editing' | 'saving' | 'error', draftText, originalText }`
  - Click pencil → Switch to contentEditable input, auto-focus, select all
  - On blur or Enter → Debounce 500ms → Save
  - Visual feedback:
    * Saving: Spinner icon (💾)
    * Success: Green checkmark (✅) for 1 second
    * Error: Red X (❌) with error tooltip
  - On error: Revert to originalText
  - Lock editing when `sessionStatus === 'running'` (prioritization in progress)

- **Backend**: Task update service (`lib/services/manualTaskService.ts`)
  - `updateTask(taskId, params)` function:
    * Load existing task from database
    * Verify permission: If is_manual=true, check created_by matches user
    * If task_text changed: Calculate Levenshtein distance
    * If change >10%: Regenerate embedding, otherwise use cached
    * Update task_embeddings row
    * Return updated task + embedding_regenerated flag

- **API**: PATCH `/api/tasks/[id]` route (`app/api/tasks/[id]/route.ts`)
  - Parse task ID from params
  - Validate request body with `taskEditSchema` (Zod)
  - Call `updateTask()` from service
  - Handle errors: 404 (not found), 403 (permission denied), 400 (validation)
  - Return 200 with updated task or appropriate error

- **Data**:
  - Zod schema: `taskEditInputSchema` (at least one field required)
  - Supabase update: task_embeddings row (task_text, updated_at, optionally embedding)
  - Embedding cache: In-memory Map with 5-minute TTL

- **Feedback**:
  - Pencil icon visible on hover
  - Edit field auto-focused with text selected
  - Debounced save (no save spam during typing)
  - Clear visual states: idle → editing → saving → success/error
  - Error message tooltip: "Failed to save task"
  - Edit locked during prioritization: "Editing disabled during prioritization"

**Test Scenario**:
1. Navigate to `/priorities` with existing tasks
2. Hover over any task, verify pencil icon appears
3. Click pencil icon
4. Verify text becomes editable, auto-focused, selected
5. Edit text: "Implement authentication" → "Implement user authentication system"
6. Press Enter
7. Verify save spinner appears
8. Verify success checkmark flashes
9. Verify text updated
10. Refresh page, verify change persisted
11. Try editing during prioritization
12. Verify edit field disabled with message

**Files Modified**:
- `app/priorities/components/TaskRow.tsx` (modify: add edit mode, visual feedback)
- `lib/services/manualTaskService.ts` (modify: add `updateTask()` function)
- `lib/schemas/manualTaskSchemas.ts` (modify: add `taskEditInputSchema`)
- `app/api/tasks/[id]/route.ts` (create)

**Dependencies**: T002 (manual tasks must exist to edit)

---

### T006 [X] [P] [SLICE] Write contract tests for task edit API
**User Story**: As a developer, I can verify the PATCH /api/tasks/[id] endpoint meets its contract specification

**Implementation Scope**:
- **Test File**: `__tests__/contract/task-edit-api.test.ts`
  - Test: PATCH valid edit → 200 with updated task
  - Test: PATCH no fields provided → 400 NO_FIELDS_PROVIDED
  - Test: PATCH non-existent task → 404 TASK_NOT_FOUND
  - Test: PATCH manual task (wrong user) → 403 PERMISSION_DENIED
  - Test: PATCH AI task (any user) → 200 (anyone can edit)
  - Test: PATCH with significant text change → embedding_regenerated = true
  - Test: PATCH with minor text change → embedding_regenerated = false

- **Test Setup**: Mock Supabase client, OpenAI embedding service, user context
- **Assertions**: Response status, body structure, error codes match contract spec
- **Data**: Uses contract spec from `contracts/manual-task-api.yaml`

**Test Scenario**:
```typescript
describe('PATCH /api/tasks/[id]', () => {
  it('updates task successfully', async () => {
    const task = await createManualTask({ text: 'Email legal' });
    const response = await PATCH(task.id, { task_text: 'Email legal department' });
    expect(response.status).toBe(200);
    expect(response.body.task.task_text).toBe('Email legal department');
  });

  it('enforces permission for manual tasks', async () => {
    const task = await createManualTask({ text: 'My task', created_by: 'user-1' });
    const response = await PATCH(task.id, { task_text: 'Updated' }, { user: 'user-2' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PERMISSION_DENIED');
  });
});
```

**Files Modified**:
- `__tests__/contract/task-edit-api.test.ts` (create)

**Dependencies**: T005 (API endpoint must exist)
**Parallel**: Can run alongside T007

---

### T007 [X] [P] [SLICE] Edited tasks trigger re-prioritization automatically
**User Story**: As a user, after editing a task, I can see the task list re-prioritize automatically and the edited task move to its new position if priority changed

**Implementation Scope**:
- **UI**: Re-prioritization trigger after edit (`app/priorities/components/TaskList.tsx`)
  - After successful edit (PATCH returns 200), check if active outcome exists
  - If outcome exists, trigger re-prioritization
  - Show "Prioritizing..." indicator on edited task
  - Update all task positions when prioritization completes

- **Backend**: Extend PATCH `/api/tasks/[id]` response (`app/api/tasks/[id]/route.ts`)
  - Check if active outcome exists
  - If yes, trigger re-prioritization via existing service
  - Return `prioritization_triggered: true` in response

- **UI Enhancement**: Priority change animation (`app/priorities/components/TaskRow.tsx`)
  - Highlight edited task briefly (yellow background fade)
  - Animate position change if task moves
  - Update rank number

- **Data**: No new data structures (uses existing agent_sessions)

- **Feedback**:
  - Edit success → Brief highlight → "Prioritizing..." → Position update → Final rank
  - Smooth animations for position changes
  - No re-prioritization if no active outcome (expected behavior)

**Test Scenario**:
1. Edit task text significantly (change from "Email legal" to "Complete legal contract review and sign NDA")
2. Verify save succeeds
3. Verify "Prioritizing..." indicator appears
4. Wait for re-prioritization (<10 seconds)
5. Verify task may move position (e.g., #5 → #2 if higher priority)
6. Verify rank number updates
7. Edit task without active outcome
8. Verify NO re-prioritization triggered

**Files Modified**:
- `app/priorities/components/TaskList.tsx` (modify: add re-prioritization trigger after edit)
- `app/priorities/components/TaskRow.tsx` (modify: add highlight animation)
- `app/api/tasks/[id]/route.ts` (modify: add prioritization trigger logic)

**Dependencies**: T005 (editing must work)
**Parallel**: Can run alongside T006

---

## Phase 4: P0 User Journey - Discard Approval

### T008 [X] [SLICE] User can review and approve which tasks get discarded during re-prioritization
**User Story**: As a user, when re-prioritization wants to remove tasks, I see a review modal where I can approve or reject each discard individually, and only approved tasks get removed

**Implementation Scope**:
- **UI**: Discard Review Modal (`app/components/DiscardReviewModal.tsx`)
  - Modal title: "Review Proposed Removals (X tasks)"
  - For each discard candidate:
    * Task title
    * Removal reason (from agent)
    * Previous rank number
    * [MANUAL] badge if is_manual=true
    * Checkbox (default: checked - opt-out model)
  - Footer buttons:
    * "Apply Changes (Discard X)" - process approved discards
    * "Cancel All" - keep all tasks active, close modal
  - Visual design: Use shadcn Dialog component, responsive layout

- **Backend**: Discard candidate detection (`app/priorities/components/TaskList.tsx`)
  - After re-prioritization completes, compare:
    * Previous plan: `ordered_task_ids` from previous agent_session
    * New plan: `ordered_task_ids` from latest agent_session
  - Detect removed tasks: In previous but not in new
  - Load task metadata (titles) from `task_embeddings`
  - Load removal reasons from `agent_sessions.result.removed_tasks` (if available)
  - Map to DiscardCandidate objects:
    ```typescript
    {
      taskId: string,
      title: string,
      reason: string,
      previousRank: number,
      isManual: boolean,
      approved: true // default
    }
    ```

- **UI Integration**: Modal trigger in TaskList (`app/priorities/components/TaskList.tsx`)
  - State: `discardCandidates: DiscardCandidate[]`, `showDiscardReview: boolean`
  - After re-prioritization, if discard candidates detected, set `showDiscardReview = true`
  - Replace existing auto-discard logic with modal trigger
  - On "Apply Changes": Update status to 'discarded' for approved tasks only
  - On "Cancel All": Close modal, keep all tasks active

- **Data**:
  - TypeScript type: `DiscardCandidate` (defined in data-model.md)
  - Supabase update: Set `status = 'discarded'` for approved tasks
  - No deletion: Tasks remain in database for audit trail

- **Feedback**:
  - Modal appears BEFORE any tasks are removed
  - Clear distinction: Approved (checked) vs Rejected (unchecked)
  - Button shows count: "Apply Changes (Discard 3)"
  - Tasks move to "Discarded" section after approval
  - Rejected tasks remain in "Active Priorities"
  - Toast notification: "3 tasks discarded, 2 kept active"

**Test Scenario**:
1. Set up: Have 5 active tasks in list
2. Add reflection: "Focus only on critical path items"
3. Click "Analyze Tasks" to trigger re-prioritization
4. Wait for agent to complete (~10-30 seconds)
5. Verify discard modal appears (assume agent wants to remove 3 tasks)
6. Verify modal shows:
   - Title: "Review Proposed Removals (3 tasks)"
   - 3 tasks with titles, reasons, previous ranks
   - All 3 checked by default
7. Uncheck 1 task (reject discard)
8. Click "Apply Changes (Discard 2)"
9. Verify modal closes
10. Verify 2 tasks moved to "Discarded" section
11. Verify 1 rejected task remains in "Active Priorities"
12. Verify toast: "2 tasks discarded, 1 kept active"

**Files Modified**:
- `app/components/DiscardReviewModal.tsx` (create)
- `app/priorities/components/TaskList.tsx` (modify: add discard detection, modal trigger, replace auto-discard)
- `app/priorities/page.tsx` (modify: add Discarded section if not exists)

**Dependencies**: T004 or T007 (re-prioritization must work)

---

### T009 [X] [SLICE] Write integration test for discard approval workflow
**User Story**: As a developer, I can verify the complete discard approval flow works end-to-end

**Implementation Scope**:
- **Test File**: `__tests__/integration/discard-approval-flow.test.tsx`
  - Test: Re-prioritization triggers discard modal
  - Test: All tasks default to approved (checked)
  - Test: Unchecking task prevents discard
  - Test: "Apply Changes" discards only approved tasks
  - Test: "Cancel All" keeps all tasks active
  - Test: Manual tasks show [MANUAL] badge in modal

- **Test Setup**:
  - Create mock tasks (3 active)
  - Mock agent response with removed_tasks
  - Render TaskList with mock session

- **Assertions**:
  - Modal appears with correct count
  - Checkbox states default to checked
  - Database updates only for approved tasks
  - Task list UI updates correctly

**Test Scenario**:
```typescript
describe('Discard Approval Flow', () => {
  it('allows selective task discard approval', async () => {
    // Setup: 3 tasks, agent wants to remove 2
    const tasks = await createMockTasks(3);
    const agentResult = mockAgentResponse({ remove: [tasks[1].id, tasks[2].id] });

    // Trigger re-prioritization
    await triggerPrioritization();

    // Verify modal appears
    expect(screen.getByText('Review Proposed Removals (2 tasks)')).toBeInTheDocument();

    // Uncheck one task
    const checkbox = screen.getAllByRole('checkbox')[0];
    await userEvent.click(checkbox);

    // Apply changes
    await userEvent.click(screen.getByText(/Apply Changes \(Discard 1\)/));

    // Verify results
    expect(await getTask(tasks[1].id)).toMatchObject({ status: 'pending' }); // Kept
    expect(await getTask(tasks[2].id)).toMatchObject({ status: 'discarded' }); // Removed
  });
});
```

**Files Modified**:
- `__tests__/integration/discard-approval-flow.test.tsx` (create)

**Dependencies**: T008 (discard modal must exist)
**Parallel**: Can run independently

---

## Phase 5: Error Handling & Edge Cases

### T010 [X] [P] [SLICE] Duplicate task detection shows friendly error and highlights existing task
**User Story**: As a user, when I try to add a task similar to an existing one, I see a clear error message showing me which existing task is similar, so I can decide whether to modify my input or skip creation

**Implementation Scope**:
- **UI**: Error display in ManualTaskModal (`app/components/ManualTaskModal.tsx`)
  - Parse DUPLICATE_TASK error response from API
  - Display error message: "Similar task already exists:"
  - Show existing task details: task_text, similarity score (e.g., "0.94")
  - Highlight the conflicting field (task_text input)
  - Option to "View Existing Task" (scroll to it in list)
  - Modal stays open (don't close on error)
  - User can modify input and retry

- **Backend**: Already implemented in T002 (`manualTaskService.ts`)
  - Duplicate detection via `searchSimilarTasks()` with >0.9 threshold
  - Return 400 with DUPLICATE_TASK code + existing task info

- **UI Enhancement**: Existing task highlight (`app/priorities/components/TaskList.tsx`)
  - When "View Existing Task" clicked:
    * Scroll to existing task in list
    * Highlight with yellow background fade (2 seconds)
    * Focus animation

- **Data**: No new data structures (uses existing error response)

- **Feedback**:
  - Clear error message with similarity score
  - Existing task info visible without leaving modal
  - "View Existing Task" link navigates to it
  - Highlighted task in list is obvious
  - User can modify input and try again

**Test Scenario**:
1. Add task: "Email legal about contract review"
2. Task created successfully
3. Try adding: "Send email to legal department about contract"
4. Verify modal shows error: "Similar task already exists"
5. Verify shows existing task: "Email legal about contract review (similarity: 0.94)"
6. Click "View Existing Task"
7. Verify modal stays open
8. Verify existing task highlighted in list
9. Modify input to be different: "Schedule meeting with product team"
10. Click "Add Task"
11. Verify new task created (not similar)

**Files Modified**:
- `app/components/ManualTaskModal.tsx` (modify: add error display, "View Existing Task" link)
- `app/priorities/components/TaskList.tsx` (modify: add highlight scroll function)

**Dependencies**: T002 (manual task creation must work)
**Parallel**: Can run alongside T011

---

### T011 [X] [P] [SLICE] Edit failures revert to original text with clear error feedback
**User Story**: As a user, if my task edit fails to save (network error, validation error), I see a clear error message and the task text reverts to its original value so I don't lose data

**Implementation Scope**:
- **UI**: Error recovery in TaskRow (`app/priorities/components/TaskRow.tsx`)
  - Edit state includes `originalText` (captured when entering edit mode)
  - On API error (PATCH fails):
    * Revert `draftText` to `originalText`
    * Set `mode: 'error'`
    * Show error icon (❌) with tooltip
    * Display error message: "Failed to save task: [reason]"
    * Auto-exit error mode after 3 seconds OR user dismisses
  - User can click error icon to see full error details
  - User can retry edit by clicking pencil icon again

- **Backend**: Already implemented in T005 (error responses from PATCH)
  - 400: Validation errors (task_text too short, etc.)
  - 403: Permission denied
  - 404: Task not found
  - 500: Server error

- **UI Enhancement**: Error tooltip styling
  - Use shadcn Tooltip component
  - Red background with white text
  - Show for 3 seconds then auto-hide

- **Data**: No new data structures (uses existing error responses)

- **Feedback**:
  - Text immediately reverts on error (no partial save state)
  - Clear visual indicator (red X icon)
  - Detailed error message in tooltip
  - User can retry without confusion
  - No data loss (original text preserved)

**Test Scenario**:
1. Edit task text: "Email legal" → "A" (too short, will fail validation)
2. Press Enter
3. Verify save spinner appears briefly
4. Verify error icon (❌) appears
5. Verify text reverts to "Email legal"
6. Hover over error icon
7. Verify tooltip: "Failed to save task: String must contain at least 10 character(s)"
8. Wait 3 seconds
9. Verify error icon disappears (auto-dismiss)
10. Simulate network error (disconnect network)
11. Edit task again: "Email legal" → "Email legal department"
12. Press Enter
13. Verify error: "Failed to save task: Network error"
14. Verify text reverts to "Email legal"

**Files Modified**:
- `app/priorities/components/TaskRow.tsx` (modify: add error recovery, revert logic, error tooltip)

**Dependencies**: T005 (editing must work)
**Parallel**: Can run alongside T010

---

### T012 [X] [P] [SLICE] Manual tasks without active outcome skip re-prioritization gracefully
**User Story**: As a user, when I add or edit a task and no active outcome exists, the task is created/updated successfully without triggering re-prioritization, and I understand why

**Implementation Scope**:
- **Backend**: Outcome check in API routes
  - POST `/api/tasks/manual` (already in T002):
    * Check if `outcome_id` provided OR active outcome exists in database
    * If NO: Skip re-prioritization, return `prioritization_triggered: false`
    * If YES: Trigger re-prioritization, return `prioritization_triggered: true`
  - PATCH `/api/tasks/[id]` (already in T005):
    * Same logic as POST
    * Query `user_outcomes` table for active outcome

- **UI**: Informational message in TaskList (`app/priorities/components/TaskList.tsx`)
  - After manual task creation, if `prioritization_triggered: false`:
    * Show info toast: "Task added. Set an outcome to enable auto-prioritization."
    * Task appears at bottom of list (no rank number)
    * No "Prioritizing..." indicator
  - After edit, if `prioritization_triggered: false`:
    * Show info toast: "Task updated. Set an outcome to enable re-prioritization."

- **UI Enhancement**: Outcome prompt (`app/priorities/page.tsx`)
  - If no active outcome exists, show banner at top of page:
    * "Set an outcome to enable automatic task prioritization"
    * Button: "Create Outcome" (opens OutcomeBuilder modal)
    * Dismissible (localStorage)

- **Data**: No new data structures (uses existing outcome check)

- **Feedback**:
  - Clear info message explaining why no prioritization
  - Task still created/updated successfully
  - Helpful prompt to create outcome
  - No error (expected behavior)

**Test Scenario**:
1. Remove all active outcomes (or start fresh)
2. Add manual task: "Email legal department"
3. Verify task created successfully
4. Verify info toast: "Task added. Set an outcome to enable auto-prioritization."
5. Verify NO "Prioritizing..." indicator
6. Verify task appears at bottom of list (no rank)
7. Verify banner: "Set an outcome to enable automatic task prioritization"
8. Click "Create Outcome"
9. Verify OutcomeBuilder modal opens
10. Create outcome: "Complete legal compliance review"
11. Add another manual task: "Review NDA terms"
12. Verify re-prioritization triggers (because outcome now exists)

**Files Modified**:
- `app/api/tasks/manual/route.ts` (modify: add outcome check)
- `app/api/tasks/[id]/route.ts` (modify: add outcome check)
- `app/priorities/components/TaskList.tsx` (modify: add info toast)
- `app/priorities/page.tsx` (modify: add outcome prompt banner)

**Dependencies**: T002, T005 (manual task creation and editing)
**Parallel**: Can run independently

---

## Phase 6: Performance Optimization & Polish

### T013 [X] [P] [SLICE] Implement embedding cache to reduce API costs for minor edits
**User Story**: As a system, when a user makes a minor edit to a task (e.g., fixing typo), I reuse the cached embedding instead of calling OpenAI API, reducing costs while maintaining duplicate detection accuracy

**Implementation Scope**:
- **Backend**: Embedding cache service (`lib/services/embeddingCache.ts`)
  - In-memory Map: `{ key: "${taskId}:${textHash}", value: { embedding, expires } }`
  - `getCachedEmbedding(taskId, text)`: Check cache, validate TTL (5 minutes)
  - `setCachedEmbedding(taskId, text, embedding)`: Store with TTL
  - `textHash(text)`: SHA-256 hash of normalized text
  - Text difference check: Levenshtein distance
    * If change <10%: Return cached embedding
    * If change ≥10%: Regenerate embedding

- **Integration**: Update `manualTaskService.ts`
  - In `updateTask()` function:
    * Before calling `generateEmbedding()`, check cache
    * Calculate text difference using Levenshtein distance
    * If <10% different: Use cached embedding
    * If ≥10% different OR cache miss: Generate new embedding
    * Always cache new embeddings

- **Monitoring**: Add performance logging
  - Log: "Embedding cache hit: task-abc123"
  - Log: "Embedding regenerated (text change: 15%): task-abc123"
  - Track cache hit rate for monitoring

- **Data**: In-memory cache (no database changes)

- **Feedback**:
  - No user-visible changes (performance optimization)
  - Faster edit saves for minor changes (<200ms vs ~500ms)
  - Reduced OpenAI API costs (~80% reduction for typical editing patterns)

**Test Scenario** (performance validation):
1. Edit task: "Email legal" → "Email legal department" (add 2 words, ~20% change)
2. Verify new embedding generated (logged)
3. Immediately edit again: "Email legal department" → "Email legal dept" (typo fix, ~5% change)
4. Verify cached embedding used (logged: "cache hit")
5. Wait 6 minutes (TTL expires)
6. Edit again: "Email legal dept" → "Email legal dept." (add period, ~1% change)
7. Verify new embedding generated (cache expired)
8. Check logs for cache hit rate

**Files Modified**:
- `lib/services/embeddingCache.ts` (create)
- `lib/services/manualTaskService.ts` (modify: integrate cache)

**Dependencies**: T005 (editing must work)
**Parallel**: Can run independently

---

### T014 [X] [P] [SLICE] Add [MANUAL] badge styling and hover tooltips
**User Story**: As a user, I can visually distinguish manual tasks from AI-extracted tasks by their [MANUAL] badge, and I can hover over the badge to understand what it means

**Implementation Scope**:
- **UI**: Badge styling in TaskRow (`app/priorities/components/TaskRow.tsx`)
  - Render [MANUAL] badge when `is_manual === true`
  - Styling (Tailwind CSS):
    * Purple background: `bg-purple-500/20`
    * Purple text: `text-purple-700 dark:text-purple-300`
    * Rounded corners: `rounded-md`
    * Padding: `px-2 py-0.5`
    * Font size: `text-xs`
    * Font weight: `font-medium`
  - Position: After task title, inline
  - Hover tooltip (shadcn Tooltip):
    * "This task was manually added by you"
    * Appears on badge hover
    * 200ms delay

- **UI Enhancement**: AI task indicator (optional, for contrast)
  - For AI-extracted tasks (is_manual === false), show subtle [AI] badge
  - Styling: Blue background `bg-blue-500/20`, blue text
  - Tooltip: "This task was extracted from a document"

- **Design System**: Follow existing badge patterns
  - Reference: Check for existing badge components in codebase
  - Consistent with design system colors and shadows
  - WCAG AA contrast ratio (4.5:1 minimum)

- **Data**: No new data (uses existing is_manual column)

- **Feedback**:
  - Clear visual distinction between manual and AI tasks
  - Tooltips provide context for new users
  - Consistent design with rest of UI

**Test Scenario**:
1. Add manual task: "Email legal department"
2. Verify [MANUAL] badge appears after task title
3. Verify badge has purple background and text
4. Hover over badge
5. Verify tooltip: "This task was manually added by you"
6. Upload document to create AI tasks
7. Verify AI tasks optionally show [AI] badge (if implemented)
8. Verify visual contrast between manual and AI tasks

**Files Modified**:
- `app/priorities/components/TaskRow.tsx` (modify: add badge rendering, styling, tooltips)

**Dependencies**: T002 (manual tasks must exist)
**Parallel**: Can run independently

---

### T015 [X] [SLICE] Manual QA execution using quickstart scenarios
**User Story**: As a QA engineer, I can execute all quickstart test scenarios and verify every acceptance criterion is met

**Implementation Scope**:
- **QA Execution**: Follow `quickstart.md` test scenarios
  - Scenario 1: Manual Task Creation (7 acceptance criteria)
  - Scenario 2: Inline Task Editing (4 acceptance criteria)
  - Scenario 3: Discard Approval Workflow (7 acceptance criteria)
  - Scenario 4: Error Handling (3 edge cases)

- **Performance Validation**: Execute benchmarks from quickstart.md
  - Manual task → prioritized: <10 seconds (P95)
  - Edit save: <500ms (P95)
  - Discard modal render: <200ms
  - Use browser DevTools Performance tab

- **Database Verification**: Run SQL queries from quickstart.md
  - Verify manual tasks created correctly
  - Verify embeddings generated
  - Verify manual task document exists

- **Integration Validation**: Check agent_sessions
  - Verify re-prioritization includes manual tasks
  - Verify removed_tasks in agent result

- **Checklist Completion**: Mark all acceptance criteria in quickstart.md
  - Manual Task Creation: 10 items
  - Inline Editing: 9 items
  - Discard Approval: 10 items
  - Performance: 4 items
  - Error Handling: 4 items

**Test Scenario**:
1. Execute each quickstart scenario step-by-step
2. Document results in test report
3. Take screenshots of key interactions
4. Log performance metrics
5. Verify database state after each scenario
6. Report any failing criteria

**Deliverables**:
- Test report document (markdown)
- Screenshots of successful flows
- Performance metrics log
- Database verification queries output
- List of any issues found

**Files Modified**:
- `specs/013-docs-shape-pitches/TEST_REPORT.md` (create)

**Dependencies**: T002, T005, T008 (all core slices must work)

---

### T016 [X] [SLICE] Write integration tests for complete user journeys
**User Story**: As a developer, I can run automated integration tests that verify complete user journeys work end-to-end

**Implementation Scope**:
- **Test Files**:
  1. `__tests__/integration/manual-task-flow.test.tsx`
     - Complete flow: Add manual task → Auto-prioritize → Verify position
     - Test with and without active outcome
     - Test duplicate detection blocking

  2. `__tests__/integration/task-edit-flow.test.tsx`
     - Complete flow: Edit task → Save → Re-prioritize → Verify new position
     - Test with minor edit (cache hit)
     - Test with major edit (embedding regeneration)
     - Test edit during prioritization (locked)
     - Test edit failure recovery

  3. Already created in T009: `__tests__/integration/discard-approval-flow.test.tsx`

- **Test Setup**:
  - Use Vitest + @testing-library/react
  - Mock Supabase client (use test database or mocks)
  - Mock OpenAI embedding service (deterministic responses)
  - Mock Mastra agent (controlled prioritization results)

- **Test Coverage**: Aim for >80% coverage of critical paths
  - Manual task creation service
  - Task edit service
  - Discard candidate detection
  - Re-prioritization triggers

- **CI Integration**: Tests run on pull request
  - Add to existing CI pipeline
  - Fail PR if tests fail

**Test Scenario**:
```typescript
describe('Manual Task Flow', () => {
  it('completes full manual task creation journey', async () => {
    // Setup: Active outcome exists
    await createActiveOutcome('Complete legal review');

    // User adds manual task
    await userEvent.click(screen.getByText('+ Add Task'));
    await userEvent.type(screen.getByLabelText('Task text'), 'Email legal department');
    await userEvent.click(screen.getByText('Add Task'));

    // Verify task appears
    expect(await screen.findByText('Email legal department')).toBeInTheDocument();
    expect(screen.getByText('[MANUAL]')).toBeInTheDocument();

    // Verify prioritization triggered
    expect(screen.getByText('Prioritizing...')).toBeInTheDocument();

    // Wait for prioritization to complete
    await waitFor(() => {
      expect(screen.queryByText('Prioritizing...')).not.toBeInTheDocument();
    }, { timeout: 10000 });

    // Verify task has rank
    expect(screen.getByText(/#\d+/)).toBeInTheDocument();
  });
});
```

**Files Modified**:
- `__tests__/integration/manual-task-flow.test.tsx` (create)
- `__tests__/integration/task-edit-flow.test.tsx` (create)
- `__tests__/integration/discard-approval-flow.test.tsx` (already exists from T009)

**Dependencies**: T002, T005, T008 (all core slices)
**Parallel**: Can run independently

---

## Dependencies

```
Phase 1: Database Foundation
T001 [SETUP] → (blocks) → ALL Phase 2-6 tasks

Phase 2: Manual Task Creation
T001 → T002 → T003, T004
T002 → T003 (contract tests need API)
T002 → T004 (re-prioritization needs manual tasks)

Phase 3: Inline Editing
T002 → T005 → T006, T007
T005 → T006 (contract tests need API)
T005 → T007 (re-prioritization needs editing)

Phase 4: Discard Approval
T004 OR T007 → T008 → T009
(Re-prioritization from either manual creation or editing enables discard approval)

Phase 5: Error Handling
T002 → T010 (duplicate detection)
T005 → T011 (edit failure recovery)
T002, T005 → T012 (no outcome handling)

Phase 6: Polish
T005 → T013 (embedding cache)
T002 → T014 (badge styling)
T002, T005, T008 → T015 (manual QA)
T002, T005, T008 → T016 (integration tests)
```

**Parallel Execution**:
- After T001: Run T002 alone (foundational)
- After T002: Run T003, T004 in parallel
- After T004: Run T005 alone
- After T005: Run T006, T007 in parallel
- After T007: Run T008 alone
- After T008: Run T009, T010, T011, T012, T013, T014 in parallel
- After all parallel: Run T015, T016 in parallel (final validation)

---

## Parallel Execution Guidance

**Wave 1** (Sequential):
- T001 [SETUP] Apply database migration

**Wave 2** (Sequential):
- T002 [SLICE] Manual task creation

**Wave 3** (Parallel):
- T003 [P] [SLICE] Contract tests for manual task API
- T004 [P] [SLICE] Auto-prioritization after manual task creation

**Wave 4** (Sequential):
- T005 [SLICE] Inline task editing

**Wave 5** (Parallel):
- T006 [P] [SLICE] Contract tests for task edit API
- T007 [P] [SLICE] Auto-prioritization after task edit

**Wave 6** (Sequential):
- T008 [SLICE] Discard approval workflow

**Wave 7** (Parallel - Error Handling & Polish):
- T009 [P] [SLICE] Integration tests for discard approval
- T010 [X] [P] [SLICE] Duplicate detection error UI
- T011 [X] [P] [SLICE] Edit failure recovery
- T012 [X] [P] [SLICE] No outcome graceful handling
- T013 [X] [P] [SLICE] Embedding cache
- T014 [X] [P] [SLICE] Badge styling

**Wave 8** (Parallel - Final Validation):
- T015 [X] [SLICE] Manual QA execution
- T016 [X] [SLICE] Integration tests

---

## Notes

- **All tasks are vertical slices**: Each delivers complete user value (SEE + DO + VERIFY)
- **TDD enforced**: Contract tests (T003, T006) and integration tests (T009, T016) verify each slice
- **Performance targets**: All slices meet performance requirements from spec.md
- **Constitution compliant**: All tasks follow AI Note Synthesiser Constitution v1.1.7
- **No backend-only or frontend-only tasks**: Every slice includes full stack + user feedback
- **Parallel execution maximized**: 11 tasks can run in parallel across Waves 3, 5, 7, 8
- **Manual QA validates**: T015 executes all quickstart.md scenarios before completion

---

## Validation Checklist

*Verified before creating tasks.md*

- [x] Every [SLICE] task has a user story
- [x] Every [SLICE] task includes UI + Backend + Data + Feedback
- [x] Every [SLICE] task has a test scenario
- [x] No backend-only or frontend-only tasks exist
- [x] Setup tasks are minimal and justified (T001 only, required for all slices)
- [x] Tasks ordered by user value (P0 journeys first)
- [x] Parallel tasks truly operate on independent features/files
- [x] Each task specifies exact file paths to modify
- [x] All tasks align with spec.md requirements
- [x] All tasks follow design decisions from research.md
- [x] All tasks implement contracts from contracts/manual-task-api.yaml
- [x] All tasks can be validated via quickstart.md scenarios

---

**Tasks Ready for Execution** ✅
Total: 16 vertical slice tasks
Parallel potential: 11 tasks across 4 waves
Estimated completion: 3-5 days (assuming 1-2 tasks per day)
