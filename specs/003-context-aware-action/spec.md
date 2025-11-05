# Feature Specification: Context-Aware Action Extraction

**Feature Branch**: `003-context-aware-action`
**Created**: 2025-10-16
**Status**: Draft
**Input**: User description: "Context-aware action extraction that filters tasks based on user goals, state, and capacity"

## Execution Flow (main)
```
1. Parse user description from Input
   → ✓ Feature description provided
2. Extract key concepts from description
   → Identify: actors, actions, data, constraints
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   → ✓ Clear user flow identified
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## Clarifications

### Session 2025-10-16
- Q: FR-002 requires predefined state values for users to describe their current mental/energy state. What state options should the system provide? → A: Simple binary: "Energized" / "Low energy"
- Q: FR-003 needs to define how users specify their available capacity. How should capacity be measured? → A: Time-based: Daily hours available (e.g., "2 hours/day")
- Q: The AI must semantically match actions to user goals. What minimum relevance threshold should trigger action inclusion? → A: 90% semantic match (only highly confident matches)
- Q: Where should users set their context (goal, state, capacity) in the UI? → A: Always use outcome statement
- Q: FR-013 requires logging filtering decisions. Where should these logs be stored for debugging? → A: Embedded in processed_documents (store as JSON field in existing records)

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As a knowledge worker, when I upload meeting notes, I want the system to automatically extract only the actions that align with my current goal, state, and capacity, so I can focus on what truly matters without being overwhelmed by irrelevant tasks.

### Acceptance Scenarios

1. **Given** I have set my goal as "Increase sales" and uploaded meeting notes containing both sales-related actions ("Follow up with enterprise leads") and unrelated tasks ("Plan team lunch"), **When** the AI processes the document, **Then** I receive 3-5 prioritized actions that directly relate to increasing sales, with irrelevant tasks automatically filtered out.

2. **Given** I have defined my current state as "Low energy" with limited capacity, **When** the AI extracts actions from my notes, **Then** the system prioritizes shorter, lower-effort tasks and excludes complex, time-intensive actions that would exceed my available energy.

3. **Given** I have set my goal as "Launch new product" and my capacity as "2 hours per day", **When** the AI processes a project planning document, **Then** each extracted action includes an estimated time requirement and only actions fitting within my daily capacity are prioritized.

4. **Given** I have not set an active outcome statement (no user context exists), **When** I upload a document, **Then** the system extracts all actions as it currently does (backward compatibility maintained).

5. **Given** I have set my goal as "Reduce operational overhead" and uploaded strategic planning notes, **When** the AI categorizes tasks using the LNO framework, **Then** "Leverage" tasks that reduce overhead are prioritized over "Neutral" or "Overhead" tasks.

6. **Given** I have set my state as "Energized", **When** the AI processes my notes, **Then** higher-effort, more complex actions are included and prioritized over simpler tasks.

### Edge Cases

- **What happens when no actions align with the user's outcome goal?** System returns a message indicating no relevant actions were found, along with the option to view all extracted actions or adjust the outcome statement.

- **How does the system handle vague or broad goals?** System extracts actions using keyword matching and semantic similarity. If the goal is too vague (e.g., "Be better"), system prompts user to refine their goal for better filtering.

- **What if the user's capacity is unrealistic?** System still filters based on time capacity but includes a warning when no actions fit within the stated daily hours (e.g., all actions require >2h but capacity is 2h/day), suggesting capacity adjustment or goal refinement.

- **How are conflicting contexts handled?** Example: Goal is "Increase sales" but state is "Low energy" with minimal capacity. System prioritizes low-effort sales actions and excludes high-effort ones, respecting capacity constraints over goal breadth.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST derive the user's goal from the existing active outcome statement (already implemented in T008-T011), using the assembled outcome text as the goal context

- **FR-002**: System MUST extend the existing outcome management UI to include state selection (two options: "Energized" or "Low energy")

- **FR-003**: System MUST extend the existing outcome management UI to include daily time capacity input field (numeric hours, e.g., "2", "4")

- **FR-004**: System MUST use the user's goal to filter extracted actions, excluding actions with semantic relevance score below 90% (only highly confident matches included)

- **FR-005**: System MUST use the user's state to adjust action priority, favoring low-effort actions when state is "Low energy" and higher-effort actions when state is "Energized"

- **FR-006**: System MUST use the user's daily time capacity to limit extracted actions, ensuring the total estimated time for all returned actions does not exceed the user's stated daily hours

- **FR-007**: System MUST provide estimated time in hours (e.g., "0.5h", "2h") and effort level (high/low) for each extracted action to enable capacity-based filtering

- **FR-008**: System MUST reduce extracted actions from the current average (unfiltered list) to 3-5 high-priority actions when user context is provided

- **FR-009**: System MUST maintain backward compatibility by extracting all actions when no user context is set

- **FR-010**: System MUST persist user context (goal from outcome statement, state, capacity) in the existing user_outcomes table, automatically applying it to all document processing until changed

- **FR-011**: System MUST display a visual indicator showing which actions were filtered out and allow users to view the complete unfiltered list on demand (retrieved from filtering decisions JSON in processed_documents)

- **FR-012**: System MUST automatically apply context-based filtering without requiring user approval for each filtered action

- **FR-013**: System MUST log all filtering decisions (which actions were excluded and why) as a JSON field in the processed_documents table, including context snapshot and relevance scores for transparency and debugging

- **FR-014**: System MUST NOT build dependency tracking between tasks (explicitly out of scope)

- **FR-015**: System MUST NOT implement complex task management features beyond filtering and prioritization (explicitly out of scope)

### Key Entities

- **User Context**: Derived from the existing active outcome statement (T008-T011). Goal is the assembled outcome text. State and capacity are new fields added to the user_outcomes table. All three values persist across sessions and apply to all document processing operations.

- **Action**: An extracted task from a document, now enhanced with estimated time in hours (numeric), estimated effort level (high/low), relevance score 0-100% (semantic alignment with user goal), and filtered status (included if score ≥90%, excluded if <90%).

- **Filtering Decision**: A JSON object stored in processed_documents table capturing all filtering decisions for a document. Contains: user context snapshot (goal, state, capacity), array of all extracted actions with their relevance scores (0-100%), inclusion status (included/excluded based on 90% threshold), and filtering rationale.

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
- [x] Success criteria are measurable (3-5 actions vs. unfiltered list)
- [x] Scope is clearly bounded (no dependency tracking, no complex task management)
- [x] Dependencies and assumptions identified (builds on existing action extraction)

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities resolved (2 clarifications completed)
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---
