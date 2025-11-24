# Shape Up Pitch: Phase 15 – Reflection Intelligence

## Problem

**Reflections are a dead feature.** Users invest effort capturing context ("Legal blocked outreach", "Focus on analytics this week", "Low energy today") but get zero value back. The system treats reflections as optional flavour text instead of actionable intelligence.

### Reality Today

1. **No Immediate Effect**: Adding a reflection does nothing until user manually clicks "Analyze Tasks"
2. **No Intent Understanding**: Raw text passed to LLM with no semantic interpretation
3. **No Enforcement**: Saying "Legal blocked outreach" doesn't actually block outreach tasks
4. **No Attribution**: Users can't see which reflections affected which tasks
5. **Duplicate UI**: Two "Add Current Context" buttons appear simultaneously
6. **Code Debt**: ~90 lines of duplicate utilities, one deprecated service file

### User Feedback Pattern

> "I added a reflection saying we can't do outreach, but the system still told me to prepare the email campaign. What's the point?"

> "Reflections feel like a dead end. They don't impact anything."

### Evidence from Code

**priorities/page.tsx:2707-2710** – When reflection added:
```typescript
onReflectionAdded={() => {
  // When a reflection is added, fetch latest reflections and trigger recompute
  fetchReflections(); // <-- Just refreshes the list, NO prioritization!
}}
```

**agentOrchestration.ts:879-881** – How reflections are used:
```typescript
const reflectionsText = context.reflections.length > 0
  ? context.reflections.map(r => `- ${r.text}`).join('\n')  // Raw text dump
  : 'No active reflections.';
```

**Core issue:** The system has reflection capture but no reflection intelligence. Users see no return on their investment.

---

## Appetite

**4-week batch** – This is a core value-add feature, not polish. Half-measures will make it worse (users will continue to see reflections as useless).

---

## Solution

Build a **Reflection Intelligence Layer** that:

1. **Interprets** reflection intent (constraint vs opportunity vs capacity signal)
2. **Acts immediately** when reflections are added or toggled
3. **Enforces** hard constraints (blocked tasks stay blocked)
4. **Explains** every priority change with reflection attribution
5. **Responds fast** (<500ms for toggles, <3s for new reflections)
6. **Cleans up** duplicate code and deprecated services

---

## Breadboard

```
┌─────────────────────────────────────────────────────────────────┐
│  CURRENT CONTEXT                                                │
│  ────────────────────────────────────────────────────────────── │
│  Your reflections shape how tasks are prioritized.              │
│  Try: "Focus on X" • "Blocked by Y" • "Low energy today"        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 💬 "Legal blocked all customer outreach until Dec 1"    │    │
│  │    🚫 Constraint detected • 3 tasks affected            │    │
│  │    [Active ✓]                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 💬 "Focus: tighten internal analytics this sprint"      │    │
│  │    🎯 Opportunity detected • Boosting 2 tasks           │    │
│  │    [Active ✓]                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [+ Add reflection]                                             │
│                                                                 │
│  ────────────────────────────────────────────────────────────── │
│  CHANGES FROM YOUR CONTEXT                                      │
│                                                                 │
│  ⬆️ "Set up analytics dashboard" +4 positions                   │
│     Matches: "Focus: tighten internal analytics"                │
│                                                                 │
│  ⬇️ "Launch email campaign" -6 positions                        │
│     Blocked by: "Legal blocked customer outreach"               │
│                                                                 │
│  🚫 "Cold outreach prep" removed from active list               │
│     Hard constraint from legal reflection                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## What We're Building

### 1. Reflection Interpreter Service (NEW)

**Purpose:** Understand what the user means, not just what they typed.

```typescript
// Input: "Legal blocked outreach until Dec"
// Output:
{
  type: "constraint",
  subtype: "blocker",
  keywords: ["outreach", "customer", "email", "campaign"],
  duration: { until: "2024-12-01" },
  strength: "hard",
  summary: "Block tasks related to customer outreach"
}
```

**Classification buckets:**
- **Constraint/Blocker**: "Legal blocked X", "Can't do Y until Z", "Waiting on approval"
- **Opportunity/Focus**: "Focus on X", "Priority is Y", "Interested in Z"
- **Capacity/Energy**: "Low energy", "Busy week", "Have extra time for deep work"
- **Sequencing**: "Do X before Y", "After Z is done", "Depends on W"
- **Information**: "FYI: X happened" (context only, no direct action)

**Implementation:** Use GPT-4o-mini for fast classification (~200ms), cache results.

### 2. Instant Reaction Engine

**Purpose:** Act immediately when reflections change.

**Flow:**
```
User adds reflection
    ↓
Interpreter classifies (100-200ms)
    ↓
Fast adjuster applies changes:
  - Hard constraint → Immediately demote/hide affected tasks
  - Opportunity → Boost matching tasks
  - Capacity → Adjust effort thresholds
    ↓
UI updates with changes + explanations (<500ms total)
    ↓
Background: Queue full re-prioritization if complex
```

**Key insight:** Don't wait for full agent run. Use cached baseline + adjustment layer.

### 3. Attribution System

**Purpose:** Show users exactly how reflections affected their priorities.

Every task card shows:
- Which reflections affected it
- Direction of effect (boosted/demoted/blocked)
- Specific reason in plain language

**Badge examples:**
- `🚫 Blocked: Legal hold`
- `⬆️ Boosted: Matches focus area`
- `⬇️ Demoted: Low energy mode`

### 4. Consolidated Context UI

**Purpose:** Single, clear entry point for reflections.

**Changes:**
- One "Add Context" button (remove duplicate)
- Helpful prompts: "Try telling me what's blocking you or what to focus on"
- Visual feedback when reflection is processing
- Inline preview of detected intent before saving

### 5. Code Cleanup

**Purpose:** Remove technical debt accumulated over iterations.

**Delete:**
- `lib/services/reflectionBasedRanking.ts` (340 lines, deprecated)
- Duplicate utilities in `priorities/page.tsx` (~90 lines)

**Consolidate:**
- `calculateFallbackWeight` → use `reflectionService.calculateRecencyWeight`
- `formatFallbackRelativeTime` → use `reflectionService.formatRelativeTime`
- `normalizeReflection` → use `reflectionService.enrichReflection`

### 6. Unified Experience (Home + Priorities)

**Purpose:** Reflections work consistently across both pages.

- Home page: Add reflection → "Saved! View effect in Priorities →"
- Priorities page: See effects immediately
- Shared state: Reflection added anywhere affects priorities

---

## Fat Marker Sketch

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   [Reflection Input]                                         │
│         ↓                                                    │
│   ┌─────────────────┐                                        │
│   │   Interpreter   │ ← Classify intent (GPT-4o-mini)        │
│   │   (200ms)       │                                        │
│   └─────────────────┘                                        │
│         ↓                                                    │
│   ┌─────────────────┐    ┌────────────────┐                  │
│   │  Fast Adjuster  │───→│  UI Updates    │                  │
│   │  (300ms)        │    │  + Attribution │                  │
│   └─────────────────┘    └────────────────┘                  │
│         ↓                                                    │
│   ┌─────────────────┐                                        │
│   │ Background Full │ ← Only if needed                       │
│   │ Agent Run       │                                        │
│   └─────────────────┘                                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Rabbit Holes to Avoid

| Rabbit Hole | Why Dangerous | Boundary |
|-------------|---------------|----------|
| Perfect NLU | Could spend weeks on edge cases | Use LLM, accept 80% accuracy, let users correct |
| Real-time streaming | Complex SSE infrastructure | Optimistic UI + polling is fine for v1 |
| Reflection editing | Users might want to tweak tags | Out of scope - delete and re-add |
| Historical analysis | "How did reflections affect me over time" | v2 feature |
| Multi-reflection conflicts | Complex resolution logic | Simple priority: hard blocks > soft blocks > boosts |
| Expiring reflections | Auto-clear old reflections | Just use recency weight, no auto-delete |

---

## No-Gos

- ❌ Don't build new reflection capture UI (reuse existing drawer)
- ❌ Don't rewrite prioritization agent (layer adjustments on top)
- ❌ Don't auto-create tasks from reflections (suggest only, user confirms)
- ❌ Don't persist interpreted tags permanently (re-interpret on demand)
- ❌ Don't block on perfect classification (ship with good-enough + iteration)
- ❌ Don't add reflection categories/tags UI (auto-detect only)

---

## Risks & Mitigations

| Risk | Why Scary | Mitigation |
|------|-----------|------------|
| Over-blocking | Constraint suppresses too many tasks | Minimum floor: cannot suppress below 5 tasks without warning |
| LLM latency | Interpretation adds delay | Use GPT-4o-mini (~200ms), show optimistic UI |
| Wrong classification | User says X, system interprets Y | Show preview before save, allow delete + retry |
| Performance regression | Adding intelligence slows everything | Fast path for toggles (no LLM), full path only for new reflections |
| User confusion | "Why did this task move?" | Every change shows attribution badge |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time: reflection add → visible effect | ∞ (manual click) | <3 seconds |
| Time: toggle adjustment | N/A | <500ms |
| Tasks with reflection attribution | 0% | 100% of moved tasks |
| Duplicate CTA buttons | 2 | 1 |
| Lines of duplicate code | ~90 | 0 |
| Deprecated service files | 1 | 0 |
| User reports "reflections matter" | ~0% | >50% |

---

## Deliverables

### Week 1: Foundation + Cleanup

**Slice 1: Code Consolidation**
- Delete `lib/services/reflectionBasedRanking.ts`
- Remove duplicate utilities from `priorities/page.tsx`
- Export shared utilities from `reflectionService.ts`

**Slice 2: Fix Duplicate CTAs**
- Single "Add Context" button in ContextCard
- Engaging empty state with helpful prompts

### Week 2: Intelligence Layer

**Slice 3: Reflection Interpreter Service**
- New `lib/services/reflectionInterpreter.ts`
- GPT-4o-mini classification
- Intent schema in `reflectionSchema.ts`

**Slice 4: Fast Adjustment Engine**
- New `lib/services/reflectionAdjuster.ts`
- Apply boosts/demotions/blocks based on intent
- <500ms execution time

### Week 3: Integration

**Slice 5: Auto-Trigger on Add**
- `onReflectionAdded()` triggers adjustment
- Loading state: "Applying your context..."
- No manual "Analyze" needed

**Slice 6: Attribution UI**
- Badges on moved tasks
- "Why this moved" explanations
- Link to source reflection

### Week 4: Polish

**Slice 7: Helpful Prompts**
- Input placeholder with examples
- Intent preview before saving
- Guidance in ReflectionPanel

**Slice 8: Unified Experience**
- Consistent behavior Home ↔ Priorities
- Cross-page notification when reflection affects priorities

---

## File Changes Summary

### Delete
```
lib/services/reflectionBasedRanking.ts     # 340 lines, deprecated
```

### Create
```
lib/services/reflectionInterpreter.ts      # Intent classification
lib/services/reflectionAdjuster.ts         # Fast adjustment engine
```

### Modify
```
app/priorities/page.tsx                    # Remove ~90 lines duplicates, add auto-trigger
app/priorities/components/ContextCard.tsx  # Fix duplicate CTAs, show affected counts
app/priorities/components/TaskRow.tsx      # Add attribution badges
app/components/ReflectionInput.tsx         # Add helpful prompts
app/components/ReflectionPanel.tsx         # Add guidance, intent preview
app/page.tsx                               # Better onReflectionAdded handling
lib/services/reflectionService.ts          # Export more utilities
lib/schemas/reflectionSchema.ts            # Add intent types
app/api/reflections/route.ts               # Call interpreter on POST
```

---

## Dependencies

- Phase 5: Context-aware prioritization groundwork (COMPLETE)
- Phase 7: Reflection-driven task coherence pitch (REFERENCED - this implements it)
- Embedding service for semantic matching (COMPLETE)
- Agent orchestration infrastructure (COMPLETE)

---

## Ready When

1. User adds "Legal blocked outreach" → outreach tasks immediately drop with visible explanation
2. User toggles reflection off → tasks restore to baseline in <500ms
3. Every moved task shows which reflection caused the change
4. Single "Add Context" button, no duplicates
5. Zero duplicate utility code
6. Users report "reflections finally do something"

---

## Estimated Effort

| Phase | Slices | Estimate |
|-------|--------|----------|
| Week 1: Cleanup | 1-2 | 2-3 hours |
| Week 2: Intelligence | 3-4 | 6-8 hours |
| Week 3: Integration | 5-6 | 4-6 hours |
| Week 4: Polish | 7-8 | 3-4 hours |
| **Total** | **8 slices** | **15-21 hours** |

---

## Appendix: Current Code Redundancies

### Duplicate Weight Calculation

**priorities/page.tsx:124-141:**
```typescript
const calculateFallbackWeight = (createdAtIso: string): number => {
  // ... 17 lines duplicating reflectionService.ts
};
```

**reflectionService.ts:14-28:**
```typescript
export function calculateRecencyWeight(createdAt: Date): number {
  // ... canonical implementation
}
```

### Duplicate Time Formatting

**priorities/page.tsx:143-171:**
```typescript
const formatFallbackRelativeTime = (createdAtIso: string): string => {
  // ... 28 lines duplicating reflectionService.ts
};
```

**reflectionService.ts:42-51:**
```typescript
export function formatRelativeTime(createdAt: Date): string {
  // ... canonical implementation
}
```

### Deprecated Service

**reflectionBasedRanking.ts:169-170:**
```typescript
/**
 * @deprecated Use the unified prioritization flow...
 */
export async function buildAdjustedPlanFromReflections(...)
```

Uses naive character-frequency matching instead of semantic understanding.
