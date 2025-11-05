-- Migration 005: Add context-aware filtering fields
-- Feature: 003-context-aware-action (T016, T018, T020)
-- Created: 2025-10-16
-- Description: Extends user_outcomes table with state/capacity fields and processed_documents with filtering decisions

-- Add state and capacity to user_outcomes (T016)
ALTER TABLE user_outcomes
ADD COLUMN state_preference TEXT CHECK (state_preference IN ('Energized', 'Low energy')),
ADD COLUMN daily_capacity_hours NUMERIC(4,2) CHECK (daily_capacity_hours > 0 AND daily_capacity_hours <= 24);

-- Add filtering decisions to processed_documents (T018, T020)
ALTER TABLE processed_documents
ADD COLUMN filtering_decisions JSONB;

-- Index for JSON queries (T020)
CREATE INDEX idx_filtering_decisions ON processed_documents USING GIN (filtering_decisions);

-- Comments for documentation
COMMENT ON COLUMN user_outcomes.state_preference IS 'User energy state: Energized (prefer high-effort) or Low energy (prefer low-effort)';
COMMENT ON COLUMN user_outcomes.daily_capacity_hours IS 'User daily time budget in hours (0.25-24)';
COMMENT ON COLUMN processed_documents.filtering_decisions IS 'Audit trail of context-aware filtering (NULL if no filtering applied)';

-- Verification queries
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_outcomes'
AND column_name IN ('state_preference', 'daily_capacity_hours');

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'processed_documents'
AND column_name = 'filtering_decisions';
