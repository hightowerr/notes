# Implementation Plan: Reasoning Trace Enhancements

**Branch**: `009-docs-shape-pitches` | **Date**: 2025-10-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-docs-shape-pitches/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → ✅ Loaded successfully
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Project Type: web (Next.js 15 + React 19)
   → Structure Decision: Frontend-focused with existing backend infrastructure
3. Fill the Constitution Check section
   → ✅ Completed based on constitution v1.1.5
4. Evaluate Constitution Check section
   → ✅ All principles satisfied (UX enhancement to existing features)
   → Update Progress Tracking: Initial Constitution Check PASS
5. Execute Phase 0 → research.md
   → Technical approach already established in pitch document
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md update
   → Data model reuses existing schemas (ReasoningTrace, ReasoningStep)
7. Re-evaluate Constitution Check section
   → ✅ No violations introduced during design
   → Update Progress Tracking: Post-Design Constitution Check PASS
8. Plan Phase 2 → Describe task generation approach
9. STOP - Ready for /tasks command
```

## Summary

This feature enhances the existing reasoning trace panel in the priorities page to improve discoverability and debugging utility. The implementation adds:
- **Discoverability**: "View Reasoning" button with step count, auto-expand on first visit per browser session
- **Filtering**: Tool type dropdown (all tools shown, unused disabled), status checkboxes, "show only failures" toggle
- **Error Highlighting**: Visual distinction for failed steps, error summary banner with jump-to-failure
- **Export**: JSON download with automatic clipboard fallback on failure
- **Performance**: <100ms filtering, <500ms export, support for 50+ step traces

All infrastructure already exists (ReasoningTracePanel component, API endpoints, database schema). This is a 2-3 day polish task focused on UX improvements to increase trace adoption and debugging efficiency.

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 15, React 19
**Primary Dependencies**: ShadCN UI components (Accordion, Badge, Alert, Select, Checkbox, Button), Tailwind CSS v4
**Storage**: Browser localStorage (collapse/expand preferences), sessionStorage (auto-expand tracking)
**Testing**: Manual testing via quickstart scenarios (automated tests would use Vitest + React Testing Library)
**Target Platform**: Modern browsers (Chrome, Firefox, Safari, Edge) with localStorage/clipboard API support
**Project Type**: web (Next.js frontend + API routes)
**Performance Goals**: <100ms filtering operations, <500ms export completion, no jank on expand/collapse
**Constraints**: Client-side only (no new backend endpoints), maintain <150 lines per component function, WCAG AA color contrast for error highlighting
**Scale/Scope**: 1 component enhancement (ReasoningTracePanel), 2 hook additions (useLocalStorage, useSessionStorage), 3-4 UI sub-components (filters, error banner, export button)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.5:

- [x] **Autonomous by Default**: Auto-expand behavior triggers automatically on first browser session (no manual opt-in)
- [x] **Deterministic Outputs**: Reuses existing ReasoningTrace schema, export follows documented JSON structure
- [x] **Modular Architecture**: Filters/export/error-banner implemented as separate sub-components, hooks encapsulate storage logic
- [x] **Test-First Development**: Manual testing guide will cover all acceptance scenarios (automated tests follow existing pattern)
- [x] **Observable by Design**: Inherits trace logging from existing infrastructure, export failures logged to console
- [x] **Vertical Slice Architecture**: Each enhancement delivers complete user value (see filtering: UI dropdown + immediate visual feedback + reset on reload)

**No violations**: This is a UX enhancement layer on existing infrastructure. All constitutional principles naturally satisfied.

## Project Structure

### Documentation (this feature)
```
specs/009-docs-shape-pitches/
├── spec.md              # Feature specification
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (reuse existing schemas)
├── quickstart.md        # Phase 1 output (manual test scenarios)
└── contracts/           # Phase 1 output (component contracts)
```

### Source Code (repository root)
```
app/
├── components/
│   ├── ReasoningTracePanel.tsx          # EXISTING - will enhance
│   └── reasoning-trace/                 # NEW - sub-components
│       ├── FilterControls.tsx           # Tool/status filtering UI
│       ├── ErrorSummaryBanner.tsx       # Jump-to-failure banner
│       └── ExportButton.tsx             # JSON export with clipboard fallback
├── priorities/
│   ├── page.tsx                         # EXISTING - add "View Reasoning" button
│   └── components/
│       └── TaskList.tsx                 # EXISTING - header button integration
lib/
├── hooks/
│   ├── useLocalStorage.ts               # NEW - localStorage persistence
│   └── useSessionStorage.ts             # NEW - sessionStorage for auto-expand
└── types/
    └── reasoning-trace.ts               # EXISTING - reuse types

__tests__/
└── manual/
    └── T025_REASONING_TRACE_UX.md       # NEW - manual testing guide
```

**Structure Decision**: Web application structure (Next.js App Router). Frontend-only changes to existing components with new utility hooks. No backend/API modifications needed.

## Phase 0: Outline & Research

**Status**: ✅ Complete (no unknowns remain)

### Research Findings

All technical decisions were clarified during the `/clarify` command:

1. **Auto-expand scope**: Browser session-based (sessionStorage), resets on tab close
   - **Rationale**: Balances discoverability (shows trace to new visitors) with user control (preference persists within session)
   - **Alternative considered**: Permanent localStorage flag rejected (too aggressive, user loses control)

2. **Filter persistence**: Session-only state (React state), resets on page reload
   - **Rationale**: Filters are debugging tools, not user preferences. Fresh start on reload reduces confusion.
   - **Alternative considered**: Persist to localStorage rejected (adds complexity without clear value)

3. **Export failure handling**: Automatic fallback to clipboard copy
   - **Rationale**: Ensures users can always extract trace data even if browser blocks downloads
   - **Alternative considered**: Retry with notification rejected (adds UI complexity, clipboard is simpler)

4. **Tool filter population**: Show all Mastra tools, disable unused ones
   - **Rationale**: Teaches users which tools exist while clearly indicating which were used in current trace
   - **Alternative considered**: Dynamic-only list rejected (doesn't help users discover available tools)

5. **Keyboard accessibility**: Native browser behavior (no custom handlers)
   - **Rationale**: ShadCN components provide baseline accessibility, custom keyboard shortcuts add complexity
   - **Alternative considered**: Full ARIA keyboard navigation rejected (out of scope for 2-3 day enhancement)

### Technology Decisions

**UI Components**: ShadCN Accordion, Select, Checkbox, Badge, Alert, Button
- Already installed and styled per project design system
- Follow existing depth layer system (--bg-layer-1 through --bg-layer-4)

**Storage Hooks**: Custom `useLocalStorage` and `useSessionStorage` hooks
- Encapsulate SSR-safety checks (typeof window !== 'undefined')
- Handle quota exceeded errors gracefully
- Return [value, setValue, remove] tuple

**Filtering Implementation**: Client-side array filtering with useMemo
- No API calls (all data already fetched)
- Target <100ms performance via memoization

**Export Implementation**: Blob + URL.createObjectURL + download attribute
- Fallback via navigator.clipboard.writeText on failure
- Toast notification for both success and fallback cases

**Output**: research.md created (see below)

## Phase 1: Design & Contracts

**Status**: ✅ Complete

### Data Model

**No new entities required** - reuses existing schemas:

- `ReasoningTraceRecord` (existing in `lib/types/reasoning-trace.ts`)
- `ReasoningStepRecord` (existing)
- `AgentSessionRecord` (existing)

See `data-model.md` for detailed schema documentation and usage patterns.

### API Contracts

**No new API endpoints** - all functionality client-side using existing data:

- `GET /api/agent/sessions/[sessionId]/trace` (existing) - fetches complete trace
- Component enhancements consume existing response structure

See `contracts/` for component interface contracts:
- `FilterControls.tsx` props contract
- `ErrorSummaryBanner.tsx` props contract
- `ExportButton.tsx` props contract

### Manual Testing

See `quickstart.md` for comprehensive manual testing scenarios covering:
- Auto-expand behavior verification
- Filter interaction testing
- Error highlighting validation
- Export success/failure paths
- Edge case handling (0 steps, 50+ steps, localStorage disabled)

### Agent Context Update

CLAUDE.md will be updated incrementally with:
- New hooks: `useLocalStorage`, `useSessionStorage`
- New components: `FilterControls`, `ErrorSummaryBanner`, `ExportButton`
- Enhanced components: `ReasoningTracePanel`, `TaskList`, `page.tsx`

## Phase 2: Task Planning Approach

*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Each enhancement area (discoverability, filtering, error highlighting, export) becomes a vertical slice task
- Each task includes: UI component + hook integration + visual feedback + test scenario
- Order: Hooks first → Filters → Error highlighting → Export → Discoverability button

**Vertical Slice Breakdown**:
1. **Storage Hooks** [P]: Create useLocalStorage + useSessionStorage (SEE: dev tools, DO: set/get values, VERIFY: persistence across reload)
2. **Filter UI** [P]: FilterControls component (SEE: dropdowns/checkboxes, DO: select filters, VERIFY: trace filters instantly)
3. **Filter Logic**: Integrate filters into ReasoningTracePanel (SEE: filtered trace, DO: toggle filters, VERIFY: step numbering preserved)
4. **Error Banner**: ErrorSummaryBanner component (SEE: red banner on failures, DO: click banner, VERIFY: scrolls to first failed step)
5. **Error Highlighting**: Visual distinction for failed steps (SEE: red border/background, DO: expand failed step, VERIFY: error message shown)
6. **Export Button**: ExportButton component with clipboard fallback (SEE: export button, DO: click export, VERIFY: file downloads or toast shows clipboard copy)
7. **View Reasoning Button**: Add button to TaskList header (SEE: button with step count, DO: click button, VERIFY: trace panel toggles)
8. **Auto-Expand Logic**: Session-based auto-expand behavior (SEE: trace expanded on first visit, DO: reload page, VERIFY: preference persists)

**Ordering Strategy**:
- Hooks before components (dependencies)
- Independent components in parallel ([P] markers)
- Integration tasks after individual components
- Auto-expand last (depends on all other UI being stable)

**Estimated Output**: 8-10 numbered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md, each task delivers SEE + DO + VERIFY)
**Phase 5**: Validation (run quickstart.md manual tests, verify performance targets, check WCAG AA contrast)

## Complexity Tracking

*No complexity violations - table left empty per template requirement*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | (none) | (none) |

## Progress Tracking

*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [x] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (5 clarifications documented in spec.md)
- [x] Complexity deviations documented (none)

---
*Based on Constitution v1.1.5 - See `.specify/memory/constitution.md`*
