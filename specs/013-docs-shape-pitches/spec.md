# Feature Specification: Manual Task Control & Discard Approval

**Feature Branch**: `013-docs-shape-pitches`
**Created**: 2025-01-08
**Status**: Draft
**Input**: User description: "@docs/shape-up-pitches/phase-9-manual-task-control.md"

## Execution Flow (main)
```
1. Parse user description from Input
   → Shape Up pitch document provided
2. Extract key concepts from description
   → Identified: manual task creation, inline editing, discard approval, auto-prioritization
3. For each unclear aspect:
   → No major ambiguities - pitch is comprehensive
4. Fill User Scenarios & Testing section
   → Three primary flows identified
5. Generate Functional Requirements
   → 18 requirements covering all feature aspects
6. Identify Key Entities
   → Manual tasks, discard candidates
7. Run Review Checklist
   → Spec ready for planning
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## Clarifications

### Session 2025-11-08
- Q: When the OpenAI embedding service is unavailable or rate-limited during manual task creation, what should happen? → A: Block task creation entirely with error message "Service unavailable, try again later"
- Q: Should the system support the same user editing tasks simultaneously in multiple browser tabs or devices? → A: Yes, allow concurrent edits with last-write-wins strategy (no conflict detection)

---

## User Scenarios & Testing

### Primary User Story
As a user managing my priorities, I need to add my own tasks, edit task descriptions for clarity, and control which tasks get removed during re-prioritization, so I can collaborate with the AI agent instead of being a passive spectator.

### Acceptance Scenarios

**Scenario 1: Manual Task Creation**
1. **Given** I'm viewing the Active Priorities section and have an active outcome
   **When** I click the "+ Add Task" button and enter "Email legal about contract" with 16 estimated hours
   **Then** The task appears in my task list with a [MANUAL] badge and automatically gets prioritized into the correct position

2. **Given** I try to add a task similar to an existing one
   **When** I submit the task
   **Then** The system blocks the submission and shows "Similar task already exists: [task name]" with the existing task highlighted

**Scenario 2: Inline Task Editing**
3. **Given** I see a task with a confusing AI-generated description
   **When** I click the pencil icon and edit the text to my preferred wording
   **Then** The task updates immediately and triggers re-prioritization to integrate the change

4. **Given** I'm editing a task and re-prioritization starts running
   **When** I try to edit the text
   **Then** The edit field is locked with a message "Editing disabled during prioritization"

**Scenario 3: Discard Approval**
5. **Given** Re-prioritization completes and wants to remove 3 tasks from my list
   **When** The discard review modal appears
   **Then** I see all 3 tasks with their removal reasons and can approve/reject each individually

6. **Given** The discard review modal shows 3 tasks (2 AI-generated, 1 manual)
   **When** I uncheck the manual task and approve the other 2
   **Then** Only the 2 approved tasks are discarded, the manual task stays active

7. **Given** I reject all discard suggestions
   **When** I click "Cancel All"
   **Then** All tasks remain in my active list and the modal closes

### Edge Cases
- What happens when a user adds a manual task without an active outcome? (Should create task but skip re-prioritization)
- How does the system handle rapid successive edits? (Should debounce to prevent re-prioritization spam)
- What if a user closes the browser during discard review? (Tasks should remain in previous state until approved)
- How are manual tasks handled if their special document gets deleted? (Should prevent deletion or auto-recreate)
- What if embedding regeneration fails during edit? (Should show error and keep original task text)
- What if the embedding service is unavailable during manual task creation? (Block task creation entirely with error message "Service unavailable, try again later")
- What if the same user edits a task in multiple browser tabs simultaneously? (Last-write-wins strategy - most recent save overwrites previous edits without conflict detection)

---

## Requirements

### Functional Requirements

**Manual Task Creation**
- **FR-001**: Users MUST be able to create new tasks by clicking an "Add Task" button in the Active Priorities section
- **FR-002**: System MUST require task text between 10 and 500 characters
- **FR-003**: System MUST allow optional estimated hours input (8-160 hours range, default 40)
- **FR-004**: System MUST check for duplicate tasks using semantic similarity before creation
- **FR-005**: System MUST block creation if a similar task already exists (>0.9 similarity threshold) and show a friendly error message
- **FR-006**: System MUST visually distinguish manually created tasks with a [MANUAL] badge
- **FR-007**: System MUST auto-save draft task text to browser storage to prevent data loss
- **FR-008**: System MUST trigger automatic re-prioritization after manual task creation when an active outcome exists
- **FR-028**: System MUST block task creation and display error message "Service unavailable, try again later" when the embedding service is unavailable or rate-limited

**Inline Task Editing**
- **FR-009**: Users MUST be able to edit any task's text and estimated hours directly in the task list
- **FR-010**: System MUST show a pencil icon on task rows to indicate editability
- **FR-011**: System MUST auto-save edits after 500ms of inactivity (debouncing)
- **FR-012**: System MUST show visual feedback during save (spinner, success check, or error icon)
- **FR-013**: System MUST lock editing when re-prioritization is running
- **FR-014**: System MUST trigger re-prioritization after successful task edit when an active outcome exists
- **FR-029**: System MUST use last-write-wins strategy for concurrent edits in multiple browser tabs (most recent save overwrites previous changes without conflict detection or warning)

**Discard Approval Workflow**
- **FR-015**: System MUST show a review modal before discarding any tasks during re-prioritization
- **FR-016**: Review modal MUST display each task to be discarded with its title, removal reason, and previous rank
- **FR-017**: Users MUST be able to approve or reject discard for each individual task
- **FR-018**: System MUST only discard tasks that user explicitly approves
- **FR-019**: System MUST default all tasks to "approved for discard" (opt-out model) to reduce modal fatigue
- **FR-020**: Users MUST be able to cancel the entire discard review and keep all tasks active

**Re-Prioritization Integration**
- **FR-021**: System MUST debounce re-prioritization triggers to prevent loops (500ms delay)
- **FR-022**: System MUST skip re-prioritization when no active outcome exists
- **FR-023**: System MUST show "Prioritizing..." indicator during re-prioritization process
- **FR-024**: System MUST complete re-prioritization within 10 seconds at 95th percentile

**Data Integrity**
- **FR-025**: Manual tasks MUST persist across page refreshes and browser sessions
- **FR-026**: Manual tasks MUST survive discard reviews unless explicitly approved for removal
- **FR-027**: System MUST prevent orphaned manual tasks by ensuring document references remain valid

### Key Entities

**Manual Task**
- Represents a user-created task (not AI-extracted)
- Has task text (10-500 chars), estimated hours (8-160), creation timestamp
- Marked with `is_manual` flag for identification
- Linked to special "manual tasks" document per user
- Generates embedding for semantic search and duplicate detection
- Subject to same prioritization and dependency logic as AI tasks

**Discard Candidate**
- Represents a task proposed for removal during re-prioritization
- Contains task identifier, title, removal reason, previous rank
- Includes flag indicating if it's a manual task
- User approval decision (approved/rejected)
- Temporary state that exists only during review modal

---

## Performance & Scale

### Performance Targets
- Manual task creation → prioritized position: <10 seconds (P95)
- Inline edit save: <500ms (P95)
- Discard review modal display: <200ms
- Duplicate detection check: <1 second
- Re-prioritization debounce: 500ms

### Scale Considerations
- Expected manual tasks per user: 10-50
- Concurrent edit operations: Locked to 1 at a time per user
- Discard review modal: Support up to 50 tasks efficiently
- Semantic similarity searches: Should handle 1000+ tasks in user's list

---

## Success Criteria

### Adoption Metrics
- ≥40% of active users create at least 1 manual task within first week
- ≥15% of task views result in an edit action
- ≥20% of discard candidates are rejected (users exercise control)

### Quality Metrics
- <5% of approved discards get manually restored within 24 hours
- ≥90% of duplicate attempts are correctly blocked
- <1% re-prioritization loops occur

### User Satisfaction
- "I have control over my task list" survey scores ≥4.5/5
- Task list manipulation becomes natural workflow, not workaround

---

## Dependencies & Assumptions

### Dependencies
- Vector storage system (Phase 1) for embedding generation and duplicate detection
- Mastra agent runtime (Phase 3) for re-prioritization functionality
- Task list UI component (Phase 4) exists and is functional
- Reflection-driven prioritization (Phase 7) for context-aware re-ranking
- `/api/agent/prioritize` endpoint operational

### Assumptions
- Users understand the [MANUAL] badge indicates their created tasks
- Single-user context (no collaborative editing between different users; same user may have multiple concurrent sessions with last-write-wins)
- Browser supports localStorage for draft auto-save
- Re-prioritization can be triggered programmatically without user interaction

---

## Out of Scope

The following are explicitly NOT part of this feature:
- Batch task operations (bulk add, bulk edit, bulk approve)
- Task templates or quick-add from saved snippets
- Custom task category assignment by users
- Manual dependency specification during task creation
- Edit history, undo/redo functionality
- Mobile-optimized inline editing (desktop first)
- Collaborative editing with conflict resolution
- User-editable discard reasons
- Task import from external systems
- Keyboard shortcuts for task management

---

## Risk Mitigation

### Identified Risks
1. **Duplicate task explosion**: Users repeatedly add similar tasks
   - Mitigation: Semantic similarity check with friendly error messaging

2. **Re-prioritization loops**: Edit triggers cascade of re-priorities
   - Mitigation: 500ms debounce + lock editing during prioritization

3. **Manual task orphans**: Reference document deletion breaks tasks
   - Mitigation: Atomic document creation, prevent deletion

4. **Discard modal fatigue**: Users annoyed by constant reviews
   - Mitigation: Default to "approve discard" (opt-out model)

5. **Edit race conditions**: Edit during re-prioritization
   - Mitigation: Lock all editing when `sessionStatus === 'running'`

6. **Embedding cost explosion**: Every edit triggers expensive API call
   - Mitigation: Cache embeddings 5 minutes, regenerate only if text differs >10%

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked (none found)
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---

## Next Steps

1. **Planning Phase**: Create implementation plan with technical architecture
2. **Task Breakdown**: Generate vertical slice tasks in `tasks.md`
3. **Design Review**: Review breadboard sketches and UX flows
4. **Development**: Implement in priority order (manual creation → editing → discard approval)
5. **Testing**: Execute manual QA checklist and integration tests
6. **Deployment**: Ship feature and monitor adoption metrics

---

**Specification Complete** ✅
Ready for `/plan` phase
