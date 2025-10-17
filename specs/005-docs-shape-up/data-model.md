# Data Model: Vector Storage Foundation

**Feature**: Phase 1 - Vector Storage Foundation for Task Embeddings
**Date**: 2025-10-17
**Status**: Complete

## Entity Relationship Diagram

```
┌─────────────────────────────┐
│   processed_documents       │
│  (existing table)            │
├─────────────────────────────┤
│ id: UUID (PK)                │
│ structured_output: JSONB     │  Contains tasks array
│ ...                          │
└──────────┬──────────────────┘
           │
           │ 1:N
           ↓
┌─────────────────────────────┐
│   task_embeddings           │
│  (NEW TABLE)                 │
├─────────────────────────────┤
│ id: UUID (PK)                │
│ task_id: TEXT (UNIQUE)       │  ← Hash of task_text + document_id
│ task_text: TEXT              │  ← Original task description
│ document_id: UUID (FK)       │  → processed_documents.id
│ embedding: vector(1536)      │  ← OpenAI embedding
│ status: TEXT                 │  ← 'completed'|'pending'|'failed'
│ error_message: TEXT          │  ← NULL if successful
│ created_at: TIMESTAMPTZ      │
│ updated_at: TIMESTAMPTZ      │
└─────────────────────────────┘

           ↓ (future phase - optional)
┌─────────────────────────────┐
│   embedding_queue           │
│  (NEW TABLE - optional)      │
├─────────────────────────────┤
│ id: UUID (PK)                │
│ task_id: TEXT                │
│ document_id: UUID            │
│ priority: INTEGER            │
│ retry_count: INTEGER         │
│ status: TEXT                 │  ← 'queued'|'processing'|'complete'
│ created_at: TIMESTAMPTZ      │
│ processed_at: TIMESTAMPTZ    │
└─────────────────────────────┘
```

---

## Entity Definitions

### 1. task_embeddings (NEW)

**Purpose**: Store 1536-dimension semantic embeddings for task text to enable fast similarity searches.

**Schema**:
```sql
CREATE TABLE task_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL UNIQUE,
  task_text TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES processed_documents(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('completed', 'pending', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_task_embeddings_vector
  ON task_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX idx_task_embeddings_task_id ON task_embeddings(task_id);
CREATE INDEX idx_task_embeddings_document_id ON task_embeddings(document_id);
CREATE INDEX idx_task_embeddings_status ON task_embeddings(status) WHERE status != 'completed';
```

**Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT | Unique identifier for embedding record |
| `task_id` | TEXT | NOT NULL, UNIQUE | Deterministic hash: `sha256(task_text + document_id)` |
| `task_text` | TEXT | NOT NULL | Original task description from `processed_documents.structured_output` |
| `document_id` | UUID | FK, NOT NULL | Reference to source document (CASCADE delete) |
| `embedding` | vector(1536) | NOT NULL | OpenAI text-embedding-3-small output |
| `status` | TEXT | NOT NULL, CHECK | Lifecycle: `pending` → `completed` OR `failed` |
| `error_message` | TEXT | NULL | Error details if `status = 'failed'` |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Initial creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last modification timestamp (trigger) |

**Relationships**:
- **Many-to-One** with `processed_documents`: Each document has multiple task embeddings
- **Cascade Delete**: When document deleted, all task embeddings auto-deleted

**Validation Rules**:
1. `task_id` MUST be unique (prevents duplicate embeddings for same task)
2. `status` MUST be one of: `'completed'`, `'pending'`, `'failed'`
3. `embedding` MUST have exactly 1536 dimensions (enforced by vector type)
4. `error_message` MUST be NULL when `status = 'completed'`
5. `task_text` MUST NOT be empty string

**State Transitions**:
```
   [NEW]
     ↓
  pending  ──────→ completed (embedding generated successfully)
     ↓
  failed   (API error, timeout, validation failure)
     ↓
  [RETRY] (manual re-process only - per clarification)
     ↓
  pending → completed
```

**Lifecycle**:
1. **Creation**: Insert with `status = 'pending'` when document processed
2. **Generation**: Update to `status = 'completed'` + populate `embedding` on success
3. **Failure**: Update to `status = 'failed'` + populate `error_message` on error
4. **Search Exclusion**: Vector searches filter `WHERE status = 'completed'`
5. **Deletion**: Cascade delete when parent document removed

---

### 2. processed_documents (EXISTING - No Changes)

**Purpose**: Stores AI-extracted document content (existing table, unchanged).

**Relevant Fields for Integration**:
- `id` (UUID): Referenced by `task_embeddings.document_id`
- `structured_output` (JSONB): Contains `actions` array with task text
- `status` (TEXT): Document processing status

**Integration Point**:
```typescript
// Extract tasks from structured_output
const tasks = document.structured_output.actions.map(action => ({
  text: action.text,
  task_id: generateTaskId(action.text, document.id),
  document_id: document.id,
}));
```

---

### 3. embedding_queue (OPTIONAL - Deferred to Scale)

**Purpose**: Persistent queue for embedding generation requests (deferred - using in-memory queue for P0).

**Schema** (for future reference):
```sql
CREATE TABLE embedding_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  document_id UUID NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'complete', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_embedding_queue_status ON embedding_queue(status, priority DESC, created_at ASC);
```

**Decision**: **Not implementing in Phase 1**
- **Rationale**: In-memory queue sufficient for P0 scale (<100 documents)
- **Migration Path**: Add this table when scaling beyond 100 documents or requiring persistent queue

---

## TypeScript Types

### Core Types

```typescript
// lib/types/embedding.ts

export type EmbeddingStatus = 'completed' | 'pending' | 'failed';

export interface TaskEmbedding {
  id: string;
  task_id: string;
  task_text: string;
  document_id: string;
  embedding: number[];  // 1536-dimension array
  status: EmbeddingStatus;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskEmbeddingInsert {
  task_id: string;
  task_text: string;
  document_id: string;
  embedding: number[];
  status: EmbeddingStatus;
  error_message?: string | null;
}

export interface SimilaritySearchResult {
  task_id: string;
  task_text: string;
  document_id: string;
  similarity: number;  // 0.0 to 1.0
}

export interface EmbeddingGenerationResult {
  task_id: string;
  status: EmbeddingStatus;
  embedding: number[] | null;
  error_message: string | null;
}
```

### Zod Schemas

```typescript
// lib/schemas/embeddingSchema.ts
import { z } from 'zod';

export const EmbeddingStatusSchema = z.enum(['completed', 'pending', 'failed']);

export const TaskEmbeddingSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().min(1),
  task_text: z.string().min(1),
  document_id: z.string().uuid(),
  embedding: z.array(z.number()).length(1536),
  status: EmbeddingStatusSchema,
  error_message: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const SimilaritySearchRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().default(20),
  threshold: z.number().min(0).max(1).default(0.7),
});

export const SimilaritySearchResultSchema = z.object({
  task_id: z.string(),
  task_text: z.string(),
  document_id: z.string().uuid(),
  similarity: z.number().min(0).max(1),
});

export const SimilaritySearchResponseSchema = z.object({
  tasks: z.array(SimilaritySearchResultSchema),
  query: z.string(),
  count: z.number().int().nonnegative(),
});
```

---

## Database Functions

### 1. search_similar_tasks (NEW)

**Purpose**: Perform vector similarity search with threshold filtering.

```sql
CREATE OR REPLACE FUNCTION search_similar_tasks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  task_id text,
  task_text text,
  document_id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.task_id,
    t.task_text,
    t.document_id,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM task_embeddings t
  WHERE t.status = 'completed'
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**Parameters**:
- `query_embedding`: 1536-dimension vector to search for
- `match_threshold`: Minimum similarity score (default 0.7)
- `match_count`: Maximum results to return (default 20)

**Returns**: Table with task details and similarity scores

**Performance**: Uses `idx_task_embeddings_vector` IVFFlat index (O(log N))

---

### 2. update_task_embeddings_updated_at (NEW)

**Purpose**: Auto-update `updated_at` timestamp on row modification.

```sql
CREATE OR REPLACE FUNCTION update_task_embeddings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_embeddings_updated_at
  BEFORE UPDATE ON task_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_task_embeddings_updated_at();
```

---

## Migration Order

Execute in this sequence:

1. **007_enable_pgvector.sql**: Enable extension
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. **008_create_task_embeddings.sql**: Create table, indexes, triggers
   - Table: `task_embeddings`
   - Indexes: vector, task_id, document_id, status
   - Trigger: `updated_at` auto-update

3. **009_create_search_function.sql**: Create RPC function
   - Function: `search_similar_tasks()`

---

## Validation Rules Summary

| Rule | Enforced By | Purpose |
|------|-------------|---------|
| Unique task_id | UNIQUE constraint | Prevent duplicate embeddings |
| Valid status | CHECK constraint | Lifecycle state validation |
| 1536 dimensions | vector(1536) type | Match OpenAI model output |
| Cascade delete | ON DELETE CASCADE | Clean up orphaned embeddings |
| Non-empty task_text | Application logic | Ensure meaningful embeddings |
| Status-based search | RPC function filter | Only search completed embeddings |

---

## Storage Estimates

**Per Embedding**:
- `embedding`: 1536 floats × 4 bytes = 6,144 bytes
- Metadata: ~100 bytes (IDs, text snippets, timestamps)
- **Total**: ~6.2 KB per embedding

**P0 Scale** (10,000 embeddings):
- Total storage: 10,000 × 6.2 KB = **~62 MB**
- IVFFlat index: ~10% overhead = **~6 MB**
- **Grand Total**: **~68 MB** (negligible)

---

**Data Model Status**: ✅ Complete
**Next Artifact**: contracts/ (API contracts)
