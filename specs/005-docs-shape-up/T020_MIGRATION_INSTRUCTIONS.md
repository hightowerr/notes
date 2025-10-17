# T020 Migration Instructions

**Task**: Enable pgvector extension and create task_embeddings table
**Date**: 2025-10-17
**Status**: Migrations created, ready for manual application

## Overview

Three database migrations have been created for the vector storage foundation. These migrations must be applied manually via the Supabase Dashboard SQL Editor in the order specified below.

## Prerequisites

- Access to Supabase Dashboard for the project
- Sufficient database permissions (superuser or extension creation permissions)
- Database backup recommended before applying migrations

## Migration Application Steps

### Step 1: Enable pgvector Extension (Migration 007)

**File**: `supabase/migrations/007_enable_pgvector.sql`

**What it does**: Enables the pgvector PostgreSQL extension for vector similarity operations.

**Instructions**:
1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `007_enable_pgvector.sql`
3. Paste into SQL Editor
4. Click "Run" to execute
5. Verify extension is enabled by checking the output:
   ```
   extname | extversion
   --------+-----------
   vector  | 0.5.0 (or higher)
   ```

**Expected result**: pgvector extension enabled successfully.

---

### Step 2: Create task_embeddings Table (Migration 008)

**File**: `supabase/migrations/008_create_task_embeddings.sql`

**What it does**:
- Creates `task_embeddings` table with vector(1536) column
- Creates IVFFlat index for similarity search (lists=100)
- Creates supporting indexes (task_id, document_id, status)
- Creates trigger to auto-update `updated_at` timestamp

**Instructions**:
1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `008_create_task_embeddings.sql`
3. Paste into SQL Editor
4. Click "Run" to execute
5. Verify table created by checking the column list output

**Expected result**:
- Table `task_embeddings` created with 9 columns
- 4 indexes created (including IVFFlat vector index)
- Trigger function and trigger created

---

### Step 3: Create RPC Search Function (Migration 009)

**File**: `supabase/migrations/009_create_search_function.sql`

**What it does**: Creates `search_similar_tasks()` RPC function for semantic vector search with threshold filtering.

**Instructions**:
1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `009_create_search_function.sql`
3. Paste into SQL Editor
4. Click "Run" to execute
5. Verify function created by checking the routine name in output

**Expected result**: Function `search_similar_tasks` created successfully.

---

## Verification Checklist

After applying all three migrations, verify the database setup:

### 1. Verify Table Structure

```sql
\d task_embeddings
```

Expected columns:
- `id` (uuid)
- `task_id` (text, unique)
- `task_text` (text)
- `document_id` (uuid, foreign key)
- `embedding` (vector(1536))
- `status` (text, check constraint)
- `error_message` (text, nullable)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### 2. Verify Indexes

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'task_embeddings';
```

Expected indexes:
- `task_embeddings_pkey` (primary key on id)
- `task_embeddings_task_id_key` (unique constraint)
- `idx_task_embeddings_vector` (IVFFlat index)
- `idx_task_embeddings_document_id` (FK lookup)
- `idx_task_embeddings_status` (partial index for pending/failed)

### 3. Test RPC Function

```sql
-- Should return empty result set (no embeddings yet)
SELECT * FROM search_similar_tasks(
  array_fill(0.0, ARRAY[1536])::vector(1536),
  0.7,
  20
);
```

Expected: Empty result set (0 rows)

### 4. Verify CASCADE Delete Constraint

```sql
-- Check foreign key constraint
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'task_embeddings'
  AND tc.constraint_type = 'FOREIGN KEY';
```

Expected: `delete_rule = 'CASCADE'`

---

## Troubleshooting

### Issue: "extension vector does not exist"

**Cause**: pgvector extension not available in Supabase instance

**Fix**:
1. Check Supabase project extensions in Dashboard → Database → Extensions
2. Enable pgvector extension via Dashboard UI if available
3. Contact Supabase support if extension not listed

### Issue: "permission denied to create extension"

**Cause**: Insufficient database permissions

**Fix**:
1. Use Supabase Dashboard SQL Editor (has elevated permissions)
2. Ensure you're project owner or have appropriate permissions
3. Contact project admin to apply migrations

### Issue: "relation processed_documents does not exist"

**Cause**: Previous migrations not applied

**Fix**: Ensure migrations 001-006 are applied before running 007-009

---

## Rollback Instructions

If you need to roll back these migrations:

```sql
-- Rollback in reverse order

-- Drop RPC function (migration 009)
DROP FUNCTION IF EXISTS search_similar_tasks(vector, float, int);

-- Drop table and trigger (migration 008)
DROP TRIGGER IF EXISTS trg_task_embeddings_updated_at ON task_embeddings;
DROP FUNCTION IF EXISTS update_task_embeddings_updated_at();
DROP TABLE IF EXISTS task_embeddings;

-- Disable extension (migration 007)
-- WARNING: Only do this if no other tables use vector type
DROP EXTENSION IF EXISTS vector CASCADE;
```

**WARNING**: Dropping the extension will cascade delete ALL vector columns in the database.

---

## Post-Migration Next Steps

Once migrations are applied successfully:

1. ✅ Mark T020 as complete in `tasks.md`
2. ➡️ Proceed to Phase 1: T021 and T022 (Zod schemas and TypeScript types)
3. ➡️ Continue with embedding service implementation (T023)

---

**Status**: Migrations ready for application
**Blocking**: T021, T022, T023, T024 (all subsequent tasks)
