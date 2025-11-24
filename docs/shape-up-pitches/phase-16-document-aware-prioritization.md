# Shape Up Pitch: Phase 16 – Document-Aware Prioritization

## Problem

**Users are blind to what's being prioritized.** The recalculate button gives no hint about what will change. Users don't know which documents are included, which are new, or how to control the scope of prioritization.

### Reality Today

1. **No Document Count**: "Recalculate priorities" button shows nothing about pending documents
2. **Outcome Blends In**: The outcome statement uses `text-muted-foreground` and disappears into the UI
3. **No Source Visibility**: Users can't see which documents contributed to current priorities
4. **No Control**: All documents automatically included—no way to exclude irrelevant ones
5. **Wasted Recalculations**: Users click recalculate not knowing if anything changed

### User Feedback Pattern

> "I added 3 new documents but have no idea if clicking recalculate will include them or not."

> "I have some old documents I don't want considered anymore, but I can't exclude them without deleting them."

> "The outcome is supposed to be the most important thing, but I can barely see it."

### Evidence from Code

**priorities/page.tsx:2359-2361** – Outcome display:
```typescript
{activeOutcome && (
  <span className="truncate text-muted-foreground">
    Outcome: {activeOutcome.assembled_text}
  </span>
)}
```

**agent/prioritize/route.ts:83-87** – All completed tasks included blindly:
```typescript
const { data: taskRows, error } = await supabase
  .from('task_embeddings')
  .select('task_id, task_text, document_id, status, manual_overrides')
  .eq('status', 'completed')  // No document filtering!
  .limit(200);
```

**Core issue:** The system has all the document data but exposes none of it to users. They're flying blind.

---

## Appetite

**2-week batch** – This is a usability enhancement, not a new feature. Focused scope: visibility and control.

---

## Solution

Build a **Document-Aware Prioritization Layer** that:

1. **Shows pending count** on the recalculate CTA
2. **Highlights the outcome** so it stands out visually
3. **Lists source documents** with their inclusion status
4. **Enables quick toggles** to include/exclude documents from next run

---

## Breadboard

```
┌─────────────────────────────────────────────────────────────────┐
│  RECALCULATE PRIORITIES                                         │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ YOUR OUTCOME                                             │    │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │    │
│  │                                                          │    │
│  │ "Launch the beta product by end of Q1 with core         │    │
│  │  features validated by 10 paying customers"              │    │
│  │                                                          │    │
│  │ State: Energized  •  Capacity: 6h/day                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  SOURCE DOCUMENTS                                   5 included  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ☑ Product-roadmap-Q1.pdf             12 tasks    [included]    │
│  ☑ Customer-feedback-Jan.docx          8 tasks    [included]    │
│  ☑ Sprint-planning-notes.md            4 tasks    [included]    │
│  ☐ Old-brainstorm-2023.pdf             6 tasks    [excluded]    │
│  ☐ Archived-ideas.txt                  3 tasks    [excluded]    │
│                                                                 │
│  ┌──────────────────────┐    ┌───────────────────────────┐     │
│  │ 2 NEW DOCUMENTS      │    │ [Recalculate Priorities]  │     │
│  │ ready to include     │    │         (2 new)           │     │
│  └──────────────────────┘    └───────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## What We're Building

### 1. Document Prioritization Status API (NEW)

**Purpose:** Give the UI visibility into document inclusion state.

**Endpoint:** `GET /api/documents/prioritization-status`

```typescript
// Response:
{
  documents: [
    {
      id: "uuid",
      name: "Product-roadmap-Q1.pdf",
      task_count: 12,
      status: "included",  // included | excluded | pending
      included_at: "2024-01-15T10:30:00Z"  // null if not yet included
    },
    // ...
  ],
  summary: {
    included_count: 5,
    excluded_count: 2,
    pending_count: 2,      // New documents not yet prioritized
    total_task_count: 33
  }
}
```

**Implementation:**
- Query `task_embeddings` grouped by `document_id`
- Compare against last baseline's document set (stored in `agent_sessions.baseline_document_ids`)
- New = has completed embeddings but not in last baseline

### 2. Document Count Badge on CTA

**Purpose:** Show users what will change before they click.

**Location:** Next to "Recalculate priorities" button

**States:**
- `(2 new)` – When pending documents exist
- `(up to date)` – When no pending documents
- Nothing shown if never prioritized

**Implementation:**
- Fetch from status API on page load
- Poll every 30s when documents are processing
- Optimistic update after recalculation completes

### 3. Enhanced Outcome Display

**Purpose:** Make the outcome visually prominent.

**Current:**
```tsx
<span className="truncate text-muted-foreground">
  Outcome: {activeOutcome.assembled_text}
</span>
```

**Proposed:**
```tsx
<div className="rounded-lg bg-primary/5 px-4 py-3 shadow-2layer-sm border-l-4 border-primary">
  <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">
    Your Outcome
  </p>
  <p className="text-lg font-medium text-foreground leading-relaxed">
    {activeOutcome.assembled_text}
  </p>
  <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
    {activeOutcome.state_preference && (
      <Badge variant="secondary">{activeOutcome.state_preference}</Badge>
    )}
    {activeOutcome.daily_capacity_hours && (
      <Badge variant="outline">{activeOutcome.daily_capacity_hours}h/day</Badge>
    )}
  </div>
</div>
```

**Design tokens used:**
- `bg-primary/5` – Subtle brand tint
- `border-l-4 border-primary` – Left accent for emphasis
- `shadow-2layer-sm` – Gentle depth
- `text-lg font-medium` – Increased prominence

### 4. Source Documents Section (NEW)

**Purpose:** Show what's included in prioritization, allow quick toggles.

**Location:** Below outcome display, above reflections

**Components:**
- Collapsible section (collapsed by default after first view)
- Document list with checkboxes
- Task count per document
- "Select all" / "Clear all" convenience buttons
- Status badges: `included`, `excluded`, `new`

**Interaction:**
1. User unchecks a document
2. UI shows optimistic state change
3. Exclusion stored in localStorage keyed by `outcomeId`
4. Next recalculation respects exclusions
5. Badge updates: "(2 new)" reflects only non-excluded pending docs

### 5. Prioritize API Enhancement

**Purpose:** Accept document exclusions.

**Request change:**
```typescript
const requestSchema = z.object({
  outcome_id: z.string().uuid(),
  user_id: z.string().min(1),
  active_reflection_ids: z.array(z.string().uuid()).max(50).optional(),
  dependency_overrides: z.array(dependencyOverrideSchema).optional(),
  excluded_document_ids: z.array(z.string().uuid()).optional(),  // NEW
});
```

**Query change:**
```typescript
let query = supabase
  .from('task_embeddings')
  .select('task_id, task_text, document_id, status, manual_overrides')
  .eq('status', 'completed');

if (excludedDocumentIds.length > 0) {
  query = query.not('document_id', 'in', `(${excludedDocumentIds.join(',')})`);
}
```

---

## Fat Marker Sketch

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   [Page Load]                                                │
│         ↓                                                    │
│   ┌─────────────────┐                                        │
│   │ Fetch Doc Status│ → GET /api/documents/prioritization    │
│   │                 │   -status                              │
│   └─────────────────┘                                        │
│         ↓                                                    │
│   ┌─────────────────┐    ┌────────────────┐                  │
│   │  Render UI      │───→│ Outcome Card   │ (prominent)      │
│   │                 │    │ Document List  │ (with toggles)   │
│   │                 │    │ CTA Badge      │ (pending count)  │
│   └─────────────────┘    └────────────────┘                  │
│         ↓                                                    │
│   [User clicks Recalculate]                                  │
│         ↓                                                    │
│   ┌─────────────────┐                                        │
│   │ POST /api/agent │ ← includes excluded_document_ids       │
│   │ /prioritize     │   from localStorage                    │
│   └─────────────────┘                                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Rabbit Holes to Avoid

| Rabbit Hole | Why Dangerous | Boundary |
|-------------|---------------|----------|
| Per-task exclusion | Too granular, complex UI | Document-level only |
| Permanent exclusion storage | Database schema change | localStorage keyed by outcome |
| Real-time document sync | Complex polling logic | Fetch on load + after recalc |
| Document preview/details | Scope creep | Link to dashboard only |
| Smart exclusion suggestions | AI complexity | Manual toggle only |
| Bulk operations | Multi-select UI complexity | One at a time + select all |

---

## No-Gos

- Don't store exclusions in database (localStorage is sufficient for v1)
- Don't add document management UI (use existing dashboard)
- Don't auto-exclude old documents (user decision only)
- Don't show task-level detail in document list (count only)
- Don't rebuild the prioritization card layout (enhance existing)

---

## Risks & Mitigations

| Risk | Why Scary | Mitigation |
|------|-----------|------------|
| localStorage limits | Too many exclusions | Cap at 100 exclusions per outcome |
| Stale exclusions | Document deleted but still excluded | Filter out non-existent docs |
| Performance | Status API slow with many docs | Limit to 50 most recent, paginate |
| User confusion | "Why are tasks missing?" | Show excluded count in summary |
| Outcome too prominent | Distracts from tasks | Test with users, tune styling |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to understand "what will change" | Unknown | <3 seconds (visible badge) |
| Users who exclude documents | 0% (feature doesn't exist) | >30% use it at least once |
| Outcome visibility complaints | Periodic | Zero |
| Wasted recalculations (no changes) | Unknown | -50% (users see pending count) |

---

## Deliverables

### Week 1: Visibility

**Slice 1: Document Status API**
- New endpoint `GET /api/documents/prioritization-status`
- Returns document list with task counts and inclusion status
- Track last baseline's document set

**Slice 2: Pending Count Badge**
- Show "(X new)" badge on recalculate button
- Fetch status on page load
- Update after recalculation

**Slice 3: Outcome Enhancement**
- Redesign outcome display with prominence
- Add left border accent, background tint
- Larger text, better hierarchy

### Week 2: Control

**Slice 4: Source Documents Section**
- Collapsible document list below outcome
- Checkbox toggles for include/exclude
- localStorage persistence keyed by outcomeId

**Slice 5: API Integration**
- Add `excluded_document_ids` to prioritize request
- Filter tasks by document inclusion
- Store baseline document set for diff tracking

**Slice 6: Polish & Edge Cases**
- Handle deleted documents
- "Select all" / "Clear all" buttons
- Loading states and error handling

---

## File Changes Summary

### Create
```
app/api/documents/prioritization-status/route.ts    # New status endpoint
app/priorities/components/SourceDocuments.tsx       # Document list component
```

### Modify
```
app/priorities/page.tsx                    # Enhanced outcome display, integrate components
app/priorities/components/ContextCard.tsx  # Add pending count to recalculate button
app/api/agent/prioritize/route.ts          # Accept excluded_document_ids
lib/mastra/services/agentOrchestration.ts  # Filter by document, track baseline docs
lib/schemas/agentSessionSchema.ts          # Add baseline_document_ids field
```

---

## Dependencies

- Phase 15: Reflection Intelligence (COMPLETE) - No conflicts
- Task embeddings with document_id (COMPLETE)
- Agent session infrastructure (COMPLETE)

---

## Ready When

1. User sees "(3 new)" badge and knows exactly what will change
2. Outcome statement is visually prominent with brand styling
3. User can see all 7 source documents with task counts
4. User excludes 2 old documents with simple checkbox
5. Recalculation respects exclusions and returns 5-document plan
6. Badge updates to "(0 new)" after successful recalculation

---

## Estimated Effort

| Phase | Slices | Estimate |
|-------|--------|----------|
| Week 1: Visibility | 1-3 | 4-6 hours |
| Week 2: Control | 4-6 | 6-8 hours |
| **Total** | **6 slices** | **10-14 hours** |

---

## Appendix: Current Outcome Display

**priorities/page.tsx:2358-2361** – Buried in card description:
```tsx
{activeOutcome && (
  <span className="truncate text-muted-foreground">
    Outcome: {activeOutcome.assembled_text}
  </span>
)}
```

The outcome—the most important context for prioritization—is:
- Using muted foreground color (low contrast)
- Truncated with ellipsis
- Prefixed with "Outcome:" label redundantly
- No visual hierarchy or emphasis
- Lost among other card description text

This pitch elevates it to the prominence it deserves.
