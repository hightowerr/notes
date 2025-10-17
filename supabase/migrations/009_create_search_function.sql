-- Migration 009: Create RPC function for vector similarity search
-- Created: 2025-10-17
-- Feature: Vector Storage Foundation (T020)
-- Dependencies: 008_create_task_embeddings.sql

-- Create RPC function for semantic search
-- Performs vector similarity search with threshold filtering and ranking
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

-- Verify function exists
SELECT
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'search_similar_tasks';
