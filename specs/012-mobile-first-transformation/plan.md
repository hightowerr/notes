
# Implementation Plan: Mobile-First Transformation

**Branch**: `012-mobile-first-transformation` | **Date**: 2025-11-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/012-mobile-first-transformation/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from file system structure or context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code, or `AGENTS.md` for all other agents).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Mobile-First Transformation delivers responsive UI/UX improvements to enable confident mobile deployment. All interface elements will meet 44px minimum touch targets, eliminate horizontal scrolling across 320px-1920px viewports, and provide tactile feedback—while maintaining complete desktop parity. This CSS-only transformation uses battle-tested Tailwind utilities with zero JavaScript bundle increase.

## Technical Context
**Language/Version**: TypeScript 5.x, Next.js 15.5.4, React 19.1.0
**Primary Dependencies**: Tailwind CSS v4, shadcn/ui (Radix UI primitives), next-themes
**Storage**: N/A (CSS-only changes, no data persistence)
**Testing**: Vitest 2.1.8, Testing Library, Manual viewport testing (320px, 375px, 768px, 1024px+)
**Target Platform**: Modern browsers (Chrome 90+, Safari 14+, Firefox 88+, Edge 90+) on mobile/tablet/desktop
**Project Type**: web (Next.js App Router with frontend components + API routes)
**Performance Goals**: Zero JavaScript bundle size increase, <50ms layout shift on breakpoint transitions, maintain current page load times
**Constraints**: Pure CSS implementation (no viewport detection JS), WCAG 2.1 Level AA compliance (4.5:1 contrast), zero desktop regressions
**Scale/Scope**: 15-20 component files (headers, buttons, forms, modals, grids, tabs), 4 viewport breakpoints, 33 functional requirements

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.7:

- [x] **Autonomous by Default**: ✅ COMPLIANT - Responsive design activates automatically based on viewport (pure CSS media queries, no manual triggers)
- [x] **Deterministic Outputs**: ✅ COMPLIANT - CSS changes produce deterministic, browser-standard rendering (no AI/LLM involvement, no schemas needed)
- [x] **Modular Architecture**: ✅ COMPLIANT - Tailwind utility classes are self-contained, component modifications isolated to individual files
- [x] **Test-First Development**: ✅ COMPLIANT - Manual viewport testing guides will be created first (T001-T004), automated visual regression tests if time permits
- [x] **Observable by Design**: ✅ COMPLIANT - Browser DevTools provide built-in observability (responsive design mode, computed styles, layout metrics)
- [x] **Vertical Slice Architecture**: ✅ COMPLIANT - Each task delivers complete UI changes visible across all viewports (e.g., "Make header responsive" = SEE layout change + DO resize test + VERIFY no overflow)

**No violations detected.** All constitutional principles naturally satisfied by CSS-only responsive design work.

## Project Structure

### Documentation (this feature)
```
specs/012-mobile-first-transformation/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (N/A for CSS-only changes)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
app/
├── components/          # Shared UI components to be updated
│   ├── ReflectionInput.tsx
│   ├── ReflectionList.tsx
│   ├── ReflectionPanel.tsx
│   ├── SummaryPanel.tsx
│   ├── OutcomeBuilder.tsx
│   ├── TextInputModal.tsx
│   └── [other components]
├── priorities/          # Priorities page components
│   ├── components/
│   │   ├── BridgingTaskCard.tsx
│   │   ├── ContextCard.tsx
│   │   ├── GapDetectionModal.tsx
│   │   ├── TaskList.tsx
│   │   └── TaskRow.tsx
│   └── page.tsx
├── dashboard/
│   └── page.tsx         # Dashboard page
├── settings/
│   └── page.tsx         # Settings page
├── page.tsx             # Home page with upload UI
├── layout.tsx           # Root layout
└── globals.css          # Global styles (Tailwind config)

__tests__/
└── integration/         # Manual viewport test guides (T001-T004)

tailwind.config.ts       # Tailwind breakpoint configuration
```

**Structure Decision**: Next.js App Router architecture with colocated components. This is a web application (Option 2) but uses modern Next.js structure where frontend and API routes coexist in the `app/` directory. CSS changes will be applied to existing component files using Tailwind responsive utilities.

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate vertical slice tasks from functional requirements (FR-001 to FR-033)
- Each viewport test scenario from quickstart.md → manual test guide task
- Component modifications grouped by feature area (touch targets, grids, modals, forms, tabs)
- Each task delivers complete user-visible value (SEE + DO + VERIFY)

**Vertical Slice Grouping**:
1. **Touch Target Compliance** (FR-001 to FR-003):
   - Modify Button component → Manual test T002 verification
   - Update all page-level buttons → Test on 375px viewport
   - Add tactile feedback utilities → Verify tap response

2. **Grid & Layout Responsiveness** (FR-004 to FR-008):
   - Fix header overflow → Manual test T001 (320px)
   - Convert task grids to single-column mobile → Test T002/T003
   - Activate multi-column at lg: breakpoint → Test T004

3. **Form & Input Optimization** (FR-009 to FR-012):
   - Update Input component (48px height, 16px font) → iOS auto-zoom test
   - Apply to all forms → Test OutcomeBuilder, TextInputModal

4. **Modal & Dialog Optimization** (FR-013 to FR-017):
   - Modify Dialog component (95vh mobile, p-3 padding)
   - Update OutcomeBuilder → Test T002 mobile
   - Update GapDetectionModal → Test T002 mobile
   - Update TextInputModal → Test T002 mobile

5. **Tab Navigation** (FR-018 to FR-021):
   - Modify Tabs component (12px font mobile, 8px padding)
   - Apply to SummaryPanel → Test T002

6. **Visual Polish** (FR-022 to FR-025):
   - Add mobile tap feedback utilities
   - Strengthen shadows for mobile
   - Add touch-action: manipulation

7. **Desktop Parity Verification** (FR-026 to FR-029):
   - Run full regression test suite on T004 (1024px+)
   - Verify no layout changes on desktop

8. **Performance & Accessibility** (FR-030 to FR-033):
   - Bundle size validation
   - WCAG contrast audit
   - Layout shift measurement

**Ordering Strategy**:
- Manual test guides FIRST (T001-T004_MANUAL_TEST.md)
- Foundation layer (Button, Input, Dialog components) before pages
- Critical fixes (header overflow, auto-zoom) before polish (shadows, feedback)
- Mark [P] for parallel execution only when files are independent
- Each task = UI change + viewport test + verification checklist

**Estimated Output**: 18-22 numbered, ordered vertical slice tasks in tasks.md

**Success Metric**: Every task passes its corresponding quickstart test scenario before being marked complete.

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS (all 6 principles compliant)
- [x] Post-Design Constitution Check: PASS (no new violations)
- [x] All NEEDS CLARIFICATION resolved (no unknowns in Technical Context)
- [x] Complexity deviations documented (N/A - no violations)

---
*Based on Constitution v1.1.7 - See `.specify/memory/constitution.md`*
