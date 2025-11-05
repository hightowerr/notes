# Tasks: Vector Storage Foundation for Task Embeddings

**Input**: Design documents from `/specs/005-docs-shape-up/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Feature Overview

Build vector embedding infrastructure to enable sub-500ms semantic search of tasks. During document processing, the system automatically generates and stores 1536-dimension embeddings for each extracted task. Phase 1 focuses on embedding generation pipeline, storage with pgvector in Supabase, and basic similarity search capability.

**Tech Stack**: Next.js 15, TypeScript, OpenAI text-embedding-3-small, Supabase pgvector
**Performance Goal**: <500ms semantic search, <2s additional embedding generation time
**Scale Target**: 10,000 total tasks across all documents (P0)

---

## Phase 0: Database Foundation (Sequential)

### T020 [X] [SETUP] Enable pgvector extension and create task_embeddings table

**Why Needed**: Blocks ALL subsequent tasks - vector storage infrastructure required for embedding generation and search

**Implementation Scope**:
- **Database**: Apply migrations to Supabase
  - Migration 007: Enable pgvector extension (`CREATE EXTENSION IF NOT EXISTS vector`)
  - Migration 008: Create `task_embeddings` table with vector(1536) column
    * Fields: id, task_id (unique), task_text, document_id (FK), embedding, status, error_message, timestamps
    * Indexes: task_id (unique), document_id (FK), status (partial)
    * Trigger: auto-update `updated_at` on modification
  - Migration 009: Create `search_similar_tasks()` RPC function
    * Parameters: query_embedding, match_threshold (default 0.7), match_count (default 20)
    * Returns: task_id, task_text, document_id, similarity (sorted by cosine distance)
- **Validation**: Run quickstart Scenario 5 (database queries)
  - Verify table structure: `\d task_embeddings` in psql
  - Test RPC function with dummy embedding
  - Verify CASCADE delete works (delete test document → embeddings auto-deleted)

**Test Scenario**:
1. Apply migration 007 via Supabase Dashboard SQL Editor
2. Apply migration 008 (table creation)
3. Apply migration 009 (RPC function)
4. Run: `SELECT * FROM task_embeddings LIMIT 1;` (should return no rows)
5. Test RPC: `SELECT * FROM search_similar_tasks(array_fill(0.0, ARRAY[1536])::vector(1536), 0.7, 20);`
6. Verify function returns empty result set (no embeddings yet)

**Files Modified**:
- `supabase/migrations/007_enable_pgvector.sql` (create)
- `supabase/migrations/008_create_task_embeddings.sql` (create)
- `supabase/migrations/009_create_search_function.sql` (create)

**Acceptance Criteria**:
- ✅ pgvector extension enabled
- ✅ task_embeddings table exists with correct schema
- ✅ IVFFlat index created (lists=100)
- ✅ search_similar_tasks() RPC function callable
- ✅ CASCADE delete constraint works

---

## Phase 1: Schema & Type Definitions (Parallel - After T020)

### T021 [X] [SETUP] Create Zod schemas for embedding API requests and responses

**Why Needed**: Required for T023, T024 - type safety and validation for embedding service

**Implementation Scope**:
- **Schemas**: Create `lib/schemas/embeddingSchema.ts`
  - `EmbeddingStatusSchema`: enum ('completed', 'pending', 'failed')
  - `TaskEmbeddingSchema`: Complete entity (id, task_id, task_text, document_id, embedding[1536], status, error_message, timestamps)
  - `SimilaritySearchRequestSchema`: query (string), limit (int, default 20), threshold (float, default 0.7)
  - `SimilaritySearchResultSchema`: task_id, task_text, document_id, similarity (0-1)
  - `SimilaritySearchResponseSchema`: tasks (array), query (string), count (int)
- **Validation**: Export schemas for use in API routes and services
- **Error Messages**: Descriptive validation errors for malformed requests

**Test Scenario** (Unit tests for schema validation):
1. Create test file `__tests__/schemas/embeddingSchema.test.ts`
2. Test valid search request: `{ query: "test", limit: 20, threshold: 0.7 }`
3. Test invalid requests: empty query, threshold >1, negative limit
4. Verify error messages are descriptive
5. Test embedding array length validation (must be exactly 1536)

**Files Modified**:
- `lib/schemas/embeddingSchema.ts` (create)
- `__tests__/schemas/embeddingSchema.test.ts` (create)

**Acceptance Criteria**:
- ✅ All Zod schemas defined with correct types
- ✅ Validation tests pass for valid inputs
- ✅ Validation tests fail with clear messages for invalid inputs
- ✅ Embedding array length enforced (1536 dimensions)

---

### T022 [X] [SETUP] Create TypeScript types for task embeddings

**Why Needed**: Required for T023, T024 - type definitions for service layer and database operations

**Implementation Scope**:
- **Types**: Create `lib/types/embedding.ts`
  - `TaskEmbedding`: Database entity type (matches task_embeddings table)
  - `TaskEmbeddingInsert`: Insert payload type (excludes id, timestamps)
  - `SimilaritySearchResult`: Search result type
  - `EmbeddingGenerationResult`: Service result type (task_id, status, embedding, error_message)
  - `EmbeddingStatus`: Type alias for status enum
- **Exports**: Export all types for use across codebase

**Test Scenario** (Type checking tests - compile-time validation):
1. Import types in test file
2. Create mock objects matching each type
3. Verify TypeScript compiler accepts valid objects
4. Verify TypeScript compiler rejects invalid objects (wrong field types)

**Files Modified**:
- `lib/types/embedding.ts` (create)
- `__tests__/types/embedding.test.ts` (create - type checking tests)

**Acceptance Criteria**:
- ✅ All TypeScript types defined
- ✅ Types align with database schema
- ✅ Types align with Zod schemas
- ✅ Type checking tests pass

---

## Phase 2: Service Layer (Sequential - After T021, T022)

### T023 [X] [SLICE] System generates embeddings for tasks during document processing

**User Story**: As the system, when a document finishes processing, I automatically generate and store embeddings for all extracted tasks so users can perform fast semantic searches later

**Implementation Scope**:
- **Service**: Create `lib/services/embeddingService.ts`
  - `generateEmbedding(text: string)`: Call OpenAI text-embedding-3-small via Vercel AI SDK
    * Use `embed()` function from `ai` package
    * Return 1536-dimension array
    * Handle API errors (timeout, rate limit, invalid response)
  - `generateBatchEmbeddings(tasks: Task[])`: Batch processing with Promise.all
    * Process up to 50 tasks per batch
    * Individual error handling per task
    * Return array of results with status (completed/failed/pending)
  - Error handling: Log failures, mark status appropriately, continue processing
- **Storage**: Create `lib/services/vectorStorage.ts`
  - `storeEmbeddings(embeddings: TaskEmbeddingInsert[])`: Bulk insert to task_embeddings table
    * Use Supabase client
    * Handle conflicts (duplicate task_id)
    * Return success/failure counts
  - `getEmbeddingsByDocumentId(documentId: string)`: Query embeddings for document
  - `deleteEmbeddingsByDocumentId(documentId: string)`: Manual cleanup (CASCADE handles automatic)
- **Integration**: Update `lib/services/aiSummarizer.ts`
  - After extracting tasks, call `embeddingService.generateBatchEmbeddings()`
  - Store results via `vectorStorage.storeEmbeddings()`
  - Update document status to include embeddings_status field
  - Graceful degradation: If embedding fails, mark document "completed" with embeddings "pending"
- **Feedback**: Console logs show embedding generation progress
  - "Generating embeddings for 20 tasks (document: abc123...)"
  - "Batch 1/1: Generated 20 embeddings in 3.2s"
  - "Stored 18 completed, 2 pending embeddings"

**Test Scenario** (Quickstart Scenario 1):
1. Upload test document with 20 tasks via existing upload flow
2. Monitor console logs for embedding generation messages
3. Wait for document processing to complete (~10 seconds)
4. Query database: `SELECT count(*), status FROM task_embeddings WHERE document_id = '{fileId}' GROUP BY status;`
5. Verify 20 embeddings with status 'completed' exist
6. Check each embedding has exactly 1536 dimensions
7. Verify processing time increased by <2 seconds (FR-016)

**Files Modified**:
- `lib/services/embeddingService.ts` (create)
- `lib/services/vectorStorage.ts` (create)
- `lib/services/aiSummarizer.ts` (modify - integrate embedding generation)
- `__tests__/integration/embedding-generation.test.ts` (create)

**Acceptance Criteria**:
- ✅ Embeddings auto-generated during document processing (FR-001)
- ✅ All embeddings stored with correct metadata (FR-002)
- ✅ Processing time adds <2s (FR-016)
- ✅ Graceful degradation on API failure (FR-024)
- ✅ Individual task failures don't block batch (FR-025)
- ✅ Errors logged with context (FR-026, FR-028)

---

## Phase 3: API Implementation & Search (Sequential - After T023)

### T024 [X] [SLICE] Users can search for tasks semantically similar to a query

**User Story**: As a user (or system), when I search for tasks semantically similar to a query string (e.g., "increase monthly revenue"), I receive ranked results based on vector similarity within 500ms

**Implementation Scope**:
- **Backend**: Create `app/api/embeddings/search/route.ts` (POST endpoint)
  - Accept request: `{ query: string, limit?: number, threshold?: number }`
  - Validate with `SimilaritySearchRequestSchema`
  - Generate query embedding via `embeddingService.generateEmbedding(query)`
  - Call Supabase RPC: `search_similar_tasks(query_embedding, threshold, limit)`
  - Return response: `{ tasks: SimilaritySearchResult[], query: string, count: number }`
  - Error handling:
    * 400: Invalid request (empty query, invalid threshold/limit)
    * 500: Embedding generation failed
    * 503: Embedding service unavailable
- **Service**: Add `searchSimilarTasks()` to `lib/services/vectorStorage.ts`
  - Call RPC function via Supabase client
  - Map results to `SimilaritySearchResult[]`
  - Filter: only return tasks with status='completed'
  - Sort: by similarity score descending
- **Feedback**: API returns JSON with ranked results and similarity scores
  - Empty array if no results above threshold
  - Echo query back for context
  - Include count of results

**Test Scenario** (Quickstart Scenario 2):
1. Ensure 200 tasks with embeddings exist (upload 10 documents)
2. Verify database: `SELECT count(*) FROM task_embeddings WHERE status='completed';` (expect ≥200)
3. Make API request: `POST /api/embeddings/search` with body `{ "query": "increase monthly revenue", "limit": 20, "threshold": 0.7 }`
4. Measure response time with `time curl ...` (must be <500ms)
5. Verify response structure matches schema
6. Verify all similarity scores >0.7 threshold
7. Verify results sorted by similarity (descending)
8. Check top result is semantically relevant to query


**Files Modified**:
- `app/api/embeddings/search/route.ts` (create)
- `lib/services/vectorStorage.ts` (modify - add searchSimilarTasks)
- `__tests__/contract/embeddings-search.test.ts` (create)

**Acceptance Criteria**:
- ✅ Search endpoint returns results <500ms (FR-015)
- ✅ Results ranked by similarity score (FR-007)
- ✅ Threshold filtering works (FR-008)
- ✅ Limit enforced (FR-009)
- ✅ All required fields present in results (FR-010)
- ✅ Only completed embeddings included in search (FR-024)
- ✅ Errors handled gracefully (FR-027, FR-028)

---

## Phase 4: Error Handling & Graceful Degradation (Parallel - After T023, T024)

### T025 [X] [SLICE] System handles embedding API failures gracefully without blocking documents

**User Story**: As the system, when the OpenAI embedding API is unavailable during document processing, I mark the document as "completed" with embeddings as "pending" so users can access the document immediately while embeddings remain retrievable later

**Implementation Scope**:
- **Service**: Update `lib/services/embeddingService.ts`
  - Add timeout handling (10s timeout for embedding generation)
  - On timeout/failure: Return status 'pending' with error message
  - Log error with context (document_id, task_id, timestamp, error message)
- **Database**: Embeddings stored with status='pending' and error_message populated
- **Integration**: Update `lib/services/aiSummarizer.ts`
  - On embedding failure: Mark document status='completed', embeddings_status='pending'
  - Document remains fully usable (summary displayed)
  - Tasks with pending embeddings excluded from search
- **Feedback**: Status API returns `embeddings_status` field
  - `"completed"`: All embeddings generated successfully
  - `"pending"`: Some/all embeddings failed, document usable
  - `"failed"`: Critical error (rare, document unusable)

**Test Scenario** (Quickstart Scenario 3):
1. Simulate OpenAI API unavailability: `unset OPENAI_API_KEY`
2. Upload document with 10 tasks
3. Wait for processing to complete
4. Query status API: `GET /api/status/{fileId}`
5. Verify response: `status='completed'`, `embeddings_status='pending'`
6. Query database: `SELECT status, error_message FROM task_embeddings WHERE document_id='{fileId}';`
7. Verify all tasks have status='pending' with error message
8. Attempt search: Verify pending tasks NOT included in results
9. Restore API key, verify embeddings remain pending (no automatic retry per FR-031)

**Files Modified**:
- `lib/services/embeddingService.ts` (modify - add timeout and error handling)
- `lib/services/aiSummarizer.ts` (modify - graceful degradation logic)
- `app/api/status/[fileId]/route.ts` (modify - add embeddings_status field)
- `__tests__/integration/embedding-failure.test.ts` (create)

**Acceptance Criteria**:
- ✅ Document marked "completed" despite embedding failure (FR-024)
- ✅ Embeddings marked "pending" with error message (FR-025, FR-028)
- ✅ Pending tasks excluded from search (FR-024)
- ✅ Errors logged with full context (FR-026, FR-027, FR-028)
- ✅ No automatic retry (FR-031)

---

### T026 [X] [SLICE] System queues embedding requests to prevent API rate limiting

**User Story**: As the system, when multiple documents are uploaded concurrently, I process embedding requests at a controlled rate to avoid hitting OpenAI API rate limits while maintaining throughput

**Implementation Scope**:
- **Queue**: Create `lib/services/embeddingQueue.ts`
  - In-memory queue using `p-limit` library (max 3 concurrent document processing jobs)
  - Each document processes its tasks serially in batches of 50
  - Queue interface: `enqueue(tasks: Task[], documentId: string): Promise<void>`
  - Track queue depth for monitoring
- **Integration**: Update `lib/services/aiSummarizer.ts`
  - Enqueue embedding generation instead of direct call
  - Queue returns promise that resolves when batch completes
  - Log queue metrics: "Enqueued 20 tasks (queue depth: 40)"
- **Monitoring**: Console logs show queue processing
  - "Processing batch 1/2 (50 tasks)"
  - "Batch 1 complete (3.5s)"

**Test Scenario** (Quickstart Scenario 4):
1. Upload 5 documents concurrently (20 tasks each = 100 total)
2. Monitor console logs for queue messages
3. Verify queue processes batches at controlled rate
4. Check for OpenAI rate limit errors: `grep "rate_limit_exceeded" logs/error.log` (expect none)
5. Query database: `SELECT count(*), status FROM task_embeddings WHERE created_at > NOW() - INTERVAL '5 minutes' GROUP BY status;`
6. Verify all 100 tasks completed successfully

**Files Modified**:
- `lib/services/embeddingQueue.ts` (create)
- `lib/services/aiSummarizer.ts` (modify - integrate queue)
- `package.json` (add p-limit dependency)
- `__tests__/integration/embedding-queue.test.ts` (create)

**Acceptance Criteria**:
- ✅ All tasks processed successfully without rate limiting (FR-029)
- ✅ Concurrent uploads handled without conflicts (FR-030)
- ✅ Queue processes at controlled rate (batches of 50)
- ✅ No rate limit errors from OpenAI API

---

## Phase 5: Validation & Documentation (Sequential - After All Above)

### T027 [X] [POLISH] Run all quickstart scenarios and verify requirements met

**Enhancement to**: Complete feature validation

**Implementation Scope**:
- **Testing**: Execute quickstart.md scenarios 1-5
  - Scenario 1: Auto-generate embeddings (20 tasks <2s)
  - Scenario 2: Semantic search (<500ms, 200 tasks)
  - Scenario 3: Graceful degradation (API unavailable)
  - Scenario 4: Queue rate limiting (5 concurrent uploads)
  - Scenario 5: Cascade delete (embeddings auto-deleted)
- **Performance**: Load test with 10,000 embeddings
  - Upload 50 documents × 200 tasks each
  - Verify search still <500ms at scale (FR-017)
  - Check storage size <10KB per embedding (FR-023)
- **Documentation**: Create testing checklist
  - Mark each scenario pass/fail
  - Document any edge cases discovered
  - Note performance metrics

**Test Scenario**:
1. Follow quickstart.md step-by-step for scenarios 1-5
2. Run performance validation (10K embeddings)
3. Check database size: `SELECT pg_size_pretty(pg_total_relation_size('task_embeddings'));`
4. Document results in test report

**Files Modified**:
- `specs/005-docs-shape-up/test-results.md` (create)

**Acceptance Criteria**:
- ✅ All quickstart scenarios pass
- ✅ Search <500ms at 10K scale (FR-017)
- ✅ Storage <10KB per embedding (FR-023)

---

### T028 [X] [POLISH] Update CLAUDE.md with embedding patterns and troubleshooting

**Enhancement to**: Documentation for future development

**Implementation Scope**:
- **Documentation**: Update `CLAUDE.md`
  - Add section: "Vector Embedding Infrastructure"
  - Document embedding generation flow
  - Document search API usage patterns
  - Add troubleshooting guide (from quickstart)
  - Note P0 scale limits (10K embeddings)
  - Document future scale path (HNSW index, persistent queue)
- **Code Examples**: Include TypeScript snippets
  - How to call search API
  - How to check embedding status
  - How to handle pending embeddings

**Files Modified**:
- `CLAUDE.md` (modify - add vector storage section)

**Acceptance Criteria**:
- ✅ Documentation complete and accurate
- ✅ Troubleshooting guide includes common issues
- ✅ Code examples are copy-paste ready

---

## Dependencies

```
T020 (database) → enables → T021, T022 (schemas/types)
T021, T022 → enables → T023 (embedding generation)
T023 → enables → T024 (search API)
T023, T024 → enables → T025, T026 (error handling, queue)
ALL ABOVE → enables → T027, T028 (validation, docs)
```

**Parallel Execution**:
- T021 [P] + T022 [P] after T020
- T025 [P] + T026 [P] after T023 + T024
- T027 [P] + T028 [P] after all implementation complete

---

## Notes

- **Infrastructure-Only Phase**: This feature is infrastructure-focused (no visible UI in Phase 1) - justified in plan.md Complexity Tracking section
- **Validation via API**: User value demonstrated through API testing and database queries (quickstart scenarios)
- **Future UI**: Phase 2 will add task recommendation UI that consumes this infrastructure
- **Scale Plan**: P0 targets 10K embeddings - migrate to HNSW index and persistent queue beyond 100K
- **Performance Critical**: <500ms search time is hard requirement (FR-015)
- **Graceful Degradation**: Document processing never blocked by embedding failures (FR-024)
- **Deferred Requirements**: FR-003 and FR-004 (automatic embedding regeneration when task text changes) deferred to Phase 2 - not covered in current task list

## Validation Checklist

- [x] Every task specifies user story or system behavior
- [x] Every task includes implementation scope (service/API/data/feedback)
- [x] Every task has test scenario with verification steps
- [x] Setup tasks (T020-T022) justify necessity (block all subsequent tasks)
- [x] Tasks ordered by dependency flow (database → types → services → APIs)
- [x] Parallel tasks operate on independent features ([P] markers)
- [x] Each task specifies exact file paths to modify/create
- [x] Acceptance criteria map to functional requirements (FR-xxx)
