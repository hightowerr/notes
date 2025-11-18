-- Migration: 025_add_strategic_scores.sql
-- Feature: Strategic Prioritization (Impact-Effort Model)
-- Branch: 001-strategic-prioritization-impact
-- Date: 2025-11-17
-- Status: Draft

-- PURPOSE:
-- Add JSONB columns for strategic scoring and manual overrides
-- All changes are backward-compatible (additive only)

-- ============================================================================
-- MODIFICATION 1: Add strategic_scores to agent_sessions
-- ============================================================================

-- Add strategic_scores JSONB column
-- Stores Impact/Effort/Confidence/Priority for all tasks in a session
ALTER TABLE agent_sessions
ADD COLUMN IF NOT EXISTS strategic_scores JSONB DEFAULT '{}';

-- Add GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_agent_sessions_strategic_scores
ON agent_sessions USING GIN (strategic_scores);

-- Add comment for documentation
COMMENT ON COLUMN agent_sessions.strategic_scores IS
'Strategic scores for all tasks in this session. Format:
{
  "task-id": {
    "impact": 0-10,
    "effort": 0.5-160 (hours),
    "confidence": 0-1,
    "priority": 0-100,
    "reasoning": {
      "impact_keywords": ["keyword1", "keyword2"],
      "effort_source": "extracted" | "heuristic",
      "effort_hint": "optional string",
      "complexity_modifiers": ["modifier1"]
    },
    "scored_at": "ISO8601 timestamp"
  }
}';

-- ============================================================================
-- MODIFICATION 2: Add manual_overrides to task_embeddings
-- ============================================================================

-- Add manual_overrides JSONB column
-- Stores user-adjusted Impact/Effort values
ALTER TABLE task_embeddings
ADD COLUMN IF NOT EXISTS manual_overrides JSONB DEFAULT NULL;

-- Add partial index (only for rows with overrides)
CREATE INDEX IF NOT EXISTS idx_task_embeddings_manual_overrides
ON task_embeddings ((manual_overrides IS NOT NULL))
WHERE manual_overrides IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN task_embeddings.manual_overrides IS
'User-adjusted Impact/Effort scores that override AI estimates. Format:
{
  "impact": 0-10,
  "effort": 0.5-160 (hours),
  "reason": "optional string (max 500 chars)",
  "timestamp": "ISO8601 timestamp",
  "session_id": "UUID of session when override created"
}
Cleared (set to NULL) when agent re-runs prioritization.';

-- ============================================================================
-- MODIFICATION 3: Extend processing_logs for retry tracking
-- ============================================================================

-- Add new enum value for retry_exhausted status
-- (Assumes processing_logs.status is already an enum or varchar)
-- If enum, use: ALTER TYPE processing_status ADD VALUE IF NOT EXISTS 'retry_exhausted';
-- For varchar, no migration needed

-- Add comment for retry tracking in metadata column
COMMENT ON COLUMN processing_logs.metadata IS
'JSONB metadata for processing details. For retry tracking:
{
  "retry_attempts": 0-3,
  "last_error": "error message",
  "failed_at": "ISO8601 timestamp",
  "task_id": "task ID that failed"
}';

-- ============================================================================
-- VALIDATION CONSTRAINTS
-- ============================================================================

-- Constraint: Ensure strategic_scores is valid JSON object
ALTER TABLE agent_sessions
ADD CONSTRAINT strategic_scores_is_object
CHECK (jsonb_typeof(strategic_scores) = 'object' OR strategic_scores IS NULL);

-- Constraint: Ensure manual_overrides is valid JSON object (if not null)
ALTER TABLE task_embeddings
ADD CONSTRAINT manual_overrides_is_object
CHECK (jsonb_typeof(manual_overrides) = 'object' OR manual_overrides IS NULL);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Get strategic score for a task
CREATE OR REPLACE FUNCTION get_strategic_score(
  p_session_id UUID,
  p_task_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_score JSONB;
BEGIN
  SELECT strategic_scores->p_task_id INTO v_score
  FROM agent_sessions
  WHERE id = p_session_id;

  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION get_strategic_score IS
'Retrieve strategic score for a specific task in a session.
Returns NULL if session or task not found.';

-- Function: Clear all manual overrides for a session
CREATE OR REPLACE FUNCTION clear_manual_overrides(
  p_session_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH cleared AS (
    UPDATE task_embeddings
    SET manual_overrides = NULL
    WHERE manual_overrides->>'session_id' = p_session_id::TEXT
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM cleared;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION clear_manual_overrides IS
'Clear all manual overrides for a given session.
Returns count of cleared overrides.
Called when agent re-runs prioritization.';

-- ============================================================================
-- SAMPLE DATA (for testing/development)
-- ============================================================================

-- Insert sample strategic scores
-- (Commented out - run manually if needed)
/*
UPDATE agent_sessions
SET strategic_scores = '{
  "task-001": {
    "impact": 8.5,
    "effort": 16,
    "confidence": 0.78,
    "priority": 66.3,
    "reasoning": {
      "impact_keywords": ["payment", "revenue"],
      "effort_source": "extracted",
      "effort_hint": "16h"
    },
    "scored_at": "2025-11-17T14:30:00Z"
  },
  "task-002": {
    "impact": 1.0,
    "effort": 0.5,
    "confidence": 0.95,
    "priority": 19.0,
    "reasoning": {
      "impact_keywords": [],
      "effort_source": "heuristic",
      "complexity_modifiers": ["simple"]
    },
    "scored_at": "2025-11-17T14:30:05Z"
  }
}'::JSONB
WHERE id = (SELECT id FROM agent_sessions ORDER BY created_at DESC LIMIT 1);
*/

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================

-- To rollback this migration, run:
/*
-- Drop helper functions
DROP FUNCTION IF EXISTS get_strategic_score(UUID, TEXT);
DROP FUNCTION IF EXISTS clear_manual_overrides(UUID);

-- Drop constraints
ALTER TABLE agent_sessions DROP CONSTRAINT IF EXISTS strategic_scores_is_object;
ALTER TABLE task_embeddings DROP CONSTRAINT IF EXISTS manual_overrides_is_object;

-- Drop indexes
DROP INDEX IF EXISTS idx_agent_sessions_strategic_scores;
DROP INDEX IF EXISTS idx_task_embeddings_manual_overrides;

-- Drop columns
ALTER TABLE agent_sessions DROP COLUMN IF EXISTS strategic_scores;
ALTER TABLE task_embeddings DROP COLUMN IF EXISTS manual_overrides;
*/

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify strategic_scores column exists and has default value
/*
SELECT column_name, column_default, data_type
FROM information_schema.columns
WHERE table_name = 'agent_sessions'
  AND column_name = 'strategic_scores';
*/

-- Verify manual_overrides column exists
/*
SELECT column_name, column_default, data_type
FROM information_schema.columns
WHERE table_name = 'task_embeddings'
  AND column_name = 'manual_overrides';
*/

-- Verify indexes created
/*
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('agent_sessions', 'task_embeddings')
  AND indexname LIKE '%strategic%' OR indexname LIKE '%override%';
*/

-- Verify helper functions exist
/*
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('get_strategic_score', 'clear_manual_overrides');
*/

-- ============================================================================
-- MIGRATION CHECKLIST
-- ============================================================================

-- [ ] Run migration in development environment
-- [ ] Verify columns added with: SELECT * FROM information_schema.columns WHERE ...
-- [ ] Verify indexes created with: SELECT * FROM pg_indexes WHERE ...
-- [ ] Test helper functions with sample data
-- [ ] Run application tests (contract, integration, unit)
-- [ ] Review query performance with EXPLAIN ANALYZE
-- [ ] Document any breaking changes (none expected)
-- [ ] Create rollback SQL script
-- [ ] Run migration in staging environment
-- [ ] Smoke test /api/agent/prioritize endpoint
-- [ ] Run migration in production (during maintenance window)
-- [ ] Monitor Sentry/logs for errors
-- [ ] Verify data integrity with spot checks

-- END OF MIGRATION
