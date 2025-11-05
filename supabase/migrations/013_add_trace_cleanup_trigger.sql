-- Migration 013: Add trace cleanup trigger
-- Created: 2025-10-19
-- Feature: Phase 3 - Agent Runtime & Reasoning Loop
-- Dependencies: 012_create_reasoning_traces.sql

-- Trigger function to enforce 7-day retention window (FR-020)
CREATE OR REPLACE FUNCTION cleanup_old_reasoning_traces()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM reasoning_traces
  WHERE created_at < NOW() - INTERVAL '7 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_cleanup_reasoning_traces
  AFTER INSERT ON reasoning_traces
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_old_reasoning_traces();
