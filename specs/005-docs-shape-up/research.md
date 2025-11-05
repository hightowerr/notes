# Research: Vector Storage Foundation

**Feature**: Phase 1 - Vector Storage Foundation for Task Embeddings
**Date**: 2025-10-17
**Status**: Complete

## Executive Summary

Research confirms the Shape Up pitch technical decisions are sound for P0 scale (10K embeddings). Key findings:
- **pgvector IVFFlat** optimal for <100K vectors (our target: 10K)
- **Vercel AI SDK** provides battle-tested embedding patterns
- **In-memory queue** sufficient for P0 (persistent queue deferred to scale)
- **Simple RPC function** adequate for vector search (no caching needed yet)

All NEEDS CLARIFICATION items resolved. Ready for Phase 1 design.

---

## 1. pgvector Integration Best Practices

### Decision: IVFFlat Index with 100 Lists

**Rationale**:
- IVFFlat recommended for <1M vectors (we have 10K target)
- Lists parameter: `sqrt(rows)` = `sqrt(10000)` ≈ 100
- Acceptable recall/speed tradeoff for P0 scale
- Simpler than HNSW (Hierarchical Navigable Small World)

**Configuration**:
```sql
CREATE INDEX idx_task_embeddings_vector
ON task_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**Maintenance**:
- Run `VACUUM ANALYZE task_embeddings` after bulk inserts
- Re-index if data grows beyond 100K vectors (scale threshold)
- Monitor query performance with `EXPLAIN ANALYZE`

**Connection Pooling**:
- Supabase handles pooling automatically (no special config needed)
- Vector queries use standard PostgreSQL connections
- No need for dedicated pool sizing

**Migration Strategy**:
- Enable extension in Supabase dashboard OR via migration
- Must be superuser OR use Supabase's pre-enabled extensions
- Test in development database first

**Alternatives Considered**:
- **HNSW**: Better for >100K vectors, more complex, overkill for P0
- **Flat index**: No index, O(N) scans - too slow even for 10K

**Sources**:
- pgvector GitHub docs: https://github.com/pgvector/pgvector
- Supabase vector guide: https://supabase.com/docs/guides/ai/vector-columns

---

## 2. Vercel AI SDK Embedding Patterns

### Decision: Use `embed()` with Promise.all for Batch Generation

**Rationale**:
- Vercel AI SDK v4.x provides `embed()` function for single embeddings
- Batch via `Promise.all(tasks.map(task => embed(...)))`
- Simple error handling with try/catch per task
- Rate limiting handled by queue layer (not SDK level)

**Pattern**:
```typescript
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

async function generateEmbeddings(tasks: Task[]) {
  const results = await Promise.all(
    tasks.map(async (task) => {
      try {
        const { embedding } = await embed({
          model: openai.embedding('text-embedding-3-small'),
          value: task.text,
        });
        return { task, embedding, status: 'completed' };
      } catch (error) {
        console.error(`[Embedding] Failed for task ${task.id}:`, error);
        return { task, embedding: null, status: 'failed' };
      }
    })
  );
  return results;
}
```

**Error Handling**:
- Individual task failures don't block batch
- Failed embeddings logged and marked `status: 'failed'`
- No automatic retry (per clarification - manual re-process only)

**Rate Limiting**:
- OpenAI free tier: 3,000 requests/min (plenty for P0)
- Queue layer processes at controlled rate (50 tasks/batch)
- No need for SDK-level throttling

**Alternatives Considered**:
- **LangChain**: Heavier dependency, more boilerplate
- **Direct OpenAI SDK**: Lower-level, more code to maintain
- **Custom batching**: Reinventing wheel, Vercel AI SDK is proven

**Sources**:
- Vercel AI SDK docs: https://sdk.vercel.ai/docs/ai-sdk-core/embeddings
- OpenAI rate limits: https://platform.openai.com/docs/guides/rate-limits

---

## 3. Queue-Based Rate Limiting Patterns

### Decision: In-Memory Queue with Database Status Tracking

**Rationale**:
- **P0 scale**: 50 documents × 200 tasks = 10K embeddings (manageable in-memory)
- **Simplicity**: Avoid complexity of persistent queue (Redis, Bull)
- **Restart tolerance**: Failed embeddings marked `pending` in database, can be re-queued on restart
- **Scale plan**: Migrate to persistent queue (Bull/BullMQ) when >100 documents

**Architecture**:
```
┌─────────────────────────────────────┐
│  Document Processing Trigger        │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  embeddingQueue.enqueue(tasks)      │ ← In-memory queue
│  - Max concurrency: 3                │
│  - Batch size: 50 tasks              │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  embeddingService.generate(batch)   │
│  - Promise.all with individual       │
│    error handling                    │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Store to task_embeddings table     │
│  - status: completed/failed          │
└─────────────────────────────────────┘
```

**Concurrency Control**:
- Use `p-limit` library (lightweight, battle-tested)
- Limit: 3 concurrent document uploads
- Each upload processes tasks in serial (within document)

**Graceful Degradation**:
- On API timeout: Mark embeddings `status: 'pending'`
- Document marked `completed` but tasks excluded from search
- No automatic retry (per clarification)

**Alternatives Considered**:
- **Bull/BullMQ**: Persistent queue with Redis - overkill for P0
- **Database-only queue**: Polling overhead, not real-time
- **SQS/Cloud queue**: Adds external dependency, unnecessary complexity

**Sources**:
- p-limit: https://github.com/sindresorhus/p-limit
- Node.js concurrency patterns: https://nodejs.org/en/docs/guides/blocking-vs-non-blocking/

---

## 4. Vector Search Performance Optimization

### Decision: Simple RPC Function with Cosine Distance, No Caching

**Rationale**:
- **P0 scale**: 10K embeddings = ~60MB total (6KB per embedding × 10K)
- **Performance**: pgvector IVFFlat provides <50ms search time
- **Simplicity**: Direct RPC function, no query optimization needed yet
- **Caching**: Deferred to scale (search patterns unclear in P0)

**SQL Function**:
```sql
CREATE OR REPLACE FUNCTION search_similar_tasks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  task_id text,
  task_text text,
  document_id uuid,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.task_id,
    t.task_text,
    t.document_id,
    1 - (t.embedding <=> query_embedding) as similarity
  FROM task_embeddings t
  WHERE 1 - (t.embedding <=> query_embedding) > match_threshold
    AND t.status = 'completed'  -- Only search completed embeddings
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

**Performance Optimizations (P0)**:
- IVFFlat index handles similarity search
- Filter by `status = 'completed'` (exclude pending/failed)
- Limit results to 20 (configurable, prevents massive result sets)

**Future Optimizations (Deferred)**:
- **Caching**: Redis cache for frequent queries (deferred - patterns unclear)
- **Query rewrite**: Materialized views for common searches (deferred - not needed yet)
- **Parallel queries**: Partition by document_id (deferred - <100K rows)

**Index Maintenance**:
- Run `ANALYZE task_embeddings` after bulk inserts
- Monitor query times with `pg_stat_statements`
- Alert if p95 latency exceeds 500ms

**Alternatives Considered**:
- **Qdrant**: Dedicated vector database - unnecessary overhead for P0
- **Pinecone**: SaaS vector DB - external dependency, cost concern
- **Weaviate**: Self-hosted - complex setup, overkill for 10K vectors

**Sources**:
- pgvector performance guide: https://github.com/pgvector/pgvector#performance
- PostgreSQL query optimization: https://www.postgresql.org/docs/current/performance-tips.html

---

## Technology Choices Summary

| Component | Decision | Rationale | Deferred to Scale |
|-----------|----------|-----------|-------------------|
| **Vector Database** | pgvector (Supabase) | Already using Supabase, proven at scale | Dedicated vector DB (Qdrant) if >1M vectors |
| **Embedding Model** | text-embedding-3-small | 1536 dims, good quality/cost, OpenAI standard | Fine-tuned model if accuracy <80% |
| **Vector Index** | IVFFlat (100 lists) | Optimal for <100K vectors, simple config | HNSW if >100K vectors |
| **Rate Limiting** | In-memory queue (p-limit) | Sufficient for P0 scale, restart-tolerant | Persistent queue (Bull) if >100 docs |
| **Caching** | None (direct DB query) | Unclear search patterns, premature optimization | Redis cache if p95 >500ms |
| **Batch Size** | 50 tasks per batch | Balance API efficiency vs memory | Tune based on OpenAI rate limits |
| **Concurrency** | 3 concurrent uploads | Matches existing pipeline limit | Scale based on server capacity |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **OpenAI API downtime** | Medium | High | Mark embeddings `pending`, graceful degradation |
| **pgvector performance <500ms** | Low | Medium | IVFFlat proven for 10K vectors, monitor p95 |
| **Queue memory overflow** | Low | Low | In-memory limit: 10K tasks × 1KB = 10MB (negligible) |
| **Rate limiting hit** | Low | Medium | Queue processes at controlled rate (50/batch) |
| **Index build timeout** | Low | Low | IVFFlat builds in seconds for 10K vectors |

---

## Open Questions (None Remaining)

All technical decisions confirmed. Ready for Phase 1 design.

---

## References

1. **pgvector Documentation**: https://github.com/pgvector/pgvector
2. **Supabase Vector Guide**: https://supabase.com/docs/guides/ai/vector-columns
3. **Vercel AI SDK Embeddings**: https://sdk.vercel.ai/docs/ai-sdk-core/embeddings
4. **OpenAI Embeddings Guide**: https://platform.openai.com/docs/guides/embeddings
5. **p-limit Concurrency Library**: https://github.com/sindresorhus/p-limit
6. **PostgreSQL Performance Tips**: https://www.postgresql.org/docs/current/performance-tips.html

---

**Research Status**: ✅ Complete
**Next Phase**: Phase 1 - Design & Contracts (data-model.md, contracts/, quickstart.md)
