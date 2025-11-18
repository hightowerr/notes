# Feature Specification: Strategic Prioritization (Impact-Effort Model)

**Feature Branch**: `001-strategic-prioritization-impact`
**Created**: 2025-11-17
**Status**: Draft
**Input**: User description: "Strategic Prioritization (Impact-Effort Model)"

## Clarifications

### Session 2025-11-17

- Q: When all async retry attempts for Impact estimation fail (after background queue processing), how should the system handle that task's display? → A: Show "Scores unavailable" status and exclude from sorting/filtering
- Q: When a user manually overrides Impact/Effort for a task and then the agent re-runs prioritization (e.g., new tasks added, outcome changed), what should happen to the manual override? → A: Reset on next agent run
- Q: When displaying the Impact/Effort quadrant visualization, how should the system handle tasks with identical or very similar Impact/Effort coordinates that would overlap? → A: Cluster with count badge
- Q: When the LLM call for Impact estimation times out or fails during strategic scoring, what retry strategy should the system use? → A: Queue for async processing
- Q: When a user reloads the page while async retry for Impact estimation is in progress (tasks showing "Scoring..." status), what should happen? → A: Resume retry from queue
- Q: In Success Criterion SC-004 ("Quadrant visualization shows healthy spread with ≥5% of tasks in each quadrant"), what should happen when this criterion is NOT met (e.g., 80% of tasks are in one quadrant)? → A: No intervention

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Strategic Task Rankings (Priority: P1)

As a user, I can see my tasks prioritized by strategic value (impact/effort/confidence) instead of just semantic similarity, so I can make better decisions about what to work on first.

**Why this priority**: This is the core value proposition - moving from semantic-only ranking to strategic ranking. Without this, users continue to see poor prioritization that requires manual re-sorting.

**Independent Test**: Can be fully tested by triggering prioritization on existing tasks and verifying that scores appear with Impact/Effort/Confidence/Priority values. Delivers immediate value by showing why tasks are ranked in a certain order.

**Acceptance Scenarios**:

1. **Given** a user has tasks in the system, **When** they navigate to /priorities, **Then** each task displays Impact (0-10), Effort (hours), Confidence (0-1), and Priority score
2. **Given** tasks are displayed with strategic scores, **When** user views the list, **Then** tasks are sorted by Priority score (highest first) in "Balanced" mode
3. **Given** a task has high impact (8/10) and low effort (4h) with high confidence (0.9), **When** priority is calculated, **Then** it ranks higher than a task with medium impact (5/10) and medium effort (8h)
4. **Given** Impact estimation LLM call fails for a task during initial scoring, **When** page loads, **Then** failed task shows "Scoring..." status, is excluded from sorted list, and scores appear reactively when background retry completes
5. **Given** retry queue has in-progress tasks and user reloads the page, **When** page loads, **Then** page polls existing retry queue, displays "Scoring..." for queued tasks, and updates scores reactively as retries complete

---

### User Story 2 - Switch Between Sorting Strategies (Priority: P1)

As a user, I can filter and sort tasks by different strategic lenses (Quick Wins, Strategic Bets, Balanced, Urgent) to align prioritization with my current context and goals.

**Why this priority**: Different work contexts require different prioritization strategies. A user needing to show progress this week needs Quick Wins, while planning a quarter requires Strategic Bets view.

**Independent Test**: Can be tested by selecting different sort modes from a dropdown and verifying that task lists filter/sort correctly according to each strategy's rules.

**Acceptance Scenarios**:

1. **Given** user is on /priorities page, **When** they select "Quick Wins" filter, **Then** only tasks with Effort ≤ 8 hours are shown, sorted by Impact × Confidence
2. **Given** user selects "Strategic Bets" filter, **When** filter is applied, **Then** only tasks with Impact ≥ 7 AND Effort > 40 hours are shown, sorted by Impact descending
3. **Given** user selects "Urgent" sort, **When** tasks contain keywords like "urgent", "critical", or "blocking", **Then** those tasks receive a 2× priority multiplier and appear at the top
4. **Given** user switches between different sort modes, **When** they return to "Balanced" mode, **Then** all tasks are shown sorted by priority score

---

### User Story 3 - Visualize Impact/Effort Trade-offs (Priority: P2)

As a user, I can view tasks in a 2×2 Impact/Effort quadrant visualization to quickly identify which tasks are "quick wins" vs. "strategic bets" vs. "avoid" tasks.

**Why this priority**: Visual representation helps users grasp strategic positioning at a glance. However, the list view with scores is sufficient for core functionality, making this a P2 enhancement.

**Independent Test**: Can be tested by verifying quadrant component renders with tasks positioned correctly by their Impact (Y-axis) and Effort (X-axis) coordinates, color-coded by quadrant.

**Acceptance Scenarios**:

1. **Given** tasks have Impact and Effort scores, **When** user views the quadrant visualization, **Then** tasks appear as bubbles with X-axis = Effort (log scale 1h-160h) and Y-axis = Impact (0-10)
2. **Given** a task has high impact (≥7) and low effort (≤8h), **When** displayed in quadrant, **Then** it appears in the green "🌟 High Impact / Low Effort" quadrant (top-left)
3. **Given** a task has low impact (<5) and high effort (>40h), **When** displayed in quadrant, **Then** it appears in the red "⏸ Low Impact / High Effort" quadrant (bottom-right)
4. **Given** user clicks a task bubble in the quadrant, **When** click is registered, **Then** the page scrolls to that task in the list view
5. **Given** multiple tasks have similar Impact/Effort coordinates (within clustering threshold), **When** quadrant renders, **Then** overlapping tasks merge into a single bubble with a count badge (e.g., "3 tasks") that expands to show all tasks on click

---

### User Story 4 - Understand Score Reasoning (Priority: P2)

As a user, I can view a detailed breakdown of how each task's priority score was calculated, so I can understand and trust the AI's reasoning.

**Why this priority**: Transparency builds trust, but users can still benefit from strategic ranking without this detail. This enhances trust rather than enabling core functionality.

**Independent Test**: Can be tested by clicking "Why this score?" link and verifying that a modal displays the breakdown of Impact reasoning, Effort estimation, Confidence calculation, and final Priority formula.

**Acceptance Scenarios**:

1. **Given** a task has strategic scores, **When** user clicks "Why this score?" link, **Then** a modal displays Impact score with reasoning (keywords, scope, reversibility)
2. **Given** the score breakdown modal is open, **When** user views Effort estimation, **Then** they see the estimated hours and reasoning (complexity heuristic or extracted from task text)
3. **Given** the modal shows Confidence score, **When** user views the breakdown, **Then** they see the formula components: semantic similarity (60%), dependency confidence (30%), historical success (10%)
4. **Given** the modal is open, **When** user views the Priority calculation, **Then** they see the formula: (Impact / Effort) × Confidence with the actual values plugged in

---

### User Story 5 - Manually Override Scores (Priority: P3)

As a user, I can manually adjust the Impact and Effort estimates for any task when the AI's estimates don't match my domain knowledge, and see the priority recalculate instantly.

**Why this priority**: Manual overrides are important for accuracy but not required for the system to provide value. Users can still benefit from AI estimates even if they can't override them initially.

**Independent Test**: Can be tested by adjusting Impact slider or Effort input on a task, verifying priority recalculates, and checking that override persists across page reloads.

**Acceptance Scenarios**:

1. **Given** a task has AI-generated scores, **When** user adjusts the Impact slider from 5 to 8, **Then** the Priority score recalculates instantly using the new Impact value
2. **Given** user has adjusted Effort from 16h to 8h, **When** they save the change, **Then** the override is stored in `task_embeddings.manual_overrides` jsonb column
3. **Given** user has manually overridden a task's scores, **When** they view the task, **Then** a "Manual override" badge appears on the task
4. **Given** user has overridden a task's scores and reloads the page (without agent re-run), **When** the page loads, **Then** the manually adjusted scores persist
5. **Given** user has manually overridden a task's scores, **When** agent re-runs prioritization, **Then** all manual overrides are cleared and fresh AI estimates are calculated

---

### Edge Cases

- What happens when a task has no text content to extract effort hints from? (Fall back to complexity heuristic based on task length and cognitive load indicators)
- How does the system handle tasks with Impact = 0? (Allow zero impact but ensure Priority formula doesn't divide by zero; tasks with 0 impact rank at bottom)
- What happens if user sets Effort to 0 hours? (Enforce minimum effort of 0.5h in UI validation to avoid division by zero)
- How does system handle tasks with missing semantic similarity scores? (Use default Confidence of 0.5 and flag for user review)
- What happens when all tasks fall into one quadrant (poor distribution)? (Display quadrant as-is with concentrated bubbles; no warning or intervention. User interprets the clustering themselves.)
- How does system handle concurrent manual overrides from multiple sessions? (Last-write-wins; show timestamp of last override)
- What happens when Impact estimation LLM call fails during initial scoring? (Skip task in initial response, queue for background async retry, show "Scoring..." status, exclude from sorting/filtering until retry completes)
- What happens when all async retry attempts fail for a task's Impact estimation? (After max retries exhausted, show "Scores unavailable" status and permanently exclude task from sorting/filtering until next agent re-run)
- What happens when user reloads page while retry queue is processing? (Page polls existing retry queue and displays "Scoring..." status for queued tasks; scores appear reactively as retries complete. Retry process continues uninterrupted.)
- What happens when user has manually overridden task scores and then agent re-runs prioritization? (All manual overrides are cleared; fresh AI estimates are calculated. No warning shown as this is expected behavior to ensure scores stay aligned with latest outcome/context.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST calculate strategic scores (Impact, Effort, Confidence, Priority) for every task when prioritization is triggered
- **FR-002**: System MUST persist strategic scores in `agent_sessions.strategic_scores` JSONB column with format: `{ "task-id": { impact: number, effort: number, confidence: number, priority: number } }`
- **FR-003**: System MUST estimate Impact (0-10 scale) using LLM analysis of task against outcome statement, considering direct/indirect impact, scope of change, and reversibility
- **FR-004**: System MUST estimate Effort (hours) by extracting numeric hints from task text or falling back to complexity heuristic (short/medium/long cognition + text length)
- **FR-005**: System MUST calculate Confidence (0-1 scale) using formula: `0.6 × SemanticSimilarity + 0.3 × DependencyConfidence + 0.1 × HistoricalSuccess` (with HistoricalSuccess defaulting to 0.5 until Phase 13)
- **FR-006**: System MUST calculate Priority score using formula: `min(100, (Impact × 10) / (Effort / 8) × Confidence)` to normalize to 0-100 scale
- **FR-007**: System MUST provide four sorting strategies: Balanced (sort by priority), Quick Wins (Effort ≤ 8h, sort by Impact × Confidence), Strategic Bets (Impact ≥ 7 AND Effort > 40h, sort by Impact), Urgent (2× multiplier for keywords "urgent", "critical", "blocking")
- **FR-008**: System MUST display Impact, Effort, Confidence, and Priority scores for each task in the /priorities view
- **FR-009**: System MUST allow users to manually override Impact (0-10 slider) and Effort (hour input) for any task
- **FR-010**: System MUST persist manual overrides in `task_embeddings.manual_overrides` JSONB column with format: `{ impact: number, effort: number, reason: string, timestamp: ISO8601 }`. Manual overrides persist within a session (across page reloads) but are cleared when agent re-runs prioritization.
- **FR-011**: System MUST recalculate Priority score instantly when user adjusts Impact or Effort
- **FR-012**: System MUST display "Manual override" badge on tasks that have user-adjusted scores
- **FR-013**: System MUST render 2×2 Impact/Effort quadrant visualization with X-axis = Effort (log scale 1h-160h), Y-axis = Impact (0-10), and bubble size = Confidence. Tasks with similar coordinates (Impact within ±0.5, Effort within ±20% on log scale) MUST cluster into a single bubble with count badge that expands on click.
- **FR-014**: System MUST color-code quadrant regions: Green (Impact ≥ 5, Effort ≤ 8h), Blue (Impact ≥ 5, Effort > 8h), Yellow (Impact < 5, Effort ≤ 8h), Red (Impact < 5, Effort > 8h)
- **FR-015**: System MUST provide "Why this score?" modal showing breakdown of Impact reasoning, Effort estimation, Confidence calculation, and Priority formula
- **FR-016**: System MUST apply Impact heuristics: +2 for keywords "launch/test/experiment", -1 for "document/refactor/cleanup", +3 for "revenue/conversion/payment"
- **FR-017**: System MUST complete strategic scoring within <2 seconds added latency to total prioritization time. **Baseline definition**: Total prioritization time = duration from POST /api/agent/prioritize request to UI render complete. Strategic scoring overhead = (time with strategic scoring enabled) - (time with semantic-only scoring). Target: <2s delta. **Acceptance test**: Measure time for 100 tasks with/without strategic scoring; delta must be <2s.
- **FR-018**: System MUST handle missing dependency confidence by defaulting to 0.5 in Confidence formula
- **FR-019**: When Impact estimation LLM call fails (timeout, API error, invalid response), system MUST skip that task in initial scoring and queue it for background async retry. Failed tasks display "Scoring..." status and are excluded from sort/filter operations until retry completes.
- **FR-020**: System MUST poll background retry queue and update task scores reactively when async retries complete, without requiring page reload
- **FR-021**: When user reloads page while retry queue has in-progress tasks, system MUST resume polling the existing background retry queue and display updated scores as they complete (retry process continues uninterrupted across page reloads)

### Key Entities

- **Strategic Scores**: A JSONB object stored in `agent_sessions` containing Impact (0-10), Effort (hours), Confidence (0-1), and Priority (0-100) for each task. Keyed by task ID.
- **Manual Overrides**: A JSONB object stored in `task_embeddings` containing user-adjusted Impact, Effort, reason for adjustment, and timestamp. Overrides take precedence over AI estimates within a session but are cleared when agent re-runs prioritization.
- **Sorting Strategy**: An enum representing the active filter/sort mode: Balanced, Quick Wins, Strategic Bets, or Urgent. Determines which tasks are shown and in what order.
- **Impact Estimation**: A 0-10 score representing how much a task will move the outcome metric, calculated by LLM analysis + keyword heuristics.
- **Effort Estimation**: A number representing estimated hours to complete the task, extracted from task text or calculated via complexity heuristic.
- **Confidence Score**: A 0-1 probability representing certainty that the task will help achieve the outcome, combining semantic similarity, dependency confidence, and historical success rate.
- **Priority Score**: A 0-100 normalized value representing strategic value, calculated as (Impact / Effort) × Confidence, used for default "Balanced" sorting.
- **Retry Queue**: An async processing queue for tasks whose Impact estimation LLM calls failed during initial scoring. Queue persists across page reloads; tasks remain until retry succeeds or max attempts exhausted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users report 70%+ agreement with top 5 tasks in Balanced sort (measured via feedback survey)
- **SC-002**: ≥60% of users try both "Quick Wins" and "Strategic Bets" views within first week of feature launch (measured via analytics event tracking)
- **SC-003**: <20% of tasks are manually adjusted via override controls (indicates AI estimates are good enough)
- **SC-004**: Quadrant visualization shows healthy spread with ≥5% of tasks in each quadrant (measurement criterion for portfolio health; no system intervention when threshold not met)
- **SC-005**: "Priority quality" NPS score increases by ≥25 points compared to baseline semantic-only ranking
- **SC-006**: Strategic scoring adds <2 seconds to total prioritization time (measured from agent trigger to UI render complete)
- **SC-007**: Manual override changes persist correctly across sessions with 100% data integrity
- **SC-008**: "Why this score?" modal is viewed by ≥40% of users within first week (indicates transparency feature is discoverable and valuable)

## Out of Scope *(optional)*

- Historical outcome tracking and learning loop (deferred to Phase 13)
- Integration with external time tracking tools (Toggl, Harvest, Clockify)
- Team capacity planning and multi-user resource allocation
- Automatic effort estimation via static code analysis
- Impact prediction models trained on historical completion data
- Workflow automation based on priority scores
- Timeline/Gantt chart views
- Dependency-aware scheduling
- Mobile-specific quadrant visualization optimizations (can use existing responsive patterns)

## Technical Constraints *(optional)*

- LLM Impact estimation must use structured output with Zod schema validation
- Strategic scoring must run in parallel with existing dependency detection to avoid sequential latency
- Impact heuristics must be configurable via constants for easy tuning without code changes
- Manual overrides must use optimistic UI updates with rollback on save failure
- Quadrant visualization should use existing charting library (Recharts preferred) to avoid new dependencies
- Database migrations must be backward-compatible (add columns only, no table restructuring)

## Dependencies *(optional)*

- **Phase 3**: Agent runtime must support enhanced instructions with strategic scoring requirements
- **Phase 7**: Reflection system integration - strategic scores should respect reflection constraints
- **Phase 10**: Task Intelligence quality scores inform Confidence calculation
- **Existing**: `task_embeddings` table with semantic similarity scores
- **Existing**: `/api/agent/prioritize` endpoint for triggering prioritization
- **Existing**: Mastra agent orchestration system

## Open Questions *(optional)*

- Should we cache Impact heuristics by task content hash to avoid re-analyzing identical task descriptions?
- How should the system handle tasks that are partially complete? (reduce Effort proportionally?)
- Should Strategic Bets filter threshold (Impact ≥ 7, Effort > 40h) be user-configurable or hard-coded?
- What's the UX for bulk overriding multiple tasks at once? (defer to Phase 12 or keep single-task only?)
- Should manual overrides include an optional "reason" field that users can fill out? (helpful for team context)

## Notes *(optional)*

- This feature is Phase 11 in the Shape Up pitch sequence, building on existing agent prioritization (Phase 3) and task intelligence (Phase 10)
- The 6-week appetite assumes full-stack implementation: backend service, agent instruction updates, database schema, API endpoints, and full UI components
- Success metrics baseline (<40% agreement with top 5 tasks) comes from user feedback in the pitch document
- The quadrant color scheme (Green/Blue/Yellow/Red) aligns with standard project management frameworks (Eisenhower Matrix)
- Manual override persistence is critical for user trust - losing override data would severely damage confidence in the system
- Performance target (<2s overhead) is aggressive; may need to implement caching strategy for Impact heuristics if LLM calls are too slow
- Future Phase 13 (Learning Loop) will close the feedback cycle by tracking actual task outcomes vs. predicted Impact, enabling model improvements
