-- Migration: Add modified_time column to uploaded_files for tracking Drive file timestamps
-- This enables detection of file modifications for Google Drive sync

ALTER TABLE uploaded_files
ADD COLUMN IF NOT EXISTS modified_time TIMESTAMPTZ;

-- Create index for efficient timestamp comparisons during folder polling
CREATE INDEX IF NOT EXISTS idx_uploaded_files_external_id_modified
ON uploaded_files(external_id, modified_time)
WHERE external_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN uploaded_files.modified_time IS 'Last modified timestamp from cloud provider (e.g., Google Drive modifiedTime). Used to detect file updates during folder sync.';
