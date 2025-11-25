-- Migration 028: Add baseline_document_ids to agent_sessions
-- Feature: Phase 16 - Document-Aware Prioritization
-- Purpose: Persist document set used for the last prioritization baseline to enable pending document detection

-- Add array column to capture baseline document IDs (processed_documents.id)
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS baseline_document_ids TEXT[];

-- Index for set membership queries and analytics
CREATE INDEX IF NOT EXISTS idx_agent_sessions_baseline_document_ids
  ON agent_sessions USING GIN (baseline_document_ids)
  WHERE baseline_document_ids IS NOT NULL;

-- Document the new column
COMMENT ON COLUMN agent_sessions.baseline_document_ids IS
  'Document IDs included in the most recent prioritization baseline (Phase 16)';

-- Verification helpers
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'agent_sessions' AND column_name = 'baseline_document_ids';
