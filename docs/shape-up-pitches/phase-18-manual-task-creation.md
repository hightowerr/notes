# Shape Up Pitch: Phase 18 – Manual Task Creation

## Problem

**Users can't add tasks that don't exist in documents.** The system only works with tasks extracted from uploaded files (PDFs, DOCX, TXT), creating blind spots for:

### Current Gaps

1. **Ad-hoc Tasks**: "Follow up with Sarah about Q4 budget" – no document exists, but task is critical
2. **Verbal Commitments**: Task agreed in a meeting but not yet documented
3. **Quick Captures**: User realizes something needs doing but doesn't want to create a document just to track it
4. **Bridging Work**: User spots a gap in the task list that needs filling but hasn't been extracted

### User Feedback Pattern

> "I have 10 tasks from my meeting notes, but 3 more things came up verbally. I can't add them to the priority list."

> "The system only knows about what's in documents. What about everything else I need to do?"

> "I want to test if a task would be prioritized high, but I don't want to create a fake document."

### Evidence from System

Currently, **100% of tasks** come from document processing pipeline:
- `lib/services/noteProcessor.ts` → extracts from files
- `lib/services/aiSummarizer.ts` → generates structured tasks
- `app/priorities/page.tsx` → displays only document-derived tasks

**Core issue:** No entry point for user-initiated tasks. Users are forced to work around the system (create placeholder documents, keep separate todo lists) instead of with it.

---

## Appetite

**2 weeks (small batch)** – Core CRUD operations + agent integration. This is foundational infrastructure that other features will build on, so we want it right but not over-engineered.

---

## Solution

Build a **Manual Task Creation** system that:

1. **Accepts** user input via "Add Task" button in Prioritize section
2. **Analyzes** task with existing agent to determine optimal placement
3. **Places** task in priority list OR discard pile based on agent analysis
4. **Distinguishes** manual tasks visually from document-derived tasks
5. **Respects** goal changes (auto-invalidate manual tasks when goal changes)
6. **Persists** manual tasks through reprioritization cycles

### Key Innovation: Agent-Driven Placement

Unlike traditional todo apps where users manually set priority, the agent analyzes manual tasks the same way it analyzes document-derived tasks—ensuring consistency and removing manual ranking burden.

---

## Breadboard

```
┌─────────────────────────────────────────────────────────────────┐
│  TASK PRIORITIES                                                │
│  ────────────────────────────────────────────────────────────── │
│  Outcome: Increase credit payment conversion by 20%             │
│                                                                 │
│  [+ Add Task]  ← NEW                                            │
│                                                                 │
│  Active Tasks (47) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ │
│                                                                 │
│  1. 🌟 Implement Apple Pay V6 integration                       │
│     Impact: 8/10 | Effort: 12h | From: meeting-notes-2024.pdf  │
│                                                                 │
│  2. ✋ Follow up with Sarah re: Q4 budget                       │
│     Impact: 7/10 | Effort: 2h | Manual task [Edit] [Delete]    │
│     Placed #2 because directly enables payment feature work    │
│                                                                 │
│  3. 🎯 Optimize checkout flow for mobile                        │
│     Impact: 7/10 | Effort: 16h | From: research-summary.docx   │
│                                                                 │
│  ...                                                            │
│                                                                 │
│  [▼ Show 153 excluded tasks]                                   │
│                                                                 │
│  ────────────────────────────────────────────────────────────── │
│  DISCARD PILE (5)                                              │
│  ────────────────────────────────────────────────────────────── │
│                                                                 │
│  • Reorganize Notion workspace                                 │
│    ✗ Not relevant: No impact on payment conversion metric      │
│    Manual task | [Override] [Confirm Discard]                  │
│                                                                 │
│  • Update team wiki documentation                              │
│    ✗ Not relevant: Administrative overhead                     │
│    Manual task | [Override] [Confirm Discard]                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## State Diagram

```
[User clicks "Add Task"]
         ↓
[Modal: Enter task description]
         ↓
[Submit] ────────────┐
         ↓           │
   ┌─────────────┐   │
   │ ANALYZING   │   │ (Duplicate check)
   │             │   │
   │ • Spinner   │───┼──→ [CONFLICT STATE]
   │ • "Please   │   │         ↓
   │   wait..."  │   │    ┌────────────────┐
   └─────────────┘   │    │ Duplicate task │
         ↓           │    │ detected       │
         │           │    │                │
         │           │    │ [Edit]         │
   [Agent analyzes]  │    │ [Discard]      │
         │           │    └────────────────┘
         ↓           │
   Binary outcome    │
         │           │
    ┌────┴────┐      │
    ↓         ↓      │
PRIORITIZED  NOT RELEVANT
    │              │
    ↓              ↓
┌─────────┐  ┌──────────────┐
│ Appears │  │ Discard Pile │
│ in task │  │              │
│ list at │  │ [Override]   │
│ assigned│  │ [Confirm     │
│ rank    │  │  Discard]    │
│         │  └──────────────┘
│ User    │         │
│ actions:│         │
│         │    [Override]
│ • Mark  │         ↓
│   Done  │   ┌──────────────┐
│ • Delete│   │ Re-analyze   │
└─────────┘   │ Send back to │
              │ ANALYZING    │
              └──────────────┘
                     │
              [Confirm Discard]
                     ↓
              ┌──────────────┐
              │ Permanently  │
              │ discarded    │
              └──────────────┘


[GOAL CHANGE DETECTED]
         ↓
All manual tasks in PRIORITIZED state
         ↓
Auto-transition to NOT RELEVANT
         ↓
Move to Discard Pile
```

---

## What We're Building

### 1. Manual Task Input UI

**Component:** `app/priorities/components/ManualTaskModal.tsx` **[ALREADY EXISTS - enhance]**

**Features:**
- Single text field for task description (1-500 characters)
- Submit button with optimistic UI behavior
- Minimal validation (description required only)
- No additional fields in v1 (Notes, Tags, Effort deferred)

**Input Flow (Async with Optimistic UI):**
```tsx
User clicks "Add Task"
  ↓
Modal opens with focus on description field
  ↓
User types task description (max 500 chars)
  ↓
User clicks Submit
  ↓
Modal closes immediately (reduce friction)
  ↓
Task appears in list with "⏳ Analyzing..." badge
  ↓
Agent analysis completes in background (2-5 seconds)
  ↓
Badge updates to "✋ Manual" + task moves to assigned rank
  OR
  Task moves to Discard Pile with exclusion reason
```

**Rationale:** Async flow reduces cognitive load (m122) and friction (m17). User can continue working while system processes in background.

### 2. Manual Task Data Model

**Database Schema:**

**[TBD: New table or extend existing?]**

**Option A: Extend `task_embeddings` table**
```sql
ALTER TABLE task_embeddings ADD COLUMN source_type TEXT DEFAULT 'document';
-- Values: 'document' | 'manual'

ALTER TABLE task_embeddings ADD COLUMN manual_metadata JSONB;
-- Format: { created_by_user: true, created_at: ISO8601, ... }
```

**Option B: New `manual_tasks` table**
```sql
CREATE TABLE manual_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT CHECK (status IN ('analyzing', 'prioritized', 'not_relevant', 'conflict')),

  -- Analysis results
  agent_rank INTEGER,
  placement_reason TEXT,
  exclusion_reason TEXT,

  -- User actions
  marked_done_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  -- Metadata
  outcome_id UUID REFERENCES user_outcomes(id) ON DELETE CASCADE,
  embedding vector(1536)
);

CREATE INDEX idx_manual_tasks_status ON manual_tasks(status);
CREATE INDEX idx_manual_tasks_outcome ON manual_tasks(outcome_id);
```

**Recommendation:** Option B (separate table) for clarity and easier querying.

### 3. Agent Analysis Integration

**Service:** `lib/services/manualTaskService.ts` **[ALREADY EXISTS - enhance]**

**Functions:**

```typescript
export async function analyzeManualTask(options: {
  taskDescription: string;
  outcomeId: string;
  currentPlan: PrioritizedTaskPlan;
}): Promise<{
  status: 'prioritized' | 'not_relevant' | 'conflict';
  rank?: number;
  placementReason?: string;
  exclusionReason?: string;
  conflictDetails?: {
    duplicateTaskId?: string;
    similarityScore?: number;
  };
}>;
```

**Analysis Steps:**
1. **Duplicate Check:** Compare with existing tasks (document + manual)
   - **Method:** Levenshtein distance (simple string matching)
   - **Threshold:** 85% similarity (catch duplicates, accept some false negatives)
   - **Rationale:** Occam's Razor (m33) - start simple, iterate if needed
   - If duplicate → Return `conflict` state

2. **Agent Placement:** Send to prioritization agent
   - Include task in candidate set alongside document tasks
   - Agent returns binary outcome: include (with rank) or exclude (with reason)
   - Manual tasks receive 1.2x priority boost (m77: reward user engagement)

3. **Persistence:** Store result in database
   - If prioritized → Save with rank, no expiry (indefinite storage)
   - If not relevant → Save with exclusion reason
   - Soft delete model with 30-day auto-purge on user delete (m34: margin of safety)

### 4. Visual Distinction

**Decision:** Single high-contrast badge (m62_contrast)

**Implementation:**
- **Badge:** `✋ Manual` in accent color next to task title
- **Color:** Use existing `--primary-3` (brand accent) for high contrast
- **Placement:** Right-aligned after task text, before actions
- **States:**
  - `⏳ Analyzing...` (gray, during analysis)
  - `✋ Manual` (accent color, after placement)

**Rationale:** One strong visual cue creates clear focal point. Avoid diluting attention with multiple low-contrast elements (icon + background + border). User should instantly recognize manual vs document tasks.

**Example in Task List:**
```
1. 🌟 Implement Apple Pay V6 integration
   Impact: 8/10 | Effort: 12h | From: meeting-notes-2024.pdf

2. Follow up with Sarah re: Q4 budget  ✋ Manual
   Impact: 7/10 | Effort: 2h | [Edit] [Delete] [Mark Done]
```

### 5. User Actions on Manual Tasks

**Mark as Done:** Move to Completed section (m128_zeigarnik)
- Task moves to collapsed "Completed Tasks" section
- Section auto-expands to show newly completed task (provides confirmation)
- User can uncollapse section to review completed tasks
- Creates psychological closure and clear separation

**Delete:** Soft delete with confirm (m34_margin_of_safety)
- Confirm dialog: "Delete this task? You can undo within 30 days."
- Soft delete: Sets `deleted_at` timestamp, hides from UI
- Auto-purge after 30 days (same as document retention)
- Protects users from accidental irreversible loss

**Edit:** Full edit with re-analysis (m01_map_is_not_the_territory)
- Inline edit button opens modal with current description
- User modifies description
- On save, re-triggers agent analysis (task returns to "Analyzing" state)
- Respects that understanding evolves and tasks need updating

### 6. Discard Pile UI

**Component:** `app/priorities/components/DiscardPile.tsx` **[NEW]**

**Decision:** Collapsible section (m123_von_restorff)

**Implementation:**
- **Location:** Bottom of priorities page, after active tasks
- **Default State:** Collapsed with count badge: `▼ Show 5 discarded tasks`
- **Expanded State:** Shows list of not-relevant tasks with exclusion reasons
- **Styling:** Subtle gray background to differentiate from active tasks

**Features:**
- List of tasks marked "Not Relevant" by agent
- Exclusion reason displayed for each
- Actions per task:
  - **Override:** Send back to analysis (re-triggers agent with user justification)
  - **Confirm Discard:** Soft delete (same flow as Delete action)

**Rationale:** Always-visible discard pile creates clutter. Collapsible section makes prioritized tasks stand out as the memorable, important content (isolation effect). Matches existing UX pattern for "Excluded Tasks" section.

### 7. Goal Change Invalidation

**Service:** `lib/services/outcomeService.ts` **[MODIFY]**

**Hook into goal change event:**

```typescript
// When new goal is set (POST /api/outcomes)
export async function onOutcomeChanged(newOutcomeId: string) {
  // Existing: Trigger reprioritization for document tasks

  // NEW: Invalidate all manual tasks
  await supabase
    .from('manual_tasks')
    .update({
      status: 'not_relevant',
      exclusion_reason: 'Goal changed - manual tasks invalidated'
    })
    .eq('status', 'prioritized')
    .eq('outcome_id', newOutcomeId);

  // User sees all manual tasks move to Discard Pile
}
```

**User Experience:**
- Toast notification: "Goal changed. 3 manual tasks moved to Discard Pile for review."
- User can review and override if tasks still apply

### 8. Reprioritization Behavior

**Decision:** Maintain rank with selective re-analysis (m31_equilibrium + m77_bias_from_incentives)

**Implementation:**
- **Default:** Manual tasks maintain their rank (predictability)
- **Re-analysis Triggers:**
  - Goal/outcome change → All manual tasks move to Discard Pile for review
  - User explicitly clicks "Re-analyze All Tasks" button
- **When Re-analyzed:** Apply 1.2x priority boost to manual tasks
- **Rank Changes:** If manual task rank drops >5 positions, show notification with explanation

**Rationale:**
- Equilibrium (m31): Stability and predictability for user-added tasks respect initial intent
- Incentives (m77): Priority boost rewards users for adding human intelligence
- Avoid over-churn: Don't constantly re-shuffle manual tasks unless meaningful system change occurs

---

## Fat Marker Sketch

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   [User Input]                                               │
│         ↓                                                    │
│   ┌─────────────────┐                                        │
│   │ Duplicate Check │                                        │
│   │   (Embeddings)  │ → [CONFLICT] → Edit or Discard        │
│   └─────────────────┘                                        │
│         ↓                                                    │
│   ┌─────────────────┐                                        │
│   │ Agent Analysis  │                                        │
│   │ (Same as docs)  │                                        │
│   └─────────────────┘                                        │
│         ↓                                                    │
│    Binary Outcome                                            │
│   ┌─────┴─────┐                                              │
│   ↓           ↓                                              │
│ RANK      NOT RELEVANT                                       │
│   ↓           ↓                                              │
│ Task      Discard                                            │
│ List      Pile                                               │
│   │           │                                              │
│ Actions:  Override → Re-analyze                              │
│ • Done    Confirm → Permanent                                │
│ • Delete                                                     │
│                                                              │
│ ────────────────────────────────                             │
│ [GOAL CHANGE]                                                │
│       ↓                                                      │
│ All manual tasks                                             │
│       ↓                                                      │
│ NOT RELEVANT state                                           │
│       ↓                                                      │
│ Move to Discard Pile                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Rabbit Holes to Avoid

| Rabbit Hole | Why Dangerous | Boundary |
|-------------|---------------|----------|
| **Perfect duplicate detection** | Endless edge cases (synonyms, paraphrasing) | Use embedding similarity with 85% threshold; accept some false negatives |
| **Rich task metadata** | Users want tags, due dates, assignees, etc. | Start with description only; defer enhancements to v2 |
| **Editing history** | Track every change to manual tasks | No history tracking in v1; delete + re-add is fine |
| **Bulk import** | Users want to paste 20 tasks at once | Single task only; bulk is separate feature |
| **Task dependencies** | Manual task depends on document task | No dependency UI in v1; agent infers from context |
| **Custom placement** | User wants to manually set rank | No manual ranking; agent decides (can override by editing description) |
| **Recurring tasks** | "Every Monday: Check metrics" | Out of scope; add manually each time |

---

## No-Gos

- ❌ Don't build rich task editor (description field only for v1)
- ❌ Don't allow manual rank adjustment (agent decides placement)
- ❌ Don't create separate "My Tasks" list (manual + document tasks in one list)
- ❌ Don't add task categories/projects (use reflections + outcome for context)
- ❌ Don't persist task edit history/versions (edits replace original, no version control)
- ❌ Don't auto-create manual tasks from reflections (user must explicitly add)
- ❌ Don't allow sharing manual tasks with team (single-user only)
- ❌ Don't implement complex duplicate detection (simple string matching, not embeddings)
- ❌ Don't add bulk import/paste (single task at a time)
- ❌ Don't build dependency graph UI (agent infers context)

---

## Risks & Mitigations

| Risk | Why Scary | Mitigation |
|------|-----------|------------|
| **Duplicate tasks proliferate** | Users add manually what already exists in documents | Pre-submission duplicate check with >85% similarity threshold; show warning |
| **Agent always rejects** | Manual tasks frequently marked "not relevant" | Track rejection rate; if >50%, adjust agent prompt to be more inclusive |
| **Goal change wipes critical tasks** | User changes goal, loses important manual tasks | Toast warning before goal change: "This will invalidate 3 manual tasks"; Allow bulk override |
| **Sync issues** | Manual task state out of sync with UI | Optimistic updates with rollback on error; server is source of truth |
| **Spam/noise** | Users add too many low-quality manual tasks | No rate limit in v1; monitor usage and add limit (e.g., 50 manual tasks max) if needed |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Manual tasks added per week per active user | 0 | 3-5 |
| Manual tasks accepted (prioritized) | N/A | >60% |
| Manual tasks overridden after rejection | N/A | <20% |
| Duplicate conflicts detected | N/A | <10% of submissions |
| User satisfaction: "Can add ad-hoc tasks" | 0% | >70% |
| Manual tasks deleted within 1 hour (regret rate) | N/A | <15% |

---

## Deliverables

### Week 1: Core Infrastructure

**Slice 1: Database Schema**
- Create `manual_tasks` table (migration 029)
- Add indexes for performance
- Test CRUD operations

**Slice 2: Manual Task Service**
- `lib/services/manualTaskService.ts`
  - `createManualTask()`
  - `analyzeManualTask()`
  - `updateManualTaskStatus()`
  - `deleteManualTask()`
- Unit tests for service functions

**Slice 3: Duplicate Detection**
- Embedding comparison logic
- Conflict state handling
- Return duplicate task details

### Week 2: UI & Integration

**Slice 4: Add Task Modal**
- Enhance existing `ManualTaskModal.tsx`
- Input field with validation
- Loading states during analysis
- Error handling

**Slice 5: Visual Distinction**
- Single high-contrast `✋ Manual` badge in accent color
- States: `⏳ Analyzing...` (gray) → `✋ Manual` (accent)
- Consistent across all task displays (active list, completed, discard pile)
- Update `TaskRow.tsx` component

**Slice 6: Discard Pile UI**
- New `DiscardPile.tsx` component
- Collapsible section with count
- Override and Confirm Discard actions

**Slice 7: Goal Change Handler**
- Hook into outcome change event
- Auto-transition manual tasks to "not_relevant"
- Toast notification for user awareness

**Slice 8: Reprioritization Integration**
- Maintain manual task ranks by default (predictability)
- Apply 1.2x priority boost when re-analysis triggered
- Show notification if rank drops >5 positions
- Maintain visual distinction after re-prioritization

---

## API Endpoints

### POST /api/tasks/manual
**Purpose:** Create new manual task

**Request:**
```json
{
  "task_description": "Follow up with Sarah re: Q4 budget",
  "outcome_id": "uuid"
}
```

**Response (Success - Prioritized):**
```json
{
  "status": "prioritized",
  "task_id": "uuid",
  "rank": 2,
  "placement_reason": "Directly enables payment feature work"
}
```

**Response (Not Relevant):**
```json
{
  "status": "not_relevant",
  "task_id": "uuid",
  "exclusion_reason": "No impact on payment conversion metric"
}
```

**Response (Conflict):**
```json
{
  "status": "conflict",
  "conflict_details": {
    "duplicate_task_id": "uuid",
    "similarity_score": 0.92,
    "existing_task_text": "Follow up with Sarah about Q4 budget allocation"
  }
}
```

### PATCH /api/tasks/manual/[id]
**Purpose:** Update manual task (edit, mark done, delete)

**Request (Mark Done):**
```json
{
  "action": "mark_done"
}
```

**Request (Delete):**
```json
{
  "action": "delete"
}
```

**Request (Edit):**
```json
{
  "action": "edit",
  "task_description": "Updated description"
}
```

### POST /api/tasks/manual/[id]/override
**Purpose:** Override agent's "not relevant" decision

**Request:**
```json
{
  "user_justification": "This is critical for Q4 planning" // Optional
}
```

**Response:**
```json
{
  "status": "analyzing",
  "message": "Task sent back for re-analysis"
}
```

---

## Database Migration

**Migration 029:** `029_create_manual_tasks.sql`

```sql
-- Manual tasks table
CREATE TABLE IF NOT EXISTS manual_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Analysis state
  status TEXT NOT NULL CHECK (status IN ('analyzing', 'prioritized', 'not_relevant', 'conflict')),
  agent_rank INTEGER,
  placement_reason TEXT,
  exclusion_reason TEXT,

  -- Conflict details
  duplicate_task_id TEXT, -- Can reference task_embeddings.task_id
  similarity_score FLOAT,

  -- User actions
  marked_done_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  -- Metadata
  outcome_id UUID REFERENCES user_outcomes(id) ON DELETE CASCADE,
  embedding vector(1536)
);

-- Indexes for performance
CREATE INDEX idx_manual_tasks_status ON manual_tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_manual_tasks_outcome ON manual_tasks(outcome_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_manual_tasks_created ON manual_tasks(created_at DESC);

-- Vector similarity search (for duplicate detection)
CREATE INDEX idx_manual_tasks_embedding ON manual_tasks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Updated_at trigger
CREATE TRIGGER update_manual_tasks_updated_at
  BEFORE UPDATE ON manual_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## Design Decisions

### Decision Framework

All decisions below use mental models from cognitive science, UX principles, and system design to ensure consistency and user-centered design.

### Decisions Made (16 of 18)

#### UI/UX Decisions

**1. Visual Distinction** → **Single high-contrast badge** ✅
- **Decision:** Use `✋ Manual` badge in accent color next to task title
- **Mental Model:** m62_contrast (Juxtapose for Emphasis)
- **Reasoning:** A single, brightly colored badge creates a clear focal point. Combination of low-contrast elements (icon + background + border) dilutes attention. Start with one strong visual cue.

**2. Analysis Timing** → **Asynchronous with optimistic UI** ✅
- **Decision:** Modal closes immediately after submit, task appears with "Analyzing..." state
- **Mental Model:** m17_friction-and-viscosity (Reduce Friction)
- **Reasoning:** Synchronous modal adds significant friction, stopping user workflow. Async approach allows users to continue working while system processes in background.

**3. Loading State** → **Close modal + show "Analyzing" in list** ✅
- **Decision:** Modal closes on submit, task immediately appears in list with "Analyzing..." badge
- **Mental Model:** m122_cognitive_load (Reduce Cognitive Load)
- **Reasoning:** Blocking modal forces high cognitive load as user can do nothing else. Passive status in list allows user to switch attention to other tasks while system works.

**4. Discard Pile Visibility** → **Collapsible section** ✅
- **Decision:** Collapsed by default with count badge: "Show 5 discarded tasks ↓"
- **Mental Model:** m123_von_restorff_effect (Isolation Effect)
- **Reasoning:** Always-visible discard pile creates clutter and distracts from primary task list. Collapsible section makes prioritized tasks stand out as the memorable, important content.

#### Functionality Decisions

**5. Input Fields** → **Description only** ✅
- **Decision:** Single text field for task description (max 500 characters)
- **Mental Model:** m40_law_of_diminishing_returns (First Field = Highest Value)
- **Reasoning:** Description provides highest value. Each additional field (tags, notes, effort) adds complexity with diminishing returns. Add more fields only if clear, repeated pain points emerge.

**6. Validation Rules** → **Minimal constraints** ✅
- **Decision:** Description required (1-500 chars), no other constraints
- **Mental Model:** m32_bottlenecks (Remove Barriers)
- **Reasoning:** Every validation rule is a potential bottleneck stopping user from completing task. Only enforce absolute minimum necessary constraints. Don't add arbitrary limits.

**7. Duplicate Threshold** → **[NEEDS COST ANALYSIS]** ⏳
- **Options:** 85% (catch more duplicates) vs 90% (fewer false alarms)
- **Mental Model:** m51_trade-offs (Opportunity Cost Analysis)
- **Question:** What's worse for users - annoying false positives or missing real duplicates?
- **Recommendation:** Start with 85%, monitor user override rate, adjust if >20% override

**8. Duplicate Detection** → **Simple string matching** ✅
- **Decision:** Levenshtein distance for v1, embeddings deferred to v2
- **Mental Model:** m33_occams_razor (Simplest Solution First)
- **Reasoning:** String matching is far less complex than embeddings. Only choose complex solution if simple method proves inadequate. Ship, measure, iterate.

#### User Actions

**9. Mark as Done Behavior** → **Move to Completed section** ✅
- **Decision:** Move to collapsed "Completed Tasks" section (auto-expands on add)
- **Mental Model:** m128_zeigarnik_effect (Complete the Loop)
- **Reasoning:** People remember incomplete tasks better than complete ones. Clear separation creates psychological closure. Moving to distinct section respects this mental model.

**10. Delete Scope** → **Soft delete + auto-purge** ✅
- **Decision:** Soft delete with confirm dialog, auto-purge after 30 days
- **Mental Model:** m34_margin_of_safety (Protect from Error)
- **Reasoning:** Hard delete has zero margin of safety for user error. Soft delete builds critical safety margin, protecting users from accidental irreversible loss. Trash/undo pattern is proven UX.

**11. Edit Capability** → **Full edit with re-analysis** ✅
- **Decision:** Allow editing task description, re-triggers agent analysis on save
- **Mental Model:** m01_the_map_is_not_the_territory (Understanding Evolves)
- **Reasoning:** User's initial task is their "map." As they get more information, understanding evolves and map needs updating. Respect that tasks are living documents, not static artifacts.

#### Reprioritization

**12. Priority Boost** → **Yes, 1.2x boost** ✅
- **Decision:** Manual tasks get 1.2x priority multiplier during reprioritization
- **Mental Model:** m77_bias_from_incentives (Reward Engagement)
- **Reasoning:** Priority boost incentivizes users to add their human intelligence. It rewards them for providing valuable non-system information. The 1.2x factor is the "price" system pays for that input.

**13. Rank Stability** → **Maintain rank unless major change** ⏳
- **Decision:** Maintain rank by default, re-analyze only on [NEEDS DEFINITION]
- **Mental Model:** m31_equilibrium (Predictability)
- **Reasoning:** User-added tasks should be stable and predictable, respecting user's initial intent. Only re-evaluate on significant system change.
- **Question:** What constitutes "major change"? Goal change? User triggers full reanalysis? >50% of tasks reprioritized?

#### Data Model

**14. Table Strategy** → **Separate `manual_tasks` table** ✅
- **Decision:** New table (already defined in migration 029)
- **Mental Model:** Modularity (Independent Evolution)
- **Reasoning:** Separate table allows manual task schema to evolve independently without impacting core `task_embeddings`. Prevents "big ball of mud" if task types diverge in future.

**15. Persistence** → **Indefinite storage** ✅
- **Decision:** No auto-expiry (unlike 30-day document retention)
- **Mental Model:** m56_opportunity_cost (User Trust > Storage Cost)
- **Reasoning:** Cost of storage is financial (cheap). Cost of losing user trust from unexpected data loss is enormous. Opportunity cost of frustration far exceeds storage cost.

#### Advanced Features (Deferred to v2)

**16. Bulk Creation** → **Defer to v2** ✅
- **Decision:** Single task creation only in v1
- **Mental Model:** m49_pareto_principle (80/20 Rule)
- **Reasoning:** 80% of value comes from single-task creation. Bulk is power-user feature serving <20% of use cases. Perfect the core experience first.

**17. Task Dependencies** → **Out of scope** ✅
- **Decision:** No dependency UI in v1
- **Mental Model:** m53_interdependence (Avoid Graph Complexity)
- **Reasoning:** Dependencies transform system from simple list to complex graph. Creates web of mutual reliance that's powerful but fragile and hard to manage. Too complex for MVP.

**18. Recurring Tasks** → **Out of scope** ✅
- **Decision:** No recurring task support in v1
- **Mental Model:** m30_feedback_loops (Temporal Complexity)
- **Reasoning:** Recurring tasks introduce temporal feedback loop (scheduling, state management, notifications). Significant complexity. Prove core non-recurring functionality first.

### Remaining Questions (2 of 18)

These require business/cost analysis to finalize:

**Q7: Duplicate Threshold**
- Trade-off between false positives (annoying) vs false negatives (duplicate pollution)
- Recommend: Start at 85%, monitor override rate, adjust if needed

**Q13: Rank Stability Trigger**
- What constitutes "significant system-wide change" that triggers re-analysis?
- Options: Goal change, user manual trigger, >50% task reprioritization
- Recommend: Only on goal change or explicit user "Re-analyze All" button

---

## Dependencies

- **Phase 3:** Agent Runtime (Mastra infrastructure) – COMPLETE
- **Phase 11:** Strategic Prioritization (Agent placement logic) – COMPLETE
- **Phase 14:** Outcome-Driven Prioritization (Filtering + ranking) – COMPLETE
- **Embeddings Service:** For duplicate detection – COMPLETE
- **Task Intelligence:** Gap detection and bridging tasks infrastructure – COMPLETE

---

## Ready When

1. User clicks "Add Task" → Modal opens with description field
2. User enters "Follow up with Sarah about Q4 budget" → Submits
3. Modal closes immediately, task appears with "⏳ Analyzing..." badge
4. Agent analyzes (2-5s), determines rank → Task updates to "✋ Manual" and settles at position #2
5. Task visually distinguished from document-derived tasks (badge/icon)
6. User can Mark Done, Delete, or Edit the task
7. Another manual task analyzed → Agent marks "not relevant"
8. Task appears in Discard Pile with exclusion reason
9. User clicks "Override" → Task re-analyzed and placed in list
10. User changes goal → All manual tasks auto-move to Discard Pile
11. Toast notification: "Goal changed. 3 manual tasks moved to Discard Pile"
12. During scheduled reprioritization → Manual tasks re-analyzed alongside document tasks
13. Users report: "I can finally add tasks on the fly!"

---

## Estimated Effort

| Phase | Slices | Estimate |
|-------|--------|----------|
| Week 1: Infrastructure | 1-3 | 8-10 hours |
| Week 2: UI & Integration | 4-8 | 10-12 hours |
| **Total** | **8 slices** | **18-22 hours** |

---

## Appendix: Related Features

### Future Enhancements (Post v1)
- **Bulk Import:** Paste list of tasks (newline-separated)
- **Task Templates:** Common task patterns (Follow up on..., Research..., Schedule...)
- **Dependencies UI:** Explicitly link manual task to document task
- **Recurring Tasks:** "Every Monday: Review metrics"
- **Task History:** Track edits and state changes
- **Rich Metadata:** Tags, due dates, estimated effort (advanced fields)
- **Export Manual Tasks:** Include in document exports

### Integration Opportunities
- **Bridging Tasks:** Manual tasks can fill detected gaps automatically
- **Reflection-Triggered Suggestions:** "You mentioned X in your reflection. Add as task?"
- **Voice Input:** Speak task description (mobile)
- **Email-to-Task:** Forward email → Creates manual task

---

**Appetite:** 2 weeks (small batch – foundational feature)
**Status:** Approved – 16 of 18 decisions finalized (2 require cost analysis)
**Dependencies:** Phase 3 (Agent Runtime), Phase 11 (Prioritization), Phase 14 (Outcome-Driven)
**Next Phase:** TBD (Enhancements based on user feedback)
