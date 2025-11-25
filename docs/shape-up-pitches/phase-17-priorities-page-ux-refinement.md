# Shape Up Pitch: Phase 17 - Priorities Page UX Refinement

## Problem

**The priorities page has good functionality but poor information architecture.** Controls are separated from their effects, forcing users to scroll to verify actions. Low-value debug components occupy prime real estate while essential controls lack visual proximity to their impact.

### Reality Today

1. **Sorting Strategy Disconnect**: Dropdown lives in its own section above the task list. User selects a strategy, then must scroll down to see if it worked. Visual feedback loop is broken.

2. **Prioritization Summary Isolation**: Small informational badge (completion time + quality check) has its own standalone section at the top. Provides no user action—purely metadata taking valuable space.

3. **Reasoning Chain Unclear Value**: Shows chain-of-thought from quality loop, but often empty or showing one iteration. User feedback: "I'm struggling to see the value it brings... sometimes shows one iteration, often shows none."

### User Feedback Pattern

> "I click the sorting dropdown to change strategies, but then I have to scroll down to see that reflected in the priorities. It feels disconnected—shouldn't it be part of that space?"

> "The prioritization summary is very small and more informational... is there a better place in the UI for it?"

> "The reasoning chain... I'm not clear what value this brings. Sometimes it shows one iteration but often it shows none."

### Evidence from Code

**app/priorities/page.tsx:2383-2387** - PrioritizationSummary standalone:
```tsx
<PrioritizationSummary
  completionTime={completedAt ? new Date(completedAt) : new Date()}
  qualityCheckPassed={baseline_quality_threshold_met}
/>
```

**app/priorities/page.tsx:2712-2723** - SortingStrategySelector separate section:
```tsx
<SortingStrategySelector
  selectedStrategy={sortingStrategy}
  onStrategyChange={handleStrategyChange}
/>
```

**app/priorities/page.tsx:2724-2730** - ReasoningChain in prominent position:
```tsx
<ReasoningChain
  chainOfThought={chainOfThought}
  totalIterations={iterationCount}
/>
```

**Core issue:** Layout prioritizes debug observability over user workflow. Control-to-effect visual distance breaks the feedback loop required for confident interaction.

---

## Appetite

**3-day batch** - Pure UI reorganization, no new features. Focused scope: better information architecture following vertical slice protocol (SEE IT, DO IT, VERIFY IT).

---

## Solution

Build a **Cohesive Priorities Interface** that:

1. **Integrates sorting controls** into TaskList header (control + effect in same view)
2. **Consolidates metadata** into existing context areas (no standalone sections)
3. **Removes/minimizes low-value observability** (ReasoningChain to advanced or removed)
4. **Strengthens feedback loops** (immediate visual confirmation of actions)

---

## Breadboard

```
┌─────────────────────────────────────────────────────────────────┐
│  PRIORITIES PAGE                                                │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ CONTEXT CARD                                             │    │
│  │                                                          │    │
│  │ Outcome: "Launch beta by Q1..."                         │    │
│  │ 5 reflections active  •  Completed 2 min ago            │    │  ← Metadata integrated here
│  │ Quality check: ✓ Passed                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ YOUR PRIORITIZED TASKS                                   │    │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                          │    │
│  │ Sort by: [Strategic Impact ▼]  •  12 tasks              │    │  ← Sorting integrated in header
│  │ ─────────────────────────────────────────────────────────│    │
│  │                                                          │    │
│  │ 1. ⬆ Design authentication flow              [High]     │    │
│  │ 2. → Build API endpoints                      [Medium]   │    │  ← Tasks immediately below
│  │ 3. → Write integration tests                  [Medium]   │    │     (instant visual feedback)
│  │ ...                                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ REFLECTIONS (collapsed by default)                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

BEFORE:
┌────────────────────┐
│ Prioritization     │  ← Standalone section (metadata)
│ Summary           │
└────────────────────┘
      ↓ scroll
┌────────────────────┐
│ Sorting Strategy   │  ← Separate section (control)
│ Selector          │
└────────────────────┘
      ↓ scroll
┌────────────────────┐
│ Reasoning Chain    │  ← Separate section (debug info)
└────────────────────┘
      ↓ scroll
┌────────────────────┐
│ Task List          │  ← Effect visible only after scrolling
└────────────────────┘

AFTER:
┌────────────────────┐
│ Context Card       │  ← Metadata integrated
│ + metadata        │
└────────────────────┘
      ↓
┌────────────────────┐
│ Task List          │  ← Control + effect together
│ ┌────────────────┐ │
│ │ Sort: [▼]      │ │  ← Header with sorting
│ ├────────────────┤ │
│ │ Task 1         │ │  ← Immediate visual feedback
│ │ Task 2         │ │
│ └────────────────┘ │
└────────────────────┘
```

---

## What We're Building

### 1. TaskList Component Refactor

**Purpose:** Integrate sorting control into task list header.

**Current structure:**
- `TaskList.tsx` - Just displays tasks
- Sorting selector lives in page.tsx above TaskList

**New structure:**
```tsx
// app/priorities/components/TaskList.tsx
export function TaskList({
  tasks,
  sortingStrategy,
  onStrategyChange,
  // ... other props
}) {
  return (
    <Card>
      {/* NEW: Header with integrated sorting */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-lg font-semibold">Your Prioritized Tasks</h2>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {tasks.length} tasks
          </span>

          {/* Sorting control directly in header */}
          <SortingStrategySelector
            selectedStrategy={sortingStrategy}
            onStrategyChange={onStrategyChange}
            compact={true}  // Smaller variant for header
          />
        </div>
      </div>

      {/* Task rows immediately below */}
      <div className="divide-y divide-border">
        {tasks.map(task => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </Card>
  );
}
```

**Vertical Slice Compliance:**
- ✅ SEE IT: User sees sorting dropdown directly above tasks
- ✅ DO IT: User changes strategy in the header
- ✅ VERIFY IT: Tasks re-order immediately below (same viewport, no scroll)

### 2. ContextCard Enhancement

**Purpose:** Consolidate metadata into existing context component.

**File:** `app/priorities/components/ContextCard.tsx`

**Current:** Shows outcome + recalculate button

**Enhanced:**
```tsx
export function ContextCard({
  outcome,
  reflectionsCount,
  completionTime,      // NEW
  qualityCheckPassed,  // NEW
  onRecalculate,
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Outcome</CardTitle>
        <CardDescription>{outcome.assembled_text}</CardDescription>
      </CardHeader>

      <CardContent>
        {/* Existing reflections info */}
        <div className="flex items-center gap-2">
          <Badge>{reflectionsCount} reflections active</Badge>
        </div>

        {/* NEW: Integrated metadata */}
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
      </CardContent>

      <CardFooter>
        <Button onClick={onRecalculate}>Recalculate Priorities</Button>
      </CardFooter>
    </Card>
  );
}
```

**Alternative:** If ContextCard is too crowded, add metadata to TaskList header instead:
```tsx
// In TaskList header
<span className="text-xs text-muted-foreground">
  Updated 2 min ago • Quality: ✓
</span>
```

### 3. ReasoningChain Removal

**Purpose:** Remove low-value debug component from primary interface.

**Options:**

**Option A: Complete Removal** (RECOMMENDED)
- Remove from page.tsx entirely
- Remove component file if not used elsewhere
- Reasoning: Provides no actionable value to users, often empty

**Option B: Advanced Section**
- Create collapsible "Advanced" or "Debug Info" section at bottom of page
- Show only when `iterationCount > 1`
- Hidden by default, user can expand if curious

**Option C: Developer Mode**
- Show only when `?debug=true` query parameter present
- For troubleshooting prioritization issues
- Not visible to regular users

**Implementation (Option A):**
```tsx
// app/priorities/page.tsx
// REMOVE:
<ReasoningChain
  chainOfThought={chainOfThought}
  totalIterations={iterationCount}
/>

// Component file deprecation:
// app/priorities/components/ReasoningChain.tsx → DELETE or ARCHIVE
```

### 4. PrioritizationSummary Component Removal

**Purpose:** Consolidate metadata instead of standalone component.

**Current location:** app/priorities/page.tsx:2383-2387

**Action:** Remove standalone usage, integrate data into ContextCard (see #2 above)

```tsx
// REMOVE this from page.tsx:
<PrioritizationSummary
  completionTime={completedAt}
  qualityCheckPassed={baseline_quality_threshold_met}
/>

// REPLACE with props passed to ContextCard:
<ContextCard
  outcome={activeOutcome}
  reflectionsCount={reflections.length}
  completionTime={completedAt}              // NEW
  qualityCheckPassed={baseline_quality_threshold_met}  // NEW
  onRecalculate={handleRecalculate}
/>
```

---

## Fat Marker Sketch

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   USER INTERACTION FLOW                                      │
│                                                              │
│   ┌─────────────────┐                                        │
│   │ User loads      │                                        │
│   │ /priorities     │                                        │
│   └────────┬────────┘                                        │
│            ↓                                                 │
│   ┌─────────────────┐                                        │
│   │ Sees layout:    │                                        │
│   │ 1. Context Card │ ← Outcome + metadata                  │
│   │ 2. Task List    │ ← Sorting in header + tasks           │
│   │ 3. Reflections  │ ← Collapsed                           │
│   └────────┬────────┘                                        │
│            ↓                                                 │
│   ┌─────────────────────────────┐                            │
│   │ User clicks sorting dropdown│                            │
│   │ in TaskList header          │                            │
│   └────────┬────────────────────┘                            │
│            ↓                                                 │
│   ┌─────────────────────────────┐                            │
│   │ Selects "Impact First"      │                            │
│   └────────┬────────────────────┘                            │
│            ↓                                                 │
│   ┌─────────────────────────────┐                            │
│   │ Tasks re-order immediately  │ ← Same viewport!          │
│   │ (no scroll required)        │ ← Visual feedback instant │
│   └────────┬────────────────────┘                            │
│            ↓                                                 │
│   ┌─────────────────────────────┐                            │
│   │ User sees verification:     │                            │
│   │ High-impact tasks now #1-3  │                            │
│   └─────────────────────────────┘                            │
│                                                              │
│   VERTICAL SLICE VALIDATED ✓                                 │
│   - SEE IT: Sorting control visible in task header          │
│   - DO IT: User changed strategy                            │
│   - VERIFY IT: Tasks re-ordered instantly in view           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Rabbit Holes to Avoid

| Rabbit Hole | Why Dangerous | Boundary |
|-------------|---------------|----------|
| New sorting algorithms | Feature creep, not layout fix | Use existing strategies only |
| TaskList component rewrite | Over-engineering, breaks tests | Add header prop, minimal changes |
| Advanced debug panel | Scope creep, delays ship | Remove ReasoningChain completely |
| Metadata dashboard | Too much data, complex UI | 2-3 metadata fields max in ContextCard |
| Animated transitions | Polish rabbit hole, not critical | No animations, instant re-render |
| Mobile-specific layout | Separate concern, Phase 8 done | Responsive via existing breakpoints |

---

## No-Gos

- Don't add new sorting strategies (use existing)
- Don't refactor TaskList component architecture (add header only)
- Don't create new advanced/debug pages (remove or hide completely)
- Don't redesign ContextCard layout (integrate metadata only)
- Don't add new state management (use existing props)
- Don't modify sorting logic (pure UI changes)
- Don't touch test infrastructure (update affected tests only)

---

## Risks & Mitigations

| Risk | Why Scary | Mitigation |
|------|-----------|------------|
| Breaking existing tests | Layout changes break selectors | Update tests for new structure, verify coverage maintained |
| Losing debug capability | ReasoningChain removal | Keep component archived, add `?debug=true` support if needed |
| ContextCard overcrowding | Too much metadata | Use alternative (TaskList header) if ContextCard too busy |
| SortingStrategySelector size | May not fit in header | Create `compact` prop variant, test mobile viewports |
| User confusion | "Where did components go?" | No user-facing issue - improving UX, not removing features |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Scroll distance to verify sorting | ~500px (user must scroll) | 0px (same viewport) |
| Standalone sections in layout | 3 (Summary, Sorting, Reasoning) | 0 (all integrated) |
| Time to understand sorting effect | Unknown (~5-10s with scroll) | <2s (immediate visual feedback) |
| User complaints about ReasoningChain | "Unclear value" | Zero (removed) |
| Layout cognitive load | High (4 separate sections) | Low (2 cohesive sections) |

---

## Deliverables

### Day 1: TaskList Integration

**Slice 1: SortingStrategySelector in TaskList Header**
- Add header section to TaskList component
- Move SortingStrategySelector into header
- Remove standalone sorting section from page.tsx
- Update TaskList to accept sorting props
- Test sorting functionality (same behavior, new location)

**Acceptance:**
- ✅ User sees sorting dropdown in TaskList header
- ✅ User changes strategy without scrolling to verify
- ✅ Tasks re-order immediately below sorting control
- ✅ Existing sorting tests pass with new structure

### Day 2: Metadata Consolidation

**Slice 2: Integrate PrioritizationSummary into ContextCard**
- Remove PrioritizationSummary standalone component
- Add `completionTime` and `qualityCheckPassed` props to ContextCard
- Display metadata in CardContent as badges/text
- Remove PrioritizationSummary from page.tsx

**Alternative (if ContextCard too crowded):**
- Add metadata to TaskList header instead
- Small, unobtrusive display next to task count

**Acceptance:**
- ✅ Completion time visible in context area
- ✅ Quality check status visible as badge
- ✅ No standalone PrioritizationSummary section
- ✅ ContextCard not overcrowded (or metadata moved to TaskList)

### Day 3: Cleanup & Polish

**Slice 3: Remove ReasoningChain**
- Remove ReasoningChain from page.tsx
- Archive or delete ReasoningChain.tsx component
- (Optional) Add `?debug=true` support for troubleshooting
- Update any tests that reference ReasoningChain

**Slice 4: Visual Polish**
- Adjust spacing for new layout
- Ensure mobile responsiveness maintained
- Test all viewport sizes (320px, 768px, 1024px)
- Verify design system compliance (shadows, colors)

**Slice 5: Integration Testing**
- Full user journey test: Load → Sort → Verify
- Test metadata display in all states (loading, error, success)
- Cross-browser testing (Chrome, Safari, Firefox)
- Regression testing (ensure no broken features)

**Acceptance:**
- ✅ Page layout has 2 main sections (Context + Tasks)
- ✅ No standalone metadata/debug sections
- ✅ All existing features work (reflections, recalculate, etc)
- ✅ Mobile responsive (no regressions from Phase 8)
- ✅ All tests pass

---

## File Changes Summary

### Modify
```
app/priorities/page.tsx                           # Remove standalone sections, pass props
app/priorities/components/TaskList.tsx             # Add header with sorting
app/priorities/components/ContextCard.tsx          # Add metadata display
app/priorities/components/SortingStrategySelector.tsx  # Add compact variant prop
```

### Remove/Archive
```
app/priorities/components/PrioritizationSummary.tsx  # Consolidate into ContextCard
app/priorities/components/ReasoningChain.tsx         # Remove or archive
```

### Tests to Update
```
app/priorities/components/__tests__/TaskList.test.tsx           # New header structure
app/priorities/components/__tests__/PrioritizationSummary.test.tsx  # May delete
app/priorities/components/__tests__/ReasoningChain.test.tsx     # May delete
__tests__/integration/sorting-strategies.test.tsx               # Update selectors
```

---

## Dependencies

- Phase 8: Mobile-First Transformation (COMPLETE) - Responsive breakpoints maintained
- Phase 15: Reflection Intelligence (COMPLETE) - No conflicts
- Phase 16: Document-Aware Prioritization (IN PROGRESS) - No conflicts
- Existing SortingStrategySelector component
- Existing ContextCard component
- Existing TaskList component

**No new dependencies required** - Pure refactoring of existing components.

---

## Ready When

1. ✅ User changes sorting strategy and sees tasks re-order in same viewport (no scroll)
2. ✅ Completion time and quality check visible in context area (not standalone)
3. ✅ ReasoningChain no longer visible in primary interface
4. ✅ Page layout has 2 cohesive sections: Context + Tasks (not 5 scattered sections)
5. ✅ All sorting strategies work identically (behavior unchanged, just relocated)
6. ✅ Mobile responsive (320px-1920px) with no regressions
7. ✅ All integration tests pass with new layout structure

---

## Estimated Effort

| Day | Slices | Estimate |
|-----|--------|----------|
| Day 1: TaskList Integration | Slice 1 | 3-4 hours |
| Day 2: Metadata Consolidation | Slice 2 | 2-3 hours |
| Day 3: Cleanup & Polish | Slices 3-5 | 3-4 hours |
| **Total** | **5 slices** | **8-11 hours** |

---

## Appendix: Three Laws Compliance Check

**Before (Violations):**

1. **PrioritizationSummary**
   - ❌ SEE IT: Yes (small badge)
   - ❌ DO IT: NO - No user action possible
   - ❌ VERIFY IT: Nothing to verify
   - **Verdict:** Violates vertical slice protocol

2. **SortingStrategySelector** (current location)
   - ✅ SEE IT: Yes (dropdown visible)
   - ✅ DO IT: Yes (user can select strategy)
   - ❌ VERIFY IT: Must scroll to see effect
   - **Verdict:** Breaks feedback loop

3. **ReasoningChain**
   - ⚠️ SEE IT: Sometimes (often empty)
   - ❌ DO IT: Only expand/collapse
   - ❌ VERIFY IT: Unclear what to verify
   - **Verdict:** Low user value, debug info as primary UI

**After (Compliance):**

1. **ContextCard with Metadata**
   - ✅ SEE IT: Outcome + metadata visible
   - ✅ DO IT: Recalculate button for action
   - ✅ VERIFY IT: Metadata updates after recalculation
   - **Verdict:** Valid vertical slice

2. **TaskList with Integrated Sorting**
   - ✅ SEE IT: Sorting dropdown in header
   - ✅ DO IT: Change strategy in place
   - ✅ VERIFY IT: Tasks re-order immediately below
   - **Verdict:** Perfect feedback loop, valid slice

3. **ReasoningChain**
   - Removed from primary interface
   - Available via `?debug=true` if needed for troubleshooting
   - **Verdict:** N/A - not part of user-facing workflow

---

**Last Updated:** 2025-11-25
**Status:** Ready for Review
**Appetite:** 3 days
**Dependencies:** None (pure UI refactoring)
**Blocks:** None
**Enables:** Better user experience, clearer information architecture, stronger feedback loops
