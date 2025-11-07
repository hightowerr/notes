-- Migration 022: Add result column for gap analysis storage
-- Feature: 011-task-gap-filling
-- Date: 2025-11-05

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS result JSONB DEFAULT '{}'::jsonb;

UPDATE agent_sessions
SET result = '{}'::jsonb
WHERE result IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_gap_analysis
  ON agent_sessions
  USING gin ((result -> 'gap_analysis'));
