-- Migration 014: Ensure agent_sessions.user_id stores text identifiers
-- Created: 2025-10-19
-- Purpose: Existing environments created agent_sessions with UUID user_id. Convert to TEXT for default-user support.

DO $$
BEGIN
  -- Check if column is already TEXT; if so, skip.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'agent_sessions'
      AND column_name = 'user_id'
      AND data_type = 'text'
  ) THEN
    RAISE NOTICE 'agent_sessions.user_id already text. Skipping migration.';
  ELSE
    ALTER TABLE agent_sessions
      ALTER COLUMN user_id TYPE TEXT USING user_id::text;
  END IF;
END
$$;
