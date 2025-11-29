# Feature Specification: Trust-Focused Task List Refactor

**Feature Branch**: `001-trust-focused-task`
**Created**: 2025-01-28
**Status**: Draft
**Input**: User description: "@docs/shape-up-pitches/phase-19-trust-focused-task-list-refactor.md"
**Appetite**: 3 weeks (medium batch)
**Phase**: 19

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant Task Comprehension (Priority: P1)

As an overwhelmed user, I need to quickly understand my top priority task and why it's ranked first, so I can confidently start working without second-guessing the AI's judgment.

**Why this priority**: Core trust issue. Without transparent reasoning, users waste cognitive energy validating AI decisions instead of executing tasks. Addresses the primary pain point from user feedback: "I can't tell what to focus on - there's too much information per task."

**Independent Test**: Can be fully tested by loading /priorities page on mobile (320px) and verifying top task shows rank, icon, title, brief reasoning (≤20 words), and action button - all readable in <3 seconds.

**Acceptance Scenarios**:

1. **Given** user loads /priorities page, **When** viewing task #1, **Then** see exactly 4-5 elements: rank number, single indicator (🌟/🚀/time), task title, brief outcome-linked reasoning, and complete checkbox
2. **Given** user reads brief reasoning, **When** reasoning states "Unblocks #3, #7", **Then** understand specific dependencies without scanning full list
3. **Given** user on 320px mobile viewport, **When** viewing task list, **Then** no horizontal scroll and all text readable without zooming
4. **Given** user compares task #1 to task #2, **When** scanning both, **Then** can differentiate by reasoning alone (<3 seconds per task)

---

### User Story 2 - Unified Task Treatment (Priority: P1)

As a user who creates manual tasks, I need them to be ranked identically to AI-generated tasks, so I trust the system's prioritization regardless of task source.

**Why this priority**: Broken trust from inconsistent handling. The 20% manual task boost creates visual and ranking distinctions that signal unreliability. If users can identify manual vs AI tasks, they'll question the ranking logic.

**Independent Test**: Create a manual task and an AI task with identical impact/effort scores, verify both receive identical ranking and visual treatment (no badges, same icon, same reasoning format).

**Acceptance Scenarios**:

1. **Given** user creates manual task with impact:8, effort:12h, **When** AI task has same scores, **Then** both ranked identically without boost
2. **Given** user views task list, **When** scanning tasks, **Then** cannot identify which are manual vs AI-generated from visual appearance
3. **Given** user opens task drawer, **When** viewing details, **Then** task source shown only in metadata section (not main view)
4. **Given** user filters by Quick Wins, **When** both manual and AI tasks qualify, **Then** both appear in filtered list with identical treatment

---

### User Story 3 - Focus Mode Default (Priority: P2)

As a user overwhelmed by 23+ tasks, I need to see only high-leverage work by default (≤12 tasks), so I can focus on what matters without choice paralysis.

**Why this priority**: Addresses "clutter paralysis" and "focus dilution" from problem statement. Cognitive load research shows 7±2 items as manageable choice set. Filtering overhead/neutral tasks removes distraction.

**Independent Test**: Load /priorities with 23 total tasks, verify only high-leverage tasks (Quick Wins + Strategic Bets) shown by default with clear count "Showing 8 focused tasks (15 hidden)".

**Acceptance Scenarios**:

1. **Given** user has 23 total tasks (8 leverage, 15 overhead/neutral), **When** loading /priorities, **Then** see only 8 leverage tasks by default
2. **Given** user sees filtered view, **When** checking filter status, **Then** see "Focus Mode (Recommended)" with count display
3. **Given** user needs to see all tasks, **When** toggling filter to "All Tasks", **Then** see full list with updated count
4. **Given** user completes top leverage task, **When** task moves to "Completed" section, **Then** next leverage task becomes #1 in active list

---

### User Story 4 - Progressive Disclosure (Priority: P2)

As a power user who needs detailed context, I need access to all strategic scores, dependencies, and history via a side drawer, so I can investigate without cluttering the main view.

**Why this priority**: Enables Chekhov's Gun principle - main view optimized for "next action" decision, drawer for investigation. Serves power users without overwhelming casual users.

**Independent Test**: Tap "Details →" link on task #1, verify drawer opens with strategic scores, quadrant visualization, dependencies, movement history, and manual override controls - all without returning to main list.

**Acceptance Scenarios**:

1. **Given** user taps "Details →" on task #1, **When** drawer opens, **Then** see full impact/effort/confidence scores with visual breakdown
2. **Given** user views drawer, **When** checking dependencies, **Then** see graph of prerequisite/blocks/related tasks
3. **Given** user needs to adjust task priority, **When** using manual override sliders in drawer and clicking "Apply", **Then** task instantly re-ranks in main list
4. **Given** user closes drawer without applying changes, **When** returning to main list, **Then** task list unchanged and slider edits discarded

---

### User Story 5 - Enhanced Agent Rationale (Priority: P1)

As a user skeptical of AI prioritization, I need to see specific, outcome-linked reasoning (not generic phrases like "important"), so I understand the concrete value of each task.

**Why this priority**: Core trust builder. Generic AI reasoning ("High priority task") doesn't justify ranking. Specific reasoning ("Unblocks #3, #7 • Enables payment feature") builds confidence through transparency.

**Independent Test**: Check top 5 tasks, verify each has brief_reasoning field with ≤20 words, outcome-linked format, and no generic phrases like "important" or "critical" without specifics.

**Acceptance Scenarios**:

1. **Given** agent prioritizes tasks, **When** generating reasoning, **Then** include specific outcome link (e.g., "Advances [goal] by [mechanism]")
2. **Given** user reads task #1 reasoning, **When** it states "Unblocks 3 other tasks", **Then** understand concrete dependency impact
3. **Given** agent attempts generic reasoning, **When** validation runs, **Then** reject phrases like "High priority" without specifics
4. **Given** user compares 2 tasks with same score, **When** reading reasoning, **Then** differentiate by specific outcomes each advances

---

### User Story 6 - Mobile-First Layout (Priority: P2)

As a mobile user on 320px viewport, I need all task information readable without horizontal scroll and all touch targets ≥44px, so I can triage tasks on my phone.

**Why this priority**: Current design is non-mobile-first, creating unusable experience on phones. WCAG AAA requires 44px touch targets. Mobile-first ensures accessibility baseline.

**Independent Test**: Load /priorities on 320px viewport, verify no horizontal scroll, all buttons ≥44px, typography scales up (18px title), and card layout stacks vertically.

**Acceptance Scenarios**:

1. **Given** user on 320px viewport, **When** viewing task list, **Then** no horizontal scroll and all content visible
2. **Given** user taps checkbox, **When** tapping, **Then** 44×44px tap area ensures easy selection
3. **Given** user reads task title, **When** viewing on mobile, **Then** 18px font size (vs 14px desktop) improves readability
4. **Given** user on tablet (768px), **When** viewing tasks, **Then** layout adapts to row-based with minimal spacing

---

### User Story 7 - Quick Wins Filter (Priority: P3)

As a user looking for fast wins, I need a working Quick Wins filter (impact≥5, effort≤8h) with accurate count, so I can efficiently triage low-hanging fruit.

**Why this priority**: Existing filter is broken (per pitch evidence). Quick wins provide motivation and momentum. Lower priority than core trust/focus issues but essential for efficient triage.

**Independent Test**: Apply Quick Wins filter to 23 tasks, verify only tasks with impact≥5 AND effort≤8h shown, with accurate count "Showing 5 Quick Wins of 23 tasks".

**Acceptance Scenarios**:

1. **Given** user has tasks with mixed impact/effort, **When** applying Quick Wins filter, **Then** see only impact≥5, effort≤8h tasks
2. **Given** user sees filtered view, **When** checking count, **Then** "Showing 5 Quick Wins of 23 tasks" is accurate
3. **Given** user toggles filter to "All Tasks", **When** reloading page, **Then** "All Tasks" filter persists (localStorage)
4. **Given** user completes Quick Win task, **When** task moves to "Completed" section, **Then** active Quick Wins count decrements and next Quick Win appears

---

### Edge Cases

- What happens when brief reasoning exceeds 20 words? → Truncate with "..." and show full reasoning in drawer
- How does system handle task with no dependencies? → Reasoning focuses on outcome impact, not dependencies
- What happens when all tasks are overhead/neutral? → Focus Mode shows "No leverage tasks - showing all 23 tasks"
- What happens on first-time user load? → Default to Focus Mode, save to localStorage for future visits
- How does drawer handle mobile viewport? → Full-screen overlay on <768px, side panel on ≥768px
- What happens when Quick Wins filter returns 0 tasks? → Show "No Quick Wins - try Strategic Bets filter" with suggestion
- How does system handle manual task created while on Focus Mode? → If leverage task, appears immediately; if overhead, hidden until "All" toggled
- What happens when user deletes top task? → Next task becomes #1, rankings reflow instantly
- How does system handle agent failure to generate reasoning? → Auto-retry up to 3 times, then fallback to "Priority: [rank]" until next re-prioritization cycle
- What happens when user overrides task to change quadrant? → Reasoning regenerates on next prioritization cycle
- How does drawer handle task with no movement history? → Show "New task - no movement history" in timeline section
- What happens when user has ≤10 completed tasks? → Show all completed tasks, hide "Show more" button
- What happens when user expands "Show more" in Completed section? → Load next 10 older tasks, repeat until all loaded
- What happens when user adjusts sliders but closes drawer without "Apply"? → Changes discarded, task retains original scores
- What happens when user clicks "Apply" after override? → Instant re-rank, drawer stays open showing new position, reasoning regenerates on next cycle

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate brief_reasoning field (max 20 words) for every prioritized task with outcome-linked format
- **FR-002**: System MUST reject generic reasoning phrases ("important", "critical") without specifics during agent validation
- **FR-003**: Main task view MUST contain exactly 4-5 elements: rank, indicator, title, brief reasoning, complete checkbox
- **FR-004**: System MUST remove 20% manual task boost from prioritization scoring logic
- **FR-005**: System MUST remove ManualTaskBadge from main task list view (accessible only in drawer metadata)
- **FR-006**: System MUST apply Focus Mode filter by default, showing only high-leverage tasks (Quick Wins + Strategic Bets)
- **FR-007**: System MUST display accurate count: "Showing X focused tasks (Y hidden)" or "Showing X Quick Wins of Y tasks"
- **FR-008**: Task list MUST be scannable in <5 seconds for users to identify top priority
- **FR-009**: Task details drawer MUST contain all secondary information: strategic scores, quadrant viz, dependencies, movement history, manual overrides
- **FR-010**: System MUST ensure no horizontal scroll on 320px viewport
- **FR-011**: All touch targets MUST be ≥44px height (WCAG AAA compliance)
- **FR-012**: Quick Wins filter MUST show only tasks with impact≥5 AND effort≤8h
- **FR-013**: System MUST remove Lock feature entirely from task management
- **FR-014**: Task reasoning MUST link to specific outcomes, dependencies, or mechanisms (not abstract importance)
- **FR-015**: System MUST treat manual and AI tasks identically in scoring, ranking, and visual presentation
- **FR-016**: Completed tasks MUST move to a separate "Completed" section below active tasks and remain visible in the UI
- **FR-017**: Filter selection (Focus Mode, Quick Wins, All Tasks) MUST persist in localStorage and restore on page reload
- **FR-018**: System MUST retry agent reasoning generation up to 3 times on validation failure, then fallback to "Priority: [rank]" display
- **FR-019**: "Completed" section MUST display last 10 completed tasks by default with expandable "Show more" for older completions
- **FR-020**: Manual override controls in drawer MUST include "Apply" button that triggers instant re-ranking and visual update

### Key Entities *(include if feature involves data)*

- **Task**: Core unit with rank, title, brief_reasoning, quadrant, impact, effort, confidence, source (manual/AI), completion status
- **BriefReasoning**: String field (≤20 words) with outcome-linked format, stored in per_task_scores schema
- **FocusMode**: Filtering strategy that shows only high_impact_low_effort OR high_impact_high_effort quadrant tasks
- **TaskDetailsDrawer**: UI component containing strategic scores, quadrant visualization, dependencies graph, movement timeline, manual override controls
- **QuickWinsFilter**: Filtering strategy showing tasks with impact≥5 AND effort≤8h

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Elements per task in main view reduced from ~12 to ≤5 (58% reduction)
- **SC-002**: Time to understand top task reduced from ~10s to <3s (70% improvement)
- **SC-003**: User trust metric "I know why #1 is ranked first" increased from ~40% to >75% (post-user testing)
- **SC-004**: Manual task prioritization consistency increased from 0% to 100% (identical scoring)
- **SC-005**: No horizontal scroll on 320px viewport (0 mobile layout issues)
- **SC-006**: Default task count visible reduced from 23 to ≤12 tasks (48% reduction)
- **SC-007**: Quick Wins filter accuracy increased from broken to 100% correct filtering
- **SC-008**: All touch targets meet WCAG AAA ≥44px requirement (100% compliance)
- **SC-009**: User can scan task list in <5 seconds to identify top 3 priorities (per acceptance testing)
- **SC-010**: Brief reasoning contains outcome links in 100% of top 5 tasks (no generic phrases)

### User Experience Metrics

- **UX-001**: 90% of users can identify top priority and reasoning without scrolling
- **UX-002**: Users cannot distinguish manual vs AI tasks in main view (100% visual uniformity)
- **UX-003**: Power users can access all detailed information via drawer without returning to main list
- **UX-004**: Mobile users report task list as "usable" on phones (user testing n=10)
- **UX-005**: Users report reduced decision paralysis when viewing ≤12 tasks vs 23 (qualitative feedback)

### Technical Metrics

- **TM-001**: Agent prompt validation rejects ≥95% of generic reasoning attempts
- **TM-002**: Brief reasoning field truncation triggers for <5% of tasks (indicating 20-word limit compliance)
- **TM-003**: Focus Mode filter reduces visible task count by 40-60% for typical users
- **TM-004**: Drawer opens in <200ms on desktop, <500ms on mobile (performance regression testing)
- **TM-005**: All existing tests pass with new TaskRow structure (100% test suite compatibility)
- **TM-006**: Reasoning validation retry mechanism succeeds within 3 attempts for ≥98% of tasks
- **TM-007**: Manual override "Apply" button triggers re-ranking in <100ms (instant visual update)

## Design Constraints

### Must Keep
- Existing sorting algorithms (no new prioritization logic)
- Agent architecture (prompt changes only, no structural refactor)
- Current design system tokens (no color palette overhaul)
- Existing task types (manual = task, AI = task, no new taxonomy)
- Document processing pipeline (scope: priorities page only)

### Must Remove
- Lock feature (from page.tsx and TaskRow.tsx)
- All category badges from main view (leverage/neutral/overhead - redundant with icon)
- AI-generated badge from main view (source irrelevant to action decision)
- Strategic scores inline display (move to drawer)
- Dependencies list from main view (move to drawer)
- Movement badge from prominent position (make subtle or move to drawer)
- 20% manual task boost from prioritizationGenerator.ts:56
- ManualTaskBadge from TaskRow main view (accessible in drawer metadata only)

### Rabbit Holes to Avoid
- Perfect duplicate detection (use existing 85% threshold)
- Animated transitions (polish rabbit hole - instant re-render only)
- Custom quadrant visualization (defer D3.js work, use simple scatter plot)
- Lock feature debate (hard remove, monitor support requests)
- Movement indicator design (single subtle badge, right-aligned)
- Drawer keyboard navigation (basic click/tap only for v1)
- Full design system overhaul (use existing tokens)
- Undo/redo implementation (out of scope)
- Keyboard shortcuts (future enhancement)
- Task dependencies UI (inferred only, no manual editing)

## Implementation Notes

### Week 1: Establish Trust (Slices 1A, 1B)
**Focus**: Agent rationale + manual/AI unification
**Files**: prioritizationGenerator.ts, TaskRow.tsx, manualTaskPlacement.ts
**Risk**: Agent prompt changes may alter prioritization logic → A/B test with 10% traffic first

### Week 2: Enable Focus (Slices 2A, 2B)
**Focus**: TaskRow simplification + Focus Mode default
**Files**: TaskRow.tsx, TaskList.tsx, sortingStrategy.ts, page.tsx
**Risk**: Lock removal backlash → User testing (n=10) before removal; if critical, pivot to "Pin top 3"

### Week 3: Polish & Mobile (Slices 3A, 3B, 3C)
**Focus**: Mobile-first layout + Quick Wins fix + Rich drawer
**Files**: TaskRow.tsx (responsive), TaskList.tsx (filter), TaskDetailsDrawer.tsx (new content)
**Risk**: Drawer not discoverable → Prominent "Details →" link + tooltips on first visit

## Dependencies

**Built on:**
- Phase 8: Mobile-First Transformation (baseline responsive)
- Phase 11: Strategic Prioritization (impact/effort/confidence)
- Phase 15: Reflection Intelligence (reflection effects)
- Phase 18: Manual Task Creation (unification target)

**No new dependencies** - Pure refactoring + prompt enhancement

## Test Strategy

### Contract Tests
- Agent brief_reasoning schema validation (≤20 words, outcome-linked)
- Focus Mode filter logic (high_impact_low_effort OR high_impact_high_effort)
- Quick Wins filter logic (impact≥5 AND effort≤8h)
- Manual task scoring (no 20% boost)

### Integration Tests
- Full user journey: Load → See focused tasks → Read reasoning → Take action
- Mobile layout: 320px/375px/768px/1024px viewport testing
- Drawer interaction: Open → View details → Override → Close
- Filter toggling: Focus → Quick Wins → All → Focus

### Manual Testing
- User testing (n=10): "Can you identify top priority and why in <3 seconds?"
- Mobile usability: Horizontal scroll check, touch target verification
- Visual uniformity: "Can you tell which tasks are manual vs AI?"
- Trust metric: "Do you trust the AI's ranking? Why/why not?"

### Acceptance Criteria
1. User loads /priorities → sees ≤12 tasks with clear reasoning
2. User reads #1 → understands specific why in <3 seconds
3. User cannot distinguish manual vs AI task visually
4. User taps "Details →" → sees full context in drawer
5. User on mobile (320px) → no horizontal scroll, 44px targets
6. User filters Quick Wins → only impact≥5, effort≤8h shown
7. User completes task → moves to "Completed" section, next task becomes #1
8. User changes focus → toggle between Leverage/All views
9. Main view has ≤5 elements per task (Chekhov's Gun validated)
10. All tests pass with new structure

## Clarifications

### Session 2025-01-28

- Q: When a user completes a task (checks the "Done" checkbox), what happens to that task in the UI? → A: Task moves to a separate "Completed" section below active tasks
- Q: When the user applies filters (Focus Mode, Quick Wins, All Tasks), should the filter state persist across page reloads/sessions? → A: Yes, save filter preference in localStorage and restore on reload
- Q: When the AI agent fails to generate valid brief reasoning (e.g., generic phrases rejected by validation), what should the system do? → A: Retry agent call automatically (max 3 attempts), fallback to "Priority: [rank]" if all fail
- Q: The "Completed" section will show completed tasks. Should there be a limit on how many completed tasks are displayed, or any auto-cleanup behavior? → A: Show last 10 completed tasks, older ones hidden (expandable "Show more")
- Q: When a user adjusts task priority using manual override controls in the drawer (impact/effort sliders), when does the change take effect? → A: Show "Apply" button in drawer, re-rank only when clicked, instant visual update

## Open Questions

[To be populated during /clarify phase]

## References

- Shape Up Pitch: `docs/shape-up-pitches/phase-19-trust-focused-task-list-refactor.md`
- Design Principles: Jobs To Be Done, Chekhov's Gun, Cognitive Load Reduction
- Accessibility: WCAG AAA (44px touch targets)
- UX Research: 7±2 items for manageable choice set (Miller's Law)
