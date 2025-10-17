# Shape Up Pitch: Phase 1 - Vector Storage Foundation

## Problem

**The current system regenerates embeddings on every query, making semantic search slow and expensive.**

When a user changes their outcome statement, the system must:
1. Generate an embedding for the outcome (200ms, $0.0001)
2. Generate embeddings for ALL actions across ALL documents (N × 200ms, N × $0.0001)
3. Compute cosine similarity for every pair (O(N) operations)

For a typical user with 50 documents and 200 tasks:
- **Time:** 200 tasks × 200ms = 40 seconds per query
- **Cost:** 200 × $0.0001 = $0.02 per query
- **User experience:** Unacceptable delay, expensive at scale

**Root cause:** No vector database. Embeddings computed fresh every time instead of pre-computed and indexed.

**Current state:**
- ✅ Embedding generation works (`aiSummarizer.ts:361-364`)
- ✅ Cosine similarity function exists (`aiSummarizer.ts:306-329`)
- ❌ No storage for embeddings
- ❌ No indexed similarity search
- ❌ No caching layer

---

## Solution

**Install pgvector extension in Supabase and store embeddings alongside tasks.**

### Appetite: 1 week (5 working days)

### Breadboard Sketch

```
┌─────────────────────────────────────────────────────────┐
│  Document Processing Pipeline (UPDATED)                │
│                                                         │
│  1. Upload document                                     │
│  2. Convert to Markdown                                 │
│  3. Extract tasks (existing)                            │
│  4. ✨ NEW: Generate embeddings for each task          │
│  5. ✨ NEW: Store embeddings in task_embeddings table  │
│  6. Store structured output (existing)                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Vector Search API (NEW)                                │
│                                                         │
│  POST /api/embeddings/search                            │
│  Body: { query: "increase revenue", limit: 20 }        │
│                                                         │
│  Process:                                               │
│  1. Generate query embedding (1× = 200ms)               │
│  2. pgvector similarity search (O(log N) = 50ms)        │
│  3. Return top N tasks with similarity scores           │
│                                                         │
│  Total: ~250ms vs 40s (160× faster)                     │
└─────────────────────────────────────────────────────────┘
```

### Technical Implementation

**Database Migration:**
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create task embeddings table
CREATE TABLE task_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_text TEXT NOT NULL,
  task_id TEXT NOT NULL UNIQUE, -- Hash of text + doc_id
  document_id UUID REFERENCES processed_documents(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL, -- OpenAI ada-002 size
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vector similarity index (IVFFlat for <1M vectors)
CREATE INDEX idx_task_embeddings_vector
ON task_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index for task_id lookups
CREATE INDEX idx_task_embeddings_task_id ON task_embeddings(task_id);
CREATE INDEX idx_task_embeddings_document_id ON task_embeddings(document_id);
```

**New Service: `lib/services/embeddingService.ts`**
```typescript
async function generateAndStoreEmbeddings(
  document: ProcessedDocument
): Promise<void> {
  const tasks = flattenAllTasks(document.structured_output);

  // Generate embeddings in batch
  const embeddings = await Promise.all(
    tasks.map(task => embed({
      model: openai.embedding('text-embedding-3-small'),
      value: task.text,
    }))
  );

  // Store in database
  await supabase.from('task_embeddings').insert(
    tasks.map((task, i) => ({
      task_id: generateTaskId(task.text, document.id),
      task_text: task.text,
      document_id: document.id,
      embedding: embeddings[i].embedding,
    }))
  );
}
```

**New API: `app/api/embeddings/search/route.ts`**
```typescript
export async function POST(request: NextRequest) {
  const { query, limit = 20, threshold = 0.7 } = await request.json();

  // Generate query embedding
  const { embedding: queryEmbedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: query,
  });

  // pgvector similarity search
  const { data: results } = await supabase.rpc('search_similar_tasks', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
  });

  return NextResponse.json({ tasks: results });
}
```

**Database Function for Vector Search:**
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
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

---

## Rabbit Holes

**1. Choosing vector index type (IVFFlat vs HNSW)**
- **Risk:** Analysis paralysis comparing index performance
- **Timebox:** 2 hours research, then pick IVFFlat (simpler, good enough for <1M vectors)
- **Why it doesn't matter yet:** User has <10K tasks. Both will be fast. Optimize later if needed.

**2. Embedding model versioning**
- **Risk:** Spending time on migration strategy for model upgrades
- **Timebox:** Not in scope. Use current model (`text-embedding-3-small`), add `model_version` column for future.
- **Why it doesn't matter yet:** OpenAI embeddings are stable. Won't change in 6-month horizon.

**3. Batch embedding generation optimization**
- **Risk:** Building complex batching logic for performance
- **Timebox:** Use simple `Promise.all()` for now (max 50 concurrent requests).
- **Why it doesn't matter yet:** Documents process async already. User doesn't see the delay.

**4. Recomputing embeddings for existing documents**
- **Risk:** Building complex migration script with retry logic
- **Timebox:** 4 hours. Simple script that processes documents in batches of 10.
- **Exit strategy:** If script fails, regenerate embeddings on-demand (lazy loading).

---

## No-Gos

**❌ Full-text search integration**
- Out of scope. pgvector semantic search is enough for Phase 1.
- Hybrid search (vector + keyword) can be Phase 5 if needed.

**❌ Multi-modal embeddings (images, PDFs)**
- Stick to text embeddings only. Documents already converted to markdown.

**❌ Custom embedding fine-tuning**
- Use OpenAI embeddings as-is. Fine-tuning requires training data + infra.

**❌ Real-time embedding updates**
- Embeddings generated during document processing only (async).
- Don't rebuild embeddings on every outcome change.

**❌ Embedding compression/quantization**
- Use full 1536-dimension vectors. Compression adds complexity for minimal gain at this scale.

---

## Success Metrics

**Performance:**
- Vector search completes in <500ms (95th percentile)
- Processing pipeline adds <2s for embedding generation (acceptable async delay)

**Correctness:**
- Top 20 semantic search results have >0.7 similarity score
- Manual review: 80% of results are actually relevant

**Cost:**
- Embedding generation: $0.0001 per task (one-time per document)
- Storage: ~6KB per task (1536 floats × 4 bytes)
- 10K tasks = 60MB (negligible)

**Deliverables:**
- ✅ pgvector extension enabled
- ✅ `task_embeddings` table created with vector index
- ✅ Embedding generation integrated into processing pipeline
- ✅ `/api/embeddings/search` endpoint functional
- ✅ Migration script for existing documents
- ✅ Unit tests for similarity search (cosine distance validation)
