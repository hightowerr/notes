# Data Model: Document-Aware Prioritization

**Feature**: 014-document-aware-prioritization
**Date**: 2025-11-24

## Entities

### DocumentPrioritizationStatus

Represents a document's relationship to the prioritization system.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string (UUID)` | Document ID (matches `processed_documents.id`) |
| `name` | `string` | Document filename from `uploaded_files.name` |
| `task_count` | `number` | Count of completed tasks from this document |
| `status` | `'included' \| 'excluded' \| 'pending'` | Prioritization inclusion state |
| `included_at` | `string \| null` | ISO timestamp when first included in baseline |

**Status definitions:**
- `included`: Document was in the last prioritization baseline
- `excluded`: User has toggled this document off via UI
- `pending`: New document not yet in any prioritization run

### DocumentExclusion (localStorage)

User preference stored in browser localStorage.

**Storage key format:** `document-exclusions-${outcomeId}`

| Field | Type | Description |
|-------|------|-------------|
| `excludedIds` | `string[]` | Array of document UUIDs to exclude |
| `lastUpdated` | `string` | ISO timestamp of last modification |

**Constraints:**
- Maximum 100 document IDs per outcome
- Auto-expires after 30 days of inactivity (no reads/writes)
- Invalid UUIDs filtered on read

**Example:**
```json
{
  "excludedIds": [
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "b2c3d4e5-f6a7-8901-bcde-f12345678901"
  ],
  "lastUpdated": "2025-11-24T10:30:00.000Z"
}
```

### BaselineDocumentSet (Database Extension)

Stored in `agent_sessions` table to track which documents were included.

**Column addition to `agent_sessions`:**

| Column | Type | Description |
|--------|------|-------------|
| `baseline_document_ids` | `text[]` | Array of document UUIDs in this prioritization |

**Note:** This is a soft addition - existing sessions will have `NULL` for this field.

## API Response Schema

### GET /api/documents/prioritization-status

**Response Schema (Zod):**

```typescript
import { z } from 'zod';

export const documentStatusSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  task_count: z.number().int().min(0),
  status: z.enum(['included', 'excluded', 'pending']),
  included_at: z.string().datetime().nullable(),
});

export const documentStatusResponseSchema = z.object({
  documents: z.array(documentStatusSchema),
  summary: z.object({
    included_count: z.number().int().min(0),
    excluded_count: z.number().int().min(0),
    pending_count: z.number().int().min(0),
    total_task_count: z.number().int().min(0),
  }),
});

export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type DocumentStatusResponse = z.infer<typeof documentStatusResponseSchema>;
```

### POST /api/agent/prioritize (Modified)

**Request Schema Addition:**

```typescript
const requestSchema = z.object({
  outcome_id: z.string().uuid(),
  user_id: z.string().min(1),
  active_reflection_ids: z.array(z.string().uuid()).max(50).optional(),
  dependency_overrides: z.array(dependencyOverrideSchema).optional(),
  // NEW
  excluded_document_ids: z.array(z.string().uuid()).max(100).optional(),
});
```

## Database Queries

### Document Status Query

```sql
-- Get all documents with task counts
SELECT
  pd.id,
  uf.name,
  COUNT(te.task_id) as task_count
FROM processed_documents pd
JOIN uploaded_files uf ON pd.id = uf.id
LEFT JOIN task_embeddings te ON te.document_id = pd.id AND te.status = 'completed'
GROUP BY pd.id, uf.name
ORDER BY uf.uploaded_at DESC
LIMIT 50;
```

### Baseline Document IDs Query

```sql
-- Get latest session's baseline for comparison
SELECT baseline_document_ids
FROM agent_sessions
WHERE user_id = $1
  AND status = 'completed'
  AND baseline_document_ids IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;
```

### Filtered Task Query (Modified Prioritization)

```sql
-- Exclude specific documents from task loading
SELECT task_id, task_text, document_id, status, manual_overrides
FROM task_embeddings
WHERE status = 'completed'
  AND document_id NOT IN ($excludedIds)
LIMIT 200;
```

## State Transitions

### Document Status State Machine

```
                    +------------------+
                    |                  |
    [New Doc] ---> | pending          |
                    |                  |
                    +--------+---------+
                             |
              [Prioritization Run]
                             |
                             v
                    +--------+---------+
                    |                  |
                    | included         | <----+
                    |                  |      |
                    +--------+---------+      |
                             |               |
                [User Toggle Off]     [User Toggle On]
                             |               |
                             v               |
                    +--------+---------+     |
                    |                  |     |
                    | excluded         | ----+
                    |                  |
                    +------------------+
```

### localStorage Expiration Flow

```
[Page Load]
     |
     v
[Read localStorage]
     |
     +--> [lastUpdated > 30 days] --> [Delete entry, return empty]
     |
     +--> [lastUpdated <= 30 days] --> [Return exclusions, update lastUpdated]
```

## Migration Notes

### agent_sessions Table

No migration file needed - column can be added dynamically:

```sql
ALTER TABLE agent_sessions
ADD COLUMN IF NOT EXISTS baseline_document_ids text[];
```

Alternatively, store as JSONB for flexibility:

```sql
ALTER TABLE agent_sessions
ADD COLUMN IF NOT EXISTS baseline_document_ids jsonb DEFAULT '[]'::jsonb;
```

**Recommendation:** Use `text[]` for simpler queries with `ANY()` operator.
