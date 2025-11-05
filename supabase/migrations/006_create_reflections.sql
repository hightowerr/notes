-- Create reflections table for user context capture
-- Feature: 004-reflection-capture-quick
-- Date: 2025-10-16
-- Migration: 006

-- Create reflections table
CREATE TABLE IF NOT EXISTS reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- Changed from UUID to TEXT to support anonymous user ID
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 10 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create composite index for efficient sorted queries
-- Optimizes: SELECT * FROM reflections WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
CREATE INDEX IF NOT EXISTS idx_reflections_user_recent
ON reflections(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Users can read own reflections" ON reflections;
DROP POLICY IF EXISTS "Users can insert own reflections" ON reflections;

-- RLS Policy: Users can read own reflections (P0: Allow anonymous access)
CREATE POLICY "Users can read own reflections"
ON reflections FOR SELECT
USING (
  auth.uid()::text = user_id OR
  user_id = 'anonymous-user-p0'
);

-- RLS Policy: Users can insert own reflections (P0: Allow anonymous access)
CREATE POLICY "Users can insert own reflections"
ON reflections FOR INSERT
WITH CHECK (
  auth.uid()::text = user_id OR
  user_id = 'anonymous-user-p0'
);

-- No UPDATE or DELETE policies (append-only enforced)
-- This prevents editing or deleting reflections after creation

-- Add helpful comment
COMMENT ON TABLE reflections IS
'Stores user context reflections (energy, constraints, blockers) for dynamic priority adjustment. Append-only model - no editing or deleting after creation.';
