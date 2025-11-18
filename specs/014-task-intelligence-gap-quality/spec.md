# Feature Specification: Task Intelligence (Gap & Quality Detection)

**Feature Branch**: `014-task-intelligence-gap-quality`
**Created**: 2025-01-13
**Status**: Draft
**Input**: User description: "Phase 10 – Task Intelligence (Gap & Quality Detection)"

## Clarifications

### Session 2025-01-13

- Q: When a user accepts a draft task that fills a coverage gap, what happens to the original vague task that the draft is supplementing (if one exists)? → A: Original task is automatically archived/hidden; draft task replaces it in the active list (applies to quality remediation flow, not gap-filling flow where new tasks are added independently)
- Q: What is the maximum number of tasks the system should handle in a single coverage analysis and quality evaluation cycle? → A: Up to 50 tasks (typical user workload)
- Q: When gap analysis or quality evaluation fails due to API errors (OpenAI timeout, rate limit, etc.), how should the system behave? → A: Show error banner, retry once automatically, then fallback to basic heuristics (no AI)
- Q: Should coverage percentage and quality badges update in real-time as users add, edit, or remove tasks, or only after a full re-prioritization? → A: Real-time updates after each task change (optimistic UI with background recalculation)
- Q: How should Phase 10 Task Intelligence integrate with the existing Phase 5 Gap Filling feature (suggestBridgingTasks)? → A: Phase 10 runs first; if gaps remain, fallback to Phase 5 logic for dependency-based gaps

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Goal Coverage Analysis (Priority: P1)

As a user who has set an outcome and run prioritization, I can see a coverage analysis that shows me what percentage of my goal is addressed by existing tasks and which conceptual areas are missing, so that I know if my task list is comprehensive enough to achieve my stated goal.

**Why this priority**: This is the foundation - users need to know if they have gaps before they can fill them. Without coverage analysis, users discover missing work only after starting implementation.

**Independent Test**: Can be fully tested by setting an outcome (e.g., "Increase ARR 15%"), uploading documents with tasks, running prioritization, and seeing a coverage percentage (0-100%) with missing concept labels displayed.

**Acceptance Scenarios**:

1. **Given** user has set outcome "Increase ARR 15%" and has 10 tasks extracted, **When** prioritization completes, **Then** user sees "72% Goal Coverage" with missing areas like ["pricing experiments", "upsell flow"] displayed
2. **Given** coverage score is below 70%, **When** prioritization finishes, **Then** Gap Detection Modal auto-opens showing missing conceptual areas
3. **Given** user has comprehensive tasks covering 90%+ of goal, **When** coverage analysis runs, **Then** user sees green "High Coverage" indicator with no missing areas flagged

---

### User Story 2 - Task Quality Evaluation (Priority: P1)

As a user viewing my prioritized task list, I can see quality badges (Clear/Review/Needs Work) on each task card indicating clarity level, so that I immediately know which tasks need refinement before I start working on them.

**Why this priority**: Prevents users from starting work on vague tasks like "Improve UX" that lack clear success criteria. Quality feedback must be visible before execution begins.

**Independent Test**: Can be fully tested by having tasks with varying clarity ("Build pricing page" vs "Improve UX"), running prioritization, and verifying color-coded badges (🟢 Clear | 🟡 Review | 🔴 Needs Work) appear on task cards with hover tooltips explaining the score.

**Acceptance Scenarios**:

1. **Given** task list includes vague task "Improve UX", **When** quality analysis runs, **Then** task shows 🔴 "Needs Work" badge with suggestion "Split into measurable sub-tasks"
2. **Given** task includes numbers/metrics like "Reduce checkout steps from 5 → 3", **When** quality scoring occurs, **Then** task receives 🟢 "Clear" badge with 0.9 clarity score
3. **Given** user hovers over quality badge, **When** tooltip appears, **Then** it shows clarity breakdown: verb strength, specificity, granularity check
4. **Given** user edits vague task "Fix bugs" to specific "Fix login timeout bug (max 3s response)", **When** edit is saved, **Then** quality badge updates from 🔴 to 🟢 within 500ms with subtle pulsing animation during recalculation

---

### User Story 3 - Draft Task Generation & Approval (Priority: P2)

As a user who sees missing coverage areas, I can click "Generate Draft Tasks" to get AI-suggested tasks that fill detected gaps, review them, edit if needed, and accept them for insertion into my prioritized plan, so that I don't have to manually write bridging tasks.

**Why this priority**: Automates the tedious work of writing tasks to fill gaps. Depends on P1 gap detection being complete.

**Independent Test**: Can be fully tested by having coverage <70%, clicking "Generate Draft Tasks" button, seeing 2-3 draft suggestions with reasoning, editing one, accepting another, and verifying both appear in active task list with proper dependencies.

**Acceptance Scenarios**:

1. **Given** coverage analysis shows missing "pricing experiments" concept, **When** user clicks "Generate Draft Tasks", **Then** draft appears: "Run pricing A/B test: $49 vs $59 tier" with reason "Addresses gap in outcome alignment"
2. **Given** user sees draft task, **When** user clicks "Edit", **Then** inline editor opens allowing text modification before acceptance
3. **Given** user accepts 2 draft tasks, **When** insertion completes, **Then** tasks appear in active list with dependency links and quality badges already calculated

---

### User Story 4 - Quality Issue Remediation (Priority: P3)

As a user who sees a task flagged with quality issues, I can click an inline "Refine" button to get AI-suggested improvements (e.g., split vague task into 2 specific sub-tasks), preview the suggestions, and apply them, so that my task list maintains high clarity standards without manual rewriting.

**Why this priority**: Provides actionable remediation for flagged issues. Enhances P2 by offering direct fix suggestions rather than just highlighting problems.

**Independent Test**: Can be fully tested by having task "Improve site performance" flagged as 🔴 "Needs Work", clicking "Refine" button, seeing split suggestion ("Audit page load times" + "Reduce bundle size by 30%"), and accepting to replace original task with 2 new tasks.

**Acceptance Scenarios**:

1. **Given** task "Launch feature" flagged with "Missing prerequisite" warning, **When** user clicks "Refine", **Then** system suggests inserting "Run QA smoke tests" task before launch with dependency link
2. **Given** vague task "Improve CVR", **When** user requests refinement, **Then** AI suggests 2 measurable alternatives with acceptance checkboxes
3. **Given** user accepts refinement, **When** replacement completes, **Then** original task is archived and new tasks appear with updated quality scores

---

### Edge Cases

- What happens when coverage analysis finds zero gaps (100% coverage)? → Show success message "Tasks fully cover goal" with no draft generation button
- How does system handle conflicting quality suggestions (e.g., "split task" vs "merge similar tasks")? → Prioritize split for vague tasks, merge only for near-duplicates >0.9 similarity
- What if user dismisses all draft tasks but coverage remains low? → Store dismissal preferences, don't re-suggest same concepts, show persistent coverage warning
- How to prevent over-generation flooding user with 20+ draft tasks? → Hard limit to 3 drafts per detected gap, confidence threshold >0.7 for suggestions
- What if draft task generation fails (API error, timeout)? → Show fallback message "Unable to generate tasks, try manual addition" with error logged
- What happens when user has more than 50 tasks? → System analyzes top 50 by priority/confidence, displays warning banner "Analysis limited to top 50 tasks. Consider archiving completed tasks to improve coverage accuracy."
- What if OpenAI API is down during quality analysis? → System retries once after 2-second delay; if still failing, switches to basic heuristics (length/verb/metric checks) and shows banner "AI analysis unavailable. Showing basic quality scores. [Retry]"
- What if user clicks Retry but API still fails? → After 3 total attempts (1 auto + 2 manual), disable retry button and show "AI service temporarily unavailable. Quality scores based on basic heuristics."
- What if user rapidly edits multiple tasks in quick succession? → System debounces recalculation: waits 300ms after last edit, shows pulsing animation on all affected badges, then recalculates in single batch to prevent API spam
- What happens when background recalculation is still running but user navigates away? → Cancel pending recalculation, preserve optimistic UI state, recalculate on next page visit if data is stale (>5 minutes old)
- How does Phase 10 interact with Phase 5 gap filling? → P10 runs first (semantic/quality gaps); if coverage <80% after P10 tasks accepted, P5 activates for dependency gaps; both shown in modal with clear labels ("🎯 Semantic" vs "🔗 Dependency")
- What if P10 and P5 suggest similar tasks? → System deduplicates using embedding similarity (>0.85 threshold); P10 suggestions take priority, P5 duplicates are suppressed

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST calculate semantic coverage score (0-100%) comparing outcome embedding vs task cluster using cosine similarity with threshold 0.7
- **FR-002**: System MUST detect missing conceptual areas using vector distance analysis and LLM extraction when coverage <70%
- **FR-003**: System MUST evaluate task quality using clarity heuristics: length (10-100 chars), verb strength (strong/weak), specificity (contains metrics), granularity (task size estimation)
- **FR-004**: System MUST display color-coded quality badges (🟢 Clear=0.8+, 🟡 Review=0.5-0.8, 🔴 Needs Work=<0.5) on all task cards
- **FR-005**: System MUST generate maximum 3 draft tasks per detected gap with reasoning and confidence score
- **FR-006**: Users MUST be able to edit draft task text before acceptance
- **FR-007**: System MUST run dependency validation before inserting accepted draft tasks (cycle detection using Kahn's algorithm)
- **FR-008**: System MUST store coverage analysis results in `agent_sessions.coverage_analysis` JSONB column
- **FR-009**: System MUST store quality scores in `task_embeddings.quality_metadata` JSONB column
- **FR-010**: System MUST auto-open Gap Detection Modal when coverage <70% after prioritization
- **FR-011**: System MUST provide hover tooltips explaining quality score breakdown (verb, specificity, granularity)
- **FR-012**: System MUST run gap analysis asynchronously (<3s at P95) without blocking prioritization results
- **FR-013**: System MUST track draft task acceptance rate for success metrics (target ≥50%)
- **FR-014**: System MUST prevent re-suggesting dismissed draft concepts in same session
- **FR-015**: System MUST use GPT-4o-mini for quality evaluation and draft generation (cost optimization)
- **FR-016**: System MUST automatically archive (hide from active list) original vague tasks when user accepts quality remediation suggestions, preserving them in task history for audit purposes
- **FR-017**: System MUST support coverage analysis and quality evaluation for up to 50 tasks per cycle; if task count exceeds 50, system should analyze top 50 by priority/confidence and display warning "Analysis limited to top 50 tasks"
- **FR-018**: System MUST implement retry-once logic for AI API failures (OpenAI timeout, rate limit); on second failure, fallback to basic heuristics: length-based clarity scoring, keyword-based verb strength detection, and pattern-based granularity checks
- **FR-019**: System MUST display error banner when AI analysis fails: "AI analysis unavailable. Showing basic quality scores. [Retry]" with manual retry button
- **FR-020**: Basic heuristics fallback MUST assign quality scores based on: task length (10-30 chars=0.7, 31-80=0.9, <10 or >100=0.4), action verb presence (Build/Test/Deploy=strong, Improve/Fix=weak), metric detection (contains numbers=+0.2 bonus)
- **FR-021**: System MUST recalculate coverage percentage and quality badges in real-time when user adds, edits, or removes tasks, using optimistic UI updates (show change immediately) with background async recalculation
- **FR-022**: System MUST debounce rapid task changes: wait for 300ms of inactivity before triggering background recalculation to prevent performance degradation
- **FR-023**: During background recalculation, system MUST show subtle loading indicator (spinner on coverage bar, pulsing animation on affected quality badges) without blocking user interaction
- **FR-024**: System MUST cache previous analysis results and use incremental updates when possible (recalculate only affected tasks, not entire set) to maintain <500ms recalculation latency
- **FR-025**: System MUST run Phase 10 semantic/quality gap detection first; if coverage remains <80% after P10 draft task acceptance, automatically trigger Phase 5 dependency-based gap filling (suggestBridgingTasks) as fallback
- **FR-026**: When both Phase 10 and Phase 5 gaps are detected, system MUST clearly label draft tasks by source: "🎯 Semantic Gap" (P10) vs "🔗 Dependency Gap" (P5) in the Gap Detection Modal
- **FR-027**: System MUST prevent duplicate suggestions between P10 and P5: if P10 already suggested a task semantically similar (>0.85 embedding similarity) to a P5 bridging task, suppress the P5 suggestion

### Key Entities

- **Coverage Analysis Result**: Stores coverage percentage, missing conceptual areas, goal embedding, task cluster centroid, analysis timestamp
- **Quality Assessment**: Contains clarity score (0-1), verb strength classification, specificity indicators, granularity flags, improvement suggestions array
- **Draft Task**: Holds generated task text, estimated hours, cognition level, reasoning for generation, gap area it addresses, confidence score, source indicator (Phase 10 semantic/quality vs Phase 5 dependency-based), deduplication hash
- **Quality Issue**: Represents flagged problem with task, severity level (high/medium/low), suggested remediation actions, user dismissal state
- **Gap Indicator**: Captures semantic distance between goal and tasks, missing concept labels, coverage threshold used, detection method (semantic_analysis vs dependency_chain)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Gap detection accuracy ≥80% measured by user acceptance rate of flagged gaps (target: accepted or edited, not dismissed)
- **SC-002**: Average task clarity score increases from baseline ~0.6 → 0.8+ after quality suggestions applied
- **SC-003**: Goal-task coverage improves from baseline ~65% → 85%+ after draft task acceptance
- **SC-004**: Draft task acceptance rate ≥50% (accepted or edited vs dismissed)
- **SC-005**: Gap analysis completes in <3s at P95 (asynchronous, measured from prioritization end to coverage display)
- **SC-006**: User complaints about "vague tasks" decrease by 60% in feedback surveys post-deployment
- **SC-007**: Quality badge visibility on 100% of task cards within 500ms of task list render
- **SC-008**: Zero false positives for 100% coverage scenarios (no gaps flagged when coverage truly complete)
- **SC-009**: Real-time quality badge updates complete within 500ms at P95 for single task edits, <1s for batch changes affecting multiple tasks
