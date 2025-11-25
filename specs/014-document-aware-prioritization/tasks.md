# Tasks: Document-Aware Prioritization

**Input**: Design documents from `/specs/014-document-aware-prioritization/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓, quickstart.md ✓

**Organization**: Tasks are organized as vertical slices by user story. Each task delivers complete user value with UI + backend + data + feedback.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- **[SLICE]**: Complete vertical slice with SEE → DO → VERIFY
- **[POLISH]**: Enhancement to existing working slice

---

## Phase 1: User Story 1 - Enhanced Outcome Visibility (Priority: P1) 🎯 MVP

**Goal**: Make the outcome statement visually prominent so users immediately understand what goal drives prioritization

**User Story**: "As a user viewing the priorities page, I want the outcome statement to stand out visually so I can immediately understand what goal is driving my task prioritization."

**Independent Test**: Load priorities page with active outcome → verify prominent styling with brand-colored border, background tint, and attribute badges

### Implementation

- [X] T001 [SLICE] [US1] Enhanced Outcome Display with Prominent Styling

  **Scope**:
  - UI: Modify `app/priorities/page.tsx` outcome display section (~line 2358-2361)
  - Add brand-colored left border accent (`border-l-4 border-primary`)
  - Add subtle background tint (`bg-primary/5`)
  - Increase text prominence (`text-lg font-medium`)
  - Add shadow for depth (`shadow-2layer-sm`)
  - Display state preference and daily capacity as badges below outcome text

  **Files**:
  - `app/priorities/page.tsx` - Modify outcome display section
  - `app/priorities/components/OutcomeCard.tsx` - NEW: Extract into dedicated component

  **Visible Outcome**: User sees outcome in a visually distinct card with brand accent styling and attribute badges

  **Test Scenario**:
  1. User has active outcome with state preference "focused" and capacity "4 hours"
  2. User navigates to /priorities
  3. User sees outcome prominently displayed with:
     - Brand-colored left border
     - Subtle background tint
     - "focused" and "4 hours" badges below text
  4. User with no outcome sees existing "create outcome" prompt (no regression)

**Checkpoint**: User can see their outcome prominently displayed with visual emphasis

---

## Phase 2: User Story 2 - Pending Document Count Badge (Priority: P1)

**Goal**: Show users how many new documents will be included in recalculation before they click

**User Story**: "As a user about to recalculate priorities, I want to see how many new documents will be included so I know whether recalculating will actually change anything."

**Independent Test**: Add new documents → navigate to priorities → verify badge shows correct pending count → recalculate → verify badge updates

### Implementation

- [X] T002 [SLICE] [US2] Document Status API + Pending Count Badge

  **Scope**:
  - API: Create `app/api/documents/prioritization-status/route.ts`
    - GET endpoint accepting `outcome_id`, `excluded_ids`, `limit` params
    - Query documents with task counts from `task_embeddings`
    - Get baseline document IDs from latest `agent_sessions`
    - Return documents array with status (included/excluded/pending) and summary counts
  - Schema: Create `lib/schemas/documentStatus.ts` with Zod validation
  - UI: Add pending count badge to recalculate button in `app/priorities/page.tsx`
  - Hook: Create `lib/hooks/useDocumentStatus.ts` to fetch document status
  - Database: Add `baseline_document_ids` column to `agent_sessions` table

  **Files**:
  - `app/api/documents/prioritization-status/route.ts` - NEW: Document status endpoint
  - `lib/schemas/documentStatus.ts` - NEW: Zod schemas for API
  - `lib/hooks/useDocumentStatus.ts` - NEW: React hook for fetching status
  - `app/priorities/page.tsx` - Add badge to recalculate button
  - `app/priorities/components/ContextCard.tsx` - Modify to accept pending count prop
  - `supabase/migrations/028_add_baseline_document_ids.sql` - NEW: Add column
  - `app/api/agent/prioritize/route.ts` - Store baseline_document_ids on completion

  **Visible Outcome**: User sees "(N new)" badge on recalculate button when pending documents exist

  **Test Scenario**:
  1. User has run prioritization with 3 documents
  2. User uploads 2 new documents and they finish processing
  3. User navigates to /priorities
  4. User sees recalculate button showing "(2 new)" badge
  5. User clicks recalculate
  6. After completion, badge disappears (no badge shown when up to date)

**Checkpoint**: User knows exactly what will change before committing to recalculation

---

## Phase 3: User Story 3 - Source Documents Visibility (Priority: P2)

**Goal**: Show users which documents contributed to current prioritization with task counts

**User Story**: "As a user reviewing my priorities, I want to see which documents contributed to the current prioritization so I understand the source of my tasks."

**Independent Test**: Run prioritization with 5 documents → view source documents section → verify all 5 listed with accurate task counts

### Implementation

- [X] T003 [SLICE] [US3] Source Documents List with Task Counts

  **Scope**:
  - UI: Create `app/priorities/components/SourceDocuments.tsx`
    - Collapsible section (collapsed by default if >3 documents)
    - List each document with name (truncated with tooltip) and task count
    - Use existing `useDocumentStatus` hook from T002
  - Integration: Add SourceDocuments component to priorities page

  **Files**:
  - `app/priorities/components/SourceDocuments.tsx` - NEW: Document list component
  - `app/priorities/components/index.ts` - Export new component
  - `app/priorities/page.tsx` - Integrate SourceDocuments component

  **Visible Outcome**: User sees collapsible "Source Documents" section listing all contributing documents with task counts

  **Test Scenario**:
  1. User has run prioritization with 5 documents
  2. Document "Product-roadmap-Q1.pdf" contributed 12 tasks
  3. User navigates to /priorities
  4. User sees "Source Documents (5)" section, collapsed by default
  5. User expands section
  6. User sees "Product-roadmap-Q1.pdf - 12 tasks" in the list
  7. User hovers over truncated document name → sees full name in tooltip

**Checkpoint**: User understands exactly which documents are included in their prioritization

---

## Phase 4: User Story 4 - Document Include/Exclude Toggles (Priority: P2)

**Goal**: Allow users to exclude documents from prioritization scope

**User Story**: "As a user preparing to recalculate priorities, I want to exclude certain documents so outdated or irrelevant documents don't pollute my task list."

**Independent Test**: Uncheck 2 documents → recalculate → verify excluded documents' tasks are not in results

### Implementation

- [X] T004 [SLICE] [US4] Document Exclusion Toggles with localStorage Persistence

  **Scope**:
  - UI: Add checkboxes to each document row in SourceDocuments.tsx
  - Hook: Create `lib/hooks/useDocumentExclusions.ts`
    - Read/write localStorage with key `document-exclusions-${outcomeId}`
    - Store `excludedIds: string[]` and `lastUpdated: timestamp`
  - Service: Create `lib/services/documentExclusionService.ts`
    - Exclusion logic with INFO-level logging for changes
  - API: Modify `app/api/agent/prioritize/route.ts`
    - Accept `excluded_document_ids` parameter
    - Filter task query to exclude specified documents
  - Validation: Warn and disable recalculate if all documents excluded

  **Files**:
  - `app/priorities/components/SourceDocuments.tsx` - Add checkbox toggles
  - `lib/hooks/useDocumentExclusions.ts` - NEW: localStorage management
  - `lib/services/documentExclusionService.ts` - NEW: Exclusion logic
  - `app/api/agent/prioritize/route.ts` - Accept excluded_document_ids param
  - `app/priorities/page.tsx` - Pass exclusions to prioritization call

  **Visible Outcome**: User can toggle documents on/off; exclusions persist and affect recalculation results

  **Test Scenario**:
  1. User views Source Documents section with 5 documents
  2. User unchecks "Old-brainstorm.pdf" (6 tasks)
  3. Checkbox shows unchecked, row visually indicates "excluded"
  4. User refreshes page → checkbox remains unchecked (localStorage persisted)
  5. User clicks recalculate
  6. After completion, tasks from "Old-brainstorm.pdf" are NOT in results
  7. User re-checks document, recalculates → tasks return
  8. User excludes ALL documents → warning shown, recalculate button disabled

**Checkpoint**: User has full control over which documents influence their prioritization

---

## Phase 5: Polish & Edge Cases

**Purpose**: Enhancements and edge case handling for document exclusion feature

- [X] T005 [P] [POLISH] [US4] Select All / Clear All Convenience Buttons

  **Scope**:
  - Add "Select all" and "Clear all" buttons to SourceDocuments header
  - "Select all" checks all document checkboxes
  - "Clear all" unchecks all (should trigger exclusion warning)

  **Files**:
  - `app/priorities/components/SourceDocuments.tsx` - Add button row

  **Visible Outcome**: User can quickly include/exclude all documents with one click

  **Test Scenario**:
  1. User has 5 documents, 2 are excluded
  2. User clicks "Select all"
  3. All 5 checkboxes are now checked
  4. User clicks "Clear all"
  5. All 5 checkboxes are unchecked, warning appears, recalculate disabled

- [X] T006 [P] [POLISH] [US4] 30-Day localStorage Expiration

  **Scope**:
  - Modify `useDocumentExclusions.ts` to check `lastUpdated` timestamp
  - If >30 days old, delete entry and return empty exclusions
  - Update `lastUpdated` on every read/write
  - Filter out deleted document IDs from exclusion list

  **Files**:
  - `lib/hooks/useDocumentExclusions.ts` - Add expiration logic
  - `lib/services/documentExclusionService.ts` - Add validation and cleanup

  **Visible Outcome**: Stale exclusions automatically cleared; deleted documents filtered

  **Test Scenario**:
  1. User set exclusions 35 days ago
  2. User visits priorities page
  3. Exclusions are cleared (all documents now included)
  4. User had excluded a document that was deleted
  5. Deleted document ID is filtered out, no error shown

- [X] T007 [POLISH] [US3] Large Document Set Pagination

  **Scope**:
  - API returns max 50 documents by default
  - UI shows "Show more" button if more documents exist
  - Progressive loading for sets >50

  **Files**:
  - `app/api/documents/prioritization-status/route.ts` - Add pagination support
  - `app/priorities/components/SourceDocuments.tsx` - Add "Show more" button
  - `lib/hooks/useDocumentStatus.ts` - Support pagination params

  **Visible Outcome**: Users with 50+ documents can load more progressively

  **Test Scenario**:
  1. User has 75 documents
  2. Page loads showing first 50 documents
  3. "Show more (25 remaining)" button visible
  4. User clicks button
  5. All 75 documents now visible

---

## Dependencies & Execution Order

### Task Dependencies

```
T001 ────────────────────────────────────────────────────► (Independent - US1)

T002 ────► T003 ────► T004 ────► T005, T006 (Sequential - US2→US3→US4)
                                     │
                                     └───► T007 (Can run after T003)
```

### Execution Order

1. **T001** (P1): Can start immediately - no dependencies, pure UI enhancement
2. **T002** (P1): Can start in parallel with T001 - API + badge slice
3. **T003** (P2): Depends on T002 - needs API endpoint
4. **T004** (P2): Depends on T003 - needs document list UI
5. **T005, T006** (Polish): Depends on T004 - enhances exclusion feature
6. **T007** (Polish): Depends on T003 - enhances document list

### Parallel Opportunities

- **T001** can run entirely in parallel with **T002** (different files, different features)
- **T005** and **T006** can run in parallel (different concerns)
- **T007** can run in parallel with **T004, T005, T006** after T003 completes

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete **T001**: Enhanced Outcome Visibility
2. Complete **T002**: Document Status API + Pending Count Badge
3. **STOP and VALIDATE**: Both P1 features independently testable
4. Deploy/demo MVP

### Full Feature Delivery

1. MVP (T001, T002) → Demo
2. Add **T003**: Source Documents List → Test → Demo
3. Add **T004**: Document Exclusion → Test → Demo
4. Add **T005, T006, T007**: Polish → Final testing → Release

---

## Notes

- All slices include observable user outcomes per vertical slice requirements
- API endpoint follows existing patterns in `app/api/` directory
- localStorage patterns match existing `locked-task-${outcomeId}` pattern
- Design tokens from `.claude/standards.md` used consistently
- 30-day expiration per FR-012 clarification
- INFO-level logging per FR-013 clarification
