# Feature Specification: Manual Task Creation

**Feature Branch**: `016-manual-task-creation`
**Created**: 2025-01-26
**Status**: Draft
**Input**: User description: "docs\shape-up-pitches\phase-18-manual-task-creation.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Manual Task with Agent Placement (Priority: P1)

As a user managing my priorities, I need to quickly add tasks that don't exist in any document (like "Follow up with Sarah about Q4 budget") and have the AI agent automatically determine where they fit in my priority list, so I can capture and act on all my work without being constrained by what's in uploaded files.

**Why this priority**: This is the core value proposition - enabling users to add non-document tasks. Without this, users maintain separate todo lists and lose the benefit of unified prioritization.

**Independent Test**: Can be fully tested by clicking "Add Task", entering a description, and verifying the task appears in the priority list with agent-determined ranking. Delivers immediate value as a complete workflow.

**Acceptance Scenarios**:

1. **Given** I'm viewing the priorities page with an active outcome, **When** I click "+ Add Task" and enter "Follow up with Sarah about Q4 budget", **Then** a modal opens with focus on the description field
2. **Given** I've entered a valid task description (10-500 characters), **When** I click Submit, **Then** the modal closes immediately and the task appears with "⏳ Analyzing..." badge
3. **Given** the agent analysis completes successfully, **When** the task is evaluated, **Then** the badge updates to "✋ Manual" and the task moves to its assigned rank position
4. **Given** the agent determines the task is relevant to my outcome, **When** placement completes, **Then** I see the task in my active list with placement reason displayed

---

### User Story 2 - Handle Discard Pile Tasks (Priority: P2)

As a user managing my priorities, I need to review tasks that the AI agent determines are not relevant to my outcome, with the ability to override its decision if I disagree, so I maintain control over what gets included in my priority list.

**Why this priority**: Provides transparency and control over agent decisions. Essential for user trust but secondary to basic task creation functionality.

**Independent Test**: Can be tested by creating a task that the agent marks as "not relevant", verifying it appears in the discard pile, and successfully overriding the decision.

**Acceptance Scenarios**:

1. **Given** I submit a manual task that's not relevant to my outcome, **When** agent analysis completes, **Then** the task appears in the collapsed Discard Pile section with exclusion reason
2. **Given** I have tasks in the Discard Pile, **When** I expand the section, **Then** I see all discarded tasks with their exclusion reasons and available actions
3. **Given** I disagree with a discard decision, **When** I click "Override" on a discarded task, **Then** the task is sent back for re-analysis
4. **Given** I agree with a discard decision, **When** I click "Confirm Discard", **Then** the task is soft-deleted and hidden from the UI

---

### User Story 3 - Manage Manual Tasks (Priority: P2)

As a user managing my priorities, I need to edit, mark as done, or delete my manually created tasks, so I can keep my task list accurate and up-to-date as my understanding evolves.

**Why this priority**: Task management capabilities are essential for maintaining list quality but depend on task creation being functional first.

**Independent Test**: Can be tested by creating a manual task, then performing edit/done/delete operations and verifying correct state changes.

**Acceptance Scenarios**:

1. **Given** I have a manual task in my list, **When** I click the Edit button and modify the description, **Then** the task is re-analyzed and moves to a new rank if needed
2. **Given** I have completed a manual task, **When** I click "Mark Done", **Then** the task moves to the collapsed "Completed Tasks" section
3. **Given** I want to remove a manual task, **When** I click Delete and confirm, **Then** the task is soft-deleted with a 30-day recovery window
4. **Given** I edit a manual task, **When** I save the changes, **Then** the task re-enters "Analyzing" state and triggers re-prioritization

---

### User Story 4 - Duplicate Detection (Priority: P3)

As a user adding manual tasks, I need the system to warn me if I'm creating a task similar to an existing one, so I avoid cluttering my list with duplicate work.

**Why this priority**: Quality-of-life feature that prevents common user mistakes but not essential for MVP functionality.

**Independent Test**: Can be tested by creating a task, then attempting to create a very similar task and verifying the conflict warning appears.

**Acceptance Scenarios**:

1. **Given** I attempt to create a task with >85% similarity to an existing task, **When** I submit, **Then** I see a conflict warning showing the duplicate task
2. **Given** I see a duplicate conflict warning, **When** I review the similar task, **Then** I can choose to edit my task or discard it
3. **Given** I modify my task description to be sufficiently different, **When** I resubmit, **Then** the task is accepted and analyzed normally

---

### User Story 5 - Goal Change Invalidation (Priority: P3)

As a user changing my outcome goal, I need all my manual tasks to be automatically invalidated and moved to the discard pile for review, so I can ensure they still align with my new direction.

**Why this priority**: Important for maintaining goal alignment but only affects users who change goals frequently. Can be added after core functionality is stable.

**Independent Test**: Can be tested by creating manual tasks, changing the outcome, and verifying all manual tasks move to discard pile with appropriate notification.

**Acceptance Scenarios**:

1. **Given** I have 5 manual tasks in my active list, **When** I change my outcome goal, **Then** all manual tasks move to "not_relevant" status
2. **Given** manual tasks have been invalidated by goal change, **When** the operation completes, **Then** I see a toast notification indicating how many tasks were moved
3. **Given** invalidated tasks are in the discard pile, **When** I review them, **Then** I can override individual tasks that still apply to my new goal

---

### User Story 6 - Reprioritization Integration (Priority: P3)

As a user with manual tasks in my list, I need those tasks to maintain their assigned ranks during reprioritization (with a slight priority boost for user engagement), so my manually added work remains stable and predictable.

**Why this priority**: Ensures manual tasks integrate properly with the broader prioritization system but depends on all other functionality being operational.

**Independent Test**: Can be tested by creating manual tasks, triggering reprioritization, and verifying tasks maintain relative position with appropriate boost applied.

**Acceptance Scenarios**:

1. **Given** I have manual tasks in my active list, **When** reprioritization runs, **Then** manual tasks receive a 1.2x priority boost
2. **Given** a manual task drops >5 positions during reprioritization, **When** the operation completes, **Then** I see a notification explaining the rank change
3. **Given** I trigger manual reprioritization, **When** I click "Re-analyze All Tasks", **Then** manual tasks are re-analyzed alongside document tasks

---

### Edge Cases

- What happens when a user creates a manual task without an active outcome? (Should create task but skip agent analysis until outcome is set)
- What happens when the embedding service is unavailable during manual task creation? (Should block task creation with error message "Service unavailable, try again later")
- What happens when a user closes the browser during task analysis? (Task should remain in "analyzing" state and retry on page reload)
- What happens if duplicate detection returns false positives? (User should be able to force-create the task with confirmation)
- What happens when a user deletes all their documents but has manual tasks? (Manual tasks should persist independently as they reference a special manual tasks document)
- What happens during concurrent edits to the same task in multiple browser tabs? (Last-write-wins strategy - most recent save overwrites previous changes)

## Requirements *(mandatory)*

### Functional Requirements

**Manual Task Creation**

- **FR-001**: Users MUST be able to create new tasks by clicking an "+ Add Task" button in the Active Priorities section
- **FR-002**: System MUST require task description between 1 and 500 characters
- **FR-003**: System MUST display a modal with a single text field for task description on "Add Task" click
- **FR-004**: System MUST close modal immediately after submit to reduce friction
- **FR-005**: System MUST display task with "⏳ Analyzing..." badge immediately after modal closes (optimistic UI)
- **FR-006**: System MUST check for duplicate tasks using embedding similarity (>85% threshold) during analysis
- **FR-007**: System MUST block creation if duplicate detected and show conflict warning with similar task details
- **FR-008**: System MUST send manual task to prioritization agent for placement analysis
- **FR-009**: System MUST store manual tasks with indefinite persistence (no 30-day expiry like documents)
- **FR-010**: System MUST generate vector embeddings for manual tasks for semantic search and duplicate detection

**Agent Integration**

- **FR-011**: System MUST display manual tasks with "✋ Manual" badge in accent color after analysis completes
- **FR-012**: System MUST place manual tasks in active list OR discard pile based on agent binary outcome
- **FR-013**: System MUST display placement reason when task is prioritized
- **FR-014**: System MUST display exclusion reason when task is marked not relevant
- **FR-015**: System MUST apply 1.2x priority boost to manual tasks during reprioritization
- **FR-016**: System MUST complete manual task analysis within 10 seconds at 95th percentile

**Task Management**

- **FR-017**: Users MUST be able to edit manual task descriptions
- **FR-018**: System MUST re-trigger agent analysis when task description is edited
- **FR-019**: Users MUST be able to mark manual tasks as done
- **FR-020**: System MUST move completed tasks to collapsed "Completed Tasks" section
- **FR-021**: Users MUST be able to delete manual tasks with confirmation dialog
- **FR-022**: System MUST implement soft delete with 30-day recovery window
- **FR-023**: System MUST auto-purge soft-deleted tasks after 30 days

**Discard Pile**

- **FR-024**: System MUST display discarded tasks in collapsible section at bottom of priorities page
- **FR-025**: System MUST show discard pile collapsed by default with count badge
- **FR-026**: Users MUST be able to override discard decisions and send tasks back for re-analysis
- **FR-027**: Users MUST be able to confirm discard to permanently remove tasks (soft delete)
- **FR-028**: System MUST display exclusion reason for each discarded task

**Goal Change Integration**

- **FR-029**: System MUST automatically invalidate all manual tasks when outcome goal changes
- **FR-030**: System MUST move invalidated tasks to discard pile with reason "Goal changed - manual tasks invalidated"
- **FR-031**: System MUST display toast notification showing count of invalidated tasks
- **FR-032**: Users MUST be able to review and override invalidated tasks individually

### Key Entities

**Manual Task**
- Represents a user-created task (not extracted from documents)
- Has description (1-500 characters), creation timestamp, status, analysis results
- Linked to user's outcome for context
- Generates 1536-dimension vector embedding for semantic operations
- Status values: 'analyzing', 'prioritized', 'not_relevant', 'conflict'
- Includes agent_rank (position in priority list), placement_reason, or exclusion_reason
- Tracks user actions: marked_done_at, deleted_at timestamps
- Supports duplicate detection via similarity_score and duplicate_task_id

**Discard Candidate**
- Represents a manual task marked "not relevant" by agent
- Contains task identifier, description, exclusion reason
- Displayed in collapsible Discard Pile section
- Supports two user actions: Override (re-analyze) or Confirm Discard (soft delete)

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Adoption Metrics**
- **SC-001**: ≥40% of active users create at least 1 manual task within first week of feature launch
- **SC-002**: Users create average of 3-5 manual tasks per week when actively using the system
- **SC-003**: Manual task creation to placement completes in <10 seconds for 95% of submissions

**Quality Metrics**
- **SC-004**: ≥90% of duplicate detection attempts are correctly identified (>85% similarity threshold)
- **SC-005**: <10% of manual task submissions result in duplicate conflicts
- **SC-006**: ≥60% of manual tasks are accepted (prioritized) vs rejected (discarded)
- **SC-007**: <20% of discarded manual tasks are overridden by users (indicates good agent accuracy)
- **SC-008**: <15% of manual tasks are deleted within 1 hour of creation (regret rate)

**User Satisfaction**
- **SC-009**: "I can add ad-hoc tasks" user satisfaction scores ≥70% positive
- **SC-010**: <50% rejection rate for manual tasks (if >50%, indicates agent is too strict)
- **SC-011**: Users report manual task creation as natural workflow, not workaround

**System Performance**
- **SC-012**: Task analysis completes within 10 seconds at P95
- **SC-013**: Duplicate detection check completes in <1 second
- **SC-014**: No re-prioritization loops occur due to manual task operations (<1% error rate)

## Dependencies & Assumptions *(optional)*

### Dependencies

- **Vector Storage**: Supabase pgvector with IVFFlat index for embedding similarity search
- **Mastra Agent Runtime**: Operational prioritization agent for task placement analysis
- **Embeddings Service**: OpenAI text-embedding-3-small (1536-dim) for semantic operations
- **Task Intelligence**: Existing gap detection and task insertion infrastructure from Phase 14
- **Prioritization API**: `/api/agent/prioritize` endpoint operational
- **Outcome Management**: User outcomes system for goal context

### Assumptions

- Users understand "✋ Manual" badge indicates their created tasks vs AI-extracted
- Single-user context (no collaborative task editing between different users)
- Users have JavaScript enabled for optimistic UI updates
- Embedding service (OpenAI API) has >99% availability
- Manual tasks volume per user remains reasonable (<100 active tasks)

## Out of Scope *(optional)*

The following are explicitly NOT part of this feature:

- ❌ Rich task metadata fields (tags, notes, due dates, assignees) - description only for v1
- ❌ Manual rank adjustment - agent decides placement, no drag-and-drop
- ❌ Separate "My Tasks" list - manual and document tasks in unified list
- ❌ Task edit history/versions - edits replace original, no version control
- ❌ Bulk import/paste - single task creation only
- ❌ Auto-create manual tasks from reflections - user must explicitly add
- ❌ Task templates or quick-add snippets
- ❌ Recurring tasks - "Every Monday: Check metrics"
- ❌ Sharing manual tasks with team - single-user only
- ❌ Complex duplicate detection using advanced NLP - simple string matching + embeddings
- ❌ Dependency graph UI - agent infers context, no explicit linking
- ❌ Keyboard shortcuts for task operations
- ❌ Mobile-optimized inline editing - desktop first
- ❌ Custom task categories/projects - use reflections + outcome for context

## Risk Mitigation *(optional)*

### Identified Risks

1. **Duplicate task proliferation**: Users repeatedly add similar tasks without realizing
   - **Mitigation**: Pre-submission duplicate check with >85% similarity threshold; show friendly conflict warning with existing task highlighted

2. **Agent always rejects manual tasks**: Manual tasks frequently marked "not relevant", frustrating users
   - **Mitigation**: Track rejection rate; if >50%, adjust agent prompt to be more inclusive; apply 1.2x priority boost to encourage acceptance

3. **Goal change wipes critical tasks**: User changes outcome goal, loses important manual tasks inadvertently
   - **Mitigation**: Toast warning before goal change showing count of manual tasks that will be invalidated; allow bulk override from discard pile

4. **Sync issues with optimistic UI**: Manual task state out of sync between client and server
   - **Mitigation**: Optimistic updates with automatic rollback on error; server is source of truth; retry failed operations with exponential backoff

5. **Spam/noise from low-quality manual tasks**: Users add too many trivial or unclear tasks
   - **Mitigation**: No rate limit in v1; monitor usage patterns and add limit (e.g., 50 manual tasks max) if abuse patterns emerge

6. **Embedding service unavailability**: OpenAI API downtime blocks manual task creation
   - **Mitigation**: Display clear error message "Service unavailable, try again later"; queue tasks for retry when service returns

7. **Re-prioritization performance**: Manual tasks slow down reprioritization operations
   - **Mitigation**: Maintain separate index for manual tasks; cache embeddings for 5 minutes; only re-analyze on explicit triggers

## Review & Acceptance Checklist *(mandatory)*

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

## Next Steps

1. **Planning Phase**: Run `/plan` to create implementation plan with technical architecture
2. **Task Breakdown**: Run `/tasks` to generate vertical slice tasks in dependency order
3. **Implementation**: Run `/implement` to execute tasks using TDD workflow
4. **Testing**: Execute contract tests, integration tests, and manual QA scenarios
5. **Deployment**: Ship feature and monitor adoption metrics (SC-001 through SC-014)

---

**Specification Complete** ✅
Ready for `/plan` phase
