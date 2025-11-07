# Tasks: Task Gap Filling with AI

**Input**: Design documents from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/011-task-gap-filling/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

## Execution Flow (Slice-Based)
```
1. Load plan.md from feature directory
   → ✅ Loaded: Next.js 15 web app, Mastra tools, TypeScript, React 19
2. Load spec.md for user journeys
   → ✅ 5 scenarios extracted: detect gaps, review/accept, edit, no gaps, errors
3. Load optional design documents
   → ✅ contracts/suggest-gaps-api.yaml: 2 API endpoints
   → ✅ data-model.md: 4 entities (Gap, BridgingTask, TaskSuggestion, GapAnalysisSession)
   → ✅ research.md: 4-indicator gap detection, Kahn's algorithm, temp 0.3 for AI
4. Generate VERTICAL SLICE tasks
   → Each user story = ONE complete slice with UI + API + Data + Feedback
   → Validate: Can user SEE, DO, and VERIFY this?
   → Reject: Backend-only, frontend-only, or infrastructure-only tasks
5. Apply slice ordering rules
   → P0 user journeys first (must-have: detect, generate, review, insert)
   → Setup tasks ONLY if blocking all P0 slices (schemas, types)
   → P1 journeys after P0 validated (error handling, edge cases)
   → Polish after core journeys work
6. Mark parallel execution
   → Different user journeys = [P] (independent feature slices)
   → Shared critical files = sequential (same modal, API route)
7. Validate EVERY task
   → ✅ Includes user story
   → ✅ Specifies UI entry point
   → ✅ Includes backend work
   → ✅ Describes visible outcome
   → ✅ Has test scenario
8. Return: SUCCESS (18 vertical slice tasks ready)
```

## Format: `[ID] [TYPE] [P?] User Story & Implementation Scope`
- **[SLICE]**: Complete vertical slice (UI → Backend → Data → Feedback)
- **[SETUP]**: Foundational work blocking ALL slices (avoid if possible)
- **[POLISH]**: Enhancement to existing working slice
- **[P]**: Can run in parallel with other [P] tasks

## Path Conventions
- **Next.js App Router**: `app/`, `app/api/`, `app/components/`
- **Services**: `lib/services/`, `lib/mastra/tools/`
- **Schemas**: `lib/schemas/`
- **Tests**: `__tests__/contract/`, `__tests__/integration/`, `lib/services/__tests__/`

---

## Phase 0: Setup (Minimal - Only Blocking Dependencies)

### T001 [SETUP] Define Zod schemas and TypeScript types for gap analysis entities
**Status**: ✅ Done

**Why Needed**: T002-T007 all require Gap, BridgingTask, and TaskSuggestion types. Schemas enforce data validation across UI, API, and Mastra tool layers.

**Implementation Scope**:
- Create `lib/schemas/gapAnalysis.ts`:
  - `GapSchema`: 4 indicators (time, action_type, skill, dependency), confidence (0-1)
  - `BridgingTaskSchema`: text (10-200 chars), estimated_hours (8-160), cognition enum, confidence, reasoning
  - `TaskSuggestionSchema`: UI-specific fields with checked state, edit_mode flag
  - `GapAnalysisSessionSchema`: audit trail with plan_snapshot, user_acceptances, performance_metrics
- Export TypeScript types: `Gap`, `BridgingTask`, `TaskSuggestion`, `GapAnalysisSession`
- Add Zod validation for all constraints (min/max lengths, number ranges, enums)

**Validation**:
- Schemas compile without errors
- All types exported and importable
- Validation catches invalid data (test with edge cases)

**Files Created**:
- `lib/schemas/gapAnalysis.ts` (NEW)

**Dependencies**: None (foundational)

---

## Phase 1: P0 User Journeys (Must-Have Features)

### T002 [SLICE] User clicks "Find Missing Tasks" button and sees loading state
**Status**: ✅ Done

**User Story**: As a user viewing my prioritized task plan, I can click "Find Missing Tasks" to trigger gap analysis and see immediate feedback that the system is working.

**Implementation Scope**:
- **UI** (`app/priorities/page.tsx` - line ~200, after task list):
  - Add "Find Missing Tasks" button below task list with icon (💡 or search icon)
  - Implement loading state: button disabled, spinner visible, text changes to "Analyzing..."
  - Use `useState` for loading flag, `useCallback` for click handler
- **API Stub** (`app/api/agent/suggest-gaps/route.ts` - NEW):
  - Create POST endpoint that returns empty response (stub for now)
  - Validate `session_id` in request body (Zod schema)
  - Return `{ gaps: [], suggestions: [], analysis_session_id: uuid() }` with 200 status
  - Log request to console for debugging
- **Data**: None yet (stub returns empty arrays)
- **Feedback**:
  - SEE: Button appears in priorities view
  - DO: Click button → button disables, spinner shows
  - VERIFY: Console shows API request logged, button re-enables after response

**Test Scenario** (Manual - use quickstart.md Scenario 1 setup):
1. Navigate to `/priorities` with existing prioritized tasks
2. Locate "Find Missing Tasks" button below task list
3. Click button
4. Observe: Button text changes to "Analyzing..." with spinner
5. Verify: Network tab shows POST to `/api/agent/suggest-gaps`
6. Confirm: Button re-enables after ~500ms (stub responds fast)

**Files Modified**:
- `app/priorities/page.tsx` (MODIFY - add button + loading state)
- `app/api/agent/suggest-gaps/route.ts` (CREATE - stub endpoint)

**Dependencies**: T001 (needs TaskSuggestion schema for return type)

---

### T003 [SLICE] User sees gap detection results in modal with gap context
**Status**: ✅ Done

**User Story**: As a user who clicked "Find Missing Tasks", I can see detected gaps displayed in a modal showing which tasks have logical discontinuities and why (time gap, action type jump, etc.).

**Implementation Scope**:
- **UI** (`app/components/SuggestedTasksModal.tsx` - NEW):
  - Create modal component using shadcn Dialog
  - Display gap context section for each detected gap:
    - "Gap detected between: #X: [predecessor text] → #Y: [successor text]"
    - Gap type badge (time/action_type/skill/dependency) with color coding
    - Confidence score (e.g., "3 of 4 indicators detected")
  - Empty state: "No gaps detected. Your plan appears complete." (when gaps array empty)
  - Close button (X in top-right)
- **Backend** (`lib/services/gapDetection.ts` - NEW):
  - Implement `detectGaps(tasks: Task[]): Gap[]` pure function
  - For each consecutive task pair, calculate 4 indicators:
    - `time_gap`: Math.abs(task2.estimated_hours - task1.estimated_hours) > 40
    - `action_type_jump`: Detect phase skip (research→design→build→test→deploy) using keyword matching
    - `no_dependency`: task2.depends_on does not include task1.id
    - `skill_jump`: Different skill domains (strategy/design/frontend/backend/qa) via keywords
  - Require 3+ indicators to flag gap (FR-002)
  - Calculate confidence: `(indicator_count - 2) / 2` (ranges 0.5-1.0)
  - Return top 3 gaps by confidence (FR-003)
- **API Route Update** (`app/api/agent/suggest-gaps/route.ts` - MODIFY):
  - Load latest agent session by session_id from Supabase
  - Extract `result.prioritized_tasks` array
  - Call `detectGaps(tasks)` to analyze sequence
  - Filter gaps where confidence ≥ 0.75
  - Return detected gaps in response (suggestions still empty array for now)
- **Data**: Read from `agent_sessions.result.prioritized_tasks` (existing table, no changes)
- **Feedback**:
  - SEE: Modal appears with gap context cards
  - DO: Read gap details (predecessor → successor, gap type, confidence)
  - VERIFY: Modal shows accurate gaps (compare with manual analysis of plan)

**Test Scenario** (Manual - quickstart.md Scenario 1):
1. Setup: Create agent session with tasks #1, #2, #5 (gap between #2→#5)
2. Click "Find Missing Tasks"
3. Verify modal opens with:
   - Title: "💡 1 Gap Detected"
   - Gap context: "#2: Design mockups → #5: Launch app"
   - Indicators: time_gap=true, action_type_jump=true, no_dependency=true (3/4)
   - Confidence: 75% or higher
4. Close modal with X button

**Files Modified/Created**:
- `app/components/SuggestedTasksModal.tsx` (CREATE - modal with gap display only)
- `lib/services/gapDetection.ts` (CREATE - pure gap detection logic)
- `lib/services/__tests__/gapDetection.test.ts` (CREATE - unit tests for 4 indicators)
- `app/api/agent/suggest-gaps/route.ts` (MODIFY - integrate gap detection)
- `app/priorities/page.tsx` (MODIFY - open modal on API response)

**Dependencies**: T001 (Gap schema), T002 (button + API stub)

---

### T004 [SLICE] User sees AI-generated bridging task suggestions for each gap
**Status**: ✅ Done

**User Story**: As a user viewing detected gaps in the modal, I can see 1-3 AI-generated bridging tasks per gap that logically connect the predecessor to successor, with confidence scores and time estimates.

**Implementation Scope**:
- **UI** (`app/priorities/components/GapDetectionModal.tsx` - MODIFY):
  - Add suggestions section below gap context
  - For each suggestion, display:
    - Checkbox (pre-checked by default - opt-out UX)
    - Task text (e.g., "Build MVP frontend with authentication")
    - Estimated hours as weeks ("2 weeks" for 80 hours)
    - Cognition level badge (low/medium/high with color: green/yellow/red)
    - Confidence percentage badge (e.g., "82% confident")
    - [Edit] button (placeholder for T006)
  - Use shadcn Card for each suggestion
  - Display counter: "X Tasks Suggested to Fill Gaps" in modal title
- **Backend** (`lib/mastra/tools/suggestBridgingTasks.ts` - NEW):
  - Create Mastra tool using `createTool()` from @mastra/core
  - Input schema: predecessor_id, successor_id, outcome_text, max_tasks (default 3)
  - Output schema: array of {text, estimated_hours, required_cognition, confidence, reasoning}
  - Execute function:
    1. Get document context for predecessor/successor using existing `getDocumentContext` tool
    2. Run semantic search for similar tasks: "tasks between [predecessor] and [successor]"
    3. Build AI prompt with context (outcome, gap, document markdown, search results)
    4. Call `generateObject()` from Vercel AI SDK with GPT-4o, temp 0.3, Zod output schema
    5. Filter out tasks with >0.9 similarity to existing tasks (deduplication - FR-007)
    6. Return top 3 tasks with metadata
  - Register tool in `lib/mastra/tools/index.ts`
- **API Route Update** (`app/api/agent/suggest-gaps/route.ts` - MODIFY):
  - For each detected gap (confidence ≥0.75):
    - Call `suggestBridgingTasksTool.execute()` with gap context
    - Convert BridgingTask[] to TaskSuggestion[] (add UUID, checked=true, format confidence as %)
  - Store GapAnalysisSession in `agent_sessions.result.gap_analysis` JSONB (plan_snapshot, detected_gaps, generated_tasks, performance_metrics)
  - Return suggestions array in API response
- **Data**: Write GapAnalysisSession to Supabase agent_sessions table (JSONB column, no migration needed)
- **Feedback**:
  - SEE: Modal displays 1-3 suggestion cards per gap
  - DO: Read suggestion details (text, hours, cognition, confidence)
  - VERIFY: Suggestions relevant to gap (mention implementation, building, testing)

**Test Scenario** (Manual - quickstart.md Scenario 1 continued):
1. Prerequisites: T003 complete, gap detected between #2→#5
2. Wait for AI generation (<5s per FR-020)
3. Verify modal shows 2-3 suggestions:
   - Example: "Build MVP frontend with authentication" (80 hours = 2 weeks, medium, 82%)
   - Example: "Implement backend API and database" (60 hours = 1.5 weeks, medium, 78%)
4. Check all suggestions pre-checked (checkboxes selected)
5. Verify confidence scores ≥70% (FR-023)
6. Confirm Supabase: agent_sessions.result.gap_analysis exists with generated_tasks array

**Files Modified/Created**:
- `app/components/SuggestedTasksModal.tsx` (MODIFY - add suggestions display)
- `lib/mastra/tools/suggestBridgingTasks.ts` (CREATE - Mastra tool for AI generation)
- `lib/mastra/tools/index.ts` (MODIFY - register new tool)
- `app/api/agent/suggest-gaps/route.ts` (MODIFY - call Mastra tool, store session)

**Dependencies**: T001 (BridgingTask schema), T003 (gap detection working)

---

### T005 [SLICE] User can uncheck/check suggestions to select which tasks to accept
**Status**: ✅ Done

**User Story**: As a user reviewing AI-generated suggestions, I can uncheck low-confidence or irrelevant tasks before accepting, and the "Accept Selected" button updates to show how many tasks I'm accepting.

**Implementation Scope**:
- **UI** (`app/priorities/components/GapDetectionModal.tsx` - MODIFY):
  - Add state management for checked suggestions: `useState<string[]>(initialCheckedIds)`
  - Implement checkbox onChange handler:
    - Toggle suggestion ID in/out of checked array
    - Update visual state: unchecked tasks have reduced opacity (0.6)
  - Add "Accept Selected (N)" button in modal footer
    - Dynamic count: N = checked.length
    - Disabled if N === 0
    - Primary styling (prominent CTA)
  - Add "Cancel" button (secondary styling)
- **Backend**: None (UI-only slice for selection state)
- **Data**: None (state lives in React component only)
- **Feedback**:
  - SEE: Checkboxes toggle visually, unchecked tasks fade out
  - DO: Click checkboxes to select/deselect tasks
  - VERIFY: Button label updates to "Accept Selected (2)" when 2 checked

**Test Scenario** (Manual - quickstart.md Scenario 2):
1. Prerequisites: T004 complete, modal shows 3 suggestions (all checked)
2. Identify lowest confidence suggestion (e.g., 68%)
3. Click checkbox to uncheck it
4. Observe: Task card opacity reduces to 60%, checkbox unchecked
5. Verify: Button changes from "Accept Selected (3)" to "Accept Selected (2)"
6. Re-check the task
7. Confirm: Button returns to "Accept Selected (3)"

**Files Modified**:
- `app/components/SuggestedTasksModal.tsx` (MODIFY - add checkbox state + button)

**Dependencies**: T004 (suggestions displayed)

---

### T006 [SLICE] User can edit suggestion text and estimated hours inline before accepting
**Status**: ✅ Done

**User Story**: As a user reviewing suggestions, I can click [Edit] to modify task text or estimated hours to better match my needs, and the edited values are preserved when I accept.

**Implementation Scope**:
- **UI** (`app/priorities/components/GapDetectionModal.tsx` - MODIFY):
  - Add edit mode state: `useState<{[id: string]: boolean}>({})`
  - Implement [Edit] button handler:
    - Toggle edit mode for suggestion
    - Replace static text with `<input>` or `<textarea>` (controlled component)
    - Replace hours display with number `<input>` (min=8, max=160)
  - Add inline validation:
    - Task text: 10-200 characters
    - Hours: 8-160 range
    - Show error message below input if invalid
  - Save edited values to state on blur/Enter:
    - Update `editedSuggestions: Map<string, {text, hours}>`
  - Change [Edit] to [Save] when in edit mode
  - Readonly fields: cognition_level, confidence_percentage (show but don't allow editing)
- **Backend**: None (edits stay in UI state until acceptance)
- **Data**: None (transient state)
- **Feedback**:
  - SEE: [Edit] button changes text/hours to input fields
  - DO: Type new values, press Enter or click away to save
  - VERIFY: Edited values display in card, validation errors shown for invalid input

**Test Scenario** (Manual - quickstart.md Scenario 3):
1. Prerequisites: T004 complete, modal shows suggestions
2. Click [Edit] on first suggestion ("Build MVP frontend with authentication", 80 hours)
3. Observe: Text becomes editable textarea, hours become number input
4. Modify text to: "Build MVP frontend with core screens only"
5. Change hours from 80 to 60
6. Press Enter or click away
7. Verify: Card shows edited values, [Edit] button reappears
8. Try invalid input: Set hours to 5 (below min 8)
9. Confirm: Error message "Hours must be between 8 and 160" appears
10. Correct to 60, verify error clears

**Files Modified**:
- `app/components/SuggestedTasksModal.tsx` (MODIFY - add inline editing)

**Dependencies**: T004 (suggestions displayed), T005 (selection working)

---

### T007 [SLICE] User accepts selected tasks and sees them inserted into plan with correct dependencies
**Status**: ✅ Done

**User Story**: As a user who has reviewed and selected bridging tasks, I can click "Accept Selected" to insert those tasks into my plan at the correct positions with proper dependency relationships, and see the updated plan immediately.

**Implementation Scope**:
- **UI** (`app/components/SuggestedTasksModal.tsx` - MODIFY):
  - Implement "Accept Selected" button click handler:
    - Collect checked suggestion IDs and edited values
    - Call POST `/api/agent/accept-suggestions` with payload: {analysis_session_id, accepted_task_ids, edited_tasks}
    - Show loading state on button ("Inserting...")
    - Close modal on 200 success
    - Display error toast on 400/500 (keep modal open)
  - Refresh priorities page after successful insertion
- **UI** (`app/priorities/page.tsx` - MODIFY):
  - Add task refresh mechanism after modal closes
  - Display "AI Generated" badge on inserted tasks (check task.source === 'ai_generated')
  - Highlight newly inserted tasks (temporary green border for 3s)
- **Backend** (`lib/services/taskInsertion.ts` - NEW):
  - Implement `insertBridgingTasks(gap, acceptedTasks, currentPlan): {success, insertedIds, error}`:
    1. Calculate insertion positions: Find index of predecessor, insert after it
    2. Generate new task IDs maintaining sequence (e.g., #3, #4 between #2 and #5)
    3. Create dependency chain:
       - new_task_1.depends_on = [predecessor_id]
       - new_task_2.depends_on = [new_task_1.id]
       - successor.depends_on = [new_task_N.id] (update existing task)
    4. Validate no circular dependencies using Kahn's algorithm (topological sort)
    5. If cycle detected: return {success: false, error: "Circular dependency detected"}
    6. If valid: insert tasks into plan array, return {success: true, insertedIds, updated_plan}
- **Backend** (`app/api/agent/accept-suggestions/route.ts` - NEW):
  - Validate request: analysis_session_id, accepted_task_ids required
  - Load GapAnalysisSession from agent_sessions.result.gap_analysis
  - Map accepted_task_ids to BridgingTask objects from generated_tasks array
  - Apply edits from edited_tasks payload
  - Call `insertBridgingTasks()` for each gap with accepted tasks
  - Update agent_sessions.result:
    - Add inserted tasks to prioritized_tasks array
    - Update gap_analysis.user_acceptances with acceptance decisions
    - Log gap_analysis.insertion_result (success/failure)
  - Return {success, inserted_task_ids, updated_plan}
- **Data**: Update Supabase agent_sessions.result.prioritized_tasks (JSONB, no migration)
- **Feedback**:
  - SEE: Modal closes, plan refreshes with new tasks #3, #4 visible
  - DO: New tasks show "AI Generated" badge, green highlight for 3s
  - VERIFY: Dependencies correct (#3→#2, #4→#3, #5→#4), no errors

**Test Scenario** (Manual - quickstart.md Scenario 2 + 3 combined):
1. Prerequisites: T005 complete, 2 tasks selected (1 edited)
2. Click "Accept Selected (2)"
3. Observe: Button shows "Inserting..." spinner
4. Wait for response (<2s per target)
5. Verify modal closes automatically
6. Check priorities page:
   - #1: Define Q4 goals (unchanged)
   - #2: Design app mockups (unchanged)
   - **#3: Build MVP frontend with core screens only** (NEW, edited text, "AI Generated" badge, green border)
   - **#4: Implement backend API and database** (NEW, "AI Generated" badge, green border)
   - #5: Launch on app store (unchanged, now depends on #4)
7. Verify dependencies in Supabase:
   - task #3: depends_on = ['002']
   - task #4: depends_on = ['003']
   - task #5: depends_on = ['004'] (was [], now updated)
8. Confirm GapAnalysisSession.user_acceptances logged with edited: true for #3

**Files Modified/Created**:
- `app/components/SuggestedTasksModal.tsx` (MODIFY - accept button handler)
- `app/priorities/page.tsx` (MODIFY - refresh + badges)
- `lib/services/taskInsertion.ts` (CREATE - insertion logic + cycle detection)
- `lib/services/__tests__/taskInsertion.test.ts` (CREATE - unit tests for Kahn's algorithm)
- `app/api/agent/accept-suggestions/route.ts` (CREATE - insertion endpoint)

**Dependencies**: T001 (schemas), T006 (editing working), existing `agent_sessions` table

---

## Phase 2: P1 User Journeys (Error Handling & Edge Cases)

### T008 [P] [SLICE] User sees "No gaps detected" message when plan is complete
**Status**: ✅ Done

**User Story**: As a user with a complete plan (no logical gaps), I can click "Find Missing Tasks" and receive positive feedback that my plan doesn't need bridging tasks.

**Implementation Scope**:
- **UI** (`app/components/SuggestedTasksModal.tsx` - MODIFY):
  - Detect empty gaps array in modal props
  - Display success message card:
    - Icon: ✅ or 🎉
    - Title: "No gaps detected"
    - Body: "Your plan appears complete. All tasks have logical progression."
    - Close button only (no accept button)
- **UI** (`app/priorities/page.tsx` - MODIFY):
  - Alternative: Show toast notification instead of modal when gaps.length === 0
  - Implementation choice: Modal for consistency (user expects modal after click)
- **Backend**: No changes (T003 gap detection already handles empty case)
- **Data**: None (no gaps to store)
- **Feedback**:
  - SEE: Modal or toast shows positive "no gaps" message
  - DO: Read confirmation message
  - VERIFY: No suggestions shown, button remains enabled for future re-checks

**Test Scenario** (Manual - quickstart.md Scenario 4):
1. Setup: Create complete plan with tasks #1-#7 (no gaps, all dependencies explicit)
2. Click "Find Missing Tasks"
3. Wait ~2s for analysis
4. Verify: Modal opens with "No gaps detected" message
5. Confirm: No suggestion cards shown, only Close button
6. Close modal
7. Re-click button to verify it works again

**Files Modified**:
- `app/components/SuggestedTasksModal.tsx` (MODIFY - add empty state UI)
- `app/priorities/page.tsx` (MODIFY - optional: toast alternative)

**Dependencies**: T003 (gap detection), T004 (modal structure)

---

### T009 [P] [SLICE] User sees friendly error when AI generation fails
**Status**: ✅ Done

**User Story**: As a user whose gap detection triggered an AI generation failure (e.g., OpenAI API error), I can see a user-friendly error message and retry the operation without system crash.

**Implementation Scope**:
- **UI** (`app/components/SuggestedTasksModal.tsx` - MODIFY):
  - Add error state props: `{error?: string, onRetry?: () => void}`
  - Display error card when error present:
    - Icon: ⚠️ or ❌
    - Title: "Unable to generate suggestions"
    - Body: "An error occurred while analyzing your plan. Please try again."
    - [Retry] button (calls onRetry callback)
    - [Close] button
  - Hide suggestions section when error shown
- **UI** (`app/priorities/page.tsx` - MODIFY):
  - Handle 500 error from `/api/agent/suggest-gaps`
  - Pass error message and retry handler to modal
  - Retry handler: re-trigger API call
- **Backend** (`app/api/agent/suggest-gaps/route.ts` - MODIFY):
  - Wrap Mastra tool execution in try/catch
  - Catch OpenAI errors (401 Unauthorized, 429 Rate Limit, 500 Server Error)
  - Log error details to console (for debugging) and Supabase (telemetry)
  - Return 500 with `{error: "Unable to generate suggestions. Please try again."}`
  - Store failed attempt in GapAnalysisSession.insertion_result: {success: false, error}
- **Backend** (`lib/mastra/tools/suggestBridgingTasks.ts` - MODIFY):
  - Add try/catch around `generateObject()` call
  - Retry once on transient errors (network timeout, 429 rate limit)
  - Throw descriptive error for permanent failures (401, invalid prompt)
- **Data**: Log error to agent_sessions.result.gap_analysis.insertion_result
- **Feedback**:
  - SEE: Error message modal with retry button
  - DO: Click [Retry] → button shows loading state
  - VERIFY: On success, modal shows suggestions; on repeat failure, error persists

**Test Scenario** (Manual - quickstart.md Scenario 5):
1. Setup: Temporarily set invalid OpenAI API key in `.env.local`
2. Restart dev server
3. Click "Find Missing Tasks" with gap plan (#2→#5)
4. Wait for analysis
5. Verify: Modal shows error "Unable to generate suggestions. Please try again."
6. Check console: Error logged with 401 Unauthorized details
7. Click [Retry]
8. Confirm: Same error appears (API key still invalid)
9. Restore valid API key, restart server, retry
10. Verify: Success - suggestions now appear
11. Check Supabase: gap_analysis.insertion_result.error logged

**Files Modified**:
- `app/components/SuggestedTasksModal.tsx` (MODIFY - error state UI)
- `app/priorities/page.tsx` (MODIFY - error handling + retry)
- `app/api/agent/suggest-gaps/route.ts` (MODIFY - try/catch + error response)
- `lib/mastra/tools/suggestBridgingTasks.ts` (MODIFY - retry logic)

**Dependencies**: T004 (AI generation working in happy path)

---

### T010 [P] [SLICE] User sees error when task insertion would create circular dependency
**Status**: ✅ Done

**User Story**: As a user accepting suggestions that would create a circular dependency (rare edge case), I can see a clear error explaining the problem and keep the modal open to adjust my selection.

**Implementation Scope**:
- **UI** (`app/components/SuggestedTasksModal.tsx` - MODIFY):
  - Handle 400 error from `/api/agent/accept-suggestions`
  - Display inline error banner above "Accept Selected" button:
    - Red background, white text
    - Message: "Cannot insert tasks - would create circular dependency chain"
    - Explanation: "Please review your current plan's dependencies or adjust selection."
  - Keep modal open (don't close on 400)
  - Allow user to change selection or cancel
- **Backend** (`lib/services/taskInsertion.ts` - MODIFY):
  - Implement Kahn's algorithm for cycle detection:
    - Build adjacency list from all dependencies (existing + new)
    - Calculate in-degrees for each task
    - Run topological sort (BFS from zero in-degree nodes)
    - If processed count !== total tasks: cycle exists
  - Return early with error before any database changes
  - Error message includes cycle path for debugging (optional, console only)
- **Backend** (`app/api/agent/accept-suggestions/route.ts` - MODIFY):
  - Check `insertBridgingTasks()` return value
  - If success === false: return 400 with error message
  - Log cycle detection event to gap_analysis.insertion_result
- **Data**: None (rollback before write)
- **Feedback**:
  - SEE: Red error banner in modal, modal stays open
  - DO: Read error, adjust selection (uncheck problematic task)
  - VERIFY: Can retry with different selection, no data corruption

**Test Scenario** (Manual - quickstart.md Scenario 6):
1. Setup: Create complex dependency scenario (requires dev tools or seed script):
   - Tasks: #1→#3, #2→[], #3→#2 (existing cycle)
   - Gap detected between #1→#2 (artificial)
2. Accept suggestion that would bridge #1→#2
3. Attempt insertion
4. Verify: 400 error returned, modal shows red banner with cycle message
5. Check console: Cycle path logged (e.g., "#2→#3→#2")
6. Confirm: No tasks inserted in database (rollback successful)
7. Close modal, fix cycle manually, retry
8. Verify: Success after cycle resolved

**Files Modified**:
- `app/components/SuggestedTasksModal.tsx` (MODIFY - 400 error handling)
- `lib/services/taskInsertion.ts` (MODIFY - Kahn's algorithm implementation)
- `lib/services/__tests__/taskInsertion.test.ts` (MODIFY - add cycle detection tests)
- `app/api/agent/accept-suggestions/route.ts` (MODIFY - return 400 on cycle)

**Dependencies**: T007 (insertion working), T001 (schemas for validation)

---

## Phase 3: P1 Polish & Observability

### T011 [P] [POLISH] Add performance metrics tracking and display to modal
**Status**: ✅ Done

**Enhancement to**: T004 (AI generation)

**User Story**: As a user, I can see how long gap detection and task generation took in the modal footer, and the system logs performance metrics for monitoring.

**Implementation Scope**:
- **UI** (`app/components/SuggestedTasksModal.tsx` - MODIFY):
  - Add footer text (small, muted color):
    - "Analysis completed in 3.2s (Detection: 0.8s, Generation: 2.4s)"
  - Receive performance_metrics from API: {detection_ms, generation_ms, total_ms}
  - Format milliseconds to seconds: `(ms / 1000).toFixed(1)s`
- **Backend** (`app/api/agent/suggest-gaps/route.ts` - MODIFY):
  - Add timing instrumentation:
    - Start timer before gap detection
    - Record detection_ms after `detectGaps()` completes
    - Record generation_ms after Mastra tool calls complete
    - Calculate total_ms (end - start)
  - Store metrics in GapAnalysisSession.performance_metrics
  - Include metrics in API response
- **Backend** (`lib/mastra/tools/suggestBridgingTasks.ts` - MODIFY):
  - Log search_query_count (how many semantic search calls made)
  - Add to performance_metrics
- **Data**: Write metrics to agent_sessions.result.gap_analysis.performance_metrics JSONB
- **Feedback**:
  - SEE: Footer shows timing breakdown
  - DO: Observe metrics across multiple runs
  - VERIFY: Metrics logged to Supabase for analysis

**Test Scenario**:
1. Click "Find Missing Tasks" with gap plan
2. Observe modal footer shows: "Analysis completed in X.Xs"
3. Check Supabase: gap_analysis.performance_metrics has detection_ms, generation_ms, total_ms
4. Verify: total_ms < 10000 (10s target per FR)

**Files Modified**:
- `app/components/SuggestedTasksModal.tsx` (MODIFY - display metrics)
- `app/api/agent/suggest-gaps/route.ts` (MODIFY - timing instrumentation)
- `lib/mastra/tools/suggestBridgingTasks.ts` (MODIFY - track search count)

**Dependencies**: T004 (AI generation slice complete)

---

### T012 [P] [POLISH] Add confidence score explanation tooltip in modal
**Status**: ✅ Done

**Enhancement to**: T004 (suggestions display)

**User Story**: As a user seeing confidence percentages on suggestions, I can hover over or click the confidence badge to understand how the score is calculated.

**Implementation Scope**:
- **UI** (`app/components/SuggestedTasksModal.tsx` - MODIFY):
  - Wrap confidence badge with shadcn Tooltip component
  - Tooltip content:
    - "Confidence calculation:"
    - "40% Semantic similarity to past tasks"
    - "30% Gap indicator strength"
    - "30% AI model confidence"
  - Show on hover (desktop) or click (mobile)
  - Use info icon (ⓘ) next to badge as trigger
- **Backend**: None (UI-only enhancement)
- **Data**: None
- **Feedback**:
  - SEE: Info icon next to confidence percentage
  - DO: Hover or click icon
  - VERIFY: Tooltip appears with explanation

**Test Scenario**:
1. Open modal with suggestions
2. Hover over confidence badge "82% confident" → tooltip appears
3. Read tooltip: shows 3-part confidence formula
4. Move mouse away → tooltip disappears
5. Test on mobile: tap badge → tooltip shows, tap again → hides

**Files Modified**:
- `app/components/SuggestedTasksModal.tsx` (MODIFY - add tooltip)

**Dependencies**: T004 (suggestions displayed)

---

### T013 [P] [POLISH] Add keyboard shortcuts for modal interactions
**Status**: ✅ Done

**Enhancement to**: T007 (modal acceptance flow)

**User Story**: As a power user, I can use keyboard shortcuts (Esc to close, Enter to accept) to interact with the modal quickly without reaching for the mouse.

**Implementation Scope**:
- **UI** (`app/components/SuggestedTasksModal.tsx` - MODIFY):
  - Implement keyboard event listeners:
    - `Escape`: Close modal (call onClose)
    - `Enter` (when not editing): Trigger "Accept Selected" button
    - `Tab`: Navigate between checkboxes and buttons (built-in browser behavior)
  - Use `useEffect` with `addEventListener('keydown', handler)`
  - Prevent Enter default when in edit mode (editing text/hours)
  - Add visual indicator: "Press Enter to accept" hint near button
- **Backend**: None (UI-only)
- **Data**: None
- **Feedback**:
  - SEE: Hint text "Press Esc to close, Enter to accept"
  - DO: Press Esc → modal closes
  - DO: Press Enter → accepts selected tasks (same as clicking button)
  - VERIFY: Keyboard navigation works smoothly

**Test Scenario**:
1. Open modal with suggestions
2. Press Tab multiple times → focus moves through checkboxes and buttons
3. Press Esc → modal closes
4. Re-open modal
5. Press Enter → tasks accepted (same as clicking "Accept Selected")
6. Test edit mode: Press Enter while editing → saves edit (doesn't trigger accept)

**Files Modified**:
- `app/priorities/components/GapDetectionModal.tsx` (MODIFY - keyboard handlers)

**Dependencies**: T005 (selection), T006 (editing), T007 (acceptance)

---

### T014 [P] [POLISH] Add multiple gaps support with collapsible sections
**Status**: ✅ Done

**Enhancement to**: T003 (gap display), T004 (suggestions display)

**User Story**: As a user with multiple gaps in my plan (rare but possible), I can see suggestions grouped by gap with collapsible sections to review each gap independently.

**Implementation Scope**:
- **UI** (`app/components/SuggestedTasksModal.tsx` - MODIFY):
  - Refactor gap display to support array of gaps (not just first gap)
  - For each gap, create collapsible section (shadcn Accordion):
    - Header: "Gap 1: #2→#5" (expanded by default)
    - Content: Gap context + suggestions for that gap
  - Update modal title: "X Gaps Detected, Y Tasks Suggested"
  - Allow independent selection per gap (checkboxes work across all gaps)
  - Sort gaps by confidence descending (highest confidence first)
- **Backend**: No changes (T003/T004 already return multiple gaps/suggestions)
- **Data**: None (already stored in arrays)
- **Feedback**:
  - SEE: Multiple accordion sections, one per gap
  - DO: Expand/collapse sections to focus on specific gaps
  - VERIFY: Can accept suggestions from different gaps in one click

**Test Scenario** (Manual - quickstart.md Scenario 7):
1. Setup: Create plan with 2 gaps (#2→#5, #7→#10)
2. Click "Find Missing Tasks"
3. Verify modal shows:
   - Title: "2 Gaps Detected, 5 Tasks Suggested"
   - Accordion section 1: "Gap 1: #2→#5" (expanded, shows 3 suggestions)
   - Accordion section 2: "Gap 2: #7→#10" (collapsed, shows 2 suggestions when expanded)
4. Expand both sections
5. Select 2 tasks from Gap 1, 1 task from Gap 2
6. Click "Accept Selected (3)"
7. Verify: All 3 tasks inserted at correct positions (#3, #4 after #2; #8 after #7)

**Files Modified**:
- `app/priorities/components/GapDetectionModal.tsx` (MODIFY - accordion for multiple gaps)

**Dependencies**: T003 (gap detection), T004 (suggestions), T007 (insertion)

---

## Phase 4: Testing & Contract Validation

### T015 [P] [SLICE] Contract tests validate API request/response schemas
**Status**: ✅ Done

**User Story**: As a developer, I can run contract tests that validate the `/api/agent/suggest-gaps` and `/api/agent/accept-suggestions` endpoints match the OpenAPI spec, catching schema drift early.

**Implementation Scope**:
- **Tests** (`__tests__/contract/agent-suggest-gaps.test.ts` - NEW):
  - Test POST `/api/agent/suggest-gaps`:
    - Valid request: Returns 200 with gaps[], suggestions[], analysis_session_id
    - Invalid request (missing session_id): Returns 400 with error message
    - Non-existent session: Returns 404
    - Schema validation: Gap objects match GapSchema, TaskSuggestion match TaskSuggestionSchema
  - Use Vitest + fetch API
  - Mock Supabase and OpenAI (or use test database)
- **Tests** (`__tests__/contract/accept-suggestions.test.ts` - NEW):
  - Test POST `/api/agent/accept-suggestions`:
    - Valid acceptance: Returns 200 with inserted_task_ids[], updated_plan
    - Circular dependency: Returns 400 with error
    - Invalid session: Returns 404
    - Schema validation: Inserted tasks have correct structure
- **Backend**: No changes (tests validate existing implementation)
- **Data**: Use test fixtures or mocked Supabase
- **Feedback**:
  - SEE: Test output shows pass/fail for each contract
  - DO: Run `pnpm test:contract`
  - VERIFY: All contract tests pass

**Test Scenario**:
1. Run `pnpm test:run __tests__/contract/agent-suggest-gaps.test.ts`
2. Verify: All assertions pass (200, 400, 404 status codes correct)
3. Run `pnpm test:run __tests__/contract/accept-suggestions.test.ts`
4. Confirm: Schema validations succeed (Zod parse no errors)
5. Break a schema (e.g., remove required field) → test fails

**Files Created**:
- `__tests__/contract/agent-suggest-gaps.test.ts` (CREATE)

**Dependencies**: T002-T007 (API endpoints implemented), T001 (schemas defined)

---

### T016 [P] [SLICE] Integration test validates full gap-filling flow E2E
**Status**: ✅ Done

**User Story**: As a developer, I can run an integration test that simulates the complete user journey (detect gaps → generate tasks → accept → verify insertion) to catch regressions.

**Implementation Scope**:
- **Tests** (`__tests__/integration/gap-filling-flow.test.ts` - NEW):
  - Setup: Create test agent session with gap (#1, #2, #5)
  - Step 1: POST `/api/agent/suggest-gaps` → assert gaps detected, suggestions returned
  - Step 2: Parse response, simulate user selection (check 2 of 3 suggestions)
  - Step 3: POST `/api/agent/accept-suggestions` with selected IDs
  - Step 4: Verify tasks inserted in database (query agent_sessions.result.prioritized_tasks)
  - Step 5: Verify dependencies updated correctly (#3→#2, #4→#3, #5→#4)
  - Step 6: Verify GapAnalysisSession logged (user_acceptances, performance_metrics)
  - Use Vitest with actual Supabase test database or mocked responses
- **Backend**: No changes
- **Data**: Test database or isolated test session
- **Feedback**:
  - SEE: Test logs show each step passing
  - DO: Run `pnpm test:integration`
  - VERIFY: E2E flow completes successfully

**Test Scenario**:
1. Run `pnpm test:run __tests__/integration/gap-filling-flow.test.ts`
2. Observe: Test creates session, detects gap, generates tasks, accepts 2, verifies insertion
3. Check assertions:
   - ✅ Gap detected between #2→#5
   - ✅ 2-3 suggestions generated
   - ✅ 2 tasks inserted as #3, #4
   - ✅ Dependencies correct
   - ✅ Metrics logged
4. Verify: Test passes (all assertions green)

**Files Created**:
- `__tests__/integration/gap-filling-flow.test.ts` (CREATE)

**Dependencies**: T001-T007 (all core slices working)

---

### T017 [P] [SLICE] Unit tests for gap detection heuristics
**Status**: ✅ Done

**User Story**: As a developer, I can run unit tests that validate each of the 4 gap detection indicators (time, action type, skill, dependency) work correctly with edge cases.

**Implementation Scope**:
- **Tests** (`lib/services/__tests__/gapDetection.test.ts` - CREATED in T003, expand now):
  - Test `detectGaps()` function with various task sequences:
    - **Time gap**: Tasks with 50 hour diff → gap detected
    - **Time gap edge**: 39 hour diff → no gap (threshold 40)
    - **Action type jump**: "Design" → "Launch" (skip 4 phases) → gap
    - **Action type edge**: "Design" → "Build" (1 phase) → no gap
    - **No dependency**: successor doesn't depend on predecessor → gap
    - **Dependency exists**: successor depends on predecessor → no gap for this indicator
    - **Skill jump**: "Design mockups" → "Build API" (design→backend) → gap
    - **3+ indicators required**: 2 indicators → no gap, 3 indicators → gap detected
    - **Confidence calculation**: 3 indicators → 0.5, 4 indicators → 1.0
  - Use describe/it blocks for each indicator
  - Mock task data with specific estimated_hours, text, depends_on values
- **Backend**: No changes (tests validate existing logic from T003)
- **Data**: Mock task arrays (no database)
- **Feedback**:
  - SEE: Test output shows each indicator test pass/fail
  - DO: Run `pnpm test lib/services/__tests__/gapDetection.test.ts`
  - VERIFY: All unit tests pass

**Test Scenario**:
1. Run `pnpm test:run lib/services/__tests__/gapDetection.test.ts`
2. Verify tests cover:
   - ✅ Time gap indicator (40 hour threshold)
   - ✅ Action type jump (2+ phase skip)
   - ✅ No dependency indicator
   - ✅ Skill jump indicator
   - ✅ 3+ indicators required for gap
   - ✅ Confidence score calculation
3. All assertions pass (green checkmarks)

**Files Modified/Created**:
- `lib/services/__tests__/gapDetection.test.ts` (EXPAND from T003 - add comprehensive unit tests)

**Dependencies**: T003 (gap detection logic implemented)

---

### T018 [P] [SLICE] Unit tests for task insertion and cycle detection (Kahn's algorithm)
**Status**: ✅ Done

**User Story**: As a developer, I can run unit tests that validate task insertion logic and circular dependency detection to prevent data corruption.

**Implementation Scope**:
- **Tests** (`lib/services/__tests__/taskInsertion.test.ts` - CREATED in T007, expand now):
  - Test `insertBridgingTasks()` function:
    - **Valid insertion**: Insert 2 tasks between #2→#5 → tasks #3, #4 created with correct dependencies
    - **Dependency chain**: Verify #3→#2, #4→#3, #5→#4 (successor updated)
    - **Circular dependency**: Create cycle scenario (e.g., #1→#3, #3→#1) → returns {success: false, error}
    - **Kahn's algorithm**: Validate topological sort detects cycles
    - **No cycle**: Linear chain → returns {success: true}
    - **Edge case**: Single task insertion → works correctly
    - **Edge case**: Insert at start (before #1) → new task becomes #0 or tasks renumbered
  - Mock task arrays and dependencies
  - Use Vitest assertions for success/failure states
- **Backend**: No changes (tests validate existing logic from T007)
- **Data**: Mock plan data (no database)
- **Feedback**:
  - SEE: Test output shows insertion scenarios pass/fail
  - DO: Run `pnpm test lib/services/__tests__/taskInsertion.test.ts`
  - VERIFY: All tests pass, cycle detection works

**Test Scenario**:
1. Run `pnpm test:run lib/services/__tests__/taskInsertion.test.ts`
2. Verify tests cover:
   - ✅ Valid 2-task insertion
   - ✅ Dependency chain correctness
   - ✅ Circular dependency rejected
   - ✅ Kahn's algorithm topological sort
   - ✅ Edge cases (single task, insert at start)
3. All assertions pass

**Files Modified/Created**:
- `lib/services/__tests__/taskInsertion.test.ts` (EXPAND from T007 - add comprehensive unit tests)

**Dependencies**: T007 (insertion logic implemented)

---

## Dependencies

```
T001 (Setup: Schemas)
  ↓
T002 (Button + API Stub) → T003 (Gap Detection) → T004 (AI Generation)
                                                       ↓
  T005 (Selection) ← T006 (Editing) ← T007 (Insertion)
                                       ↓
  T008 (No Gaps) [P]                T009 (AI Error) [P]
  T010 (Cycle Error) [P]
  T011 (Metrics) [P]                T012 (Tooltips) [P]
  T013 (Keyboard) [P]               T014 (Multi-Gap) [P]
  T015 (Contract Tests) [P]         T016 (Integration Test) [P]
  T017 (Gap Unit Tests) [P]         T018 (Insertion Unit Tests) [P]
```

**Parallel Execution**:
- After T007 completes, T008-T018 can all run in parallel [P] (independent slices)
- T002-T007 must run sequentially (each builds on previous)

---

## Validation Checklist
*MUST verify before implementing tasks*

- [x] Every [SLICE] task has a user story
- [x] Every [SLICE] task includes UI + Backend + Data + Feedback
- [x] Every [SLICE] task has a test scenario
- [x] No backend-only or frontend-only tasks exist (T001 is setup exception)
- [x] Setup tasks are minimal and justify their necessity (T001 only: schemas needed by all)
- [x] Tasks ordered by user value, not technical layers
- [x] Parallel tasks truly operate on independent features/files
- [x] Each task specifies exact file paths to modify

---

## Notes

- **[SLICE]** tasks are independently deployable and user-testable
- **[P]** tasks operate on different features/slices and can run in parallel
- Every slice MUST enable user to SEE, DO, and VERIFY something
- Avoid creating tasks without complete user journey
- Setup task (T001) minimal - only Zod schemas blocking all slices
- Each task demoable to non-technical person
- TDD approach: Tests in T015-T018 validate T002-T007 implementations
- Manual test scenarios reference quickstart.md for detailed steps

**Total Tasks**: 18 (1 setup + 17 vertical slices)
**Estimated Implementation Time**: 1-2 weeks with slice-orchestrator agent
