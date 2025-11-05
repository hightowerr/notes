# Implementation Plan: Reflection Capture

**Branch**: `004-reflection-capture-quick` | **Date**: 2025-10-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-reflection-capture-quick/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → ✅ LOADED: 72 functional requirements, 18 non-functional requirements
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → ✅ COMPLETE: All clarifications resolved in spec (5 clarifications session complete)
   → Detect Project Type: web (Next.js frontend + backend API routes)
   → Structure Decision: Next.js unified app structure
3. Fill the Constitution Check section
   → ✅ COMPLETE: All 6 principles verified
4. Evaluate Constitution Check section
   → ✅ PASS: No violations detected
   → Update Progress Tracking: Initial Constitution Check ✅
5. Execute Phase 0 → research.md
   → ✅ COMPLETE
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
   → ✅ COMPLETE
7. Re-evaluate Constitution Check section
   → ✅ COMPLETE - No new violations detected
8. Plan Phase 2 → Describe task generation approach
   → ✅ COMPLETE (described in Phase 2 section)
9. STOP - Ready for /tasks command
   → ✅ READY
```

**STATUS**: Planning complete - ready for /tasks command

## Summary

**Primary Requirement**: Enable knowledge workers to quickly capture current life context (energy levels, constraints, blockers, momentum) in 10-60 seconds via lightweight reflection input, which dynamically adjusts task prioritization alongside existing long-term outcome statements. Reflections are append-only (no editing/deleting), automatically weighted by recency (exponential decay with 7-day half-life), and influence AI-powered priority scoring without overriding strategic direction.

**Technical Approach**: Extend existing Next.js 15 + React 19 + Supabase architecture with:
1. New `reflections` table (append-only with precise timestamps)
2. Collapsible panel/modal UI component accessible via keyboard shortcut (Cmd+R)
3. Integration with existing `recomputeService.ts` (T012) to trigger priority adjustments
4. Recency weight calculation service using exponential decay formula
5. Extension of AI summarization context injection to include weighted reflection history

**Key Integration Points**:
- Reuses existing recompute service from T012 (async job with exponential backoff)
- Extends AI summarization prompts to include recent reflections with weights
- Builds on outcome management pattern from T008-T011 (complementary context)
- Follows depth-based color system and shadow utilities from existing design system

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (enforced via .nvmrc)
**Primary Dependencies**: Next.js 15, React 19, @supabase/supabase-js 2.58, @ai-sdk/openai 1.0, Vercel AI SDK 4.0, React Hook Form, Zod, Radix UI components
**Storage**: Supabase PostgreSQL (existing `uploaded_files`, `processed_documents`, `user_outcomes` tables + new `reflections` table)
**Testing**: Vitest (contract + integration tests), React Testing Library (component tests), manual testing guides where FormData serialization blocks automated tests
**Target Platform**: Web (desktop <1400px + mobile responsive), modern browsers (Chrome, Firefox, Safari, Edge)
**Project Type**: **web** - Next.js unified app structure (app/ directory, API routes in app/api/)
**Performance Goals**:
- Reflection submission latency <300ms p95
- Textarea clear latency <200ms
- Recompute trigger latency <2s
- Panel open/close animation <100ms

**Constraints**:
- Character limits: 10-500 chars (enforced client + server)
- Recency weight calculation: exponential decay with 7-day half-life
- Display only 5 most recent reflections
- No offline storage (fail-fast network errors)
- No automated deletion (indefinite retention, manual cleanup only)

**Scale/Scope**:
- Single-user P0 (multi-user via RLS policies future)
- Expected volume: ~2-5 reflections per active user per week
- Storage: ~30-150 chars avg per reflection (minimal cost burden)
- Recompute debouncing: max 1 per user per 10s (API spam prevention)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.5:

- [x] **Autonomous by Default**: ✅ **COMPLIANT** - Reflection submission automatically triggers recompute service (existing T012 async job). Weightingcalculation happens automatically during AI prompt injection. No manual "recompute priorities" button.

- [x] **Deterministic Outputs**: ✅ **COMPLIANT** - Reflection entity has fixed schema (id, user_id, text, created_at). Recency weight calculation uses documented exponential decay formula. AI prompt injection follows existing structured format from aiSummarizer.ts with reflection context appended.

- [x] **Modular Architecture**: ✅ **COMPLIANT** - New components are decoupled:
  - `lib/services/reflectionService.ts` - Weight calculation, CRUD operations (independent)
  - `app/components/ReflectionPanel.tsx` - UI component (no business logic coupling)
  - `lib/hooks/useReflectionCapture.ts` - State management (reusable hook)
  - Integration via existing `recomputeService.ts` interface (no tight coupling)

- [x] **Test-First Development**: ✅ **COMPLIANT** - TDD plan established:
  1. Phase 1 generates contract tests for GET/POST /api/reflections (failing tests)
  2. Component tests for ReflectionPanel, ReflectionInput, ReflectionList
  3. Integration tests for reflection → recompute → priority adjustment flow
  4. Manual test guide created if FormData/network error scenarios block automation
  5. Tests written BEFORE implementation, per constitution Principle IV

- [x] **Observable by Design**: ✅ **COMPLIANT** - Structured logging per clarification session:
  - NFR-016: Log reflection creation events (user ID, timestamp, character count)
  - NFR-017: Log recompute trigger events (user ID, trigger reason, timestamp)
  - NFR-018: Do NOT log reflection text content (privacy protection)
  - Error logging: Network errors, recompute failures (with error codes)

- [x] **Vertical Slice Architecture**: ✅ **COMPLIANT** - Every task delivers complete user value:
  - Example: "User adds reflection and sees it in recent list" = UI (panel) + Backend (POST endpoint) + Data (database insert) + Feedback (optimistic update + toast)
  - No backend-only tasks (e.g., "Create Reflection model only")
  - No frontend-only tasks (e.g., "Build ReflectionPanel UI without API")
  - All tasks follow SEE (visible change) + DO (interactive action) + VERIFY (observable outcome)

**✅ All constitutional principles satisfied. No violations to document.**

## Project Structure

### Documentation (this feature)
```
specs/004-reflection-capture-quick/
├── spec.md              # Feature specification (input)
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (technical research)
├── data-model.md        # Phase 1 output (database schema)
├── quickstart.md        # Phase 1 output (manual test guide)
├── contracts/           # Phase 1 output (API contracts)
│   ├── GET_reflections.json
│   └── POST_reflections.json
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
app/
├── api/
│   └── reflections/
│       └── route.ts                    # GET/POST /api/reflections endpoint
├── components/
│   ├── ReflectionPanel.tsx             # Collapsible sidebar/modal container
│   ├── ReflectionInput.tsx             # Textarea + character counter + submit
│   ├── ReflectionList.tsx              # Recent 5 with opacity fade + timestamps
│   ├── OutcomeDisplay.tsx              # EXISTING - no changes needed
│   └── OutcomeBuilder.tsx              # EXISTING - no changes needed
├── page.tsx                            # MODIFY - add ReflectionPanel toggle
└── dashboard/page.tsx                  # MODIFY - add ReflectionPanel toggle

lib/
├── services/
│   ├── reflectionService.ts            # NEW - CRUD + recency weight calculation
│   ├── recomputeService.ts             # EXISTING - no changes (trigger via API)
│   ├── aiSummarizer.ts                 # MODIFY - inject reflection context
│   └── outcomeService.ts               # EXISTING - no changes
├── hooks/
│   ├── useReflectionCapture.ts         # NEW - reflection state management
│   └── useOutcomeDraft.ts              # EXISTING - no changes
└── schemas/
    └── reflectionSchema.ts             # NEW - Zod validation

supabase/migrations/
└── 006_create_reflections.sql          # NEW - reflections table + RLS policies

__tests__/
├── contract/
│   └── reflections.test.ts             # NEW - API contract tests
└── integration/
    └── reflection-capture-flow.test.ts # NEW - end-to-end user journey

components/ui/                           # EXISTING shadcn components (no changes)
```

**Structure Decision**: Next.js 15 app directory structure (web project type). API routes colocated in `app/api/` per Next.js convention. Frontend components in `app/components/`. Shared services and hooks in `lib/`. Database migrations in `supabase/migrations/`. Tests in `__tests__/` following existing pattern.

**Rationale**: Follows existing codebase structure from T001-T013. No new directories needed—feature integrates cleanly into current architecture. Reflection panel is UI component (like OutcomeBuilder from T009-T011), reflection service is backend service (like recomputeService from T012), API route follows RESTful pattern (like /api/outcomes from T009).

## Phase 0: Outline & Research

**Unknowns Extraction**: All critical unknowns resolved during `/clarify` session. No remaining `NEEDS CLARIFICATION` markers in spec.md. Technical Context above fully specified.

**Research Tasks Identified**:
1. **Exponential Decay Implementation** - How to efficiently calculate `weight = 0.5^(days_old/7)` in JavaScript with high precision
2. **Debounce Strategy** - Best practice for 2-second debounce with rate limiting (1 per 10s) without external libraries
3. **Keyboard Shortcut Handling** - Cross-platform keyboard event handling for Cmd+R (Mac) / Ctrl+R (Windows)
4. **Optimistic UI Update Pattern** - React pattern for clearing textarea + prepending reflection before server confirmation
5. **Relative Timestamp Formatting** - Lightweight library or utility for "Just now", "3h ago", "2 days ago" formatting
6. **Character Counter UX** - Conditional rendering approach (hide until 450 chars, show at 450-500)
7. **Mobile Modal vs Desktop Sidebar** - Responsive component pattern for full-screen modal on mobile, collapsible sidebar on desktop
8. **API Error Differentiation** - Distinguishing network errors (offline) vs server errors (recompute failure) for correct toast messaging

**Research Consolidation** (to be written in research.md):
For each research task above, document:
- **Decision**: Chosen approach
- **Rationale**: Why this approach solves the requirement
- **Alternatives considered**: What else was evaluated and why rejected
- **Code example**: Minimal snippet demonstrating the pattern

**Output Target**: `research.md` with 8 research topics resolved

---

**Proceeding to Phase 0 execution...**

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - `reflections` table schema (id, user_id, text, created_at)
   - Composite index on (user_id, created_at DESC) per spec
   - RLS policies (users read/write own reflections)
   - Relationship to existing `user_outcomes` table (1:N, both influence prioritization)

2. **Generate API contracts** from functional requirements:
   - `GET /api/reflections` - Fetch recent 5 with weights
   - `POST /api/reflections` - Add new reflection
   - OpenAPI 3.0 spec to `/contracts/` directory
   - Request/response schemas with Zod validation

3. **Generate contract tests** from contracts:
   - `__tests__/contract/reflections.test.ts`
   - Assert schemas, status codes, error handling
   - Tests must FAIL initially (no implementation)

4. **Extract test scenarios** from user stories:
   - 15 acceptance scenarios from spec.md → integration test steps
   - Manual test guide for network error scenarios (FormData limitation workaround)

5. **Update CLAUDE.md incrementally**:
   - Execute: `.specify/scripts/bash/update-agent-context.sh claude`
   - Add reflection capture feature context
   - Document keyboard shortcuts, debounce patterns
   - Keep under 150 lines per constitutional guidance

**Output**: data-model.md, contracts/, failing tests, quickstart.md, updated CLAUDE.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. Load `.specify/templates/tasks-template.md` as base template
2. Generate vertical slice tasks from Phase 1 artifacts:
   - Contract tests → TDD test creation tasks
   - Data model → database migration task
   - API contracts → endpoint implementation tasks
   - UI mockups → component creation tasks
   - Integration tests → end-to-end validation tasks

**Vertical Slice Examples**:
- **Task 1**: "User sees reflection panel toggle icon in header" (UI + event handler + visible feedback)
- **Task 2**: "User opens panel via keyboard shortcut and textarea auto-focuses" (keyboard event + focus management + verify behavior)
- **Task 3**: "User types reflection and sees no character counter until 450 chars" (input handling + conditional rendering + verify UI state)
- **Task 4**: "User submits reflection and sees optimistic update + toast" (form submission + database insert + optimistic UI + toast notification)
- **Task 5**: "System calculates recency weights and displays faded reflections" (weight calculation service + list rendering + opacity styling)

**Ordering Strategy**:
1. **Foundation** (P): Database migration, schema types
2. **Backend Services** (P): reflectionService.ts tests → implementation
3. **API Endpoints** (P): Contract tests → route.ts implementation
4. **UI Components**: ReflectionInput → ReflectionList → ReflectionPanel (dependency order)
5. **Integration Points**: AI prompt injection → recompute trigger
6. **Page Integration**: Add panel to upload page → dashboard page
7. **End-to-End Validation**: Integration tests → quickstart scenarios

**Parallelization**: Mark [P] for:
- Database migration (independent)
- Service tests (independent modules)
- Contract tests (independent endpoints)
- Component tests (independent React components)

**Estimated Output**: 18-22 vertical slice tasks in tasks.md, ordered by TDD + dependency flow

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

**No violations detected.** All 6 constitutional principles satisfied without exceptions.

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) ✅
- [x] Phase 1: Design complete (/plan command) ✅
- [x] Phase 2: Task planning approach described (/plan command) ✅
- [ ] Phase 3: Tasks generated (/tasks command) - NEXT
- [ ] Phase 4: Implementation complete - PENDING
- [ ] Phase 5: Validation passed - PENDING

**Gate Status**:
- [x] Initial Constitution Check: PASS ✅
- [x] Post-Design Constitution Check: PASS ✅ (no new violations)
- [x] All NEEDS CLARIFICATION resolved ✅ (5 clarifications in spec.md)
- [x] Complexity deviations documented ✅ (none - no violations)

**Artifacts Generated**:
- ✅ research.md - 8 technical patterns researched and documented
- ✅ data-model.md - reflections table schema, RLS policies, query patterns
- ✅ contracts/GET_reflections.json - OpenAPI 3.0 spec for GET endpoint
- ✅ contracts/POST_reflections.json - OpenAPI 3.0 spec for POST endpoint
- ✅ quickstart.md - 15 manual test scenarios (158 verification steps)
- ✅ CLAUDE.md - Updated with reflection capture context

---
*Based on Constitution v1.1.5 - See `.specify/memory/constitution.md`*
