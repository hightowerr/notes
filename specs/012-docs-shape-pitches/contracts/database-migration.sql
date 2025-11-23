-- Migration 026: Phase 14 - Unified Prioritization with Evaluator-Optimizer Pattern
-- Description: Adds excluded_tasks and evaluation_metadata columns to agent_sessions table
-- Author: Phase 14 Implementation Team
-- Date: 2025-11-18
-- Dependencies: Requires existing agent_sessions table from Phase 3

-- ==============================================================================
-- STEP 1: Add New Columns (Non-Breaking, Nullable)
-- ==============================================================================

-- Add excluded_tasks column to store filtered-out tasks with reasoning
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS excluded_tasks JSONB;

-- Add evaluation_metadata column to store hybrid loop execution details
ALTER TABLE agent_sessions
  ADD COLUMN IF NOT EXISTS evaluation_metadata JSONB;

-- Add column comments for documentation
COMMENT ON COLUMN agent_sessions.excluded_tasks IS
  'Array of {task_id, task_text, exclusion_reason, alignment_score} - tasks filtered out during outcome alignment stage (Phase 14)';

COMMENT ON COLUMN agent_sessions.evaluation_metadata IS
  'Hybrid loop metadata: {iterations, duration_ms, evaluation_triggered, chain_of_thought, converged, final_confidence} - tracks evaluator-optimizer pattern execution (Phase 14)';

-- ==============================================================================
-- STEP 2: Create Indexes for Query Performance
-- ==============================================================================

-- GIN index for JSONB excluded_tasks queries (e.g., searching exclusion reasons)
CREATE INDEX IF NOT EXISTS idx_agent_sessions_excluded_tasks_gin
  ON agent_sessions USING GIN (excluded_tasks)
  WHERE excluded_tasks IS NOT NULL;

-- GIN index for JSONB evaluation_metadata queries (e.g., finding evaluation failures)
CREATE INDEX IF NOT EXISTS idx_agent_sessions_evaluation_metadata_gin
  ON agent_sessions USING GIN (evaluation_metadata)
  WHERE evaluation_metadata IS NOT NULL;

-- B-tree index for 30-day cleanup job (retention policy per FR-023)
CREATE INDEX IF NOT EXISTS idx_agent_sessions_cleanup
  ON agent_sessions (created_at)
  WHERE evaluation_metadata IS NOT NULL
    AND status = 'completed';

-- ==============================================================================
-- STEP 3: Backfill Existing Completed Sessions (Optional)
-- ==============================================================================
-- This step adds empty metadata to existing sessions for consistency.
-- SAFE TO SKIP if you prefer null values for old sessions.

UPDATE agent_sessions
SET
  excluded_tasks = '[]'::jsonb,
  evaluation_metadata = jsonb_build_object(
    'iterations', 1,
    'duration_ms', 0,
    'evaluation_triggered', false,
    'chain_of_thought', '[]'::jsonb,
    'converged', true,
    'final_confidence', 0.5
  )
WHERE excluded_tasks IS NULL
  AND status = 'completed'
  AND created_at < NOW(); -- Only backfill old sessions

-- ==============================================================================
-- STEP 4: Create Validation Function (Optional but Recommended)
-- ==============================================================================
-- PostgreSQL function to validate JSONB structure before insert/update

CREATE OR REPLACE FUNCTION validate_excluded_tasks(tasks JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if tasks is an array
  IF jsonb_typeof(tasks) != 'array' THEN
    RETURN FALSE;
  END IF;

  -- Check each task object has required fields
  RETURN (
    SELECT bool_and(
      (task->>'task_id') IS NOT NULL
      AND (task->>'task_text') IS NOT NULL
      AND (task->>'exclusion_reason') IS NOT NULL
      AND (task->>'alignment_score') IS NOT NULL
      AND (task->>'alignment_score')::numeric BETWEEN 0 AND 10
    )
    FROM jsonb_array_elements(tasks) AS task
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION validate_evaluation_metadata(metadata JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check required top-level fields
  IF (metadata->>'iterations') IS NULL
     OR (metadata->>'duration_ms') IS NULL
     OR (metadata->>'evaluation_triggered') IS NULL
     OR (metadata->>'converged') IS NULL
     OR (metadata->>'final_confidence') IS NULL
     OR (metadata->'chain_of_thought') IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Validate numeric ranges
  IF (metadata->>'iterations')::int NOT BETWEEN 1 AND 3
     OR (metadata->>'duration_ms')::int < 0
     OR (metadata->>'final_confidence')::numeric NOT BETWEEN 0 AND 1 THEN
    RETURN FALSE;
  END IF;

  -- Validate chain_of_thought is array
  IF jsonb_typeof(metadata->'chain_of_thought') != 'array' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ==============================================================================
-- STEP 5: Add CHECK Constraints (Optional - Strict Validation)
-- ==============================================================================
-- Uncomment if you want PostgreSQL to enforce schema validation at insert/update.
-- NOTE: This may slow down writes slightly.

-- ALTER TABLE agent_sessions
--   ADD CONSTRAINT check_excluded_tasks_valid
--   CHECK (excluded_tasks IS NULL OR validate_excluded_tasks(excluded_tasks));

-- ALTER TABLE agent_sessions
--   ADD CONSTRAINT check_evaluation_metadata_valid
--   CHECK (evaluation_metadata IS NULL OR validate_evaluation_metadata(evaluation_metadata));

-- ==============================================================================
-- STEP 6: Create Cleanup Job (30-Day Retention per FR-023)
-- ==============================================================================
-- Uses pg_cron extension (requires SUPERUSER to install)
-- Alternative: Run this as a scheduled script via cron/systemd timer

-- Install pg_cron extension (run once, requires SUPERUSER)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 2 AM UTC
-- SELECT cron.schedule(
--   'cleanup-old-agent-sessions',
--   '0 2 * * *', -- Daily at 2 AM UTC
--   $$
--   DELETE FROM agent_sessions
--   WHERE evaluation_metadata IS NOT NULL
--     AND created_at < NOW() - INTERVAL '30 days';
--   $$
-- );

-- ==============================================================================
-- STEP 7: Grant Permissions (Adjust as needed for your security model)
-- ==============================================================================

-- Grant SELECT on new columns to application role
-- GRANT SELECT ON agent_sessions TO your_app_role;

-- Grant UPDATE on new columns to application role
-- GRANT UPDATE (excluded_tasks, evaluation_metadata) ON agent_sessions TO your_app_role;

-- ==============================================================================
-- VERIFICATION QUERIES
-- ==============================================================================

-- Verify columns added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agent_sessions'
  AND column_name IN ('excluded_tasks', 'evaluation_metadata');

-- Verify indexes created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'agent_sessions'
  AND indexname LIKE '%excluded_tasks%' OR indexname LIKE '%evaluation_metadata%';

-- Check functions created
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name LIKE 'validate_%';

-- Sample query: Find sessions with evaluation loop
SELECT
  id,
  status,
  (evaluation_metadata->>'iterations')::int AS iterations,
  (evaluation_metadata->>'evaluation_triggered')::boolean AS eval_triggered,
  (evaluation_metadata->>'final_confidence')::numeric AS confidence
FROM agent_sessions
WHERE evaluation_metadata IS NOT NULL
  AND (evaluation_metadata->>'evaluation_triggered')::boolean = true
ORDER BY created_at DESC
LIMIT 10;

-- Sample query: Find over-filtered sessions (<10 included tasks)
SELECT
  id,
  jsonb_array_length(excluded_tasks) AS excluded_count,
  (evaluation_metadata->>'iterations')::int AS iterations
FROM agent_sessions
WHERE excluded_tasks IS NOT NULL
  AND jsonb_array_length(excluded_tasks) > 100
ORDER BY created_at DESC
LIMIT 10;

-- ==============================================================================
-- ROLLBACK SCRIPT (Emergency Use Only)
-- ==============================================================================

-- WARNING: This will permanently delete data in excluded_tasks and evaluation_metadata columns.
-- Only run if you need to completely revert Phase 14 migration.

-- DROP INDEX IF EXISTS idx_agent_sessions_excluded_tasks_gin;
-- DROP INDEX IF EXISTS idx_agent_sessions_evaluation_metadata_gin;
-- DROP INDEX IF EXISTS idx_agent_sessions_cleanup;
-- DROP FUNCTION IF EXISTS validate_excluded_tasks(JSONB);
-- DROP FUNCTION IF EXISTS validate_evaluation_metadata(JSONB);
-- ALTER TABLE agent_sessions DROP COLUMN IF EXISTS excluded_tasks;
-- ALTER TABLE agent_sessions DROP COLUMN IF EXISTS evaluation_metadata;

-- If using pg_cron:
-- SELECT cron.unschedule('cleanup-old-agent-sessions');

-- ==============================================================================
-- MIGRATION COMPLETE
-- ==============================================================================

-- Next steps:
-- 1. Deploy schema changes to staging environment
-- 2. Run verification queries
-- 3. Test Phase 14 agent with new columns
-- 4. Deploy to production with feature flag enabled (USE_UNIFIED_PRIORITIZATION=true)
-- 5. Monitor evaluation_triggered rates (target: 15-25% per NFR-006)
