# Implementation Plan: Agent Runtime & Reasoning Loop

**Branch**: `007-docs-shape-pitches` | **Date**: 2025-10-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-docs-shape-pitches/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → ✅ COMPLETE - Spec loaded and analyzed
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → ✅ COMPLETE - All technical decisions extracted from spec
3. Fill the Constitution Check section
   → IN PROGRESS
4. Evaluate Constitution Check section
   → PENDING
5. Execute Phase 0 → research.md
   → PENDING
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, GEMINI.md
   → PENDING
7. Re-evaluate Constitution Check
   → PENDING
8. Plan Phase 2 → Describe task generation approach
   → PENDING
9. STOP - Ready for /tasks command
```

## Summary

Build an autonomous agent runtime that analyzes user tasks and generates prioritized execution plans using the Mastra framework. When a user navigates to the Task Priorities page and triggers analysis, the system executes a multi-step reasoning loop that automatically selects appropriate tools (semantic search, dependency detection, clustering) to understand task relationships, dependencies, and thematic grouping. The agent produces a prioritized task list organized into execution waves (parallel vs sequential), displays a progress indicator during analysis, and provides an expandable reasoning trace panel showing step-by-step decision-making. The feature requires an active outcome statement to function and stores only the most recent session (7-day trace retention).

**Technical Approach**: Leverage Mastra's `createAgent()` for autonomous tool selection and reasoning loop management, eliminating custom loop logic. The agent runtime integrates with existing Phase 2 tools (5 tools from Spec 006), outcome management system (T008-T011), reflections data (T020+), and vector embeddings (T020-T027). A dedicated Task Priorities page serves as the UI entry point with manual trigger controls, progress feedback, and collapsible reasoning trace visualization.

## Technical Context

**Language/Version**: TypeScript 5.x (Next.js 15, React 19)
**Primary Dependencies**: @mastra/core (agent runtime), @mastra/core (OpenAI GPT-4o integration), Vercel AI SDK (tool execution), Supabase (session persistence), Zod (schema validation)
**Storage**: Supabase PostgreSQL (agent_sessions, reasoning_traces tables with 7-day TTL)
**Testing**: Vitest (contract, integration, unit tests), manual testing guides where automated tests blocked
**Target Platform**: Web (Next.js server + client components)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: <30s total execution time (95th percentile), ≤10 reasoning steps (90% of sessions), >80% tool selection accuracy
**Constraints**: Maximum 10 reasoning steps (hard limit), 7-day trace retention (minimal storage), synchronous execution (no background jobs), single user context (no multi-user coordination)
**Scale/Scope**: Up to 200 tasks per prioritization session, 5 tools available for agent selection, single active session per user (no history)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.5:

- [x] **Autonomous by Default**: Feature operates with manual trigger but reasoning loop runs autonomously once initiated (Mastra handles tool selection without user intervention)
- [x] **Deterministic Outputs**: Agent produces structured JSON (Prioritized Task Plan schema with task IDs, execution waves, dependencies, confidence scores)
- [x] **Modular Architecture**: Components decoupled - agent runtime (lib/mastra/agents/), UI (app/priorities/page.tsx), services (lib/services/agentOrchestration.ts), result parsing (lib/services/resultParser.ts)
- [x] **Test-First Development**: TDD plan - contract tests for agent API, integration tests for tool orchestration, unit tests for result parsing
- [x] **Observable by Design**: Mastra telemetry logs all reasoning steps (thought, tool, input, output, duration), session IDs for tracing, execution metadata tracked
- [x] **Vertical Slice Architecture**: Each task delivers complete user value - SEE (Task Priorities page), DO (trigger prioritization), VERIFY (view prioritized tasks + reasoning trace)

**Initial Assessment**: NO VIOLATIONS - Feature design aligns with all constitutional principles.

## Project Structure

### Documentation (this feature)
```
specs/007-docs-shape-pitches/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
app/
├── priorities/
│   └── page.tsx                      # Task Priorities UI (manual trigger, progress, results)
├── api/
│   └── agent/
│       └── prioritize/
│           └── route.ts              # POST /api/agent/prioritize endpoint
└── components/
    ├── PrioritizationPanel.tsx       # Results display (execution waves, dependencies)
    └── ReasoningTracePanel.tsx       # Expandable reasoning step viewer

lib/
├── mastra/
│   ├── agents/
│   │   └── taskOrchestrator.ts       # Mastra agent definition with instructions
│   ├── services/
│   │   ├── agentOrchestration.ts     # orchestrateTaskPriorities() service
│   │   └── resultParser.ts           # Extract tasks/dependencies/clusters from trace
│   └── tools/                        # Phase 2 tools (already exist from Spec 006)
│       ├── semanticSearch.ts
│       ├── getDocumentContext.ts
│       ├── detectDependencies.ts
│       ├── queryTaskGraph.ts
│       └── clusterBySimilarity.ts
├── schemas/
│   ├── agentSessionSchema.ts         # Agent session validation
│   ├── reasoningTraceSchema.ts       # Reasoning step validation
│   └── prioritizedPlanSchema.ts      # Task plan output validation
└── types/
    └── agent.ts                       # TypeScript types for agent runtime

supabase/
└── migrations/
    ├── 011_create_agent_sessions.sql          # Agent session persistence
    ├── 012_create_reasoning_traces.sql        # Reasoning step logs (7-day TTL)
    └── 013_add_trace_cleanup_trigger.sql      # Auto-delete traces >7 days

__tests__/
├── contract/
│   └── agent-prioritize.test.ts      # POST /api/agent/prioritize contract
├── integration/
│   ├── agent-orchestration.test.ts   # End-to-end agent session
│   └── tool-selection.test.ts        # Mastra tool calling accuracy
└── unit/
    └── services/
        └── resultParser.test.ts       # Parse agent output to structured data
```

**Structure Decision**: Web application structure (Option 2) selected. This feature extends the existing Next.js application with a new `/priorities` page route, adds agent orchestration services under `lib/mastra/`, and creates new API endpoints under `app/api/agent/`. The agent leverages existing Phase 2 tools from `lib/mastra/tools/` (Spec 006) and integrates with outcome/reflections data from previous features. Database migrations extend Supabase schema with agent session tracking.

## Phase 0: Outline & Research
*Status: PENDING*

### Research Tasks

1. **Mastra Agent Configuration Best Practices**
   - Decision: Optimal agent instructions format for tool selection
   - Research: Mastra documentation on instruction engineering, temperature settings, max steps configuration
   - Output: Instruction template for Task Orchestrator agent

2. **Mastra Tool Integration Patterns**
   - Decision: How to pass existing Phase 2 tools to Mastra agent
   - Research: Mastra tool registration, Zod parameter validation, error handling in tool execution
   - Output: Tool adapter pattern if needed, or confirmation tools work as-is

3. **Reasoning Trace Storage Strategy**
   - Decision: Database schema for reasoning traces with 7-day TTL
   - Research: PostgreSQL TTL patterns, trigger vs cron cleanup, index strategies for session_id queries
   - Output: Migration schema for reasoning_traces table

4. **Agent Result Parsing Approach**
   - Decision: Extract structured data from Mastra agent natural language responses
   - Research: Mastra execution trace format, tool output aggregation, JSON parsing with fallback
   - Output: Result parser service design

5. **Synchronous vs Streaming Execution**
   - Decision: Progress indicator implementation (polling vs SSE vs WebSocket)
   - Research: Next.js API route capabilities, client-side progress tracking patterns
   - Output: Progress feedback mechanism (likely polling given "simple progress indicator" requirement)

6. **Session Overwrite vs History Accumulation**
   - Decision: Database upsert strategy for single-session-per-user
   - Research: Supabase upsert patterns, transaction handling for session replacement
   - Output: SQL strategy for session management (INSERT ... ON CONFLICT UPDATE)

**Output**: research.md with all decisions resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

### Data Model (data-model.md)

**Entities to extract from spec**:
1. Agent Session (spec lines 142-143)
2. Reasoning Trace (spec lines 144-145)
3. Reasoning Step (spec lines 146-147)
4. Prioritized Task Plan (spec lines 148-149)
5. Task Dependency (spec lines 150-151)
6. Execution Wave (spec lines 152-153)
7. Execution Metadata (spec lines 154-155)

**Validation rules**: Zod schemas enforcing FR-002 (max 10 steps), FR-020 (7-day retention), NFR-002 (<30s execution time)

**State transitions**: Agent Session (pending → running → completed/failed), Reasoning Step (queued → executing → success/failed)

### API Contracts (contracts/)

**Endpoints from functional requirements**:

1. **POST /api/agent/prioritize** (FR-001, FR-026)
   - Request: { outcome_id: UUID, user_id: UUID }
   - Response: { session_id: UUID, status: 'running' | 'completed' | 'failed', prioritized_plan?: PrioritizedTaskPlan, execution_metadata: ExecutionMetadata }
   - Contract: `/contracts/POST_agent_prioritize.json`

2. **GET /api/agent/sessions/[sessionId]** (FR-018)
   - Request: Path param sessionId
   - Response: { session: AgentSession, trace: ReasoningTrace }
   - Contract: `/contracts/GET_agent_sessions.json`

3. **GET /api/agent/sessions/[sessionId]/trace** (FR-029, FR-030)
   - Request: Path param sessionId
   - Response: { steps: ReasoningStep[], total_duration_ms: number }
   - Contract: `/contracts/GET_agent_trace.json`

### Contract Tests

Generate failing tests:
- `__tests__/contract/agent-prioritize.test.ts` - Assert POST request/response schema
- `__tests__/contract/agent-sessions.test.ts` - Assert GET session schema
- `__tests__/contract/agent-trace.test.ts` - Assert GET trace schema

### Integration Test Scenarios (from acceptance scenarios)

Extract from spec lines 55-64:
1. **Scenario 1**: User triggers prioritization → displays execution waves
2. **Scenario 2**: Agent analyzes tasks → shows progress indicator → expandable reasoning panel
3. **Scenario 3**: Agent completes → view dependencies and confidence scores
4. **Scenario 4**: Tool failure → partial results with warning
5. **Scenario 5**: No active outcome → disabled controls with prompt

Test file: `__tests__/integration/agent-orchestration.test.ts`

### Quickstart Validation

Manual test scenario (spec line 55):
1. Navigate to /priorities page
2. Click "Analyze Tasks" button
3. Observe progress indicator
4. Verify prioritized list displays with waves
5. Expand "View Reasoning" panel
6. Confirm reasoning steps shown with tool calls

Output: `quickstart.md`

### Agent Context Update

Execute: `bash .specify/scripts/bash/update-agent-context.sh claude`

Updates to add:
- Mastra agent runtime patterns
- Task Priorities page route
- Agent session schema
- Recent feature: Phase 3 agent runtime (keep last 3 commits)

Output: Updated `GEMINI.md` in repository root

**Phase 1 Output**: data-model.md, /contracts/POST_agent_prioritize.json, /contracts/GET_agent_sessions.json, /contracts/GET_agent_trace.json, failing tests, quickstart.md, GEMINI.md

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. Load `.specify/templates/tasks-template.md` as base template
2. Extract vertical slices from Phase 1 contracts and user scenarios:
   - Each acceptance scenario → complete vertical slice task
   - Each contract → contract test task (tests-first)
   - Each entity → schema/model creation task
   - Each UI interaction → component + API + feedback task

3. Order tasks following TDD + dependency order:
   - Phase 1: Database migrations (agent_sessions, reasoning_traces, cleanup trigger) [P]
   - Phase 2: Zod schemas (agentSessionSchema, reasoningTraceSchema, prioritizedPlanSchema) [P]
   - Phase 3: Contract tests (agent-prioritize, agent-sessions, agent-trace) [P]
   - Phase 4: Mastra agent definition (taskOrchestrator with instructions, tool integration)
   - Phase 5: Result parser service (extract tasks/dependencies/clusters from trace)
   - Phase 6: Agent orchestration service (orchestrateTaskPriorities function)
   - Phase 7: POST /api/agent/prioritize endpoint (trigger agent, return session)
   - Phase 8: GET /api/agent/sessions/[sessionId] endpoint (retrieve session + trace)
   - Phase 9: GET /api/agent/sessions/[sessionId]/trace endpoint (detailed trace)
   - Phase 10: Task Priorities page UI (manual trigger, outcome check, disabled state)
   - Phase 11: Progress indicator component (polling session status)
   - Phase 12: Prioritization results panel (execution waves, dependencies, confidence)
   - Phase 13: Reasoning trace panel (expandable, step details, tool I/O)
   - Phase 14: Integration tests (end-to-end agent session, tool selection accuracy)
   - Phase 15: Quickstart validation (manual test scenario execution)

4. Mark [P] for parallel execution:
   - Database migrations can run in parallel (independent tables)
   - Zod schemas can be created in parallel (independent files)
   - Contract tests can be written in parallel (independent endpoints)

**Ordering Strategy**:
- TDD: Tests before implementation (contract tests → agent service → API endpoints → UI)
- Dependency: Database → Schemas → Services → API → UI
- Slices: Each task delivers testable user value (SEE + DO + VERIFY)

**Estimated Output**: 15-18 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

NO VIOLATIONS - Section intentionally left empty.

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
- [x] Post-Design Constitution Check: PASS (re-validated, no violations)
- [x] All NEEDS CLARIFICATION resolved: YES (6 research decisions documented)
- [x] Complexity deviations documented: N/A (no violations)

---
*Based on Constitution v1.1.5 - See `.specify/memory/constitution.md`*
