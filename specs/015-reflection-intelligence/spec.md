# Feature Specification: Reflection Intelligence

**Feature Branch**: `015-reflection-intelligence`
**Created**: 2025-11-23
**Status**: Draft
**Input**: Phase 15 Shape Up Pitch - Transform reflections from dead feature to actionable intelligence

## Clarifications

### Session 2025-11-23

- Q: Should ReflectionIntent be persisted to the database, or computed on-demand? → A: Persist in `reflection_intents` table; recompute only when reflection text changes
- Q: What level of observability is required for reflection interpretation? → A: Minimal (log errors only; no metrics tracking)
- Q: When GPT-4o-mini interpretation fails, should the system retry before fallback? → A: Single retry with 1s delay before falling back to Information type

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Immediate Reflection Effect (Priority: P1)

As a user, when I add a reflection like "Legal blocked all customer outreach until Dec 1", I want to see outreach-related tasks immediately drop in priority with a clear explanation, so I know my context is being understood and applied.

**Why this priority**: This is the core value proposition. If reflections don't immediately affect task priorities, users will continue to see them as useless. This single story delivers the "reflections finally do something" moment.

**Independent Test**: Can be fully tested by adding a blocking reflection and observing task list reordering with visible attribution badges. Delivers immediate value even without other stories.

**Acceptance Scenarios**:

1. **Given** a user has tasks including "Prepare email campaign" and "Cold outreach prep", **When** they add reflection "Legal blocked customer outreach", **Then** those tasks are immediately demoted/blocked within 3 seconds with visible attribution
2. **Given** a reflection has been classified as a hard constraint, **When** it affects tasks, **Then** affected tasks show a blocking badge (e.g., "Blocked: Legal hold")
3. **Given** a user adds a focus reflection "Priority is analytics this week", **When** analytics-related tasks exist, **Then** they are boosted in priority within 3 seconds with "Boosted: Matches focus area" badge

---

### User Story 2 - Fast Toggle Adjustment (Priority: P2)

As a user, when I toggle an existing reflection on/off, I want to see task priorities adjust within 500ms, so I can quickly explore "what if" scenarios and understand reflection impact.

**Why this priority**: Toggle speed demonstrates system responsiveness and builds user trust. Without fast toggles, users won't experiment with reflections.

**Independent Test**: Can be tested by toggling an active reflection and measuring UI response time. Delivers value for users who want to temporarily disable/enable context.

**Acceptance Scenarios**:

1. **Given** an active reflection affecting 3 tasks, **When** user toggles it off, **Then** tasks restore to baseline positions within 500ms
2. **Given** a toggled-off reflection, **When** user toggles it back on, **Then** adjustments re-apply within 500ms without full re-prioritization
3. **Given** multiple reflections exist, **When** user toggles one, **Then** only tasks affected by that reflection visibly change

---

### User Story 3 - Reflection Attribution on Tasks (Priority: P3)

As a user, I want to see which reflections affected each task and why, so I understand the system's reasoning and can trust the prioritization.

**Why this priority**: Attribution builds trust and helps users understand the system. Without it, users can't debug unexpected rankings.

**Independent Test**: Can be tested by examining task cards after reflections are applied. Delivers transparency value even if other features are incomplete.

**Acceptance Scenarios**:

1. **Given** a task was affected by a reflection, **When** viewing the task card, **Then** it shows a badge indicating the source reflection and effect direction (boosted/demoted/blocked)
2. **Given** a task was affected by multiple reflections, **When** viewing the task, **Then** all contributing reflections are shown with their individual effects
3. **Given** a task moved position due to reflections, **When** viewing task details, **Then** explanation includes plain language reason (e.g., "Matches your focus on analytics")

---

### User Story 4 - Code Cleanup and Single CTA (Priority: P4)

As a developer and user, I want duplicate code removed and a single "Add Context" button, so the UI is cleaner and the codebase is maintainable.

**Why this priority**: Technical debt cleanup that improves UX and maintainability. Lower priority because it doesn't directly deliver new user value.

**Independent Test**: Can be tested by verifying single CTA exists and running unit tests to confirm no duplicate utilities remain.

**Acceptance Scenarios**:

1. **Given** the Priorities page, **When** looking at context input options, **Then** only one "Add Context" button is visible (not two)
2. **Given** the codebase, **When** searching for `calculateFallbackWeight` or `formatFallbackRelativeTime`, **Then** no duplicates exist in `priorities/page.tsx`
3. **Given** the deprecated `reflectionBasedRanking.ts`, **When** building the project, **Then** the file no longer exists

---

### User Story 5 - Unified Home + Priorities Experience (Priority: P5)

As a user, when I add a reflection on the Home page, I want it to affect my priorities immediately and see a prompt to view the effect.

**Why this priority**: Cross-page consistency is polish. Core functionality on Priorities page must work first.

**Independent Test**: Can be tested by adding reflection on Home page and verifying effect on Priorities page.

**Acceptance Scenarios**:

1. **Given** user is on Home page, **When** they add a reflection, **Then** they see "Saved! View effect in Priorities →" prompt
2. **Given** reflection added on Home page, **When** user navigates to Priorities, **Then** the reflection's effects are already applied

---

### Edge Cases

- What happens when a reflection could apply to ALL tasks (e.g., "I'm blocked completely")? → Minimum floor: cannot suppress below 5 tasks without warning
- How does system handle conflicting reflections (boost X + block X)? → Simple priority: hard blocks > soft blocks > boosts
- What if LLM classification fails or times out? → Single retry with 1s delay; if still failing, fallback to "Information" type (context only, no action), show error toast
- What if user adds empty or very short reflection? → Require minimum 3 words, show helpful prompt
- What if no tasks match a constraint reflection? → Show "0 tasks affected" with explanation

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST interpret reflection intent within 200ms using GPT-4o-mini
- **FR-002**: System MUST classify reflections into: Constraint/Blocker, Opportunity/Focus, Capacity/Energy, Sequencing, or Information
- **FR-003**: System MUST auto-trigger prioritization adjustment when reflection is added (no manual "Analyze" click needed)
- **FR-004**: System MUST apply reflection effects to task list within 3 seconds of reflection creation
- **FR-005**: System MUST apply toggle effects within 500ms (using cached classification, no LLM call)
- **FR-006**: System MUST show attribution badges on all tasks affected by reflections
- **FR-007**: System MUST display only ONE "Add Context" button (remove duplicate CTA)
- **FR-008**: System MUST delete deprecated `reflectionBasedRanking.ts` service
- **FR-009**: System MUST consolidate duplicate utilities from `priorities/page.tsx` into `reflectionService.ts`
- **FR-010**: System MUST prevent suppressing below 5 active tasks without user warning

### Non-Functional Requirements

- **NFR-001**: Observability level is minimal - log errors only; no metrics or detailed traces required

### Key Entities

- **ReflectionIntent**: Parsed interpretation of a reflection (persisted in `reflection_intents` table; recomputed only when reflection text changes)
  - `id`: uuid (primary key)
  - `reflection_id`: uuid (foreign key to reflections)
  - `type`: constraint | opportunity | capacity | sequencing | information
  - `subtype`: blocker | soft-block | boost | energy-level | dependency | context-only
  - `keywords`: string[] (extracted matching terms)
  - `strength`: hard | soft
  - `duration`: optional temporal bounds (jsonb)
  - `summary`: human-readable interpretation
  - `created_at`: timestamp
  - `updated_at`: timestamp

- **ReflectionEffect**: How a reflection affects a specific task
  - `reflectionId`: source reflection
  - `taskId`: affected task
  - `effect`: blocked | demoted | boosted | unchanged
  - `magnitude`: number (position change or score adjustment)
  - `reason`: plain language explanation

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Time from reflection add to visible effect: <3 seconds (currently: infinite/manual)
- **SC-002**: Time for toggle adjustment: <500ms
- **SC-003**: Percentage of moved tasks with attribution: 100% (currently: 0%)
- **SC-004**: Number of duplicate CTA buttons: 1 (currently: 2)
- **SC-005**: Lines of duplicate utility code removed: ~90 lines
- **SC-006**: Deprecated service files deleted: 1 (`reflectionBasedRanking.ts`)
- **SC-007**: User perception improvement: "Reflections feel useful" (qualitative, post-launch survey)
