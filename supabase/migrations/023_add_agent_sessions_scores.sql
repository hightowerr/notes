-- Migration 023: Add strategic_scores column to agent_sessions
-- Feature: US7 - Quick Wins Filter
-- Date: 2025-11-28

ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS strategic_scores JSONB DEFAULT '{}'::jsonb;

-- Update existing rows to have empty object instead of null
UPDATE agent_sessions
SET strategic_scores = '{}'::jsonb
WHERE strategic_scores IS NULL;
