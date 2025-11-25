# Implementation Plan: Priorities Page UX Refinement

**Branch**: `001-priorities-page-ux` | **Date**: 2025-11-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-priorities-page-ux/spec.md`
**Reference**: [Phase 17 Shape Up Pitch](../../docs/shape-up-pitches/phase-17-priorities-page-ux-refinement.md)

## Summary

Refactor the priorities page layout to fix critical UX issues where controls are separated from their effects. Integrate the sorting strategy selector into the TaskList header for immediate visual feedback, consolidate completion metadata into the ContextCard to reduce cognitive load, and remove the low-value ReasoningChain component from the primary interface. This is a pure UI reorganization following vertical slice protocol (SEE IT, DO IT, VERIFY IT) with no backend changes or new features.

**Core Problem**: Users must scroll ~500px to verify sorting changes. Standalone metadata components violate vertical slice protocol by providing no user action. Debug observability (ReasoningChain) clutters the primary workflow.

**Solution Approach**: Move sorting control into TaskList header, integrate metadata display into ContextCard, and hide ReasoningChain behind `?debug=true` query parameter. Reduce page layout from 4+ scattered sections to 2 cohesive sections (Context + Tasks).

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 15, React 19)
**Primary Dependencies**: Next.js, React, Tailwind CSS v4, shadcn/ui, date-fns (`formatDistanceToNow`)
**Storage**: N/A (frontend-only refactoring)
**Testing**: Vitest + React Testing Library
**Target Platform**: Web (desktop + mobile, 320px-1920px)
**Project Type**: Web application (Next.js frontend)
**Performance Goals**: <100ms render time, maintain existing performance
**Constraints**:
- Must maintain Phase 8 mobile responsiveness (44px touch targets, responsive breakpoints)
- Must maintain existing sorting behavior (no logic changes)
- Must pass all existing integration tests after selector updates
**Scale/Scope**: 3 components modified, 2 components deprecated, ~15 test files updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Vertical Slice**: Feature delivers SEE → DO → VERIFY for users (Principle I)
  - P1: User sees sorting dropdown in header, changes strategy, verifies tasks re-order immediately
  - P2: User sees metadata in ContextCard, recalculates priorities, verifies metadata updates
  - P3: User loads page, sees clean interface without debugging clutter
- [x] **Test-First**: Tests written before implementation, coverage target ≥80% (Principle II)
  - Will update existing tests for new layout structure
  - Will add integration tests for sorting feedback loop
  - Will maintain >80% coverage (currently ~85%)
- [x] **Autonomous Architecture**: Fits Sense → Reason → Act → Learn pattern if agent-related (Principle III)
  - N/A - Pure UI refactoring, no agent changes
- [x] **Modular Services**: New services decoupled, single-purpose, clear interfaces (Principle IV)
  - No new services - refactoring existing React components
  - Components remain decoupled with clear prop interfaces
- [x] **Observable**: Telemetry planned for new operations (Principle V)
  - No new telemetry needed - preserving existing behavior
- [x] **Quality Standards**: TypeScript strict mode, Zod validation, security review
  - TypeScript strict mode enabled (existing)
  - No new validation needed (pure UI)
  - No security implications (layout changes only)
- [x] **Completion Criteria**: All 6 checkpoints (UI, backend, feedback, tests, review, demo-ready)
  - UI: Sorting in header, metadata in ContextCard, clean layout
  - Backend: N/A (frontend only)
  - Feedback: Immediate task re-ordering, metadata badges
  - Tests: Integration tests for sorting feedback loop
  - Review: code-reviewer agent validation
  - Demo: Can show before/after scrolling distance

## Project Structure

### Documentation (this feature)

```text
specs/001-priorities-page-ux/
├── plan.md              # This file
├── research.md          # Component analysis and layout patterns
├── data-model.md        # Component prop interfaces
├── quickstart.md        # Manual testing guide
├── contracts/           # Component prop type contracts
└── tasks.md             # Vertical slice tasks (created by /tasks command)
```

### Source Code (repository root)

```text
app/
├── priorities/
│   ├── page.tsx                              # MODIFY - Remove standalone sections, pass new props
│   └── components/
│       ├── TaskList.tsx                      # MODIFY - Add header with sorting integration
│       ├── ContextCard.tsx                   # MODIFY - Add metadata display
│       ├── SortingStrategySelector.tsx       # MODIFY - Add compact variant prop
│       ├── PrioritizationSummary.tsx         # DEPRECATE - Move to ContextCard
│       ├── ReasoningChain.tsx                # HIDE - Show only in debug mode
│       └── __tests__/
│           ├── TaskList.test.tsx             # UPDATE - New header structure
│           ├── ContextCard.test.tsx          # UPDATE - Metadata props
│           ├── SortingStrategySelector.test.tsx  # UPDATE - Compact variant
│           ├── PrioritizationSummary.test.tsx    # DEPRECATE/DELETE
│           └── ReasoningChain.test.tsx       # UPDATE - Debug mode behavior

__tests__/
├── integration/
│   ├── sorting-strategies.test.tsx           # UPDATE - New selector location
│   ├── strategic-prioritization.test.tsx     # UPDATE - Layout structure
│   └── priorities-ux-feedback-loop.test.tsx  # NEW - Sorting in viewport test
```

**Structure Decision**: Next.js web application structure. All changes confined to `app/priorities/` directory. No API routes modified (pure frontend). Test updates in both component tests (`app/priorities/components/__tests__/`) and integration tests (`__tests__/integration/`).

## Complexity Tracking

> **No constitution violations** - This feature fully complies with all principles.

This is a straightforward UI refactoring with no complexity justifications needed. All changes follow vertical slice protocol and simplify the existing architecture by reducing scattered sections and improving information hierarchy.

## Phase 0: Research

### Current State Analysis

**Files to Analyze**:
1. `app/priorities/page.tsx` (lines 2383-2730) - Current layout structure
2. `app/priorities/components/TaskList.tsx` - Current task display implementation
3. `app/priorities/components/ContextCard.tsx` - Current context card structure
4. `app/priorities/components/SortingStrategySelector.tsx` - Current sorting dropdown
5. `app/priorities/components/PrioritizationSummary.tsx` - Current metadata display
6. `app/priorities/components/ReasoningChain.tsx` - Current debug component

**Research Questions**:
- How is TaskList currently structured? Does it accept a header prop or will we need to add one?
- What props does ContextCard currently accept? How extensible is it for metadata?
- What props does SortingStrategySelector use? Can we add a `compact` boolean easily?
- How is PrioritizationSummary styled? What data does it display?
- How is ReasoningChain rendered? What conditions trigger its display?
- What existing tests cover these components? What test selectors will break with layout changes?

###Component Dependencies

**TaskList Dependencies**:
- Uses TaskRow for individual task rendering
- Likely has sorting logic passed from page.tsx
- May have existing styling that needs header integration

**ContextCard Dependencies**:
- Uses shadcn/ui Card components
- Displays outcome, reflections, recalculate button
- May need `date-fns` for `formatDistanceToNow`

**Layout Flow**:
```
Current:
page.tsx
  → PrioritizationSummary (standalone)
  → SortingStrategySelector (standalone)
  → ReasoningChain (standalone)
  → TaskList
    → TaskRow[]

Target:
page.tsx
  → ContextCard (+ metadata from PrioritizationSummary)
  → TaskList (+ SortingStrategySelector in header)
    → [Header: Title | Count | Sorting]
    → TaskRow[]
  → (ReasoningChain only if ?debug=true)
```

### Design System Compliance

**Patterns to Follow**:
- Use existing shadcn/ui components (Card, Badge, Select)
- Follow Phase 8 mobile-first approach: `h-11 sm:h-9`, `text-xs sm:text-sm`
- Use design tokens: `bg-layer-*`, `shadow-2layer-*`, `text-muted-foreground`
- Maintain WCAG AA contrast (4.5:1 minimum)
- Preserve 44px touch targets on mobile

**Reference Components**:
- `app/priorities/components/TaskRow.tsx` - Mobile-responsive patterns
- `app/components/OutcomeBuilder.tsx` - Modal metadata display patterns
- `app/priorities/components/ContextCard.tsx` - Existing card structure

### Testing Strategy

**Test Categories**:
1. **Unit Tests**: Component prop acceptance, conditional rendering
2. **Integration Tests**: Sorting feedback loop, metadata updates after recalculation
3. **Visual Regression**: Before/after screenshots (manual)
4. **Accessibility**: Keyboard navigation for sorting dropdown

**Critical Test Scenarios**:
- Sorting strategy change triggers immediate re-render
- Metadata displays correctly in ContextCard
- ReasoningChain hidden by default, visible with `?debug=true`
- Mobile layout stacks properly at 320px, 375px
- All 5 sorting strategies work identically

## Phase 1: Design Artifacts

### Data Model

**Component Prop Interfaces**:

```typescript
// app/priorities/components/TaskList.tsx
interface TaskListProps {
  tasks: PrioritizedTask[];
  sortingStrategy: SortingStrategy;           // NEW
  onStrategyChange: (strategy: SortingStrategy) => void;  // NEW
  onTaskClick?: (taskId: string) => void;
  // ... existing props
}

// app/priorities/components/ContextCard.tsx
interface ContextCardProps {
  outcome: Outcome;
  reflectionsCount: number;
  onRecalculate: () => void;
  completionTime?: Date;                      // NEW
  qualityCheckPassed?: boolean;               // NEW
  // ... existing props
}

// app/priorities/components/SortingStrategySelector.tsx
interface SortingStrategySelectorProps {
  selectedStrategy: SortingStrategy;
  onStrategyChange: (strategy: SortingStrategy) => void;
  compact?: boolean;                          // NEW - for header embedding
  disabled?: boolean;
}

// app/priorities/components/ReasoningChain.tsx
interface ReasoningChainProps {
  chainOfThought: string[];
  totalIterations: number;
  debugMode?: boolean;                        // NEW - controls visibility
}
```

**Type Definitions**:
```typescript
type SortingStrategy =
  | 'strategic-impact'
  | 'effort-weighted'
  | 'deadline-focused'
  | 'lno-first'
  | 'manual-override';

interface PrioritizedTask {
  task_id: string;
  task_text: string;
  strategic_score?: number;
  // ... existing fields
}
```

### Contracts

**Component Contract**: TaskList Header Integration

```typescript
// TaskList must render header before task rows
describe('TaskList Header', () => {
  it('displays sorting dropdown when tasks exist', () => {
    const { getByRole } = render(
      <TaskList
        tasks={mockTasks}
        sortingStrategy="strategic-impact"
        onStrategyChange={mockOnChange}
      />
    );
    expect(getByRole('combobox')).toBeInTheDocument();
  });

  it('disables sorting dropdown when no tasks', () => {
    const { getByRole } = render(
      <TaskList
        tasks={[]}
        sortingStrategy="strategic-impact"
        onStrategyChange={mockOnChange}
      />
    );
    expect(getByRole('combobox')).toBeDisabled();
  });

  it('triggers re-render when strategy changes', async () => {
    const onStrategyChange = vi.fn();
    const { getByRole, rerender } = render(
      <TaskList
        tasks={mockTasks}
        sortingStrategy="strategic-impact"
        onStrategyChange={onStrategyChange}
      />
    );

    await userEvent.selectOptions(getByRole('combobox'), 'effort-weighted');
    expect(onStrategyChange).toHaveBeenCalledWith('effort-weighted');
  });
});
```

**Component Contract**: ContextCard Metadata Display

```typescript
describe('ContextCard Metadata', () => {
  it('displays completion time when provided', () => {
    const completionTime = new Date(Date.now() - 120000); // 2 min ago
    const { getByText } = render(
      <ContextCard
        outcome={mockOutcome}
        reflectionsCount={5}
        completionTime={completionTime}
        onRecalculate={vi.fn()}
      />
    );
    expect(getByText(/2 minutes ago/i)).toBeInTheDocument();
  });

  it('displays quality check badge when passed', () => {
    const { getByText } = render(
      <ContextCard
        outcome={mockOutcome}
        reflectionsCount={5}
        qualityCheckPassed={true}
        onRecalculate={vi.fn()}
      />
    );
    expect(getByText(/Quality check.*Passed/i)).toBeInTheDocument();
  });

  it('gracefully handles missing metadata', () => {
    const { queryByText } = render(
      <ContextCard
        outcome={mockOutcome}
        reflectionsCount={5}
        onRecalculate={vi.fn()}
      />
    );
    expect(queryByText(/ago/i)).not.toBeInTheDocument();
    expect(queryByText(/Quality check/i)).not.toBeInTheDocument();
  });
});
```

**Integration Contract**: Sorting Feedback Loop

```typescript
describe('Sorting Feedback Loop', () => {
  it('user sees tasks re-order without scrolling', async () => {
    const { getByRole, getAllByTestId } = render(<PrioritiesPage />);

    // Initial state: strategic impact sorting
    const tasks = getAllByTestId('task-row');
    expect(tasks[0]).toHaveTextContent('High impact task');

    // Change to effort-weighted
    await userEvent.selectOptions(
      getByRole('combobox', { name: /sort/i }),
      'effort-weighted'
    );

    // Verify re-order happened in same viewport
    const reorderedTasks = getAllByTestId('task-row');
    expect(reorderedTasks[0]).toHaveTextContent('Quick win task');

    // Verify no scroll occurred
    expect(window.scrollY).toBe(0);
  });
});
```

### Quickstart: Manual Testing Guide

**Test Scenario 1: Immediate Sorting Feedback (P1)**

1. Navigate to `/priorities` with existing tasks
2. Locate sorting dropdown in TaskList header (should be right-aligned)
3. Note current task order
4. Select different strategy from dropdown
5. **VERIFY**: Tasks re-order immediately without scrolling
6. **VERIFY**: Dropdown and task list both visible in viewport
7. Test on mobile (375px): **VERIFY** header stacks properly

**Test Scenario 2: Consolidated Metadata (P2)**

1. Run prioritization (recalculate button)
2. Wait for completion
3. **VERIFY**: ContextCard shows "Completed X min ago"
4. **VERIFY**: ContextCard shows quality check badge (green ✓ or yellow ⚠)
5. **VERIFY**: No standalone PrioritizationSummary section exists
6. Test on mobile (375px): **VERIFY** metadata wraps cleanly

**Test Scenario 3: Streamlined Interface (P3)**

1. Load `/priorities` without query params
2. **VERIFY**: ReasoningChain component not visible
3. Load `/priorities?debug=true`
4. **VERIFY**: ReasoningChain appears at bottom in collapsed section
5. Expand ReasoningChain (if iterations exist)
6. **VERIFY**: Chain-of-thought steps display correctly

**Edge Case Testing**:
- Load with 0 tasks → sorting dropdown disabled
- Load without outcome → metadata section absent
- Rapidly change sorting strategies → no jarring re-renders
- Resize viewport 320px → 1920px → layout responds properly

**Acceptance Checklist**:
- [ ] Sorting dropdown integrated into TaskList header
- [ ] Tasks re-order in same viewport (0px scroll)
- [ ] Metadata displays in ContextCard (not standalone)
- [ ] ReasoningChain hidden by default
- [ ] Page has 2 main sections (Context + Tasks, not 4+)
- [ ] All sorting strategies work identically
- [ ] Mobile responsive (320px-1920px)
- [ ] All tests pass

## Phase 2: Implementation Approach

### Development Sequence (TDD)

**Slice 1: TaskList Header Integration (Day 1, 3-4 hours)**

*Test-First Steps*:
1. Write failing test: TaskList renders header with sorting dropdown
2. Write failing test: Sorting dropdown positioned correctly (right-aligned)
3. Write failing test: Sorting dropdown disabled when tasks.length === 0
4. Implement: Add header div to TaskList component
5. Implement: Embed SortingStrategySelector in header
6. Implement: Pass sortingStrategy and onStrategyChange props
7. Run tests → GREEN
8. Update page.tsx: Remove standalone SortingStrategySelector, pass props to TaskList
9. Run integration tests → Update selectors if needed → GREEN

**Slice 2: SortingStrategySelector Compact Variant (Day 1, 1 hour)**

*Test-First Steps*:
1. Write failing test: Compact prop reduces padding and font size
2. Implement: Add conditional className based on compact prop
3. Run tests → GREEN
4. Update TaskList header: Pass `compact={true}` to SortingStrategySelector
5. Verify mobile responsiveness: Test 320px, 375px viewports

**Slice 3: ContextCard Metadata Integration (Day 2, 2 hours)**

*Test-First Steps*:
1. Write failing test: ContextCard renders completion time with formatDistanceToNow
2. Write failing test: ContextCard renders quality check badge (green/yellow variant)
3. Write failing test: ContextCard gracefully handles undefined metadata
4. Implement: Add completionTime and qualityCheckPassed props to ContextCard
5. Implement: Render metadata in CardContent after reflections count
6. Run tests → GREEN
7. Update page.tsx: Remove PrioritizationSummary, pass metadata props to ContextCard
8. Run integration tests → GREEN

**Slice 4: ReasoningChain Debug Mode (Day 2, 1 hour)**

*Test-First Steps*:
1. Write failing test: ReasoningChain hidden when debugMode false or undefined
2. Write failing test: ReasoningChain visible when debugMode true
3. Implement: Add conditional rendering based on debugMode prop
4. Update page.tsx: Check query param `?debug=true`, conditionally render ReasoningChain
5. Run tests → GREEN

**Slice 5: Integration Testing & Polish (Day 3, 3-4 hours)**

*Test-First Steps*:
1. Write integration test: Sorting feedback loop (viewport verification)
2. Write integration test: Metadata updates after recalculation
3. Update all affected test selectors for new layout
4. Run full test suite → Fix failures → GREEN
5. Manual testing: Run quickstart guide scenarios
6. Visual regression: Before/after screenshots
7. Code review: code-reviewer agent validation

### File Modification Checklist

**MODIFY**:
- [ ] `app/priorities/page.tsx` - Remove 3 standalone sections, pass new props
- [ ] `app/priorities/components/TaskList.tsx` - Add header with sorting
- [ ] `app/priorities/components/ContextCard.tsx` - Add metadata display
- [ ] `app/priorities/components/SortingStrategySelector.tsx` - Add compact variant

**UPDATE TESTS**:
- [ ] `app/priorities/components/__tests__/TaskList.test.tsx`
- [ ] `app/priorities/components/__tests__/ContextCard.test.tsx`
- [ ] `app/priorities/components/__tests__/SortingStrategySelector.test.tsx`
- [ ] `app/priorities/components/__tests__/ReasoningChain.test.tsx`
- [ ] `__tests__/integration/sorting-strategies.test.tsx`
- [ ] `__tests__/integration/strategic-prioritization.test.tsx`

**DEPRECATE** (keep files, mark as deprecated in comments):
- [ ] `app/priorities/components/PrioritizationSummary.tsx`
- [ ] `app/priorities/components/__tests__/PrioritizationSummary.test.tsx`

**CREATE NEW**:
- [ ] `__tests__/integration/priorities-ux-feedback-loop.test.tsx`

### Risk Mitigation Plan

**Risk 1: Breaking Existing Tests (HIGH)**
- Mitigation: Run `pnpm test:run` after each slice
- Mitigation: Update test selectors incrementally
- Mitigation: Maintain full test coverage (>80%)
- Rollback: Git commit after each green slice

**Risk 2: ContextCard Overcrowding (MEDIUM)**
- Mitigation: Design metadata display first (research phase)
- Mitigation: Use compact badges and muted colors
- Fallback: Move metadata to TaskList header if ContextCard too busy

**Risk 3: SortingStrategySelector Size (LOW)**
- Mitigation: Test compact variant on 320px viewport
- Mitigation: Adjust padding/font-size if needed
- Fallback: Stack sorting on separate row on mobile

**Risk 4: Performance Regression (LOW)**
- Mitigation: Monitor render times with React DevTools
- Mitigation: Use React.memo if needed
- Target: Maintain <100ms render time

## Phase 3: Validation & Handoff

### Completion Criteria

**Functional Validation**:
- [ ] User changes sorting strategy, tasks re-order in same viewport
- [ ] Completion time displays correctly (formatDistanceToNow)
- [ ] Quality check badge shows correct variant (success/warning)
- [ ] ReasoningChain hidden by default
- [ ] ReasoningChain visible with `?debug=true`
- [ ] Page layout has 2 sections (Context + Tasks)

**Technical Validation**:
- [ ] All unit tests pass (component tests)
- [ ] All integration tests pass (user journey tests)
- [ ] Test coverage >80% maintained
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Mobile responsive (320px, 375px, 768px, 1024px+)

**Quality Validation**:
- [ ] Code reviewed by code-reviewer agent
- [ ] Design system compliance verified
- [ ] WCAG AA contrast maintained (4.5:1)
- [ ] 44px touch targets on mobile
- [ ] No performance regressions (<100ms render)

**User Validation**:
- [ ] Manual test scenarios completed (quickstart guide)
- [ ] Before/after screenshots captured
- [ ] Demo-ready (can show to non-technical stakeholder)

### Handoff Documentation

**Changes Summary**:
- TaskList: Added header with integrated sorting dropdown
- ContextCard: Added completion time and quality check metadata display
- SortingStrategySelector: Added compact variant for header embedding
- PrioritizationSummary: Deprecated, functionality moved to ContextCard
- ReasoningChain: Hidden by default, visible only with `?debug=true`
- Page layout: Reduced from 4+ sections to 2 cohesive sections

**Migration Notes**:
- No database migrations required (frontend only)
- No API changes required (no backend modifications)
- No environment variables added
- Existing sorting behavior unchanged (logic preserved)
- All features remain functional (no removals, only reorganization)

**Known Limitations**:
- ReasoningChain still available for debugging (not fully removed)
- PrioritizationSummary component files remain (deprecated, not deleted)
- No animated transitions (instant re-render only)

**Future Enhancements** (out of scope for this feature):
- Animated task re-ordering transitions
- Persistent sorting preference in localStorage
- Advanced debug panel with expanded telemetry
- Metadata export functionality

## Appendix: Reference Materials

**Related Documentation**:
- [Phase 17 Shape Up Pitch](../../docs/shape-up-pitches/phase-17-priorities-page-ux-refinement.md) - Full UX analysis and breadboard sketches
- [.claude/SYSTEM_RULES.md](../../.claude/SYSTEM_RULES.md) - Vertical slice protocol
- [.claude/standards.md](../../.claude/standards.md) - Design system standards
- [Phase 8: Mobile-First Transformation](../../docs/shape-up-pitches/phase-8-mobile-first-transformation.md) - Mobile responsiveness patterns

**Code Evidence** (current state):
- `app/priorities/page.tsx:2383-2387` - PrioritizationSummary standalone
- `app/priorities/page.tsx:2712-2723` - SortingStrategySelector standalone
- `app/priorities/page.tsx:2724-2730` - ReasoningChain standalone
- Component files: All exist in `app/priorities/components/`

**Success Metrics** (from spec):
- Scroll distance to verify sorting: ~500px → 0px
- Standalone sections: 4 → 2
- Time to understand sorting effect: ~5-10s → <2s
- User complaints about ReasoningChain: Eliminated
- Mobile responsiveness: Maintained (320px-1920px)

## Progress Tracking

**Phase 0: Research** ✅ COMPLETE (plan creation)
- [x] Analyzed current component structure
- [x] Identified dependencies and patterns
- [x] Defined research questions
- [x] Reviewed design system compliance

**Phase 1: Design Artifacts** ✅ COMPLETE (plan creation)
- [x] Defined component prop interfaces
- [x] Created component contracts
- [x] Wrote quickstart manual test guide
- [x] Documented data model changes

**Phase 2: Implementation** ⏳ PENDING (requires /tasks command)
- [ ] Slice 1: TaskList header integration
- [ ] Slice 2: SortingStrategySelector compact variant
- [ ] Slice 3: ContextCard metadata integration
- [ ] Slice 4: ReasoningChain debug mode
- [ ] Slice 5: Integration testing & polish

**Phase 3: Validation** ⏳ PENDING
- [ ] Functional validation complete
- [ ] Technical validation complete
- [ ] Quality validation complete
- [ ] User validation complete
- [ ] Handoff documentation complete

**Next Steps**: Run `/tasks` command to generate vertical slice tasks from this plan.
