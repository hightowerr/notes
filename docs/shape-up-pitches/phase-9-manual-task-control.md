# Shape Up Pitch: Phase 9 – Manual Task Control & Discard Approval

## Problem

**Users cannot add their own tasks to the priority list, cannot edit task descriptions, and have no control over which tasks get automatically discarded during re-prioritization, resulting in lost work and frustration.**

### Reality today
- The agent extracts tasks from documents, but users have no way to add ad-hoc tasks that aren't in any document.
- When users want to reword a confusing task description, they must edit the source document and re-upload it (or it's impossible if it's AI-generated).
- Re-prioritization **automatically discards** tasks that fall out of the new plan—no approval, no review, just gone.
- Users discover important tasks were silently removed only after checking the "Discarded" section.
- The only recovery option is manually clicking "Restore" on each task, which is tedious and error-prone.

### User feedback
> "I need to add a quick task like 'Email legal about contract' but there's no way to do it without creating a fake document."
> "The agent rewrote 'Fix auth bug' as 'Implement authentication system refactoring'—I can't edit it back to what I meant."
> "After re-prioritization, 3 tasks I was actively working on just disappeared. I didn't approve removing them. Why does the system assume it knows better than me?"

**Core issue:** The system treats the task list as AI-controlled territory. Users have no direct manipulation power (add, edit) and no veto power (discard approval), making them spectators instead of collaborators.

---

## Appetite
- **2-week batch** (standard cycle)
- This is two tightly coupled features that must ship together for coherent UX. Shipping manual task add without edit would feel incomplete; shipping discard approval without manual tasks would miss the key use case (protecting user-added tasks from auto-removal).

---

## Solution – High Level

Deliver a manual task management system that:
1. **Adds an "Add Task" button** in the Active Priorities section that opens a quick-capture modal.
2. **Enables inline editing** of any task description and estimated hours directly in the task list.
3. **Shows a discard review modal** after re-prioritization, requiring user approval before removing tasks.
4. **Automatically re-prioritizes** after manual task creation or editing to integrate changes.
5. **Marks manual tasks** with clear visual indicators so users know which tasks they created vs AI-extracted.

---

## Breadboard Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  Active Priorities                                [+ Add Task]│
│                                                                │
│  #1  Implement user authentication           [✏️] [📌] [✓]   │
│      Depends on: Design auth flow                             │
│      ↑ Moved up (confidence +0.15)                            │
│                                                                │
│  #2  Email legal about contract [MANUAL]      [✏️] [📌] [✓]   │
│      (click pencil to edit inline)                            │
│      ⚡ New task - being prioritized...                       │
│                                                                │
│  #3  Refactor authentication system           [✏️] [📌] [✓]   │
│      Depends on: #1, Security review                          │
│      (click task text to edit)                                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Review Proposed Removals                           [Close X] │
├──────────────────────────────────────────────────────────────┤
│  Re-prioritization wants to discard 3 tasks.                  │
│  Review each and approve only the ones you want removed.      │
│                                                                │
│  ☑ Task: "Update documentation for API v2"                    │
│     Reason: Lower priority than new tasks added               │
│     Previous rank: #8                                          │
│     [Keep Active] [Approve Discard]                           │
│                                                                │
│  ☑ Task: "Refactor legacy authentication"                     │
│     Reason: Superseded by task #1 "Implement user auth"       │
│     Previous rank: #12                                         │
│     [Keep Active] [Approve Discard]                           │
│                                                                │
│  ☐ Task: "Email legal about contract" [MANUAL]                │
│     Reason: Removed in re-prioritization                      │
│     Previous rank: #2                                          │
│     [Keep Active] [Approve Discard]                           │
│                                                                │
│  2 tasks will be discarded                                     │
│           [Cancel All] [Apply Changes (Discard 2)]            │
└──────────────────────────────────────────────────────────────┘
```

---

## What We're Building

### 1. Manual Task Creation System

**A. Database Schema**
- Add `is_manual BOOLEAN DEFAULT FALSE` to `task_embeddings`
- Add `created_by TEXT DEFAULT 'default-user'` for ownership tracking
- Create special document per user: `manual-tasks-{userId}` (prevents orphaned tasks)
- Index: `idx_task_embeddings_manual (is_manual, created_by WHERE is_manual = TRUE)`

**B. API Endpoint: `/api/tasks/manual` (POST)**
```typescript
Request: {
  task_text: string (10-500 chars),
  estimated_hours?: number (8-160, default 40),
  outcome_id?: string
}

Response: {
  task_id: string,
  success: boolean,
  prioritization_triggered: boolean
}
```

Flow:
1. Validate input (Zod schema: min 10 chars, max 500; hours 8-160)
2. Generate embedding for semantic search
3. Check for duplicates (similarity > 0.9 threshold)
4. Get/create `manual-tasks-{userId}` document
5. Insert into `task_embeddings` with `is_manual=true`
6. Return task_id + trigger re-prioritization if outcome exists

**C. Frontend: `ManualTaskModal.tsx`**
- Textarea for task text (10-500 char limit with live count)
- Number input for estimated hours (8-160 range, default 40)
- Character count + byte size display
- Auto-save draft to localStorage (like TextInputModal)
- Submit → API call → close modal → show optimistic task in list
- Loading state: "Adding task and re-prioritizing..."

**D. Integration in `TaskList.tsx`**
- Add "+ Add Task" button in Active Priorities header
- Open ManualTaskModal on click
- After successful creation:
  - Add task to local state immediately (optimistic UI)
  - Show "Prioritizing..." badge
  - Trigger `/api/agent/prioritize` (debounced 500ms)
  - Update position when prioritization completes

### 2. Inline Task Editing

**A. API Endpoint: `/api/tasks/[id]` (PATCH)**
```typescript
Request: {
  task_text?: string,
  estimated_hours?: number
}

Response: {
  success: boolean,
  task: { task_id, task_text, estimated_hours, ... }
}
```

Flow:
1. Load existing task from `task_embeddings`
2. Verify permission (manual tasks: creator only; AI tasks: anyone)
3. If task_text changed: regenerate embedding
4. Update `task_embeddings` record
5. Return updated task

**B. Frontend: `TaskRow.tsx` Enhancement**
- Add pencil icon (✏️) button on hover
- Click → task text becomes contentEditable or controlled input
- Blur or Enter → auto-save with debounce (500ms)
- Show save indicator (💾) while saving
- Error toast if save fails
- After save: trigger re-prioritization (debounced)

**C. Edit Mode States**
- `idle` - Normal display, pencil icon visible on hover
- `editing` - Input field active, focus, select all text
- `saving` - Disabled input, spinner icon
- `error` - Red border, error message toast

### 3. Discard Approval Workflow

**A. Frontend: `DiscardReviewModal.tsx`**

State structure:
```typescript
type DiscardCandidate = {
  taskId: string;
  title: string;
  reason: string;
  previousRank: number;
  isManual: boolean;
  approved: boolean; // user's decision
};
```

UI Elements:
- Modal header: "Review Proposed Removals (3 tasks)"
- Task list with checkboxes (default: all checked)
- Each item shows:
  - Task title + [MANUAL] badge if applicable
  - Removal reason from agent
  - Previous rank number
  - [Keep Active] / [Approve Discard] toggle buttons
- Footer: "X tasks will be discarded" counter
- Actions: [Cancel All] [Apply Changes (Discard X)]

**B. Integration in `TaskList.tsx`**

Replace auto-discard logic (lines 492-512):

**BEFORE:**
```typescript
if (!sanitizedTaskIds.includes(taskId)) {
  nextState.statuses[taskId] = 'discarded'; // ❌ Auto-discard
}
```

**AFTER:**
```typescript
const [discardCandidates, setDiscardCandidates] = useState<DiscardCandidate[]>([]);
const [showDiscardReview, setShowDiscardReview] = useState(false);

// Detect tasks to discard
const candidates = prevPlan
  .filter(taskId => !sanitizedTaskIds.includes(taskId))
  .map(taskId => ({
    taskId,
    title: getTaskTitle(taskId),
    reason: removalById.get(taskId)?.removal_reason ?? DEFAULT_REMOVAL_REASON,
    previousRank: priorityState.ranks[taskId] ?? 0,
    isManual: taskLookup[taskId]?.isManual ?? false,
    approved: true // default checked
  }));

if (candidates.length > 0) {
  setDiscardCandidates(candidates);
  setShowDiscardReview(true);
}

// Handle approval
const handleDiscardApproval = (approvedIds: string[]) => {
  updatePriorityState(prev => {
    const next = { ...prev };
    approvedIds.forEach(taskId => {
      next.statuses[taskId] = 'discarded';
    });
    return next;
  });
  flagRecentlyDiscarded(approvedIds);
  setShowDiscardReview(false);
};
```

### 4. Re-Prioritization Trigger Logic

**Debounced trigger:**
```typescript
const triggerReprioritization = useCallback(
  debounce(async () => {
    if (!activeOutcome) return;

    const response = await fetch('/api/agent/prioritize', {
      method: 'POST',
      body: JSON.stringify({
        outcome_id: activeOutcome.id,
        user_id: 'default-user',
        active_reflection_ids: activeReflectionIds
      })
    });

    // Poll for completion...
  }, 500),
  [activeOutcome, activeReflectionIds]
);
```

**Trigger points:**
- After manual task creation (immediate)
- After task edit (500ms debounce)
- Only if outcome_id exists (skip if no active outcome)

### 5. Visual Indicators

**Manual Task Badge:**
- Show `[MANUAL]` pill badge on manually created tasks
- Color: `bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300`
- Position: Next to task title

**Edit State Icons:**
- Pencil (✏️) - Hover state, click to edit
- Save (💾) - Saving in progress
- Check (✅) - Save successful (flash 1s)
- Error (❌) - Save failed

---

## Out of Scope (No-gos)

- **Batch task operations** - No bulk add, bulk edit, bulk approve (Phase 10 if needed)
- **Task templates** - No saved task snippets or quick-add from templates
- **Custom task categories** - Manual tasks use same LNO categorization as AI tasks
- **Task dependencies** - Manual tasks can't specify dependencies during creation (agent determines them)
- **Undo/redo** - No edit history or rollback (localStorage draft is only recovery)
- **Mobile-optimized edit** - Inline edit works on desktop first; mobile gets basic modal edit
- **Collaborative editing** - No conflict resolution for multi-user scenarios
- **Discard reasons editing** - Users can't rewrite the agent's removal reason

---

## Risks & Rabbit Holes

| Risk | Why it's scary | Mitigation |
|------|----------------|------------|
| Duplicate task explosion | Users add "Email legal" 5 times before realizing | Semantic similarity check (>0.9 threshold) blocks duplicates with friendly error |
| Re-prioritization loops | Edit triggers re-priority → new plan → discard modal → edit another task → loop | 500ms debounce + disable editing during prioritization |
| Manual task orphans | If `manual-tasks-{userId}` document gets deleted, tasks break | Create document atomically with first manual task; never allow document deletion |
| Discard modal fatigue | Users get annoyed reviewing every single discard | Default all tasks to "approve discard" (opt-out model); add "Auto-approve for 24h" checkbox |
| Edit race conditions | User edits task while re-prioritization is running | Lock editing during `sessionStatus === 'running'`; show "Prioritization in progress" message |
| Embedding regeneration cost | Every edit triggers new OpenAI embedding call ($$$) | Cache embeddings for 5 minutes; only regenerate if text differs by >10% |

---

## Success Metrics

- **Manual task adoption**: ≥40% of active users create at least 1 manual task within first week
- **Edit frequency**: Users edit task descriptions ≥15% of the time when viewing task details
- **Discard approval accuracy**: <5% of approved discards get manually restored within 24h (indicates good judgment)
- **Discard rejection rate**: ≥20% of discard candidates get "Keep Active" (proves users exercise control)
- **Re-prioritization latency**: Manual task → prioritized position in <10 seconds at P95
- **Duplicate prevention**: Semantic similarity check blocks ≥90% of actual duplicates
- **User satisfaction**: "I have control over my task list" survey question scores ≥4.5/5

---

## Deliverables

1. **Database migration:** `024_add_manual_task_support.sql`
   - Add `is_manual`, `created_by` columns
   - Create index on manual tasks

2. **API endpoints:**
   - `/api/tasks/manual` (POST) - Create manual task
   - `/api/tasks/[id]` (PATCH) - Edit task text/hours

3. **Services:**
   - `lib/services/manualTaskService.ts` - Create, update, validate manual tasks
   - Update `lib/services/taskInsertionService.ts` - Handle manual task document references

4. **Components:**
   - `app/components/ManualTaskModal.tsx` - Task creation form
   - `app/components/DiscardReviewModal.tsx` - Discard approval UI
   - Update `app/priorities/components/TaskRow.tsx` - Add inline edit mode
   - Update `app/priorities/components/TaskList.tsx` - Integrate modals, replace auto-discard

5. **Integration tests:**
   - Manual task creation → appears in list → prioritizes correctly
   - Edit task text → regenerates embedding → re-prioritizes
   - Discard review: approve all → tasks discarded
   - Discard review: reject all → tasks stay active
   - Discard review: selective approval → correct tasks removed
   - Duplicate detection blocks similar tasks
   - Edit debouncing prevents re-prioritization spam

6. **Manual QA checklist:**
   - [ ] Add manual task without outcome (should work, no prioritization)
   - [ ] Add manual task with outcome (should trigger prioritization)
   - [ ] Edit AI-generated task (should update + re-prioritize)
   - [ ] Edit manual task (should update + re-prioritize)
   - [ ] Try to add duplicate task (should block with friendly message)
   - [ ] Edit multiple tasks rapidly (should debounce to single re-priority)
   - [ ] Discard review: Approve all
   - [ ] Discard review: Reject all
   - [ ] Discard review: Selective approval
   - [ ] Edit task during prioritization (should be locked)
   - [ ] Restore discarded task, then re-prioritize (should stay if approved)

---

## Dependencies

- **Phase 1**: Vector storage (for embedding generation + duplicate detection)
- **Phase 2**: Mastra tool registry (for re-prioritization agent)
- **Phase 3**: Agent runtime (for task prioritization)
- **Phase 4**: Integration UI (task list component exists)
- **Phase 7**: Reflection-driven coherence (re-prioritization respects active reflections)
- **Existing**: `task_embeddings` table, `/api/agent/prioritize` endpoint

---

## Ready When

- User clicks "+ Add Task" → modal opens → enters task → saves → task appears in Active Priorities with [MANUAL] badge → re-prioritization runs → task moves to correct rank
- User clicks pencil icon on any task → edits text → blur/Enter → saves → re-prioritization runs → task updates position
- Re-prioritization completes → discard review modal appears → user reviews 3 tasks → approves 2, rejects 1 → only 2 get discarded, 1 stays active
- User tries to add duplicate task → sees "Similar task already exists: 'Email legal about contract'" error → can't proceed
- User edits task while prioritization running → sees "Editing disabled during prioritization" tooltip → must wait
- Manual tasks persist across page refreshes and survive discard reviews unless explicitly approved
- Telemetry shows: manual task creation events, edit events, discard approvals/rejections, duplicate blocks

---

**Last Updated:** 2025-01-08
**Status:** Approved
**Appetite:** 2 weeks (standard batch)
**Dependencies:** Phases 1-4, 7
