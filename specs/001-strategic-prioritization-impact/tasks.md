# Tasks: Strategic Prioritization (Impact-Effort Model)

**Feature Branch**: `001-strategic-prioritization-impact`
**Input**: Design documents from `/specs/001-strategic-prioritization-impact/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are organized as complete vertical slices, each delivering full user value (UI → Backend → Data → Feedback). Each slice can be independently implemented, tested, and demoed.

## Format: `[ID] [P?] [SLICE] Description`

- **[P]**: Can run in parallel (different files, no shared critical paths)
- **[SLICE]**: Complete vertical slice (SEE → DO → VERIFY)
- Include exact file paths in descriptions

---

## Phase 1: Foundation Setup

**Purpose**: Minimal infrastructure required for ALL user stories to function

**⚠️ CRITICAL**: These tasks MUST complete before any user story slices can begin

**SETUP Tasks Justification** (per SYSTEM_RULES.md):
These tasks are marked [SETUP] not [SLICE] because they deliver no standalone user value:
- T001: Database columns (no UI, no user interaction)
- T002: Library installation (infrastructure only)
- T003: Type schemas (backend foundation only)

**Why unavoidable**: All [SLICE] tasks (T004-T012) require these foundations to function. Alternative approaches (e.g., inline schemas, skip DB migration) would violate data integrity and type safety requirements. Minimized to absolute necessities—only 3 setup tasks blocking 12 user-testable slices.

- [ ] T001 [SETUP] Database migration for strategic scores storage
  - **What**: Copy migration from `specs/001-strategic-prioritization-impact/contracts/database-migration.sql` to `supabase/migrations/025_add_strategic_scores.sql`, then apply it to add `agent_sessions.strategic_scores` JSONB column and `task_embeddings.manual_overrides` JSONB column with GIN indexes
  - **Why**: All user stories require database columns to persist strategic scores and manual overrides
  - **Command**: `cp specs/001-strategic-prioritization-impact/contracts/database-migration.sql supabase/migrations/025_add_strategic_scores.sql && supabase db push`
  - **Test**: Run migration, verify columns exist: `SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_sessions' AND column_name = 'strategic_scores'`
  - **Blocking**: ALL user stories depend on this

- [ ] T002 [P] [SETUP] Install Recharts dependency
  - **What**: Add Recharts library (35KB gzipped) for quadrant visualization
  - **Why**: User Story 3 (quadrant viz) requires charting library
  - **Command**: `pnpm add recharts`
  - **Test**: Run `pnpm list recharts` and verify output shows `recharts@2.x.x`. Installation succeeds if version appears in dependency list with no errors.
  - **Blocking**: Only blocks User Story 3

- [ ] T003 [P] [SETUP] Create strategic score Zod schemas
  - **What**: Define TypeScript schemas for strategic scores, manual overrides, sorting strategies, and quadrants using Zod validation
  - **Why**: All user stories need type-safe validation for strategic score data
  - **Files**: `lib/schemas/strategicScore.ts`, `lib/schemas/manualOverride.ts`, `lib/schemas/sortingStrategy.ts`, `lib/schemas/quadrant.ts`
  - **Test**: Import schemas in tests, verify parsing succeeds for valid data and fails for invalid data
  - **Blocking**: All backend services and API endpoints depend on these schemas

**Checkpoint**: Foundation ready - user story slices can now begin

---

## User Story 1: View Strategic Task Rankings (P1 - MVP) 🎯

**Goal**: Users can see tasks prioritized by strategic value (Impact/Effort/Confidence/Priority) instead of just semantic similarity

**User Journey**: User navigates to /priorities → clicks "Prioritize Tasks" → sees each task display Impact/Effort/Confidence/Priority scores → tasks sorted by Priority (highest first)

**Independent Test**: Trigger prioritization, verify scores appear, verify high-impact/low-effort tasks rank higher than medium-impact/medium-effort tasks

### Implementation (Vertical Slice)

- [ ] T004 [SLICE] Strategic scoring service with Impact/Effort/Confidence calculation
  - **User Story**: "As a user, I can see strategic scores calculated for my tasks"
  - **UI Entry**: /priorities page displays scores after prioritization
  - **Backend Work**:
    - Create `lib/services/strategicScoring.ts` with functions:
      - `estimateImpact(task, outcome)`: LLM + keyword heuristics → Impact 0-10
      - `estimateEffort(task)`: Text extraction + complexity heuristic → hours
      - `calculateConfidence(task)`: 0.6×similarity + 0.3×deps + 0.1×history → 0-1
      - `calculatePriority(impact, effort, confidence)`: (Impact×10)/(Effort/8)×Confidence, capped at 100
      - `scoreAllTasks(tasks, outcome)`: Parallel batching (10 concurrent), bulk upsert to DB
    - Impact heuristics: +3 for "revenue/conversion/payment", +2 for "launch/test", -1 for "document/refactor"
    - Effort extraction regex: `\b(\d+(?:\.\d+)?)\s*(h|hour|hours|hr|hrs|day|days|d)\b` with normalization (1 day = 8h)
    - Effort heuristic when no hint: base 8h + modifiers (+4h for length >100 chars, +8h for "integrate/migrate/redesign", +4h for dependencies, +8h for "investigate/explore")
  - **Data Layer**: Store scores in `agent_sessions.strategic_scores` JSONB as `{ "task-id": { impact, effort, confidence, priority, reasoning, scored_at } }`
  - **Visible Outcome**: Scores appear in task rows after prioritization completes
  - **Test Scenario**:
    1. Write failing test: Expect `estimateImpact("Implement payment flow", "Increase revenue")` to return Impact ≥7
    2. Implement service
    3. Test passes: Impact estimation works correctly
  - **Files**: `lib/services/strategicScoring.ts`, `__tests__/unit/services/strategicScoring.test.ts`
  - **Dependencies**: Requires T003 (schemas)

- [ ] T005 [SLICE] Modify prioritization API to include strategic scoring
  - **User Story**: "As a user, when I trigger prioritization, strategic scores are calculated"
  - **UI Entry**: Click "Prioritize Tasks" button on /priorities page
  - **Backend Work**:
    - Modify `app/api/agent/prioritize/route.ts`:
      - After semantic similarity scoring, call `scoreAllTasks(tasks, outcome)`
      - Add `strategic_scores` field to response
      - Add Impact/Effort/Confidence/Priority to each task in `prioritized_tasks` array
      - Add `quadrant` field using `getQuadrant(impact, effort)` helper
    - Ensure <2s overhead by using parallel batching (10 tasks at a time)
  - **Data Layer**: Read/write `agent_sessions.strategic_scores` JSONB column
  - **Visible Outcome**: API response includes strategic scores for all tasks
  - **Test Scenario**:
    1. Write failing contract test: POST /api/agent/prioritize, expect response to include `strategic_scores` field
    2. Implement API modification
    3. Test passes: Response includes scores matching OpenAPI contract
  - **Files**: `app/api/agent/prioritize/route.ts`, `__tests__/contract/strategic-scoring-api.test.ts`
  - **Dependencies**: Requires T004 (scoring service)

- [ ] T006 [SLICE] Display strategic scores in task rows
  - **User Story**: "As a user, I can see Impact/Effort/Confidence/Priority for each task"
  - **UI Entry**: /priorities page task list
  - **Backend Work**: None (uses data from T005)
  - **Frontend Work**:
    - Modify `app/priorities/components/TaskRow.tsx`:
      - Add props: `impact: number`, `effort: number`, `confidence: number`, `priority: number`
      - Display scores in compact format: "Impact: 8.5 | Effort: 16h | Confidence: 0.78 | Priority: 66"
      - Add quadrant badge (emoji + color): 🌟 Green, 🚀 Blue, ⚡ Yellow, ⏸ Red
      - Use existing design system color layers and shadows
    - Modify `app/priorities/components/TaskList.tsx`:
      - Pass strategic scores from API response to TaskRow components
      - Sort tasks by Priority (highest first) in Balanced mode
  - **Data Layer**: Read from API response
  - **Visible Outcome**: Each task shows 4 scores and color-coded quadrant badge
  - **Test Scenario**:
    1. Write failing integration test: Trigger prioritization, expect task with Impact=8.5 Effort=16h to display "Impact: 8.5"
    2. Implement UI changes
    3. Test passes: Scores visible in task rows
  - **Files**: `app/priorities/components/TaskRow.tsx`, `app/priorities/components/TaskList.tsx`, `__tests__/integration/strategic-prioritization.test.tsx`
  - **Dependencies**: Requires T005 (API response with scores)

**Checkpoint**: User Story 1 complete - users can see strategic scores and tasks sorted by priority

---

## User Story 2: Switch Between Sorting Strategies (P1) 🎯

**Goal**: Users can filter and sort tasks by different strategic lenses (Quick Wins, Strategic Bets, Balanced, Urgent)

**User Journey**: User sees "Sort Strategy" dropdown → selects "Quick Wins" → only sees tasks ≤8h effort, sorted by Impact×Confidence → switches to "Strategic Bets" → sees only high-impact/long-term tasks

**Independent Test**: Select each strategy, verify filtering and sorting logic matches spec

### Implementation (Vertical Slice)

- [ ] T007 [SLICE] Sorting strategy selector with filtering logic
  - **User Story**: "As a user, I can switch between sorting strategies to view tasks through different lenses"
  - **UI Entry**: Dropdown at top of /priorities page
  - **Frontend Work**:
    - Create `app/priorities/components/SortingStrategySelector.tsx`:
      - Dropdown with 4 options: Balanced, Quick Wins, Strategic Bets, Urgent
      - Each option shows label + description
      - On change, update filter/sort state
    - Modify `app/priorities/components/TaskList.tsx`:
      - Add `sortingStrategy` state (default: "balanced")
      - Implement filtering logic:
        - Balanced: Show all tasks, sort by priority DESC
        - Quick Wins: Filter effort ≤8h, sort by (impact × confidence) DESC
        - Strategic Bets: Filter impact ≥7 AND effort >40h, sort by impact DESC
        - Urgent: Show all, sort by (priority × urgentMultiplier) DESC where urgentMultiplier = 2 if task contains keywords "urgent|critical|blocking", else 1
      - Re-render task list when strategy changes
  - **Backend Work**: None (filtering/sorting happens client-side)
  - **Data Layer**: Client-side state only
  - **Visible Outcome**: Task list updates instantly when user selects different strategy
  - **Test Scenario**:
    1. Write failing integration test: Select "Quick Wins", expect only tasks with effort ≤8h visible
    2. Implement filtering logic
    3. Test passes: Each strategy filters/sorts correctly
  - **Files**: `app/priorities/components/SortingStrategySelector.tsx`, `app/priorities/components/TaskList.tsx`, `__tests__/integration/sorting-strategies.test.tsx`
  - **Dependencies**: Requires T006 (tasks with strategic scores displayed)

**Checkpoint**: User Story 2 complete - users can view tasks through 4 different strategic lenses

---

## User Story 3: Visualize Impact/Effort Trade-offs (P2)

**Goal**: Users can view tasks in a 2×2 Impact/Effort quadrant visualization to quickly identify quick wins vs. strategic bets

**User Journey**: User scrolls to "Impact/Effort Quadrant" section → sees tasks as bubbles on X-Y plot → clicks bubble → page scrolls to that task

**Independent Test**: Verify quadrant renders, tasks positioned correctly, click navigation works

### Implementation (Vertical Slice)

- [ ] T008 [SLICE] Quadrant visualization component with task clustering
  - **User Story**: "As a user, I can see tasks visualized in a 2×2 Impact/Effort quadrant"
  - **UI Entry**: New section on /priorities page below task list
  - **Frontend Work**:
    - Create `app/priorities/components/QuadrantViz.tsx`:
      - Use Recharts `<ScatterChart>` component
      - X-axis: Effort (log scale, domain [1, 160], label "Effort (hours, log scale)")
      - Y-axis: Impact (linear scale, domain [0, 10], label "Impact (0-10)")
      - Z-axis (bubble size): Confidence (range [50, 400] for min/max radius)
      - Add reference lines at x=8 (low/high effort threshold) and y=5 (low/high impact threshold)
      - Color bubbles by quadrant: Green (#10b981), Blue (#3b82f6), Yellow (#eab308), Red (#ef4444)
      - Implement clustering: tasks with Impact within ±0.5 AND Effort within ±20% (log scale) merge into single bubble with count badge
      - On bubble click: emit `onTaskClick(taskId)`, parent scrolls to task and highlights it
    - Modify `app/priorities/page.tsx`:
      - Add `<QuadrantViz tasks={tasksWithScores} onTaskClick={scrollToTask} />` below task list
      - Implement `scrollToTask(id)`: find task element, call `scrollIntoView({ behavior: 'smooth' })`, add highlight animation
    - Add quadrant labels as `<ReferenceArea>` with fill opacity 0.1 and text labels
  - **Backend Work**: None (uses data from existing API)
  - **Data Layer**: Props passed from parent page
  - **Visible Outcome**: Interactive quadrant chart shows task distribution, clicking scrolls to task
  - **Test Scenario**:
    1. Write failing component test: Render QuadrantViz with 2 tasks (Impact=8 Effort=4, Impact=2 Effort=40), expect 2 bubbles in correct quadrants
    2. Implement component
    3. Test passes: Bubbles render in Green and Red quadrants respectively
  - **Files**: `app/priorities/components/QuadrantViz.tsx`, `app/priorities/page.tsx`, `__tests__/unit/components/QuadrantViz.test.tsx`
  - **Dependencies**: Requires T002 (Recharts installed), T006 (tasks with scores)

**Checkpoint**: User Story 3 complete - users can visually identify task trade-offs in quadrant chart

---

## User Story 4: Understand Score Reasoning (P2)

**Goal**: Users can view detailed breakdown of how priority scores were calculated

**User Journey**: User clicks "Why this score?" link → modal opens showing Impact reasoning, Effort source, Confidence breakdown, Priority formula → user understands scoring logic

**Independent Test**: Click link, verify modal shows all score components with explanations

### Implementation (Vertical Slice)

- [ ] T009 [SLICE] Score breakdown modal with reasoning display
  - **User Story**: "As a user, I can understand how each task's priority was calculated"
  - **UI Entry**: "Why this score?" link on each task row
  - **Frontend Work**:
    - Create `app/priorities/components/ScoreBreakdownModal.tsx`:
      - Modal (shadcn Dialog) with 4 sections:
        1. **Impact**: Show score (e.g., 8.5), keywords found (["payment", "revenue"]), LLM reasoning from `reasoning.impact_keywords`
        2. **Effort**: Show hours (e.g., 16h), source (extracted vs. heuristic), hint if extracted ("16h" from task text), complexity modifiers if heuristic (["integrate", "dependency"])
        3. **Confidence**: Show score (0.78), formula breakdown: "0.6 × 0.85 (similarity) + 0.3 × 0.8 (deps) + 0.1 × 0.5 (history) = 0.78"
        4. **Priority**: Show formula with values: "(8.5 × 10) / (16 / 8) × 0.78 = 66.3"
      - Props: `task: TaskWithScores`, `open: boolean`, `onOpenChange: (open: boolean) => void`
    - Modify `app/priorities/components/TaskRow.tsx`:
      - Add "Why this score?" link/button (info icon)
      - On click, open ScoreBreakdownModal with current task data
  - **Backend Work**: None (reasoning data included in API response from T005)
  - **Data Layer**: Read from `reasoning` object in strategic scores
  - **Visible Outcome**: Clicking link opens modal with detailed score explanation
  - **Test Scenario**:
    1. Write failing component test: Render modal with task data, expect to see Impact score and keywords
    2. Implement modal
    3. Test passes: All 4 sections display correctly
  - **Files**: `app/priorities/components/ScoreBreakdownModal.tsx`, `app/priorities/components/TaskRow.tsx`, `__tests__/unit/components/ScoreBreakdownModal.test.tsx`
  - **Dependencies**: Requires T006 (task rows with reasoning data)

**Checkpoint**: User Story 4 complete - users can understand and trust AI scoring logic

---

## User Story 5: Manually Override Scores (P3)

**Goal**: Users can manually adjust Impact and Effort estimates when AI is wrong, with instant priority recalculation

**User Journey**: User hovers over task → clicks "Edit scores" → adjusts Impact slider from 5 to 8 → adjusts Effort from 16h to 8h → adds reason "Critical payment flow" → clicks Save → priority recalculates from 15 to 48 → "Manual override" badge appears → override persists across page reload → agent re-runs prioritization → override cleared

**Independent Test**: Adjust scores, verify priority updates, verify persistence, verify cleared on re-run

### Implementation (Vertical Slice)

- [ ] T010 [SLICE] Manual override API endpoint
  - **User Story**: "As a user, when I manually override scores, they are saved and used for priority calculation"
  - **UI Entry**: "Edit scores" button on task row (implemented in T011)
  - **Backend Work**:
    - Create `app/api/tasks/[id]/override/route.ts`:
      - PATCH handler accepting: `{ impact?: number, effort?: number, reason?: string }`
      - Validate with ManualOverrideInputSchema (impact 0-10, effort 0.5-160, reason max 500 chars)
      - Update `task_embeddings.manual_overrides` JSONB: `{ impact, effort, reason, timestamp, session_id }`
      - Recalculate priority using override values: `calculatePriority(override.impact ?? ai.impact, override.effort ?? ai.effort, ai.confidence)`
      - Return: `{ task_id, override, updated_priority }`
    - On agent re-run (POST /api/agent/prioritize), clear all overrides:
      - `UPDATE task_embeddings SET manual_overrides = NULL WHERE manual_overrides IS NOT NULL`
  - **Data Layer**: Write to `task_embeddings.manual_overrides` JSONB column
  - **Visible Outcome**: API returns updated priority after override saved
  - **Test Scenario**:
    1. Write failing contract test: PATCH /api/tasks/{id}/override with impact=8 effort=8, expect 200 with updated_priority
    2. Implement endpoint
    3. Test passes: Override saved, priority recalculated correctly
  - **Files**: `app/api/tasks/[id]/override/route.ts`, `__tests__/contract/manual-override-api.test.ts`
  - **Dependencies**: Requires T003 (schemas), T004 (priority calculator)

- [ ] T011 [SLICE] Manual override controls with optimistic UI
  - **User Story**: "As a user, I can adjust Impact/Effort sliders and see priority update instantly"
  - **UI Entry**: "Edit scores" button on task row
  - **Frontend Work**:
    - Create `app/priorities/components/ManualOverrideControls.tsx`:
      - Impact slider (0-10, step 0.5, shadcn Slider component)
      - Effort input (number, min 0.5, max 160, step 0.5)
      - Reason textarea (optional, max 500 chars)
      - Save button
      - On Impact change: update local state, debounce 500ms, then call API
      - On Effort change: same debounce pattern
      - On Save: call PATCH /api/tasks/{id}/override, show checkmark animation on success
      - Optimistic update: recalculate priority locally, show immediately, rollback on API error
    - Modify `app/priorities/components/TaskRow.tsx`:
      - Add "Edit scores" button (pencil icon)
      - Show "Manual override" badge if `task.has_manual_override === true`
      - On click, open ManualOverrideControls modal/popover
    - Modify `app/priorities/components/TaskList.tsx`:
      - When fetching tasks, check if `manual_overrides` JSONB exists
      - If exists, use override values for Impact/Effort, set `has_manual_override: true`
  - **Backend Work**: None (uses API from T010)
  - **Data Layer**: Read manual_overrides from task data, write via API
  - **Visible Outcome**:
    - Slider adjustments update priority instantly (optimistic)
    - Checkmark appears when save succeeds
    - Badge shows "Manual override" on tasks with overrides
    - Override persists across page reload
    - Override cleared when prioritization re-runs
  - **Test Scenario**:
    1. Write failing integration test: Click "Edit scores", adjust Impact to 9, expect priority to update instantly
    2. Implement controls
    3. Test passes: Priority updates optimistically, API saves correctly
    4. Manual test: Reload page, verify override persists
    5. Manual test: Re-run prioritization, verify override cleared
  - **Files**: `app/priorities/components/ManualOverrideControls.tsx`, `app/priorities/components/TaskRow.tsx`, `app/priorities/components/TaskList.tsx`, `__tests__/integration/manual-override-flow.test.tsx`
  - **Dependencies**: Requires T010 (override API)

**Checkpoint**: User Story 5 complete - users can manually adjust AI estimates with instant feedback

---

## User Story 6: Async Retry for Failed LLM Calls (Quality Enhancement)

**Goal**: When Impact estimation fails during initial scoring, tasks queue for async retry without blocking user

**User Journey**: User triggers prioritization → LLM times out for 3 tasks → those tasks show "Scoring..." status → page polls every 2s → retry succeeds → scores appear reactively → user reloads page → polling resumes → scores still update

**Independent Test**: Simulate LLM failure, verify retry queue, verify reactive updates, verify page reload behavior

### Implementation (Vertical Slice)

- [ ] T012 [SLICE] Async retry queue with reactive UI updates
  - **User Story**: "As a user, when LLM scoring fails, I see 'Scoring...' status and scores appear when retry succeeds"
  - **UI Entry**: Task rows show "Scoring..." badge for failed tasks
  - **Backend Work**:
    - Create `lib/services/retryQueue.ts`:
      - In-memory queue: `Map<taskId, RetryJob>`
      - `enqueue(taskId, estimateFn)`: Add job with attempts=0, maxAttempts=3
      - `processQueue()`: For each job, wait exponential backoff (1s, 2s, 4s), retry estimateFn
      - On success: update `agent_sessions.strategic_scores` JSONB, remove from queue
      - On max retries: log to `processing_logs` with status='retry_exhausted', remove from queue
    - Modify `lib/services/strategicScoring.ts`:
      - In `scoreAllTasks()`, wrap each `estimateImpact()` in try/catch
      - On failure: call `retryQueue.enqueue(taskId, () => estimateImpact(task, outcome))`
      - Return partial results (successful tasks only)
    - Create `app/api/tasks/metadata/route.ts`:
      - GET handler with query params: `session_id?: string`, `status?: 'all' | 'retry' | 'failed'`
      - Return: `{ scores: Record<taskId, StrategicScore>, retry_status: Record<taskId, RetryStatus> }`
      - For retry status, check in-memory queue and processing_logs table
  - **Frontend Work**:
    - Modify `app/priorities/page.tsx`:
      - On mount, start polling interval (2s) calling GET /api/tasks/metadata?session_id={currentSession}
      - On response, update task scores reactively (merge new scores into state)
      - For tasks with retry_status='in_progress', show "Scoring..." badge
      - For tasks with retry_status='failed', show "Scores unavailable" badge, exclude from sort/filter
      - On unmount, clear interval
    - Modify `app/priorities/components/TaskRow.tsx`:
      - Show "Scoring..." badge (yellow) if task in retry queue
      - Show "Scores unavailable" badge (red) if retry exhausted
  - **Data Layer**:
    - Write: `agent_sessions.strategic_scores` JSONB when retry succeeds
    - Write: `processing_logs` when retry exhausted
    - Read: GET /api/tasks/metadata for polling
  - **Visible Outcome**:
    - Tasks with failed LLM calls show "Scoring..." immediately
    - Scores appear reactively as retries complete (no page reload)
    - Page reload doesn't break retry process (polling resumes)
    - Failed tasks after max retries show "Scores unavailable"
  - **Test Scenario**:
    1. Write failing integration test: Mock LLM failure for 1 task, expect "Scoring..." status
    2. Implement retry queue
    3. Test passes: Retry queue processes, scores update reactively
    4. Manual test: Reload page during retry, verify polling resumes
  - **Files**: `lib/services/retryQueue.ts`, `lib/services/strategicScoring.ts`, `app/api/tasks/metadata/route.ts`, `app/priorities/page.tsx`, `app/priorities/components/TaskRow.tsx`, `__tests__/integration/async-retry-flow.test.tsx`
  - **Dependencies**: Requires T004 (scoring service), T006 (task rows)

**Checkpoint**: Async retry complete - LLM failures don't block user, scores appear reactively

---

## Phase 2: Polish & Cross-Cutting Concerns

**Purpose**: Enhancements that improve multiple user stories or overall quality

- [ ] T013 [P] [POLISH] Add accessibility features to quadrant visualization
  - **What**: Add ARIA labels, keyboard navigation (Tab to focus bubbles, Enter to click), high-contrast mode support
  - **Why**: Ensure quadrant viz meets WCAG AA standards
  - **Files**: `app/priorities/components/QuadrantViz.tsx`
  - **Test**: Run accessibility audit (axe-core), verify keyboard navigation works
  - **Dependencies**: Requires T008 (quadrant viz)

- [ ] T014 [P] [POLISH] Performance optimization for large task lists
  - **What**: Add virtual scrolling to task list if >500 tasks, memoize expensive calculations (priority formula)
  - **Why**: Ensure UI remains responsive with 1000+ tasks
  - **Files**: `app/priorities/components/TaskList.tsx`
  - **Test**: Render 1000 tasks, verify <100ms render time
  - **Dependencies**: Requires T006 (task list)

- [ ] T015 [P] [POLISH] Add loading states and error boundaries
  - **What**: Show skeleton loaders during prioritization, add error boundaries for component failures, toast notifications for API errors
  - **Why**: Improve perceived performance and error handling UX
  - **Files**: `app/priorities/page.tsx`, `app/priorities/components/TaskList.tsx`
  - **Test**: Trigger prioritization, verify skeleton appears, simulate API error, verify error toast
  - **Dependencies**: Requires T006 (UI components)

- [ ] T016 [POLISH] Quickstart validation and documentation updates
  - **What**: Run through quickstart.md step-by-step, verify all commands work, update CLAUDE.md and IMPLEMENTATION_STATUS.md
  - **Why**: Ensure onboarding works for new developers
  - **Files**: `specs/001-strategic-prioritization-impact/quickstart.md`, `CLAUDE.md`, `IMPLEMENTATION_STATUS.md`
  - **Test**: Fresh checkout, follow quickstart, verify all 5 user stories work
  - **Dependencies**: Requires all user stories complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundation)**: No dependencies - start immediately
  - T001, T002, T003 can run in parallel AFTER their individual prerequisites
  - All user story slices BLOCKED until T001 and T003 complete
- **User Stories**: All depend on Foundation (T001, T003)
  - User Story 1 (T004-T006): Can start after Foundation
  - User Story 2 (T007): Depends on User Story 1 complete
  - User Story 3 (T008): Depends on User Story 1 complete + T002
  - User Story 4 (T009): Depends on User Story 1 complete
  - User Story 5 (T010-T011): Depends on User Story 1 complete
  - User Story 6 (T012): Depends on User Story 1 complete
- **Phase 2 (Polish)**: Depends on all user stories complete

### Critical Path (Sequential)

```
T001 (DB migration) → T003 (schemas) → T004 (scoring service) → T005 (API) → T006 (UI) → T007 (sorting) → [T008, T009, T010, T012 in parallel] → T011 → Polish
```

### Parallel Opportunities

- **Within Foundation**: T002 can run parallel with T001
- **After User Story 1**: T008, T009, T010, T012 can run in parallel (different components)
- **Within Polish**: T013, T014, T015 can run in parallel

---

## Implementation Strategy

### MVP First (User Stories 1-2 Only)

1. Complete Phase 1: Foundation (T001-T003)
2. Complete User Story 1: Strategic Rankings (T004-T006)
3. Complete User Story 2: Sorting Strategies (T007)
4. **STOP and VALIDATE**: Test end-to-end user journey
5. Deploy/demo if ready

This delivers core value: users see strategic scores and can filter by different strategies.

### Full Feature (All User Stories)

1. Foundation → User Story 1 → User Story 2 (MVP deployed)
2. Add User Story 3 (Quadrant viz) → Test independently
3. Add User Story 4 (Score reasoning) → Test independently
4. Add User Story 5 (Manual overrides) → Test independently
5. Add User Story 6 (Async retry) → Test independently
6. Polish phase → Final validation
7. Full feature complete

### Parallel Team Strategy

With 2 developers:

1. Both complete Foundation together (T001-T003)
2. Developer A: User Story 1 (T004-T006) BLOCKS everything else
3. Once US1 done:
   - Developer A: User Story 2 (T007) + User Story 3 (T008)
   - Developer B: User Story 4 (T009) + User Story 5 (T010-T011)
4. Both: User Story 6 (T012) together (complex, benefits from pair programming)
5. Both: Polish phase in parallel

---

## Notes

- All tasks follow SLICE-FIRST pattern (complete user value, SEE → DO → VERIFY)
- TDD mandatory: write failing test BEFORE implementation for each task
- Each user story can be independently tested and demoed
- Commit after each task completion
- Stop at any checkpoint to validate user story independently
- Performance target: <2s overhead for strategic scoring (T004-T005)
- Accessibility target: WCAG AA compliance (T013)
- Test coverage target: 90% for scoring logic, 100% for API contracts, all user stories integration tested
