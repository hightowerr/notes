# Feature Specification: Outcome Management

**Feature Branch**: `002-outcome-management-shape`
**Created**: 2025-10-11
**Status**: Draft
**Input**: User description: "Outcome Management — Shape Up Pitch (6-week cycle)"

## Execution Flow (main)
```
1. Parse user description from Input
   → Feature centers on structured outcome statement builder
2. Extract key concepts from description
   → Actors: Knowledge workers setting strategic outcomes
   → Actions: Build structured outcome, preview, edit, trigger AI recompute
   → Data: Outcome statement (4 fields), localStorage drafts, recompute jobs
   → Constraints: Single active outcome only, no free text, P0 single-user
3. For each unclear aspect:
   → None identified - pitch provides comprehensive detail
4. Fill User Scenarios & Testing section
   → First-time setup flow, edit flow, recompute behavior
5. Generate Functional Requirements
   → All requirements testable and bounded by no-gos
6. Identify Key Entities
   → Outcome statement, recompute job, field validation state
7. Run Review Checklist
   → No implementation details, all sections complete
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## Clarifications

### Session 2025-10-11
- Q: Where should outcome statements persist? → A: Supabase database table (server-side, survives browser wipes)
- Q: When async recompute permanently fails after retries, what should user see? → A: Toast warning "Some actions may show outdated scores"
- Q: What is the maximum acceptable delay for preview updates as user types? → A: <1000ms (1 second, acceptable for non-critical updates)
- Q: When user saves a new outcome while an active outcome exists, what should happen? → A: Show confirmation dialog "Replace existing outcome?" with Yes/Cancel
- Q: Which events should system log for operational monitoring? → A: Errors only (recompute failures, save errors)

---

## User Scenarios & Testing

### Primary User Story
A knowledge worker opens the AI Note Synthesiser for the first time. Currently, the AI extracts actions from notes but treats "Organize team lunch" the same as "Finalize Q2 revenue model" because it has no strategic context. The user needs to define a measurable outcome—"Increase monthly recurring revenue by 25% within 6 months through enterprise customer acquisition"—so the AI can score and prioritize actions based on alignment with this specific goal.

The user fills a 4-field structured form (Direction, Object, Metric, Clarifier) and watches a preview assemble in real-time. After setting the outcome, it displays prominently at the top of every page. When the user uploads notes, the AI now scores actions against this outcome (e.g., "Draft enterprise pricing tier proposal" = 95/100, "Update LinkedIn profile" = 25/100). If the user needs to pivot strategy, they click edit, modify fields, and the system triggers an async recompute of all action scores.

### Acceptance Scenarios
1. **Given** no outcome is set, **When** user navigates to app for first time, **Then** outcome builder form displays with 4 fields, placeholders, and formula explanation
2. **Given** user types in Direction="Increase", Object="monthly recurring revenue", Metric="25% within 6 months", Clarifier="enterprise customer acquisition", **When** any field changes, **Then** preview updates immediately showing assembled statement
3. **Given** user fills all 4 fields (min 3 chars each), **When** user clicks "Set Outcome Statement", **Then** system saves outcome, displays it at top of interface, and shows success confirmation
4. **Given** outcome is set, **When** user clicks edit icon (✏️), **Then** modal opens with 4-field form pre-filled with current values
5. **Given** user edits outcome and clicks "Update Outcome", **When** save completes, **Then** system shows "✅ Outcome updated. Re-scoring N actions..." toast immediately and fires async recompute job
6. **Given** user is editing outcome, **When** user accidentally closes modal before saving, **Then** system stores draft in localStorage and shows "Resume editing?" prompt on next modal open (24-hour limit)
7. **Given** outcome exists, **When** AI processes new uploaded notes, **Then** actions are scored based on alignment with outcome statement
8. **Given** user enters Direction="Launch", **When** preview assembles, **Then** statement omits "the" article (e.g., "Launch beta product to 50 users" not "Launch the beta product")
9. **Given** user enters Metric="by Q2" without numeric percentage, **When** user tries to save, **Then** system allows save (validation is forgiving for binary outcomes)
10. **Given** user enters Object with 101 characters, **When** user tries to continue, **Then** system prevents input beyond 100-char limit per field

### Edge Cases
- What happens when user navigates away from outcome setup without completing? System does not save incomplete outcome, user sees form again on next visit
- How does system handle concurrent outcome edits across multiple tabs? Only one active outcome allowed (P0 constraint), last save wins
- What happens if async recompute job fails? System retries automatically; if permanently fails after retries, user sees toast warning "Some actions may show outdated scores"
- How does mobile keyboard Enter key behave in form fields? Enter moves to next field (Direction → Object → Metric → Clarifier), does NOT submit form
- What if localStorage draft is corrupted or malformed? System ignores corrupted draft and shows fresh form
- How does system handle recompute when no actions exist yet? Recompute job runs successfully but has no items to score (no-op)
- What happens when user tries to save a new outcome while one exists? System shows confirmation dialog "Replace existing outcome?" with Yes/Cancel; on Yes, previous outcome is replaced (not archived)

---

## Requirements

### Functional Requirements

**Outcome Creation & Display**
- **FR-001**: System MUST provide a 4-field structured form for first-time users with fields: Direction (dropdown), Object (text input), Metric (text input), Clarifier (text input)
- **FR-002**: Direction dropdown MUST offer 5 options: Increase, Decrease, Maintain, Launch, Ship
- **FR-003**: System MUST display real-time preview of assembled outcome statement as user types in any field (target latency <1000ms)
- **FR-004**: System MUST validate each field contains minimum 3 characters before allowing save
- **FR-005**: System MUST enforce maximum character limits: Object (100 chars), Metric (100 chars), Clarifier (150 chars)
- **FR-006**: System MUST assemble outcome statement using formula: "[Direction] the [Object] by [Metric] through [Clarifier]" for Increase/Decrease/Maintain
- **FR-007**: System MUST omit "the" article when Direction is Launch or Ship (e.g., "Launch beta product to 50 users")
- **FR-008**: System MUST preserve exact capitalization and spacing from user input in assembled statement
- **FR-009**: System MUST NOT add punctuation (periods, commas) to assembled statement
- **FR-010**: System MUST display active outcome at top of every page after successful save
- **FR-043**: System MUST persist outcome statement to server-side database (Supabase) after successful save

**Outcome Editing**
- **FR-011**: System MUST provide inline edit icon (✏️) next to displayed outcome
- **FR-012**: System MUST open modal with same 4-field form pre-filled when user clicks edit icon
- **FR-013**: System MUST allow only one active outcome at a time (no multi-goal support)
- **FR-014**: System MUST store incomplete edits in localStorage when user closes modal without saving
- **FR-015**: System MUST prompt "Resume editing?" when user reopens modal within 24 hours of unsaved draft
- **FR-016**: System MUST expire localStorage drafts after 24 hours
- **FR-046**: System MUST show confirmation dialog "Replace existing outcome?" with Yes/Cancel when user attempts to save a new outcome while an active outcome exists
- **FR-047**: System MUST replace (not archive) previous outcome when user confirms replacement

**AI Recompute Integration**
- **FR-017**: System MUST trigger async recompute of all action scores when outcome is updated
- **FR-018**: System MUST show immediate success toast "✅ Outcome updated. Re-scoring N actions..." without waiting for recompute to complete
- **FR-019**: System MUST display subtle loading indicator in priorities list while recompute is running
- **FR-020**: System MUST use active outcome statement as context for AI scoring when processing uploaded notes
- **FR-044**: System MUST retry failed recompute jobs automatically
- **FR-045**: System MUST display toast warning "Some actions may show outdated scores" if recompute permanently fails after retries

**UX & Accessibility**
- **FR-021**: System MUST display progressive disclosure for guidance: placeholders in fields, hover tooltips on "?" icons, expandable examples section
- **FR-022**: System MUST NOT show wall of text explaining formula on initial load
- **FR-023**: System MUST provide 3-4 working outcome examples in expandable "See examples" section
- **FR-024**: System MUST display advisory quality checklist after user fills form (testability, control, specificity)
- **FR-025**: Quality checklist MUST be non-blocking (warnings only, no validation enforcement)
- **FR-026**: System MUST support keyboard navigation: Tab moves Direction → Object → Metric → Clarifier → Save button
- **FR-027**: Enter key MUST move focus to next field, NOT submit form
- **FR-028**: Only explicit click on "Set Outcome" or "Update Outcome" button MUST trigger save

**Mobile Experience**
- **FR-029**: System MUST stack 4 fields vertically on mobile with preview fixed at bottom of viewport (sticky)
- **FR-030**: Direction radio buttons MUST become segmented control on mobile
- **FR-031**: System MUST NOT use side-by-side layout or horizontal scroll on mobile

**No-Go Boundaries**
- **FR-032**: System MUST NOT allow free-text outcome input (structured form only)
- **FR-033**: System MUST NOT decompose outcomes into sub-outcomes or key results
- **FR-034**: System MUST NOT provide team/shared outcome features (single-user only)
- **FR-035**: System MUST NOT send notifications about deadline approaching
- **FR-036**: System MUST NOT integrate with external metrics sources (Stripe, analytics)
- **FR-037**: System MUST NOT provide outcome templates library
- **FR-038**: System MUST NOT provide AI coaching on outcome quality ("too ambitious" feedback)
- **FR-039**: System MUST NOT compare outcomes to industry benchmarks
- **FR-040**: System MUST NOT provide progress tracking dashboard toward outcome target
- **FR-041**: System MUST NOT version or archive old outcomes (old outcomes deactivate)
- **FR-042**: System MUST NOT support multiple active goals (single outcome only)

### Non-Functional Requirements

**Performance**
- **NFR-001**: Preview assembly latency MUST be <1000ms from last keystroke to visible update
- **NFR-002**: Outcome save operation SHOULD complete within 2 seconds under normal network conditions

**Reliability**
- **NFR-003**: Recompute job MUST implement automatic retry logic with exponential backoff
- **NFR-004**: System MUST preserve localStorage drafts even if browser crashes mid-edit (within 24-hour expiry window)

**Usability**
- **NFR-005**: Mobile form fields MUST be fully accessible via touch without horizontal scroll or pinch-zoom
- **NFR-006**: Keyboard-only navigation MUST support complete form workflow without mouse/touch

**Observability**
- **NFR-007**: System MUST log all errors (recompute failures, database save errors, validation failures)
- **NFR-008**: System SHOULD include error context (user action, timestamp, outcome data) in logs for debugging

### Key Entities

**Outcome Statement**
- Represents user's structured measurable goal
- Composed of 4 required fields: direction, object, metric, clarifier
- Has assembled preview text derived from fields
- Has created timestamp and last updated timestamp
- Only one active outcome exists per user (single-user P0 constraint)
- Related to recompute jobs triggered on update
- Persisted in Supabase database (server-side storage, survives browser wipes and enables multi-device access)
- Replacement requires user confirmation; previous outcome is deleted (not archived or versioned)

**Outcome Draft**
- Represents incomplete edits stored temporarily in browser
- Contains partial field values (direction, object, metric, clarifier)
- Has expiration timestamp (24 hours from creation)
- Tied to browser localStorage (not persisted server-side)

**Recompute Job**
- Represents async background task to re-score all actions
- Triggered when outcome is created or updated
- Has status (pending, running, completed, failed)
- Operates on all existing actions in system
- Provides count of actions being re-scored
- Supports automatic retry on failure
- Triggers user-visible toast warning if permanently fails after retries

**Field Validation State**
- Represents real-time validation feedback per field
- Tracks character count vs limits (Object: 100, Metric: 100, Clarifier: 150)
- Tracks minimum length validation (3 chars per field)
- Provides visual feedback (warnings, errors) without blocking save

**Quality Checklist**
- Represents advisory guidance shown after form completion
- Includes checks: object is controllable, metric is specific/time-bound, context limits scope, statement is testable
- Does not block form submission (informational only)

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
- [x] Scope is clearly bounded (No-Go boundaries in FR-032 through FR-042)
- [x] Dependencies and assumptions identified (single-user P0, localStorage for drafts, async recompute)

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked (none found—pitch is comprehensive)
- [x] User scenarios defined
- [x] Requirements generated (42 functional requirements)
- [x] Entities identified (5 key entities)
- [x] Review checklist passed
