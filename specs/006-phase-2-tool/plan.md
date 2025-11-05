
# Implementation Plan: Phase 2 - Tool Registry & Execution

**Branch**: `006-phase-2-tool` | **Date**: 2025-10-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/006-phase-2-tool/spec.md`

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

**IMPORTANT**: The /plan command STOPS at step 9. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

Build a Mastra-based tool registry that enables AI agents to dynamically execute 5 specialized query operations: semantic task search, document context retrieval, dependency detection, task graph queries, and similarity-based clustering. Using Mastra's `createTool()` API eliminates custom registry infrastructure, provides automatic parameter validation via Zod schemas, and includes built-in execution logging and telemetry. This phase establishes the foundation for agent reasoning capabilities (Phase 3) by allowing agents to explore task relationships, query embeddings from Phase 1, and analyze dependencies without being constrained to initial context.

## Technical Context
**Language/Version**: TypeScript 5.x with Next.js 15.5.4
**Primary Dependencies**: Mastra @mastra/mcp v0.13.5, Vercel AI SDK v4.0, Zod v3.24.1, Supabase client v2.58.0
**Storage**: Supabase PostgreSQL (task_embeddings with pgvector, task_relationships table from Phase 3 dependency)
**Testing**: Vitest v2.1.8 with Testing Library, contract tests for tool execution schemas
**Target Platform**: Next.js API routes (server-side tool execution), Node.js 20+
**Project Type**: Web (Next.js full-stack with app/ directory structure)
**Performance Goals**: Tool execution <5s at 95th percentile, global rate limit of 10 concurrent executions
**Constraints**: Exactly 5 tools (no dynamic loading), no tool versioning in P0, single-user (no per-tool auth), no result caching
**Scale/Scope**: 10,000 total task embeddings (Phase 1 baseline), 5 tool definitions, automatic retry logic (2 attempts, 2s delay)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.5:

- [x] **Autonomous by Default**: Tools operate via Mastra agent auto-selection (no manual triggers). Agent reasoning drives tool invocation automatically. Compliant.
- [x] **Deterministic Outputs**: All tool results conform to Zod schemas validated by Mastra. Input/output schemas documented in contracts/. Compliant.
- [x] **Modular Architecture**: Each tool defined independently in lib/mastra/tools/. Services (vectorStorage, embeddingService, dependencyService, clusteringService, documentService) decoupled with clear interfaces. Compliant.
- [x] **Test-First Development**: Contract tests for each tool schema, integration tests for tool execution flow, unit tests with mocked services. TDD workflow established. Compliant.
- [x] **Observable by Design**: Mastra's built-in telemetry logs tool name, duration, input, output, errors automatically. No custom logging needed. Compliant.
- [x] **Vertical Slice Architecture**: ⚠️ **PARTIAL VIOLATION** - This phase delivers infrastructure (tools) without direct user UI. **Justification**: Tools are agent-facing, not user-facing. User value delivered in Phase 3 (Agent Runtime) when tools enable visible agent reasoning. Phase 2 is a prerequisite for Phase 3 vertical slices. See Complexity Tracking.

**Initial Check Status**: CONDITIONAL PASS (Vertical Slice violation documented and justified)

## Project Structure

### Documentation (this feature)
```
specs/006-phase-2-tool/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── semantic-search.json
│   ├── get-document-context.json
│   ├── detect-dependencies.json
│   ├── query-task-graph.json
│   └── cluster-by-similarity.json
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
lib/
├── mastra/
│   └── tools/
│       ├── index.ts                    # Tool registry export
│       ├── semanticSearch.ts           # Tool 1: semantic-search
│       ├── getDocumentContext.ts       # Tool 2: get-document-context
│       ├── detectDependencies.ts       # Tool 3: detect-dependencies
│       ├── queryTaskGraph.ts           # Tool 4: query-task-graph
│       └── clusterBySimilarity.ts      # Tool 5: cluster-by-similarity
├── services/
│   ├── vectorStorage.ts                # Existing (Phase 1) - semantic search backend
│   ├── embeddingService.ts             # Existing (Phase 1) - embedding generation
│   ├── documentService.ts              # NEW - Document context retrieval service
│   ├── dependencyService.ts            # NEW - AI-powered dependency detection
│   └── clusteringService.ts            # NEW - Hierarchical clustering service
└── types/
    └── mastra.ts                       # NEW - Tool execution result types

app/
└── api/
    └── (No new routes - Mastra handles tool execution internally)

__tests__/
├── contract/
│   └── mastra-tools.test.ts            # Contract tests for all 5 tool schemas
├── integration/
│   └── tool-execution.test.ts          # Integration tests for tool execution flow
└── unit/
    └── tools/
        ├── semanticSearch.test.ts
        ├── getDocumentContext.test.ts
        ├── detectDependencies.test.ts
        ├── queryTaskGraph.test.ts
        └── clusterBySimilarity.test.ts
```

**Structure Decision**: Next.js Web Application (app/ directory structure). All tools defined in `lib/mastra/tools/` with services in `lib/services/`. No new API routes needed (Mastra agent handles tool execution internally). Tests follow existing Vitest structure with contract/integration/unit separation.

## Phase 0: Outline & Research

### Research Tasks

**No NEEDS CLARIFICATION items in Technical Context** - All unknowns resolved during feature specification phase via `/clarify` command. The following research tasks validate implementation approaches:

1. **Mastra Tool Definition Best Practices**
   - Research: How to structure `createTool()` calls with Zod schemas
   - Research: Mastra telemetry configuration for tool execution logging
   - Research: Error handling patterns in Mastra tool execution

2. **Vector Embedding Operations (Phase 1 Integration)**
   - Research: Validate `lib/services/vectorStorage.ts` supports semantic search queries
   - Research: Confirm embedding format (1536 dimensions) compatible with clustering algorithms
   - Research: Query performance characteristics for 10K embeddings

3. **Document Pagination Strategy**
   - Research: Average markdown document size in existing system (sample 20 documents)
   - Research: Context window limits for typical agents (estimate: 50K-100K characters)
   - Research: Overlap strategy for chunk boundaries (FR-002d: 200 characters)

4. **AI-Powered Dependency Detection**
   - Research: Vercel AI SDK structured output capabilities for relationship extraction
   - Research: Prompt engineering patterns for detecting prerequisite/blocking/related relationships
   - Research: Confidence scoring strategies for AI-detected dependencies

5. **Hierarchical Clustering Algorithms**
   - Research: TypeScript libraries for agglomerative clustering (e.g., ml-hclust)
   - Research: Distance metrics for 1536-dimension vectors (cosine similarity)
   - Research: Cluster visualization data structures (dendrogram representation)

6. **Rate Limiting Implementation**
   - Research: p-limit library (already in package.json) usage for global concurrency control
   - Research: FIFO queue implementation patterns in TypeScript
   - Research: Queue depth monitoring for observability

7. **Transient Error Detection**
   - Research: Error classification strategies (network timeout, database unavailable, etc.)
   - Research: Retry-after header handling for API rate limits
   - Research: Exponential backoff vs fixed delay trade-offs (spec chose fixed 2s delay)

**Output**: research.md with consolidated findings for each research task

## Phase 1: Design & Contracts

### 1. Data Model Extraction

Extract entities from feature spec → `data-model.md`:

**Primary Entities:**
- **Tool Definition** (Mastra-managed, code-only)
  - Fields: id (string), description (string), inputSchema (ZodSchema), execute (function)
  - Relationships: None (stateless)
  - Lifecycle: Defined at code level, registered by Mastra on startup

- **Tool Execution Trace** (Mastra telemetry, persisted automatically)
  - Fields: tool_name, input_params, output_data, duration_ms, status, timestamp, error_message, performance_warning
  - Relationships: Belongs to agent session (Phase 3 dependency)
  - Lifecycle: Created on tool call, queryable via Mastra API

- **Task Relationship** (NEW database table)
  - Fields: source_task_id, target_task_id, relationship_type (enum), confidence_score, detection_method (enum: 'manual' | 'ai')
  - Relationships: Links two tasks, references documents via task embeddings
  - Lifecycle: Created by detect-dependencies tool, queried by query-task-graph tool
  - Storage: Supabase table `task_relationships`

- **Task Cluster** (ephemeral, not persisted)
  - Fields: cluster_id, task_ids[], similarity_threshold, centroid_embedding
  - Relationships: Contains multiple tasks
  - Lifecycle: Computed on-demand by cluster-by-similarity tool, returned to agent, discarded

- **Document Context** (derived from existing data)
  - Fields: document_id, filename, markdown_content, tasks_in_document[], chunk_metadata (optional)
  - Relationships: References uploaded_files and processed_documents tables (existing)
  - Lifecycle: Fetched from database on get-document-context tool call

**Supporting Entities:**
- **Embedding Vector** (existing from Phase 1, no changes)
- **Pagination Chunk** (transient data structure for large documents)

### 2. API Contracts Generation

**Tool 1: semantic-search**
```json
{
  "id": "semantic-search",
  "input": {
    "query": "string (required)",
    "limit": "number (optional, default 20)",
    "threshold": "number (optional, default 0.7, range 0.0-1.0)"
  },
  "output": {
    "tasks": [
      {
        "task_id": "string",
        "task_text": "string",
        "document_id": "uuid",
        "similarity": "number"
      }
    ],
    "count": "number"
  },
  "errors": ["INVALID_THRESHOLD", "EMBEDDING_SERVICE_UNAVAILABLE"]
}
```

**Tool 2: get-document-context**
```json
{
  "id": "get-document-context",
  "input": {
    "task_ids": "string[] (required)",
    "chunk_number": "number (optional, for paginated documents)"
  },
  "output": {
    "documents": [
      {
        "document_id": "uuid",
        "filename": "string",
        "markdown": "string",
        "tasks_in_document": [
          {
            "task_id": "string",
            "task_text": "string"
          }
        ],
        "pagination_metadata": {
          "current_chunk": "number",
          "total_chunks": "number",
          "chunk_size": "number"
        } | null
      }
    ]
  },
  "errors": ["DOCUMENT_DELETED", "TASK_NOT_FOUND"]
}
```

**Tool 3: detect-dependencies**
```json
{
  "id": "detect-dependencies",
  "input": {
    "task_ids": "string[] (required)",
    "use_document_context": "boolean (optional, default true)"
  },
  "output": {
    "dependencies": [
      {
        "source_task_id": "string",
        "target_task_id": "string",
        "relationship_type": "prerequisite | blocks | related",
        "confidence_score": "number (0.0-1.0)",
        "detection_method": "ai"
      }
    ],
    "analyzed_count": "number"
  },
  "errors": ["AI_SERVICE_UNAVAILABLE", "INVALID_TASK_IDS"]
}
```

**Tool 4: query-task-graph**
```json
{
  "id": "query-task-graph",
  "input": {
    "task_id": "string (required)",
    "relationship_type": "prerequisite | blocks | related | all (optional)"
  },
  "output": {
    "relationships": [
      {
        "source_task_id": "string",
        "target_task_id": "string",
        "relationship_type": "string",
        "confidence_score": "number",
        "detection_method": "manual | ai"
      }
    ],
    "task_id": "string"
  },
  "errors": ["TASK_NOT_FOUND", "DATABASE_ERROR"]
}
```

**Tool 5: cluster-by-similarity**
```json
{
  "id": "cluster-by-similarity",
  "input": {
    "task_ids": "string[] (required)",
    "similarity_threshold": "number (optional, default 0.75, range 0.0-1.0)"
  },
  "output": {
    "clusters": [
      {
        "cluster_id": "number",
        "task_ids": "string[]",
        "centroid": "number[] (1536 dimensions)"
      }
    ],
    "task_count": "number",
    "cluster_count": "number"
  },
  "errors": ["INSUFFICIENT_EMBEDDINGS", "INVALID_THRESHOLD"]
}
```

**Output**: OpenAPI-style JSON schemas saved to `contracts/` directory

### 3. Contract Tests Generation

Create failing tests for each tool contract:

```typescript
// __tests__/contract/mastra-tools.test.ts

describe('semantic-search tool contract', () => {
  it('validates input schema with Zod', () => {
    // Test valid input
    // Test invalid query (not string)
    // Test invalid threshold (out of range)
  });

  it('returns output matching schema', () => {
    // Mock vectorStorage.searchSimilarTasks()
    // Assert output has tasks array
    // Assert each task has required fields
  });
});

// Repeat for all 5 tools
```

### 4. Quickstart Test Scenarios

Extract from feature spec user scenarios:

**Scenario 1: Agent searches for revenue tasks**
1. Agent calls semantic-search with query "increase monthly revenue"
2. System returns 20 tasks with similarity >0.7
3. Agent receives task IDs for further processing

**Scenario 2: Agent retrieves document context**
1. Agent calls get-document-context with task_ids from search
2. System returns full markdown for parent documents
3. Agent analyzes context to understand relationships

**Scenario 3: Agent detects dependencies**
1. Agent calls detect-dependencies with task_ids
2. AI analyzes tasks and returns prerequisite/blocking relationships
3. Agent constructs dependency graph

**Scenario 4: Agent queries existing relationships**
1. Agent calls query-task-graph for specific task
2. System returns database relationships filtered by type
3. Agent combines with AI-detected dependencies

**Scenario 5: Agent clusters similar tasks**
1. Agent calls cluster-by-similarity with 50 task IDs
2. System groups into hierarchical clusters
3. Agent identifies task themes

**Output**: quickstart.md with manual execution steps for each scenario

### 5. Update Agent Context File

Run update script to add new technical context to CLAUDE.md:

```bash
.specify/scripts/bash/update-agent-context.sh claude
```

**Incremental Additions** (preserve existing content):
- **New Tech**: Mastra @mastra/mcp v0.13.5, Mastra tool registry patterns
- **New Services**: documentService, dependencyService, clusteringService
- **New Database**: task_relationships table (migration TBD in Phase 1)
- **Recent Changes**: Add Phase 2 completion after implementation

**Output**: Updated CLAUDE.md in repository root

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. Load `.specify/templates/tasks-template.md` as base template
2. Generate contract test tasks from Phase 1 contracts (5 tools × 1 test = 5 tasks) [P]
3. Generate service creation tasks for NEW services (documentService, dependencyService, clusteringService) - 3 tasks [P]
4. Generate database migration task for task_relationships table (1 task)
5. Generate Mastra tool definition tasks (5 tools × 1 task = 5 tasks, sequential after services)
6. Generate tool registry task (lib/mastra/tools/index.ts export) - 1 task
7. Generate integration test task for end-to-end tool execution flow - 1 task
8. Generate Mastra telemetry configuration task - 1 task
9. Generate rate limiting implementation task (global 10 concurrent limit) - 1 task
10. Generate retry logic task (2 attempts, 2s delay) - 1 task
11. Generate documentation update task (CLAUDE.md via update-agent-context.sh) - 1 task

**Ordering Strategy**:
- **TDD Order**: Contract tests BEFORE tool implementation
- **Dependency Order**:
  1. Database migration (task_relationships table)
  2. Service creation [P] (independent, can parallelize)
  3. Contract tests [P] (independent, can parallelize)
  4. Tool definitions (depend on services)
  5. Tool registry (depends on tool definitions)
  6. Integration tests (depends on tool registry)
  7. Telemetry, rate limiting, retry logic (infrastructure, can parallelize after registry)
  8. Documentation (final step)
- **Parallel Markers**: Mark [P] for independent file creation tasks

**Estimated Output**: 20-25 numbered, ordered tasks in tasks.md

**Vertical Slice Consideration**: While Phase 2 itself violates strict vertical slice architecture (no direct user UI), tasks will be structured to deliver incremental agent capabilities. For example:
- Task 1: Semantic search tool (agent can find tasks)
- Task 2: Document context tool (agent can understand task context)
- Each task enables a new agent reasoning capability

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md scenarios, verify Mastra telemetry)

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Vertical Slice Architecture (Principle VI) | Phase 2 delivers agent-facing tools without direct user UI. This is infrastructure required for Phase 3 agent runtime. | Merging Phase 2 into Phase 3 would create a >2 week task, violating Shape Up appetite constraints. Splitting allows parallel work (tools in Phase 2, agent runtime in Phase 3) and maintains modular architecture (Principle III). User value delivered when Phase 3 connects tools to visible agent reasoning UI. |

**Justification**: Shape Up pitch allocates 1 week for Phase 2 (tool registry) and 1 week for Phase 3 (agent runtime). Attempting to combine both phases would exceed appetite and create a monolithic task. Phase 2 tools are independently testable (Principle IV compliance) and provide clear contracts for Phase 3 integration. This is an acceptable trade-off between Vertical Slice purity and project management pragmatism.

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) - 2025-10-18
- [x] Phase 1: Design complete (/plan command) - 2025-10-18
- [x] Phase 2: Task planning complete (/plan command - describe approach only) - 2025-10-18
- [x] Phase 3: Tasks generated (/tasks command) - 2025-10-18 (12 tasks: 2 setup, 3 services, 5 tools, 2 integration)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: CONDITIONAL PASS (Vertical Slice violation documented)
- [x] Post-Design Constitution Check: PASS (no new violations introduced, design maintains modular architecture and TDD workflow)
- [x] All NEEDS CLARIFICATION resolved (none in Technical Context)
- [x] Complexity deviations documented (Vertical Slice violation justified in Complexity Tracking)

**Artifacts Generated**:
- [x] research.md (44KB) - 7 research topics with implementation guidance
- [x] data-model.md (22KB) - 5 entities with complete SQL migration
- [x] contracts/ (5 JSON files, 28KB total) - All tool schemas with examples
- [x] quickstart.md (29KB) - 5 test scenarios with validation steps

---
*Based on Constitution v1.1.5 - See `.specify/memory/constitution.md`*
