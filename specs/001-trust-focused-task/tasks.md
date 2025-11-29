# Tasks: Trust-Focused Task List Refactor

**Input**: Design documents from `/specs/001-trust-focused-task/`
**Prerequisites**: plan.md, spec.md (7 user stories), research.md, data-model.md, contracts/agent-brief-reasoning.yaml
**Branch**: `001-trust-focused-task`
**Appetite**: 3 weeks

**Organization**: Tasks grouped by user story to enable independent implementation and testing. Each task delivers a complete vertical slice (SEE → DO → VERIFY).

## Format: `[ID] [P?] [SLICE/POLISH] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[SLICE]**: Complete vertical slice (UI + Backend + Data + Feedback)
- **[POLISH]**: Enhancement to existing working slice
- **[Story]**: User story mapping (US1-US7)

---

## Phase 1: Enhanced Agent Rationale & Unified Treatment (Week 1) 🎯

**Goal**: Build trust through transparent AI reasoning and consistent manual/AI task treatment

**Prerequisites** (implicit):
- Database: `agent_sessions`, `manual_tasks` tables already exist (no migrations needed)
- Environment: `OPENAI_API_KEY` configured
- Validation: Tests verify all prerequisites in setup phase

### User Story 5 - Enhanced Agent Rationale (Priority: P1)

**Independent Test**: Check top 5 tasks for brief_reasoning field (≤20 words, outcome-linked, no generic phrases)

- [X] T001 [P] [SLICE] [US5] Contract test for brief reasoning validation
  - **File**: `__tests__/contract/agent-brief-reasoning.test.ts`
  - **SEE**: Test suite with BriefReasoningSchema validation tests
  - **DO**: Run `pnpm test:run __tests__/contract/agent-brief-reasoning.test.ts`
  - **VERIFY**: Tests fail initially (RED) - schema doesn't exist yet
  - **Test cases**:
    - Word count validation (≤20 words)
    - Character length (5-150 chars)
    - Generic phrase rejection ("important", "critical" without specifics)
    - Empty/null rejection
    - Outcome-linked format acceptance

- [X] T002 [SLICE] [US5] Add BriefReasoningSchema and extend agent output schema
  - **Files**:
    - `lib/schemas/prioritizationResultSchema.ts` (extend TaskScoreSchema)
    - `lib/schemas/taskScoreSchema.ts` (add brief_reasoning field)
  - **SEE**: Zod schema exports BriefReasoningSchema with validation rules
  - **DO**: Add schema with word count, character length, generic phrase rejection
  - **VERIFY**: T001 contract tests pass (GREEN), schema validates brief reasoning
  - **Implementation**:
    - Create BriefReasoningSchema with .min(5), .max(150), .refine() for word count ≤20
    - Add regex refine() to reject generic phrases: /^(important|critical|high priority)$/i
    - Extend TaskScoreSchema with `brief_reasoning: BriefReasoningSchema`
  - **Dependencies**: T001 must be RED before implementation

- [X] T003 [SLICE] [US5] Update agent prompt to generate brief reasoning
  - **File**: `lib/mastra/agents/prioritizationGenerator.ts`
  - **SEE**: Agent prompt includes brief_reasoning field in output schema (lines 94-108)
  - **DO**: Modify prompt to generate outcome-linked reasoning (≤20 words) for each task
  - **VERIFY**: Agent output includes brief_reasoning, integration tests pass
  - **Implementation**:
    - Add brief_reasoning to per_task_scores output schema
    - Add prompt instruction: "For each task, generate brief_reasoning (≤20 words) linking to outcome, dependencies, or mechanism. AVOID generic phrases like 'important' without specifics."
    - Example format: "Unblocks #3, #7 • Enables [feature]"
  - **Dependencies**: T002 (schema exists)

- [X] T004 [P] [SLICE] [US5] Unit test for brief reasoning validator
  - **File**: `__tests__/unit/briefReasoningValidator.test.ts`
  - **SEE**: Unit tests for word count, generic phrase detection, fallback generation
  - **DO**: Run `pnpm test:run __tests__/unit/briefReasoningValidator.test.ts`
  - **VERIFY**: Tests fail initially (RED) - validator doesn't exist yet
  - **Test cases**:
    - Word count edge cases (19, 20, 21 words)
    - Generic phrase regex matching
    - Fallback format generation ("Priority: [rank]")

- [X] T005 [SLICE] [US5] Implement retry logic for brief reasoning validation
  - **File**: `lib/services/prioritizationLoop.ts`
  - **SEE**: Service retries agent call up to 3 times on validation failure
  - **DO**: Agent generates reasoning → Validate → Retry on failure → Fallback after 3 attempts
  - **VERIFY**: T004 unit tests pass (GREEN), telemetry logs retry attempts
  - **Implementation**:
    - Add retry loop (max 3 attempts) after agent call
    - On validation failure: Log retry attempt, call agent again with hint
    - After 3 failures: Set brief_reasoning = `"Priority: ${rank}"`
    - Add telemetry: console.log retry count, fallback usage
  - **Dependencies**: T003 (agent generates field), T004 must be RED

**Checkpoint**: Agent now generates specific, outcome-linked reasoning for top tasks

---

### User Story 2 - Unified Task Treatment (Priority: P1)

**Independent Test**: Create manual task with impact:8, effort:12h; verify identical ranking to AI task with same scores

- [X] T006 [P] [SLICE] [US2] Contract test for manual task scoring (no boost)
  - **File**: `__tests__/contract/manual-task-scoring.test.ts`
  - **SEE**: Contract test verifying manual tasks scored identically to AI tasks
  - **DO**: Run `pnpm test:run __tests__/contract/manual-task-scoring.test.ts`
  - **VERIFY**: Test fails initially (RED) - 20% boost still exists
  - **Test cases**:
    - Manual task (impact:8, effort:12h) vs AI task (same scores) → identical rank
    - No visual distinction in main view
    - Task source visible only in drawer metadata

- [X] T007 [SLICE] [US2] Remove 20% manual task boost from agent prompt
  - **File**: `lib/mastra/agents/prioritizationGenerator.ts`
  - **SEE**: Line 56 removed: "**MANUAL TASK BOOST**: multiply impact by 1.2"
  - **DO**: Delete boost instruction from agent prompt
  - **VERIFY**: T006 contract test passes (GREEN), manual tasks ranked identically
  - **Implementation**:
    - Remove line 56 entirely from prompt
    - Verify prompt no longer mentions manual task boost
  - **Dependencies**: T006 must be RED before implementation

- [X] T008 [SLICE] [US2] Remove 20% boost from manual task placement service
  - **File**: `lib/services/manualTaskPlacement.ts`
  - **SEE**: Manual task scoring logic removes 1.2x impact multiplier
  - **DO**: Remove boost calculation from service
  - **VERIFY**: Integration tests pass, manual tasks integrate seamlessly
  - **Implementation**:
    - Search for 1.2 or 20% boost calculation
    - Remove multiplier, use raw impact score
    - Ensure manual tasks use same scoring as AI tasks
  - **Dependencies**: T007 (agent prompt updated)

- [X] T009 [SLICE] [US2] Remove ManualTaskBadge from main TaskRow view
  - **File**: `app/priorities/components/TaskRow.tsx` (lines 790-795)
  - **SEE**: Main task view no longer shows "Manual" badge
  - **DO**: Remove ManualTaskBadge JSX from main view (keep in drawer metadata)
  - **VERIFY**: User cannot identify manual vs AI tasks in main list
  - **Implementation**:
    - Delete lines 790-795 (ManualTaskBadge in main view)
    - Keep badge in TaskDetailsDrawer metadata section
  - **Dependencies**: Independent (UI-only change)

**Checkpoint**: Manual and AI tasks now treated identically in scoring and display

---

## Phase 2: Simplification & Focus (Week 2)

**Goal**: Reduce cognitive load through simplified task display and Focus Mode default

### User Story 1 - Instant Task Comprehension (Priority: P1)

**Independent Test**: Load /priorities on 320px viewport, verify top task shows exactly 4-5 elements readable in <3 seconds

- [X] T010 [P] [SLICE] [US1] Integration test for simplified TaskRow
  - **File**: `__tests__/integration/trust-focused-ui.test.tsx`
  - **SEE**: Integration test validating simplified task display
  - **DO**: Run `pnpm test:run __tests__/integration/trust-focused-ui.test.tsx`
  - **VERIFY**: Test fails initially (RED) - TaskRow still has 12+ elements
  - **Test journey**:
    - Load /priorities
    - Verify task #1 has exactly 4-5 elements
    - Check brief reasoning visible (≤20 words)
    - Verify "Details →" link present
    - Confirm scan time <5 seconds

- [x] T011 [SLICE] [US1] Simplify TaskRow to 4-5 core elements
  - **File**: `app/priorities/components/TaskRow.tsx` (940 lines → simplified)
  - **SEE**: Task row shows only: rank, indicator, title, brief reasoning, checkbox
  - **DO**: Remove lock button, inline scores, category badges, AI badge, dependencies, movement from main view
  - **VERIFY**: T010 integration test passes (GREEN), user can scan list in <5 seconds
  - **Implementation**:
    - **Remove from main view (lines 597-908)**:
      - Lock/unlock button (lines 613-628)
      - Inline strategic scores (lines 697-727)
      - Category badges (lines 776-789)
      - AI-generated badge (lines 860-874)
      - Dependencies list (lines 880-883)
      - Movement badge prominence (lines 885-890) - make subtle
    - **Keep in main view**:
      - Rank number (#1, #2, etc.)
      - Single indicator (🌟 Quick Win / 🚀 Strategic Bet / "12h" effort)
      - Task title (editable inline)
      - Brief reasoning text (from T003 agent output)
      - Complete checkbox (☐ Done)
    - **Add**:
      - "Details →" link (opens TaskDetailsDrawer)
    - Move removed elements to TaskDetailsDrawer (T017)
  - **Dependencies**: T003 (brief_reasoning field exists), T010 must be RED

**Checkpoint**: Task list now scannable in <5 seconds with clear reasoning visible

---

### User Story 3 - Focus Mode Default (Priority: P2)

**Independent Test**: Load /priorities fresh session, verify ≤12 high-leverage tasks shown with count display

- [X] T012 [P] [SLICE] [US3] Contract test for Focus Mode filter logic
  - **File**: `__tests__/contract/focus-mode-filter.test.ts`
  - **SEE**: Contract test validating quadrant inclusion/exclusion
  - **DO**: Run `pnpm test:run __tests__/contract/focus-mode-filter.test.ts`
  - **VERIFY**: Test fails initially (RED) - focus_mode doesn't exist yet
  - **Test cases**:
    - Focus Mode includes Quick Wins (high_impact_low_effort)
    - Focus Mode includes Strategic Bets (high_impact_high_effort)
    - Focus Mode excludes Overhead (low_impact_high_effort)
    - Focus Mode excludes Neutral (low_impact_low_effort)
    - Task count reduced by 40-60%

- [X] T013 [SLICE] [US3] Add focus_mode strategy to sorting schema
  - **File**: `lib/schemas/sortingStrategy.ts`
  - **SEE**: SortingStrategySchema includes 'focus_mode' enum value
  - **DO**: Add focus_mode to enum and STRATEGY_CONFIGS
  - **VERIFY**: T012 contract test passes (GREEN), filter logic correct
  - **Implementation**:
    - Add 'focus_mode' to SortingStrategySchema enum (line 9)
    - Add to STRATEGY_CONFIGS (lines 64-70):
      ```typescript
      focus_mode: {
        label: 'Focus Mode (Recommended)',
        description: 'High-leverage work only (Quick Wins + Strategic Bets)',
        filter: task => isQuickWinTask(task) || isStrategicBetTask(task),
        sort: (a, b) => b.priority - a.priority,
      }
      ```
  - **Dependencies**: T012 must be RED before implementation

- [X] T014 [P] [SLICE] [US3] Unit test for filter persistence
  - **File**: `__tests__/unit/filterPersistence.test.ts`
  - **SEE**: Unit tests for localStorage read/write cycle
  - **DO**: Run `pnpm test:run __tests__/unit/filterPersistence.test.ts`
  - **VERIFY**: Tests fail initially (RED) - service doesn't exist yet
  - **Test cases**:
    - loadFilterPreference() returns 'focus_mode' on first load
    - saveFilterPreference() writes to localStorage
    - JSON parse error handling (fallback to 'focus_mode')
    - Invalid stored value defaults to 'focus_mode'

- [X] T015 [SLICE] [US3] Create filter persistence service
  - **File**: `lib/services/filterPersistence.ts` (NEW)
  - **SEE**: Service exports loadFilterPreference() and saveFilterPreference()
  - **DO**: Implement localStorage utilities with error handling
  - **VERIFY**: T014 unit tests pass (GREEN), filter persists across reloads
  - **Implementation**:
    ```typescript
    export const loadFilterPreference = (): SortingStrategy => {
      if (typeof window === 'undefined') return 'focus_mode';
      const stored = localStorage.getItem('task-filter-preference');
      if (!stored) return 'focus_mode';
      try {
        const parsed = JSON.parse(stored);
        return SortingStrategySchema.parse(parsed.strategy);
      } catch {
        return 'focus_mode';
      }
    };

    export const saveFilterPreference = (strategy: SortingStrategy) => {
      if (typeof window === 'undefined') return;
      const pref = { strategy, savedAt: Date.now() };
      localStorage.setItem('task-filter-preference', JSON.stringify(pref));
    };
    ```
  - **Dependencies**: T013 (focus_mode exists), T014 must be RED

- [X] T016 [SLICE] [US3] Set Focus Mode default and add filter persistence to priorities page
  - **File**: `app/priorities/page.tsx`
  - **SEE**: Page loads with Focus Mode active, shows "Showing X focused tasks (Y hidden)"
  - **DO**: Set default filter to focus_mode, add localStorage persistence
  - **VERIFY**: User sees ≤12 tasks by default, filter persists on reload
  - **Implementation**:
    - Change default: `const [activeStrategy, setActiveStrategy] = useState('focus_mode')`
    - Add useEffect to load persisted filter:
      ```typescript
      useEffect(() => {
        const stored = loadFilterPreference();
        setActiveStrategy(stored);
      }, []);
      ```
    - Add useEffect to save filter changes:
      ```typescript
      useEffect(() => {
        saveFilterPreference(activeStrategy);
      }, [activeStrategy]);
      ```
    - Update count display: "Showing 8 focused tasks (15 hidden)"
    - Remove lock feature state management
  - **Dependencies**: T013 (focus_mode enum), T015 (persistence service)

**Checkpoint**: Default view now shows ≤12 high-leverage tasks with persistent filter selection

---

## Phase 3: Progressive Disclosure & Mobile Polish (Week 3)

**Goal**: Rich details in drawer, mobile-first layout, completed tasks section

### User Story 4 - Progressive Disclosure (Priority: P2)

**Independent Test**: Tap "Details →" on task #1, verify drawer shows all secondary info without returning to main list

- [x] T017 [SLICE] [US4] Enhance TaskDetailsDrawer with all secondary information
  - **File**: `app/priorities/components/TaskDetailsDrawer.tsx`
  - **SEE**: Drawer shows strategic scores, quadrant viz, dependencies, movement, manual overrides
  - **DO**: Open drawer via "Details →" link, view all task context
  - **VERIFY**: User can investigate task without returning to main list
  - **Implementation**:
    - **Add full content sections**:
      - Strategic scores with visual breakdown (impact/effort/confidence)
      - Quadrant scatter plot or card visualization
      - Dependencies graph (prerequisite/blocks/related tasks)
      - Movement timeline (rank changes over time)
      - Manual override controls with "Apply" button (enhanced in T021)
      - Source document links
      - Task source metadata (manual vs AI) - only here, not main view
    - **Mobile adaptation**: Full-screen overlay on <768px, side panel on ≥768px
    - **Scroll behavior**: Drawer stays open when main list scrolls
  - **Dependencies**: T011 (elements moved from TaskRow)

**Checkpoint**: All task details accessible via progressive disclosure pattern

---

### User Story 6 - Mobile-First Layout (Priority: P2)

**Independent Test**: Load /priorities on 320px/375px/768px/1024px viewports, verify responsive layout and WCAG AAA compliance

- [x] T018 [P] [SLICE] [US6] Mobile viewport integration tests
  - **File**: `__tests__/integration/mobile-viewport.test.tsx`
  - **SEE**: Integration tests for 4 viewport breakpoints
  - **DO**: Run `pnpm test:run __tests__/integration/mobile-viewport.test.tsx`
  - **VERIFY**: Tests fail initially (RED) - mobile layout not optimized yet
  - **Test scenarios**:
    - 320px: No horizontal scroll, card layout, touch targets ≥44px
    - 375px: Same as 320px with more spacing
    - 768px: Transition to row-based layout
    - 1024px: Full desktop grid layout
    - All viewports: Typography scaling, WCAG AAA compliance

- [x] T019 [SLICE] [US6] Implement mobile-first responsive layout for TaskRow
  - **File**: `app/priorities/components/TaskRow.tsx`
  - **SEE**: Task row adapts from vertical card (mobile) to horizontal row (desktop)
  - **DO**: Apply mobile-first responsive classes, scale typography, ensure ≥44px touch targets
  - **VERIFY**: T018 mobile tests pass (GREEN), no horizontal scroll on 320px
  - **Implementation**:
    - **Mobile-first classes** (320px+):
      ```tsx
      className="
        // Mobile: Card layout
        flex flex-col gap-3 p-4 border rounded-lg

        // Tablet+: Row layout
        lg:flex-row lg:gap-4 lg:p-3 lg:border-0 lg:rounded-none
      "
      ```
    - **Touch targets**: All interactive elements h-11 (44px) on mobile
    - **Typography**:
      - Mobile: 18px task title, 16px brief reasoning
      - Desktop: 14px task title, 13px brief reasoning
    - **Drawer trigger**: Full-width button on mobile, inline link on desktop
  - **Dependencies**: T011 (simplified structure), T018 must be RED

**Checkpoint**: Mobile users can triage tasks on 320px viewport without horizontal scroll

---

### Completed Tasks & Manual Override Polish

- [X] T020 [P] [SLICE] [US1] Integration test for completed tasks pagination
  - **File**: `__tests__/integration/completed-tasks-pagination.test.tsx`
  - **SEE**: Integration test for completed section with "Show more" behavior
  - **DO**: Run `pnpm test:run __tests__/integration/completed-tasks-pagination.test.tsx`
  - **VERIFY**: Test fails initially (RED) - component doesn't exist yet
  - **Test scenarios**:
    - Complete task → moves to "Completed" section
    - Default shows last 10 completed tasks
    - "Show more" loads next 10 older tasks
    - Button hidden when ≤10 completed tasks
    - 0 completed → Shows "No completed tasks yet"

- [X] T021 [SLICE] [US1] Create CompletedTasksSection component with pagination
  - **File**: `app/priorities/components/CompletedTasksSection.tsx` (NEW)
  - **SEE**: Completed tasks section below active tasks with pagination
  - **DO**: Mark task complete → moves to section, "Show more" expands older tasks
  - **VERIFY**: T020 integration test passes (GREEN), pagination works correctly
  - **Implementation**:
    ```typescript
    type CompletedTasksState = {
      visible: Task[]; // Last 10
      hidden: Task[]; // Older
      page: number;
      hasMore: boolean;
      isExpanding: boolean;
    };
    ```
    - Default: Show last 10 completed tasks sorted by completion timestamp
    - "Show more" button: Load next 10, increment page
    - Hide button when `hidden.length === 0`
    - Empty state: "No completed tasks yet"
  - **Dependencies**: T020 must be RED before implementation
  - **Integration**: Import in `app/priorities/page.tsx` below active task list

- [X] T022 [P] [SLICE] [US4] Integration test for manual override "Apply" button
  - **File**: `__tests__/integration/manual-override-apply.test.tsx`
  - **SEE**: Integration test for instant re-ranking flow
  - **DO**: Run `pnpm test:run __tests__/integration/manual-override-apply.test.tsx`
  - **VERIFY**: Test fails initially (RED) - "Apply" button doesn't exist yet
  - **Test scenarios**:
    - Open task #5 drawer, adjust impact slider to 9
    - Click "Apply" → Task re-ranks instantly (<100ms)
    - Drawer stays open showing new position
    - Close without "Apply" → Changes discarded
    - Re-open drawer → Sliders reset to original values

- [X] T023 [SLICE] [US4] Add "Apply" button to ManualOverrideControls
  - **File**: `app/priorities/components/ManualOverrideControls.tsx`
  - **SEE**: Manual override sliders now have "Apply" button triggering instant re-rank
  - **DO**: Adjust sliders → Click "Apply" → Task re-ranks, drawer stays open
  - **VERIFY**: T022 integration test passes (GREEN), re-rank <100ms
  - **Implementation**:
    - Add state: `const [pendingChanges, setPendingChanges] = useState(null)`
    - Sliders update pendingChanges (not immediate)
    - Add "Apply" button:
      ```tsx
      <Button onClick={async () => {
        await onApply(pendingChanges);
        // Optimistic UI update
        // Re-rank happens client-side (<100ms target)
        // Reasoning regenerates on next agent cycle
      }}>
        Apply
      </Button>
      ```
    - Add "Cancel" button: Resets pendingChanges, closes drawer
    - POST `/api/tasks/[id]/override` on apply
  - **Dependencies**: T017 (drawer enhanced), T022 must be RED

---

### User Story 7 - Quick Wins Filter Fix (Priority: P3)

**Independent Test**: Apply Quick Wins filter, verify only impact≥5 AND effort≤8h shown with accurate count

- [X] T024 [SLICE] [US7] Verify and fix Quick Wins filter logic
  - **File**: `lib/schemas/sortingStrategy.ts` (lines 31-34, 54)
  - **SEE**: Quick Wins filter correctly shows only high-impact, low-effort tasks
  - **DO**: Toggle Quick Wins filter, verify accurate filtering and count
  - **VERIFY**: User sees "Showing 5 Quick Wins of 23 tasks" with correct tasks
  - **Implementation**:
    - Verify existing logic: `impact >= 5 && effort <= 8`
    - If broken, fix filter function
    - Add count accuracy to filter display
    - Test edge case: Complete Quick Win → count decrements correctly
  - **Dependencies**: Independent (existing feature refinement)

- [X] T024.1 [BUGFIX] Fix Quick Wins filter empty state (Missing Data)
  - **Root Cause**: `strategic_scores` (impact/effort) were not being saved to `agent_sessions` table.
  - **Fix**: Added `strategic_scores` column via migration 023 and updated `agentOrchestration.ts` to persist scores.
  - **Action Required**: Run migration 023 and re-run prioritization to populate scores.

- [X] T024.2 [BUGFIX] Fix Quick Wins filter freeze and "All Complete" confusion
  - **Root Cause**: `SortingStrategySelector` was disabled when filtered count was 0, trapping the user. Empty list was misinterpreted as "all complete".
  - **Fix**: Removed `disabled` prop from selector in `TaskList.tsx`. Added "No tasks match the current filter" empty state message.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Week 1)**: Enhanced Agent Rationale + Unified Treatment
  - Tasks T001-T009 can run partially in parallel
  - T001 (contract test) + T004 (unit test) can run parallel (different test types)
  - T002 → T003 sequential (schema → agent prompt)
  - T002 → T005 sequential (schema → retry logic)
  - T006 (contract test) → T007 → T008 sequential (test → agent → service)
  - T009 independent (UI-only)

- **Phase 2 (Week 2)**: Simplification + Focus Mode
  - Tasks T010-T016 can run partially in parallel
  - T010 (test) → T011 (TaskRow) sequential
  - T012 (test) → T013 → T015 → T016 sequential (test → schema → service → page)
  - T014 (test) → T015 (service) sequential
  - T011 and T013-T016 can overlap if different developers

- **Phase 3 (Week 3)**: Progressive Disclosure + Mobile + Polish
  - T017 depends on T011 (elements moved from TaskRow)
  - T018 (test) → T019 (mobile layout) sequential, depends on T011 (simplified structure)
  - T020 (test) → T021 (CompletedTasksSection) sequential, independent otherwise
  - T022 (test) → T023 (Apply button) sequential, depends on T017 (drawer enhanced)
  - T024 independent (Quick Wins fix)

### Parallel Opportunities

**Within Phase 1**:
- Developer A: T001-T005 (agent reasoning)
- Developer B: T006-T008 (manual task boost removal)
- Developer C: T009 (UI badge removal)

**Within Phase 2**:
- Developer A: T010-T011 (TaskRow simplification)
- Developer B: T012-T016 (Focus Mode + filter persistence)

**Within Phase 3**:
- Developer A: T017 (drawer enhancement)
- Developer B: T018-T019 (mobile layout)
- Developer C: T020-T021 (completed tasks)
- Developer D: T022-T023 (manual override)
- Developer E: T024 (Quick Wins fix)

### Critical Path (Sequential for Single Developer)

```
Week 1: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009
Week 2: T010 → T011 → T012 → T013 → T014 → T015 → T016
Week 3: T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024
```

---

## Implementation Strategy

### TDD Cycle (MANDATORY)

For each task:

1. **RED**: Write/run test, confirm failure
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Clean up if needed
4. **COMMIT**: "feat: [task description]" with test passing

### Checkpoints (Demo-Ready Milestones)

- **After T005**: Agent generates specific brief reasoning, ready to demo
- **After T009**: Manual/AI unified treatment complete, ready to demo
- **After T011**: Simplified task list scannable in <5s, ready to demo
- **After T016**: Focus Mode default reduces clutter, ready to demo
- **After T019**: Mobile-first layout works on phones, ready to demo
- **After T023**: Full feature complete with drawer, pagination, overrides, ready to ship

### Rollback Strategy

- **Agent changes (T001-T005)**: Revert `prioritizationGenerator.ts` to previous version
- **Manual boost (T007-T008)**: Re-add 1.2x multiplier if critical issues
- **TaskRow (T011)**: Feature flag for old vs new layout
- **Focus Mode (T016)**: Default to 'balanced' if user feedback negative
- **Mobile (T019)**: Revert responsive classes, desktop-first fallback

---

## Performance Targets (From Spec)

- **Brief reasoning validation**: <50ms per task, <150ms with retries (T001-T005)
- **Filter persistence**: <5ms read/write (T014-T015)
- **Drawer open**: <200ms desktop, <500ms mobile (T017, T019)
- **Manual override apply**: <100ms re-ranking (T023)
- **Completed tasks pagination**: <100ms per "Show more" (T021)

---

## Success Criteria (From Spec)

### After Phase 1 (T001-T009)
- [ ] SC-010: Brief reasoning contains outcome links in 100% of top 5 tasks
- [ ] SC-004: Manual task consistency 100% (identical scoring)
- [ ] TM-001: Agent validation rejects ≥95% of generic reasoning

### After Phase 2 (T010-T016)
- [ ] SC-001: Elements per task reduced from ~12 to ≤5 (58% reduction)
- [ ] SC-002: Time to understand top task <3 seconds (70% improvement)
- [ ] SC-006: Default task count ≤12 tasks (48% reduction)
- [ ] SC-009: User can scan list in <5 seconds

### After Phase 3 (T017-T024)
- [ ] SC-005: No horizontal scroll on 320px viewport
- [ ] SC-008: All touch targets ≥44px (WCAG AAA)
- [ ] SC-007: Quick Wins filter 100% accuracy
- [ ] UX-003: Power users access all details via drawer
- [ ] TM-007: Manual override apply <100ms re-ranking

---

## Notes

- **[P]** = Parallel execution possible (different files, no dependencies)
- **[SLICE]** = Vertical slice delivering complete user value (SEE → DO → VERIFY)
- **[Story]** = Maps to user story (US1-US7) from spec.md
- **TDD Required**: All test tasks must fail (RED) before implementation
- **No database migrations**: Pure refactoring (agent prompt + UI components)
- **Demo-ready**: Every checkpoint can be shown to non-technical person

**Forbidden Patterns:**
- ❌ Backend-only tasks
- ❌ UI-only tasks (except T009 badge removal)
- ❌ Tasks without SEE-DO-VERIFY
- ❌ Infrastructure-only [SETUP] tasks

**Commit Strategy:**
- Commit after each GREEN (test passes)
- Use conventional commits: `feat:`, `test:`, `refactor:`
- Reference task ID in commit message: `feat(T003): add agent brief reasoning`
