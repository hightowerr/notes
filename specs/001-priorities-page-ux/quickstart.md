# Quickstart: Priorities Page UX Refinement Testing

**Feature**: Priorities Page UX Refinement
**Branch**: `001-priorities-page-ux`
**Date**: 2025-11-25

## Prerequisites

1. **Development server running**: `pnpm dev` on port 3000
2. **Test data available**: At least 10 tasks with varied strategic scores
3. **Active outcome**: User has created an outcome statement
4. **Recent prioritization**: Agent session completed within last 5 minutes
5. **Browser DevTools**: For viewport testing (Chrome/Safari/Firefox)

## Quick Reference

| Test Scenario | Priority | Time | Complexity |
|---------------|----------|------|------------|
| Immediate Sorting Feedback | P1 | 5 min | Low |
| Consolidated Metadata | P2 | 3 min | Low |
| Streamlined Interface | P3 | 2 min | Low |
| Edge Cases | All | 10 min | Medium |
| Mobile Responsiveness | All | 5 min | Medium |

**Total Manual Testing Time**: ~25 minutes

## Test Scenario 1: Immediate Sorting Feedback (P1)

**Objective**: Verify sorting strategy changes trigger immediate task re-ordering without scrolling.

### Setup

1. Navigate to `http://localhost:3000/priorities`
2. Ensure at least 10 tasks are displayed
3. Note current browser viewport (should be 1920x1080 for desktop testing)

### Test Steps

1. **Locate sorting dropdown**
   - [ ] Find TaskList component header
   - [ ] Verify sorting dropdown is right-aligned in header
   - [ ] Verify current strategy is displayed (e.g., "Strategic Impact")

2. **Note initial task order**
   - [ ] Record first 3 task titles in order
   - [ ] Take screenshot (optional: before-sorting.png)

3. **Change sorting strategy**
   - [ ] Click sorting dropdown
   - [ ] Select "Effort Weighted" from options
   - [ ] Observe task list behavior

### Expected Results

- [ ] **Immediate re-order**: Tasks rearrange instantly (no delay)
- [ ] **No scroll required**: Dropdown and task list both visible in viewport
- [ ] **Correct sorting**: First 3 tasks now sorted by effort/impact ratio
- [ ] **Visual feedback**: No jarring flashes or layout shifts

### Verification

```bash
# Check console for errors (should be none)
# Verify scroll position unchanged
console.log(window.scrollY);  // Should be 0 or initial position
```

### Pass/Fail Criteria

**PASS**: Tasks re-order immediately, sorting dropdown and tasks visible in same viewport
**FAIL**: User must scroll to see task re-ordering, or delay >100ms before re-render

---

## Test Scenario 2: Consolidated Metadata (P2)

**Objective**: Verify completion time and quality check display correctly in ContextCard.

### Setup

1. Ensure recent prioritization completed (within last 5 min)
2. Verify `agent_sessions` table has entry with `completed_at` and `baseline_quality_threshold_met`
3. Navigate to `http://localhost:3000/priorities`

### Test Steps

1. **Locate ContextCard**
   - [ ] Find ContextCard component (top of page)
   - [ ] Verify outcome statement is displayed
   - [ ] Scroll to see full ContextCard content

2. **Verify completion time**
   - [ ] Look for "Completed X min ago" text
   - [ ] Verify time is approximately correct (e.g., "2 min ago" if completed 2 min ago)
   - [ ] Check text color is `text-muted-foreground` (gray)

3. **Verify quality check badge**
   - [ ] Look for "Quality check:" badge
   - [ ] If passed: Badge should be green with "✓ Passed"
   - [ ] If failed: Badge should be yellow with "⚠ Review"
   - [ ] Verify badge is positioned next to completion time

4. **Verify no standalone PrioritizationSummary**
   - [ ] Scroll entire page
   - [ ] Confirm no separate "Prioritization Summary" section exists
   - [ ] Metadata is only in ContextCard

### Expected Results

- [ ] **Completion time visible**: Displays relative time (e.g., "2 min ago")
- [ ] **Quality badge visible**: Shows pass/fail status with appropriate color
- [ ] **Clean integration**: Metadata feels natural in ContextCard layout
- [ ] **No standalone section**: PrioritizationSummary component not rendered

### Edge Case: No metadata

1. Clear recent prioritization (delete agent_session)
2. Reload page
3. **Expected**: No completion time or quality badge displayed (graceful absence)
4. **Expected**: ContextCard still renders outcome and reflections count

### Pass/Fail Criteria

**PASS**: Metadata displays correctly in ContextCard, no standalone PrioritizationSummary
**FAIL**: Metadata missing, incorrect format, or PrioritizationSummary still visible

---

## Test Scenario 3: Streamlined Interface (P3)

**Objective**: Verify ReasoningChain hidden by default, visible with `?debug=true`.

### Setup

1. Navigate to `http://localhost:3000/priorities`
2. Ensure agent session has chain-of-thought data (iterations > 0)

### Test Steps (Default Mode)

1. **Load page without debug parameter**
   - [ ] URL: `http://localhost:3000/priorities`
   - [ ] Scroll entire page from top to bottom
   - [ ] Confirm ReasoningChain component not visible

2. **Verify clean layout**
   - [ ] Only 2 main sections: ContextCard + TaskList
   - [ ] No debugging information visible
   - [ ] No collapsible "Reasoning Chain" card

### Test Steps (Debug Mode)

1. **Load page with debug parameter**
   - [ ] URL: `http://localhost:3000/priorities?debug=true`
   - [ ] Scroll to bottom of page
   - [ ] Locate ReasoningChain component

2. **Verify debug display**
   - [ ] ReasoningChain appears in collapsed Card
   - [ ] Card title is "Reasoning Chain" or similar
   - [ ] Click to expand card

3. **Verify chain-of-thought content**
   - [ ] If iterations exist: Steps displayed in list/timeline format
   - [ ] If no iterations: "No iterations (fast path)" message
   - [ ] Content is readable and properly formatted

4. **Toggle debug mode**
   - [ ] Remove `?debug=true` from URL, reload
   - [ ] **Expected**: ReasoningChain disappears
   - [ ] Add `?debug=true` back, reload
   - [ ] **Expected**: ReasoningChain reappears

### Expected Results

- [ ] **Hidden by default**: No ReasoningChain without `?debug=true`
- [ ] **Visible in debug**: ReasoningChain appears at bottom with `?debug=true`
- [ ] **Content preserved**: Chain-of-thought steps display correctly
- [ ] **Toggle works**: Adding/removing param shows/hides component

### Pass/Fail Criteria

**PASS**: ReasoningChain hidden by default, visible only with `?debug=true` query param
**FAIL**: ReasoningChain visible without param, or not visible with param

---

## Edge Case Testing

### Edge Case 1: Zero Tasks

**Setup**:
1. Clear all tasks from `task_embeddings` table
2. Reload `/priorities` page

**Expected Behavior**:
- [ ] Sorting dropdown visible but disabled
- [ ] Tooltip shows "No tasks to sort" on hover
- [ ] TaskList header displays "0 tasks"
- [ ] No task rows rendered (empty state)

### Edge Case 2: No Outcome

**Setup**:
1. Delete active outcome from `user_outcomes` table
2. Reload `/priorities` page

**Expected Behavior**:
- [ ] ContextCard renders without outcome
- [ ] Metadata section not displayed (no completion time, no quality badge)
- [ ] Recalculate button disabled or hidden
- [ ] No errors in console

### Edge Case 3: Missing Metadata Fields

**Setup**:
1. Set `completed_at = null` in `agent_sessions` table
2. Reload `/priorities` page

**Expected Behavior**:
- [ ] Only quality check badge displayed (if `baseline_quality_threshold_met` exists)
- [ ] No completion time text
- [ ] Layout remains clean (no empty gaps)

**Setup**:
1. Set `baseline_quality_threshold_met = null` in `agent_sessions` table
2. Reload `/priorities` page

**Expected Behavior**:
- [ ] Only completion time displayed (if `completed_at` exists)
- [ ] No quality check badge
- [ ] Layout remains clean

### Edge Case 4: Rapid Sorting Changes

**Setup**:
1. Load `/priorities` with 20+ tasks
2. Rapidly change sorting strategies (5 times in 3 seconds)

**Expected Behavior**:
- [ ] No jarring re-renders or flashing
- [ ] Final strategy reflects last selection
- [ ] Tasks ordered correctly by final strategy
- [ ] No console errors or warnings
- [ ] Performance remains smooth (<100ms per re-render)

### Edge Case 5: Long Outcome Text

**Setup**:
1. Create outcome with 300+ character `assembled_text`
2. Reload `/priorities` page

**Expected Behavior**:
- [ ] Outcome text wraps cleanly in ContextCard
- [ ] Metadata displays below outcome without overlap
- [ ] Card height adjusts appropriately
- [ ] No horizontal scrolling

---

## Mobile Responsiveness Testing

### Viewport: 320px (iPhone SE 1st gen)

**Setup**:
1. Open Chrome DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select "iPhone SE" preset (320x568)
4. Reload page

**Expected Behavior**:
- [ ] **TaskList header stacks**: Title on top row, sorting + count on second row
- [ ] **Sorting dropdown readable**: Text not truncated, tap target ≥44px
- [ ] **ContextCard metadata wraps**: No horizontal scrolling
- [ ] **No layout overflow**: All content fits in 320px width

### Viewport: 375px (iPhone SE 3rd gen, most common)

**Setup**:
1. Select "iPhone 13 Pro" preset (375x812) in DevTools

**Expected Behavior**:
- [ ] **Comfortable spacing**: Elements not cramped
- [ ] **Touch targets**: All buttons ≥44px height
- [ ] **Readable text**: Font sizes appropriate (text-base or larger)
- [ ] **Quality badge visible**: Not cut off or overlapping

### Viewport: 768px (iPad Mini portrait)

**Setup**:
1. Select "iPad Mini" preset (768x1024) in DevTools

**Expected Behavior**:
- [ ] **Single-column layout maintained**: TaskList full width
- [ ] **Sorting control visible**: Not hidden due to breakpoint
- [ ] **No horizontal scrolling**: Page width fits 768px
- [ ] **Metadata displays cleanly**: No wrapping issues

### Viewport: 1024px+ (Desktop)

**Setup**:
1. Select "Responsive" mode, set to 1920x1080

**Expected Behavior**:
- [ ] **Sorting dropdown compact**: Uses `h-9` (36px) on desktop
- [ ] **Text sizes reduced**: Uses `text-sm` (14px) on desktop
- [ ] **Optimal spacing**: Not too sparse, good use of space
- [ ] **All features functional**: No regressions from mobile changes

---

## Acceptance Checklist

After completing all test scenarios, verify:

### Functional Requirements

- [ ] Sorting dropdown integrated into TaskList header
- [ ] Tasks re-order in same viewport (0px scroll)
- [ ] Completion time displays correctly (formatDistanceToNow)
- [ ] Quality check badge shows correct variant (green/yellow)
- [ ] ReasoningChain hidden by default
- [ ] ReasoningChain visible with `?debug=true`
- [ ] Page layout has 2 main sections (Context + Tasks)

### Technical Requirements

- [ ] No TypeScript errors in console
- [ ] No React warnings in console
- [ ] No layout shifts or flashing during re-renders
- [ ] All existing sorting strategies work identically
- [ ] Mobile responsive (320px, 375px, 768px, 1024px+)

### Quality Requirements

- [ ] Design system compliance (shadows, colors, spacing)
- [ ] WCAG AA contrast maintained (4.5:1)
- [ ] 44px touch targets on mobile
- [ ] Performance <100ms render time (check React DevTools)

### Edge Case Coverage

- [ ] Zero tasks: sorting disabled gracefully
- [ ] No outcome: metadata absent gracefully
- [ ] Missing metadata fields: partial display works
- [ ] Rapid sorting: no performance degradation
- [ ] Long text: wraps cleanly without overflow

---

## Troubleshooting

### Issue: Sorting dropdown not visible

**Check**:
1. TaskList component rendered?
2. `sortingStrategy` prop passed correctly?
3. Console errors related to SortingStrategySelector?

**Fix**:
- Verify TaskList receives `sortingStrategy` and `onStrategyChange` props
- Check browser console for missing prop warnings

### Issue: Metadata not displaying in ContextCard

**Check**:
1. `agent_sessions` table has entry with `completed_at`?
2. ContextCard receives `completionTime` and `qualityCheckPassed` props?
3. Props are defined (not `null` or `undefined`)?

**Fix**:
- Run prioritization to generate agent_session
- Verify page.tsx passes metadata props to ContextCard
- Check conditional rendering logic (`completionTime &&` ...)

### Issue: ReasoningChain visible without debug mode

**Check**:
1. ReasoningChain receives `debugMode` prop?
2. Conditional rendering logic correct (`if (!debugMode) return null`)?
3. Query param reading working (`searchParams.get('debug')`)?

**Fix**:
- Verify ReasoningChain component has early return for `!debugMode`
- Check page.tsx reads query params correctly
- Test with and without `?debug=true` in URL

### Issue: Mobile layout broken

**Check**:
1. Tailwind breakpoints correct (`sm:`, `md:`, `lg:`)?
2. Touch targets meet 44px minimum (`h-11` on mobile)?
3. Viewport meta tag present in HTML?

**Fix**:
- Review Phase 8 mobile-first patterns
- Test each viewport size individually
- Check responsive class application

---

## Performance Testing (Optional)

### React DevTools Profiler

1. Install React DevTools browser extension
2. Open DevTools → Profiler tab
3. Start recording
4. Change sorting strategy 5 times
5. Stop recording

**Expected**:
- Render time <100ms per sorting change
- No unnecessary re-renders of unaffected components
- Smooth 60fps animation (if any)

### Lighthouse Audit

1. Open Chrome DevTools → Lighthouse tab
2. Select "Performance" category
3. Run audit on `/priorities` page

**Expected**:
- Performance score ≥90
- No layout shifts (CLS = 0)
- First Contentful Paint <1.5s
- Time to Interactive <3.5s

---

## Success Criteria

**Feature is complete when**:

1. All P1, P2, P3 test scenarios pass
2. All edge cases handled gracefully
3. Mobile responsive across 4 viewports (320px, 375px, 768px, 1024px+)
4. No console errors or warnings
5. Performance maintained (<100ms render)
6. Manual test acceptance checklist 100% complete

**Ready for code review** ✓

---

## Test Evidence Documentation

**Screenshots to Capture**:
1. Before: Page with standalone PrioritizationSummary and SortingStrategySelector
2. After: Page with integrated ContextCard and TaskList header
3. Mobile: 375px viewport showing stacked TaskList header
4. Debug: ReasoningChain visible with `?debug=true`

**Artifacts to Save**:
- `quickstart-test-results.md` - Copy of this file with checkboxes filled
- `before-after-screenshots/` - Visual comparison images
- `console-log.txt` - Any relevant console output
- `lighthouse-report.json` - Performance audit results (optional)
