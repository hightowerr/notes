-- Migration 008: Create task_embeddings table for vector storage
-- Created: 2025-10-17
-- Feature: Vector Storage Foundation (T020)
-- Dependencies: 007_enable_pgvector.sql

-- Create task_embeddings table
-- Stores 1536-dimension embeddings for tasks extracted from documents
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

-- Create indexes for performance

-- Vector similarity search index (IVFFlat with 100 lists for P0 scale)
-- Lists parameter: sqrt(10000) ≈ 100 for target scale
CREATE INDEX idx_task_embeddings_vector
  ON task_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Task ID lookup (unique constraint provides index automatically)
-- Covered by UNIQUE constraint on task_id

-- Document ID foreign key lookup
CREATE INDEX idx_task_embeddings_document_id ON task_embeddings(document_id);

-- Partial index for pending/failed embeddings (excludes completed)
-- Most queries filter for completed embeddings, so index pending/failed separately
CREATE INDEX idx_task_embeddings_status ON task_embeddings(status) WHERE status != 'completed';

-- Create trigger to auto-update updated_at timestamp
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

-- Verify table structure
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'task_embeddings'
ORDER BY ordinal_position;
