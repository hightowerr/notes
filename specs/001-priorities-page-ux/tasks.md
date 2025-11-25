# Tasks: Priorities Page UX Refinement

**Input**: Design documents from `/specs/001-priorities-page-ux/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, quickstart.md

**Project Type**: Next.js web application (frontend-only refactoring)
**Tech Stack**: TypeScript, React 19, Next.js 15, Tailwind CSS v4, shadcn/ui
**Testing**: Vitest + React Testing Library, TDD workflow (RED → GREEN → REFACTOR)

**Organization**: Tasks organized by vertical slice (P1 → P3 priority order from spec.md). Each slice delivers complete user value following SEE IT, DO IT, VERIFY IT protocol.

## Format: `[ID] [P?] [SLICE] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[SLICE]**: Complete vertical slice (UI + tests + user outcome)
- Include exact file paths in descriptions

## Path Conventions

All paths relative to repository root:
- Components: `app/priorities/components/`
- Page: `app/priorities/page.tsx`
- Component Tests: `app/priorities/components/__tests__/`
- Integration Tests: `__tests__/integration/`

---

## Phase 1: User Story 1 - Immediate Sorting Feedback (Priority: P1) 🎯 MVP

**Goal**: User can change sorting strategy and immediately see tasks re-order in the same viewport without scrolling.

**Why P1**: Fixes critical feedback loop violation (500px scroll distance). Highest-impact UX improvement.

**User Story**: "As a user prioritizing tasks, I want to change the sorting strategy and immediately see the tasks re-order in the same viewport, so I can quickly verify my selection worked without scrolling."

**Vertical Slice Compliance**:
- ✅ SEE IT: Sorting dropdown visible in TaskList header
- ✅ DO IT: User changes strategy in dropdown
- ✅ VERIFY IT: Tasks re-order instantly below dropdown (0px scroll)

**Independent Test**: Load /priorities with tasks → Change sorting in header dropdown → Verify tasks re-order without scrolling

---

### T001 [SLICE] TaskList Header with Integrated Sorting

**User Value**: User sees sorting control directly above task list, changes strategy, and verifies effect immediately without scrolling.

**TDD Workflow** (RED → GREEN → REFACTOR):

1. **Write Failing Tests** (RED):
   - Component test: `app/priorities/components/__tests__/TaskList.test.tsx`
     * TaskList renders header with title, task count, and sorting dropdown
     * Sorting dropdown positioned right-aligned in header
     * Sorting dropdown disabled when `tasks.length === 0`
     * Sorting dropdown shows tooltip "No tasks to sort" when disabled
   - Use contracts from `specs/001-priorities-page-ux/contracts/component-contracts.test.ts` as reference

2. **Implement Minimal Code** (GREEN):
   - Modify: `app/priorities/components/TaskList.tsx`
     * Add header div before task rows
     * Render: Title ("Your Prioritized Tasks") + Task count (`{tasks.length} tasks`) + SortingStrategySelector
     * Accept new props: `sortingStrategy: SortingStrategy`, `onStrategyChange: (strategy) => void`
     * Pass `compact={true}` and `disabled={tasks.length === 0}` to SortingStrategySelector
     * Use design system tokens: `flex items-center justify-between border-b border-border p-4`
     * Ensure header uses Phase 8 mobile-first patterns: `h-11 sm:h-9`, `text-sm sm:text-base`

3. **Update Page Component**:
   - Modify: `app/priorities/page.tsx`
     * Remove standalone `<SortingStrategySelector .../>` section (lines ~2712-2723)
     * Pass `sortingStrategy` and `setSortingStrategy` props to `<TaskList />`
     * Verify sorting state management unchanged (use existing `useState`)

4. **Verify Tests Pass** (GREEN):
   - Run: `pnpm test:run app/priorities/components/__tests__/TaskList.test.tsx`
   - All new tests should pass
   - Run: `pnpm test:run` to ensure no regressions

5. **Refactor** (if needed):
   - Extract header to separate component if TaskList becomes too large (>500 lines)
   - Optimize with React.memo if render performance <100ms not met

**Files Modified**:
- `app/priorities/components/TaskList.tsx` (~30 lines added for header)
- `app/priorities/page.tsx` (~10 lines removed, ~5 lines modified)
- `app/priorities/components/__tests__/TaskList.test.tsx` (~50 lines added)

**Acceptance Criteria**:
- [ ] Sorting dropdown visible in TaskList header (right-aligned)
- [ ] Task count displays correctly (e.g., "12 tasks")
- [ ] Sorting dropdown disabled when no tasks
- [ ] Changing strategy triggers `onStrategyChange` callback
- [ ] Header stacks properly on mobile (320px viewport)
- [ ] All existing tests pass
- [ ] New component tests pass

**Manual Test** (from quickstart.md):
1. Navigate to `/priorities` with 10+ tasks
2. Locate sorting dropdown in TaskList header
3. Change strategy from "Strategic Impact" to "Effort Weighted"
4. **VERIFY**: Tasks re-order immediately without scrolling
5. **VERIFY**: Dropdown and task list both visible in same viewport

**Estimated Effort**: 3-4 hours

---

### T002 [SLICE] SortingStrategySelector Compact Variant for Header Embedding

**User Value**: Sorting dropdown fits cleanly in TaskList header on all viewport sizes (320px-1920px) with appropriate sizing.

**TDD Workflow** (RED → GREEN → REFACTOR):

1. **Write Failing Tests** (RED):
   - Component test: `app/priorities/components/__tests__/SortingStrategySelector.test.tsx`
     * Compact prop applies reduced styles (`h-9 text-sm px-2` on mobile)
     * Default styles when `compact=false` or omitted (`h-11 text-base px-4`)
     * Disabled state shows tooltip "No tasks to sort"

2. **Implement Minimal Code** (GREEN):
   - Modify: `app/priorities/components/SortingStrategySelector.tsx`
     * Add `compact?: boolean` prop to interface (default `false`)
     * Add `disabled?: boolean` prop to interface
     * Apply conditional className:
       ```tsx
       const triggerClassName = compact
         ? "h-9 text-sm px-2 sm:h-9 sm:text-sm"
         : "h-11 text-base px-4 sm:h-9 sm:text-sm";
       ```
     * Add Tooltip wrapper when `disabled` with message "No tasks to sort"

3. **Update TaskList Header**:
   - Modify: `app/priorities/components/TaskList.tsx` (from T001)
     * Pass `compact={true}` to SortingStrategySelector in header
     * Pass `disabled={tasks.length === 0}` to SortingStrategySelector

4. **Verify Tests Pass** (GREEN):
   - Run: `pnpm test:run app/priorities/components/__tests__/SortingStrategySelector.test.tsx`
   - Run: `pnpm test:run` to ensure no regressions

5. **Manual Mobile Testing**:
   - Test viewports: 320px, 375px, 768px, 1024px
   - Verify dropdown doesn't overflow header
   - Verify tap target ≥44px on mobile

**Files Modified**:
- `app/priorities/components/SortingStrategySelector.tsx` (~10 lines modified)
- `app/priorities/components/TaskList.tsx` (~2 lines modified)
- `app/priorities/components/__tests__/SortingStrategySelector.test.tsx` (~30 lines added)

**Acceptance Criteria**:
- [ ] Compact variant reduces padding and font size
- [ ] Default variant maintains existing sizing
- [ ] Disabled state prevents interaction
- [ ] Tooltip shows "No tasks to sort" when disabled
- [ ] Mobile responsive (320px-1920px)
- [ ] Touch targets ≥44px on mobile

**Manual Test**:
1. Load /priorities with 0 tasks
2. **VERIFY**: Sorting dropdown disabled with tooltip
3. Resize viewport to 320px
4. **VERIFY**: Dropdown fits in header, doesn't overflow
5. Add tasks, reload page
6. **VERIFY**: Dropdown enabled and functional

**Estimated Effort**: 1 hour

---

### T003 [P] [SLICE] Integration Test: Sorting Feedback Loop (Viewport Verification)

**User Value**: Automated verification that sorting feedback loop works without scrolling (0px scroll distance).

**TDD Workflow** (RED → GREEN → REFACTOR):

1. **Write Failing Test** (RED):
   - Integration test: `__tests__/integration/priorities-ux-feedback-loop.test.tsx` (NEW FILE)
     * Test: User changes sorting strategy, tasks re-order in same viewport
     * Mock window.scrollY, verify it remains 0
     * Use full page render (not isolated component)
     * Verify first task changes based on sorting strategy

2. **Test Should Pass** (GREEN):
   - After T001 and T002 complete, this test should pass
   - If fails, debug TaskList header integration

3. **Refactor** (if needed):
   - Add test data fixtures if mocking becomes complex
   - Extract helper functions for sorting verification

**Files Created**:
- `__tests__/integration/priorities-ux-feedback-loop.test.tsx` (~60 lines)

**Acceptance Criteria**:
- [ ] Test verifies tasks re-order on strategy change
- [ ] Test verifies window.scrollY === 0 (no scroll)
- [ ] Test passes with all 5 sorting strategies
- [ ] Test runs in <3 seconds

**Estimated Effort**: 1 hour

**Note**: Marked [P] because this test can be written in parallel with T001/T002 implementation.

---

### T004 [P] [SLICE] Update Existing Integration Tests for New Layout

**User Value**: Ensures existing sorting functionality works identically with new layout (no regressions).

**TDD Workflow**:

1. **Update Test Selectors**:
   - Modify: `__tests__/integration/sorting-strategies.test.tsx`
     * Update selector for sorting dropdown (now in TaskList header, not standalone)
     * Change from standalone section selector to header-embedded selector
     * Example: `getByRole('combobox', { name: /sort/i })` still works, but context changed

   - Modify: `__tests__/integration/strategic-prioritization.test.tsx`
     * Update layout structure assertions (2 sections, not 4)
     * Verify no standalone PrioritizationSummary or SortingStrategySelector sections

2. **Run Tests**:
   - Run: `pnpm test:run __tests__/integration/sorting-strategies.test.tsx`
   - Run: `pnpm test:run __tests__/integration/strategic-prioritization.test.tsx`
   - Fix any selector mismatches

3. **Verify All Pass**:
   - Run: `pnpm test:run` (full suite)
   - Coverage should maintain >80%

**Files Modified**:
- `__tests__/integration/sorting-strategies.test.tsx` (~10 lines modified)
- `__tests__/integration/strategic-prioritization.test.tsx` (~15 lines modified)

**Acceptance Criteria**:
- [ ] All 5 sorting strategies work identically
- [ ] Integration tests pass with new layout
- [ ] No false positives (tests pass for wrong reasons)
- [ ] Test coverage >80% maintained

**Estimated Effort**: 1 hour

**Note**: Marked [P] because this can be done in parallel after T001 completes.

---

**Checkpoint P1**: At this point, User Story 1 is complete. User can change sorting strategy and immediately see tasks re-order without scrolling. Demo-ready!

---

## Phase 2: User Story 2 - Consolidated Context Metadata (Priority: P2)

**Goal**: User sees completion time and quality status integrated into ContextCard, reducing visual clutter from 4 sections to 2.

**Why P2**: Eliminates standalone component that violates vertical slice protocol. Reduces cognitive load.

**User Story**: "As a user reviewing my prioritization, I want to see completion time and quality status integrated into the outcome context area, so I have all relevant metadata in one cohesive section instead of scattered standalone components."

**Vertical Slice Compliance**:
- ✅ SEE IT: Metadata (completion time, quality badge) visible in ContextCard
- ✅ DO IT: User recalculates priorities
- ✅ VERIFY IT: Metadata updates after recalculation

**Independent Test**: Load /priorities → Verify metadata in ContextCard → Recalculate → Verify metadata updates

---

### T005 [SLICE] ContextCard Metadata Integration (Completion Time + Quality Badge)

**User Value**: User sees prioritization metadata (when completed, quality status) in one cohesive context area, not scattered sections.

**TDD Workflow** (RED → GREEN → REFACTOR):

1. **Write Failing Tests** (RED):
   - Component test: `app/priorities/components/__tests__/ContextCard.test.tsx`
     * Renders completion time with `formatDistanceToNow` (e.g., "2 min ago")
     * Renders quality check badge (green "✓ Passed" or yellow "⚠ Review")
     * Gracefully handles missing metadata (no error, no empty gaps)
     * Metadata wraps cleanly on mobile (375px)

2. **Implement Minimal Code** (GREEN):
   - Modify: `app/priorities/components/ContextCard.tsx`
     * Add props: `completionTime?: Date`, `qualityCheckPassed?: boolean`
     * Import `formatDistanceToNow` from `date-fns`
     * Render metadata section in CardContent after reflections count:
       ```tsx
       {(completionTime || qualityCheckPassed !== undefined) && (
         <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
           {completionTime && (
             <span>Completed {formatDistanceToNow(completionTime)} ago</span>
           )}
           {qualityCheckPassed !== undefined && (
             <Badge variant={qualityCheckPassed ? "default" : "secondary"}>
               Quality check: {qualityCheckPassed ? "✓ Passed" : "⚠ Review"}
             </Badge>
           )}
         </div>
       )}
       ```
     * Use design system: `text-sm text-muted-foreground`, Badge variants

3. **Update Page Component**:
   - Modify: `app/priorities/page.tsx`
     * Remove standalone `<PrioritizationSummary .../>` section (lines ~2383-2387)
     * Pass `completionTime={completedAt ? new Date(completedAt) : undefined}` to ContextCard
     * Pass `qualityCheckPassed={baseline_quality_threshold_met}` to ContextCard
     * Ensure graceful undefined handling (don't pass `null`)

4. **Verify Tests Pass** (GREEN):
   - Run: `pnpm test:run app/priorities/components/__tests__/ContextCard.test.tsx`
   - Run: `pnpm test:run` to ensure no regressions

5. **Refactor** (if needed):
   - If ContextCard becomes overcrowded, move metadata to TaskList header (fallback plan)
   - Optimize Badge rendering if needed

**Files Modified**:
- `app/priorities/components/ContextCard.tsx` (~20 lines added)
- `app/priorities/page.tsx` (~10 lines removed, ~3 lines modified)
- `app/priorities/components/__tests__/ContextCard.test.tsx` (~40 lines added)

**Acceptance Criteria**:
- [ ] Completion time displays with `formatDistanceToNow` format
- [ ] Quality check badge shows green (passed) or yellow (review) variant
- [ ] Metadata gracefully absent when undefined (no errors)
- [ ] Metadata wraps cleanly on mobile (375px)
- [ ] No standalone PrioritizationSummary section
- [ ] All tests pass

**Manual Test** (from quickstart.md):
1. Run prioritization (recalculate button)
2. Wait for completion
3. **VERIFY**: ContextCard shows "Completed X min ago"
4. **VERIFY**: ContextCard shows quality check badge (green ✓ or yellow ⚠)
5. **VERIFY**: No standalone PrioritizationSummary section exists
6. Resize to 375px
7. **VERIFY**: Metadata wraps cleanly, no horizontal scroll

**Estimated Effort**: 2 hours

---

### T006 [SLICE] Deprecate PrioritizationSummary Component

**User Value**: Cleanup deprecated component to reduce codebase complexity and prevent accidental usage.

**Workflow**:

1. **Mark as Deprecated**:
   - Modify: `app/priorities/components/PrioritizationSummary.tsx`
     * Add JSDoc comment:
       ```tsx
       /**
        * @deprecated This component is deprecated as of 2025-11-25.
        * Use ContextCard with completionTime and qualityCheckPassed props instead.
        * This file will be removed in a future cleanup.
        */
       ```
     * Keep file intact (don't delete) for backward compatibility

2. **Update Tests**:
   - Modify: `app/priorities/components/__tests__/PrioritizationSummary.test.tsx`
     * Add comment indicating tests are for deprecated component
     * Keep tests passing to prevent accidental breakage
     * Mark file for future deletion

3. **Verify No Usage**:
   - Search codebase: `grep -r "PrioritizationSummary" app/` (should only find deprecated file)
   - Ensure `page.tsx` no longer imports or uses component

**Files Modified**:
- `app/priorities/components/PrioritizationSummary.tsx` (~5 lines added - deprecation notice)
- `app/priorities/components/__tests__/PrioritizationSummary.test.tsx` (~3 lines added - comment)

**Acceptance Criteria**:
- [ ] Component marked with @deprecated JSDoc
- [ ] No active usage in codebase (only deprecated file remains)
- [ ] Tests still pass (component functional but deprecated)
- [ ] TypeScript shows deprecation warning if imported

**Estimated Effort**: 15 minutes

---

**Checkpoint P2**: At this point, User Story 2 is complete. User sees metadata in ContextCard, page has 2 cohesive sections (Context + Tasks). Demo-ready!

---

## Phase 3: User Story 3 - Streamlined Interface (Priority: P3)

**Goal**: User loads /priorities and sees clean interface without debug clutter. ReasoningChain available via `?debug=true` for troubleshooting.

**Why P3**: Polish improvement. Reduces visual noise without fixing broken workflow.

**User Story**: "As a user focused on actionable tasks, I want the ReasoningChain debug component removed from the primary interface, so I have a cleaner, more focused view without low-value observability cluttering the page."

**Vertical Slice Compliance**:
- ✅ SEE IT: Clean page without ReasoningChain (default)
- ✅ DO IT: User loads page or adds `?debug=true`
- ✅ VERIFY IT: ReasoningChain hidden/shown based on query parameter

**Independent Test**: Load /priorities → Verify no ReasoningChain → Load /priorities?debug=true → Verify ReasoningChain appears

---

### T007 [SLICE] ReasoningChain Debug Mode (Query Parameter Visibility Control)

**User Value**: User sees clean interface by default, can enable debug mode with `?debug=true` for troubleshooting.

**TDD Workflow** (RED → GREEN → REFACTOR):

1. **Write Failing Tests** (RED):
   - Component test: `app/priorities/components/__tests__/ReasoningChain.test.tsx`
     * Returns `null` when `debugMode={false}` or `undefined`
     * Renders Card when `debugMode={true}`
     * Displays chain-of-thought steps when `debugMode={true}` and iterations exist
     * Shows "No iterations (fast path)" when `debugMode={true}` and iterations === 0

2. **Implement Minimal Code** (GREEN):
   - Modify: `app/priorities/components/ReasoningChain.tsx`
     * Add prop: `debugMode?: boolean` (default `false`)
     * Add early return:
       ```tsx
       if (!debugMode) return null;
       ```
     * Preserve all existing rendering logic for debug mode

3. **Update Page Component**:
   - Modify: `app/priorities/page.tsx`
     * Import `useSearchParams` from `next/navigation`
     * Read debug param: `const searchParams = useSearchParams(); const debugMode = searchParams.get('debug') === 'true';`
     * Pass `debugMode` to ReasoningChain: `<ReasoningChain debugMode={debugMode} ... />`
     * Remove standalone section wrapper (component now self-controls visibility)

4. **Verify Tests Pass** (GREEN):
   - Run: `pnpm test:run app/priorities/components/__tests__/ReasoningChain.test.tsx`
   - Run: `pnpm test:run` to ensure no regressions

5. **Manual Testing**:
   - Test URL: `/priorities` → ReasoningChain not visible
   - Test URL: `/priorities?debug=true` → ReasoningChain visible at bottom
   - Test URL: `/priorities?debug=false` → ReasoningChain not visible

**Files Modified**:
- `app/priorities/components/ReasoningChain.tsx` (~5 lines added)
- `app/priorities/page.tsx` (~5 lines modified)
- `app/priorities/components/__tests__/ReasoningChain.test.tsx` (~30 lines added)

**Acceptance Criteria**:
- [ ] ReasoningChain hidden when debugMode false/undefined
- [ ] ReasoningChain visible when debugMode true
- [ ] Query parameter `?debug=true` enables debug mode
- [ ] Chain-of-thought content displays correctly in debug mode
- [ ] "No iterations" message shows when iterations === 0
- [ ] All tests pass

**Manual Test** (from quickstart.md):
1. Load `/priorities` without query params
2. **VERIFY**: ReasoningChain not visible
3. Load `/priorities?debug=true`
4. **VERIFY**: ReasoningChain appears at bottom in collapsed Card
5. Expand ReasoningChain
6. **VERIFY**: Chain-of-thought steps display correctly (or "No iterations" message)

**Estimated Effort**: 1 hour

---

**Checkpoint P3**: At this point, User Story 3 is complete. User sees clean interface by default, can enable debug mode if needed. Demo-ready!

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and documentation.

---

### T008 [SLICE] Manual Testing Validation (Quickstart Guide)

**User Value**: Ensures all 3 user stories work end-to-end in real browser environment.

**Workflow**:

1. **Run All Quickstart Scenarios**:
   - Follow: `specs/001-priorities-page-ux/quickstart.md`
   - Test Scenario 1: Immediate Sorting Feedback (P1)
   - Test Scenario 2: Consolidated Metadata (P2)
   - Test Scenario 3: Streamlined Interface (P3)
   - Edge Case Testing (9 scenarios)
   - Mobile Responsiveness (4 viewports: 320px, 375px, 768px, 1024px)

2. **Document Results**:
   - Create: `specs/001-priorities-page-ux/quickstart-test-results.md`
   - Check all boxes in acceptance checklist
   - Capture screenshots: before-after-sorting.png, mobile-375px.png, debug-mode.png

3. **Fix Any Issues**:
   - If any scenario fails, debug and fix
   - Re-run affected tests
   - Update implementation or tests as needed

**Files Created**:
- `specs/001-priorities-page-ux/quickstart-test-results.md` (checklist with timestamps)
- `specs/001-priorities-page-ux/screenshots/` (optional: before/after images)

**Acceptance Criteria**:
- [ ] All P1 scenarios pass
- [ ] All P2 scenarios pass
- [ ] All P3 scenarios pass
- [ ] All 9 edge cases handled correctly
- [ ] All 4 mobile viewports responsive
- [ ] No console errors or warnings
- [ ] Performance <100ms render time (React DevTools)

**Estimated Effort**: 1 hour

---

### T009 [P] [SLICE] Code Review and Quality Check

**User Value**: Ensures code quality, maintainability, and adherence to standards before merge.

**Workflow**:

1. **Run Code Quality Tools**:
   - Run: `pnpm lint` (ESLint)
   - Run: `pnpm type-check` (TypeScript)
   - Fix any linting or type errors

2. **Run Full Test Suite**:
   - Run: `pnpm test:run` (all tests)
   - Verify coverage >80%: `pnpm test:run --coverage`
   - Fix any failing tests

3. **Code Review Agent**:
   - Use `code-reviewer` agent (per constitution.md)
   - Review all modified files
   - Check design system compliance
   - Verify mobile responsiveness patterns (Phase 8)
   - Ensure WCAG AA contrast (4.5:1)

4. **Performance Check**:
   - Open React DevTools Profiler
   - Record sorting strategy change
   - Verify render time <100ms
   - Use React.memo if needed

**Acceptance Criteria**:
- [ ] No ESLint warnings
- [ ] No TypeScript errors
- [ ] All tests pass
- [ ] Test coverage >80%
- [ ] code-reviewer agent approval
- [ ] Design system compliance verified
- [ ] Mobile responsive (320px-1920px)
- [ ] WCAG AA contrast maintained
- [ ] Performance <100ms render time

**Estimated Effort**: 1 hour

**Note**: Marked [P] because this can run in parallel with T008.

---

### T010 [SLICE] Final Integration and Deployment Readiness

**User Value**: Ensures all changes integrate cleanly and feature is ready for deployment.

**Workflow**:

1. **Verify All Slices Integrated**:
   - Load `/priorities` in browser
   - Verify P1: Sorting in header, immediate feedback
   - Verify P2: Metadata in ContextCard, no standalone sections
   - Verify P3: No ReasoningChain by default, visible with `?debug=true`
   - Verify layout: 2 cohesive sections (Context + Tasks)

2. **Run Full Test Suite** (final pass):
   - Run: `pnpm test:run`
   - All tests should pass (unit + integration)
   - No skipped or disabled tests

3. **Build Production Bundle**:
   - Run: `pnpm build`
   - Verify no build errors
   - Check bundle size (should be negligible change, ~+0.5KB)

4. **Create Before/After Comparison**:
   - Screenshot: Before (4 scattered sections)
   - Screenshot: After (2 cohesive sections)
   - Document: Scroll distance before (500px) vs after (0px)

**Acceptance Criteria**:
- [ ] All 3 user stories functional
- [ ] All tests pass (unit + integration)
- [ ] Production build succeeds
- [ ] No bundle size regressions
- [ ] Before/after screenshots captured
- [ ] Ready for merge to main branch

**Estimated Effort**: 30 minutes

---

**Final Checkpoint**: Feature complete! All user stories delivered. Ready for deployment.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (P1)**: Can start immediately - No dependencies
  - T001 → T002 (sequential - T002 modifies T001 output)
  - T003, T004 (parallel with T001/T002 - independent test files)
- **Phase 2 (P2)**: Can start after Phase 1 OR in parallel (different files)
  - T005 → T006 (sequential - T006 deprecates what T005 replaces)
- **Phase 3 (P3)**: Can start after Phase 1 OR in parallel (different files)
  - T007 (independent)
- **Phase 4 (Polish)**: Depends on all user stories complete (T001-T007)
  - T008, T009 (parallel - different validation types)
  - T010 (sequential after T008, T009)

### Parallel Opportunities

**Maximum Parallelism** (if team capacity allows):
1. **After Foundation**: Start all 3 user stories in parallel
   - Team A: Phase 1 (T001, T002, T003, T004)
   - Team B: Phase 2 (T005, T006)
   - Team C: Phase 3 (T007)
2. **After User Stories**: Run polish in parallel
   - Team A: T008 (manual testing)
   - Team B: T009 (code review)
   - Everyone: T010 (final integration)

**Sequential MVP** (single developer):
1. Complete Phase 1 (T001 → T002 → T003 → T004)
2. Complete Phase 2 (T005 → T006)
3. Complete Phase 3 (T007)
4. Complete Phase 4 (T008 → T009 → T010)

### File Conflicts (Must Be Sequential)

**Same File Modifications**:
- `app/priorities/page.tsx` - Modified by T001, T005, T007 (must be sequential)
- `app/priorities/components/TaskList.tsx` - Modified by T001, T002 (T002 depends on T001)

**No File Conflicts** (Can Be Parallel):
- T003 (new integration test file)
- T004 (existing integration test files, different from T003)
- T005 (ContextCard.tsx, different from TaskList.tsx)
- T007 (ReasoningChain.tsx, different from all others)

---

## Implementation Strategy

### MVP First (P1 Only)

1. Complete T001: TaskList Header Integration
2. Complete T002: Compact Variant
3. Complete T003: Integration Test
4. Complete T004: Update Existing Tests
5. **STOP and VALIDATE**: Test P1 independently (sorting feedback loop)
6. Deploy/demo if ready (or continue to P2)

### Incremental Delivery (All Priorities)

1. Complete Phase 1 (P1) → Test → Demo
2. Complete Phase 2 (P2) → Test → Demo
3. Complete Phase 3 (P3) → Test → Demo
4. Complete Phase 4 (Polish) → Final validation → Deployment

### Parallel Team Strategy (3 Developers)

1. **Day 1**:
   - Dev A: T001, T002 (TaskList + SortingStrategySelector)
   - Dev B: T005, T006 (ContextCard + deprecation)
   - Dev C: T007 (ReasoningChain debug mode)
2. **Day 2**:
   - Dev A: T003, T004 (integration tests)
   - Dev B: T008 (manual testing)
   - Dev C: T009 (code review)
3. **Day 3**:
   - All: T010 (final integration)

---

## Estimated Total Effort

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Phase 1 (P1) | T001-T004 | 5-6 hours |
| Phase 2 (P2) | T005-T006 | 2-3 hours |
| Phase 3 (P3) | T007 | 1 hour |
| Phase 4 (Polish) | T008-T010 | 2-3 hours |
| **Total** | **10 tasks** | **10-13 hours** |

**Aligns with appetite**: 3-day batch (8-11 hours from plan.md)

---

## Notes

- [P] tasks = different files, can run in parallel
- [SLICE] = complete vertical slice (UI + tests + user outcome)
- Each task follows TDD workflow: RED → GREEN → REFACTOR
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Run `pnpm test:run` after each task to ensure no regressions
- Use quickstart.md for manual validation after automation
- Frontend-only refactoring: No backend, no database, no API changes
- Pure UI reorganization: Preserves all existing sorting logic
- Mobile-first: Follow Phase 8 patterns (`h-11 sm:h-9`, 44px touch targets)
- Design system: Use existing tokens (`bg-layer-*`, `shadow-2layer-*`)
- Performance target: <100ms render time (monitor with React DevTools)

---

## Success Metrics (from spec.md)

**Before → After**:
- Scroll distance to verify sorting: ~500px → 0px ✅
- Standalone sections: 4 → 2 ✅
- Time to understand sorting effect: ~5-10s → <2s ✅
- User complaints about ReasoningChain: Present → Zero ✅
- Mobile responsiveness: Maintained (320px-1920px) ✅

**Feature Complete When**:
- [ ] All 10 tasks (T001-T010) completed
- [ ] All user stories (P1, P2, P3) functional
- [ ] All tests passing (>80% coverage)
- [ ] Manual testing validated (quickstart.md)
- [ ] Code review approved (code-reviewer agent)
- [ ] Production build succeeds
- [ ] Demo-ready (can show to non-technical stakeholder)
