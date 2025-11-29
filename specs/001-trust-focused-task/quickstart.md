# Quickstart: Trust-Focused Task List Refactor - Manual Testing Guide

**Date**: 2025-01-28
**Feature**: Phase 19 - Trust-Focused Task List Refactor
**Branch**: `001-trust-focused-task`
**Appetite**: 3 weeks

## Prerequisites

```bash
# Ensure you're on the feature branch
git checkout 001-trust-focused-task

# Install dependencies
pnpm install

# Start development server
pnpm dev
# → http://localhost:3000
```

## Test Scenarios

### Scenario 1: Instant Task Comprehension (P1)

**Goal**: Verify top task shows rank, icon, title, brief reasoning, and checkbox - readable in <3 seconds

**Steps**:
1. Navigate to http://localhost:3000/priorities
2. Load page on **mobile viewport (320px)** using dev tools
3. Observe task #1 in the list

**Expected**:
- [ ] See exactly 4-5 elements:
  - [ ] Rank number (#1)
  - [ ] Single indicator (🌟 Quick Win OR 🚀 Strategic Bet OR "12h")
  - [ ] Task title (editable)
  - [ ] Brief reasoning (≤20 words, e.g., "Unblocks #3, #7")
  - [ ] Complete checkbox (☐ Done)
- [ ] NO horizontal scroll on 320px viewport
- [ ] All text readable without zooming
- [ ] Brief reasoning is specific (not generic "important task")
- [ ] Can differentiate tasks #1 and #2 by reasoning alone

**Time Target**: <3 seconds to understand why #1 is ranked first

---

### Scenario 2: Unified Task Treatment (P1)

**Goal**: Verify manual and AI tasks receive identical ranking and visual treatment

**Setup**:
1. Create a manual task via "Add Task" modal
2. Set impact: 8, effort: 12h
3. Create an AI-generated task with same scores (or find existing)

**Steps**:
1. Navigate to /priorities
2. Scan task list for both manual and AI tasks

**Expected**:
- [ ] Manual and AI tasks with identical scores ranked identically
- [ ] **No visual distinction** in main view:
  - [ ] No "Manual" badge visible
  - [ ] No "AI" badge visible
  - [ ] Same icon based on quadrant
  - [ ] Same reasoning format
- [ ] Open task drawer → Task source shown ONLY in metadata section

**Validation**:
- Can you identify which task is manual vs AI without opening drawer? → **Should be NO**

---

### Scenario 3: Focus Mode Default (P2)

**Goal**: Verify ≤12 high-leverage tasks shown by default with clear count

**Steps**:
1. Navigate to /priorities (fresh session, clear localStorage)
2. Observe initial task list

**Expected**:
- [ ] See ≤12 tasks by default
- [ ] Filter indicator shows "Focus Mode (Recommended)"
- [ ] Count display: "Showing X focused tasks (Y hidden)"
- [ ] Only Quick Wins + Strategic Bets visible (no Overhead/Neutral)
- [ ] Toggle to "All Tasks" → See full list with updated count

**Test Edge Case**:
1. Complete top leverage task
2. Observe next task becomes #1
3. **Should NOT see overhead task** promoted to #1

---

### Scenario 4: Progressive Disclosure (P2)

**Goal**: Verify "Details →" link opens drawer with all secondary info

**Steps**:
1. Navigate to /priorities
2. Click/tap "Details →" link on task #1

**Expected**:
- [ ] Drawer opens showing:
  - [ ] Full impact/effort/confidence scores with visual breakdown
  - [ ] Quadrant visualization (scatter plot or card)
  - [ ] Dependencies graph (prerequisite/blocks/related)
  - [ ] Movement history timeline
  - [ ] Manual override controls (impact/effort sliders + "Apply" button)
  - [ ] Source document links
- [ ] Drawer stays open when scrolling main list
- [ ] Close drawer → Return to main list, focus preserved

**Mobile Test** (<768px):
- [ ] Drawer becomes full-screen overlay (not side panel)

---

### Scenario 5: Enhanced Agent Rationale (P1)

**Goal**: Verify top 5 tasks have outcome-linked reasoning (≤20 words, no generic phrases)

**Steps**:
1. Navigate to /priorities
2. Trigger new prioritization (refresh or add reflection)
3. Inspect top 5 tasks' brief reasoning

**Expected**:
- [ ] Each task has brief_reasoning field visible
- [ ] ≤20 words per reasoning
- [ ] Outcome-linked format examples:
  - "Unblocks #3, #7 • Enables payment feature"
  - "Fixes production bug affecting 30% users"
  - "Prerequisite for Phase 2 launch milestone"
- [ ] **NO generic phrases**:
  - ❌ "Important task"
  - ❌ "High priority"
  - ❌ "Critical"

**Fallback Test** (simulate agent failure):
1. If agent fails validation 3 times
2. Observe fallback: "Priority: 1" (instead of no reasoning)

---

### Scenario 6: Mobile-First Layout (P2)

**Goal**: Verify no horizontal scroll on 320px, all touch targets ≥44px

**Viewports to Test**:
- 320px (iPhone SE)
- 375px (iPhone 12)
- 768px (iPad)
- 1024px (Desktop)

**Steps**:
1. Navigate to /priorities
2. Set viewport to 320px
3. Scroll through task list

**Expected**:
- [ ] **320px**: No horizontal scroll, card layout stacks vertically
- [ ] All touch targets (buttons, checkbox) are ≥44px height
- [ ] Typography scales up on mobile (18px title vs 14px desktop)
- [ ] Drawer becomes full-screen overlay (<768px)
- [ ] **768px**: Layout adapts to row-based with minimal spacing
- [ ] **1024px**: Full desktop layout

**WCAG AAA Compliance**:
- [ ] Checkbox: 44×44px tap area
- [ ] "Details →" link: 44px height
- [ ] Complete checkbox: 44×44px

---

### Scenario 7: Quick Wins Filter (P3)

**Goal**: Verify Quick Wins filter shows only impact≥5, effort≤8h with accurate count

**Setup**:
1. Ensure task list has mixed impact/effort (some Quick Wins, some not)

**Steps**:
1. Navigate to /priorities
2. Select "Quick Wins" filter from dropdown
3. Observe filtered list

**Expected**:
- [ ] Only tasks with impact≥5 AND effort≤8h shown
- [ ] Count display: "Showing 5 Quick Wins of 23 tasks" (accurate)
- [ ] Toggle filter to "All Tasks" → Reload page
- [ ] **Filter persists**: "All Tasks" still selected (localStorage)

**Test Edge Case**:
1. Complete Quick Win task
2. Observe count decrements: "Showing 4 Quick Wins of 22 tasks"
3. Next Quick Win appears (not overhead task)

---

### Scenario 8: Completed Tasks Section (Clarification)

**Goal**: Verify completed tasks move to separate section with 10-task pagination

**Steps**:
1. Navigate to /priorities
2. Mark task #1 as complete (check ☐ Done)
3. Observe task movement

**Expected**:
- [ ] Task moves to "Completed" section below active tasks
- [ ] Next task becomes #1 in active list
- [ ] **Show last 10 completed tasks** by default
- [ ] "Show more" button visible if >10 completed
- [ ] Click "Show more" → Load next 10 older tasks

**Edge Cases**:
- [ ] ≤10 completed tasks → Hide "Show more" button
- [ ] 0 completed tasks → Show "No completed tasks yet"

---

### Scenario 9: Filter Persistence (Clarification)

**Goal**: Verify filter selection persists across page reloads via localStorage

**Steps**:
1. Navigate to /priorities (default: Focus Mode)
2. Change filter to "All Tasks"
3. Reload page (F5 or Cmd+R)

**Expected**:
- [ ] "All Tasks" filter still selected after reload
- [ ] localStorage key: `'task-filter-preference'`
- [ ] Value: `{"strategy":"balanced","savedAt":1234567890}`

**Test First-Time User**:
1. Clear localStorage: `localStorage.removeItem('task-filter-preference')`
2. Reload page
3. **Expected**: Default to "Focus Mode (Recommended)"

---

### Scenario 10: Manual Override "Apply" Button (Clarification)

**Goal**: Verify "Apply" button triggers instant re-ranking (<100ms)

**Steps**:
1. Navigate to /priorities
2. Open task #5 drawer (Details →)
3. Adjust impact slider to 9 (from 6)
4. Click "Apply" button

**Expected**:
- [ ] Task re-ranks **instantly** (<100ms)
- [ ] Task #5 moves to new position (e.g., #2)
- [ ] Drawer **stays open** showing new position
- [ ] No page reload
- [ ] Brief reasoning shows "Priority: 2" (regenerates on next agent cycle)

**Test Discard Flow**:
1. Adjust sliders
2. Close drawer **without clicking "Apply"**
3. Re-open drawer
4. **Expected**: Sliders reset to original values (changes discarded)

---

## Acceptance Checklist (From Spec)

Run through all 10 acceptance criteria:

1. [ ] User loads /priorities → sees ≤12 tasks with clear reasoning
2. [ ] User reads #1 → understands specific why in <3 seconds
3. [ ] User cannot distinguish manual vs AI task visually
4. [ ] User taps "Details →" → sees full context in drawer
5. [ ] User on mobile (320px) → no horizontal scroll, 44px targets
6. [ ] User filters Quick Wins → only impact≥5, effort≤8h shown
7. [ ] User completes task → moves to "Completed" section, next becomes #1
8. [ ] User changes focus → toggle between Leverage/All views
9. [ ] Main view has ≤5 elements per task (Chekhov's Gun validated)
10. [ ] All tests pass with new structure

---

## Performance Validation

### Drawer Open Time
- **Desktop**: <200ms
- **Mobile**: <500ms
- **Tool**: Chrome DevTools Performance tab

### Manual Override "Apply"
- **Re-ranking**: <100ms
- **Tool**: Console.time/timeEnd around re-rank function

### Brief Reasoning Validation
- **Per task**: <50ms
- **Retry overhead**: <150ms (3 attempts)
- **Tool**: Log validation timing in console

---

## Regression Testing

### Features That MUST Still Work

- [ ] Task editing (inline title edit with debounce)
- [ ] Task completion toggle
- [ ] Reflection panel (quick-capture)
- [ ] Outcome card (goal display)
- [ ] Source documents (document exclusions)
- [ ] Discard pile (discarded task review)
- [ ] Gap detection modal
- [ ] Movement badges (for tasks that changed rank)

### Features REMOVED (Should NOT be visible)

- [ ] Lock/unlock button (entirely removed)
- [ ] Category badges in main view (Leverage/Neutral/Overhead)
- [ ] AI-generated badge in main view
- [ ] Strategic scores inline (moved to drawer)
- [ ] Dependencies list in main view (moved to drawer)
- [ ] Manual task badge in main view (metadata only)

---

## Troubleshooting

### Brief Reasoning Not Showing
1. Check agent output: `SELECT * FROM agent_sessions ORDER BY created_at DESC LIMIT 1`
2. Verify `per_task_scores` contains `brief_reasoning` field
3. Check console for validation errors
4. If fallback: Look for "Priority: 1" format

### Filter Not Persisting
1. Open DevTools → Application → Local Storage
2. Check for key: `task-filter-preference`
3. Value should be JSON: `{"strategy":"focus_mode","savedAt":...}`
4. If missing: localStorage disabled or error during save

### Completed Tasks Not Appearing
1. Check task `checked: true` in database
2. Verify CompletedTasksSection component renders
3. Look for pagination state (page, hasMore)
4. Console log: `completedTasks.length` should match visible count

### Manual Override Apply Slow
1. Check network tab: Should NOT see API call during re-rank
2. Re-rank should be client-side only
3. Reasoning regeneration happens async (next agent cycle)
4. Target: <100ms from button click to visual update

---

## Reporting Issues

When reporting bugs, include:
1. **Scenario** (which test scenario)
2. **Steps** (exact reproduction steps)
3. **Expected** vs **Actual** behavior
4. **Screenshots** (mobile viewport issues)
5. **Console logs** (errors, warnings)
6. **Network tab** (API failures)
7. **Browser** (Chrome/Firefox/Safari + version)
8. **Viewport** (320px/375px/768px/1024px)

---

## Next Steps After Manual Testing

1. Run automated test suite: `pnpm test:run`
2. Run contract tests: `pnpm test:run __tests__/contract/`
3. Run integration tests: `pnpm test:run __tests__/integration/`
4. Check test coverage: `pnpm test:coverage`
5. User testing (n=10): Trust metric survey

---

## References

- Feature spec: `./spec.md`
- Data model: `./data-model.md`
- Contracts: `./contracts/`
- Research: `./research.md`
- Shape Up Pitch: `../../docs/shape-up-pitches/phase-19-trust-focused-task-list-refactor.md`
