# Debug Report: T012 Recompute Service Schema Mismatch

## Error Summary
**Test**: Recompute job execution
**File**: lib/services/recomputeService.ts:112-115
**Error**: `column processed_documents.summary does not exist`

---

## Hypothesis Analysis

### Initial Hypotheses
1. **Column name mismatch (CONFIRMED)**: The query references columns that don't exist in the database schema
   - Supporting evidence: Migration 002 shows `processed_documents` table has `structured_output` (JSONB) column, not separate `summary`, `actions`, or `lno_tasks` columns
   - Supporting evidence: No `user_id` column exists in `processed_documents` table
2. **Missing migration**: Perhaps a migration that adds these columns wasn't applied
   - Contradicting evidence: All migrations (001-004) reviewed - none add these columns to `processed_documents`
3. **Wrong table being queried**: Perhaps should query a different table
   - Contradicting evidence: Other successful queries in codebase (e.g., `/api/documents`, `/api/status`) use `processed_documents` correctly

### Top Candidates
1. **Column name mismatch**: Query attempts to select non-existent columns (`summary`, `actions`, `lno_tasks`) and filter by non-existent column (`user_id`)
2. **Missing user_id relationship**: The `processed_documents` table has no `user_id` column - it links to `uploaded_files` via `file_id`

---

## Validation

**Logs Added**: None needed - error is clear from database response

**Observed Behavior**:
```
[Recompute] Job failed: Failed to fetch documents: column processed_documents.summary does not exist
[Recompute] Retry attempt 1/3 after 1000ms...
[Recompute] Retry attempt 2/3 after 4000ms...
[Recompute] Permanent failure after 3 retries
```

**Database Schema** (from `supabase/migrations/002_create_processing_tables.sql`):
```sql
CREATE TABLE processed_documents (
  id UUID PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES uploaded_files(id),
  markdown_content TEXT NOT NULL,
  markdown_storage_path TEXT NOT NULL,
  structured_output JSONB NOT NULL,  -- ✅ Contains topics, decisions, actions, lno_tasks
  json_storage_path TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL,
  processing_duration INTEGER NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(file_id)
);
```

**Correct Query Pattern** (from `/api/documents/route.ts:69-73`):
```typescript
.from('uploaded_files')
.select(`
  id,
  name,
  size,
  mime_type,
  uploaded_at,
  status,
  processed_documents (
    confidence,
    processing_duration,
    structured_output  // ✅ Correct column name
  )
`)
```

---

## Root Cause

**Confirmed**: The recompute service query references non-existent columns in the `processed_documents` table.

**Evidence**:
1. **Line 114**: `.select('id, summary, actions, lno_tasks')` - columns `summary`, `actions`, `lno_tasks` don't exist
2. **Line 115**: `.eq('user_id', job.userId)` - column `user_id` doesn't exist
3. Database has `structured_output` (JSONB) column containing all summary data
4. No direct `user_id` relationship - must join through `uploaded_files` table

**Location**: `/home/yunix/learning-agentic/ideas/Note-synth/notes/lib/services/recomputeService.ts:112-115`

**Why This Breaks**:
PostgreSQL throws error when attempting to SELECT columns that don't exist in the table schema. The retry logic (3 attempts with exponential backoff) cannot fix a schema mismatch, so all retries fail with the same error.

**User Impact**:
- What user action fails: Creating or updating outcome statement triggers background recompute job
- What user sees: Outcome is saved successfully, but console shows recompute failures
- User journey blocked: Re-scoring of existing document actions against new outcome (FR-042)

---

## Corrective Plan

**Step 1**: Fix column selection in document query
- **File**: lib/services/recomputeService.ts
- **Line**: 112-115
- **Current**:
  ```typescript
  const { data: documents, error: documentsError } = await supabase
    .from('processed_documents')
    .select('id, summary, actions, lno_tasks')
    .eq('user_id', job.userId);
  ```
- **Change To**:
  ```typescript
  const { data: documents, error: documentsError } = await supabase
    .from('processed_documents')
    .select('id, structured_output')
    .eq('user_id', job.userId);
  ```
- **Reason**: Match actual database schema - `structured_output` (JSONB) contains all summary data

**Step 2**: Fix user_id filter - join through uploaded_files
- **File**: lib/services/recomputeService.ts
- **Line**: 112-115
- **Current**:
  ```typescript
  const { data: documents, error: documentsError } = await supabase
    .from('processed_documents')
    .select('id, structured_output')
    .eq('user_id', job.userId);
  ```
- **Change To**:
  ```typescript
  const { data: documents, error: documentsError } = await supabase
    .from('processed_documents')
    .select(`
      id,
      structured_output,
      uploaded_files!inner (
        user_id
      )
    `)
    .eq('uploaded_files.user_id', job.userId);
  ```
- **Reason**: `processed_documents` has no `user_id` column - must join through `uploaded_files` table via `file_id` foreign key

**Step 3**: Verify query against existing patterns
- **File**: lib/services/recomputeService.ts
- **Line**: 112-120
- **Validation**: Compare with successful queries in:
  - `/api/documents/route.ts:60-74` (correct join pattern)
  - `/api/status/[fileId]/route.ts:49-51` (correct column names)
- **Reason**: Ensure consistency with production-tested query patterns

**Step 4**: Add toast notification on permanent failure (FR-045)
- **File**: lib/services/recomputeService.ts
- **Line**: 165 (after max retries exceeded)
- **Current**:
  ```typescript
  // Max retries exceeded
  console.error(`[Recompute] Permanent failure after ${this.MAX_RETRIES} retries`);
  ```
- **Change To**:
  ```typescript
  // Max retries exceeded
  console.error(`[Recompute] Permanent failure after ${this.MAX_RETRIES} retries`);

  // FR-045: Client-side toast requires separate endpoint or event system
  // For P0: Log warning that frontend should display
  console.warn('[Recompute] TOAST_WARNING: Failed to re-score actions after 3 retries');
  ```
- **Reason**: FR-045 requires toast warning, but service runs server-side. Full implementation needs WebSocket/Server-Sent Events or polling endpoint for frontend to detect failures.

---

## Side Effects

**Potential Issues**:
- Query performance: JOIN with `uploaded_files` adds minimal overhead (indexed foreign key)
- Empty result set: If no documents exist for user, query returns empty array (expected behavior)
- JSONB access: Code must access `structured_output.actions` instead of direct `actions` column

**Related Code**:
- `/api/outcomes/route.ts:172-177` - Also counts documents, may need similar fix if filtering by user
- Future AI integration: When implementing actual re-scoring logic (currently no-op), must parse `structured_output` JSONB

---

## Prevention

**How to avoid this**:
- Pattern: Always reference actual database schema when writing Supabase queries
- Pattern: Use existing API endpoints as templates for table joins and column selection
- Test: Add integration test that actually executes recompute job against test database
- Validation: Check column names against migration files before deploying

**Testing Checklist**:
1. Create test outcome
2. Upload and process test document
3. Update outcome to trigger recompute
4. Verify job completes without database errors
5. Check console logs for successful document fetch

---

## Next Steps

1. Apply corrective plan (Steps 1-3) to fix schema mismatch
2. Re-run manual test: Create outcome → Update outcome → Check console logs
3. Verify query returns documents without errors
4. Consider future enhancement: Add proper client-side toast notification system (requires architecture change)
5. Add integration test to prevent regression
