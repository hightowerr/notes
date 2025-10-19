-- Migration 011: Create agent_sessions table
-- Created: 2025-10-19
-- Feature: Phase 3 - Agent Runtime & Reasoning Loop
-- Dependencies: 004_create_user_outcomes.sql

-- Create status enum for agent sessions
CREATE TYPE agent_session_status_enum AS ENUM ('running', 'completed', 'failed');

-- Create agent_sessions table
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  outcome_id UUID NOT NULL REFERENCES user_outcomes(id) ON DELETE CASCADE,
  status agent_session_status_enum NOT NULL DEFAULT 'running',
  prioritized_plan JSONB,
  execution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure only one active session per user (FR-036)
  CONSTRAINT uq_agent_sessions_user UNIQUE (user_id),

  -- Prioritized plan required when status is completed, null otherwise
  CONSTRAINT chk_agent_sessions_prioritized_plan
    CHECK (
      (status = 'completed' AND prioritized_plan IS NOT NULL)
      OR (status IN ('running', 'failed') AND prioritized_plan IS NULL)
    )
);

-- Index for cleanup queries (FR-020 observability)
CREATE INDEX idx_agent_sessions_created_at ON agent_sessions(created_at DESC);

-- Trigger to maintain updated_at timestamp
CREATE OR REPLACE FUNCTION set_agent_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agent_sessions_updated_at
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_agent_sessions_updated_at();
