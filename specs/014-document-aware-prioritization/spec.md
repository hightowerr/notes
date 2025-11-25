# Feature Specification: Document-Aware Prioritization

**Feature Branch**: `014-document-aware-prioritization`
**Created**: 2025-11-24
**Status**: Draft
**Input**: Shape Up Pitch - Phase 16: Document-Aware Prioritization

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enhanced Outcome Visibility (Priority: P1)

As a user viewing the priorities page, I want the outcome statement to stand out visually so I can immediately understand what goal is driving my task prioritization.

**Why this priority**: The outcome is the foundation of all prioritization decisions. If users can't see it prominently, they lose context for why tasks are ordered as they are. This is the simplest change with highest visual impact.

**Independent Test**: Can be fully tested by loading the priorities page with an active outcome and verifying the outcome is displayed with prominent styling (background tint, accent border, larger text).

**Acceptance Scenarios**:

1. **Given** a user has an active outcome, **When** they view the priorities page, **Then** the outcome is displayed in a visually prominent card with brand-colored left border accent and subtle background tint.

2. **Given** a user has an active outcome with state preference and daily capacity, **When** they view the priorities page, **Then** both attributes are shown as badges below the outcome text.

3. **Given** a user has no active outcome, **When** they view the priorities page, **Then** the existing "create outcome" prompt is shown (no regression).

---

### User Story 2 - Pending Document Count Badge (Priority: P1)

As a user about to recalculate priorities, I want to see how many new documents will be included so I know whether recalculating will actually change anything.

**Why this priority**: This gives users immediate clarity about what will change before they commit to a potentially time-consuming recalculation. Prevents wasted recalculations and builds user trust.

**Independent Test**: Can be fully tested by adding new documents, visiting the priorities page, and verifying the badge shows the correct count of pending documents.

**Acceptance Scenarios**:

1. **Given** a user has 3 documents with completed embeddings that weren't in the last prioritization, **When** they view the "Recalculate priorities" button, **Then** the button shows "(3 new)" badge.

2. **Given** all documents were included in the last prioritization and no new documents exist, **When** they view the recalculate button, **Then** no badge is shown.

3. **Given** a user has never run prioritization, **When** they view the analyze button, **Then** no document count badge is shown.

4. **Given** a user clicks recalculate and it completes successfully, **When** the page updates, **Then** the badge updates to reflect the new state (0 new).

---

### User Story 3 - Source Documents Visibility (Priority: P2)

As a user reviewing my priorities, I want to see which documents contributed to the current prioritization so I understand the source of my tasks.

**Why this priority**: Transparency about what's included builds trust and helps users understand why certain tasks appear. This is foundational for the document exclusion feature.

**Independent Test**: Can be fully tested by running a prioritization with 5 documents and verifying all 5 are listed in a source documents section with their task counts.

**Acceptance Scenarios**:

1. **Given** a user has run prioritization with tasks from 5 documents, **When** they view the priorities page, **Then** a "Source Documents" section shows all 5 documents with their names and task counts.

2. **Given** a document contributed 12 tasks to prioritization, **When** viewing the source documents list, **Then** that document shows "12 tasks" next to its name.

3. **Given** the source documents section has more than 3 documents, **When** viewing on initial page load, **Then** the section is collapsible and collapsed by default to save space.

4. **Given** a document name is very long, **When** viewing the source documents list, **Then** the name is truncated with ellipsis but full name is available on hover/tooltip.

---

### User Story 4 - Document Include/Exclude Toggles (Priority: P2)

As a user preparing to recalculate priorities, I want to exclude certain documents so outdated or irrelevant documents don't pollute my task list.

**Why this priority**: Gives users control over prioritization scope. Some documents become outdated or contain tasks no longer relevant to current goals.

**Independent Test**: Can be fully tested by unchecking 2 documents, recalculating, and verifying those documents' tasks are not included in the new prioritization results.

**Acceptance Scenarios**:

1. **Given** a user views the source documents list, **When** they uncheck a document, **Then** the UI immediately updates to show the document as "excluded" and the exclusion is persisted to localStorage.

2. **Given** a user has excluded 2 documents and clicks recalculate, **When** prioritization completes, **Then** tasks from those 2 documents are not included in the results.

3. **Given** a user has excluded documents and switches to a different outcome, **When** they view the source documents, **Then** the exclusions are specific to the previous outcome (localStorage keyed by outcomeId).

4. **Given** a user wants to quickly exclude all but one document, **When** they click "Clear all" then check one document, **Then** only that document is included in next recalculation.

5. **Given** a user wants to include all documents again, **When** they click "Select all", **Then** all documents are checked and included in next recalculation.

---

### User Story 5 - Document Status API (Priority: P2)

As a frontend component, I need an API endpoint to fetch document prioritization status so I can display pending counts and document lists accurately.

**Why this priority**: Backend foundation required for Stories 2, 3, and 4. Without this API, the frontend cannot know which documents are included/excluded/pending.

**Independent Test**: Can be fully tested by calling the API endpoint and verifying it returns correct document list with task counts and status indicators.

**Acceptance Scenarios**:

1. **Given** a user has 5 documents with completed embeddings, **When** the API is called, **Then** it returns all 5 documents with their task counts and status (included/excluded/pending).

2. **Given** the last prioritization included 3 documents and 2 new documents were added since, **When** the API is called, **Then** it correctly identifies 3 as "included" and 2 as "pending".

3. **Given** the user has excluded 1 document via localStorage, **When** the API is called with excluded IDs parameter, **Then** that document is marked as "excluded" in the response.

4. **Given** a document was deleted from the system, **When** the API is called with a stale exclusion list, **Then** the deleted document is filtered out and not returned.

---

### Edge Cases

- What happens when a document is deleted between viewing the page and clicking recalculate?
  - System should filter out non-existent document IDs before prioritization.

- What happens when localStorage is cleared or unavailable?
  - All documents default to included. No error shown.

- What happens when there are more than 50 documents?
  - API paginates results, UI shows first 50 with "show more" option.

- What happens when a user excludes all documents?
  - Show warning: "No documents selected. Please include at least one document."
  - Disable recalculate button.

- What happens when the same document has tasks with different statuses?
  - Only count "completed" status tasks in the task count.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display the active outcome in a visually prominent container with brand accent styling.
- **FR-002**: System MUST show a pending document count badge on the recalculate button when new documents exist.
- **FR-003**: System MUST provide a collapsible source documents section showing all documents that contributed to current prioritization.
- **FR-004**: System MUST allow users to toggle document inclusion via checkboxes in the source documents list.
- **FR-005**: System MUST persist document exclusions in localStorage keyed by outcome ID.
- **FR-006**: System MUST respect document exclusions when triggering prioritization via the API.
- **FR-007**: System MUST provide "Select all" and "Clear all" convenience buttons for document selection.
- **FR-008**: System MUST display task count per document in the source documents list.
- **FR-009**: System MUST provide an API endpoint to fetch document prioritization status including counts and inclusion state.
- **FR-010**: System MUST update the pending count badge after successful recalculation.
- **FR-011**: System MUST filter out deleted documents from exclusion lists automatically.
- **FR-012**: System MUST auto-expire document exclusions after 30 days of inactivity (no page visits or exclusion changes).
- **FR-013**: System MUST log document exclusion changes at INFO level including document IDs and action (exclude/include).

### Key Entities

- **Document Prioritization Status**: Represents a document's relationship to prioritization - includes document ID, name, task count, and status (included | excluded | pending).
- **Document Exclusion**: User preference to exclude a document from prioritization - stored in localStorage keyed by outcome ID, contains array of excluded document IDs and a `lastUpdated` timestamp. Auto-expires after 30 days of inactivity.
- **Baseline Document Set**: The set of document IDs that were included in the last successful prioritization run - stored in agent_sessions for diff tracking.

## Clarifications

### Session 2025-11-24

- Q: What should happen when exclusions grow stale (user hasn't visited in weeks)? → A: Exclusions auto-expire after 30 days of inactivity
- Q: What logging level should document exclusion actions use? → A: Info level - log all exclusion changes with document IDs
- Q: When all documents are already included, what should the recalculate button show? → A: No badge at all (cleanest UI)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can understand "what will change" in under 3 seconds by seeing the pending document count badge.
- **SC-002**: Outcome statement achieves WCAG AA contrast ratio (4.5:1) with its new prominent styling.
- **SC-003**: At least 30% of users who have multiple documents use the exclusion feature at least once.
- **SC-004**: Zero user complaints about "outcome visibility" after implementation.
- **SC-005**: Wasted recalculations (clicking recalculate when nothing changed) reduced by 50%.
- **SC-006**: Document status API responds in under 500ms for up to 50 documents.
- **SC-007**: Document exclusion toggles provide optimistic UI updates in under 100ms.
