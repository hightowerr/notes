# Tasks: Context-Aware Action Extraction

**Input**: Design documents from `/specs/003-context-aware-action/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

## Execution Flow (Slice-Based)
```
1. Load plan.md from feature directory
   → ✓ Tech stack: Next.js 15, React 19, Vercel AI SDK, Supabase
   → ✓ User stories: 6 acceptance scenarios extracted
   → ✓ Acceptance criteria: FR-001 through FR-015

2. Load spec.md for user journeys:
   → ✓ Primary user actions: Set context, upload document, view filtered actions
   → ✓ Expected outcomes: 3-5 filtered actions (down from 15+)
   → ✓ UI entry points: OutcomeBuilder modal, SummaryPanel

3. Load optional design documents:
   → ✓ data-model.md: user_outcomes extension, Action schema, filtering_decisions
   → ✓ research.md: Semantic similarity, multi-criteria filtering algorithm
   → ✓ quickstart.md: 7 manual test scenarios

4. Generate VERTICAL SLICE tasks:
   → ✓ Each user story = ONE complete slice task
   → ✓ Slice includes: UI component + API endpoint + data layer + user feedback
   → ✓ Validate: Can user SEE, DO, and VERIFY this?
   → ✓ Reject: Backend-only, frontend-only, or infrastructure-only tasks

5. Apply slice ordering rules:
   → ✓ P0: Enable context setting (T016) + AI scoring (T017) + filtering (T018)
   → ✓ P1: Show all toggle (T019), decision logging (T020)
   → ✓ No setup tasks needed (extends existing infrastructure)

6. Mark parallel execution:
   → ✓ T016 (UI) || T017 (AI) = [P] (different files)
   → ✓ T019 || T020 = [P] (UI vs database)

7. Validation:
   → ✓ All tasks include user stories
   → ✓ All tasks specify UI + Backend + Data + Feedback
   → ✓ All tasks have test scenarios
   → ✓ No backend-only or infrastructure-only tasks
```

## Format: `[ID] [TYPE] [P?] User Story & Implementation Scope`
- **[SLICE]**: Complete vertical slice (UI → Backend → Data → Feedback)
- **[SETUP]**: Foundational work blocking ALL slices (none required)
- **[POLISH]**: Enhancement to existing working slice
- **[P]**: Can run in parallel with other [P] tasks

## Path Conventions
- **Web app**: `app/` (Next.js), `lib/`, `components/`
- **API**: `app/api/`, `lib/services/`
- Paths shown below are absolute from repository root

---

## Phase 1: P0 User Journeys (Must-Have Features)

### T016 [P] [SLICE] User sets energy state and daily capacity to personalize filtering

**User Story**: As a knowledge worker, I can specify my current energy state ("Energized" or "Low energy") and daily time capacity (hours) in the outcome builder, so the system can filter actions that match my current availability and mental state.

**Implementation Scope**:
- **UI**: Extend OutcomeBuilder modal (`app/components/OutcomeBuilder.tsx`)
  - Add state selection radio buttons below clarifier field
    * Options: "Energized" | "Low energy"
    * Label: "What's your energy level today?"
  - Add capacity input field (numeric, hours/day)
    * Range: 0.25 to 24 (15 minutes to full day)
    * Label: "How many hours can you work on this daily?"
    * Validation: Display error if <0.25 or >24
  - Update real-time preview to show state + capacity
  - Extend form validation schema (Zod)
- **Backend**: Extend POST `/api/outcomes` endpoint (`app/api/outcomes/route.ts`)
  - Accept `state_preference` (TEXT) and `daily_capacity_hours` (NUMERIC) in request body
  - Validate: state in ['Energized', 'Low energy'], capacity 0.25-24
  - Store to `user_outcomes` table (requires migration 005)
  - Return 400 with descriptive error if validation fails
- **Data**: Database migration (`supabase/migrations/005_add_context_fields.sql`)
  - Add `state_preference TEXT CHECK (state_preference IN ('Energized', 'Low energy'))`
  - Add `daily_capacity_hours NUMERIC(4,2) CHECK (daily_capacity_hours > 0 AND daily_capacity_hours <= 24)`
  - Both columns nullable (backward compat)
  - Apply via Supabase Dashboard → SQL Editor
- **Feedback**:
  - Outcome banner displays state + capacity: "Low energy • 2h/day"
  - Success toast: "Outcome saved with context preferences"
  - Form validation errors appear inline below fields

**Test Scenario**:
1. Navigate to home page (http://localhost:3000)
2. Click "Set Outcome" button
3. Fill existing outcome fields (direction, object, metric, clarifier)
4. Select state: "Low energy"
5. Enter capacity: "2"
6. Verify preview updates to show "Low energy • 2h/day"
7. Click "Save"
8. Verify success toast appears
9. Reload page → confirm state + capacity persist in banner
10. Open Supabase dashboard → check `user_outcomes` table has new columns populated

**Files Modified**:
- `supabase/migrations/005_add_context_fields.sql` (create)
- `app/components/OutcomeBuilder.tsx` (extend)
- `app/components/OutcomeDisplay.tsx` (extend to show state/capacity)
- `app/api/outcomes/route.ts` (extend)
- `lib/schemas/outcomeSchema.ts` (extend)
- `lib/services/outcomeService.ts` (extend)
- `lib/hooks/useOutcomeDraft.ts` (extend for draft save/restore)

**Dependencies**: Requires migration 005 applied to database

---

### T017 [P] [SLICE] AI extracts actions with relevance scores, time estimates, and effort levels

**User Story**: As a knowledge worker, when I upload a document, the AI automatically scores each action's relevance to my outcome goal, estimates required time, and classifies effort level, so the system can intelligently filter tasks without my manual input.

**Implementation Scope**:
- **UI**: Extend SummaryPanel (`app/components/SummaryPanel.tsx`)
  - Display estimated time for each action: "1.5h" badge next to action text
  - Show effort indicator icon: 🔥 (high) or ✅ (low)
  - Add relevance score tooltip (hover over action): "95% relevant to your outcome"
  - Loading state: "Scoring actions against your outcome..."
- **Backend**: Extend AI summarization service (`lib/services/aiSummarizer.ts`)
  - **Phase 1: Enhance extraction schema**
    * Extend `SummarySchema` action object with:
      - `estimated_hours`: z.number().min(0.25).max(8)
      - `effort_level`: z.enum(['high', 'low'])
      - `relevance_score`: z.number().min(0).max(1) (0-100% as decimal)
    * Update AI prompt to estimate time/effort during extraction
  - **Phase 2: Add semantic similarity scoring**
    * Create `scoreActions()` method
    * Fetch active outcome from `user_outcomes` table
    * If outcome exists:
      - Generate outcome embedding: `await embed(outcomeText, { model: 'text-embedding-3-small' })`
      - Generate action embeddings for each extracted action
      - Compute cosine similarity: `cosineSimilarity(outcomeEmbedding, actionEmbedding)`
      - Store relevance_score in action object
    * If no outcome: set relevance_score to 1.0 (100%, no filtering)
  - Extend POST `/api/process` to call `scoreActions()` after extraction
- **Data**:
  - Update `structured_output` JSONB schema in `processed_documents` table
  - Actions now include: `{ text, category, estimated_hours, effort_level, relevance_score }`
  - No migration needed (JSONB flexible schema)
- **Feedback**:
  - Console log: "Scored 12 actions against outcome: Increase revenue"
  - Action cards show time badges immediately after processing
  - Tooltip reveals relevance score on hover

**Test Scenario**:
1. Set outcome: "Increase monthly revenue by 20%" (state: Low energy, capacity: 2h)
2. Upload `sample-meeting-notes.pdf` (contains 12 mixed actions)
3. Observe "Scoring actions against your outcome..." during processing
4. Wait for processing to complete (<8 seconds)
5. Verify SummaryPanel displays actions with:
   - Time estimates: "0.5h", "1.5h", "2.0h"
   - Effort icons: 🔥 or ✅
6. Hover over action → tooltip shows "92% relevant to your outcome"
7. Check database: `processed_documents.structured_output` contains new fields
8. Verify console logs show scoring debug info

**Files Modified**:
- `lib/services/aiSummarizer.ts` (extend)
- `lib/schemas/summarySchema.ts` (extend)
- `app/components/SummaryPanel.tsx` (extend)
- `app/api/process/route.ts` (modify to call scoreActions)

**Dependencies**:
- Requires OPENAI_API_KEY configured (existing)
- Vercel AI SDK with embeddings support (existing)

---

### T018 [SLICE] System automatically filters actions to 3-5 high-priority items matching user context

**User Story**: As a knowledge worker, after uploading meeting notes with 15+ extracted actions, I see only 3-5 high-priority actions that are relevant to my outcome (≥90% match), fit within my daily capacity (≤2h total), and match my energy state (low-effort tasks when "Low energy"), so I can focus without being overwhelmed.

**Implementation Scope**:
- **UI**: Update SummaryPanel display (`app/components/SummaryPanel.tsx`)
  - Show filtered action count: "Showing 4 of 15 actions matching your context"
  - Display "Show all 15 actions" button if filtering applied
  - Add visual indicator for filtered list (subtle background color)
  - Show capacity summary: "2.0h / 2.0h capacity" (total vs available)
  - If no actions pass filter: Warning message with "adjust outcome" link
- **Backend**: Create FilteringService (`lib/services/filteringService.ts`)
  - **Method**: `filterActions(actions: Action[], context: UserContext)`
  - **Algorithm** (three-phase cascade):
    1. **Relevance filter**: Keep actions where `relevance_score >= 0.90`
    2. **Sort by context**:
       - If state = "Low energy": Sort by (effort_level ASC, relevance DESC)
       - If state = "Energized": Sort by (effort_level DESC, relevance DESC)
    3. **Capacity filter**: Select top N actions where `cumulative_hours <= daily_capacity_hours`
  - **Output**: `{ included: Action[], excluded: Action[], decision: FilteringDecision }`
  - **Edge cases**:
    - No actions ≥90% → Return empty included, all in excluded with reason
    - All actions exceed capacity → Return top 1-2 highest relevance with overflow warning
- **Integration**: Extend POST `/api/process` (`app/api/process/route.ts`)
  - After `scoreActions()`, fetch user context from `user_outcomes` table
  - If outcome exists with state + capacity:
    * Call `FilteringService.filterActions(scoredActions, userContext)`
    * Store only `included` actions in `structured_output.actions`
    * Store filtering decisions in `filtering_decisions` JSON field
  - If no outcome or no state/capacity set:
    * Store all actions unfiltered (backward compat)
    * Set `filtering_decisions` to NULL
- **Data**: Use existing `filtering_decisions` JSONB column (added in T016 migration)
- **Feedback**:
  - Toast notification: "Filtered to 4 high-priority actions matching your context"
  - Console log: "Filtering: 15 total → 4 included, 11 excluded (9 low relevance, 2 exceed capacity)"

**Test Scenario**:
1. Set outcome: "Increase sales" (state: "Low energy", capacity: "2")
2. Upload document with 15 mixed actions:
   - 5 sales-related (high relevance)
   - 10 unrelated (low relevance)
   - Mix of high/low effort, 0.5h-4h durations
3. Wait for processing
4. Verify SummaryPanel shows 3-5 actions only
5. Verify displayed actions are:
   - All sales-related (≥90% relevance)
   - Prioritize low-effort (state is "Low energy")
   - Total time ≤2 hours
6. Verify "Show all 15 actions" button appears
7. Check database: `filtering_decisions` JSON has structure:
   ```json
   {
     "context": {"goal": "Increase sales", "state": "Low energy", "capacity_hours": 2.0},
     "included": [4 actions with scores],
     "excluded": [11 actions with exclusion reasons],
     "total_actions_extracted": 15
   }
   ```

**Files Modified**:
- `lib/services/filteringService.ts` (create)
- `lib/schemas/filteringSchema.ts` (create - FilteringDecision Zod schema)
- `app/api/process/route.ts` (extend)
- `app/components/SummaryPanel.tsx` (extend)

**Dependencies**:
- Requires T016 complete (state/capacity fields exist)
- Requires T017 complete (actions have relevance_score, estimated_hours, effort_level)

---

## Phase 2: P1 User Journeys (Nice-to-Have)

### T019 [X] [P] [SLICE] User toggles between filtered and unfiltered action lists

**User Story**: As a knowledge worker, I can click "Show all actions" to see the complete unfiltered list with exclusion reasons, and toggle back to filtered view, so I can understand what was filtered out and why.

**Implementation Scope**:
- **UI**: Extend SummaryPanel (`app/components/SummaryPanel.tsx`)
  - Add toggle button: "Show all X actions" ↔ "Show filtered (Y actions)"
  - In unfiltered view:
    * Display all actions from `structured_output.actions` (original unfiltered list)
    * Mark filtered actions with ✅ badge: "Included in filtered view"
    * Mark excluded actions with 🚫 badge + reason:
      - "Below 90% relevance (scored 65%)"
      - "Exceeds capacity (requires 4h, 2h available)"
    * Different background color for excluded items (muted)
  - Toggle state persists during session (useState, not localStorage)
- **Backend**: Extend GET `/api/status/[fileId]` (`app/api/status/[fileId]/route.ts`)
  - Return both filtered and unfiltered action lists in response
  - Include `filtering_decisions` JSON for exclusion reasons
  - Structure:
    ```typescript
    {
      actions: Action[],  // Filtered list (from structured_output)
      allActions: Action[],  // Unfiltered list (from filtering_decisions.included + excluded)
      filteringApplied: boolean,
      exclusionReasons: { action_text: string, reason: string }[]
    }
    ```
- **Data**: Read from existing `filtering_decisions` JSONB column
  - If NULL → No filtering applied, hide toggle button
  - If exists → Enable toggle functionality
- **Feedback**:
  - Toggle button shows count: "Show all 15 actions"
  - Expanding reveals list with exclusion badges
  - Collapsing returns to filtered 3-5 action view

**Test Scenario**:
1. Complete T018 scenario (filtered to 4 actions from 15)
2. Verify "Show all 15 actions" button appears
3. Click button → List expands to show all 15 actions
4. Verify:
   - 4 included actions have ✅ badge
   - 11 excluded actions have 🚫 badge with reasons
   - Example reason: "Below 90% relevance (scored 42%)"
   - Example reason: "Exceeds capacity (requires 6h, 2h available)"
5. Click "Show filtered (4 actions)" → Collapses to filtered view
6. Test with no outcome set:
   - Upload document → No toggle button appears
   - All actions shown by default

**Files Modified**:
- `app/components/SummaryPanel.tsx` (extend)
- `app/api/status/[fileId]/route.ts` (extend to return unfiltered list)

**Dependencies**:
- Requires T018 complete (filtering applied, decisions logged)

---

### T020 [X] [P] [SLICE] System logs filtering decisions for debugging and transparency

**User Story**: As a developer debugging filtering behavior, I can view structured logs of all filtering decisions (context snapshot, included/excluded actions with scores, exclusion reasons) in the database, so I can diagnose why specific actions were filtered out.

**Implementation Scope**:
- **UI**: Add debug panel in dev mode (`app/components/SummaryPanel.tsx`)
  - Only visible when `process.env.NODE_ENV === 'development'`
  - Expandable "Filtering Debug" accordion at bottom of SummaryPanel
  - Displays:
    * Context snapshot (goal, state, capacity, threshold)
    * All actions with scores in table format
    * Filtering duration (ms)
    * Total counts: extracted, included, excluded
  - JSON download button for full `filtering_decisions` object
- **Backend**: Extend FilteringService (`lib/services/filteringService.ts`)
  - Add logging to `processing_logs` table:
    * Event: 'action_filtering_applied'
    * Metadata: outcome context, action counts, duration
    * Log level: 'info'
  - Console logs (development only):
    ```
    [FilteringService] Applied context-aware filtering
    - Goal: "Increase sales"
    - State: Low energy
    - Capacity: 2.0h
    - Actions: 15 total → 4 included, 11 excluded
    - Duration: 234ms
    - Exclusions: 9 below threshold, 2 exceed capacity
    ```
- **Data**: Store complete `filtering_decisions` JSON in `processed_documents` table
  - Structure from data-model.md (context, included, excluded arrays)
  - Use existing `filtering_decisions` JSONB column (added in T016 migration)
  - Create GIN index for fast queries: `CREATE INDEX idx_filtering_decisions ON processed_documents USING GIN (filtering_decisions);`
- **Feedback**:
  - Console logs appear in browser DevTools during processing
  - Debug panel expandable in development mode
  - Database query returns filtering decisions via Supabase Dashboard

**Test Scenario**:
1. Run development server (`npm run dev`)
2. Upload document with filtering enabled (outcome with state + capacity set)
3. Wait for processing
4. Check browser console → Verify filtering log appears with counts
5. Scroll to bottom of SummaryPanel → Click "Filtering Debug" accordion
6. Verify debug panel shows:
   - Context: "Increase sales • Low energy • 2h"
   - Table with 15 actions, scores, inclusion status
   - Duration: ~200-500ms
7. Click "Download JSON" → Verify complete filtering_decisions object downloads
8. Open Supabase Dashboard → Query `processed_documents` table
9. Verify `filtering_decisions` JSONB column populated with expected structure
10. Check `processing_logs` table for 'action_filtering_applied' event

**Files Modified**:
- `lib/services/filteringService.ts` (extend with logging)
- `app/components/SummaryPanel.tsx` (add debug panel)
- `supabase/migrations/005_add_context_fields.sql` (add GIN index - already included)

**Dependencies**:
- Requires T018 complete (filtering service exists)

---

## Dependencies

```
T016 (UI: state + capacity) ──┐
                               ├──> T018 (Filtering) ──> T019 (Show all toggle)
T017 (AI: scoring) ────────────┘                    └──> T020 (Debug logging)
```

**Parallel Execution**:
- T016 + T017 can run in parallel [P] (different files: UI vs AI service)
- T019 + T020 can run in parallel [P] (UI vs database/logging)
- T018 must wait for both T016 and T017 to complete

---

## Validation Checklist

- [x] Every [SLICE] task has a user story
- [x] Every [SLICE] task includes UI + Backend + Data + Feedback
- [x] Every [SLICE] task has a test scenario
- [x] No backend-only or frontend-only tasks exist
- [x] Setup tasks are minimal (none required - extends existing infrastructure)
- [x] Tasks ordered by user value (P0: core filtering, P1: transparency features)
- [x] Parallel tasks truly operate on independent features/files
- [x] Each task specifies exact file paths to modify

---

## Notes

- **Backward Compatibility**: All tasks maintain compatibility when no outcome exists (filtering disabled)
- **Performance**: T017 adds ~1-2s overhead for embedding API calls (within <8s budget)
- **No New Dependencies**: Uses existing Vercel AI SDK, Zod, Supabase, React Hook Form
- **Migration Required**: T016 adds database migration 005 (must be applied before execution)
- **Test Strategy**:
  - Manual testing via quickstart.md (7 scenarios)
  - Contract tests for filtering logic
  - Integration tests for end-to-end pipeline
