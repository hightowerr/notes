# Implementation Plan: Strategic Prioritization (Impact-Effort Model)

**Branch**: `001-strategic-prioritization-impact` | **Date**: 2025-11-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-strategic-prioritization-impact/spec.md`

**Note**: This template is filled in by the `/plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enhance the existing agent prioritization system to calculate strategic scores (Impact/Effort/Confidence/Priority) for each task, enabling users to view tasks through different lenses (Quick Wins, Strategic Bets, Balanced, Urgent) and visualize trade-offs in a 2×2 quadrant chart. This moves prioritization beyond semantic similarity to true strategic value assessment.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20+ (via .nvmrc)
**Primary Dependencies**: Next.js 15, React 19, Vercel AI SDK 4.0, Mastra 0.21.1, Zod 3.24, Supabase (PostgreSQL + pgvector), shadcn/ui, Tailwind CSS v4, Recharts (for quadrant visualization)
**Storage**: Supabase PostgreSQL with pgvector extension; strategic scores stored in `agent_sessions.strategic_scores` JSONB column; manual overrides in `task_embeddings.manual_overrides` JSONB column
**Testing**: Vitest 2.1.8 with @testing-library/react for components; TDD mandatory (write failing test first)
**Target Platform**: Web (Next.js App Router), responsive design (existing mobile-first patterns from Phase 8)
**Project Type**: Web application (Next.js full-stack with API routes)
**Performance Goals**: Strategic scoring adds <2 seconds to total prioritization time; UI renders with optimistic updates; failed LLM calls queue for async retry without blocking
**Constraints**: Must integrate with existing agent prioritization system (POST /api/agent/prioritize); backward-compatible database migrations only (add columns, no restructuring); must handle LLM failures gracefully with async retry queue
**Scale/Scope**: Single-user workspace; 100-1000 tasks per session; support for 4 sorting strategies (Balanced, Quick Wins, Strategic Bets, Urgent); quadrant visualization with task clustering for overlaps

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Compliance

**✅ Vertical Slice Mandate (SYSTEM_RULES.md)**
- Each user story delivers SEE IT + DO IT + VERIFY IT
- User Story 1 (P1): Users SEE strategic scores → DO trigger prioritization → VERIFY scores appear
- User Story 2 (P1): Users SEE sort dropdown → DO select strategy → VERIFY filtered list
- User Story 3 (P2): Users SEE quadrant viz → DO click bubbles → VERIFY scroll to task
- User Story 4 (P2): Users SEE "Why?" link → DO click → VERIFY modal with breakdown
- User Story 5 (P3): Users SEE override controls → DO adjust sliders → VERIFY instant recalc

**✅ TDD Enforcement**
- All features require failing tests FIRST before implementation
- Test categories: contract tests (API), integration tests (user flows), unit tests (scoring logic)
- Completion requires code-reviewer → test-runner → full pass

**✅ Backward Compatibility**
- Database changes are additive only (new JSONB columns: strategic_scores, manual_overrides)
- No table restructuring or breaking changes to existing agent prioritization API
- Existing /priorities page enhanced, not replaced

**✅ Performance Gates**
- Strategic scoring must add <2s to total prioritization time (SC-006)
- LLM failures queue for async retry (no user blocking)
- Optimistic UI updates for manual overrides

### Potential Violations (Require Justification)

**None identified.** This feature:
- Enhances existing /priorities page with new UI components (no infrastructure-only work)
- All user stories follow SEE-DO-VERIFY pattern
- Uses existing tech stack (Next.js, Supabase, Mastra, shadcn/ui)
- No new external dependencies except Recharts (standard charting library)
- All work is user-testable through /priorities interface

**Gate Status**: ✅ PASS - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
app/
├── api/
│   ├── agent/
│   │   └── prioritize/         # Existing: Trigger prioritization
│   └── tasks/
│       └── metadata/            # NEW: Task scoring metadata API
├── priorities/
│   ├── page.tsx                 # MODIFY: Add strategic scoring UI
│   └── components/
│       ├── TaskRow.tsx          # MODIFY: Show Impact/Effort/Confidence/Priority
│       ├── TaskList.tsx         # MODIFY: Add sorting strategy selector
│       ├── QuadrantViz.tsx      # NEW: 2×2 Impact/Effort visualization
│       ├── ScoreBreakdownModal.tsx  # NEW: "Why this score?" detail view
│       └── ManualOverrideControls.tsx  # NEW: Sliders for Impact/Effort
└── components/                  # Shared UI components (shadcn/ui)

lib/
├── services/
│   ├── strategicScoring.ts      # NEW: Impact/Effort/Confidence calculation
│   ├── priorityCalculator.ts    # NEW: Priority score formula
│   └── effortEstimator.ts       # NEW: Extract hours from task text
├── schemas/
│   ├── strategicScore.ts        # NEW: Zod schema for strategic scores
│   └── manualOverride.ts        # NEW: Zod schema for user overrides
└── mastra/
    └── tools/
        └── estimateImpact.ts    # NEW: Mastra tool for LLM Impact estimation

__tests__/
├── contract/
│   └── strategic-scoring-api.test.ts  # NEW: API contract tests
├── integration/
│   └── strategic-prioritization.test.tsx  # NEW: User flow tests
└── unit/
    └── services/
        └── strategicScoring.test.ts  # NEW: Scoring logic tests

supabase/
└── migrations/
    └── 025_add_strategic_scores.sql  # NEW: Add JSONB columns
```

**Structure Decision**: This is a Next.js App Router web application. Backend logic lives in `app/api/` route handlers and `lib/services/`, frontend components in `app/priorities/components/`. Tests follow the existing pattern: contract tests for API endpoints, integration tests for user workflows, unit tests for service logic. All new database columns are additive (JSONB) to maintain backward compatibility.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No violations.** All complexity is justified and necessary for feature requirements.

---

## Post-Design Constitution Check

*GATE: Re-evaluated after Phase 1 design completion.*

### Design Compliance Review

**✅ Vertical Slice Mandate**
- All user stories remain deliverable as complete slices
- Each API endpoint has corresponding UI component
- All features can be user-tested end-to-end
- No backend-only or frontend-only work identified

**✅ TDD Enforcement**
- Contract tests defined for all 3 API endpoints (prioritize, metadata, override)
- Integration tests cover all 5 user stories
- Unit tests cover scoring formulas, effort extraction, retry logic
- Test-first workflow maintained throughout

**✅ Backward Compatibility**
- Database changes confirmed additive-only (2 JSONB columns)
- No breaking changes to existing `/api/agent/prioritize` endpoint (only adds fields)
- Existing `/priorities` page enhanced, not replaced
- Rollback script provided in migration contract

**✅ Performance Gates**
- Batching strategy (10 concurrent LLM calls) ensures <2s overhead for 100 tasks
- Async retry queue prevents user blocking on LLM failures
- Optimistic UI updates provide instant feedback for manual overrides
- GIN indexes on JSONB columns prevent query performance degradation

**✅ Dependency Management**
- Only one new dependency added: Recharts (35KB gzipped, actively maintained)
- All other dependencies already in project (Next.js, React, Supabase, Mastra, Zod)
- No new external services required (uses existing OpenAI API)

### New Concerns Identified

**None.** Post-design review confirms:
- Architecture aligns with existing patterns (Next.js API routes, Supabase JSONB, Mastra tools)
- No new infrastructure required
- All user stories deliverable within existing tech stack
- Test coverage strategy complete and executable

**Gate Status**: ✅ PASS - Proceed to Phase 2 (/tasks command)

---

## Progress Tracking

### Phase 0: Outline & Research ✅
- [x] Research Impact/Effort frameworks → 2×2 Eisenhower quadrant
- [x] Research Impact estimation strategy → Hybrid LLM + heuristics
- [x] Research Effort estimation strategy → Text extraction + complexity heuristic
- [x] Research async retry patterns → In-memory queue with exponential backoff
- [x] Research Recharts integration → ScatterChart with log scale
- [x] Research manual override persistence → JSONB last-write-wins
- [x] Research priority formula → (Impact / Effort) × Confidence, 0-100 normalized
- [x] Research performance optimization → Parallel batching + bulk upserts
- [x] Research testing strategy → Contract + integration + unit + manual
- [x] Generated: `research.md`

### Phase 1: Design & Contracts ✅
- [x] Extract entities from spec → `data-model.md`
- [x] Define TypeScript schemas → Zod schemas in data-model.md
- [x] Generate API contracts → `contracts/prioritize-api.yaml`
- [x] Generate database migration → `contracts/database-migration.sql`
- [x] Create quickstart guide → `quickstart.md`
- [x] Re-evaluate Constitution Check → ✅ PASS
- [x] Generated artifacts:
  - `data-model.md` (schemas, validation, flows)
  - `contracts/prioritize-api.yaml` (OpenAPI 3.0.3 spec)
  - `contracts/database-migration.sql` (migration + rollback)
  - `quickstart.md` (setup, demo, troubleshooting)

### Phase 2: Tasks Generation (Next Step)
- [ ] Run `/tasks` command to generate vertical slice tasks
- [ ] Review and approve task breakdown
- [ ] Execute `/implement` command to begin implementation

---

## Artifact Summary

| Artifact | Status | Location | Purpose |
|----------|--------|----------|---------|
| **plan.md** | ✅ Complete | specs/001-strategic-prioritization-impact/plan.md | This file - implementation plan |
| **research.md** | ✅ Complete | specs/001-strategic-prioritization-impact/research.md | Research findings and decisions |
| **data-model.md** | ✅ Complete | specs/001-strategic-prioritization-impact/data-model.md | Database schema, TypeScript types, flows |
| **prioritize-api.yaml** | ✅ Complete | specs/001-strategic-prioritization-impact/contracts/prioritize-api.yaml | OpenAPI contract for endpoints |
| **database-migration.sql** | ✅ Complete | specs/001-strategic-prioritization-impact/contracts/database-migration.sql | SQL migration + rollback |
| **quickstart.md** | ✅ Complete | specs/001-strategic-prioritization-impact/quickstart.md | Setup and demo guide |
| **tasks.md** | ⏳ Pending | specs/001-strategic-prioritization-impact/tasks.md | Generated by `/tasks` command |
