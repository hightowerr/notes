# Feature Specification: Reflection Capture

**Feature Branch**: `004-reflection-capture-quick`
**Created**: 2025-10-16
**Status**: Draft
**Input**: User description: "Reflection Capture — Quick context input for dynamic prioritization"

## Execution Flow (main)
```
1. Parse user description from Input
   → Feature identified: Lightweight reflection capture system
2. Extract key concepts from description
   → Actors: Knowledge workers managing action priorities
   → Actions: Capture life context, influence task prioritization
   → Data: Short text reflections with timestamps
   → Constraints: 10-60 second input, no editing/deleting
3. Unclear aspects marked with [NEEDS CLARIFICATION]
4. User Scenarios & Testing section completed
   → Primary flow: Add reflection → System adjusts priorities
5. Functional Requirements generated
   → All requirements testable and aligned to user value
6. Key Entities identified (Reflection, Recency Weight)
7. Review Checklist status: READY
   → No implementation details present
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

### Session 2025-10-16
- Q: When a background recompute job fails (e.g., AI service timeout, invalid response), what should happen? → A: Reflection saved, error toast shown (user notified but reflection persists)
- Q: When a user tries to submit a reflection but experiences offline/network error, what should happen? → A: Show immediate error, discard reflection (user must retype when online)
- Q: What logging/observability signals should be captured for operational monitoring? → A: Basic only: reflection created, recompute triggered (minimal logging)
- Q: If two users add reflections simultaneously (rare edge case), how should the system handle concurrent reflection inserts? → A: Both succeed independently (append-only, no conflict)
- Q: Who/what enforces the "indefinite retention" policy for reflections (FR-051)? → A: Application responsibility (no automated deletion, manual cleanup only if needed)

---

## Problem Statement

Users currently experience static prioritization based solely on long-term outcome statements that change infrequently. However, daily life context shifts significantly: energy levels fluctuate, constraints emerge, blockers arise, and momentum shifts.

Without a way to communicate current state, the system continues surfacing the same high-intensity work even when users are burnt out, have limited time blocks, or are blocked on dependencies. This creates a mismatch between suggested priorities and actual capacity, leading to task avoidance and guilt.

**The core gap**: The system knows where users are going (outcome) but not where they are today (current state/context).

---

## User Scenarios & Testing

### Primary User Story
As a knowledge worker, I want to quickly capture my current life context (energy, constraints, blockers, momentum) in 10-60 seconds so that the system can adjust my task priorities to match my actual capacity and situation today, without requiring deep journaling or time-consuming reflection exercises.

### Acceptance Scenarios

1. **Given** I'm feeling burnt out on Monday morning, **When** I add a reflection "Feeling burnt out, need lighter tasks", **Then** the system immediately promotes quick-win tasks (15min, low focus) and demotes high-intensity strategic work (4h, deep focus)

2. **Given** I just had a successful client call on Wednesday, **When** I add "Client call went well, momentum high!", **Then** the system promotes strategic work that capitalizes on my energy and demotes mindless administrative tasks

3. **Given** I have back-to-back meetings today, **When** I add "Only have 30min blocks today", **Then** the system surfaces short-duration tasks that fit my time constraints and hides longer tasks

4. **Given** I've added 3 reflections over 7 days, **When** I view my priorities, **Then** today's reflection has 100% influence weight, 3-day-old reflection has ~70% weight, and 7-day-old reflection has 50% weight

5. **Given** I open the reflection input, **When** I type 35 characters of text, **Then** I see no character counter (anxiety-free experience)

6. **Given** I type 455 characters, **When** the count reaches 450, **Then** I see a gentle character counter appear

7. **Given** I type 500 characters, **When** I attempt to continue, **Then** I see message "Reflections work best when concise. Wrap up this thought." (discourage but don't hard-block)

8. **Given** I submit a reflection, **When** the submission completes, **Then** the textarea clears within 200ms, new reflection appears at top of recent list, toast shows "✅ Reflection added", and priority recompute triggers in background within 2 seconds

9. **Given** I have 0 reflections, **When** I open the reflection panel, **Then** I see empty state with example and explanation (first-time guidance)

10. **Given** I add 3 reflections within 30 seconds, **When** the last one submits, **Then** system triggers only 1 recompute (debounced) and shows toast "✅ 3 reflections added. Updating priorities..."

11. **Given** I'm on desktop (<1400px width), **When** I first visit the page, **Then** reflection panel is collapsed by default (discoverability via icon or keyboard)

12. **Given** I'm on mobile, **When** I open reflection input, **Then** I see full-screen modal (not sidebar)

13. **Given** I submit a reflection on mobile, **When** submission completes, **Then** modal auto-closes and I return to previous screen

14. **Given** I open reflection panel via keyboard shortcut (Cmd+R), **When** panel opens, **Then** textarea auto-focuses

15. **Given** I open reflection panel via mouse click, **When** panel opens, **Then** textarea does NOT auto-focus (user might be browsing, not typing)

### Edge Cases

- What happens when a user adds identical reflection text on consecutive days?
  - **Answer**: System accepts both (no deduplication). Duplicate text signals sustained state (e.g., burnout persisting), which is valid signal for prioritization.

- How does system handle reflections with no meaningful content?
  - **Answer**: Minimum 10 characters enforced to prevent accidental empty saves. If user submits exactly 10 chars of random text, system accepts (no content validation beyond length).

- What happens to reflections older than 30 days?
  - **Answer**: Reflections older than 30 days receive ~0.06 weight (effectively zero in scoring calculations), but remain stored in system for potential future analytics features.

- How does system prevent API overload if user rapidly adds many reflections?
  - **Answer**: Recompute requests are debounced by 2 seconds. Only the last reflection in a burst triggers recompute. Rate limit: maximum 1 recompute per user per 10 seconds.

- What happens if recompute job fails?
  - **Answer**: Reflection is saved successfully to database. User sees error toast notification (e.g., "Could not update priorities. Your reflection was saved."). Priorities remain unchanged until next successful recompute. No automatic retry.

- How are reflections handled during offline/network errors?
  - **Answer**: System shows immediate error toast (e.g., "No connection. Please try again when online."). Reflection text is NOT saved locally or persisted. User must retype reflection when network connection restored. Textarea remains populated until user closes panel (allows immediate retry if connection returns quickly).

- What happens if user adds reflections from multiple devices simultaneously?
  - **Answer**: Both reflections succeed independently (append-only model, no conflict). Each reflection gets unique ID and precise timestamp. System treats concurrent inserts as separate valid context captures. Recent list shows most recent 5 by timestamp across all devices.

---

## Requirements

### Functional Requirements

**Reflection Capture**
- **FR-001**: Users MUST be able to add reflections via collapsible panel accessible from any page with icon/button
- **FR-002**: Users MUST be able to open/close reflection panel via keyboard shortcut (Cmd+R on Mac, Ctrl+R on Windows)
- **FR-003**: Reflection text MUST be between 10 and 500 characters (enforced at submission)
- **FR-004**: Character counter MUST NOT appear until user reaches 450 characters
- **FR-005**: Character counter MUST appear with gentle message at 500 characters: "Reflections work best when concise. Wrap up this thought."
- **FR-006**: System MUST support plain text only (no rich text formatting like bold, italic, links)
- **FR-007**: Users MUST NOT be able to edit or delete reflections after submission (append-only model)
- **FR-008**: Users MUST NOT be able to categorize, tag, or label reflections (free-form text only)

**Immediate Feedback**
- **FR-009**: System MUST clear textarea within 200ms of reflection submission (instant success feedback)
- **FR-010**: System MUST show new reflection at top of recent list immediately after submission (optimistic UI update)
- **FR-011**: System MUST show toast notification "✅ Reflection added" immediately after submission
- **FR-012**: System MUST trigger background priority recompute within 2 seconds of reflection submission
- **FR-013**: System MUST NOT show loading spinner during recompute (trust async job pattern)

**Recent Reflections Display**
- **FR-014**: System MUST display 5 most recent reflections in panel with visual fade (100%, 85%, 70%, 55%, 40% opacity)
- **FR-015**: System MUST show relative timestamps for each reflection: "Just now", "3h ago", "2 days ago"
- **FR-016**: System MUST display timestamps older than 7 days as "7+ days ago" (no exact date for old reflections)
- **FR-017**: Recent reflections MUST be read-only display (no interaction beyond viewing)

**Recency Weighting**
- **FR-018**: System MUST calculate recency weight using exponential decay formula with 7-day half-life: weight = 0.5^(age_in_days/7)
- **FR-019**: Reflections from today MUST receive 1.0 weight (100% influence)
- **FR-020**: Reflections 7 days old MUST receive 0.5 weight (50% influence)
- **FR-021**: Reflections 14 days old MUST receive 0.25 weight (25% influence)
- **FR-022**: Reflections 30 days old MUST receive ~0.06 weight (effectively zero influence)
- **FR-023**: System MUST exclude reflections with weight <0.10 from active scoring calculations

**Priority Adjustment**
- **FR-024**: System MUST use reflection context to adjust task prioritization alongside outcome statements
- **FR-025**: System MUST promote tasks matching user's stated energy level (e.g., "burnt out" promotes lighter tasks)
- **FR-026**: System MUST promote tasks matching user's stated time constraints (e.g., "30min blocks" promotes short tasks)
- **FR-027**: System MUST demote tasks requiring incompatible resources (e.g., "waiting on legal" demotes contract work)
- **FR-028**: System MUST maintain long-term outcome alignment while applying short-term reflection influence

**Panel Behavior - Desktop**
- **FR-029**: Reflection panel MUST be collapsed by default on first visit (discoverability, not intrusive)
- **FR-030**: Panel MUST expand via icon/button click or Cmd+R keyboard shortcut
- **FR-031**: Textarea MUST auto-focus ONLY when panel opened via keyboard shortcut (not mouse click)
- **FR-032**: Pressing Escape key MUST close panel when panel has focus
- **FR-033**: Pressing Cmd+Enter MUST submit reflection when textarea has focus
- **FR-034**: Pressing Tab MUST move between textarea and "Add Reflection" button

**Panel Behavior - Mobile**
- **FR-035**: Reflection input MUST appear as full-screen modal on mobile (not sidebar)
- **FR-036**: Modal MUST auto-close after successful submission
- **FR-037**: User MUST return to previous screen after modal closes
- **FR-038**: Toast MUST include "Add Another" button if user wants to add more reflections immediately

**Empty State**
- **FR-039**: System MUST show empty state guidance when user has 0 reflections
- **FR-040**: Empty state MUST include example reflection text
- **FR-041**: Empty state MUST include bullet list of what to capture (energy, constraints, blockers, momentum)
- **FR-042**: Empty state text MUST be concise and actionable (no overwhelming explanation)

**Debouncing & Rate Limiting**
- **FR-043**: System MUST debounce recompute triggers by 2 seconds (prevent API spam)
- **FR-044**: System MUST trigger only 1 recompute if user adds multiple reflections within 30 seconds
- **FR-045**: System MUST enforce rate limit of maximum 1 recompute per user per 10 seconds
- **FR-046**: Toast for bulk reflections MUST show count: "✅ 3 reflections added. Updating priorities..."

**Error Handling**
- **FR-047**: System MUST save reflection to database even if recompute job fails
- **FR-048**: System MUST show error toast when recompute fails (e.g., "Could not update priorities. Your reflection was saved.")
- **FR-049**: System MUST NOT retry failed recompute automatically (user can add another reflection to trigger new recompute)
- **FR-067**: System MUST show immediate error toast on network/offline errors (e.g., "No connection. Please try again when online.")
- **FR-068**: System MUST NOT save reflection locally when submission fails due to network error
- **FR-069**: System MUST keep textarea populated after network error (allows immediate retry if connection restored)
- **FR-070**: System MUST clear textarea only after successful server acknowledgment

**Storage & Retention**
- **FR-050**: System MUST store reflection text with full timestamp precision (not just date)
- **FR-051**: System MUST retain reflections indefinitely (no automatic deletion at 30 days)
- **FR-052**: System MUST persist reflections across sessions and devices
- **FR-053**: Duplicate reflection text MUST be accepted (no deduplication logic)
- **FR-071**: Application code MUST NOT include automated deletion logic for reflections based on age
- **FR-072**: Manual cleanup of old reflections MAY be performed by operations team if storage costs become concern (requires explicit administrative action)

**Excluded Features (No-Gos)**
- **FR-054**: System MUST NOT allow editing of reflections after submission
- **FR-055**: System MUST NOT allow deletion of reflections
- **FR-056**: System MUST NOT provide tags, labels, folders, or categories
- **FR-057**: System MUST NOT offer reflection templates or dropdown options (e.g., "Burnt out | Energized")
- **FR-058**: System MUST NOT perform automatic sentiment/mood analysis
- **FR-059**: System MUST NOT send reflection reminders or notifications
- **FR-060**: System MUST NOT track reflection streaks or gamification
- **FR-061**: System MUST NOT provide search, filtering, or keyword matching on reflections
- **FR-062**: System MUST NOT support rich text formatting (bold, italic, links)
- **FR-063**: System MUST NOT include reflection goals (e.g., "Reflect 3x per week")
- **FR-064**: System MUST NOT enable sharing of reflections (private only)
- **FR-065**: System MUST NOT generate AI-suggested reflections
- **FR-066**: System MUST NOT send reflection digest emails

### Non-Functional Requirements

**Performance**
- **NFR-001**: Reflection submission latency MUST be <300ms at 95th percentile (fast feedback)
- **NFR-002**: Textarea clear latency MUST be <200ms (instant feel)
- **NFR-003**: Recompute trigger latency MUST be <2 seconds after reflection added
- **NFR-004**: Panel open/close animation MUST feel instantaneous (<100ms)

**Reliability**
- **NFR-005**: System MUST achieve zero data loss on reflection submission (no failed writes without user notification)
- **NFR-006**: System MUST handle network failures gracefully with immediate error notification and textarea preservation for retry

**Observability**
- **NFR-016**: System MUST log reflection creation events (user ID, timestamp, character count)
- **NFR-017**: System MUST log recompute trigger events (user ID, trigger reason, timestamp)
- **NFR-018**: System MUST NOT log reflection text content (privacy protection)

**Usability**
- **NFR-007**: Reflection completion time MUST be <60 seconds median (quick capture goal)
- **NFR-008**: Reflection length MUST average 30-150 characters (concise but meaningful target)

**Success Metrics**
- **NFR-009**: ≥50% of users SHOULD add at least 1 reflection within first 3 days (adoption goal)
- **NFR-010**: ≥2 reflections per active user per week average (engagement goal)
- **NFR-011**: ≥30% of users SHOULD add reflections ≥2x per week (consistent usage goal)
- **NFR-012**: ≥40% of sessions SHOULD include opening reflection panel (discovery goal)
- **NFR-013**: Task completion rate SHOULD increase ≥20% for reflection-adjusted priorities (impact goal)
- **NFR-014**: User survey "Reflections help surface the right work" SHOULD score ≥4.2/5.0 (satisfaction goal)
- **NFR-015**: ≥15% of actions SHOULD change rank after reflection added (priority shift evidence)

### Key Entities

- **Reflection**: Represents a user's brief capture of current life context (energy, constraints, blockers, momentum). Contains unique ID, plain text (10-500 chars), and precise timestamp. Cannot be edited or deleted after creation. Append-only model allows concurrent inserts without conflict (multi-device safe). Used to influence task prioritization dynamically.

- **Recency Weight**: Calculated value representing influence strength of a reflection based on age. Uses exponential decay with 7-day half-life. Today's reflection = 1.0 weight, 7 days old = 0.5 weight, 30 days old = ~0.06 (effectively zero). Weights <0.10 are excluded from scoring.

- **User Outcome**: Existing entity representing long-term goal statement (e.g., "Increase MRR by 25%"). Reflections complement outcomes by adding short-term context without replacing long-term direction.

- **Task/Action Priority**: Calculated ranking of extracted tasks influenced by both outcome alignment (long-term) and reflection context (short-term). Reflections shift priorities up/down based on feasibility given current user state.

---

## Dependencies & Assumptions

### Dependencies
- **Existing system**: Outcome management feature (T008-T011) must be functional to provide long-term context baseline
- **Existing system**: Task extraction and prioritization logic must exist to apply reflection-based adjustments
- **Existing system**: Recompute service (T012) must be operational to trigger priority recalculation

### Assumptions
- Users understand that reflections influence priorities but don't override outcome direction completely
- Users are willing to spend 10-60 seconds capturing context for improved prioritization
- Exponential decay with 7-day half-life accurately models how reflection relevance fades over time
- 5 most recent reflections provide sufficient context for priority adjustment (no need to process 10+ reflections)
- Desktop users will discover collapsed panel via icon or keyboard shortcut without onboarding
- Mobile users prefer full-screen modal over sidebar for text input
- Append-only model (no editing/deleting) reduces friction more than it frustrates users
- Character limits (10-500) strike balance between meaningful content and quick capture
- Indefinite reflection storage will not create significant storage cost burden (average 30-150 chars per reflection)
- Manual cleanup by operations team is acceptable approach if storage costs become concern in future

---

## Out of Scope (6-Week Cycle)

The following features are explicitly excluded from this cycle and deferred to future iterations:

1. **Reflection History View**: Browsing/searching reflections older than 5 most recent
2. **Pattern Detection**: AI analysis of reflection patterns (e.g., "You say 'burnt out' every Monday")
3. **Sentiment Analysis**: Automatic mood/emotion detection from reflection text
4. **Export/Journal Features**: Downloading reflections as journal entries
5. **Reflection Reminders**: Notifications prompting users to add reflections
6. **Reflection Streaks**: Gamification features tracking consecutive reflection days
7. **Reflection Templates**: Pre-written options or category dropdowns
8. **Rich Text Support**: Bold, italic, links, or formatting in reflection text
9. **Reflection Editing**: Ability to modify reflections after submission
10. **Reflection Deletion**: Ability to remove reflections from history
11. **Reflection Sharing**: Team visibility or collaborative reflection features
12. **Reflection Goals**: Targets like "Reflect 3x per week" with progress tracking
13. **Reflection Digest Emails**: Weekly summaries sent to inbox
14. **AI-Generated Suggestions**: System-initiated reflection prompts based on user behavior
15. **Advanced Filtering**: Keyword search, date range filters, tag-based organization

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain (5 clarifications resolved)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable (NFR-009 through NFR-015)
- [x] Scope is clearly bounded (Out of Scope section with 15 excluded features)
- [x] Dependencies and assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted (actors: knowledge workers; actions: capture context, adjust priorities; data: reflections with timestamps; constraints: 10-60s input, append-only)
- [x] Ambiguities marked and resolved (5 clarifications completed)
- [x] User scenarios defined (15 acceptance scenarios + 7 edge cases)
- [x] Requirements generated (72 functional requirements + 18 non-functional requirements)
- [x] Entities identified (Reflection, Recency Weight, User Outcome, Task Priority)
- [x] Review checklist passed (all clarifications resolved)

---

## Next Steps

1. ✅ **Clarification Phase**: COMPLETE - All 5 critical ambiguities resolved
   - Recompute failure behavior: Save reflection, show error toast, no retry
   - Offline/network error: Show error, discard reflection, keep textarea for retry
   - Observability: Basic logging only (reflection created, recompute triggered)
   - Concurrent inserts: Both succeed independently (append-only, no conflict)
   - Retention enforcement: Application responsibility, no automated deletion

2. **Planning Phase**: READY - Use `/plan` command to generate implementation plan from this specification

3. **Task Generation**: After planning complete, use `/tasks` command to create vertical slice task list

4. **Implementation**: Execute via `/implement` command using slice-orchestrator agent
