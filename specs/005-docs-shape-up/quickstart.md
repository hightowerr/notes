# Quickstart: Vector Storage Foundation

**Feature**: Phase 1 - Vector Storage Foundation
**Date**: 2025-10-17
**Status**: Complete

## Overview

This quickstart guide validates the complete vector storage foundation implementation through end-to-end scenarios. Execute these scenarios in order to verify all functional requirements are met.

**Prerequisites**:
- Supabase database with pgvector extension enabled
- OpenAI API key configured (`OPENAI_API_KEY` env var)
- Document processing pipeline functional (existing)
- Migrations 007, 008, 009 applied

**Time to Complete**: ~15 minutes

---

## Scenario 1: Auto-Generate Embeddings During Document Processing

**Validates**: FR-001, FR-002, FR-003, FR-005, FR-024, FR-029, FR-030

**Objective**: Verify embeddings are automatically generated when a document is uploaded and processed.

### Steps

1. **Upload a test document** with 20 tasks:
   ```bash
   curl -X POST http://localhost:3000/api/upload \
     -F "file=@test-documents/sample-20-tasks.pdf"
   ```

   Expected response:
   ```json
   {
     "fileId": "550e8400-e29b-41d4-a716-446655440000",
     "status": "processing"
   }
   ```

2. **Wait for processing to complete** (poll status):
   ```bash
   curl http://localhost:3000/api/status/550e8400-e29b-41d4-a716-446655440000
   ```

   Expected response:
   ```json
   {
     "status": "completed",
     "document": { ... },
     "embeddings_status": "completed"  // NEW field
   }
   ```

3. **Verify embeddings in database**:
   ```sql
   SELECT count(*), status
   FROM task_embeddings
   WHERE document_id = '550e8400-e29b-41d4-a716-446655440000'
   GROUP BY status;
   ```

   Expected result:
   ```
    count | status
   -------+-----------
       20 | completed
   ```

4. **Check embedding generation logs**:
   ```bash
   grep "Embedding" logs/document-processing.log | tail -20
   ```

   Expected log entries:
   ```
   [Embedding] Generating embeddings for 20 tasks (document: 550e8400...)
   [Embedding] Batch 1/1: Generated 20 embeddings in 3.2s
   [Embedding] Stored 20 embeddings successfully
   ```

### Success Criteria

- ✅ All 20 tasks have `status = 'completed'` embeddings
- ✅ Processing time added <2s (FR-016)
- ✅ UI not blocked during embedding generation (FR-005)
- ✅ Embeddings have exactly 1536 dimensions

---

## Scenario 2: Semantic Search Returns Results Under 500ms

**Validates**: FR-006, FR-007, FR-008, FR-009, FR-010, FR-015, FR-018

**Objective**: Verify vector similarity search completes within performance target.

### Steps

1. **Ensure 200 tasks with embeddings exist** (from 10 documents):
   ```sql
   SELECT count(*) FROM task_embeddings WHERE status = 'completed';
   -- Expected: >= 200
   ```

2. **Perform semantic search** (measure latency):
   ```bash
   time curl -X POST http://localhost:3000/api/embeddings/search \
     -H "Content-Type: application/json" \
     -d '{
       "query": "increase monthly revenue",
       "limit": 20,
       "threshold": 0.7
     }'
   ```

   Expected response:
   ```json
   {
     "tasks": [
       {
         "task_id": "abc123...",
         "task_text": "Implement revenue tracking dashboard",
         "document_id": "550e8400-e29b-41d4-a716-446655440000",
         "similarity": 0.89
       },
       ...
     ],
     "query": "increase monthly revenue",
     "count": 15
   }
   ```

3. **Validate similarity scores**:
   - All scores > 0.7 threshold (FR-018)
   - Descending order (highest first)
   - Scores between 0.0 and 1.0

4. **Check response time**:
   ```
   real    0m0.245s  ← Must be <0.5s (FR-015)
   ```

5. **Verify result structure**:
   ```bash
   # Check all required fields present
   echo $response | jq '.tasks[0] | keys'
   # Expected: ["document_id", "similarity", "task_id", "task_text"]
   ```

### Success Criteria

- ✅ Search completes in <500ms (95th percentile) (FR-015)
- ✅ Results ranked by similarity (descending)
- ✅ All similarities > 0.7 threshold (FR-018)
- ✅ Limit of 20 results enforced (FR-009)
- ✅ All required fields present (FR-010)

---

## Scenario 3: Graceful Degradation When Embedding API Unavailable

**Validates**: FR-024, FR-025, FR-026, FR-027, FR-028, FR-031

**Objective**: Verify system handles embedding API failures gracefully.

### Steps

1. **Simulate OpenAI API unavailability** (stop mock or disconnect network):
   ```bash
   # Method 1: Unset API key temporarily
   unset OPENAI_API_KEY

   # Method 2: Use mock server with failure response
   # (See __tests__/mocks/openai-mock.ts)
   ```

2. **Upload a document** during API outage:
   ```bash
   curl -X POST http://localhost:3000/api/upload \
     -F "file=@test-documents/sample-10-tasks.pdf"
   ```

3. **Wait for processing** (should complete despite embedding failure):
   ```bash
   curl http://localhost:3000/api/status/{fileId}
   ```

   Expected response:
   ```json
   {
     "status": "completed",  ← Document completed
     "document": { ... },
     "embeddings_status": "pending"  ← Embeddings pending
   }
   ```

4. **Verify database state**:
   ```sql
   SELECT task_text, status, error_message
   FROM task_embeddings
   WHERE document_id = '{fileId}'
   LIMIT 3;
   ```

   Expected result:
   ```
    task_text           | status  | error_message
   ---------------------+---------+------------------------------------------
    "Analyze metrics"   | pending | "Embedding API unavailable: timeout"
    "Review dashboard"  | pending | "Embedding API unavailable: timeout"
    ...
   ```

5. **Verify error logging** (FR-026, FR-028):
   ```bash
   grep "Embedding.*failed" logs/error.log | tail -5
   ```

   Expected log entries (include context per FR-028):
   ```
   [ERROR] Embedding generation failed
   - document_id: 550e8400-e29b-41d4-a716-446655440001
   - task_id: def456...
   - timestamp: 2025-10-17T14:23:45Z
   - error: OpenAI API timeout after 10s
   ```

6. **Verify tasks excluded from search** (FR-024):
   ```bash
   curl -X POST http://localhost:3000/api/embeddings/search \
     -H "Content-Type: application/json" \
     -d '{ "query": "analyze metrics" }'
   ```

   Expected: Tasks with `status = 'pending'` NOT included in results.

7. **Restore API availability and verify no automatic retry** (FR-031):
   ```bash
   export OPENAI_API_KEY="sk-..."

   # Wait 5 minutes - embeddings should remain 'pending'
   sleep 300

   # Check status - should still be 'pending'
   psql -c "SELECT status FROM task_embeddings WHERE document_id = '{fileId}';"
   ```

   Expected: All tasks still `status = 'pending'` (no automatic retry).

### Success Criteria

- ✅ Document marked "completed" despite embedding failure (FR-024)
- ✅ Embeddings marked "pending" with error message (FR-025, FR-028)
- ✅ Pending tasks excluded from search results (FR-024)
- ✅ Error logs include full context (document_id, task_id, timestamp) (FR-028)
- ✅ No automatic retry (FR-031)
- ✅ Manual re-process triggers retry (test separately)

---

## Scenario 4: Queue-Based Rate Limiting Prevents API Throttling

**Validates**: FR-029, FR-030, FR-022

**Objective**: Verify queue processes embedding requests at controlled rate.

### Steps

1. **Upload 5 documents concurrently** (simulate load):
   ```bash
   for i in {1..5}; do
     curl -X POST http://localhost:3000/api/upload \
       -F "file=@test-documents/sample-20-tasks-${i}.pdf" &
   done
   wait
   ```

2. **Monitor queue processing** (check logs):
   ```bash
   tail -f logs/embedding-queue.log
   ```

   Expected log pattern:
   ```
   [Queue] Enqueued 20 tasks for document 1 (queue depth: 20)
   [Queue] Enqueued 20 tasks for document 2 (queue depth: 40)
   [Queue] Enqueued 20 tasks for document 3 (queue depth: 60)
   [Queue] Processing batch 1/2 (50 tasks)
   [Queue] Batch 1 complete (3.5s)
   [Queue] Processing batch 2/2 (50 tasks)
   [Queue] Batch 2 complete (3.2s)
   ```

3. **Verify no OpenAI rate limit errors**:
   ```bash
   grep "rate_limit_exceeded" logs/error.log
   # Expected: No results
   ```

4. **Check database for successful completions**:
   ```sql
   SELECT count(*), status
   FROM task_embeddings
   WHERE created_at > NOW() - INTERVAL '5 minutes'
   GROUP BY status;
   ```

   Expected result:
   ```
    count | status
   -------+-----------
      100 | completed  ← All 100 tasks completed
   ```

### Success Criteria

- ✅ All 100 tasks processed successfully (FR-029, FR-030)
- ✅ No rate limit errors from OpenAI API (FR-029)
- ✅ Queue processed at controlled rate (batches of 50) (FR-029)
- ✅ Concurrent uploads handled without conflicts (FR-030)

---

## Scenario 5: Cascade Delete Removes Orphaned Embeddings

**Validates**: FR-011, FR-012

**Objective**: Verify embeddings are deleted when parent document is deleted.

### Steps

1. **Verify embeddings exist** for a test document:
   ```sql
   SELECT count(*) FROM task_embeddings
   WHERE document_id = '550e8400-e29b-41d4-a716-446655440000';
   -- Expected: 20
   ```

2. **Delete the parent document**:
   ```bash
   curl -X DELETE http://localhost:3000/api/documents/550e8400-e29b-41d4-a716-446655440000
   ```

3. **Verify embeddings deleted**:
   ```sql
   SELECT count(*) FROM task_embeddings
   WHERE document_id = '550e8400-e29b-41d4-a716-446655440000';
   -- Expected: 0 (cascade delete worked)
   ```

### Success Criteria

- ✅ All task embeddings deleted when document deleted (FR-011)
- ✅ No orphaned embeddings remain (FR-012)

---

## Performance Validation

### Load Test: 10,000 Embeddings

**Validates**: FR-015, FR-017

```bash
# Generate 50 documents × 200 tasks = 10,000 embeddings
for i in {1..50}; do
  curl -X POST http://localhost:3000/api/upload \
    -F "file=@test-documents/sample-200-tasks-${i}.pdf"
done

# Wait for all processing to complete (~10 minutes)

# Verify 10,000 embeddings exist
psql -c "SELECT count(*) FROM task_embeddings WHERE status = 'completed';"
-- Expected: 10000

# Test search performance at scale
time curl -X POST http://localhost:3000/api/embeddings/search \
  -H "Content-Type: application/json" \
  -d '{ "query": "optimize database" }'

# Expected: <500ms even with 10K embeddings (FR-017)
```

### Database Size Check

```sql
-- Verify storage efficiency (FR-023)
SELECT
  pg_size_pretty(pg_total_relation_size('task_embeddings')) as table_size,
  pg_size_pretty(pg_indexes_size('task_embeddings')) as index_size;

-- Expected for 10K embeddings:
-- table_size: ~62 MB (<10KB per task)
-- index_size: ~6 MB
```

---

## Manual Test Checklist

Execute each scenario and check off:

- [ ] Scenario 1: Auto-generate embeddings (20 tasks)
  - [ ] Embeddings created automatically
  - [ ] Processing time <2s added
  - [ ] All 20 tasks status 'completed'

- [ ] Scenario 2: Semantic search (<500ms)
  - [ ] Search completes in <500ms
  - [ ] Results ranked by similarity
  - [ ] Threshold filtering works

- [ ] Scenario 3: Graceful degradation
  - [ ] Document completes despite API failure
  - [ ] Embeddings marked 'pending'
  - [ ] Error logs include context
  - [ ] No automatic retry

- [ ] Scenario 4: Queue rate limiting
  - [ ] 5 concurrent uploads handled
  - [ ] No rate limit errors
  - [ ] All tasks processed successfully

- [ ] Scenario 5: Cascade delete
  - [ ] Embeddings deleted with document
  - [ ] No orphaned records

- [ ] Performance validation (10K scale)
  - [ ] Search <500ms at 10K embeddings
  - [ ] Storage <10KB per embedding

---

## Troubleshooting

### Issue: Embeddings not being generated

**Check**:
1. `OPENAI_API_KEY` env var set correctly
2. Document processing completed successfully
3. Database migrations applied (007, 008, 009)
4. Error logs for API failures

**Fix**: Ensure embedding service hooked into processing pipeline at correct point.

### Issue: Search returns empty results

**Check**:
1. Embeddings exist with `status = 'completed'`
2. Threshold not too high (try 0.3 for testing)
3. Query embedding generated successfully
4. pgvector index created correctly

**Fix**: Run `ANALYZE task_embeddings;` to refresh statistics.

### Issue: Search slower than 500ms

**Check**:
1. IVFFlat index exists (`\d task_embeddings` in psql)
2. Index lists parameter set correctly (100 for 10K rows)
3. Query plan using index (`EXPLAIN ANALYZE` the search)

**Fix**: Rebuild index or adjust lists parameter.

---

**Quickstart Status**: ✅ Complete
**Next Phase**: Run `/tasks` command to generate tasks.md
