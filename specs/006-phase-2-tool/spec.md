# Feature Specification: Phase 2 - Tool Registry & Execution (Mastra)

**Feature Branch**: `006-phase-2-tool`
**Created**: 2025-10-18
**Status**: Draft
**Input**: User description: "Phase 2 - Tool Registry & Execution (Mastra)"

## Execution Flow (main)
```
1. Parse user description from Input
   → Derived from Shape Up pitch: docs/shape-up-pitches/phase-2-tool-registry.md
2. Extract key concepts from description
   → Actors: AI agent, system users, task documents
   → Actions: Search tasks, query dependencies, analyze relationships, cluster tasks
   → Data: Task embeddings, document context, dependency graph
   → Constraints: 5 tools, <5s execution time, automatic validation
3. For each unclear aspect:
   → Performance benchmarks specified in pitch (95th percentile <5s)
   → Tool selection left to agent runtime (Phase 3 dependency)
4. Fill User Scenarios & Testing section
   → Agent-driven workflows clearly defined
5. Generate Functional Requirements
   → All requirements testable via tool execution traces
6. Identify Key Entities
   → Tools, embeddings, dependencies, clusters
7. Run Review Checklist
   → Spec focuses on tool capabilities, not implementation
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT agents need and WHY
- ❌ Avoid HOW to implement (already defined in pitch with Mastra)
- 👥 Written for business stakeholders, not developers

---

## Clarifications

### Session 2025-10-18
- Q: When a tool execution exceeds the 5-second performance target, what should the system do? → A: Soft warning - Allow execution to complete, log performance degradation, return result with warning flag
- Q: How many retry attempts and what delay strategy should the system use for transient tool failures? → A: 2 retries with fixed 2s delay between attempts (total max 4s additional)
- Q: When a document is deleted while a tool is actively retrieving its data, what should the system do? → A: Return error immediately - Abort execution, return error to agent with clear message about deleted document
- Q: When a document's full markdown content exceeds the agent's available context window, what should the system do? → A: Paginate - Split document into chunks, return first chunk with metadata indicating total chunks available
- Q: Should the system implement rate limiting for concurrent tool executions in P0? → A: Global limits - System-wide limit of 10 concurrent tool executions across all agents

---

## User Scenarios & Testing

### Primary User Story
As an AI agent analyzing tasks across documents, I need to dynamically execute specialized queries to understand relationships, dependencies, and semantic clusters without being limited to my initial context window.

**Example Agent Workflow:**
1. Agent receives query: "Find all revenue-related tasks and check their dependencies"
2. Agent selects `semantic-search` tool to find tasks matching "revenue"
3. Agent receives 10 task IDs with similarity scores
4. Agent selects `query-task-graph` tool to check existing relationships
5. Agent selects `get-document-context` tool to understand task context
6. Agent selects `detect-dependencies` tool to discover new relationships
7. Agent provides comprehensive analysis with dependency map

### Acceptance Scenarios

**Scenario 1: Semantic Task Search**
- **Given** 1000 tasks stored with embeddings across 50 documents
- **When** agent searches for "increase monthly revenue"
- **Then** system returns top 20 semantically similar tasks with similarity scores >0.7
- **And** execution completes in <5 seconds (95th percentile)
- **And** tool execution is logged with input/output/duration

**Scenario 2: Document Context Retrieval**
- **Given** task IDs from search results
- **When** agent requests document context for those tasks
- **Then** system returns full markdown content for parent documents
- **And** includes all tasks within each document
- **And** execution completes in <5 seconds

**Scenario 3: Dependency Detection**
- **Given** a set of task IDs from different documents
- **When** agent requests dependency analysis
- **Then** system analyzes tasks using AI to detect prerequisite/blocking/related relationships
- **And** optionally includes document context in analysis
- **And** returns structured dependency data with relationship types

**Scenario 4: Task Graph Query**
- **Given** existing task relationships in database
- **When** agent queries relationships for a specific task
- **Then** system returns all matching relationships filtered by type (prerequisite/blocks/related/all)
- **And** execution completes in <2 seconds (database query)

**Scenario 5: Similarity Clustering**
- **Given** 50 task IDs from search results
- **When** agent requests clustering by similarity threshold 0.75
- **Then** system groups tasks into hierarchical clusters
- **And** returns cluster count and task distribution
- **And** execution completes in <5 seconds

**Scenario 6: Tool Parameter Validation**
- **Given** agent attempts to call a tool with invalid parameters
- **When** validation occurs before execution
- **Then** system rejects the call with clear error message
- **And** agent receives schema constraints to retry correctly
- **And** no execution is logged (failed validation)

**Scenario 7: Tool Execution Tracing**
- **Given** agent executes any tool successfully
- **When** execution completes
- **Then** system logs tool name, input parameters, output, duration, and status
- **And** trace is available via Mastra telemetry API
- **And** errors include stack traces for debugging

**Scenario 8: Automatic Retry on Transient Errors**
- **Given** a tool execution fails with a transient error (network timeout)
- **When** the system detects the transient failure
- **Then** system retries up to 2 times with 2-second delay between attempts
- **And** each retry attempt is logged with error context and attempt number
- **And** if retry succeeds, result is returned with retry metadata
- **And** if all retries fail, permanent failure is logged and error returned to agent

**Scenario 9: Document Deletion During Tool Execution**
- **Given** agent requests document context for specific task IDs
- **When** referenced document is deleted mid-execution (race condition)
- **Then** tool execution aborts immediately
- **And** system returns error with message: "Document {document_id} was deleted during execution"
- **And** error is logged with document ID and tool context
- **And** no retry is attempted (permanent failure)

**Scenario 10: Document Pagination for Large Context**
- **Given** agent requests document context for a task in a 150,000-character document (exceeds typical context window)
- **When** system detects document exceeds context limit
- **Then** system automatically paginates document into chunks
- **And** returns first chunk with metadata: `{current_chunk: 1, total_chunks: 3, chunk_size: 50000}`
- **And** agent can request subsequent chunks via `chunk_number` parameter
- **And** each chunk overlaps by 200 characters with adjacent chunks for context continuity
- **And** execution completes within 5 seconds

**Scenario 11: Global Rate Limiting Under Load**
- **Given** 15 agents simultaneously request tool executions (exceeds 10 concurrent limit)
- **When** system enforces global rate limit
- **Then** first 10 requests execute immediately
- **And** remaining 5 requests are queued in FIFO order
- **And** queued requests process automatically as execution slots become available
- **And** rate limiting event is logged with queue depth and wait time
- **And** all 15 requests eventually complete successfully

### Edge Cases

**Agent Reasoning Constraints:**
- What happens when semantic search returns 0 results above threshold?
  - Agent receives empty result set with explanation
  - Agent can retry with lower threshold or different query
- What happens when document context exceeds agent's context window?
  - Document is automatically split into paginated chunks
  - First chunk returned with metadata: current_chunk=1, total_chunks=N, chunk_size=X_chars
  - Agent can request additional chunks via chunk_number parameter
  - Each chunk overlaps by 200 characters to preserve context continuity
- What happens when dependency detection finds circular dependencies?
  - System returns all relationships as-is, agent decides how to interpret
- What happens when clustering produces 1 giant cluster?
  - Agent receives cluster data showing low diversity, can adjust threshold
- What happens when a tool execution exceeds 5s performance target?
  - Execution continues to completion (no hard timeout)
  - System logs performance degradation warning
  - Result includes performance_warning flag for agent awareness

**Data Availability:**
- What happens when tasks have no embeddings (pending/failed status)?
  - Semantic search excludes those tasks from results
  - Document context still available via other tools
- What happens when document is deleted during tool execution?
  - Tool execution aborts immediately
  - System returns error to agent with message: "Document {document_id} was deleted during execution"
  - Error is logged with document ID and tool context
  - No retry attempted (permanent failure)

**Concurrent Execution:**
- What happens when multiple agents call tools simultaneously?
  - System handles concurrent requests (no session state)
  - Global rate limit: maximum 10 concurrent tool executions system-wide
  - Additional requests queued in FIFO order when limit reached
  - Queued requests processed automatically as slots become available
  - No per-agent limits (all agents share the global pool)

---

## Requirements

### Functional Requirements

**Core Tool Capabilities:**
- **FR-001**: System MUST provide a `semantic-search` tool that accepts a natural language query and returns tasks with similarity scores above a configurable threshold (default 0.7)
- **FR-002**: System MUST provide a `get-document-context` tool that accepts task IDs and returns full markdown content for parent documents
- **FR-002a**: System MUST automatically paginate large documents when content exceeds context window limits
- **FR-002b**: System MUST support optional chunk_number parameter to retrieve specific pagination chunks
- **FR-002c**: System MUST include pagination metadata in response: current_chunk, total_chunks, chunk_size
- **FR-002d**: System MUST overlap chunks by 200 characters to preserve context continuity across boundaries
- **FR-003**: System MUST provide a `detect-dependencies` tool that analyzes task sets to identify prerequisite, blocking, and related relationships using AI
- **FR-004**: System MUST provide a `query-task-graph` tool that retrieves existing relationships from the database filtered by relationship type
- **FR-005**: System MUST provide a `cluster-by-similarity` tool that groups tasks into hierarchical clusters based on semantic similarity threshold

**Parameter Validation:**
- **FR-006**: System MUST validate all tool parameters against defined schemas before execution
- **FR-007**: System MUST reject tool calls with invalid parameters and provide clear error messages with schema constraints
- **FR-008**: System MUST support optional parameters with documented default values (e.g., limit=20, threshold=0.7)

**Performance & Reliability:**
- **FR-009**: System MUST complete tool executions within 5 seconds at the 95th percentile (performance target, not hard timeout)
- **FR-009a**: System MUST allow tool executions exceeding 5 seconds to complete without aborting
- **FR-009b**: System MUST log performance degradation warnings when executions exceed 5 seconds
- **FR-009c**: System MUST include performance_warning flag in results when execution time exceeds 5 seconds
- **FR-010**: System MUST handle tool execution failures without memory leaks
- **FR-011**: System MUST automatically retry tool executions on transient errors (network timeouts, temporary database unavailability) up to 2 times with 2-second fixed delay between attempts
- **FR-011a**: System MUST fail permanently after 2 retry attempts without further retry (total max 4 seconds additional delay)
- **FR-011b**: System MUST log each retry attempt with error context and attempt number
- **FR-012**: System MUST enforce global rate limit of maximum 10 concurrent tool executions across all agents
- **FR-012a**: System MUST queue tool execution requests exceeding the 10-concurrent limit in FIFO order
- **FR-012b**: System MUST automatically process queued requests as execution slots become available
- **FR-012c**: System MUST NOT implement per-agent rate limits (all agents share global pool)

**Observability:**
- **FR-013**: System MUST log all successful tool executions with tool name, input parameters, output, and duration
- **FR-014**: System MUST log all failed tool executions with error messages and stack traces
- **FR-015**: System MUST expose tool execution traces via Mastra telemetry API
- **FR-016**: System MUST track tool execution metrics (call count, success rate, average duration per tool)
- **FR-017**: System MUST log rate limiting events when tool executions are queued due to concurrency limits

**Agent Integration:**
- **FR-018**: System MUST allow agents to discover available tools automatically (no manual registry lookup)
- **FR-019**: System MUST provide tool descriptions that enable agents to select appropriate tools for reasoning tasks
- **FR-020**: System MUST return tool results in structured format that agents can parse and reason about
- **FR-021**: System MUST NOT require agents to handle tool orchestration (sequencing handled by agent runtime in Phase 3)

**Data Requirements:**
- **FR-022**: Semantic search MUST only return tasks with status='completed' (exclude pending/failed embeddings)
- **FR-023**: Document context MUST include all tasks within retrieved documents (not just requested task IDs)
- **FR-024**: Dependency detection MUST support optional document context inclusion flag
- **FR-025**: Task graph query MUST support filtering by relationship type (prerequisite/blocks/related/all)
- **FR-026**: Clustering MUST return both cluster data and summary statistics (task count, cluster count)
- **FR-027**: System MUST abort tool execution immediately when referenced document is deleted mid-execution
- **FR-027a**: System MUST return clear error message to agent indicating which document was deleted
- **FR-027b**: System MUST log document deletion errors with document ID and tool context (no retry)

**Constraints & Scope:**
- **FR-028**: System MUST support exactly 5 tools (no dynamic tool loading or plugin marketplace)
- **FR-029**: System MUST define tools in code only (no UI builder for tool creation)
- **FR-030**: System MUST NOT implement tool versioning in P0 (breaking changes require new tool ID)
- **FR-031**: System MUST NOT implement per-tool authorization in P0 (single-user system)
- **FR-032**: System MUST NOT implement tool result caching in P0 (execute fresh every time)

### Key Entities

**Tool Definition:**
- Represents a specialized query capability available to agents
- Attributes: unique ID, human-readable description, input schema (Zod), execution function
- Relationships: Tools are stateless, no dependencies between tools
- Lifecycle: Defined at code level, registered automatically by Mastra

**Tool Execution Trace:**
- Represents a single tool invocation by an agent
- Attributes: tool name, input parameters, output data, execution duration, status (success/failure), timestamp, error message (if failed), performance_warning (boolean flag when execution exceeds 5s)
- Relationships: Belongs to agent session (Phase 3 dependency)
- Lifecycle: Created on tool call, persisted to telemetry system, queryable via Mastra API

**Task Embedding:**
- Represents vector embedding for a task (from Phase 1 - Vector Storage)
- Attributes: task ID, task text, document ID, embedding vector (1536 dimensions), status (completed/pending/failed)
- Relationships: Belongs to document, referenced by semantic search tool
- Lifecycle: Created during document processing, used by semantic-search tool, deleted with document

**Task Relationship:**
- Represents a dependency between two tasks
- Attributes: source task ID, target task ID, relationship type (prerequisite/blocks/related), confidence score, detection method (manual/AI)
- Relationships: Links two tasks, optionally references documents
- Lifecycle: Created by detect-dependencies tool or manual input, queried by query-task-graph tool

**Task Cluster:**
- Represents a group of semantically similar tasks
- Attributes: cluster ID, task IDs, similarity threshold, cluster centroid (average embedding)
- Relationships: Contains multiple tasks, no persistence (computed on demand)
- Lifecycle: Generated by cluster-by-similarity tool, returned to agent, not stored

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (Mastra specifics noted in pitch, not spec)
- [x] Focused on agent value and reasoning needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain (all 5 clarifications resolved)
- [x] Requirements are testable via tool execution traces
- [x] Success criteria are measurable (5s performance, logging completeness)
- [x] Scope is clearly bounded (5 tools, no versioning/auth/caching)
- [x] Dependencies identified (Phase 1 vector storage, Phase 3 agent runtime)

**Clarifications Resolved:**
1. ✅ **Tool execution timeout**: Soft warning approach - allow completion, log degradation, include performance_warning flag (Edge case, FR-009)
2. ✅ **Tool retry logic**: 2 retries with fixed 2s delay between attempts, total max 4s additional (FR-011)
3. ✅ **Document deletion during execution**: Abort immediately, return error with deleted document ID (Edge case, FR-027)
4. ✅ **Document context truncation**: Automatic pagination with chunk metadata, 200-character overlap (Edge case, FR-002a-d)
5. ✅ **Tool rate limits**: Global limit of 10 concurrent executions with FIFO queuing (Edge case, FR-012)

---

## Execution Status

- [x] User description parsed (Shape Up pitch)
- [x] Key concepts extracted (tools, agent reasoning, observability)
- [x] Ambiguities marked (5 initial, all 5 resolved via clarification session)
- [x] User scenarios defined (11 acceptance scenarios, 3 edge case categories)
- [x] Requirements generated (46 functional requirements)
- [x] Entities identified (5 key entities)
- [x] Review checklist passed (all clarifications resolved)

---

## Next Steps

1. **Clarify ambiguities** via `/clarify` command or direct stakeholder feedback
2. **Run `/plan`** to generate implementation plan after clarifications resolved
3. **Run `/tasks`** to generate vertical slice task list
4. **Validate against Phase 1** (Vector Storage) to ensure embedding infrastructure is ready
5. **Coordinate with Phase 3** (Agent Runtime) to confirm tool orchestration interface
