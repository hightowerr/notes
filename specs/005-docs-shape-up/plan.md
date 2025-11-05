
# Implementation Plan: Vector Storage Foundation for Task Embeddings

**Branch**: `005-docs-shape-up` | **Date**: 2025-10-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/005-docs-shape-up/spec.md`

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
Build vector embedding infrastructure to enable sub-500ms semantic search of tasks across all documents. During document processing, the system automatically generates and stores 1536-dimension embeddings for each extracted task. When users change their outcome statement or search for tasks, the system performs similarity matching against stored embeddings instead of re-running AI inference, reducing search time from 40+ seconds to <500ms. Phase 1 focuses on embedding generation pipeline, storage with pgvector in Supabase, and basic similarity search capability.

## Technical Context
**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: Next.js 15.5, React 19.1, Vercel AI SDK 4.0, @supabase/supabase-js 2.58, OpenAI GPT-4o, Zod 3.24
**Storage**: Supabase PostgreSQL with pgvector extension for 1536-dimension embeddings
**Testing**: Vitest 2.1.8 with @testing-library/react 16.1, jsdom 25.0
**Target Platform**: Web application (Next.js App Router), Vercel deployment
**Project Type**: Web (Next.js full-stack, single codebase)
**Performance Goals**: <500ms semantic search (95th percentile), <2s additional embedding generation time during document processing
**Constraints**: One-time embedding cost per task, <10KB storage per task embedding, minimize API calls via batching
**Scale/Scope**: P0 target: 10,000 total tasks across all documents, future scale to 100k+ tasks with vector index optimization

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.5:

- [x] **Autonomous by Default**: Feature operates without manual triggers (Sense → Reason → Act)
  - ✅ Embedding generation automatically triggered during document processing (FR-001)
  - ✅ No user action required beyond initial upload
- [x] **Deterministic Outputs**: JSON schemas documented and validated with retry logic
  - ✅ Zod schemas for embedding requests/responses (embeddingSchema.ts)
  - ✅ Vector dimensions fixed at 1536 (OpenAI text-embedding-3-small standard)
  - ✅ Retry logic for API failures with queue management (FR-029)
- [x] **Modular Architecture**: Components decoupled with clear interfaces, no tight coupling
  - ✅ embeddingService.ts - API calls to OpenAI
  - ✅ vectorStorage.ts - pgvector database operations
  - ✅ aiSummarizer.ts - orchestrates embedding generation via service
  - ✅ Each service independently testable
- [x] **Test-First Development**: TDD plan established (tests before implementation)
  - ✅ Contract tests for POST /api/embeddings/generate and GET /api/embeddings/search
  - ✅ Integration tests for embedding generation + search flow
  - ✅ Tests written before implementation (Phase 1 generates failing tests)
- [x] **Observable by Design**: Structured logging with metrics, errors, and confidence scores
  - ✅ Error logging for embedding failures (FR-026, FR-027)
  - ✅ Context included: document ID, task ID, timestamp, error message (FR-028)
  - ✅ Status tracking per task: completed/pending/failed (FR-025)
- [x] **Vertical Slice Architecture**: Tasks deliver complete user value (SEE + DO + VERIFY), no backend-only or frontend-only work
  - ⚠️ **VIOLATION**: Phase 1 is infrastructure-only (embeddings invisible to users)
  - **Justification**: Required foundation for future features (task recommendation UI in Phase 2)
  - **Mitigation**: Quickstart includes verification via database queries and API testing to demonstrate embedding storage and search work correctly

Document any violations in Complexity Tracking section with justification or simplify design to comply.

## Project Structure

### Documentation (this feature)
```
specs/005-docs-shape-up/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   └── POST_embeddings_search.json
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
app/
├── api/
│   ├── embeddings/
│   │   └── search/route.ts      # POST - Similarity search endpoint
│   └── process/route.ts         # Updated to trigger embedding generation
├── components/                  # UI components (no changes Phase 1)
└── page.tsx                     # Main upload page (no changes Phase 1)

lib/
├── schemas/
│   ├── embeddingSchema.ts       # Zod schemas for embedding requests/responses
│   └── taskSchema.ts            # Task embedding entity schema
├── services/
│   ├── embeddingService.ts      # OpenAI embedding generation service
│   ├── vectorStorage.ts         # Supabase pgvector operations
│   └── aiSummarizer.ts          # Updated to call embeddingService

supabase/
└── migrations/
    ├── 007_enable_pgvector.sql          # Enable pgvector extension
    ├── 008_create_task_embeddings.sql   # Create task_embeddings table + indexes
    └── 009_create_search_function.sql   # Create search_similar_tasks() RPC function

__tests__/
├── contract/
│   └── embeddings-search.test.ts    # POST /api/embeddings/search contract
└── integration/
    └── embedding-flow.test.ts       # End-to-end embedding generation + search
```

**Structure Decision**: Next.js 15 App Router structure with API routes, service layer, and database migrations. No frontend UI changes in Phase 1 (embedding generation happens during existing document processing flow). Services follow existing patterns from aiSummarizer.ts and noteProcessor.ts.

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
- Generate tasks from Phase 1 design docs (contracts, data-model.md, quickstart.md)

**Specific Tasks to Generate**:

1. **Database Foundation** (Sequential):
   - T020: Apply migrations 007, 008, 009 - Enable pgvector extension, create task_embeddings table with ivfflat index, and create search_similar_tasks() RPC function

2. **Schema & Type Definitions** (Parallel - [P]):
   - T023 [P]: Create embeddingSchema.ts - Zod schemas for API requests/responses
   - T024 [P]: Create taskSchema.ts - Task embedding entity types

3. **Service Layer** (Sequential):
   - T025: Create embeddingService.ts - OpenAI API integration with batch support
   - T026: Create vectorStorage.ts - Supabase pgvector operations (store, search)
   - T027: Update aiSummarizer.ts - Integrate embedding generation into processing pipeline

4. **Contract Tests** (Parallel - [P], fail initially):
   - T028 [P]: Write embeddings-search.test.ts - POST /api/embeddings/search contract tests
   - T029 [P]: Write embedding-flow.test.ts - Integration test for auto-generation + search

5. **API Implementation**:
   - T030: Implement POST /api/embeddings/search - Similarity search endpoint with error handling
   - T031: Update POST /api/process - Hook embedding generation into document processing

6. **Validation & Documentation**:
   - T032: Run quickstart scenarios 1-5 - Verify all functional requirements met
   - T033: Performance testing - Validate <500ms search at 10K embeddings (FR-015, FR-017)
   - T034: Update CLAUDE.md - Document embedding patterns and troubleshooting

**Ordering Strategy**:
- **TDD order**: Tests (T028-T029) before API implementation (T030-T031)
- **Dependency order**:
  - Migrations (T020-T022) → Schemas (T023-T024) → Services (T025-T027) → Tests (T028-T029) → APIs (T030-T031) → Validation (T032-T034)
- **Parallelization**: Mark independent tasks with [P] (T023-T024, T028-T029)

**Acceptance Criteria** (from quickstart.md):
- Scenario 1: Auto-generate embeddings (20 tasks in <2s)
- Scenario 2: Semantic search (<500ms, results ranked by similarity)
- Scenario 3: Graceful degradation (API failures → pending status)
- Scenario 4: Queue-based rate limiting (5 concurrent uploads, no throttling)
- Scenario 5: Cascade delete (embeddings auto-deleted with documents)

**Estimated Output**: ~9 tasks (T020-T028) in tasks.md (refined from initial 15-task estimate based on scope consolidation)

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
| **Vertical Slice Architecture**: Phase 1 is infrastructure-only (no visible UI) | Embedding generation is foundational data infrastructure required before any task recommendation features can work. Cannot deliver user value without stored embeddings first. | **Alternative 1 (Build UI + backend together)**: Rejected because task recommendation UI depends on having 50+ documents with embeddings to validate search quality - would delay validation by weeks. **Alternative 2 (Build minimal UI now)**: Rejected because showing "embeddings stored: 150" in UI provides no user value and violates the "demonstrable to non-technical stakeholders" principle. Phase 1 focuses on API contracts and database verification to enable rapid Phase 2 UI delivery. |


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
- [x] Initial Constitution Check: PASS (1 justified violation documented)
- [x] Post-Design Constitution Check: PASS (violation remains justified, design complete)
- [x] All NEEDS CLARIFICATION resolved (no unknowns in Technical Context)
- [x] Complexity deviations documented (Vertical Slice violation justified)

---
*Based on Constitution v1.1.4 - See `.specify/memory/constitution.md`*
