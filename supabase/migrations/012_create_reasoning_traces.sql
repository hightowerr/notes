-- Migration 012: Create reasoning_traces table
-- Created: 2025-10-19
-- Feature: Phase 3 - Agent Runtime & Reasoning Loop
-- Dependencies: 011_create_agent_sessions.sql

-- Create reasoning_traces table to store execution details (FR-016, FR-018, FR-020)
CREATE TABLE reasoning_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  steps JSONB[] NOT NULL,
  total_duration_ms INTEGER NOT NULL CHECK (total_duration_ms >= 0),
  total_steps INTEGER NOT NULL CHECK (total_steps >= 1 AND total_steps <= 10),
  tools_used_count JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_reasoning_traces_step_count
    CHECK (array_length(steps, 1) = total_steps)
);

-- Fast retrieval for session detail queries
CREATE INDEX idx_reasoning_traces_session_id
  ON reasoning_traces(session_id);

-- Support cleanup queries by timestamp
CREATE INDEX idx_reasoning_traces_created_at
  ON reasoning_traces(created_at);
