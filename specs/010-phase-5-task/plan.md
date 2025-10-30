
# Implementation Plan: Task Gap Filling

**Branch**: `010-phase-5-task` | **Date**: 2025-10-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/010-phase-5-task/spec.md`

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

AI-powered gap detection and bridging task generation to complete incomplete task sequences. The system analyzes prioritized task lists using 4 heuristics (time gaps >1 week, action type jumps, missing dependencies, skill domain changes), detects logical discontinuities with conservative thresholds (3+ indicators), and uses Mastra agents with semantic search to generate 1-3 contextual bridging tasks per gap. Users review suggestions in a modal, edit descriptions/estimates, and accept/reject tasks for insertion with proper dependency linking. Performance targets: ≥80% precision, ≥60% acceptance rate, <5s generation per gap, zero duplicates.

## Technical Context
**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: Next.js 15.5.4, React 19.1.0, Mastra 0.21.1, Vercel AI SDK 4.0.0, Zod 3.24.1
**Storage**: Supabase PostgreSQL with pgvector (existing `task_embeddings` table with `source` field)
**Testing**: Vitest 2.1.8, Testing Library, contract/integration/unit test structure
**Target Platform**: Web (Next.js App Router)
**Project Type**: web (Next.js frontend + API routes backend)
**Performance Goals**: <5s generation per gap, <500ms semantic search, ≥80% gap detection precision, ≥60% user acceptance rate
**Constraints**: 1 week appetite, conservative gap detection (3+ indicators), max 3 bridging tasks per gap, no external APIs, one-pass detection only
**Scale/Scope**: 10-50 tasks per plan, 1-3 gaps detected per analysis session, semantic search across existing task corpus

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.6:

- [x] **Autonomous by Default**: ⚠️ VIOLATION - User must click "Find Missing Tasks" to trigger gap detection (not fully autonomous)
- [x] **Deterministic Outputs**: JSON schemas for Gap, BridgingTask, GapIndicators validated with Zod, manual retry on AI failures
- [x] **Modular Architecture**: Gap detection service, task generation service, insertion service with clear interfaces
- [x] **Test-First Development**: Contract tests for endpoints, integration tests for gap detection + generation, unit tests for heuristics
- [x] **Observable by Design**: Logs gap count, generation latency, acceptance rate (FR-041 to FR-043)
- [x] **Vertical Slice Architecture**: Each slice delivers SEE (UI button/modal) + DO (detect/generate/accept) + VERIFY (updated plan)

**Justification for Violation**:
- Manual trigger required because gap detection is computationally expensive and may yield zero results
- Running automatically on every plan load would waste API calls and create poor UX
- User explicitly wants control over when to search for gaps (acceptance criteria requires "Find Missing Tasks" button)
- Documented in Complexity Tracking below

## Project Structure

### Documentation (this feature)
```
specs/010-phase-5-task/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── POST_detect_gaps.json
│   ├── POST_generate_bridging_tasks.json
│   └── POST_accept_bridging_tasks.json
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
app/
├── api/
│   └── gaps/
│       ├── detect/route.ts           # POST /api/gaps/detect
│       ├── generate/route.ts         # POST /api/gaps/generate
│       └── accept/route.ts           # POST /api/gaps/accept
├── priorities/
│   ├── page.tsx                      # Updated with "Find Missing Tasks" button
│   └── components/
│       ├── GapDetectionModal.tsx     # Review/accept bridging tasks
│       └── BridgingTaskCard.tsx      # Individual suggestion display
└── components/
    └── ui/                           # shadcn/ui components (existing)

lib/
├── schemas/
│   ├── gapSchema.ts                  # Gap entity validation
│   └── bridgingTaskSchema.ts         # BridgingTask entity validation
├── services/
│   ├── gapDetectionService.ts        # Heuristic analysis (4 indicators)
│   ├── taskGenerationService.ts      # AI generation with semantic search
│   └── taskInsertionService.ts       # Dependency validation and insertion
└── mastra/
    └── agents/
        └── gapFillingAgent.ts        # Mastra agent orchestration

__tests__/
├── contract/
│   ├── gaps-detect.test.ts
│   ├── gaps-generate.test.ts
│   └── gaps-accept.test.ts
├── integration/
│   ├── gap-detection-flow.test.ts
│   └── task-generation-flow.test.ts
└── unit/
    └── services/
        ├── gapDetectionService.test.ts
        └── taskGenerationService.test.ts
```

**Structure Decision**: Next.js App Router web application (Option 2) with API routes in `app/api/` and React components in `app/priorities/components/`. Follows existing project pattern of service modules in `lib/services/`, schemas in `lib/schemas/`, and Mastra agents in `lib/mastra/agents/`. Tests organized by type (contract/integration/unit) matching existing `__tests__/` structure.

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
- Generate vertical slice tasks from contracts, data model, and quickstart scenarios
- Each task delivers complete user value: UI + Backend + Data + Feedback

**Slice 1: Gap Detection Endpoint + UI Trigger**
- Contract test: `POST /api/gaps/detect` schema validation
- Backend: `gapDetectionService.ts` with 4 heuristics
- Frontend: "Find Missing Tasks" button on priorities page
- Integration test: End-to-end gap detection flow
- User can see: Button → Loading → Gap results modal

**Slice 2: Bridging Task Generation**
- Contract test: `POST /api/gaps/generate` schema validation
- Backend: `taskGenerationService.ts` with Mastra agent
- Frontend: `GapDetectionModal.tsx` showing suggestions
- Integration test: Semantic search + AI generation flow
- User can see: Gap → Suggestions with reasoning

**Slice 3: Task Acceptance and Insertion**
- Contract test: `POST /api/gaps/accept` schema validation
- Backend: `taskInsertionService.ts` with cycle validation
- Frontend: Checkbox selection + editable fields
- Integration test: Accept → Insert → Verify dependencies
- User can see: Selected tasks → Updated priorities page

**Slice 4: Zero-Result Handling**
- Unit test: Empty semantic search results
- Backend: Prompt for manual examples logic
- Frontend: Manual example input UI in modal
- Integration test: Zero results → Manual input → Generation
- User can see: Prompt → Input → Suggestions

**Slice 5: Error Handling**
- Unit tests: AI failure, timeout, circular dependency, duplicate detection
- Backend: Error detection and retry logic
- Frontend: Error states with "Try Again" button
- Integration tests: Failure scenarios → User retry
- User can see: Error message → Retry button

**Ordering Strategy**:
1. TDD order: Contract tests → Integration tests → Implementation
2. Dependency order: Schemas → Services → API routes → UI components
3. Vertical slices: Complete feature flow before next slice
4. Mark [P] for parallel tasks (independent schemas, contract tests)

**Estimated Output**: 18-22 numbered, ordered tasks in tasks.md (5 vertical slices × 3-4 tasks each)

**Success Criteria per Slice**:
- User can demo the slice end-to-end
- All tests pass (contract + integration + unit)
- No backend-only or frontend-only tasks
- Each slice adds observable value

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
| Manual trigger ("Find Missing Tasks" button) | Gap detection is computationally expensive (semantic search + AI generation). Running automatically on every plan load would waste API credits ($0.10-0.30 per analysis) and create poor UX when no gaps exist. | Automatic detection: User research shows users want explicit control over when to search for gaps. Passive detection creates uncertainty ("Is it analyzing now? Did it miss gaps?"). Button provides clear trigger and feedback. |


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
- [x] Initial Constitution Check: PASS (with justified manual trigger violation)
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (no unknowns in Technical Context)
- [x] Complexity deviations documented (manual trigger justified)

---
*Based on Constitution v1.1.6 - See `.specify/memory/constitution.md`*
