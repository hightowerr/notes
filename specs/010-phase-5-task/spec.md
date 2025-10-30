# Feature Specification: Task Gap Filling

**Feature Branch**: `010-phase-5-task`
**Created**: 2025-10-28
**Status**: Draft
**Input**: User description: "Phase 5: Task Gap Filling - AI-powered bridging task generation from Shape Up pitch"

## Execution Flow (main)
```
1. Parse user description from Input
   → Feature description loaded from Shape Up pitch document
2. Extract key concepts from description
   → Actors: Users with prioritized task lists
   → Actions: Detect gaps, generate bridging tasks, review suggestions, accept/reject
   → Data: Task sequences, gap indicators, generated task suggestions
   → Constraints: 1 week appetite, 80% precision, <5s generation time
3. For each unclear aspect:
   → All requirements clear from pitch document
4. Fill User Scenarios & Testing section
   → Primary flow: detect gaps → generate suggestions → user review → accept
5. Generate Functional Requirements
   → Gap detection, task generation, user review, insertion with dependencies
6. Identify Key Entities (if data involved)
   → Gap, BridgingTask, GapIndicators
7. Run Review Checklist
   → No implementation details in spec
   → All requirements testable
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## Clarifications

### Session 2025-10-28
- Q: When bridging tasks are accepted and inserted into the plan, where should they be stored? → A: Store in existing `task_embeddings` table with `source='ai_generated'` flag
- Q: What operational metrics should the system log for gap detection and task generation? → A: Minimal: gap count, generation latency, acceptance rate only
- Q: When users edit a suggested task before accepting, what fields should be editable? → A: Description + time estimate
- Q: When semantic search returns zero results (no similar historical tasks), how should the system proceed? → A: Prompt user to provide example tasks manually before generating
- Q: When AI generation fails (timeout, error, invalid response), what should the retry behavior be? → A: Manual retry only - user clicks "Try Again" button

## Problem Statement

Users upload meeting notes and documents that contain incomplete task sequences with logical gaps between steps. The system currently extracts and prioritizes only what's explicitly written, creating "Swiss cheese plans" where critical intermediate tasks are missing.

**Current Pain Points**:
- Plans appear complete but have 20-40% of critical tasks missing
- Users discover gaps only after starting work
- Manual gap-filling post-prioritization wastes time
- Risk of missing critical prerequisites (e.g., "Deploy" appears before "Build")

**Example**:
A user uploads "Q4 Planning Notes" containing:
1. Define Q4 goals
2. Design app mockups
5. Launch on app store

Missing from the plan (not in document):
3. Build app frontend
4. Implement backend API
4.5. Test with beta users

The system has no awareness that tasks #3, #4, and #4.5 are missing, creating a 3-4 week execution gap.

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As a user reviewing my prioritized task plan, I want the system to detect logical gaps between tasks and suggest bridging tasks to fill those gaps, so that my execution plan is complete and I don't discover missing work mid-execution.

### Acceptance Scenarios

1. **Given** a prioritized task list with logical gaps, **When** I view the priorities page, **Then** I see a "Find Missing Tasks" button

2. **Given** I have tasks with significant time or action-type jumps, **When** I click "Find Missing Tasks", **Then** the system analyzes my task sequence and identifies 1-3 gaps with confidence scores

3. **Given** the system has detected gaps, **When** the analysis completes, **Then** I see a modal showing suggested bridging tasks with descriptions, time estimates, cognitive load, and confidence percentages

4. **Given** I'm reviewing suggested tasks, **When** I see a suggestion I don't agree with, **Then** I can uncheck it to reject it (all suggestions are pre-checked by default)

5. **Given** I've reviewed the suggestions, **When** I click "Accept Selected", **Then** the accepted tasks are inserted into my plan with proper dependency relationships

6. **Given** no gaps are detected in my plan, **When** I click "Find Missing Tasks", **Then** I see a message confirming my plan is complete with no gaps detected

7. **Given** I've accepted bridging tasks, **When** I view my updated plan, **Then** the new tasks appear in the correct sequence with dependency links to predecessor and successor tasks

8. **Given** the system is generating suggestions, **When** the AI service fails or times out, **Then** I see a clear error message with a "Try Again" button to manually retry

### Edge Cases

- What happens when a gap detection identifies a false positive (no actual gap)?
  - System requires 3+ indicators before flagging a gap (conservative approach reduces false positives to <20%)
  - User can dismiss the suggestion or choose not to accept any tasks

- How does the system handle circular dependencies created by insertion?
  - System validates dependency chains after insertion and prevents acceptance if cycles detected

- What happens when generated tasks duplicate existing tasks?
  - System checks for semantic duplicates before suggesting (using task embeddings)
  - Generated tasks explicitly instructed to avoid duplicating predecessor or successor

- How does the system handle plans with no similar historical context?
  - When semantic search returns zero results, system prompts user to provide 1-2 example tasks manually
  - User-provided examples are used as reference context for AI generation
  - If user skips manual input, generation proceeds with outcome statement and document context only (marked with lower confidence)

- What happens when estimated time doesn't match gap size?
  - System shows both time gap and estimated task hours, allowing user to judge reasonableness
  - User can edit tasks before acceptance

## Requirements *(mandatory)*

### Functional Requirements

**Gap Detection**:
- **FR-001**: System MUST analyze task sequences to detect logical gaps between consecutive tasks
- **FR-002**: System MUST use at least 4 heuristics to identify gaps: time gap (>1 week), action type jump (e.g., design → launch), missing dependency links, and skill domain jump
- **FR-003**: System MUST require 3 or more indicators present before flagging a potential gap (conservative threshold)
- **FR-004**: System MUST limit gap detection to the top 3 highest-confidence gaps per plan
- **FR-005**: System MUST calculate a confidence score (0-1) for each detected gap based on number of indicators present

**Task Generation**:
- **FR-006**: System MUST generate 1-3 bridging tasks for each detected gap using AI with semantic search context
- **FR-007**: System MUST include task description, estimated hours (8-160 range = 1-4 weeks), required cognition level (low/medium/high), confidence score, and reasoning for each suggestion
- **FR-008**: System MUST base suggestions on the user's active outcome statement and document context
- **FR-009**: System MUST use semantic search against past documents to find similar task sequences as reference
- **FR-009-A**: When semantic search returns zero results, system MUST prompt user to provide 1-2 example tasks manually as reference context
- **FR-009-B**: System MUST allow users to skip manual example input and proceed with outcome statement and document context only (suggestions marked with lower confidence)
- **FR-010**: System MUST avoid generating tasks that duplicate the predecessor or successor tasks
- **FR-011**: System MUST complete generation within 5 seconds per gap
- **FR-012**: System MUST assign confidence scores ≥70% on average for generated tasks

**User Review**:
- **FR-013**: System MUST display all suggested bridging tasks in a modal for user review
- **FR-014**: System MUST pre-select all suggestions by default (opt-out model)
- **FR-015**: Users MUST be able to check/uncheck individual suggestions for acceptance/rejection
- **FR-016**: Users MUST be able to see task details: description, time estimate, cognitive load, confidence score
- **FR-017**: Users MUST be able to edit task descriptions and time estimates before accepting (cognitive load and confidence score are read-only)
- **FR-018**: System MUST show which gap each suggestion fills (predecessor → successor context)

**Task Insertion**:
- **FR-019**: System MUST insert only user-accepted tasks into the plan
- **FR-020**: System MUST establish dependency relationships linking new tasks to predecessors and successors
- **FR-021**: System MUST validate dependency chains for cycles before finalizing insertion
- **FR-022**: System MUST prevent insertion if validation detects circular dependencies
- **FR-023**: System MUST mark inserted tasks as requiring review until user marks them complete
- **FR-024-NEW**: System MUST store accepted bridging tasks in the existing `task_embeddings` table with `source='ai_generated'` flag

**UI Interaction**:
- **FR-025**: System MUST provide a "Find Missing Tasks" button on the priorities view
- **FR-026**: System MUST show gap detection status (analyzing, completed, no gaps found)
- **FR-027**: System MUST display the count of suggestions found (e.g., "3 Tasks Suggested to Fill Gaps")
- **FR-028**: Users MUST be able to cancel the review process without accepting any tasks

**Quality & Performance**:
- **FR-029**: System MUST achieve ≥80% precision in gap detection (manual review validation)
- **FR-030**: System MUST maintain false positive rate <20%
- **FR-031**: System MUST achieve ≥60% user acceptance rate for suggestions (users accept 2/3 tasks)
- **FR-032**: System MUST generate zero duplicate tasks per session
- **FR-033**: System MUST maintain dependency chain integrity at 100% (no broken links after insertion)
- **FR-034**: System MUST handle AI generation failures (timeout, error, invalid response) by displaying a clear error message with a "Try Again" button for manual retry
- **FR-034-A**: System MUST NOT automatically retry failed generation requests
- **FR-035**: System MUST keep AI generation failure rate <5%

**Observability**:
- **FR-041**: System MUST log gap count per analysis session
- **FR-042**: System MUST log generation latency (time to generate suggestions per gap)
- **FR-043**: System MUST log acceptance rate (ratio of accepted to suggested tasks)

**No-Go Requirements** (explicitly out of scope):
- **FR-036**: System MUST NOT automatically insert tasks without user approval
- **FR-037**: System MUST NOT use external research APIs (Firecrawl, Tavily, Perplexity)
- **FR-038**: System MUST NOT regenerate or replace user's explicitly extracted tasks
- **FR-039**: System MUST NOT recursively detect gaps in generated tasks (one pass only, max 3 tasks per gap)
- **FR-040**: System MUST NOT suggest tasks when no gaps detected (no "might be useful" suggestions)

### Key Entities

- **Gap**: Represents a detected logical discontinuity between two tasks in a sequence
  - Attributes: predecessor task ID, successor task ID, gap indicators (time, action type, dependency, skill), confidence score (0-1)
  - Relationships: References two existing tasks in user's plan

- **BridgingTask**: Represents an AI-generated task suggestion to fill a detected gap
  - Attributes: task text description, estimated hours (8-160), required cognition level (low/medium/high), confidence score (0-1), reasoning explanation, source = "ai_generated", requires_review flag
  - Relationships: Generated from a specific Gap, links predecessor and successor tasks
  - Persistence: Stored in existing `task_embeddings` table with `source='ai_generated'` flag to distinguish from extracted tasks

- **GapIndicators**: Collection of heuristics used to identify potential gaps
  - Attributes: time_gap (boolean, >1 week), action_type_jump (boolean, skips 2+ stages), no_dependency (boolean, successor doesn't depend on predecessor), skill_jump (boolean, different skill domains)
  - Used to calculate gap confidence and filter false positives

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable (80% precision, 60% acceptance, <5s generation)
- [x] Scope is clearly bounded (no external APIs, no recursive gap filling, 1 week appetite)
- [x] Dependencies and assumptions identified (requires existing vector search, task prioritization system)

---

## Success Metrics

**Gap Detection** (Week 1):
- Detect gaps with ≥80% precision (manual review of 30 plans)
- False positive rate <20%
- Average 1-3 gaps detected per plan

**Task Generation** (Week 1):
- Generated task confidence: ≥70% average
- User acceptance rate: ≥60% (users accept 2/3 suggested tasks)
- Generation latency: <5 seconds per gap

**User Adoption** (Post-launch):
- ≥40% of users click "Find Missing Tasks" within 7 days
- ≥50% of accepted tasks marked complete within 30 days

**Technical Quality**:
- Zero duplicate tasks generated
- Dependency chain integrity: 100% (no broken dependencies after insertion)
- AI generation failure rate: <5%

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked (none - all requirements clear)
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---

## Dependencies

**Requires (existing features)**:
- Phase 1: Vector Storage (semantic search for task embeddings)
- Phase 2: Tool Registry (Mastra tool infrastructure)
- Phase 3: Agent Runtime (task orchestration agent)
- Phase 4: Integration UI (priorities view for displaying results)

**Enables (future features)**:
- Phase 6: Web Research Integration (enhance task suggestions with external context)
- Advanced gap detection with ML models (beyond heuristics)

---

## Constraints & Assumptions

**Time Constraints**:
- 1 week appetite (5 working days)
- <5 seconds per gap for generation
- Manual review threshold: 30 plans for validation

**Technical Constraints**:
- Use only existing semantic search (no external APIs)
- One-pass gap detection (no recursion)
- Maximum 3 bridging tasks per gap
- Conservative gap detection (3+ indicators required)

**User Assumptions**:
- Users have already uploaded documents and have prioritized tasks
- Users understand their domain well enough to evaluate suggested tasks
- Users prefer opt-out model (pre-selected suggestions)

**Data Assumptions**:
- Task embeddings are already generated and stored
- Document context is available for semantic search
- Active outcome statement exists for context
