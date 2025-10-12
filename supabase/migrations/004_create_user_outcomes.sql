-- Create user_outcomes table
-- Migration 004: Outcome Management feature
-- Date: 2025-10-11
-- Spec: specs/002-outcome-management-shape/

CREATE TABLE user_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('increase', 'decrease', 'maintain', 'launch', 'ship')),
  object_text TEXT NOT NULL CHECK (LENGTH(object_text) BETWEEN 3 AND 100),
  metric_text TEXT NOT NULL CHECK (LENGTH(metric_text) BETWEEN 3 AND 100),
  clarifier TEXT NOT NULL CHECK (LENGTH(clarifier) BETWEEN 3 AND 150),
  assembled_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Enforce single active outcome per user (unique partial index)
CREATE UNIQUE INDEX idx_active_outcome
ON user_outcomes(user_id)
WHERE is_active = true;

-- Index for fast lookups by user_id
CREATE INDEX idx_user_outcomes_user_id ON user_outcomes(user_id);

-- Index for created_at sorting
CREATE INDEX idx_user_outcomes_created_at ON user_outcomes(created_at DESC);

-- Enable Row Level Security (RLS) - for future multi-user support
ALTER TABLE user_outcomes ENABLE ROW LEVEL SECURITY;

-- Temporary policy for P0 (single-user, no authentication)
-- REPLACE THIS when adding authentication
CREATE POLICY "Allow all for single user" ON user_outcomes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_outcomes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on UPDATE
CREATE TRIGGER update_user_outcomes_updated_at
BEFORE UPDATE ON user_outcomes
FOR EACH ROW
EXECUTE FUNCTION update_user_outcomes_updated_at();
