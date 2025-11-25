# Feature Specification: Priorities Page UX Refinement

**Feature Branch**: `001-priorities-page-ux`
**Created**: 2025-11-25
**Status**: Draft
**Input**: User description: "Priorities Page UX Refinement - Integrate sorting controls into TaskList header, consolidate metadata into ContextCard, and remove low-value ReasoningChain component"

**Reference**: Shape Up Pitch - Phase 17 (`docs/shape-up-pitches/phase-17-priorities-page-ux-refinement.md`)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Immediate Sorting Feedback (Priority: P1)

As a user prioritizing tasks, I want to change the sorting strategy and immediately see the tasks re-order in the same viewport, so I can quickly verify my selection worked without scrolling.

**Why this priority**: Fixes the critical feedback loop violation where users must scroll ~500px to verify their sorting action. This is the highest-impact UX improvement addressing the core "control separated from effect" problem.

**Independent Test**: Can be fully tested by loading /priorities page with existing tasks, changing the sorting dropdown in the TaskList header, and verifying tasks re-order immediately below without scrolling. Delivers immediate value by restoring the "SEE IT, DO IT, VERIFY IT" vertical slice protocol.

**Acceptance Scenarios**:

1. **Given** I'm on /priorities with 10+ tasks displayed, **When** I select "Impact First" from the sorting dropdown in the TaskList header, **Then** tasks re-order by impact score immediately below the dropdown without requiring scroll
2. **Given** I'm on /priorities with tasks sorted by "Effort Weighted", **When** I change to "Deadline Focused" in the header dropdown, **Then** tasks re-sort instantly and I can see the new order in the same viewport
3. **Given** I'm on mobile (375px), **When** I change sorting strategy, **Then** the dropdown and task list both remain visible on screen with immediate feedback
4. **Given** I'm on /priorities with no tasks, **When** the TaskList renders, **Then** the sorting dropdown is visible but disabled with appropriate message
5. **Given** I'm on desktop (1920px), **When** I change sorting strategy, **Then** the header layout remains clean with sorting control properly aligned to the right

---

### User Story 2 - Consolidated Context Metadata (Priority: P2)

As a user reviewing my prioritization, I want to see completion time and quality status integrated into the outcome context area, so I have all relevant metadata in one cohesive section instead of scattered standalone components.

**Why this priority**: Eliminates standalone PrioritizationSummary component that violates vertical slice protocol (no user action). Reduces visual clutter from 4 separate sections to 2 cohesive sections. Important but lower priority than sorting feedback loop.

**Independent Test**: Can be tested independently by loading /priorities, verifying completion time and quality check badge appear in ContextCard below the outcome statement, and confirming no standalone PrioritizationSummary section exists. Delivers value by reducing cognitive load.

**Acceptance Scenarios**:

1. **Given** I've completed prioritization 2 minutes ago, **When** I load /priorities, **Then** I see "Completed 2 min ago" text in the ContextCard below my outcome statement
2. **Given** prioritization passed quality threshold, **When** I view ContextCard, **Then** I see a green "Quality check: ✓ Passed" badge alongside the completion time
3. **Given** prioritization failed quality threshold, **When** I view ContextCard, **Then** I see a yellow "Quality check: ⚠ Review" badge indicating review needed
4. **Given** I haven't run prioritization yet, **When** I view ContextCard, **Then** completion time and quality check are not displayed (graceful absence)
5. **Given** I'm on mobile (375px), **When** viewing ContextCard, **Then** metadata wraps cleanly and remains readable without horizontal scroll

---

### User Story 3 - Streamlined Interface (Priority: P3)

As a user focused on actionable tasks, I want the ReasoningChain debug component removed from the primary interface, so I have a cleaner, more focused view without low-value observability cluttering the page.

**Why this priority**: Removes component that users report as "unclear value" and often shows no iterations. Polish improvement that reduces visual noise but doesn't fix a broken workflow like P1 or reduce cognitive load like P2.

**Independent Test**: Can be tested by loading /priorities and verifying ReasoningChain component is not visible in the default view. Optionally verify it's available via `?debug=true` query parameter. Delivers value by focusing user attention on actionable content.

**Acceptance Scenarios**:

1. **Given** I load /priorities without query parameters, **When** page renders, **Then** ReasoningChain component is not visible anywhere on the page
2. **Given** I load /priorities?debug=true, **When** page renders, **Then** ReasoningChain appears in a collapsed "Debug Info" section at the bottom of the page
3. **Given** I'm viewing /priorities with debug mode off, **When** I recalculate priorities, **Then** no ReasoningChain appears even if iterations occurred
4. **Given** I'm in debug mode and expand ReasoningChain, **When** iterations exist, **Then** I see the chain-of-thought steps formatted clearly
5. **Given** I'm in debug mode and expand ReasoningChain, **When** no iterations exist (fast path), **Then** I see "No iterations (fast path)" message instead of empty component

---

### Edge Cases

- **What happens when TaskList has 0 tasks?** Sorting dropdown should be visible but disabled with tooltip "No tasks to sort"
- **What happens when ContextCard has no outcome?** Metadata section should not render (graceful degradation)
- **What happens when completion time is null?** Only quality check badge shows, completion time is omitted
- **What happens when quality check is undefined?** Only completion time shows, quality badge is omitted
- **What happens on narrow mobile (320px)?** TaskList header should stack: title on top row, sorting + count on second row
- **What happens when SortingStrategySelector is too wide for header?** Use compact prop to reduce padding and font size
- **What happens if user bookmarks /priorities?debug=true?** ReasoningChain persists in debug mode for their session
- **What happens during SSR/initial load?** Sorting dropdown shows loading state or default strategy without flash of unstyled content
- **What happens when user rapidly changes sorting strategies?** Debounce or optimistic UI prevents jarring re-renders

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: TaskList component MUST accept `sortingStrategy` and `onStrategyChange` props to enable integrated sorting control
- **FR-002**: TaskList component MUST render a header section with title, task count, and sorting dropdown before task rows
- **FR-003**: SortingStrategySelector MUST support a `compact` prop variant for reduced size when embedded in headers
- **FR-004**: ContextCard component MUST accept `completionTime` and `qualityCheckPassed` props to display metadata
- **FR-005**: ContextCard MUST render completion time using `formatDistanceToNow` (e.g., "2 min ago") when provided
- **FR-006**: ContextCard MUST render quality check badge with appropriate variant (success/warning) when qualityCheckPassed is defined
- **FR-007**: Priorities page MUST remove standalone PrioritizationSummary component from layout
- **FR-008**: Priorities page MUST remove standalone SortingStrategySelector section (move into TaskList header)
- **FR-009**: Priorities page MUST remove ReasoningChain component from default view
- **FR-010**: System MUST support optional `?debug=true` query parameter to show ReasoningChain for troubleshooting
- **FR-011**: TaskList header MUST maintain mobile responsiveness with proper stacking at 320px-640px breakpoints
- **FR-012**: All existing sorting strategies (Strategic Impact, Effort Weighted, etc.) MUST work identically with new layout
- **FR-013**: Task re-ordering MUST occur immediately (same viewport) when sorting strategy changes
- **FR-014**: Page layout MUST reduce from 4+ standalone sections to 2 cohesive sections (Context + Tasks)
- **FR-015**: All design system standards MUST be maintained (shadows, colors, spacing, WCAG AA contrast)

### Key Entities

- **TaskList Component**: Displays prioritized tasks with integrated header containing title, task count, and sorting control. Accepts sorting props and renders TaskRow components in a scrollable list.
- **ContextCard Component**: Displays outcome statement, active reflections count, completion metadata (time + quality check), and recalculate button. Consolidates all context-related information.
- **SortingStrategySelector Component**: Dropdown for selecting task sorting strategy. Enhanced with compact variant for header embedding. Triggers immediate task re-ordering.
- **PrioritizationSummary Component**: **[DEPRECATED]** Previously standalone component showing completion time and quality status. Functionality moved to ContextCard.
- **ReasoningChain Component**: **[REMOVED from primary UI]** Previously displayed chain-of-thought from quality loop. Now available only via debug mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: User can verify sorting strategy effect without scrolling (0px scroll distance vs current ~500px)
- **SC-002**: Page layout reduces from 4 standalone sections to 2 cohesive sections (Context + Tasks)
- **SC-003**: Time to understand sorting effect reduces from ~5-10 seconds (with scroll) to <2 seconds (immediate visual feedback)
- **SC-004**: Zero user complaints about ReasoningChain unclear value (removed from default view)
- **SC-005**: All 5 sorting strategies (Strategic Impact, Effort Weighted, Deadline Focused, LNO First, Manual Override) work identically with new layout
- **SC-006**: Mobile responsiveness maintained across all viewport sizes (320px, 375px, 768px, 1024px+) with no regressions from Phase 8
- **SC-007**: All existing integration tests pass with new layout structure (sorting-strategies.test.tsx, strategic-prioritization.test.tsx)
- **SC-008**: Visual design system compliance verified: 2-layer shadows, color contrast 4.5:1+, proper spacing tokens
- **SC-009**: Task count display accuracy: Shows correct count even with filtering/exclusions applied
- **SC-010**: Metadata display accuracy: Completion time updates after recalculation, quality badge reflects actual threshold status

### Non-Functional Requirements

- **NFR-001**: Layout changes MUST NOT introduce performance regressions (maintain <100ms render time)
- **NFR-002**: Component refactoring MUST NOT break existing test coverage (maintain >80% coverage)
- **NFR-003**: Sorting dropdown MUST maintain keyboard navigation accessibility (tab, arrow keys, enter)
- **NFR-004**: All interactive elements MUST maintain 44px minimum touch targets on mobile (<640px)
- **NFR-005**: Debug mode (`?debug=true`) MUST NOT affect normal user experience when disabled

### Vertical Slice Compliance

**Before (Violations identified):**
1. PrioritizationSummary: ❌ SEE IT (yes) + ❌ DO IT (no action) + ❌ VERIFY IT (nothing to verify) = **Violates protocol**
2. SortingStrategySelector: ✅ SEE IT + ✅ DO IT + ❌ VERIFY IT (must scroll) = **Breaks feedback loop**
3. ReasoningChain: ⚠️ SEE IT (sometimes) + ❌ DO IT (only expand) + ❌ VERIFY IT (unclear) = **Low user value**

**After (Compliance achieved):**
1. ContextCard with Metadata: ✅ SEE IT (outcome + metadata) + ✅ DO IT (recalculate) + ✅ VERIFY IT (metadata updates) = **Valid slice**
2. TaskList with Integrated Sorting: ✅ SEE IT (dropdown in header) + ✅ DO IT (change strategy) + ✅ VERIFY IT (tasks re-order instantly) = **Perfect feedback loop**
3. ReasoningChain: Removed from primary UI, optional debug mode only = **Not part of user workflow**

### Ready When

1. ✅ User changes sorting strategy and sees tasks re-order in same viewport (no scroll)
2. ✅ Completion time and quality check visible in ContextCard (not standalone)
3. ✅ ReasoningChain no longer visible in primary interface
4. ✅ Page layout has 2 cohesive sections: Context + Tasks (not 4+ scattered sections)
5. ✅ All sorting strategies work identically (behavior unchanged, just relocated)
6. ✅ Mobile responsive (320px-1920px) with no regressions
7. ✅ All integration tests pass with new layout structure

## Out of Scope

- New sorting algorithms or strategies (use existing only)
- TaskList component architectural rewrite (add header prop only)
- Advanced debug panel or separate page (remove or hide completely)
- Metadata dashboard or expanded analytics (2-3 fields max in ContextCard)
- Animated transitions for sorting (instant re-render only)
- Mobile-specific layout changes beyond existing breakpoints (Phase 8 complete)
- Modifications to sorting logic or prioritization algorithm (pure UI changes)
- Test infrastructure refactoring (update affected tests only)
- New state management patterns (use existing props)
- Design system updates (comply with existing standards)

## Dependencies

- **Phase 8**: Mobile-First Transformation (COMPLETE) - Responsive breakpoints must be maintained
- **Phase 15**: Reflection Intelligence (COMPLETE) - No conflicts
- **Phase 16**: Document-Aware Prioritization (IN PROGRESS) - No conflicts, parallel development safe
- **Existing Components**: SortingStrategySelector, ContextCard, TaskList (will be enhanced, not replaced)

**No new dependencies required** - Pure refactoring of existing components.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing tests | High - Layout changes break selectors | Update tests for new structure, verify coverage maintained, run full test suite before merge |
| Losing debug capability | Medium - ReasoningChain removal | Keep component archived, implement `?debug=true` support for troubleshooting |
| ContextCard overcrowding | Medium - Too much metadata | Use alternative (TaskList header) if ContextCard becomes too busy during implementation |
| SortingStrategySelector size | Low - May not fit in header | Create `compact` prop variant, test mobile viewports (320px), adjust padding/font if needed |
| User confusion | Low - "Where did components go?" | No user-facing issue - improving UX by consolidating, not removing features |
| Performance regression | Low - Additional header rendering | Monitor render times, use React.memo if needed, maintain <100ms target |

## Appetite

**3-day batch** (8-11 hours estimated):
- Day 1: TaskList Integration (3-4 hours)
- Day 2: Metadata Consolidation (2-3 hours)
- Day 3: Cleanup & Polish (3-4 hours)

## Notes

- This is a pure UI reorganization with no new features or backend changes
- All changes follow vertical slice protocol: SEE IT, DO IT, VERIFY IT
- Layout improvements address user feedback: "controls separated from effects", "unclear value", "better placement needed"
- Reference Shape Up pitch (phase-17) for detailed breadboard sketches and fat marker flows
- Code evidence: app/priorities/page.tsx lines 2383-2387 (PrioritizationSummary), 2712-2723 (SortingStrategySelector), 2724-2730 (ReasoningChain)
