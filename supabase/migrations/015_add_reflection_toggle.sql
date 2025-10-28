-- Migration 015: Add reflection toggle state and baseline/adjusted plans
-- Feature: 010-docs-shape-pitches
-- Date: 2025-10-26

-- Add toggle state to reflections with sensible default
ALTER TABLE reflections
  ADD COLUMN IF NOT EXISTS is_active_for_prioritization BOOLEAN DEFAULT true;

-- Ensure existing rows are marked active
UPDATE reflections
SET is_active_for_prioritization = true
WHERE is_active_for_prioritization IS NULL;

-- Index active reflections by user for fast lookups
CREATE INDEX IF NOT EXISTS idx_reflections_active
ON reflections (user_id, is_active_for_prioritization, created_at DESC);

-- Add baseline/adjusted plan snapshots to agent sessions
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS baseline_plan JSONB,
  ADD COLUMN IF NOT EXISTS adjusted_plan JSONB;

-- Index baseline plan creation time for staleness checks
CREATE INDEX IF NOT EXISTS idx_agent_sessions_baseline
ON agent_sessions ((baseline_plan->>'created_at'))
WHERE baseline_plan IS NOT NULL;
