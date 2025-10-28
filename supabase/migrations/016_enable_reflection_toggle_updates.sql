-- Migration 016: Allow users to toggle reflection activity
-- Feature: 016-reflection-toggle
-- Date: 2025-10-30

-- Permit users to update their own reflections to flip the active flag.
DROP POLICY IF EXISTS "Users can toggle reflection activity" ON reflections;

CREATE POLICY "Users can toggle reflection activity"
ON reflections FOR UPDATE
USING (
  auth.uid()::text = user_id
  OR user_id = 'anonymous-user-p0'
)
WITH CHECK (
  auth.uid()::text = user_id
  OR user_id = 'anonymous-user-p0'
);
