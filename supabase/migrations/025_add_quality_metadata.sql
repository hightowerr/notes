-- Add quality metadata column to task_embeddings table
-- Stores clarity scores, quality indicators, and improvement suggestions
ALTER TABLE task_embeddings
  ADD COLUMN IF NOT EXISTS quality_metadata JSONB DEFAULT '{}'::jsonb;

-- Create GIN index for fast quality score filtering
CREATE INDEX IF NOT EXISTS idx_task_embeddings_quality_metadata
  ON task_embeddings
  USING gin (quality_metadata);

-- Create partial index for tasks needing review (clarity_score < 0.5)
CREATE INDEX IF NOT EXISTS idx_task_embeddings_needs_work
  ON task_embeddings ((quality_metadata->>'clarity_score'))
  WHERE (quality_metadata->>'clarity_score')::numeric < 0.5;