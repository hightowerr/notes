# Research: Document-Aware Prioritization

**Feature**: 014-document-aware-prioritization
**Date**: 2025-11-24

## Existing System Analysis

### Document-Task Relationship

**Current data flow:**
```
uploaded_files → processed_documents → task_embeddings
                      (1:1)                (1:N)
```

**Key tables:**
- `uploaded_files`: File metadata, status, source (upload/google_drive)
- `processed_documents`: AI outputs, markdown, linked to uploaded_files
- `task_embeddings`: Tasks with `document_id` foreign key, `status` field

**Query pattern for tasks by document:**
```sql
SELECT document_id, COUNT(*) as task_count
FROM task_embeddings
WHERE status = 'completed'
GROUP BY document_id
```

### Current Prioritization API

**Location:** `app/api/agent/prioritize/route.ts`

**Current task loading (line 83-87):**
```typescript
const { data: taskRows, error } = await supabase
  .from('task_embeddings')
  .select('task_id, task_text, document_id, status, manual_overrides')
  .eq('status', 'completed')
  .limit(200);
```

**Key observation:** No document filtering currently exists. All completed tasks included regardless of source document.

**Modification point:** Add optional `excluded_document_ids` parameter to filter query.

### Baseline Document Tracking

**Current state:** The `agent_sessions` table stores prioritization results but does NOT track which documents were included.

**Required addition:** Store `baseline_document_ids` array in session to enable diff detection for "pending" documents.

### localStorage Patterns in Codebase

**Existing patterns found:**
- `outcome-prompt-dismissed` - Simple boolean flag
- `reflection-quality-survey` - Object with multiple fields
- `locked-task-${outcomeKey}` - Keyed by outcome ID

**Pattern to follow:**
```typescript
// Key format: document-exclusions-${outcomeId}
// Value format:
{
  excludedIds: string[],
  lastUpdated: string // ISO timestamp
}
```

### Component Integration Points

**Outcome display location:** `app/priorities/page.tsx:2358-2361`
```tsx
{activeOutcome && (
  <span className="truncate text-muted-foreground">
    Outcome: {activeOutcome.assembled_text}
  </span>
)}
```

**Recalculate button location:** `app/priorities/page.tsx:2372`
- Inside collapsed card header
- Uses `analyzeButtonLabel()` function

**ContextCard location:** `app/priorities/components/ContextCard.tsx`
- Already has `onRecalculate` prop
- Good insertion point for pending count badge

### Design System Tokens

**From `.claude/standards.md`:**
- `bg-primary/5` - Subtle brand tint for prominent containers
- `border-l-4 border-primary` - Left accent for emphasis
- `shadow-2layer-sm` - Gentle depth
- `text-lg font-medium` - Increased text prominence

## Technical Decisions

### localStorage vs Database Storage

**Decision: localStorage**

Rationale:
- Exclusions are user preferences, not core data
- No need for cross-device sync
- Simpler implementation, no schema migration
- 30-day expiry fits ephemeral nature

### Pending Document Detection Strategy

**Approach:** Compare current document set against baseline stored in last session.

```typescript
// Pending = has tasks but not in baseline
const currentDocIds = new Set(taskRows.map(t => t.document_id));
const baselineDocIds = new Set(session.baseline_document_ids ?? []);
const pendingDocIds = [...currentDocIds].filter(id => !baselineDocIds.has(id));
```

### API Design Choice

**Decision:** Single endpoint returning full document list with status

Alternative considered: Separate endpoints for counts vs details
Rejected because: Extra round-trips, more complex client logic

## Performance Considerations

### Query Optimization

Document status query aggregates task counts:
```sql
SELECT
  te.document_id,
  uf.name,
  COUNT(*) as task_count
FROM task_embeddings te
JOIN processed_documents pd ON te.document_id = pd.id
JOIN uploaded_files uf ON pd.id = uf.id
WHERE te.status = 'completed'
GROUP BY te.document_id, uf.name
ORDER BY uf.uploaded_at DESC
LIMIT 50
```

Expected performance: <100ms for typical user (5-20 documents)

### localStorage Size

- ~100 bytes per exclusion entry
- 100 exclusions max = 10KB
- Well within 5MB localStorage limit

## References

- Shape Up Pitch: `docs/shape-up-pitches/phase-16-document-aware-prioritization.md`
- Existing localStorage patterns: `app/priorities/page.tsx:975-990`
- Design system: `.claude/standards.md` (Design System section)
- Supabase client patterns: `lib/supabase/client.ts`
