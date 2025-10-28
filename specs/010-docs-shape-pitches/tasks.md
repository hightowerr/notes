# Tasks: Context-Aware Dynamic Re-Prioritization

**Input**: Design documents from `/specs/010-docs-shape-pitches/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Execution Flow (Slice-Based)
```
1. Load plan.md from feature directory ✓
   → Tech stack: Next.js 15, React 19, Vercel AI SDK, Supabase, Mastra
   → User stories: Context visibility, instant adjustment, visual feedback

2. Load spec.md for user journeys ✓
   → Primary actions: Add context, toggle reflections, see priority changes
   → Expected outcomes: <500ms adjustment, visual movement badges, transparency

3. Load design documents ✓
   → contracts/: POST /adjust-priorities, POST /reflections/toggle, GET /reflections
   → data-model.md: reflection.is_active_for_prioritization, agent_sessions.baseline_plan/adjusted_plan
   → research.md: Reuse calculateCosineSimilarity, custom debounce hook, optimistic UI

4. Generate VERTICAL SLICE tasks ✓
   → Each acceptance scenario = ONE complete slice
   → All slices include: UI + API + Data + Feedback
   → Validated: Can user SEE, DO, and VERIFY each?

5. Apply slice ordering ✓
   → P0: Context visibility (FR-001, FR-002) → foundational
   → P1: Toggle functionality (FR-006, FR-007) → builds on P0
   → P2: Instant adjustment (FR-005) → builds on P1
   → P3: Visual feedback (FR-013, FR-014) → enhances P2

6. Mark parallel execution ✓
   → Database migration + contract tests = independent, run [P]
   → UI components after data layer ready
   → Integration tests after slices complete
```

## Format: `[ID] [TYPE] [P?] User Story & Implementation Scope`
- **[SLICE]**: Complete vertical slice (UI → Backend → Data → Feedback)
- **[SETUP]**: Foundational work blocking ALL slices (avoid if possible)
- **[POLISH]**: Enhancement to existing working slice
- **[P]**: Can run in parallel with other [P] tasks

---

## Phase 1: Database & Contract Foundation

### T001 [X] [P] [SETUP] Add database schema for reflection toggle and baseline plans
**Why Needed**: All slices require reflection toggle state and baseline/adjusted plan storage

**Implementation Scope**:
- **Migration**: `supabase/migrations/015_add_reflection_toggle.sql`
  - `ALTER TABLE reflections ADD COLUMN is_active_for_prioritization BOOLEAN DEFAULT true`
  - `CREATE INDEX idx_reflections_active ON reflections(user_id, is_active_for_prioritization, created_at DESC)`
  - `ALTER TABLE agent_sessions ADD COLUMN baseline_plan JSONB, ADD COLUMN adjusted_plan JSONB`
  - `CREATE INDEX idx_agent_sessions_baseline ON agent_sessions((baseline_plan->>'created_at'))`
- **Schema Updates**:
  - `lib/schemas/reflectionSchema.ts`: Add `is_active_for_prioritization: z.boolean().default(true)`, `recency_weight: z.number().min(0).max(1).optional()`
  - `lib/schemas/agentSessionSchema.ts`: Add `baseline_plan: prioritizedPlanSchema.nullable()`, `adjusted_plan: adjustedPlanSchema.nullable()`
- **New Types**: `lib/types/adjustment.ts`
  - `adjustmentDiffSchema`, `adjustmentMetadataSchema`, `adjustedPlanSchema`

**Validation**:
- [ ] Migration applies successfully in Supabase Dashboard
- [ ] Schema validation passes (run `npx vitest run __tests__/schemas/reflectionSchema.test.ts`)
- [ ] Indexes exist: `\d reflections`, `\d agent_sessions`

**Files Modified**:
- `supabase/migrations/015_add_reflection_toggle.sql` (create)
- `lib/schemas/reflectionSchema.ts` (extend)
- `lib/schemas/agentSessionSchema.ts` (extend)
- `lib/types/adjustment.ts` (create)

---

### T002 [X] [P] [SETUP] Create contract tests for new API endpoints
**Why Needed**: TDD requirement - contracts must fail before implementation

**Implementation Scope**:
- **Contract Tests** (all should FAIL initially):
  - `__tests__/contract/adjust-priorities.test.ts`
    * Test POST /api/agent/adjust-priorities schema validation
    * Verify 200 response structure matches `contracts/POST_adjust_priorities.json`
    * Verify 400 errors for missing baseline plan
  - `__tests__/contract/reflections-toggle.test.ts`
    * Test POST /api/reflections/toggle schema validation
    * Verify toggle state persistence
    * Verify 404 for non-existent reflection
  - `__tests__/contract/reflections-recent.test.ts`
    * Test GET /api/reflections?limit=5&within_days=30
    * Verify recency_weight field presence (1.0, 0.5, 0.25)
    * Verify is_active_for_prioritization field

**Validation**:
- [ ] Run `npx vitest run __tests__/contract/` → ALL tests FAIL (expected)
- [ ] Each test clearly specifies expected request/response schemas
- [ ] Error messages indicate missing endpoints/fields

**Files Modified**:
- `__tests__/contract/adjust-priorities.test.ts` (create)
- `__tests__/contract/reflections-toggle.test.ts` (create)
- `__tests__/contract/reflections-recent.test.ts` (create)

---

## Phase 2: P0 User Journeys (Core Slices)

### T003 [X] [SLICE] User sees context card empty state and can add context
**User Story**: As a user with no reflections, I see an inviting empty state prompting me to add current context before analyzing tasks

**Implementation Scope**:
- **UI**: `app/priorities/components/ContextCard.tsx` (create)
  - Empty state: "No context added yet" heading
  - MessageSquare icon + "Add Current Context" button
  - Guidance text: "Add quick notes about your current stage, constraints, or blockers to get relevant priorities"
  - Position: Above "Analyze Tasks" button on priorities page
- **Backend**: Extend GET `/api/reflections` endpoint (`app/api/reflections/route.ts`)
  - Add recency weight calculation (step function from research.md)
  - Add is_active_for_prioritization filter support
  - Return empty array if no reflections
- **Integration**: `app/priorities/page.tsx`
  - Import and render `<ContextCard />` component above existing "Analyze Tasks" button
  - Pass reflections data from GET /api/reflections
- **Feedback**: Empty state displays, button opens existing ReflectionPanel (Cmd+Shift+R modal)

**Test Scenario**:
1. Clear all reflections from database (or use fresh user)
2. Navigate to `/priorities`
3. **Verify**: ContextCard appears above "Analyze Tasks" button
4. **Verify**: See "No context added yet" message with guidance text
5. **Verify**: "Add Current Context" button is visible
6. Click button → ReflectionPanel modal opens
7. Add reflection: "Still in design phase, no app yet"
8. Submit → Modal closes, context card refreshes
9. **Verify**: Reflection appears in context card

**Files Modified**:
- `app/priorities/components/ContextCard.tsx` (create)
- `app/api/reflections/route.ts` (extend with recency weight calculation)
- `app/priorities/page.tsx` (integrate ContextCard component)
- `components/ui/card.tsx` (use existing shadcn component)

**Acceptance Criteria** (FR-001, FR-002, FR-004):
- [ ] Context card visible on priorities page before "Analyze Tasks"
- [ ] Empty state shows when user has no reflections
- [ ] "Add Current Context" button opens reflection modal
- [ ] New reflections appear in context card after submission

---

### T004 [X] [SLICE] User sees 5 recent reflections with toggle switches
**User Story**: As a user with existing reflections, I see up to 5 recent reflections in the context card with toggle switches to activate/deactivate them

**Implementation Scope**:
- **UI**: Extend `app/priorities/components/ContextCard.tsx`
  - Display 5 most recent reflections (sorted by created_at DESC)
  - Show reflection text, relative time ("2 days ago"), recency weight badge
  - Add toggle switch (shadcn Switch component) for each reflection
  - Default toggle state: ON if `is_active_for_prioritization === true`
  - Visual distinction: Active (checked) vs. inactive (unchecked)
- **State Management**: Local React state for toggle switches
  - Initialize from `reflection.is_active_for_prioritization`
  - Optimistic update on toggle (instant UI change)
- **Backend**: No new endpoints (uses GET /api/reflections from T003)
- **Feedback**: Reflections display in card, toggles respond instantly (optimistic UI)

**Test Scenario**:
1. Create 5+ reflections via ReflectionPanel
2. Navigate to `/priorities`
3. **Verify**: ContextCard shows exactly 5 most recent reflections
4. **Verify**: Each reflection has toggle switch
5. **Verify**: Toggle switches default to ON (checked)
6. **Verify**: Reflection text, relative time, and recency weight badge display
7. Click toggle switch → **Verify**: Switch changes instantly (optimistic)

**Files Modified**:
- `app/priorities/components/ContextCard.tsx` (extend from T003)
- `components/ui/switch.tsx` (use existing shadcn component)
- `lib/hooks/useDebounce.ts` (create custom debounce hook from research.md)

**Acceptance Criteria** (FR-003):
- [ ] Context card shows up to 5 recent reflections
- [ ] Toggle switches visible on each reflection
- [ ] Active (ON) reflections clearly distinguished from inactive (OFF)
- [ ] Recency weight badges display (1.0, 0.5, 0.25)

---

### T005 [X] [SLICE] User toggles reflection and state persists
**User Story**: As a user, I can toggle a reflection on/off and the state persists across page refreshes

**Implementation Scope**:
- **UI**: Extend toggle handler in `ContextCard.tsx`
  - Optimistic UI update (toggle switches immediately)
  - Show subtle loading indicator during API call (optional, <100ms)
  - Rollback on failure (revert toggle to previous state)
  - Display error toast on failure: "Failed to update reflection"
- **Backend**: POST `/api/reflections/toggle` endpoint (create)
  - `app/api/reflections/toggle/route.ts`
  - Request: `{ reflection_id: string, is_active: boolean }`
  - Database: `UPDATE reflections SET is_active_for_prioritization = $1 WHERE id = $2 AND user_id = $3`
  - Response: `{ success: true, reflection: {...} }`
  - Error: 404 if reflection not found, 500 on database error
- **Data**: Reflection row updated (NEVER deleted - append-only)
- **Feedback**: Toggle state persists, success state (silent), error toast on failure

**Test Scenario**:
1. Navigate to `/priorities` with 5 reflections
2. Click toggle on "Burnt out after launch" reflection (turn OFF)
3. **Verify**: Toggle switches immediately (optimistic)
4. Wait for API response (<100ms)
5. **Verify**: No error toast appears
6. Refresh page (F5)
7. **Verify**: "Burnt out" reflection still toggled OFF
8. Check database: `SELECT is_active_for_prioritization FROM reflections WHERE id = '...'`
9. **Verify**: Value is `false`

**Test Scenario (Failure Case)**:
1. Simulate network failure (DevTools → Offline mode)
2. Toggle a reflection
3. **Verify**: Toggle switches immediately (optimistic)
4. **Verify**: After failure, toggle reverts to previous state (rollback)
5. **Verify**: Error toast appears: "Failed to update reflection"

**Files Modified**:
- `app/priorities/components/ContextCard.tsx` (add toggle handler with rollback)
- `app/api/reflections/toggle/route.ts` (create)
- Use `components/ui/sonner.tsx` (existing toast component)

**Acceptance Criteria** (FR-006, FR-007, FR-018, FR-022):
- [ ] Toggle updates immediately (optimistic UI)
- [ ] State persists across page refreshes
- [ ] Failed toggles rollback to previous state
- [ ] Error message displays on failure
- [ ] Database rows updated, never deleted

---

### T006 [X] [SLICE] User analyzes tasks with active reflections and sees baseline plan stored
**User Story**: As a user, I can click "Analyze Tasks" with active reflections and the system stores both the baseline plan and uses my context

**Implementation Scope**:
- **UI**: No changes to existing "Analyze Tasks" button UI
  - Existing button in `app/priorities/page.tsx`
- **Backend**: Update POST `/api/agent/prioritize` endpoint
  - `app/api/agent/prioritize/route.ts` (extend existing)
  - After agent run completes, store prioritized_plan as BOTH:
    * `agent_sessions.prioritized_plan` (existing, final output)
    * `agent_sessions.baseline_plan` (NEW, copy for comparison)
  - Add created_at timestamp to baseline_plan JSON: `{ ...plan, created_at: new Date().toISOString() }`
  - Pass active reflections (where `is_active_for_prioritization = true`) to agent orchestration
- **Agent**: Extend `lib/mastra/services/agentOrchestration.ts`
  - Accept `activeReflections` parameter
  - Include reflection texts in agent context/prompt
  - No ranking changes yet (agent processes reflections naturally)
- **Data**: agent_sessions table updated with baseline_plan
- **Feedback**: Priorities display as before, baseline_plan silently stored for later adjustment

**Test Scenario**:
1. Add 2 reflections: "Design phase", "Client demo tomorrow"
2. Toggle "Design phase" ON, "Client demo" OFF
3. Click "Analyze Tasks"
4. Wait for agent to complete (~30s)
5. **Verify**: Priorities display in UI
6. Check database: `SELECT baseline_plan, prioritized_plan FROM agent_sessions ORDER BY created_at DESC LIMIT 1`
7. **Verify**: Both columns populated with identical data
8. **Verify**: baseline_plan.created_at is present (ISO timestamp)
9. **Verify**: Only "Design phase" reflection was passed to agent (client demo inactive)

**Files Modified**:
- `app/api/agent/prioritize/route.ts` (extend to store baseline_plan)
- `lib/mastra/services/agentOrchestration.ts` (accept active reflections)

**Acceptance Criteria** (FR-009, FR-012, FR-019):
- [ ] Baseline plan stored after full agent run
- [ ] Baseline plan matches prioritized_plan initially
- [ ] Baseline plan includes created_at timestamp
- [ ] Only active reflections passed to agent

---

## Phase 3: Instant Adjustment Slices

### T007 [SLICE] User toggles reflection and priorities adjust instantly (<500ms)
**User Story**: As a user with a baseline plan, I can toggle a reflection and see priorities adjust within 500ms without a full 30-second agent re-run

**Implementation Scope**:
- **UI**: Extend `ContextCard.tsx` toggle handler
  - After toggle API succeeds, call POST /api/agent/adjust-priorities
  - Show "Adjusting priorities..." loading indicator if >100ms
  - Debounce rapid toggles (1000ms delay using `useDebounce` hook from T004)
  - Update task list UI when adjusted_plan returns
- **Backend**: POST `/api/agent/adjust-priorities` endpoint (create)
  - `app/api/agent/adjust-priorities/route.ts`
  - Request: `{ session_id: string, active_reflection_ids: string[] }`
  - Fetch baseline_plan from agent_sessions
  - Validate baseline_plan exists (400 error if null: "Run analysis first")
  - Validate baseline_plan age:
    * >7 days: 400 error "Baseline plan too old (>7 days). Run full analysis."
    * >24 hours: Include warning in response (adjustment still proceeds)
  - Call `reflectionBasedRanking` service (create in next step)
  - Store adjusted_plan in agent_sessions
  - Return `{ adjusted_plan, performance: { total_ms, ranking_ms } }`
- **Service**: `lib/services/reflectionBasedRanking.ts` (create)
  - Fetch active reflections by IDs
  - Generate embeddings for reflection texts (OpenAI text-embedding-3-small)
  - Fetch task embeddings from task_embeddings table
  - Calculate cosine similarity matrix (reuse `calculateCosineSimilarity` from research.md)
  - Apply recency weights to similarity scores (step function)
  - Adjust confidence scores:
    * similarity > 0.7: boost confidence by (similarity - 0.7) * 0.3
    * similarity < 0.3: penalize confidence by (0.3 - similarity) * 0.3
  - Re-sort tasks by adjusted confidence scores
  - Generate diff: compare baseline_plan.ordered_task_ids vs adjusted order
  - Return adjusted_plan with diff and metadata
- **Data**: agent_sessions.adjusted_plan updated
- **Feedback**: Task list re-renders with new order, loading indicator clears

**Test Scenario**:
1. Complete T006 to establish baseline plan
2. Add reflection: "Burnt out, need lighter tasks"
3. Toggle reflection OFF → ON
4. **Verify**: "Adjusting priorities..." indicator appears (if >100ms)
5. Wait for adjustment
6. **Verify**: Priorities adjust within 500ms (check Network tab)
7. **Verify**: Heavy/complex tasks move up after toggling OFF burnout reflection
8. Check database: `SELECT adjusted_plan FROM agent_sessions ORDER BY created_at DESC LIMIT 1`
9. **Verify**: adjusted_plan.diff.moved array populated with task movements

**Test Scenario (Debounce)**:
1. Rapidly toggle 3 reflections within 2 seconds
2. **Verify**: Only 1 API call to /adjust-priorities after 1 second of inactivity (check Network tab)
3. **Verify**: Final call uses latest toggle states

**Files Modified**:
- `app/priorities/components/ContextCard.tsx` (add adjustment trigger)
- `app/api/agent/adjust-priorities/route.ts` (create)
- `lib/services/reflectionBasedRanking.ts` (create)
- `lib/hooks/useDebounce.ts` (use from T004)

**Acceptance Criteria** (FR-005, FR-008, FR-021, FR-020):
- [ ] Adjustment completes <500ms (p95)
- [ ] Loading indicator shows if >100ms
- [ ] Rapid toggles debounced (1000ms delay)
- [ ] Baseline staleness validated (>7d blocked, >24h warned)
- [ ] Task list updates with new order

---

### T008 [X] [SLICE] User sees visual movement badges on adjusted tasks
**User Story**: As a user, after priorities adjust, I see clear visual indicators (badges) showing which tasks moved, by how many positions, and why

**Implementation Scope**:
- **UI Components**:
  - `app/priorities/components/TaskMovementBadge.tsx` (create)
    * Display arrow icon (↑ for up, ↓ for down)
    * Show position change: "↑ 2 positions", "↓ 3 positions"
    * Tooltip on hover: reason from adjusted_plan.diff.moved[].reason
    * Color coding: Green (↑ boost), Red (↓ demote), Gray (unchanged)
  - Extend `app/priorities/components/TaskRow.tsx`
    * Add TaskMovementBadge next to task text
    * Only render badge if task in adjusted_plan.diff.moved array
  - Extend `app/priorities/components/TaskList.tsx`
    * Pass adjusted_plan.diff data to TaskRow components
- **Data Flow**:
  - Fetch adjusted_plan from latest agent_session
  - Map diff.moved array to tasks by task_id
  - Pass movement data to TaskRow
- **Feedback**: Badges appear immediately after adjustment, tooltips explain reasons

**Test Scenario**:
1. Complete T007 to generate adjusted plan with movements
2. Inspect task list
3. **Verify**: Moved tasks show TaskMovementBadge component
4. **Verify**: Badge shows arrow (↑ or ↓) and position count
5. Hover over badge
6. **Verify**: Tooltip displays reason: "Matches 'design phase' context" or "Contradicts 'no app yet' context"
7. **Verify**: Unchanged tasks show no badge (or optional "Unchanged" badge)

**Files Modified**:
- `app/priorities/components/TaskMovementBadge.tsx` (create)
- `app/priorities/components/TaskRow.tsx` (extend)
- `app/priorities/components/TaskList.tsx` (extend)
- `components/ui/tooltip.tsx` (use existing shadcn component)

**Completion Notes**:
- Component implemented as `MovementBadge.tsx` (existing) rather than creating `TaskMovementBadge.tsx` (specified)
- All functional requirements met
- Ready for manual testing per test scenario (lines 371-378)

**Acceptance Criteria** (FR-013, FR-014):
- [ ] Movement badges appear on affected tasks
- [ ] Badges show direction (up/down arrow) and magnitude
- [ ] Tooltips explain movement reasons
- [ ] Unchanged tasks display no badge

---

### T009 [X] [SLICE] User sees context summary in reasoning trace panel
**User Story**: As a user, I can view the reasoning trace and see which reflections were used during prioritization

**Implementation Scope**:
- **UI**: Extend `app/components/ReasoningTracePanel.tsx`
  - Add "Context Used" section in trace panel
  - Display count: "Context Used: 3 reflections"
  - Expandable section showing:
    * Reflection texts that were active during prioritization
    * Recency weights (1.0, 0.5, 0.25)
    * Timestamps (relative: "2 days ago")
  - Show in both baseline analysis and adjustment views
- **Data**: Read from adjusted_plan.adjustment_metadata.reflections and fetch reflection details
- **Feedback**: Context section visible in trace, expandable on click

**Test Scenario**:
1. Complete T007 with 3 active reflections
2. Open ReasoningTracePanel (expand trace section on priorities page)
3. **Verify**: "Context Used: 3 reflections" summary appears
4. Expand context section
5. **Verify**: See list of 3 reflection texts
6. **Verify**: Recency weights displayed (1.0, 0.5, 0.25 based on age)
7. **Verify**: Relative timestamps shown ("5 days ago")

**Files Modified**:
- `app/components/ReasoningTracePanel.tsx` (extend)
- `components/ui/accordion.tsx` (use existing shadcn component for expandable section)

**Completion Notes**:
- Context accordion implemented within `ReasoningTracePanel`; no new badge component required
- Baseline and latest-adjustment reflections rendered with recency weights and relative timestamps
- Ready for manual testing per scenario steps 1-7 (lines 415-421)

**Acceptance Criteria** (FR-015, FR-016):
- [ ] Context summary shows reflection count
- [ ] Reflection texts visible in trace
- [ ] Recency weights displayed
- [ ] Relative timestamps accurate

---

## Phase 4: Integration & Polish

### T010 [X] [POLISH] Add baseline staleness warning UI
**Enhancement to**: T007 (adjustment endpoint validates staleness, but no UI warning yet)

**User Story**: As a user with a stale baseline plan (>24 hours), I see a warning suggesting I recalculate priorities

**Implementation Scope**:
- **UI**: `app/priorities/components/ContextCard.tsx`
  - Check baseline_plan.created_at on page load
  - If >24 hours old: Display warning banner above context card
  - Warning text: "Your priorities were last analyzed [X hours] ago. Consider running a full analysis for best results."
  - "Recalculate" button → triggers POST /api/agent/prioritize
  - If >7 days old: Error banner (red) + disable toggle switches
  - Error text: "Baseline plan too old (>7 days). Run full analysis to use context adjustments."
- **Logic**: Calculate age from baseline_plan.created_at vs. Date.now()
- **Feedback**: Warning/error banner displays, user can dismiss or recalculate

**Test Scenario**:
1. Manually update baseline_plan.created_at to 25 hours ago (SQL)
2. Navigate to `/priorities`
3. **Verify**: Warning banner appears above context card
4. **Verify**: Warning shows hours since last analysis
5. Click "Recalculate" button
6. **Verify**: Full agent re-run triggered
7. Manually update baseline_plan.created_at to 8 days ago
8. Refresh page
9. **Verify**: Error banner (red) appears
10. **Verify**: Toggle switches disabled
11. Click toggle → **Verify**: 400 error from API (blocked)

**Files Modified**:
- `app/priorities/components/ContextCard.tsx` (add staleness check)
- `components/ui/alert.tsx` (use existing shadcn Alert component)

**Acceptance Criteria** (FR-019, FR-020):
- [ ] >24h: Warning shown, adjustment allowed
- [ ] >7d: Error shown, adjustment blocked
- [ ] "Recalculate" button triggers full analysis

---

### T011 [X] Integration test for toggle → adjustment → UI flow
**User Story**: (Test-only task) Validate end-to-end flow from toggle to priority adjustment to visual feedback

**Implementation Scope**:
- **Test**: `__tests__/integration/context-adjustment.test.ts` (create)
  - Scenario 1: Empty state → Add reflection → Analyze → See baseline
  - Scenario 2: Toggle reflection OFF → Adjust → Verify movement badges
  - Scenario 3: Toggle reflection ON → Adjust → Verify task re-ranking
  - Scenario 4: Rapid toggles → Debounce → Single API call
  - Scenario 5: Adjustment failure → Rollback toggle → Error message
- **Coverage**:
  - Database: reflection toggle persistence
  - API: /adjust-priorities response time <500ms
  - UI: TaskMovementBadge rendering
  - State: Optimistic update + rollback

**Validation**:
- [ ] Run `npx vitest run __tests__/integration/context-adjustment.test.ts`
- [ ] All scenarios pass
- [ ] Coverage ≥80% for new components

**Files Modified**:
- `__tests__/integration/context-adjustment.test.ts` (create)

---

### T012 [X] Integration test for recency weighting step function
**User Story**: (Test-only task) Validate recency weight calculation matches step function specification

**Implementation Scope**:
- **Test**: `__tests__/integration/recency-weighting.test.ts` (create)
  - Test 0-7 days: weight = 1.0
  - Test 8-14 days: weight = 0.5
  - Test 15+ days: weight = 0.25
  - Test boundary conditions (exactly 7 days, exactly 14 days)
- **Coverage**:
  - API: GET /api/reflections returns correct recency_weight
  - Service: reflectionBasedRanking applies weights correctly

**Validation**:
- [ ] Run `npx vitest run __tests__/integration/recency-weighting.test.ts`
- [ ] All boundary cases pass

**Files Modified**:
- `__tests__/integration/recency-weighting.test.ts` (create)

---

### T013 [P] Contract test validation (verify all contracts pass)
**User Story**: (Test-only task) Validate all contract tests pass after implementation

**Implementation Scope**:
- Re-run contract tests from T002 (should now PASS):
  - `__tests__/contract/adjust-priorities.test.ts`
  - `__tests__/contract/reflections-toggle.test.ts`
  - `__tests__/contract/reflections-recent.test.ts`
- Fix any schema mismatches

**Validation**:
- [ ] Run `npx vitest run __tests__/contract/`
- [ ] All tests PASS
- [ ] Response schemas match contracts/*.json exactly

**Files Modified**:
- Fix any endpoints to match contract schemas (as needed)

---

### T014 [X] [POLISH] Add performance logging for adjustment operations
**Enhancement to**: T007 (adjustment works, but no metrics logged yet)

**User Story**: As a system, I log adjustment performance metrics for SM-001 monitoring (reflection usage rate)

**Implementation Scope**:
- **Logging**: Add structured logging in `/api/agent/adjust-priorities`
  - Log event: "context_adjustment_completed"
  - Metrics: total_ms, ranking_ms, reflections, tasks_moved
  - Log to console (structured JSON) or existing logging service
- **Analytics**: Track reflection usage rate (SM-001 requirement)
  - Count: POST /api/reflections calls
  - Count: POST /api/agent/adjust-priorities calls
  - Compare: Reflections used in X% of prioritization sessions
- **No UI changes**: Server-side logging only

**Validation**:
- [ ] Trigger adjustment operation
- [ ] Check server logs for "context_adjustment_completed" event
- [ ] Verify metrics present: total_ms, reflections, etc.

**Files Modified**:
- `app/api/agent/adjust-priorities/route.ts` (add logging)
- `app/api/reflections/route.ts` (add logging for POST calls)

**Acceptance Criteria** (SM-001):
- [ ] Adjustment events logged with performance metrics
- [ ] Reflection creation events logged
- [ ] Metrics queryable for usage rate calculation

---

## Dependencies

```
T001 (DB migration) → (required for) → T003, T004, T005, T006
T002 (contract tests) → (validates) → T005, T007
T003 (empty state) → (enables) → T004
T004 (display reflections) → (enables) → T005
T005 (toggle persistence) → (required for) → T007
T006 (baseline storage) → (required for) → T007
T007 (instant adjustment) → (enables) → T008, T009, T010
T008 (movement badges) → (enhances) → T007
T009 (trace transparency) → (enhances) → T007
T010 (staleness warning) → (enhances) → T007
T011, T012, T013 → (validates) → ALL slices
T014 (logging) → (enhances) → T007
```

**Parallel Execution**:
- T001 + T002 can run in parallel (independent)
- After T001 completes: T003 starts
- After T003: T004 starts
- After T004: T005 starts
- After T005 + T006 complete: T007 starts
- After T007: T008 + T009 + T010 can run in parallel
- T011 + T012 + T013 can run in parallel after T008/T009/T010 complete
- T014 can run anytime after T007

---

## Validation Checklist
*Verified before creating tasks.md*

- [x] Every [SLICE] task has a user story
- [x] Every [SLICE] task includes UI + Backend + Data + Feedback
- [x] Every [SLICE] task has a test scenario
- [x] No backend-only or frontend-only tasks exist
- [x] Setup tasks (T001, T002) justify necessity (block all slices)
- [x] Tasks ordered by user value: Discovery (T003) → Interaction (T004-T005) → Core Value (T006-T007) → Feedback (T008-T009) → Polish (T010)
- [x] Parallel tasks operate on independent features/files
- [x] Each task specifies exact file paths to modify

---

## Notes

- **[SLICE]** tasks are independently deployable and user-testable
- **[P]** tasks operate on different files/features and can run in parallel
- Every slice MUST enable user to SEE, DO, and VERIFY something
- T001-T002 are setup tasks but justify necessity (block ALL subsequent slices)
- T003-T009 deliver complete user journeys (context visibility → toggle → adjustment → feedback)
- T010-T014 are polish/validation enhancements
- Performance target: <500ms adjustment (p95) validated in T007
- TDD workflow: T002 contracts fail → implement slices → T013 contracts pass
