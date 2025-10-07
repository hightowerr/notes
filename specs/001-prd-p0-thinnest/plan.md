
# Implementation Plan: P0 – Thinnest Agentic Slice (Proof of Agency)

**Branch**: `001-prd-p0-thinnest` | **Date**: 2025-10-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/001-prd-p0-thinnest/spec.md`

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
Build an autonomous note processing system that automatically detects uploaded files (PDF/DOCX/TXT), converts them to Markdown, extracts structured summaries with topics, decisions, actions, and L/N/O task prioritization, then stores outputs (JSON + Markdown) without manual intervention. This proves the Sense → Reason → Act loop for the AI Note Synthesiser.

**User Problem**: Knowledge workers waste hours processing lengthy, unstructured meeting notes and struggle to connect information to their goals.

**Solution Approach**: Lightweight autonomous agent that processes files on upload, scores actions against user goals, and outputs clean Markdown + deterministic JSON within <8s average processing time.

## Technical Context
**Language/Version**: TypeScript 5.x, Node.js (Next.js 15 runtime)
**Primary Dependencies**: Next.js 15, React 19, Vercel AI SDK, Supabase, pdf-parse/mammoth (document conversion), Tailwind CSS v4
**Storage**: Supabase (PostgreSQL + Storage buckets for files), 30-day rolling retention
**Testing**: Vitest/Jest for unit tests, Playwright for integration tests (TDD mandatory per constitution)
**Target Platform**: Web (Next.js server-side API routes + React client)
**Project Type**: web (frontend + backend via Next.js App Router)
**Performance Goals**: <8s average processing time, ≥95% file detection reliability, ≥85% summarization accuracy, up to 3 concurrent file processing
**Constraints**: 10MB max file size, autonomous operation (no manual triggers), deterministic JSON output with retry logic, structured logging required
**Scale/Scope**: Single-user P0 slice, processes PDF/DOCX/TXT/MD files, extracts 4 entity types (topics, decisions, actions, LNO tasks), stores in Supabase

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.0.0:

- [x] **Autonomous by Default**: ✅ Feature operates without manual triggers - file upload triggers automatic processing pipeline (Sense → Reason → Act). No "summarise" button required. FR-001 ensures automatic detection.
- [x] **Deterministic Outputs**: ✅ JSON schema documented in spec (topics, decisions, actions, lno_tasks). FR-010 requires retry logic for invalid JSON. FR-015 mandates 100% output completeness.
- [x] **Modular Architecture**: ✅ Design separates concerns: file detection → conversion module → AI summarization module → storage module. Each module has clear interfaces and can be independently tested/replaced.
- [x] **Test-First Development**: ✅ TDD plan will be established in Phase 1 (contract tests, integration tests, quickstart scenarios). Constitution requires tests before implementation.
- [x] **Observable by Design**: ✅ FR-007 mandates structured logging (file hash, duration, confidence scores). FR-006 requires multiple feedback channels (console + toast + status). FR-011 flags low-confidence outputs.

**Initial Check**: PASS - All constitutional principles satisfied by spec requirements. No violations to document.

**Post-Design Check** (after Phase 1):
- [x] **Autonomous by Default**: ✅ Design maintains autonomy - file upload triggers automatic pipeline without user interaction. No manual buttons added.
- [x] **Deterministic Outputs**: ✅ Zod schemas defined (`DocumentOutputSchema` in data-model.md). Vercel AI SDK `generateObject()` ensures schema compliance with retry logic.
- [x] **Modular Architecture**: ✅ Clear separation: `document-converter.ts` (PDF/DOCX/TXT → MD), `ai-summarizer.ts` (AI integration), `storage.ts` (Supabase ops), `schemas.ts` (validation). Each module independently testable.
- [x] **Test-First Development**: ✅ TDD plan established: Contract tests in `__tests__/contract/`, integration tests in `__tests__/integration/`, unit tests in `__tests__/unit/`. Quickstart.md defines 10 test scenarios before implementation.
- [x] **Observable by Design**: ✅ `processing_logs` table tracks all operations. API endpoints expose status and logs. Confidence scores, durations, errors all logged per design.

**Final Check**: PASS ✅ - Design maintains full constitutional compliance. No architectural deviations. Ready for implementation.

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
app/                          # Next.js App Router (frontend + backend unified)
├── api/
│   ├── upload/              # File upload endpoint (new)
│   ├── process/             # Document processing endpoint (new)
│   └── documents/           # Document retrieval endpoints (new)
├── page.tsx                 # Main UI (update to connect to real backend)
├── layout.tsx               # Root layout (existing)
└── globals.css              # Global styles (existing)

lib/
├── supabase.ts              # Supabase client (existing)
├── document-converter.ts    # PDF/DOCX/TXT → Markdown (new)
├── ai-summarizer.ts         # Vercel AI SDK integration (new)
├── storage.ts               # File storage operations (new)
└── schemas.ts               # JSON schema definitions (new)

components/
├── ui/                      # shadcn components (existing)
└── UploadZone.tsx           # File upload component (update existing in page.tsx)

__tests__/
├── contract/                # API contract tests (new)
│   ├── upload.test.ts
│   ├── process.test.ts
│   └── documents.test.ts
├── integration/             # End-to-end tests (new)
│   └── file-processing.test.ts
└── unit/                    # Unit tests (new)
    ├── document-converter.test.ts
    └── ai-summarizer.test.ts
```

**Structure Decision**: Next.js unified web application structure selected. Frontend and backend coexist in `app/` directory using App Router. API routes in `app/api/`, business logic in `lib/`, tests in `__tests__/` following TDD principles. Existing Supabase integration and UI components will be enhanced, not replaced.

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
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract → contract test task [P]
- Each entity → model creation task [P] 
- Each user story → integration test task
- Implementation tasks to make tests pass

**Ordering Strategy**:
- TDD order: Tests before implementation 
- Dependency order: Models before services before UI
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 25-30 numbered, ordered tasks in tasks.md

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
- [x] Phase 0: Research complete (/plan command) ✅
- [x] Phase 1: Design complete (/plan command) ✅
- [x] Phase 2: Task planning complete (/plan command - describe approach only) ✅
- [x] Phase 3: Tasks generated (/tasks command) ✅
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS ✅
- [x] Post-Design Constitution Check: PASS ✅
- [x] All NEEDS CLARIFICATION resolved ✅
- [x] Complexity deviations documented (None - no violations)

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*
