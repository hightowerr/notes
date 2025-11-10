-- Migration 024: Add manual task support columns and index
-- Feature: 013-docs-shape-pitches
-- Description: Adds is_manual + created_by columns and partial index for manual task queries

ALTER TABLE task_embeddings
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE task_embeddings
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'default-user';

UPDATE task_embeddings
SET is_manual = FALSE
WHERE is_manual IS NULL;

UPDATE task_embeddings
SET created_by = 'default-user'
WHERE created_by IS NULL OR created_by = '';

CREATE INDEX IF NOT EXISTS idx_task_embeddings_manual
  ON task_embeddings (is_manual, created_by)
  WHERE is_manual = TRUE;
