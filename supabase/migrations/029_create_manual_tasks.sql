-- Migration 029: Manual Task Placement Infrastructure
-- Feature: 016-manual-task-creation
-- Date: 2025-01-26
-- Description: Adds manual_tasks table for agent placement analysis and discard pile management

-- ==============================================================================
-- 1. Create manual_tasks table
-- ==============================================================================

CREATE TABLE IF NOT EXISTS manual_tasks (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign key to task_embeddings
  task_id TEXT NOT NULL UNIQUE,

  -- Analysis state
  status TEXT NOT NULL DEFAULT 'analyzing'
    CHECK (status IN ('analyzing', 'prioritized', 'not_relevant', 'conflict')),
  agent_rank INTEGER,                    -- 1-indexed position (NULL if not prioritized)
  placement_reason TEXT,                  -- Why agent included task
  exclusion_reason TEXT,                  -- Why agent rejected task

  -- Conflict details (duplicate detection)
  duplicate_task_id TEXT,                 -- Reference to similar task
  similarity_score FLOAT,                 -- Cosine similarity 0.0-1.0

  -- User actions
  marked_done_at TIMESTAMPTZ,             -- Completion timestamp
  deleted_at TIMESTAMPTZ,                 -- Soft delete (30-day recovery)

  -- Metadata
  outcome_id UUID,                        -- Associated user goal
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Foreign key constraints
  CONSTRAINT fk_manual_tasks_task_id
    FOREIGN KEY (task_id)
    REFERENCES task_embeddings(task_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_manual_tasks_outcome_id
    FOREIGN KEY (outcome_id)
    REFERENCES user_outcomes(id)
    ON DELETE SET NULL,

  -- Business logic constraints
  CONSTRAINT check_prioritized_has_rank
    CHECK (status != 'prioritized' OR agent_rank IS NOT NULL),

  CONSTRAINT check_not_relevant_has_reason
    CHECK (status != 'not_relevant' OR exclusion_reason IS NOT NULL),

  CONSTRAINT check_conflict_has_details
    CHECK (status != 'conflict' OR (duplicate_task_id IS NOT NULL AND similarity_score IS NOT NULL))
);

-- ==============================================================================
-- 2. Create indexes
-- ==============================================================================

-- Status index (partial - exclude soft deletes)
CREATE INDEX idx_manual_tasks_status
  ON manual_tasks(status)
  WHERE deleted_at IS NULL;

-- Outcome index (partial - exclude soft deletes)
CREATE INDEX idx_manual_tasks_outcome
  ON manual_tasks(outcome_id)
  WHERE deleted_at IS NULL;

-- Created timestamp index (DESC for recent-first queries)
CREATE INDEX idx_manual_tasks_created
  ON manual_tasks(created_at DESC);

-- Soft delete index (for cleanup job)
CREATE INDEX idx_manual_tasks_deleted
  ON manual_tasks(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ==============================================================================
-- 3. Create updated_at trigger
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_manual_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manual_tasks_updated_at
  BEFORE UPDATE ON manual_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_manual_tasks_updated_at();

-- ==============================================================================
-- 4. Create soft delete cleanup function (cron job)
-- ==============================================================================

CREATE OR REPLACE FUNCTION cleanup_manual_tasks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Permanently delete tasks soft-deleted >30 days ago
  DELETE FROM manual_tasks
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Note: Schedule this function with pg_cron:
-- SELECT cron.schedule('cleanup-manual-tasks', '0 2 * * *', 'SELECT cleanup_manual_tasks();');

-- ==============================================================================
-- 5. Add comments for documentation
-- ==============================================================================

COMMENT ON TABLE manual_tasks IS 'Stores agent placement analysis for user-created tasks (Phase 18)';
COMMENT ON COLUMN manual_tasks.status IS 'Analysis state: analyzing → prioritized|not_relevant|conflict';
COMMENT ON COLUMN manual_tasks.agent_rank IS '1-indexed position in priority list (NULL if excluded)';
COMMENT ON COLUMN manual_tasks.duplicate_task_id IS 'ID of similar existing task if conflict detected';
COMMENT ON COLUMN manual_tasks.similarity_score IS 'Cosine similarity 0.0-1.0 (>0.85 = duplicate)';
COMMENT ON COLUMN manual_tasks.deleted_at IS 'Soft delete timestamp (30-day recovery window)';
COMMENT ON FUNCTION cleanup_manual_tasks() IS 'Purges soft-deleted tasks older than 30 days (run daily)';

-- ==============================================================================
-- 6. Rollback script (for migration revert)
-- ==============================================================================

-- Uncomment and run to rollback:
-- DROP TRIGGER IF EXISTS trigger_manual_tasks_updated_at ON manual_tasks;
-- DROP FUNCTION IF EXISTS update_manual_tasks_updated_at();
-- DROP FUNCTION IF EXISTS cleanup_manual_tasks();
-- DROP TABLE IF EXISTS manual_tasks CASCADE;
