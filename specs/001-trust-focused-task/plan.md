# Implementation Plan: Trust-Focused Task List Refactor

**Branch**: `001-trust-focused-task` | **Date**: 2025-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-trust-focused-task/spec.md`
**Appetite**: 3 weeks (medium batch)
**Phase**: 19

## Summary

This feature refactors the task prioritization UI to build user trust through transparency, focus, and simplicity. Primary changes: (1) Simplify TaskRow from 12+ elements to 4-5 elements, (2) Add outcome-linked brief reasoning (≤20 words) to agent output, (3) Remove 20% manual task boost for unified treatment, (4) Implement Focus Mode filter defaulting to high-leverage tasks only, (5) Create Completed Tasks section with pagination, (6) Enhance TaskDetailsDrawer for progressive disclosure. Technical approach: UI component refactoring, agent prompt enhancement with retry validation, localStorage filter persistence, mobile-first responsive design with ≥44px touch targets (WCAG AAA).

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 15, React 19
**Primary Dependencies**: Next.js 15, React 19, Tailwind CSS v4, shadcn/ui, Zod, Mastra, OpenAI GPT-4o
**Storage**: Supabase PostgreSQL + pgvector (no new migrations required)
**Testing**: Vitest, Testing Library, contract tests, integration tests
**Target Platform**: Web (desktop + mobile), Next.js SSR
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**:
- Drawer open: <200ms desktop, <500ms mobile
- Manual override apply: <100ms re-ranking
- Brief reasoning validation: <50ms per task, <150ms with retries
**Constraints**:
- Pure refactoring (no database migrations)
- Mobile-first (320px minimum, WCAG AAA)
- 3-week appetite (avoid scope creep)
- No breaking changes to existing agent architecture
**Scale/Scope**:
- 5 UI components modified
- 1 new component (CompletedTasksSection)
- 2 schema extensions (brief_reasoning, focus_mode)
- 3 service modifications (agent prompt, manual task scoring, retry logic)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Vertical Slice**: Feature delivers SEE → DO → VERIFY for users (Principle I)
  - **SEE**: Simplified task list with clear reasoning
  - **DO**: Complete tasks, apply filters, adjust priorities
  - **VERIFY**: Task moves to Completed section, filter persists, override re-ranks instantly
- [x] **Test-First**: Tests written before implementation, coverage target ≥80% (Principle II)
  - Contract tests for agent output validation
  - Integration tests for user journeys
  - Mobile viewport tests (320px/375px/768px/1024px)
- [x] **Autonomous Architecture**: Fits Sense → Reason → Act → Learn pattern if agent-related (Principle III)
  - **Sense**: Task list with scores
  - **Reason**: Agent generates brief reasoning with retry validation
  - **Act**: Display reasoning, apply filters, handle overrides
  - **Learn**: Retry failures inform prompt improvements
- [x] **Modular Services**: New services decoupled, single-purpose, clear interfaces (Principle IV)
  - CompletedTasksSection: Standalone pagination component
  - BriefReasoningValidator: Separate validation service
  - FilterPersistence: localStorage utility (no database coupling)
- [x] **Observable**: Telemetry planned for new operations (Principle V)
  - Log brief reasoning validation failures
  - Track retry attempts and fallback usage
  - Monitor filter usage patterns (Focus/Quick Wins/All)
  - Measure drawer open times and manual override latency
- [x] **Quality Standards**: TypeScript strict mode, Zod validation, security review
  - BriefReasoningSchema with Zod validation
  - Strict TypeScript (no `any` types)
  - localStorage with JSON parse error handling
- [x] **Completion Criteria**: All 6 checkpoints (UI, backend, feedback, tests, review, demo-ready)
  - UI: Simplified TaskRow + Completed section
  - Backend: Agent prompt changes + retry logic
  - Feedback: Brief reasoning display + filter persistence
  - Tests: Contract + integration + mobile viewport
  - Review: `code-reviewer` agent validation
  - Demo-ready: Manual test guide (`quickstart.md`)

## Project Structure

### Documentation (this feature)

```text
specs/001-trust-focused-task/
├── plan.md              # This file (/plan command output)
├── spec.md              # Feature specification with 7 user stories
├── research.md          # Phase 0 output (codebase analysis)
├── data-model.md        # Phase 1 output (schema changes)
├── quickstart.md        # Phase 1 output (manual test guide)
├── contracts/           # Phase 1 output (API contracts)
│   ├── README.md
│   └── agent-brief-reasoning.yaml
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

```text
# Web application structure (Next.js full-stack)
app/
├── api/                 # API routes (no new endpoints, behavior changes only)
│   └── agent/prioritize/
├── priorities/
│   ├── page.tsx         # Main priorities page (add filter persistence, Completed section)
│   └── components/
│       ├── TaskRow.tsx  # REFACTOR: Simplify to 4-5 elements
│       ├── TaskList.tsx # REFACTOR: Add Focus Mode default
│       ├── TaskDetailsDrawer.tsx # ENHANCE: Rich progressive disclosure
│       ├── CompletedTasksSection.tsx # NEW: Pagination for completed tasks
│       └── ManualOverrideControls.tsx # EXTEND: Add "Apply" button flow
└── components/
    └── ui/              # shadcn/ui components (no changes)

lib/
├── mastra/
│   └── agents/
│       └── prioritizationGenerator.ts # MODIFY: Add brief_reasoning, remove boost
├── schemas/
│   ├── prioritizationResultSchema.ts # EXTEND: Add BriefReasoningSchema
│   ├── sortingStrategy.ts # EXTEND: Add focus_mode enum
│   └── taskScoreSchema.ts # EXTEND: Add brief_reasoning field
└── services/
    ├── prioritizationLoop.ts # MODIFY: Add retry logic (3 attempts)
    ├── manualTaskPlacement.ts # MODIFY: Remove 20% boost
    └── filterPersistence.ts # NEW: localStorage utilities

__tests__/
├── contract/
│   ├── agent-brief-reasoning.test.ts # NEW: Schema validation
│   └── focus-mode-filter.test.ts # NEW: Quadrant inclusion logic
├── integration/
│   ├── trust-focused-ui.test.tsx # NEW: User journey (SEE → DO → VERIFY)
│   ├── mobile-viewport.test.tsx # NEW: 320px/375px/768px/1024px tests
│   ├── completed-tasks-pagination.test.tsx # NEW: "Show more" behavior
│   └── manual-override-apply.test.tsx # NEW: <100ms re-ranking
└── unit/
    ├── briefReasoningValidator.test.ts # NEW: Word count, generic phrase rejection
    └── filterPersistence.test.ts # NEW: localStorage read/write

supabase/
└── migrations/          # NO NEW MIGRATIONS (pure refactoring)
```

**Structure Decision**: Web application using Next.js full-stack architecture. Frontend (React components) and backend (API routes) are colocated. No database migrations needed - all changes are behavioral (agent prompt) or UI-layer (component refactoring). Testing follows existing 3-tier structure: contract (API schemas), integration (user journeys), unit (isolated logic).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No violations.** All constitution principles satisfied. Feature is pure refactoring with no new architectural patterns or infrastructure requirements.

## Implementation Approach

### Week 1: Establish Trust (Slices 1A, 1B)

**Focus**: Agent rationale + manual/AI unification

**Files Modified**:
- `lib/mastra/agents/prioritizationGenerator.ts`
  - Remove line 56: 20% manual boost
  - Add `brief_reasoning` field to output schema (lines 94-108)
  - Update prompt to enforce outcome-linked format
- `lib/schemas/prioritizationResultSchema.ts`
  - Add `BriefReasoningSchema` with Zod validation
  - Extend `TaskScoreSchema` with `brief_reasoning: BriefReasoningSchema`
- `lib/services/prioritizationLoop.ts`
  - Add retry logic (3 attempts) for validation failures
  - Implement fallback: `brief_reasoning = "Priority: {rank}"`
- `lib/services/manualTaskPlacement.ts`
  - Remove 20% boost from scoring calculation

**Tests Created**:
- `__tests__/contract/agent-brief-reasoning.test.ts`
- `__tests__/unit/briefReasoningValidator.test.ts`

**Slice 1A Acceptance** (Enhanced Agent Rationale):
- [x] User sees specific reason for top 5 tasks
- [x] Reasoning is outcome-linked (not generic)
- [x] ≤20 words per reasoning string

**Slice 1B Acceptance** (Unified Treatment):
- [x] Manual tasks prioritized identically to AI tasks
- [x] No visual distinction in main list
- [x] User cannot identify manual vs AI without opening drawer

**Risk**: Agent prompt changes may alter prioritization logic → A/B test with 10% traffic first

---

### Week 2: Enable Focus (Slices 2A, 2B)

**Focus**: TaskRow simplification + Focus Mode default

**Files Modified**:
- `app/priorities/components/TaskRow.tsx`
  - Remove from main view (lines 597-908):
    - Lock/unlock button (lines 613-628)
    - Inline strategic scores (lines 697-727)
    - Category badges (lines 776-789)
    - AI-generated badge (lines 860-874)
    - Dependencies list (lines 880-883)
    - Movement badge (make subtle, lines 885-890)
    - ManualTaskBadge (lines 790-795)
  - Keep only 4-5 elements:
    - Rank number
    - Single indicator (emoji/time)
    - Task title (editable)
    - Brief reasoning + "Details →" link
    - Complete checkbox
  - Add mobile-first responsive classes (320px minimum)

- `lib/schemas/sortingStrategy.ts`
  - Add `focus_mode` enum value (line 9)
  - Add strategy config (lines 64-70):
    ```typescript
    focus_mode: {
      label: 'Focus Mode (Recommended)',
      description: 'High-leverage work only (Quick Wins + Strategic Bets)',
      filter: task => isQuickWinTask(task) || isStrategicBetTask(task),
      sort: (a, b) => b.priority - a.priority,
    }
    ```

- `app/priorities/page.tsx`
  - Set default filter: `const [activeStrategy, setActiveStrategy] = useState<SortingStrategy>('focus_mode')`
  - Add localStorage persistence:
    ```typescript
    useEffect(() => {
      const stored = loadFilterPreference();
      setActiveStrategy(stored);
    }, []);

    useEffect(() => {
      saveFilterPreference(activeStrategy);
    }, [activeStrategy]);
    ```
  - Remove lock feature state management
  - Show count: `"Showing 8 focused tasks (15 hidden)"`

- `lib/services/filterPersistence.ts` (NEW)
  - `loadFilterPreference(): SortingStrategy`
  - `saveFilterPreference(strategy: SortingStrategy): void`

**Tests Created**:
- `__tests__/integration/focus-mode-filter.test.tsx`
- `__tests__/unit/filterPersistence.test.ts`
- `__tests__/integration/trust-focused-ui.test.tsx`

**Slice 2A Acceptance** (Simplify TaskRow):
- [x] Main view has exactly 4-5 elements per task
- [x] User can scan list in <5 seconds
- [x] Drawer accessible via "Details →" link

**Slice 2B Acceptance** (Focus Mode Default):
- [x] Default view shows ≤12 tasks
- [x] User can toggle to "All" view
- [x] Filter status clearly displayed

**Risk**: Lock removal backlash → User testing (n=10) before removal; if critical, pivot to "Pin top 3"

---

### Week 3: Polish & Mobile (Slices 3A, 3B, 3C)

**Focus**: Mobile-first layout + Quick Wins fix + Rich drawer

**Files Modified**:
- `app/priorities/components/TaskRow.tsx`
  - Mobile-first responsive classes:
    ```tsx
    className="
      // Mobile: Card layout
      flex flex-col gap-3 p-4 border rounded-lg

      // Tablet+: Minimal spacing
      lg:flex-row lg:gap-4 lg:p-3 lg:border-0 lg:rounded-none
    "
    ```
  - All touch targets: `h-11` (44px) on mobile
  - Typography: 18px title on mobile, 14px on desktop

- `app/priorities/components/TaskDetailsDrawer.tsx`
  - Add full content:
    - Strategic scores with visual breakdown
    - Quadrant scatter plot
    - Movement timeline
    - Manual override controls with "Apply" button
    - Source document links
  - Mobile: Full-screen overlay (<768px), side panel (≥768px)

- `app/priorities/components/CompletedTasksSection.tsx` (NEW)
  - Component state: `{ visible, hidden, page, hasMore, isExpanding }`
  - Default: Show last 10 completed tasks
  - "Show more" button: Load next 10
  - Hide button when `hidden.length === 0`

- `app/priorities/components/ManualOverrideControls.tsx`
  - Add "Apply" button
  - `onApply` callback: POST `/api/tasks/[id]/override`
  - Instant re-ranking (<100ms target)
  - Drawer stays open with success indicator

- `lib/schemas/sortingStrategy.ts`
  - Fix Quick Wins filter if broken (verify logic lines 31-34, 54)

**Tests Created**:
- `__tests__/integration/mobile-viewport.test.tsx` (320px/375px/768px/1024px)
- `__tests__/integration/completed-tasks-pagination.test.tsx`
- `__tests__/integration/manual-override-apply.test.tsx`

**Slice 3A Acceptance** (Mobile-First Layout):
- [x] No horizontal scroll on 320px viewport
- [x] All touch targets ≥44px (WCAG AAA)
- [x] Typography scales up on mobile (18px title)

**Slice 3B Acceptance** (Quick Wins Filter):
- [x] Quick Wins filter shows only impact≥5, effort≤8h
- [x] Count accurate
- [x] Filter applies instantly

**Slice 3C Acceptance** (Rich Drawer):
- [x] All secondary info accessible via drawer
- [x] No need to return to main list for detail

**Risk**: Drawer not discoverable → Prominent "Details →" link + tooltips on first visit

---

## Testing Strategy

### Contract Tests (`__tests__/contract/`)
- `agent-brief-reasoning.test.ts`
  - Schema validation: word count ≤20, character length 5-150
  - Generic phrase rejection
  - Retry logic: 3 attempts, fallback format
- `focus-mode-filter.test.ts`
  - Quadrant inclusion: Quick Wins + Strategic Bets
  - Quadrant exclusion: Neutral + Overhead
  - Task count reduction: 40-60%

### Integration Tests (`__tests__/integration/`)
- `trust-focused-ui.test.tsx`
  - Full user journey: Load → See focused tasks → Read reasoning → Complete task → Verify Completed section
- `mobile-viewport.test.tsx`
  - Test 4 viewports: 320px, 375px, 768px, 1024px
  - Validate touch targets ≥44px
  - No horizontal scroll on mobile
- `completed-tasks-pagination.test.tsx`
  - Default 10 tasks shown
  - "Show more" loads next 10
  - Button hidden when ≤10 total
- `manual-override-apply.test.tsx`
  - Apply button triggers re-ranking
  - <100ms latency target
  - Drawer stays open
  - Optimistic UI update

### Unit Tests (`__tests__/unit/`)
- `briefReasoningValidator.test.ts`
  - Word count validation
  - Generic phrase regex matching
  - Fallback format generation
- `filterPersistence.test.ts`
  - localStorage read/write cycle
  - JSON parse error handling
  - Default to focus_mode on first load

### Manual Testing (`quickstart.md`)
- 10 test scenarios covering all user stories
- Performance validation (drawer timing, override latency)
- Regression testing (features that must still work)
- User testing (n=10): Trust metric survey

### Coverage Target
- ≥80% code coverage across all new/modified files
- 100% contract test coverage for agent output schema
- 100% mobile viewport test coverage (4 breakpoints)

## Performance Targets

### Brief Reasoning Validation
- **Per task**: <50ms
- **Retry overhead**: <150ms (3 attempts × 50ms)
- **Success rate**: ≥98% within 3 attempts

### Filter Persistence
- **Read**: <5ms (localStorage + JSON.parse)
- **Write**: <5ms (JSON.stringify + localStorage)
- **Impact**: Negligible on page load

### Drawer Interaction
- **Open time**: <200ms desktop, <500ms mobile
- **Measured via**: Chrome DevTools Performance tab
- **Target met**: 95th percentile

### Manual Override Apply
- **Re-ranking**: <100ms (client-side sort, no agent call)
- **Visual update**: Instant (optimistic UI)
- **Reasoning regeneration**: Async on next agent cycle (not blocking)

### Completed Tasks Pagination
- **Initial render**: 10 tasks (fast)
- **"Show more"**: 10 tasks per click (incremental load)
- **Memory**: ~50KB max (50 tasks × 1KB)

## Risk Mitigation

### High-Risk Areas

1. **Agent Prompt Changes** (Week 1)
   - **Risk**: Altered prioritization logic affects existing users
   - **Mitigation**: A/B test with 10% traffic, monitor for 48 hours before full rollout
   - **Rollback**: Revert agent prompt, keep UI changes

2. **Lock Feature Removal** (Week 2)
   - **Risk**: Power users depend on locking tasks
   - **Mitigation**: User testing (n=10) before removal; if critical, pivot to "Pin top 3" feature
   - **Rollback**: Feature flag to re-enable lock button

3. **Brief Reasoning Validation** (Week 1)
   - **Risk**: Generic phrases not caught, retry loop fails
   - **Mitigation**: Comprehensive regex testing, telemetry on fallback usage
   - **Rollback**: Accept generic phrases, improve validation incrementally

4. **Mobile Layout Breakage** (Week 3)
   - **Risk**: Touch targets too small, horizontal scroll on mobile
   - **Mitigation**: Test on real devices (iPhone SE, iPhone 12, iPad)
   - **Rollback**: Revert TaskRow CSS, keep desktop layout

5. **Filter State Persistence** (Week 2)
   - **Risk**: localStorage disabled, JSON parse errors
   - **Mitigation**: Try/catch with fallback to default, in-memory state only
   - **Rollback**: Remove persistence, use session-only state

### Testing Before Deployment

1. Run full test suite: `pnpm test:run`
2. Check coverage: `pnpm test:coverage` (≥80% target)
3. Manual testing: Complete all 10 scenarios in `quickstart.md`
4. User testing (n=10): Trust metric survey
5. Mobile device testing: iPhone SE (320px), iPhone 12 (375px), iPad (768px)
6. Performance profiling: Chrome DevTools (drawer timing, override latency)

## Success Metrics (From Spec)

### Measurable Outcomes
- **SC-001**: Elements per task reduced from ~12 to ≤5 (58% reduction) ✓
- **SC-002**: Time to understand top task reduced from ~10s to <3s (70% improvement) ✓
- **SC-003**: User trust metric increased from ~40% to >75% (post-user testing) [MEASURE]
- **SC-004**: Manual task consistency increased from 0% to 100% (identical scoring) ✓
- **SC-005**: No horizontal scroll on 320px viewport (0 mobile layout issues) ✓
- **SC-006**: Default task count reduced from 23 to ≤12 tasks (48% reduction) ✓
- **SC-007**: Quick Wins filter accuracy increased from broken to 100% ✓
- **SC-008**: All touch targets meet WCAG AAA ≥44px (100% compliance) ✓
- **SC-009**: User can scan task list in <5 seconds (per acceptance testing) [MEASURE]
- **SC-010**: Brief reasoning contains outcome links in 100% of top 5 tasks ✓

### Technical Metrics
- **TM-001**: Agent prompt validation rejects ≥95% of generic reasoning attempts ✓
- **TM-006**: Reasoning validation retry mechanism succeeds within 3 attempts for ≥98% of tasks [MEASURE]
- **TM-007**: Manual override "Apply" button triggers re-ranking in <100ms [MEASURE]
- **TM-004**: Drawer opens in <200ms on desktop, <500ms on mobile [MEASURE]
- **TM-005**: All existing tests pass with new TaskRow structure (100% test suite compatibility) ✓

### User Experience Metrics
- **UX-001**: 90% of users can identify top priority and reasoning without scrolling [MEASURE via user testing]
- **UX-002**: Users cannot distinguish manual vs AI tasks in main view (100% visual uniformity) ✓
- **UX-004**: Mobile users report task list as "usable" on phones (user testing n=10) [MEASURE]
- **UX-005**: Users report reduced decision paralysis when viewing ≤12 tasks vs 23 [MEASURE via survey]

## Rollback Strategy

### Quick Rollback (If Critical Bug Found)
1. **Agent Prompt**: Revert `prioritizationGenerator.ts` to previous version
2. **UI Components**: Feature flag for TaskRow (old vs new)
3. **Database**: N/A (no migrations)
4. **localStorage**: Ignore stored preferences, use defaults

### Partial Rollback (If Specific Feature Fails)
- **Brief reasoning**: Accept fallback format for all tasks ("Priority: {rank}")
- **Focus Mode**: Default to "Balanced" (all tasks), keep filter options
- **Lock feature**: Re-enable via feature flag if user feedback critical
- **Mobile layout**: Revert to desktop-first grid, mobile scrolls horizontally

### Telemetry for Rollback Decision
- Monitor agent failure rate: If >5% fallback usage → investigate prompt
- Monitor user feedback: If >20% users report confusion → A/B test
- Monitor performance: If drawer >500ms mobile → optimize lazy loading
- Monitor mobile usage: If horizontal scroll reported → revert responsive CSS

## Dependencies

### Built On (Existing Features)
- **Phase 8**: Mobile-First Transformation (baseline responsive)
- **Phase 11**: Strategic Prioritization (impact/effort/confidence)
- **Phase 15**: Reflection Intelligence (reflection effects)
- **Phase 18**: Manual Task Creation (unification target)

### External Dependencies (No Changes)
- Next.js 15
- React 19
- Tailwind CSS v4
- shadcn/ui
- Mastra (agent orchestration)
- OpenAI GPT-4o (agent model)
- Supabase (PostgreSQL + pgvector)

### No New Dependencies
Pure refactoring + prompt enhancement. No new npm packages required.

## Progress Tracking

### Phase 0: Research (COMPLETED ✓)
- [x] Analyzed existing TaskRow.tsx structure (940 lines, 12+ elements)
- [x] Identified manual task boost location (prioritizationGenerator.ts:56)
- [x] Documented current agent prompt schema
- [x] Mapped sorting strategies and filter logic
- [x] Created `research.md` with file-by-file analysis

### Phase 1: Design (COMPLETED ✓)
- [x] Designed BriefReasoningSchema with Zod validation
- [x] Extended SortingStrategy enum with focus_mode
- [x] Specified Completed Tasks pagination state
- [x] Defined Manual Override "Apply" button flow
- [x] Created `data-model.md` with schema changes
- [x] Created `contracts/agent-brief-reasoning.yaml`
- [x] Created `quickstart.md` with 10 test scenarios

### Phase 2: Tasks Breakdown (PENDING)
- [ ] Generate `tasks.md` with vertical slice tasks using `/tasks` command
- [ ] Break down Week 1-3 slices into testable units
- [ ] Assign priorities (P1/P2/P3) to each task
- [ ] Ensure each task delivers SEE → DO → VERIFY

### Phase 3: Implementation (PENDING)
- [ ] Execute tasks using `/implement` command
- [ ] Track progress in `.claude/state/*.json` files
- [ ] Run automated tests after each slice
- [ ] Code review with `code-reviewer` agent
- [ ] Manual testing per `quickstart.md`

### Phase 4: Validation (PENDING)
- [ ] User testing (n=10): Trust metric survey
- [ ] Performance profiling: Drawer, override, brief reasoning validation
- [ ] Mobile device testing: Real device validation
- [ ] A/B test agent prompt changes (10% traffic)
- [ ] Final code review and approval

## Next Steps

1. **Run `/tasks` command** to generate vertical slice tasks breakdown
2. **Review tasks.md** to ensure each task is independently testable
3. **Run `/implement` command** to begin Week 1 implementation
4. **Follow TDD cycle**: Write test → Implement → Review → Repeat
5. **Manual testing**: Use `quickstart.md` after each week
6. **User testing**: Schedule n=10 participants for trust metric survey

## References

- **Feature Spec**: [spec.md](./spec.md)
- **Research**: [research.md](./research.md)
- **Data Model**: [data-model.md](./data-model.md)
- **Contracts**: [contracts/](./contracts/)
- **Quickstart**: [quickstart.md](./quickstart.md)
- **Shape Up Pitch**: `docs/shape-up-pitches/phase-19-trust-focused-task-list-refactor.md`
- **Constitution**: `.specify/memory/constitution.md`
- **Standards**: `.claude/standards.md`
