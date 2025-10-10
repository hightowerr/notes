-- Migration: Add queue_position column for concurrent upload management
-- Date: 2025-10-10
-- Task: T005 - Concurrent upload queue system (max 3 parallel)
--
-- Purpose: Track queue position for files waiting to be processed
-- Implementation: P0 uses in-memory queue, this column is for observability only

-- =============================================================================
-- Add queue_position column to uploaded_files
-- =============================================================================

-- Add column (nullable, defaults to NULL)
ALTER TABLE uploaded_files
ADD COLUMN IF NOT EXISTS queue_position INTEGER DEFAULT NULL;

-- Add index for queue position lookups (only non-null values)
CREATE INDEX IF NOT EXISTS idx_uploaded_files_queue_position
ON uploaded_files(queue_position)
WHERE queue_position IS NOT NULL;

-- Add comment
COMMENT ON COLUMN uploaded_files.queue_position IS
'Queue position for pending uploads (1-based). NULL if processing immediately or already processed. Used for observability - actual queue state is in-memory (T005).';

-- =============================================================================
-- Verification
-- =============================================================================

-- Query to verify column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'uploaded_files'
    AND column_name = 'queue_position'
  ) THEN
    RAISE NOTICE 'Migration 003 applied successfully: queue_position column added';
  ELSE
    RAISE EXCEPTION 'Migration 003 failed: queue_position column not found';
  END IF;
END $$;
