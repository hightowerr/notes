# Tasks: Phase 2 - Tool Registry & Execution (Mastra)

**Input**: Design documents from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/006-phase-2-tool/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Execution Flow (Agent-Capability Slices)

```
IMPORTANT CONTEXT: This phase delivers agent-facing infrastructure, not end-user UI.
Vertical slice architecture adapted for agent capabilities:
- Each task enables ONE complete agent reasoning capability
- "User" = AI agent (Phase 3), not human end-user
- Slices deliver: Tool Definition + Service + Data + Testability
- Observable outcome: Agent can execute tool and receive valid response
```

**Special Note**: Phase 2 has a documented constitutional exception (see plan.md Complexity Tracking). While traditional vertical slices require end-user UI, these tasks deliver agent capabilities that enable Phase 3's vertical slices. Each tool task is independently testable via quickstart.md scenarios and contract tests.

---

## Phase 1: Foundation (Database + Configuration)

- [x] T001 [SETUP] Apply database migration for task_relationships table

**Why Needed**: Blocks T006 (detect-dependencies tool) and T007 (query-task-graph tool) which require task_relationships table for storing/querying dependencies.

**Implementation Scope**:
- Copy migration SQL from data-model.md to `supabase/migrations/010_create_task_relationships.sql`
- Apply migration via Supabase Dashboard → SQL Editor
- Verify table creation:
  - Enum types: `relationship_type_enum`, `detection_method_enum`
  - Table: `task_relationships` with 7 indexes
  - Trigger: auto-update `updated_at` timestamp
  - Constraints: unique relationships, no self-references, confidence_score range
- Verify foreign key CASCADE to task_embeddings.task_id

**Validation**:
```sql
-- Verify table exists
SELECT table_name FROM information_schema.tables WHERE table_name = 'task_relationships';
-- Expected: 1 row

-- Verify enum types
SELECT typname FROM pg_type WHERE typname IN ('relationship_type_enum', 'detection_method_enum');
-- Expected: 2 rows

-- Verify indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'task_relationships';
-- Expected: 7 indexes

-- Test constraint: no self-reference
INSERT INTO task_relationships (source_task_id, target_task_id, relationship_type, confidence_score, detection_method)
VALUES ('test_id', 'test_id', 'prerequisite', 0.9, 'ai');
-- Expected: ERROR (constraint violation)
```

**Files Modified**:
- `supabase/migrations/010_create_task_relationships.sql` (create from data-model.md:188-269)

**Dependencies**: None (foundational)

---

- [x] T002 [P] [SETUP] Configure Mastra with telemetry and tool registry

**Why Needed**: Blocks all tool tasks (T003-T012). Establishes Mastra configuration, rate limiting, retry logic, and telemetry before tools can be defined.

**Implementation Scope**:
- Install dependencies: `npm install @mastra/mcp@0.13.5 ml-hclust@3.1.0`
- Create Mastra configuration file `lib/mastra/config.ts`:
  - Telemetry: console logging for P0
  - Tool settings: 10 concurrent limit, 10s timeout, retry policy (2 attempts, 2s delay)
  - Monitoring: log slow executions >5s
- Create tool registry file `lib/mastra/tools/index.ts` (empty initially)
- Create initialization module `lib/mastra/init.ts` with server-side auto-init
- Create verification script `scripts/test-mastra.ts`

**Validation**:
```bash
# Verify dependencies
npm list @mastra/mcp ml-hclust
# Expected: Both packages listed

# Test Mastra setup
npx tsx scripts/test-mastra.ts
# Expected output:
# ✓ Mastra instance created
# ✓ Telemetry enabled: true
# ✓ Registered tools: 0
```

**Files Modified**:
- `package.json` (add dependencies)
- `lib/mastra/config.ts` (create from quickstart.md:35-62)
- `lib/mastra/tools/index.ts` (create from quickstart.md:67-83)
- `lib/mastra/init.ts` (create from quickstart.md:89-107)
- `scripts/test-mastra.ts` (create from quickstart.md:112-133)

**Dependencies**: None (can run parallel with T001)

---

## Phase 2: Service Layer (Backend Logic)

### T003 [x] [P] Create documentService for context retrieval with pagination

**Agent Capability**: Enables agents to retrieve full markdown content and all tasks from documents, with automatic pagination for large documents (>50K chars).

**Implementation Scope**:
- Create `lib/services/documentService.ts` with:
  - `getDocumentsByTaskIds(task_ids: string[], chunk_number?: number): Promise<DocumentContext[]>`
  - Query uploaded_files + processed_documents + task_embeddings (join operation)
  - Implement pagination logic:
    * Chunk size: 50,000 characters
    * Overlap: 200 characters between chunks
    * Metadata: current_chunk, total_chunks, chunk_size, overlap_size
  - Handle edge cases:
    * Document deleted during execution → throw error with document ID
    * No tasks found → return empty tasks_in_document array
    * Chunk number out of range → throw validation error
- Create TypeScript types in `lib/types/mastra.ts`:
  - `DocumentContext`, `PaginationMetadata`
- Write unit test `__tests__/unit/services/documentService.test.ts`:
  - Mock Supabase client
  - Test small document (no pagination)
  - Test large document (pagination metadata present)
  - Test chunk overlap (verify 200 char overlap)
  - Test document deletion error

**Validation**:
```typescript
// Test with real database
const result = await getDocumentsByTaskIds(['task_id_1', 'task_id_2']);
console.log(result[0].document_id); // UUID
console.log(result[0].filename); // String
console.log(result[0].markdown_content.length); // Number
console.log(result[0].tasks_in_document.length); // >= 2 (includes all tasks in doc)
console.log(result[0].pagination_metadata); // null if < 50K chars

// Test unit tests
npm run test:unit -- documentService.test.ts
// Expected: All tests pass
```

**Files Modified**:
- `lib/services/documentService.ts` (create)
- `lib/types/mastra.ts` (create)
- `__tests__/unit/services/documentService.test.ts` (create)

**Dependencies**: T001 (database), T002 (types structure)

---

### T004 [x] [P] Create dependencyService for AI-powered relationship detection

**Agent Capability**: Enables agents to analyze tasks and detect prerequisite, blocking, or related relationships using AI, with confidence scoring.

**Implementation Scope**:
- Create `lib/services/dependencyService.ts` with:
  - `analyzeTaskDependencies(task_ids: string[], options: { includeContext: boolean }): Promise<DependencyAnalysisResult>`
  - Use Vercel AI SDK `generateObject()` with Zod schema for structured output
  - Fetch task texts from task_embeddings table
  - Optionally fetch document context via documentService
  - AI prompt engineering:
    * Detect relationship types: prerequisite, blocks, related
    * Generate confidence scores (0.0-1.0)
    * Provide reasoning for each detected relationship
  - Store detected relationships to task_relationships table
  - Handle errors:
    * OpenAI API unavailable → throw retryable error
    * Invalid task IDs → throw validation error
    * Self-referencing relationships → filter out
- Create TypeScript types in `lib/types/mastra.ts`:
  - `DependencyAnalysisResult`, `TaskDependency`
- Write unit test `__tests__/unit/services/dependencyService.test.ts`:
  - Mock Vercel AI SDK
  - Mock Supabase client
  - Test with 3 tasks (basic case)
  - Test with document context enabled
  - Test filtering of self-references
  - Test database storage
  - Test AI API error handling

**Validation**:
```typescript
// Test with real AI API
const result = await analyzeTaskDependencies(['task1', 'task2', 'task3'], { includeContext: true });
console.log(result.dependencies.length); // >= 0
console.log(result.analyzed_count); // 3
console.log(result.dependencies[0].relationship_type); // 'prerequisite' | 'blocks' | 'related'
console.log(result.dependencies[0].confidence_score); // 0.0-1.0
console.log(result.dependencies[0].reasoning); // String explanation

// Verify database storage
const { data } = await supabase.from('task_relationships')
  .select('*')
  .eq('detection_method', 'ai');
console.log(data.length); // >= 0

// Test unit tests
npm run test:unit -- dependencyService.test.ts
// Expected: All tests pass
```

**Files Modified**:
- `lib/services/dependencyService.ts` (create)
- `lib/types/mastra.ts` (update)
- `__tests__/unit/services/dependencyService.test.ts` (create)

**Dependencies**: T001 (database), T002 (types), T003 (documentService for optional context)

---

### T005 [x] [P] Create clusteringService for similarity-based task grouping

**Agent Capability**: Enables agents to group tasks into semantic clusters using hierarchical clustering algorithm (ml-hclust library).

**Implementation Scope**:
- Create `lib/services/clusteringService.ts` with:
  - `performHierarchicalClustering(task_ids: string[], options: { threshold: number }): Promise<ClusteringResult>`
  - Fetch embeddings from task_embeddings table for given task IDs
  - Use ml-hclust library:
    * Algorithm: Agglomerative hierarchical clustering (AGNES)
    * Linkage: Complete linkage method
    * Distance metric: Cosine distance (1 - cosine similarity)
  - Compute cluster centroid (average embedding for each cluster)
  - Compute average pairwise similarity within clusters
  - Sort clusters by size (descending)
  - Handle edge cases:
    * Insufficient embeddings → throw validation error
    * Invalid threshold → throw validation error
    * Single task → return 1 cluster with similarity 1.0
- Create TypeScript types in `lib/types/mastra.ts`:
  - `ClusteringResult`, `TaskCluster`
- Write unit test `__tests__/unit/services/clusteringService.test.ts`:
  - Mock Supabase client with embedding vectors
  - Test with 10 tasks (basic case)
  - Test cluster size distribution
  - Test centroid dimensions (1536)
  - Test average similarity calculation
  - Test singleton cluster edge case

**Validation**:
```typescript
// Test with real embeddings
const result = await performHierarchicalClustering(['task1', ..., 'task10'], { threshold: 0.75 });
console.log(result.clusters.length); // 2-5 (depends on data)
console.log(result.task_count); // 10
console.log(result.cluster_count); // equals clusters.length
console.log(result.clusters[0].centroid.length); // 1536
console.log(result.clusters[0].average_similarity); // 0.0-1.0

// Verify all tasks accounted for
const allTaskIds = result.clusters.flatMap(c => c.task_ids);
console.log(new Set(allTaskIds).size === 10); // true (no duplicates)

// Test unit tests
npm run test:unit -- clusteringService.test.ts
// Expected: All tests pass
```

**Files Modified**:
- `lib/services/clusteringService.ts` (create)
- `lib/types/mastra.ts` (update)
- `__tests__/unit/services/clusteringService.test.ts` (create)

**Dependencies**: T002 (ml-hclust dependency), types structure

---

## Phase 3: Tool Definitions (Mastra Integration)

- [x] T006 [SLICE] Create semantic-search tool for vector similarity queries

**Agent Capability**: As an agent, I can search for tasks semantically similar to a natural language query and receive ranked results above a confidence threshold.

**Implementation Scope**:
- Create `lib/mastra/tools/semanticSearch.ts` with:
  - Tool definition using Mastra `createTool()` API
  - Tool ID: "semantic-search"
  - Description: LLM-optimized (from contracts/semantic-search.json:3)
  - Input schema: Zod schema for query (string, 1-500 chars), limit (number, 1-100, default 20), threshold (number, 0-1, default 0.7)
  - Execute function:
    * Generate query embedding using `lib/services/embeddingService.ts`
    * Call `lib/services/vectorStorage.ts` searchSimilarTasks()
    * Return tasks array with task_id, task_text, document_id, similarity
    * Echo back query and count
  - Error handling:
    * Threshold out of range → INVALID_THRESHOLD error
    * Embedding API failure → EMBEDDING_SERVICE_UNAVAILABLE (retryable)
    * Database error → DATABASE_ERROR (retryable)
- Write contract test `__tests__/contract/mastra-tools.test.ts`:
  - Validate input schema with Zod (valid/invalid cases)
  - Validate output schema matches contract
  - Mock vectorStorage service
- Write integration test scenario from quickstart.md:262-409

**Test Scenario** (from quickstart.md):
1. Execute: `semanticSearchTool.execute({ query: "increase monthly revenue", limit: 20, threshold: 0.7 })`
2. Verify: Output has tasks array, count, query
3. Verify: All similarity scores >= 0.7
4. Verify: Tasks sorted by similarity descending
5. Verify: Duration < 5000ms (P95 target)
6. Cross-reference: Task IDs exist in task_embeddings table

**Files Modified**:
- `lib/mastra/tools/semanticSearch.ts` (create)
- `lib/mastra/tools/index.ts` (export semanticSearchTool)
- `__tests__/contract/mastra-tools.test.ts` (create with semantic-search tests)

**Dependencies**: T002 (Mastra config), existing embeddingService, existing vectorStorage

---

### T007 [x] [SLICE] Create get-document-context tool for markdown retrieval

**Agent Capability**: As an agent, I can retrieve full markdown content and all tasks for documents containing specific task IDs, with automatic pagination for large documents.

**Implementation Scope**:
- Create `lib/mastra/tools/getDocumentContext.ts` with:
  - Tool definition using Mastra `createTool()` API
  - Tool ID: "get-document-context"
  - Description: LLM-optimized (from contracts/get-document-context.json:3)
  - Input schema: Zod schema for task_ids (string array), chunk_number (optional number)
  - Execute function:
    * Call documentService.getDocumentsByTaskIds()
    * Return documents array with document_id, filename, markdown, tasks_in_document, pagination_metadata
  - Error handling:
    * Document deleted → DOCUMENT_DELETED error (non-retryable)
    * Task not found → TASK_NOT_FOUND error
- Write contract test in `__tests__/contract/mastra-tools.test.ts`:
  - Validate input/output schemas
  - Test pagination metadata structure
  - Mock documentService
- Write integration test scenario from quickstart.md:413-563

**Test Scenario** (from quickstart.md):
1. Execute: `getDocumentContextTool.execute({ task_ids: ['task1', 'task2'] })`
2. Verify: Output has documents array
3. Verify: All requested task IDs appear in tasks_in_document
4. Verify: Markdown content non-empty
5. Verify: Pagination metadata present if markdown > 50K chars
6. Test pagination: Request chunk 2, verify 200-char overlap

**Files Modified**:
- `lib/mastra/tools/getDocumentContext.ts` (create)
- `lib/mastra/tools/index.ts` (update export)
- `__tests__/contract/mastra-tools.test.ts` (add get-document-context tests)

**Dependencies**: T002 (Mastra), T003 (documentService)

---

### T008 [x] [SLICE] Create detect-dependencies tool for AI relationship analysis

**Agent Capability**: As an agent, I can analyze a set of tasks to detect prerequisite, blocking, or related relationships using AI, and have those relationships stored for future queries.

**Implementation Scope**:
- Create `lib/mastra/tools/detectDependencies.ts` with:
  - Tool definition using Mastra `createTool()` API
  - Tool ID: "detect-dependencies"
  - Description: LLM-optimized (from contracts/detect-dependencies.json:3)
  - Input schema: Zod schema for task_ids (string array), use_document_context (boolean, default true)
  - Execute function:
    * Call dependencyService.analyzeTaskDependencies()
    * Return dependencies array with source_task_id, target_task_id, relationship_type, confidence_score, detection_method, reasoning
    * Return analyzed_count and context_included flag
  - Error handling:
    * AI API unavailable → AI_SERVICE_UNAVAILABLE (retryable)
    * Invalid task IDs → INVALID_TASK_IDS error
- Write contract test in `__tests__/contract/mastra-tools.test.ts`:
  - Validate input/output schemas
  - Test relationship_type enum values
  - Mock dependencyService
- Write integration test scenario from quickstart.md:567-705

**Test Scenario** (from quickstart.md):
1. Execute: `detectDependenciesTool.execute({ task_ids: ['task1', 'task2', 'task3'], use_document_context: true })`
2. Verify: Output has dependencies array
3. Verify: All relationship_type values valid (prerequisite/blocks/related)
4. Verify: All confidence_score 0.0-1.0
5. Verify: No self-referencing relationships
6. Verify: Relationships stored in task_relationships table
7. Verify: Duration < 5000ms (P95 target, includes AI call)

**Files Modified**:
- `lib/mastra/tools/detectDependencies.ts` (create)
- `lib/mastra/tools/index.ts` (update export)
- `__tests__/contract/mastra-tools.test.ts` (add detect-dependencies tests)

**Dependencies**: T001 (database), T002 (Mastra), T004 (dependencyService)

---

### T009 [x] [SLICE] Create query-task-graph tool for database relationship lookups

**Agent Capability**: As an agent, I can query existing task relationships from the database, filtered by relationship type (prerequisite/blocks/related/all).

**Implementation Scope**:
- Create `lib/mastra/tools/queryTaskGraph.ts` with:
  - Tool definition using Mastra `createTool()` API
  - Tool ID: "query-task-graph"
  - Description: LLM-optimized (from contracts/query-task-graph.json:3)
  - Input schema: Zod schema for task_id (string), relationship_type (enum: prerequisite/blocks/related/all, optional)
  - Execute function:
    * Query task_relationships table via Supabase client
    * Filter by source_task_id OR target_task_id (bidirectional)
    * Apply relationship_type filter if not 'all'
    * Return relationships array with source_task_id, target_task_id, relationship_type, confidence_score, detection_method
    * Return task_id and filter_applied
  - Error handling:
    * Task not found → TASK_NOT_FOUND error
    * Database error → DATABASE_ERROR (retryable)
- Write contract test in `__tests__/contract/mastra-tools.test.ts`:
  - Validate input/output schemas
  - Test relationship_type filtering
  - Mock Supabase client
- Write integration test scenario from quickstart.md:709-868

**Test Scenario** (from quickstart.md):
1. Setup: Insert test relationships into task_relationships table
2. Execute: `queryTaskGraphTool.execute({ task_id: 'task1', relationship_type: 'all' })`
3. Verify: Output has relationships array
4. Verify: Includes both source and target relationships (bidirectional)
5. Execute: Filter by relationship_type: 'prerequisite'
6. Verify: Only prerequisite relationships returned
7. Verify: Duration < 2000ms (database query, no AI)
8. Cleanup: Delete test relationships

**Files Modified**:
- `lib/mastra/tools/queryTaskGraph.ts` (create)
- `lib/mastra/tools/index.ts` (update export)
- `__tests__/contract/mastra-tools.test.ts` (add query-task-graph tests)

**Dependencies**: T001 (database), T002 (Mastra)

---

### T010 [x] [SLICE] Create cluster-by-similarity tool for task grouping

**Agent Capability**: As an agent, I can group tasks into semantic clusters based on similarity threshold to identify conceptually related tasks without explicit links.

**Implementation Scope**:
- Create `lib/mastra/tools/clusterBySimilarity.ts` with:
  - Tool definition using Mastra `createTool()` API
  - Tool ID: "cluster-by-similarity"
  - Description: LLM-optimized (from contracts/cluster-by-similarity.json:3)
  - Input schema: Zod schema for task_ids (string array), similarity_threshold (number, 0-1, default 0.75)
  - Execute function:
    * Call clusteringService.performHierarchicalClustering()
    * Return clusters array with cluster_id, task_ids, centroid, average_similarity
    * Return task_count, cluster_count, threshold_used
  - Error handling:
    * Insufficient embeddings → INSUFFICIENT_EMBEDDINGS error
    * Invalid threshold → INVALID_THRESHOLD error
- Write contract test in `__tests__/contract/mastra-tools.test.ts`:
  - Validate input/output schemas
  - Test centroid dimensions (1536)
  - Mock clusteringService
- Write integration test scenario from quickstart.md:872-1029

**Test Scenario** (from quickstart.md):
1. Setup: Select 10 tasks with diverse topics from database
2. Execute: `clusterBySimilarityTool.execute({ task_ids: ['task1', ..., 'task10'], similarity_threshold: 0.75 })`
3. Verify: Output has clusters array
4. Verify: task_count === 10
5. Verify: All input task IDs appear in exactly one cluster
6. Verify: Centroid vectors have 1536 dimensions
7. Verify: Average similarity valid (0.0-1.0)
8. Verify: Duration < 5000ms (P95 target)
9. Manual review: Tasks within clusters share semantic themes

**Files Modified**:
- `lib/mastra/tools/clusterBySimilarity.ts` (create)
- `lib/mastra/tools/index.ts` (update export)
- `__tests__/contract/mastra-tools.test.ts` (add cluster-by-similarity tests)

**Dependencies**: T002 (Mastra), T005 (clusteringService)

---

## Phase 4: Integration & Validation

### T011 [x] [SLICE] Register all tools with Mastra and verify telemetry

**Agent Capability**: All 5 tools are registered with Mastra, automatically validated, and execution telemetry is logged.

**Implementation Scope**:
- Update `lib/mastra/tools/index.ts`:
  - Import all 5 tools: semanticSearchTool, getDocumentContextTool, detectDependenciesTool, queryTaskGraphTool, clusterBySimilarityTool
  - Export agentTools array with all 5 tools
- Update `lib/mastra/init.ts`:
  - Verify tool registration loop works correctly
  - Verify server-side initialization (typeof window === 'undefined')
- Create integration test `__tests__/integration/tool-execution.test.ts`:
  - Test Mastra instance has 5 registered tools
  - Test each tool is callable via Mastra
  - Test telemetry logging (mock Mastra telemetry API)
  - Test tool execution traces include: tool_name, input_params, output_data, duration_ms, status
  - Test performance_warning flag set when execution > 5000ms
- Run verification script from quickstart.md:112-144

**Test Scenario**:
1. Run: `npx tsx scripts/test-mastra.ts`
2. Verify: Output shows "Registered tools: 5"
3. Execute one tool via Mastra: `mastra.tools['semantic-search'].execute({ query: 'test' })`
4. Query telemetry: Check execution trace logged
5. Verify trace has: tool_name, input_params, output_data, duration_ms, status, performance_warning

**Validation**:
```bash
# Verify all tools registered
npm run dev
# Check console logs for: "[Mastra] Initialized with 5 tools"

# Run integration tests
npm run test:integration -- tool-execution.test.ts
# Expected: All tests pass
```

**Files Modified**:
- `lib/mastra/tools/index.ts` (update exports)
- `lib/mastra/init.ts` (verify registration logic)
- `__tests__/integration/tool-execution.test.ts` (create)

**Dependencies**: T002 (Mastra config), T006-T010 (all 5 tools)

---

### T012 [SLICE] End-to-end validation with quickstart scenarios

**Agent Capability**: All 5 tools execute correctly in production-like scenarios with real data, matching contract specifications and performance targets.

**Implementation Scope**:
- Create manual test suite documentation in quickstart.md (already exists)
- Execute all 5 quickstart scenarios manually:
  - Scenario 1: Semantic search for revenue tasks (quickstart.md:262-409)
  - Scenario 2: Document context retrieval (quickstart.md:413-563)
  - Scenario 3: Dependency detection (quickstart.md:567-705)
  - Scenario 4: Task graph query (quickstart.md:709-868)
  - Scenario 5: Similarity clustering (quickstart.md:872-1029)
- Document test results in `specs/006-phase-2-tool/test-results.md`:
  - Each scenario: Pass/Fail status
  - Performance metrics (P50, P95 latency)
  - Schema validation results
  - Error handling verification
  - Cross-reference validation (database consistency)
- Run performance validation (quickstart.md:1033-1081):
  - Test all tools under load (100 iterations)
  - Calculate P95 latency for each tool
  - Verify all tools < 5000ms P95 target
- Run error scenario tests (quickstart.md:1085-1130):
  - Invalid threshold
  - Missing required fields
  - Task not found
- Verify telemetry (quickstart.md:1134-1187):
  - Check execution traces for all tool calls
  - Verify performance_warning flag logic

**Validation Checklist** (from quickstart.md:1190-1214):
```
- [ ] All 5 tools execute without errors
- [ ] All tool outputs match contract schemas
- [ ] All tools complete within P95 < 5s target
- [ ] Schema validation passes for all outputs
- [ ] Database migration 010 applied successfully
- [ ] Task relationships stored correctly in database
- [ ] Clustering produces semantically coherent groups
- [ ] Dependency detection returns logical relationships
- [ ] Error scenarios handled gracefully
- [ ] Mastra telemetry logs all executions
- [ ] Performance degradation warnings logged for slow executions
- [ ] Retry logic tested (simulate transient errors)
- [ ] Document pagination works for >50K char documents
- [ ] All cross-references in data-model.md valid
```

**Test Scenario**:
1. Apply database migration (T001 verification)
2. Verify Mastra setup (T002 verification)
3. Upload 20 test documents with embeddings (prerequisite data)
4. Execute each quickstart scenario (1-5) manually
5. Document results and performance metrics
6. Run performance load test
7. Test error scenarios
8. Verify telemetry logging

**Files Modified**:
- `specs/006-phase-2-tool/test-results.md` (create)
- No code changes (validation only)

**Dependencies**: T001-T011 (all previous tasks)

---

## Dependencies

```
Foundation Layer:
T001 [SETUP] Database migration → (blocks) → T008, T009
T002 [P] [SETUP] Mastra config → (blocks) → T006-T011

Service Layer (can parallelize):
T003 [P] documentService → (blocks) → T007
T004 [P] dependencyService → (blocks) → T008
T005 [P] clusteringService → (blocks) → T010

Tool Layer (sequential, depends on services):
T006 [SLICE] semantic-search → (enables) → T011
T007 [SLICE] get-document-context → (enables) → T011
T008 [SLICE] detect-dependencies → (enables) → T011
T009 [SLICE] query-task-graph → (enables) → T011
T010 [SLICE] cluster-by-similarity → (enables) → T011

Integration Layer:
T011 [SLICE] Tool registry → (blocks) → T012
T012 [SLICE] End-to-end validation → (completes Phase 2)
```

**Parallel Execution Opportunities**:
- T001 + T002 can run in parallel (independent setup)
- T003 + T004 + T005 can run in parallel after T001 + T002 (independent services)
- T006-T010 must run sequentially or carefully parallelized (all modify lib/mastra/tools/index.ts)

**Critical Path**:
T002 → T003 → T007 → T011 → T012 (longest dependency chain, ~5 tasks)

---

## Parallel Execution Example

```bash
# Step 1: Foundation (parallel)
Task: "Implement T001 [SETUP] Database migration"
Task: "Implement T002 [SETUP] Mastra configuration"

# Step 2: Service layer (parallel after Step 1)
Task: "Implement T003 documentService"
Task: "Implement T004 dependencyService"
Task: "Implement T005 clusteringService"

# Step 3: Tool layer (sequential to avoid merge conflicts)
Task: "Implement T006 semantic-search tool"
Task: "Implement T007 get-document-context tool"
Task: "Implement T008 detect-dependencies tool"
Task: "Implement T009 query-task-graph tool"
Task: "Implement T010 cluster-by-similarity tool"

# Step 4: Integration (sequential)
Task: "Implement T011 Tool registry"
Task: "Implement T012 End-to-end validation"
```

---

## Notes

**Vertical Slice Adaptation for Agent-Facing Tools**:
- **Traditional Slice**: User UI → Backend → Data → User Feedback
- **Agent Slice**: Tool Definition → Service → Data → Agent Response
- **Observable Outcome**: Agent receives valid response matching contract schema
- **Test Scenario**: Executable via quickstart.md manual tests or contract tests
- **User Value**: Each tool enables new agent reasoning capability (Phase 3 dependency)

**Constitutional Exception** (from plan.md Complexity Tracking):
> Phase 2 delivers agent-facing tools without direct user UI. This is infrastructure required for Phase 3 agent runtime. Merging Phase 2 into Phase 3 would create a >2 week task, violating Shape Up appetite constraints. Splitting allows parallel work (tools in Phase 2, agent runtime in Phase 3) and maintains modular architecture (Principle III). User value delivered when Phase 3 connects tools to visible agent reasoning UI.

**TDD Workflow**:
1. Write contract tests FIRST (validates input/output schemas)
2. Implement service layer (with unit tests)
3. Implement tool definition (connects service to Mastra)
4. Run integration tests (verifies end-to-end)
5. Execute quickstart scenarios (manual validation)

**Performance Targets** (FR-009):
- P95 latency: <5000ms for all tools
- Soft timeout: Executions can exceed 5s (no hard cutoff)
- Performance warning: Flag set automatically if >5s

**Rate Limiting** (FR-012):
- Global limit: 10 concurrent tool executions across all agents
- Queue: FIFO when limit exceeded
- Implementation: p-limit library (already in package.json)

**Retry Logic** (FR-011):
- Max attempts: 2 retries (3 total attempts)
- Delay: Fixed 2 seconds between retries
- Retryable errors: NETWORK_TIMEOUT, DATABASE_UNAVAILABLE, RATE_LIMIT, EMBEDDING_SERVICE_UNAVAILABLE

---

## Validation Checklist

*Verify before marking Phase 2 complete*

- [x] Every task delivers a complete agent capability (Tool + Service + Data + Test)
- [x] Every task has a test scenario (from quickstart.md or contract tests)
- [x] Setup tasks minimal and justified (T001, T002 block multiple slices)
- [x] Tasks ordered by dependency, not technical layers
- [x] Parallel tasks operate on independent files (T003-T005 services)
- [x] Each task specifies exact file paths to modify
- [x] Constitutional exception documented (agent-facing tools, not end-user UI)
- [x] TDD workflow established (contract tests before implementation)
- [x] Performance targets specified (P95 <5s)
- [x] Error handling defined (retry logic, error codes)

---

**Last Updated**: 2025-10-18
**Next Steps**: Execute tasks in dependency order, validate with quickstart.md scenarios
