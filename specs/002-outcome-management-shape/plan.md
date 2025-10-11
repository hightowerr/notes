# Implementation Plan: Outcome Management

**Branch**: `002-outcome-management-shape` | **Date**: 2025-10-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-outcome-management-shape/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path → ✅ COMPLETE
2. Fill Technical Context (scan for NEEDS CLARIFICATION) → ✅ COMPLETE
3. Fill Constitution Check section → ✅ COMPLETE
4. Evaluate Constitution Check section → ✅ COMPLETE (No violations)
5. Execute Phase 0 → research.md → ✅ COMPLETE
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md → ✅ COMPLETE
7. Re-evaluate Constitution Check section → ✅ COMPLETE (No new violations)
8. Plan Phase 2 → Describe task generation approach → ✅ COMPLETE
9. STOP - Ready for /tasks command → ✅ COMPLETE
```

## Summary

The Outcome Management feature enables users to define a structured, measurable outcome statement that drives AI prioritization of extracted actions. Users build outcomes using a 4-field formula (Direction + Object + Metric + Clarifier) with real-time preview assembly. The system persists outcomes to Supabase, triggers async recompute jobs when outcomes change, and displays outcomes prominently across all pages.

**Core Technical Approach**:
- React form component with real-time validation and preview (debounced <1000ms)
- Supabase `user_outcomes` table with single active outcome per user constraint
- Background recompute service that re-scores existing actions against new outcome context
- LocalStorage draft persistence for interrupted edits (24-hour expiry)
- shadcn/ui Dialog + Form components for modal UX
- Zod schemas for outcome validation and API contracts

## Technical Context

**Language/Version**: TypeScript 5+ (Next.js 15, React 19)
**Primary Dependencies**:
- Next.js 15 (App Router)
- React 19 (Server Components + Client Components)
- Supabase JS client v2.58.0
- Zod v3.x (schema validation)
- shadcn/ui (Dialog, Form, Button, Input, Select, Textarea components)
- Vercel AI SDK v4.0.0 (AI scoring integration)
- Tailwind CSS v4
- Vitest (testing framework)

**Storage**: Supabase PostgreSQL
- New table: `user_outcomes` (direction, object_text, metric_text, clarifier, assembled_text, is_active, created_at, updated_at)
- Relationship: `user_outcomes.id` → `processed_documents.outcome_id` (optional FK for audit trail)

**Testing**: Vitest + React Testing Library
- Contract tests for `/api/outcomes` endpoints
- Component tests for OutcomeBuilder and OutcomeDisplay
- Integration tests for recompute trigger flow
- Manual testing guide for end-to-end scenarios (following T002_MANUAL_TEST.md pattern)

**Target Platform**: Web (browser localStorage + Supabase backend)

**Project Type**: Single web application (Next.js full-stack)

**Performance Goals**:
- Preview assembly: <1000ms from last keystroke
- Outcome save: <2000ms under normal network conditions
- Recompute job: <30s for 100 actions (target, not blocking user)

**Constraints**:
- Single active outcome per user (enforced by DB unique constraint on `user_id` where `is_active = true`)
- No archiving/versioning (old outcomes deleted on replacement)
- Client-side preview must be purely deterministic (no API calls)
- Mobile-first responsive design (sticky preview, vertical stacking)

**Scale/Scope**:
- Single-user P0 (no multi-tenancy yet)
- Expected: 1 active outcome, ~50-200 actions to recompute
- LocalStorage drafts: ~500 bytes per draft, 24-hour expiry

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.3:

- [x] **Autonomous by Default**: ✅ Outcome persists automatically on save, recompute triggers without manual action
- [x] **Deterministic Outputs**: ✅ Zod schemas for outcome validation, assembled text formula is pure function
- [x] **Modular Architecture**: ✅ Components decoupled: OutcomeBuilder (UI), /api/outcomes (persistence), recompute service (scoring)
- [x] **Test-First Development**: ✅ TDD plan established (contract tests → component tests → integration tests)
- [x] **Observable by Design**: ✅ Error logging for save failures, recompute failures; toast notifications for user feedback
- [x] **Vertical Slice Architecture**: ✅ Feature delivers complete flow: SEE (form UI) + DO (save + recompute) + VERIFY (toast + display)

**No violations detected.** Design aligns with constitutional principles.

## Project Structure

### Documentation (this feature)
```
specs/002-outcome-management-shape/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── POST_outcomes.json
│   ├── GET_outcomes.json
│   └── PUT_outcomes.json
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

This is a Next.js web application with App Router structure:

```
app/
├── api/
│   └── outcomes/
│       └── route.ts             # POST /api/outcomes (create/update)
├── components/
│   ├── OutcomeBuilder.tsx       # 4-field form with preview
│   ├── OutcomeDisplay.tsx       # Persistent header display with edit icon
│   └── ui/                      # shadcn components (reused)
├── page.tsx                     # Home (upload page) - add OutcomeDisplay
└── dashboard/
    └── page.tsx                 # Dashboard - add OutcomeDisplay

lib/
├── schemas/
│   └── outcomeSchema.ts         # Zod schemas for validation
├── services/
│   ├── outcomeService.ts        # Business logic (assembly, validation)
│   └── recomputeService.ts      # Async action re-scoring (integrates with aiSummarizer)
└── hooks/
    └── useOutcomeDraft.ts       # LocalStorage draft management

__tests__/
├── contract/
│   └── outcomes.test.ts         # API contract tests
├── integration/
│   └── outcome-flow.test.ts     # End-to-end flow tests
└── app/components/__tests__/
    ├── OutcomeBuilder.test.tsx  # Component tests
    └── OutcomeDisplay.test.tsx  # Component tests

supabase/migrations/
└── 004_create_user_outcomes.sql # New table migration
```

**Structure Decision**: Single Next.js application with App Router. Feature adds new API route (`/api/outcomes`), two client components (`OutcomeBuilder`, `OutcomeDisplay`), supporting services in `lib/`, and new Supabase migration. Follows existing patterns from T001-T007 features.

## Phase 0: Outline & Research

### Research Questions

1. **Real-time Preview Debouncing Strategy**
   - Question: How to achieve <1000ms preview update without excessive re-renders?
   - Decision: Use React `useDeferredValue` or `debounce` from lodash/custom hook
   - Rationale: `useDeferredValue` is React 18+ built-in, no external dependency. Debouncing input vs. deferring render.
   - Alternatives: setTimeout (manual cleanup), useTransition (for non-urgent updates)

2. **Supabase Single Active Outcome Enforcement**
   - Question: Database-level constraint vs. application logic for "one active outcome per user"?
   - Decision: Unique partial index: `CREATE UNIQUE INDEX idx_active_outcome ON user_outcomes(user_id) WHERE is_active = true`
   - Rationale: Database enforces invariant, prevents race conditions, fails fast on violation
   - Alternatives: Application check before insert (race condition risk), triggers (more complex)

3. **Recompute Job Architecture**
   - Question: Synchronous vs. async recompute? Where to queue jobs?
   - Decision: Async via serverless function with in-memory queue (existing `processingQueue.ts` pattern)
   - Rationale: Recompute can take 10-30s for 100 actions; blocking user is poor UX. Existing queue pattern proven.
   - Alternatives: Vercel Cron (overkill for immediate trigger), Redis queue (adds infra), synchronous (blocks UI)

4. **LocalStorage Draft Expiry Mechanism**
   - Question: How to reliably expire 24-hour drafts without background process?
   - Decision: Check-on-read pattern: validate `draft.expiresAt < Date.now()` when loading draft
   - Rationale: No background process needed, expires lazily, simple implementation
   - Alternatives: SetTimeout (lost on page refresh), Service Worker (overengineered for P0)

5. **Confirmation Dialog Pattern**
   - Question: Best UX for "Replace existing outcome?" confirmation without blocking save?
   - Decision: shadcn/ui AlertDialog with async/await promise resolution before API call
   - Rationale: Blocks API call, not UI render; user can cancel before persistence
   - Alternatives: Optimistic update + rollback (confusing UX), modal step before form (extra friction)

**Output**: See `research.md` for detailed findings and code examples.

## Phase 1: Design & Contracts

### Data Model

**Entity: UserOutcome**
```typescript
{
  id: uuid (PK),
  user_id: string (FK to future users table, currently hardcoded "default-user"),
  direction: enum ('increase', 'decrease', 'maintain', 'launch', 'ship'),
  object_text: string (max 100 chars),
  metric_text: string (max 100 chars),
  clarifier: string (max 150 chars),
  assembled_text: string (computed, stored for display),
  is_active: boolean (default true, unique per user_id),
  created_at: timestamp,
  updated_at: timestamp
}
```

**Indexes**:
- Primary key: `id`
- Unique constraint: `(user_id, is_active) WHERE is_active = true` (enforces single active outcome)
- Index: `user_id` (for fast lookups)

**Entity: OutcomeDraft** (localStorage only, not persisted to DB)
```typescript
{
  direction: string | null,
  object_text: string,
  metric_text: string,
  clarifier: string,
  expiresAt: number (timestamp)
}
```

**Relationships**:
- `user_outcomes.id` → `processed_documents.outcome_id` (optional FK, for future audit trail)
- Current feature does NOT modify `processed_documents` table (defer to future enhancement)

See `data-model.md` for full schema with validation rules and state transitions.

### API Contracts

**POST /api/outcomes** (Create or Update Outcome)
```json
Request:
{
  "direction": "increase" | "decrease" | "maintain" | "launch" | "ship",
  "object": "string (3-100 chars)",
  "metric": "string (3-100 chars)",
  "clarifier": "string (3-150 chars)"
}

Response 201 (Created):
{
  "id": "uuid",
  "assembled_text": "Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition",
  "created_at": "2025-10-11T10:00:00Z",
  "message": "Outcome created successfully. Re-scoring 47 actions..."
}

Response 200 (Updated - replaces existing):
{
  "id": "uuid",
  "assembled_text": "...",
  "updated_at": "2025-10-11T10:05:00Z",
  "message": "Outcome updated. Re-scoring 47 actions..."
}

Response 400 (Validation Error):
{
  "error": "VALIDATION_ERROR",
  "details": {
    "object": "Must be between 3 and 100 characters"
  }
}

Response 500 (Save Error):
{
  "error": "DATABASE_ERROR",
  "message": "Failed to save outcome"
}
```

**GET /api/outcomes** (Fetch Active Outcome)
```json
Response 200:
{
  "outcome": {
    "id": "uuid",
    "direction": "increase",
    "object": "monthly recurring revenue",
    "metric": "25% within 6 months",
    "clarifier": "enterprise customer acquisition",
    "assembled_text": "Increase the monthly recurring revenue...",
    "created_at": "2025-10-11T10:00:00Z"
  }
}

Response 404:
{
  "outcome": null,
  "message": "No active outcome set"
}
```

See `/contracts/` directory for full OpenAPI specs.

### Integration Points

1. **OutcomeBuilder Component → POST /api/outcomes**
   - Validates form fields (Zod schema)
   - Checks for existing outcome via GET /api/outcomes
   - Shows confirmation dialog if existing outcome found
   - Calls POST /api/outcomes on user confirmation
   - Clears localStorage draft on successful save

2. **POST /api/outcomes → Recompute Service**
   - After persisting outcome to DB
   - Triggers `recomputeService.enqueue({ outcomeId, userId })`
   - Returns immediately with success message
   - Recompute runs async in background

3. **Recompute Service → AI Summarizer**
   - Fetches all `processed_documents` for user
   - For each document: re-runs AI scoring with new outcome context
   - Updates `processed_documents.lno_tasks` with new scores (optional, defer to future)
   - Logs errors if recompute fails, shows toast warning to user

4. **OutcomeDisplay Component → GET /api/outcomes**
   - Fetches active outcome on component mount
   - Displays assembled text in header
   - Provides edit icon → opens OutcomeBuilder modal

### Test Scenarios (from quickstart.md)

**Scenario 1: First-Time Outcome Creation**
1. User opens app (no outcome set)
2. OutcomeBuilder form displays
3. User fills 4 fields: "Increase", "monthly recurring revenue", "25% within 6 months", "enterprise customer acquisition"
4. Preview updates in real-time: "Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition"
5. User clicks "Set Outcome Statement"
6. System saves to Supabase, triggers recompute, shows toast "✅ Outcome updated. Re-scoring 47 actions..."
7. Outcome displays in header across all pages

**Scenario 2: Edit Existing Outcome**
1. User clicks edit icon (✏️) in outcome header
2. Modal opens with 4 fields pre-filled
3. User changes "Increase" → "Decrease", "monthly recurring revenue" → "customer churn rate"
4. Preview updates: "Decrease the customer churn rate by..."
5. User clicks "Update Outcome"
6. System shows confirmation dialog: "Replace existing outcome?"
7. User clicks "Yes"
8. System replaces outcome, triggers recompute, shows success toast

**Scenario 3: Draft Recovery**
1. User opens OutcomeBuilder modal
2. User fills 3 fields: "Launch", "beta product to 50 users", "by Q2"
3. User accidentally closes modal (without saving)
4. System stores draft to localStorage with 24-hour expiry
5. User reopens modal within 24 hours
6. System shows prompt: "Resume editing?"
7. User clicks "Yes"
8. Form fields restore from draft

See `quickstart.md` for full test scenarios and manual testing steps.

## Phase 2: Task Planning Approach

*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. **Load templates and design artifacts**
   - Load `.specify/templates/tasks-template.md` as base
   - Parse `contracts/` for API endpoint tasks
   - Parse `data-model.md` for database migration tasks
   - Parse `quickstart.md` for integration test tasks

2. **Generate vertical slice tasks** (following constitution VI):
   - Each task = UI + Backend + Data + Feedback
   - Example: "T008 [SLICE] User sets initial outcome statement"
     - UI: OutcomeBuilder form component
     - Backend: POST /api/outcomes endpoint
     - Data: user_outcomes table, Zod schema
     - Feedback: Success toast, outcome displays in header

3. **Task ordering strategy**:
   - **Phase 1: Foundation** (parallel where possible)
     - Database migration [P]
     - Zod schemas [P]
     - Contract test skeletons [P]
   - **Phase 2: Core Flow** (sequential, TDD)
     - POST /api/outcomes (test → implementation)
     - GET /api/outcomes (test → implementation)
     - OutcomeBuilder component (test → implementation)
     - OutcomeDisplay component (test → implementation)
   - **Phase 3: Enhancements** (parallel)
     - LocalStorage draft hook [P]
     - Recompute service integration [P]
     - Confirmation dialog [P]
   - **Phase 4: Integration** (sequential)
     - End-to-end flow test
     - Manual testing guide
     - Performance validation

4. **Estimated task breakdown** (28-32 tasks):
   - Database: 1 migration task
   - Schemas: 2 tasks (outcome schema, API request/response schemas)
   - API endpoints: 4 tasks (2 endpoints × [test + implementation])
   - Components: 4 tasks (2 components × [test + implementation])
   - Services: 3 tasks (outcome service, recompute service, draft hook)
   - Integration: 2 tasks (flow test, manual guide)
   - UI integration: 4 tasks (add OutcomeDisplay to pages, add OutcomeBuilder modal trigger)
   - Edge cases: 3 tasks (confirmation dialog, error handling, mobile responsive)

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

*No constitutional violations detected. This section is empty.*

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
- [x] Initial Constitution Check: PASS (no violations)
- [x] Post-Design Constitution Check: PASS (no new violations)
- [x] All NEEDS CLARIFICATION resolved (via research.md)
- [x] Complexity deviations documented (none)

---
*Based on Constitution v1.1.3 - See `.specify/memory/constitution.md`*
