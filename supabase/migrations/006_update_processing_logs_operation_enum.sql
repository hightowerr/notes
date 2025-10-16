-- Migration 006: Expand processing_logs.operation enum for filtering audit trail
-- Feature: 003-context-aware-action (T020)
-- Created: 2025-10-16
-- Description: Allow the processing_logs table to capture cleanup and action filtering operations

-- Update processing_logs.operation to support context-aware filtering logs
ALTER TABLE processing_logs
  DROP CONSTRAINT IF EXISTS processing_logs_operation_check;

ALTER TABLE processing_logs
  ADD CONSTRAINT processing_logs_operation_check CHECK (
    operation IN (
      'upload',
      'convert',
      'summarize',
      'store',
      'retry',
      'error',
      'cleanup',
      'action_filtering_applied'
    )
  );

COMMENT ON COLUMN processing_logs.operation IS
  'Operation type: upload, convert, summarize, store, retry, error, cleanup, action_filtering_applied';

-- Verification queries
SELECT constraint_name
FROM information_schema.constraint_column_usage
WHERE table_name = 'processing_logs'
  AND column_name = 'operation';

SELECT pg_catalog.col_description('processing_logs'::regclass, ordinal_position) AS column_comment
FROM information_schema.columns
WHERE table_name = 'processing_logs'
  AND column_name = 'operation';
