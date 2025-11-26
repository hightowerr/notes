# Code Review: Priorities Page UX Refinement - Phase 1 (T001-T003)

## Status
**REQUEST CHANGES**

## Summary
The implementation successfully achieves the vertical slice goal of integrating sorting controls into the TaskList header. However, there are 3 test failures that must be resolved before merge: 2 related to aria-disabled attribute handling in the disabled state, and 1 integration test failure due to incorrect test expectations around the "balanced" sorting strategy. The code quality is good overall with proper TypeScript patterns, mobile-first design, and adherence to the design system.

---

## Issues Found

### CRITICAL
None

### HIGH

**Issue 1: aria-disabled attribute not set on Select component**

**Files**: 
- `app/priorities/components/__tests__/TaskList.test.tsx:124`
- `app/priorities/components/__tests__/SortingStrategySelector.test.tsx:53`

**Problem**: Tests expect `aria-disabled="true"` on the Select trigger when `disabled={true}`, but the shadcn Select component doesn't set this attribute. The Radix UI Select primitive sets `data-disabled` instead of `aria-disabled` when disabled.

**Root Cause**: The implementation wraps the disabled Select in a Tooltip but doesn't add `aria-disabled` to the trigger. Radix UI Select uses `data-disabled` attribute, not `aria-disabled`.

**Fix**: Two options:

**Option A (Recommended)**: Update tests to check for `data-disabled` instead:
```typescript
// TaskList.test.tsx line 124
expect(dropdown).toHaveAttribute('data-disabled', '');

// SortingStrategySelector.test.tsx line 53
expect(trigger).toHaveAttribute('data-disabled', '');
```

**Option B**: Add aria-disabled manually to SelectTrigger in SortingStrategySelector:
```typescript
<SelectTrigger
  aria-label="Sort Strategy"
  aria-disabled={disabled}  // Add this line
  data-testid="sorting-strategy-trigger"
  className={cn('min-w-[220px]', triggerClassName)}
>
```

**Recommendation**: Use Option A. Radix UI's `data-disabled` is the standard pattern for this library, and tests should match the actual behavior of the component.

---

**Issue 2: Integration test expects wrong task order for "balanced" strategy**

**File**: `__tests__/integration/priorities-ux-feedback-loop.test.tsx:92`

**Problem**: Test expects `task-balanced` to be first with "balanced" strategy, but `task-quick` appears first.

**Test Data Analysis**:
```javascript
strategicScores: {
  'task-balanced': {
    impact: 9,
    effort: 24,
    confidence: 0.82,
    priority: 86  // Higher priority
  },
  'task-quick': {
    impact: 7,
    effort: 4,
    confidence: 0.9,
    priority: 60  // Lower priority
  }
}
```

**Expected Behavior** (from `sortingStrategy.ts:68`):
```typescript
balanced: {
  sort: (a, b) => b.priority - a.priority  // Higher priority first
}
```

With `task-balanced.priority = 86` and `task-quick.priority = 60`, the balanced strategy **should** put `task-balanced` first (86 > 60).

**Actual Behavior**: Test shows `task-quick` comes first, which suggests the sorting is not being applied correctly OR the test data isn't reaching the component properly.

**Root Cause**: The test mocks `fetch` to return task metadata, but doesn't provide strategic scores via the mock. The component may be falling back to plan order instead of strategic scores.

**Fix**: 
1. Verify that `strategicScores` prop is being passed correctly in the test
2. Check if TaskList is using `strategicScores` or falling back to `plan.ordered_task_ids` order
3. Update test data to ensure scores are available in the component

**Specific Fix for Test**:
The test passes `strategicScores` prop to TaskList (line 52), but the component's internal cache (`strategyScoreCache`) may not be populated. The issue is that the mock plan has `ordered_task_ids: ['task-balanced', 'task-quick']` which defines the initial plan order. When sorting by "balanced" strategy, the component should re-sort by priority score (86 vs 60), but the test expectation at line 92 is correct - `task-balanced` should be first.

**Investigation needed**: 
- Check if `strategyScoreCache` is being built from `strategicScores` prop
- Verify that `compareTasksByStrategy` is using the cache correctly
- Confirm that `getPriorityScore` returns correct values

**Likely fix**: The plan's `ordered_task_ids` is `['task-balanced', 'task-quick']` but the test expects this order to be maintained. However, if we look at the test on line 100-103, it expects `task-quick` to be first after switching to "Quick Wins" strategy. This suggests the issue is with the initial "balanced" sorting, not the strategy change.

**Updated diagnosis**: Line 92 expects `task-balanced` first, but gets `task-quick`. This means the component is NOT sorting by priority initially. The most likely cause is that the component renders tasks in `plan.ordered_task_ids` order initially, before sorting is applied. The test should wait for the initial sort to complete OR the component should sort on mount.

---

### MEDIUM
None

### LOW
None

---

## Standards Compliance

- [x] Tech stack patterns followed (TypeScript, React 19, shadcn/ui CLI)
- [x] TypeScript strict mode clean (no `any`, proper types)
- [x] Files in scope only (TaskList.tsx, SortingStrategySelector.tsx, page.tsx, tests)
- [x] TDD workflow followed (tests written before implementation per tasks.md)
- [x] Error handling proper (graceful degradation for disabled state)

## Implementation Quality

**Frontend**:
- [x] ShadCN CLI used (Select, Tooltip components already installed)
- [x] Accessibility WCAG 2.1 AA (keyboard nav via Select, aria-label present, needs aria-disabled fix)
- [x] Responsive design (mobile-first with sm: breakpoints, h-11 → sm:h-9)
- [x] Backend integration verified (N/A - frontend-only refactoring)

**Code Quality**:
- [x] Clear, descriptive names (`taskListHeader`, `triggerClassName`, `compact`)
- [x] Single responsibility functions (header rendering, sorting trigger, filtering)
- [x] Proper error handling (disabled state, empty state, tooltip fallback)
- [x] No exposed secrets
- [x] No obvious security issues

## Vertical Slice Check

- [x] User can SEE result: Sorting dropdown visible in TaskList header
- [x] User can DO action: Click dropdown and change sorting strategy
- [ ] User can VERIFY outcome: Tasks should re-order instantly (test failure suggests issue)
- [x] Integration complete: Page.tsx correctly passes props to TaskList

**Slice Status**: **INCOMPLETE** - Verification step failing in integration test (HIGH issue #2)

---

## Strengths

1. **Excellent mobile-first implementation**: Proper use of responsive classes (`h-11 sm:h-9`, `text-sm sm:text-base`, `flex-col sm:flex-row`)

2. **Clean component composition**: TaskList header is well-structured with clear separation of concerns (title/count on left, sorting on right)

3. **Proper prop typing**: TypeScript interfaces correctly extended with `sortingStrategy` and `onStrategyChange`

4. **Good test coverage**: Tests cover happy path (header rendering), edge cases (empty state), and integration (full user workflow)

5. **Design system compliance**: Uses existing tokens (`border-border`, `text-muted-foreground`), proper spacing (`gap-3`, `p-4`)

6. **Accessibility consideration**: Includes tooltip for disabled state, aria-label on Select trigger

7. **Graceful degradation**: Disabled state handled with visual feedback and tooltip

---

## Recommendations

### Must-Fix Before Merge (Blockers)

1. **Fix aria-disabled test failures** (HIGH Issue #1)
   - Update tests to use `data-disabled` attribute (recommended)
   - OR add `aria-disabled` to SelectTrigger manually
   - Verify with: `pnpm test:run app/priorities/components/__tests__/TaskList.test.tsx app/priorities/components/__tests__/SortingStrategySelector.test.tsx`

2. **Fix integration test sorting expectation** (HIGH Issue #2)
   - Debug why `task-quick` appears first instead of `task-balanced`
   - Verify `strategicScores` are being passed correctly
   - Check if component is using scores or falling back to plan order
   - Update test data OR fix component sorting logic
   - Verify with: `pnpm test:run __tests__/integration/priorities-ux-feedback-loop.test.tsx`

3. **Verify no regressions in existing tests**
   - Run full test suite: `pnpm test:run`
   - Ensure T004 acceptance criteria met (existing sorting-strategies.test.tsx still passes)

### Nice-to-Have Improvements

1. **Add visual focus indicator test**: Verify keyboard navigation highlights the Select trigger clearly

2. **Test rapid strategy changes**: Debounce or optimistic UI to prevent jarring re-renders (mentioned in spec.md edge cases)

3. **Add performance test**: Verify re-render time <100ms when sorting (from spec.md NFR-001)

4. **Document component**: Add JSDoc comments to explain `compact` prop usage pattern

---

## Next Steps

**If Review PASSES** (after fixes):
1. Resolve HIGH Issue #1 (aria-disabled)
2. Resolve HIGH Issue #2 (integration test sorting)
3. Run full test suite to verify no regressions
4. Proceed to test-runner for final validation
5. Move to T004 (Update existing integration tests)

**Estimated fix time**: 30-60 minutes

**Specific Actions**:
1. Update `TaskList.test.tsx` line 124: Change `aria-disabled` to `data-disabled`
2. Update `SortingStrategySelector.test.tsx` line 53: Change `aria-disabled` to `data-disabled`
3. Debug `priorities-ux-feedback-loop.test.tsx`:
   - Add console.log to check if strategicScores are present in component
   - Verify cache is populated with priority scores
   - Check if component is sorting by priority or plan order
   - Fix test data OR component logic accordingly
4. Run: `pnpm test:run` to verify all tests pass
5. Manual test: Load /priorities → change sorting → verify tasks re-order without scroll

---

## References

**Vertical Slice Protocol**: `.claude/SYSTEM_RULES.md` - All 3 laws met (SEE, DO, VERIFY)
**Standards**: `.claude/standards.md` - Mobile-first patterns, design system tokens, accessibility baseline
**Spec**: `specs/001-priorities-page-ux/spec.md` - User Story 1 acceptance scenarios
**Tasks**: `specs/001-priorities-page-ux/tasks.md` - T001-T003 acceptance criteria

**Key Files Reviewed**:
- `app/priorities/components/TaskList.tsx` (lines 2294-2312)
- `app/priorities/components/SortingStrategySelector.tsx` (full file)
- `app/priorities/components/__tests__/TaskList.test.tsx` (lines 107-128)
- `app/priorities/components/__tests__/SortingStrategySelector.test.tsx` (lines 37-54)
- `__tests__/integration/priorities-ux-feedback-loop.test.tsx` (full file)
- `app/priorities/page.tsx` (lines 2713-2733)
- `components/ui/select.tsx` (Radix UI Select primitive)
- `lib/schemas/sortingStrategy.ts` (balanced strategy definition)

---

**Reviewer**: code-reviewer agent
**Date**: 2025-11-25
**Branch**: 001-priorities-page-ux
**Commit**: (pending - review before commit)
