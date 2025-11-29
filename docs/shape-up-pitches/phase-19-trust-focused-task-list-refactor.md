# Shape Up Pitch: Phase 19 – Trust-Focused Task List Refactor

## Problem

**The task prioritization feature undermines user confidence instead of building it.** Users face:
- **Clutter paralysis**: 5-column table with 10+ badges creates decision overload
- **Broken trust**: Inconsistent manual vs AI task handling signals unreliability
- **Mobile frustration**: Non-mobile-first design creates unusable experience on phones
- **Weak rationale**: Generic AI reasoning doesn't justify why tasks are ranked
- **Focus dilution**: Overhead/neutral tasks mixed with high-leverage work

### User Feedback Pattern

> "I can't tell what to focus on - there's too much information per task"

> "Why is my manual task ranked differently than AI tasks? It feels inconsistent"

> "The AI says task #1 is important but doesn't explain why in concrete terms"

### Evidence from Code Analysis

**5-Column Table** (`app/priorities/components/TaskRow.tsx`):
- 12+ UI elements per task (rank, title, 3 badges, scores, dependencies, movement, actions)
- User must parse competing information before deciding to act
- Mobile viewport: Content wraps poorly, creates scanning burden

**Inconsistent Handling** (`lib/mastra/agents/prioritizationGenerator.ts:56`):
- Manual tasks get 20% boost → different treatment → erodes trust
- `ManualTaskBadge` creates visual distinction where none should exist

**Generic Rationale** (`lib/mastra/agents/prioritizationGenerator.ts`):
- Agent prompt doesn't require specific outcome-linking
- No brief reasoning surfaced in main view → user sees rank without "why"

**Core Issue:** Design optimized for showing all data, not enabling confident action. Violates Jobs To Be Done (overwhelmed user needs clear guidance), Chekhov's Gun (elements don't serve "next action" decision), and Cognitive Load (recognition over recall).

---

## Appetite

**3 weeks (medium batch)** – Touches UI, agent prompts, and task unification logic. Higher risk than Phase 17's pure layout work, but foundational for user trust.

**Why 3 weeks?**
- Week 1: Agent trust (reasoning + unification)
- Week 2: UI simplification (Chekhov's Gun cuts)
- Week 3: Mobile + filtering polish

---

## Solution

Build a **Trust-Focused Task Interface** grounded in three frameworks:

### 1. JTBD: Trust → Focus → Efficiency
**User Job**: When overwhelmed by information → see trustworthy, focused priorities → make confident progress

### 2. Chekhov's Gun: Every element serves "next action" decision
**Main View**: Rank + Task + Brief Reasoning + Action = 4 elements max
**Side Drawer**: All secondary info (progressive disclosure)

### 3. Cognitive Load: Recognition over recall
**Standardization**: All tasks look identical (manual vs AI distinction removed)
**Visual Hierarchy**: Task title dominant, metadata secondary, actions tertiary

---

## Breadboard

```
BEFORE (Cognitive Overload):
┌────────────────────────────────────────────────────────┐
│ #1 │ Set up auth │ AI │ Leverage │ Impact:8 Effort:12h │
│    │ Confidence:0.85 │ ↑3 │ Depends: #3 │ [Edit] [✓]  │
└────────────────────────────────────────────────────────┘
     ↑12 elements per task = decision paralysis

AFTER (Trust-Focused):
┌────────────────────────────────────────────────────────┐
│  #1  🌟  Set up authentication for API endpoints       │
│          "Unblocks #3 and #7" • Details →              │
│          ☐ Done                                         │
└────────────────────────────────────────────────────────┘
     ↑4 elements per task = instant comprehension

SIDE DRAWER (Progressive Disclosure):
Tap "Details →" reveals:
- Full strategic scores (Impact: 8, Effort: 12h, Confidence: 85%)
- Quadrant visualization
- Dependencies graph
- Movement history
- Manual override controls
```

---

## What We're Building

### Week 1: Establish Trust

**Slice 1A: Enhanced Agent Rationale**

**Purpose:** Build trust through transparent, specific reasoning

**File:** `lib/mastra/agents/prioritizationGenerator.ts`

**Changes:**
```typescript
// Add to prompt:
- Output brief_reasoning field (max 20 words)
- Mandate outcome-link: "Advances [goal] by [mechanism]"
- Reject generic phrases: "important", "critical" without specifics
- Example good reasoning: "Unblocks #3, #7 • Enables payment feature"
- Example bad reasoning: "High priority task" (too vague)

// Schema addition:
per_task_scores: {
  "task-1": {
    ...existing fields,
    brief_reasoning: "Unblocks 3 other tasks", // NEW
  }
}
```

**UI Display** (`app/priorities/components/TaskRow.tsx`):
```tsx
<div className="text-sm text-muted-foreground">
  {briefReasoning} • <button onClick={openDrawer}>Details →</button>
</div>
```

**Acceptance:**
- ✅ User sees specific reason for top 5 tasks
- ✅ Reasoning is outcome-linked (not generic)
- ✅ ≤20 words per reasoning string

**Slice 1B: Unify Manual & AI Treatment**

**Purpose:** Remove inconsistency that erodes trust

**Files:**
- `lib/mastra/agents/prioritizationGenerator.ts` (line 56) → Remove 20% boost
- `app/priorities/components/TaskRow.tsx` → Remove `ManualTaskBadge` from main view
- `lib/services/manualTaskPlacement.ts` → Ensure identical scoring

**Changes:**
```typescript
// REMOVE this from prioritizationGenerator.ts:
// multiply impact score by 1.2 (20% boost) before ranking

// UPDATE TaskRow.tsx:
// Remove: <ManualTaskBadge status={...} />
// Result: All tasks use identical visual structure
```

**Acceptance:**
- ✅ Manual tasks prioritized identically to AI tasks
- ✅ No visual distinction in main list
- ✅ User cannot identify manual vs AI without opening drawer

---

### Week 2: Enable Focus

**Slice 2A: Simplify TaskRow (Chekhov's Gun)**

**Purpose:** Remove all elements that don't serve "next action" decision

**File:** `app/priorities/components/TaskRow.tsx`

**REMOVE from main view:**
- ❌ All category badges (leverage/neutral/overhead) - redundant with icon
- ❌ AI-generated badge - source irrelevant
- ❌ Strategic scores inline (Impact: 8, Effort: 12h) - move to drawer
- ❌ Dependencies list - move to drawer
- ❌ Lock button - remove feature entirely (anti-trust pattern)
- ❌ Movement badge in prominent position - make subtle or move

**KEEP in main view:**
- ✅ Rank number (#1, #2)
- ✅ Single indicator (🌟 Quick Win / 🚀 Strategic Bet / "12h")
- ✅ Task title (editable)
- ✅ Brief reasoning (from Slice 1A)
- ✅ Complete checkbox
- ✅ Details → link to drawer

**New Structure:**
```tsx
<div className="flex flex-col gap-2 p-4">
  <div className="flex items-center gap-3">
    <span className="text-lg font-bold">#{rank}</span>
    <span className="text-xl">{icon}</span>
    <span className="text-base font-medium">{taskTitle}</span>
  </div>
  <div className="text-sm text-muted-foreground">
    {briefReasoning} • <button>Details →</button>
  </div>
  <div className="flex items-center gap-2">
    <Checkbox checked={completed} />
    <span>Done</span>
  </div>
</div>
```

**Acceptance:**
- ✅ Main view has exactly 4-5 elements per task
- ✅ User can scan list in <5 seconds
- ✅ Drawer accessible via "Details →" link

**Slice 2B: Leverage-Only Default**

**Purpose:** Reduce choice set to manageable size (7±2 items)

**File:** `lib/schemas/sortingStrategy.ts`

**New Strategy:**
```typescript
focus_mode: {
  label: 'Focus Mode (Recommended)',
  description: 'High-leverage work only (Quick Wins + Strategic Bets)',
  filter: task =>
    task.quadrant === 'high_impact_low_effort' ||
    task.quadrant === 'high_impact_high_effort',
  sort: (a, b) => b.priority - a.priority,
}
```

**File:** `app/priorities/page.tsx`
- Set default strategy: `focus_mode`
- Show count: `"Showing 8 focused tasks (12 hidden)"`

**Acceptance:**
- ✅ Default view shows ≤12 tasks
- ✅ User can toggle to "All" view
- ✅ Filter status clearly displayed

---

### Week 3: Polish & Mobile

**Slice 3A: Mobile-First Layout**

**Purpose:** Optimize for constrained screens (320px minimum)

**File:** `app/priorities/components/TaskRow.tsx`

**Mobile Changes:**
```tsx
className="
  // Mobile: Card layout
  flex flex-col gap-3 p-4 border rounded-lg

  // Tablet+: Minimal spacing
  lg:flex-row lg:gap-4 lg:p-3 lg:border-0 lg:rounded-none
"
```

**Touch Targets:**
- All buttons: `h-11` (44px) on mobile
- Checkbox: 44×44px tap area
- Details link: 44px height

**Acceptance:**
- ✅ No horizontal scroll on 320px viewport
- ✅ All touch targets ≥44px (WCAG AAA)
- ✅ Typography scales up on mobile (18px title)

**Slice 3B: Fix Quick Wins Filter**

**Purpose:** Enable efficient triage

**File:** `app/priorities/components/TaskList.tsx`

**Debug:**
- Ensure filter runs before sort
- Verify tasks have impact/effort scores
- Add filter status: `"Showing 5 Quick Wins of 23 tasks"`

**Acceptance:**
- ✅ Quick Wins filter shows only impact≥5, effort≤8h
- ✅ Count accurate
- ✅ Filter applies instantly

**Slice 3C: Rich Drawer Experience**

**Purpose:** Progressive disclosure for power users

**File:** `app/priorities/components/TaskDetailsDrawer.tsx`

**Add:**
- Strategic scores with visual breakdown
- Quadrant scatter plot
- Movement timeline
- Manual override controls (impact/effort sliders)
- Source document links

**Acceptance:**
- ✅ All secondary info accessible via drawer
- ✅ No need to return to main list for detail

---

## Fat Marker Sketch

```
USER JOURNEY (Trust Flow):

1. Load /priorities
   ↓
2. See focused list:
   - 8 tasks visible (not 23)
   - Each task: Rank + Icon + Title + Brief why
   - Clean, scannable
   ↓
3. Read #1: "🌟 Set up auth • Unblocks #3, #7"
   - Instantly understand: Quick win, enables other work
   ↓
4. Trust decision:
   - Clear reasoning ✓
   - No conflicting info ✓
   - Manageable choice set ✓
   ↓
5. Take action:
   - ☐ Done (if ready)
   - Details → (if need more context)
   ↓
6. Verify:
   - Task moves to completed
   - Next task appears

VERTICAL SLICE VALIDATED:
✅ SEE IT: User sees clear, justified priority
✅ DO IT: User confidently acts on top task
✅ VERIFY IT: System confirms completion
```

---

## Rabbit Holes to Avoid

| Rabbit Hole | Why Dangerous | Boundary |
|-------------|---------------|----------|
| Perfect duplicate detection | Endless edge cases | Use existing 85% threshold |
| Animated transitions | Polish rabbit hole | No animations, instant re-render |
| Custom quadrant viz | Complex D3.js work | Use simple scatter plot or defer |
| Lock feature debate | Philosophical quagmire | Hard remove, monitor support requests |
| Movement indicator design | Many micro-decisions | Single subtle badge, right-aligned |
| Drawer interactions | Keyboard nav, a11y deep dive | Basic click/tap only for v1 |

---

## No-Gos

- ❌ Don't add new sorting algorithms (use existing)
- ❌ Don't redesign agent architecture (prompt changes only)
- ❌ Don't create new task types (manual = task, AI = task)
- ❌ Don't add task dependencies UI (inferred only)
- ❌ Don't implement full design system overhaul (use existing tokens)
- ❌ Don't touch document processing pipeline (scope: priorities page only)
- ❌ Don't add keyboard shortcuts (future enhancement)
- ❌ Don't implement undo/redo (out of scope)

---

## Risks & Mitigations

| Risk | Why Scary | Mitigation |
|------|-----------|------------|
| **Lock removal backlash** | Power users may rely on it | User testing (n=10) before removal; if critical, pivot to "Pin top 3" |
| **Brief reasoning too long** | >20 words creates scanning burden | Enforce via agent schema validation; truncate with "..." |
| **Drawer not discoverable** | Users miss secondary info | Prominent "Details →" link; tooltips on first visit |
| **Focus mode too restrictive** | Users need to see all tasks sometimes | Clear toggle to "All Tasks" with count |
| **Agent prompt changes break existing** | Different prioritization logic | A/B test with 10% traffic first |
| **Mobile layout breaks tests** | Selector changes | Update test selectors, verify coverage |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Elements per task (main view) | ~12 | ≤5 |
| Time to understand top task | ~10s (scroll + parse) | <3s |
| User trust: "I know why #1 is ranked first" | ~40% | >75% |
| Manual task prioritization consistency | 0% (20% boost) | 100% (identical) |
| Mobile horizontal scroll (320px) | Yes | No |
| Default task count visible | 23 | ≤12 |
| Quick Wins filter accuracy | Broken | 100% |

---

## Deliverables

### Week 1: Trust Foundation
- Slice 1A: Enhanced agent rationale (brief_reasoning field)
- Slice 1B: Unify manual/AI treatment (remove boost + badges)

**Acceptance:**
- User sees specific outcome-linked reasoning for top 5 tasks
- Manual tasks indistinguishable from AI tasks in main view

### Week 2: Focus Enablement
- Slice 2A: Simplify TaskRow to 4-5 elements
- Slice 2B: Leverage-only default (focus_mode)

**Acceptance:**
- Main view shows ≤5 elements per task
- Default shows ≤12 high-leverage tasks

### Week 3: Polish & Mobile
- Slice 3A: Mobile-first layout (320px+)
- Slice 3B: Fix Quick Wins filter
- Slice 3C: Rich drawer experience

**Acceptance:**
- No horizontal scroll on 320px
- Quick Wins filter accurate
- All secondary info in drawer

---

## File Changes Summary

### Modify
```
lib/mastra/agents/prioritizationGenerator.ts       # Add brief_reasoning, remove manual boost
app/priorities/components/TaskRow.tsx               # Radical simplification (4-5 elements)
app/priorities/components/TaskList.tsx              # Remove table grid, fix filter
app/priorities/components/TaskDetailsDrawer.tsx     # Add all secondary info
lib/schemas/sortingStrategy.ts                      # Add focus_mode strategy
app/priorities/page.tsx                             # Set focus_mode default, remove lock logic
```

### Remove
```
app/priorities/components/ManualTaskBadge.tsx       # Only in drawer, not main view
(Lock feature code)                                  # From page.tsx and TaskRow.tsx
```

### Tests to Update
```
app/priorities/components/__tests__/TaskRow.test.tsx          # New structure
app/priorities/components/__tests__/TaskList.test.tsx         # Filter fix
__tests__/integration/sorting-strategies.test.tsx             # Focus mode
__tests__/integration/T001_MOBILE_320PX_TEST.md              # New layout
```

---

## Dependencies

**Built on:**
- Phase 8: Mobile-First Transformation (baseline responsive)
- Phase 11: Strategic Prioritization (impact/effort/confidence)
- Phase 15: Reflection Intelligence (reflection effects)
- Phase 18: Manual Task Creation (unification target)

**No new dependencies** - Pure refactoring + prompt enhancement

---

## Ready When

1. ✅ User loads /priorities → sees ≤12 tasks with clear reasoning
2. ✅ User reads #1 → understands specific why in <3 seconds
3. ✅ User cannot distinguish manual vs AI task visually
4. ✅ User taps "Details →" → sees full context in drawer
5. ✅ User on mobile (320px) → no horizontal scroll, 44px targets
6. ✅ User filters Quick Wins → only impact≥5, effort≤8h shown
7. ✅ User completes task → moves to done, next task appears
8. ✅ User changes focus → toggle between Leverage/All views
9. ✅ Main view has ≤5 elements per task (Chekhov's Gun validated)
10. ✅ All tests pass with new structure

---

## Estimated Effort

| Week | Slices | Estimate |
|------|--------|----------|
| Week 1: Trust | 1A, 1B | 12-15 hours |
| Week 2: Focus | 2A, 2B | 15-18 hours |
| Week 3: Polish | 3A, 3B, 3C | 12-15 hours |
| **Total** | **6 slices** | **39-48 hours** |

---

## Appendix: Framework Application

### JTBD Validation
**Job:** Overwhelmed user → Clear guidance → Confident progress

| Element | Serves Job? | Decision |
|---------|-------------|----------|
| Brief reasoning | ✅ Builds trust | KEEP - main view |
| Lock button | ❌ Signals distrust | REMOVE |
| Manual badge | ❌ Creates confusion | REMOVE |
| Leverage filter | ✅ Enables focus | ADD as default |
| Strategic scores | ⚠️ Context, not action | MOVE to drawer |

### Chekhov's Gun Audit
**Rule:** Every visible element must serve "next action" decision

| Element | Fires? | Decision |
|---------|--------|----------|
| Rank number | ✅ Shows priority | KEEP |
| Task title | ✅ Defines action | KEEP |
| Brief reasoning | ✅ Justifies priority | KEEP |
| Complete checkbox | ✅ Primary outcome | KEEP |
| Category badge | ❌ Redundant with icon | REMOVE |
| Dependencies | ❌ Context, not next action | MOVE to drawer |
| Movement history | ⚠️ Validation, not action | Subtle or drawer |

### Cognitive Load Reduction
**Goal:** Recognition over recall, progressive disclosure

| Pattern | Application |
|---------|-------------|
| Standardization | All tasks identical structure |
| Visual hierarchy | Title 18px → Reasoning 14px → Actions 12px |
| Progressive disclosure | Main view (triage) → Drawer (investigation) |
| Choice reduction | 23 tasks → 8-12 (focus mode) |
| Recognition | "🌟 Quick Win" instant > "Impact: 8, Effort: 6h" requires calculation |

---

**Last Updated:** 2025-01-28
**Status:** Ready for Review
**Appetite:** 3 weeks
**Dependencies:** Phases 8, 11, 15, 18
**Blocks:** None
**Enables:** User trust, confident action-taking, mobile deployment
**Framework:** JTBD + Chekhov's Gun + Cognitive Load
