-- Clear Database Script
-- Purpose: Remove all notes data while preserving schema
-- Usage: Run in Supabase Dashboard → SQL Editor

-- Step 1: Clear all data (CASCADE handles foreign key relationships)
TRUNCATE TABLE uploaded_files CASCADE;
TRUNCATE TABLE processed_documents CASCADE;
TRUNCATE TABLE processing_logs CASCADE;
TRUNCATE TABLE task_embeddings CASCADE;
TRUNCATE TABLE user_outcomes CASCADE;
TRUNCATE TABLE reflections CASCADE;

-- Step 2: Verify all tables are empty
SELECT 'uploaded_files' as table_name, count(*) as record_count FROM uploaded_files
UNION ALL
SELECT 'processed_documents', count(*) FROM processed_documents
UNION ALL
SELECT 'processing_logs', count(*) FROM processing_logs
UNION ALL
SELECT 'task_embeddings', count(*) FROM task_embeddings
UNION ALL
SELECT 'user_outcomes', count(*) FROM user_outcomes
UNION ALL
SELECT 'reflections', count(*) FROM reflections;

-- Expected output: All counts should be 0

-- Step 3 (Optional): Clear storage bucket files
-- Run this separately if you want to delete uploaded files from storage
-- SELECT storage.delete_object('notes', name)
-- FROM storage.objects
-- WHERE bucket_id = 'notes';
