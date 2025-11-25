# Implementation Plan: Document-Aware Prioritization

**Branch**: `014-document-aware-prioritization` | **Date**: 2025-11-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-document-aware-prioritization/spec.md`

## Summary

Enhance the priorities page with document-aware UI that shows users exactly what documents are included in prioritization, provides pending document count badges on the recalculate button, makes the outcome statement visually prominent, and enables quick include/exclude toggles for controlling prioritization scope. The feature adds a new API endpoint for document status, enhances existing UI components, and modifies the prioritization API to respect document exclusions.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: Next.js 15, React 19, Tailwind CSS v4, shadcn/ui, Zod
**Storage**: Supabase PostgreSQL (existing `task_embeddings`, `agent_sessions` tables), localStorage for exclusions
**Testing**: Vitest, React Testing Library (`pnpm test:run`)
**Target Platform**: Web (responsive, mobile-first)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Document status API <500ms, UI toggle updates <100ms
**Constraints**: localStorage 30-day expiration for exclusions, 50 document pagination limit
**Scale/Scope**: Typical user has 5-20 documents, <200 tasks total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Vertical Slice**: Feature delivers SEE → DO → VERIFY for users (Principle I)
  - SEE: Prominent outcome display, pending count badge, source documents list
  - DO: Click checkboxes to exclude/include documents
  - VERIFY: Badge updates, exclusions persist, recalculation respects choices
- [x] **Test-First**: Tests written before implementation, coverage target ≥80% (Principle II)
  - Contract tests for new API endpoint
  - Unit tests for localStorage expiration logic
  - Integration tests for exclusion flow
- [x] **Autonomous Architecture**: Fits Sense → Reason → Act → Learn pattern if agent-related (Principle III)
  - N/A - This is UI/control enhancement, not agent intelligence
- [x] **Modular Services**: New services decoupled, single-purpose, clear interfaces (Principle IV)
  - New API route isolated from existing prioritization logic
  - localStorage helper functions in dedicated module
- [x] **Observable**: Telemetry planned for new operations (Principle V)
  - INFO level logging for exclusion changes (per clarification)
- [x] **Quality Standards**: TypeScript strict mode, Zod validation, security review
  - Zod schemas for API request/response
  - Input validation on document IDs
- [x] **Completion Criteria**: All 6 checkpoints (UI, backend, feedback, tests, review, demo-ready)

## Project Structure

### Documentation (this feature)

```text
specs/014-document-aware-prioritization/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── prioritization-status-api.yaml
└── tasks.md             # Phase 2 output (via /tasks command)
```

### Source Code (repository root)

```text
app/
├── api/
│   ├── documents/
│   │   └── prioritization-status/
│   │       └── route.ts              # NEW: Document status endpoint
│   └── agent/
│       └── prioritize/
│           └── route.ts              # MODIFY: Accept excluded_document_ids
├── priorities/
│   ├── page.tsx                      # MODIFY: Enhanced outcome, integrate components
│   └── components/
│       ├── OutcomeCard.tsx           # EXISTS: Enhanced in T001
│       ├── SourceDocuments.tsx       # NEW: Document list with toggles
│       └── ContextCard.tsx           # MODIFY: Add pending count badge

lib/
├── hooks/
│   └── useDocumentExclusions.ts      # NEW: localStorage management with expiration
├── schemas/
│   └── documentStatus.ts             # NEW: Zod schemas for document status
└── services/
    └── documentExclusionService.ts   # NEW: Exclusion logic with 30-day expiry

__tests__/
├── contract/
│   └── document-prioritization-status.test.ts  # NEW
├── integration/
│   └── document-exclusion-flow.test.tsx        # NEW
└── unit/
    └── services/
        └── documentExclusionService.test.ts    # NEW
```

**Structure Decision**: Extends existing Next.js App Router structure. New API route follows established pattern in `app/api/`. New component follows priorities page component organization. localStorage hook follows existing hook patterns in `lib/hooks/`.

## Complexity Tracking

No constitution violations requiring justification. Feature uses:
- Standard localStorage (no new database schema for exclusions)
- Existing Supabase queries with minor modifications
- Standard React component patterns

## Implementation Phases

### Phase 0: Research ✅

See [research.md](./research.md) for:
- Existing document/task relationship analysis
- localStorage patterns in codebase
- Current prioritization API structure
- Component integration points

### Phase 1: Design ✅

See:
- [data-model.md](./data-model.md) - Entity definitions, localStorage schema
- [contracts/prioritization-status-api.yaml](./contracts/prioritization-status-api.yaml) - API contract
- [quickstart.md](./quickstart.md) - Developer setup guide

### Phase 2: Task Breakdown

Run `/tasks` to generate [tasks.md](./tasks.md) with vertical slices.

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| localStorage unavailable (private browsing) | Low | Medium | Graceful fallback to all-included |
| Large document sets slow API | Medium | Low | Pagination, 50 doc limit |
| Stale exclusions cause confusion | Low | Medium | 30-day auto-expiry, filter deleted docs |

## Progress Tracking

- [x] Phase 0: Research complete
- [x] Phase 1: Design artifacts generated
- [x] Phase 2: Tasks generated
- [x] Implementation: Slices delivered (T001-T007 complete)
- [x] Review: Code review passed (approved with minor changes)
- [ ] Demo: Feature demonstrated
