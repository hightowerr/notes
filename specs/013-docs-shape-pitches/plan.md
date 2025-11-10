# Implementation Plan: Manual Task Control & Discard Approval

**Branch**: `013-docs-shape-pitches` | **Date**: 2025-01-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-docs-shape-pitches/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path ✅
2. Fill Technical Context ✅
3. Fill Constitution Check section ✅
4. Evaluate Constitution Check ✅
5. Execute Phase 0 → research.md ✅
6. Execute Phase 1 → contracts, data-model.md, quickstart.md ✅
7. Re-evaluate Constitution Check ✅
8. Plan Phase 2 → Task generation approach ✅
9. STOP - Ready for /tasks command ✅
```

## Summary

Enable users to manually add tasks, edit task descriptions inline, and approve which tasks get discarded during re-prioritization. This transforms users from passive spectators to active collaborators with the AI agent while maintaining the autonomous prioritization capabilities.

**Technical Approach**: Extend existing `task_embeddings` table with `is_manual` flag, create two new API endpoints (`/api/tasks/manual` POST, `/api/tasks/[id]` PATCH), add ManualTaskModal and DiscardReviewModal components, and integrate with existing Mastra-powered prioritization flow.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 15.5.4, React 19.1.0
**Primary Dependencies**: Next.js, React, Zod (validation), Supabase (@supabase/ssr), OpenAI (text-embedding-3-small), Mastra (@mastra/core)
**Storage**: PostgreSQL (Supabase) with pgvector extension for embeddings
**Testing**: Vitest 2.1.8 with @testing-library/react for contract/integration tests
**Target Platform**: Web (Next.js App Router, Server Components + Client Components)
**Project Type**: Web application (Next.js full-stack with app/ + lib/ structure)
**Performance Goals**:
  - Manual task creation → prioritized position: <10 seconds (P95)
  - Inline edit save: <500ms (P95)
  - Discard modal render: <200ms
  - Duplicate detection: <1 second
  - Re-prioritization debounce: 500ms

**Constraints**:
  - Embedding generation cost (<$0.10/month per active user)
  - No re-prioritization loops (debouncing enforced)
  - Edit locking during active prioritization
  - Semantic similarity threshold: >0.9 for duplicate detection
  - Embedding service unavailable → Block task creation with error message
  - Concurrent edits → Last-write-wins strategy

**Scale/Scope**:
  - Expected manual tasks per user: 10-50
  - Total tasks in system: 1000+ (existing IVFFlat index supports)
  - Concurrent users: Single-user initially (multi-user future)
  - Discard candidates per session: Up to 50 efficiently

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.7:

- [x] **Autonomous by Default**: ✅ Re-prioritization triggers automatically after manual task creation and edits (Sense → manual input, Reason → prioritize, Act → update UI). Discard approval is the only manual step (justified by data loss prevention).
- [x] **Deterministic Outputs**: ✅ All inputs/outputs validated with Zod schemas (`manualTaskSchema`, `taskEditSchema`, `DiscardCandidate` type). Embedding generation has retry logic (Phase 1 existing).
- [x] **Modular Architecture**: ✅ New `manualTaskService.ts` decoupled from UI. API routes use service layer. Components isolated (ManualTaskModal, DiscardReviewModal, TaskRow edit mode).
- [x] **Test-First Development**: ✅ TDD plan: Contract tests for API endpoints, integration tests for modal flows, quickstart.md for manual validation. Write failing tests before implementation.
- [x] **Observable by Design**: ✅ Structured logging: Manual task creation events, edit events, discard approvals/rejections, duplicate blocks. Performance metrics tracked (see Performance Goals).
- [x] **Vertical Slice Architecture**: ✅ All tasks deliver complete user value (SEE + DO + VERIFY):
  - Slice 1: Manual task creation (SEE modal, DO add task, VERIFY task in list)
  - Slice 2: Inline editing (SEE pencil icon, DO edit text, VERIFY updated)
  - Slice 3: Discard approval (SEE review modal, DO approve/reject, VERIFY tasks discarded/kept)

**Compliance**: PASS - No violations. Feature follows all constitutional principles.

## Project Structure

### Documentation (this feature)
```
specs/013-docs-shape-pitches/
├── plan.md              # This file (/plan command output) ✅
├── research.md          # Phase 0 output (/plan command) ✅
├── data-model.md        # Phase 1 output (/plan command) ✅
├── quickstart.md        # Phase 1 output (/plan command) ✅
├── contracts/           # Phase 1 output (/plan command) ✅
│   └── manual-task-api.yaml  # OpenAPI 3.0 spec for endpoints
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Next.js App Router structure (web application)
app/
├── api/
│   └── tasks/
│       ├── manual/
│       │   └── route.ts         # NEW: POST /api/tasks/manual
│       └── [id]/
│           └── route.ts         # NEW: PATCH /api/tasks/[id]
├── components/
│   ├── ManualTaskModal.tsx      # NEW: Task creation form
│   └── DiscardReviewModal.tsx   # NEW: Discard approval UI
└── priorities/
    ├── page.tsx                 # MODIFY: Add modal state, re-prioritization triggers
    └── components/
        ├── TaskList.tsx         # MODIFY: Replace auto-discard with review modal
        └── TaskRow.tsx          # MODIFY: Add inline edit mode

lib/
├── services/
│   └── manualTaskService.ts     # NEW: Create, update, validate manual tasks
├── schemas/
│   └── manualTaskSchemas.ts     # NEW: Zod schemas for manual task operations
└── supabase/
    ├── client.ts                # EXISTING: Browser client
    ├── server.ts                # EXISTING: Server client (RLS)
    └── admin.ts                 # EXISTING: Admin client (service role)

supabase/
└── migrations/
    └── 024_add_manual_task_support.sql  # NEW: Add is_manual, created_by columns

__tests__/
├── contract/
│   ├── manual-task-api.test.ts  # NEW: POST /api/tasks/manual contract
│   └── task-edit-api.test.ts    # NEW: PATCH /api/tasks/[id] contract
└── integration/
    ├── manual-task-flow.test.ts # NEW: Full manual task creation → prioritization
    ├── task-edit-flow.test.ts   # NEW: Inline edit → re-prioritization
    └── discard-approval-flow.test.ts  # NEW: Discard review modal workflow
```

**Structure Decision**: Next.js 15 App Router structure with server/client component split. API routes in `app/api/`, services in `lib/`, components in `app/components/` and feature-specific `app/priorities/components/`. Tests organized by type (contract, integration, unit).

## Phase 0: Outline & Research

**Output**: [research.md](./research.md) ✅

**Key Decisions Made**:
1. **Database Schema**: Extend `task_embeddings` with 2 columns (not new table)
2. **Manual Task Document**: Special document per user (`manual-tasks-{userId}`)
3. **Duplicate Detection**: Semantic similarity (>0.9 threshold) via existing embedding infrastructure
4. **Re-Prioritization Trigger**: Client-side debounced (500ms) to existing `/api/agent/prioritize`
5. **Discard Approval**: Blocking modal with opt-out default (all checked)
6. **Edit State**: Local component state with debounced save (500ms)
7. **Embedding Optimization**: 5-minute cache, regenerate only if text differs >10%

**All NEEDS CLARIFICATION resolved**: ✅

## Phase 1: Design & Contracts

*Prerequisites: research.md complete* ✅

**Outputs**:
1. ✅ **data-model.md**: Extended `task_embeddings` schema, `ManualTask` and `DiscardCandidate` types, validation rules
2. ✅ **contracts/manual-task-api.yaml**: OpenAPI 3.0 spec for:
   - `POST /api/tasks/manual` (create manual task)
   - `PATCH /api/tasks/[id]` (edit task)
3. ✅ **quickstart.md**: 4 test scenarios with acceptance criteria
4. ✅ **CLAUDE.md updated**: Agent context file incrementally updated (database info added)

**Contract Tests** (to be written):
- `__tests__/contract/manual-task-api.test.ts`:
  - POST valid manual task → 201 with task_id
  - POST invalid input (too short) → 400 with validation errors
  - POST duplicate task → 400 with DUPLICATE_TASK code
  - POST with outcome_id → prioritization_triggered = true

- `__tests__/contract/task-edit-api.test.ts`:
  - PATCH valid edit → 200 with updated task
  - PATCH no fields → 400 NO_FIELDS_PROVIDED
  - PATCH non-existent task → 404
  - PATCH manual task (wrong user) → 403 PERMISSION_DENIED

## Phase 2: Task Planning Approach

*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:

1. **Load templates**: Use `.specify/templates/tasks-template.md` as base structure
2. **Extract from Phase 1 artifacts**:
   - data-model.md → Database migration task (024)
   - contracts/ → API endpoint implementation tasks
   - quickstart.md → Integration test tasks
   - research.md → Service layer creation tasks

3. **Generate vertical slice tasks** (following constitutional Slice Architecture):

   **Slice 1: Database Foundation + Manual Task Creation API**
   - T001: [P] Write migration 024 (is_manual, created_by columns)
   - T002: [P] Create `manualTaskService.ts` with `createManualTask()` function
   - T003: Implement POST /api/tasks/manual route handler
   - T004: [P] Write contract test for POST /api/tasks/manual (duplicate detection)
   - **Deliverable**: User can call API to create manual task (backend complete)

   **Slice 2: Manual Task Creation UI**
   - T005: Create `ManualTaskModal.tsx` component with form
   - T006: Add "+ Add Task" button to TaskList.tsx
   - T007: Integrate modal with POST /api/tasks/manual
   - T008: Add localStorage draft auto-save
   - T009: Write integration test: Add manual task → appears in list
   - **Deliverable**: User can add manual task via UI and see it in list (SEE + DO + VERIFY)

   **Slice 3: Manual Task Auto-Prioritization**
   - T010: Add re-prioritization trigger after manual task creation
   - T011: Add "Prioritizing..." indicator to TaskRow
   - T012: Implement position update after prioritization completes
   - T013: Write integration test: Manual task → prioritized position
   - **Deliverable**: Manual tasks automatically integrate into prioritized list

   **Slice 4: Inline Task Editing API**
   - T014: Extend `manualTaskService.ts` with `updateTask()` function
   - T015: Implement PATCH /api/tasks/[id] route handler
   - T016: [P] Write contract test for PATCH /api/tasks/[id] (permissions)
   - **Deliverable**: API supports task editing with permission checks

   **Slice 5: Inline Editing UI**
   - T017: Add edit mode state to TaskRow.tsx
   - T018: Implement pencil icon + contentEditable field
   - T019: Add debounced save on blur/Enter (500ms)
   - T020: Add visual feedback (spinner, success, error)
   - T021: Lock editing during prioritization
   - T022: Write integration test: Edit task → saves → re-prioritizes
   - **Deliverable**: User can edit task text inline with visual feedback (SEE + DO + VERIFY)

   **Slice 6: Discard Approval Workflow**
   - T023: Create `DiscardReviewModal.tsx` component
   - T024: Detect discard candidates in TaskList.tsx
   - T025: Replace auto-discard logic with modal trigger
   - T026: Implement approve/reject handling
   - T027: Write integration test: Discard review → selective approval
   - **Deliverable**: User approves which tasks get discarded (SEE + DO + VERIFY)

   **Slice 7: Error Handling & Edge Cases**
   - T028: Implement duplicate task error UI
   - T029: Add edit failure recovery (revert to original)
   - T030: Handle no outcome scenario (skip re-prioritization)
   - T031: Add manual QA execution (quickstart.md scenarios)
   - **Deliverable**: All error paths handled gracefully

   **Slice 8: Performance Optimization & Polish**
   - T032: Implement embedding cache (5 minutes, 10% threshold)
   - T033: Add [MANUAL] badge styling
   - T034: Verify performance targets (quickstart.md benchmarks)
   - T035: Final integration test run + code review
   - **Deliverable**: Feature meets performance targets, ready for production

**Ordering Strategy**:
- **TDD order**: Contract tests before API routes, integration tests before UI implementation
- **Dependency order**: Migration → Services → API → UI → Tests
- **Vertical slices**: Each slice delivers complete user-testable value
- **Parallel markers [P]**: Tasks that can run independently (migrations, tests, services)

**Estimated Output**: ~35 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

No violations detected. All constitutional principles satisfied.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

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
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none)

**Artifact Checklist**:
- [x] research.md created with all decisions documented
- [x] data-model.md created with schema extensions and type definitions
- [x] contracts/manual-task-api.yaml created (OpenAPI 3.0 spec)
- [x] quickstart.md created with 4 test scenarios
- [x] CLAUDE.md updated with feature context

---

## Ready for /tasks Command

✅ All Phase 0-2 artifacts generated
✅ Constitution compliance verified
✅ Technical decisions documented
✅ API contracts specified
✅ Test scenarios defined

**Next Step**: Run `/tasks` to generate `tasks.md` with ~35 ordered, vertical slice tasks.

---

*Based on Constitution v1.1.7 - See `.specify/memory/constitution.md`*
