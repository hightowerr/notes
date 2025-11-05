-- Migration 015: Add source tracking to uploaded_files
-- Created: 2025-10-31
-- Feature: 010-cloud-sync
-- Purpose: Track document provenance and sync state for Google Drive and text input sources

DO $$
BEGIN
  -- Add source column for provenance tracking
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'uploaded_files'
      AND column_name = 'source'
  ) THEN
    ALTER TABLE uploaded_files
      ADD COLUMN source TEXT NOT NULL DEFAULT 'manual_upload'
      CHECK (source IN ('manual_upload', 'google_drive', 'text_input'));
  END IF;

  -- Add external_id column for provider file references
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'uploaded_files'
      AND column_name = 'external_id'
  ) THEN
    ALTER TABLE uploaded_files
      ADD COLUMN external_id TEXT;
  END IF;

  -- Add sync_enabled flag to signal webhook participation
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'uploaded_files'
      AND column_name = 'sync_enabled'
  ) THEN
    ALTER TABLE uploaded_files
      ADD COLUMN sync_enabled BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Make storage_path nullable for virtual (text_input) documents
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'uploaded_files'
      AND column_name = 'storage_path'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE uploaded_files
      ALTER COLUMN storage_path DROP NOT NULL;
  END IF;
END
$$;

-- Ensure sync_enabled defaults to FALSE for legacy rows without a value
UPDATE uploaded_files
SET sync_enabled = false
WHERE sync_enabled IS NULL;

-- Index external_id lookups for webhook processing
CREATE INDEX IF NOT EXISTS idx_uploaded_files_external_id
  ON uploaded_files(external_id)
  WHERE external_id IS NOT NULL;

-- Document new schema fields
COMMENT ON COLUMN uploaded_files.source IS 'Provenance: manual_upload | google_drive | text_input';
COMMENT ON COLUMN uploaded_files.external_id IS 'Provider-specific identifier (e.g. Google Drive file ID)';
COMMENT ON COLUMN uploaded_files.sync_enabled IS 'TRUE when file participates in ongoing webhook-driven sync';
COMMENT ON COLUMN uploaded_files.storage_path IS 'Nullable for virtual/text-input documents that skip blob storage';
