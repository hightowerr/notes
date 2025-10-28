# Feature Specification: Context-Aware Dynamic Re-Prioritization

**Feature Branch**: `010-docs-shape-pitches`
**Created**: 2025-10-26
**Status**: Draft
**Input**: User description: "@docs/shape-up-pitches/phase-5-context-aware-reprioritization.md"

## Clarifications

### Session 2025-10-26
- Q: What recency decay model should be used for reflection weighting? → A: Step function (100% for 0-7 days, 50% for 8-14 days, 25% after 14 days)
- Q: What debounce delay should be used when a user toggles multiple reflections rapidly? → A: 1000ms delay - wait 1 second after last toggle before recalculating
- Q: When should contradictory tasks be completely filtered (hidden) vs. merely demoted (lowered in rank)? → A: Always demote - lower contradictory tasks in rank but keep visible
- Q: How should reflection usage rate and user satisfaction metrics be collected? → A: Server-side event logging only - track API calls, no user surveys
- Q: When priority adjustment fails, what should happen to the user's reflection toggle state? → A: Rollback toggle - revert UI to previous state, show error message

## Problem Statement

Users currently experience a disconnect between their long-term outcomes and their immediate reality when viewing task priorities. The system prioritizes tasks based solely on desired outcomes, completely ignoring current constraints such as:

- **Project stage**: "We don't have an app yet, still in design phase"
- **Time availability**: "Back-to-back meetings today, only 30min blocks available"
- **Energy levels**: "Feeling burnt out after launch, need lighter tasks"
- **External blockers**: "Waiting on legal review, can't touch contracts"

This results in irrelevant or impossible-to-execute priorities that reduce user trust in the prioritization system.

### Current Pain Points

1. **Hidden context system**: Reflections exist but are buried in a sidebar (Cmd+Shift+R)
2. **No visibility at decision point**: Users don't see context before analyzing tasks
3. **Slow adjustment**: Any context change requires a full 30-second agent re-run
4. **No feedback loop**: Users can't see how context influenced priorities

---

## User Scenarios & Testing

### Primary User Story

As a user managing multiple tasks toward a long-term outcome, I want to provide quick context about my current situation (stage, constraints, blockers) so that task priorities reflect both my goals AND my immediate reality, allowing me to take meaningful action today.

### Acceptance Scenarios

#### Scenario 1: Adding Context Before Prioritization
1. **Given** I visit the priorities page with no reflections added
2. **When** I see a context card showing "No context added yet" with an "Add Current Context" button
3. **And** I click the button to add "Still in design phase, no app yet"
4. **And** I click "Analyze Tasks"
5. **Then** priorities should surface design-stage tasks (like "Design landing mockups") over app-dependent tasks (like "A/B test app icons")
6. **And** I should see visual indicators showing which tasks were affected by my context

#### Scenario 2: Toggling Existing Context
1. **Given** I have 5 recent reflections displayed in the context card
2. **And** one reflection says "Burnt out after launch, need lighter tasks"
3. **When** I toggle that reflection OFF
4. **Then** priorities should adjust within 500 milliseconds
5. **And** heavy/complex tasks should move up in priority
6. **And** I should see movement badges showing which tasks changed position and why

#### Scenario 3: Adding Context After Prioritization
1. **Given** I already have a prioritized task list displayed
2. **When** I add a new reflection "Client demo tomorrow"
3. **Then** priorities should adjust instantly (< 500ms)
4. **And** demo-related tasks should jump to higher priority
5. **And** I should see clear visual feedback showing the adjustment

#### Scenario 4: Contradictory Context Demotion
1. **Given** I have an outcome "Increase App downloads by 25%"
2. **And** I add context "We don't have an app yet, still in design phase"
3. **When** I analyze tasks
4. **Then** app-dependent tasks should be demoted to lower priority positions (not hidden)
5. **And** I should see explanations like "Requires app (contradicts context)"

### Edge Cases

- **What happens when a user has zero reflections?** Display an inviting empty state with "Add Current Context" button, making reflections discoverable
- **What happens when two reflections contradict each other?** Most recent reflection takes precedence (recency weighting)
- **What happens when baseline plan is stale (>24 hours)?** Show warning to user; block adjustments if >7 days old, requiring full re-run
- **What happens if adjustment takes longer than 500ms?** Show "Adjusting priorities..." loading indicator to maintain user confidence
- **How does the system handle toggling multiple reflections rapidly?** System debounces with 1000ms delay, waiting 1 second after the last toggle before recalculating priorities
- **What happens when priority adjustment fails?** System performs optimistic rollback: reverts toggle UI to previous state, displays error message to user, maintains database consistency

---

## Requirements

### Functional Requirements

#### Context Visibility & Discovery
- **FR-001**: System MUST display a context card showing 5 most recent reflections BEFORE the "Analyze Tasks" button
- **FR-002**: System MUST show an empty state with "Add Current Context" call-to-action when user has no reflections
- **FR-003**: Context card MUST provide clear visual indication of which reflections are active vs. inactive
- **FR-004**: Users MUST be able to add new context/reflections directly from the priorities page without leaving

#### Instant Priority Adjustment
- **FR-005**: System MUST adjust task priorities within 500 milliseconds (95th percentile) when user toggles a reflection on/off
- **FR-006**: Users MUST be able to toggle individual reflections on/off to immediately see impact on priorities
- **FR-007**: System MUST persist toggle states so reflections remain active/inactive across sessions
- **FR-008**: System MUST provide visual feedback during adjustment (loading indicator) if operation exceeds 100ms
- **FR-021**: System MUST debounce rapid toggle changes with 1000ms delay, recalculating only after 1 second of inactivity
- **FR-022**: System MUST perform optimistic rollback on adjustment failure: revert toggle UI to previous state, display error message, maintain database consistency

#### Context-Aware Prioritization
- **FR-009**: System MUST boost priority of tasks semantically similar to active reflections
- **FR-010**: System MUST demote tasks that contradict active reflections by lowering their rank (tasks remain visible, not filtered out)
- **FR-011**: System MUST weight reflections by recency using step function: 100% weight for reflections 0-7 days old, 50% weight for 8-14 days old, 25% weight for reflections older than 14 days
- **FR-012**: System MUST preserve baseline (unadjusted) priorities for comparison

#### Visual Feedback & Transparency
- **FR-013**: System MUST show visual indicators (badges) on tasks that moved position due to context adjustments
- **FR-014**: System MUST display the reason a task moved (e.g., "Matches 'design phase' context" or "Contradicts 'no app yet' context")
- **FR-015**: System MUST show how many reflections were used in the current prioritization
- **FR-016**: Users MUST be able to see which specific reflection texts were considered during prioritization

#### Data Integrity
- **FR-017**: System MUST maintain append-only reflection history (no editing or deletion)
- **FR-018**: Toggling reflections off MUST be a soft operation (database rows preserved)
- **FR-019**: System MUST warn users when baseline plan is >24 hours old
- **FR-020**: System MUST block context adjustments when baseline plan is >7 days old, requiring full re-analysis

### Performance Requirements
- **PR-001**: Context adjustment MUST complete in <500ms (95th percentile)
- **PR-002**: Toggle UI responsiveness MUST be <100ms to feel instant
- **PR-003**: Full agent re-run with context MUST complete in ≤30 seconds

### Success Metrics
- **SM-001**: Reflection usage rate MUST reach ≥40% of prioritization sessions (measured via server-side logging of POST /api/reflections calls)
- **SM-002**: "Tone-deaf priority" user complaints MUST reduce by 50% (measured via existing support ticket tracking)
- **SM-003**: "Priorities make sense" user rating MUST reach ≥80% (measured via existing feedback mechanisms, no new surveys)

### Key Entities

- **Reflection**: A user-entered quick note about their current reality (stage, constraints, energy, blockers). Append-only, can be toggled active/inactive, weighted by recency.

- **Context Card**: A visible component showing 5 most recent reflections with toggle switches, displayed before the "Analyze Tasks" action on the priorities page.

- **Baseline Plan**: The original prioritized task list before any context adjustments, stored for comparison and reference.

- **Adjusted Plan**: The modified prioritized task list after applying active reflections, includes movement tracking and reasoning.

- **Task Movement**: Record of how a task's position changed from baseline to adjusted plan, including direction (up/down), magnitude (number of positions), and reason (which reflection caused the change).

- **Context Adjustment**: The operation of recalculating priorities based on active reflections, target completion time <500ms.

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

## Dependencies & Assumptions

### Dependencies
- **Phase 1 (Vector Storage)**: Requires existing task embeddings for semantic matching
- **Phase 2 (Tool Registry)**: Uses existing embedding infrastructure
- **Phase 3 (Agent Runtime)**: Extends existing agent orchestration with baseline storage
- **Phase 4 (Integration & UI)**: Integrates with existing priorities page and reasoning trace panel

### Assumptions
- Users understand the concept of "context" as their current situation/constraints
- 5 recent reflections provide sufficient context for most use cases
- Semantic similarity matching is "good enough" without complex ML models
- Users will tolerate <500ms adjustment time as "instant enough"
- Most users recalculate priorities at least once per day (baseline staleness rare)

### Out of Scope (Phase 6+)
- Reflection categorization/tagging
- Reflection search and filtering
- Reflection editing or deletion
- AI-generated reflection suggestions
- Sentiment analysis of reflections
- Reflection reminders/notifications
- Multi-agent coordination
- Reinforcement learning from user behavior
- Predictive reflection toggling
