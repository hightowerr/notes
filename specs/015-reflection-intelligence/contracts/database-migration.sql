-- Migration: 027_add_reflection_intents.sql
-- Feature: 015-reflection-intelligence
-- Description: Add reflection intent storage and task effect tracking
-- Date: 2025-11-23

-- ============================================================================
-- Create reflection_intents table
-- ============================================================================
-- Stores AI-interpreted intent for each reflection.
-- Created when reflection is added, recomputed only when text changes.

CREATE TABLE IF NOT EXISTS reflection_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key to parent reflection
  reflection_id UUID NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,

  -- Intent classification
  type TEXT NOT NULL CHECK (type IN (
    'constraint',    -- Blocks or limits tasks
    'opportunity',   -- Boosts focus area tasks
    'capacity',      -- Affects effort thresholds
    'sequencing',    -- Defines task ordering
    'information'    -- Context only, no direct action
  )),

  subtype TEXT NOT NULL CHECK (subtype IN (
    'blocker',       -- Hard constraint - tasks cannot proceed
    'soft-block',    -- Soft constraint - tasks deprioritized
    'boost',         -- Opportunity - tasks prioritized
    'energy-level',  -- Capacity - affects effort tolerance
    'dependency',    -- Sequencing - affects task order
    'context-only'   -- Information - no action
  )),

  -- Keywords for task matching (semantic search)
  keywords TEXT[] NOT NULL DEFAULT '{}',

  -- Enforcement strength
  strength TEXT NOT NULL CHECK (strength IN ('hard', 'soft')) DEFAULT 'soft',

  -- Optional temporal bounds (JSONB for flexibility)
  -- Format: { "until": "ISO date", "from": "ISO date", "days": number }
  duration JSONB,

  -- Human-readable interpretation for UI display
  summary TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One intent per reflection
  CONSTRAINT unique_reflection_intent UNIQUE (reflection_id)
);

-- Index for quick lookup by reflection ID
CREATE INDEX IF NOT EXISTS idx_reflection_intents_reflection_id
  ON reflection_intents(reflection_id);

-- Index for finding active constraints (for fast adjustment queries)
CREATE INDEX IF NOT EXISTS idx_reflection_intents_type
  ON reflection_intents(type, subtype);

-- ============================================================================
-- Row Level Security for reflection_intents
-- ============================================================================

ALTER TABLE reflection_intents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running migration
DROP POLICY IF EXISTS "Users can read own reflection intents" ON reflection_intents;
DROP POLICY IF EXISTS "Users can insert own reflection intents" ON reflection_intents;
DROP POLICY IF EXISTS "Users can update own reflection intents" ON reflection_intents;
DROP POLICY IF EXISTS "Users can delete own reflection intents" ON reflection_intents;

-- Read policy: User can read intents for their own reflections
CREATE POLICY "Users can read own reflection intents"
ON reflection_intents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM reflections
    WHERE reflections.id = reflection_intents.reflection_id
    AND (auth.uid()::text = reflections.user_id OR reflections.user_id = 'anonymous-user-p0')
  )
);

-- Insert policy: User can create intents for their own reflections
CREATE POLICY "Users can insert own reflection intents"
ON reflection_intents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM reflections
    WHERE reflections.id = reflection_intents.reflection_id
    AND (auth.uid()::text = reflections.user_id OR reflections.user_id = 'anonymous-user-p0')
  )
);

-- Update policy: User can update intents for their own reflections
CREATE POLICY "Users can update own reflection intents"
ON reflection_intents FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM reflections
    WHERE reflections.id = reflection_intents.reflection_id
    AND (auth.uid()::text = reflections.user_id OR reflections.user_id = 'anonymous-user-p0')
  )
);

-- Delete policy: User can delete intents for their own reflections
-- (Note: CASCADE on FK handles this automatically, but explicit policy for direct deletes)
CREATE POLICY "Users can delete own reflection intents"
ON reflection_intents FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM reflections
    WHERE reflections.id = reflection_intents.reflection_id
    AND (auth.uid()::text = reflections.user_id OR reflections.user_id = 'anonymous-user-p0')
  )
);

-- ============================================================================
-- Add reflection_effects column to task_embeddings
-- ============================================================================
-- Stores the effects of reflections on each task for attribution display.
-- Format: Array of { reflection_id, effect, magnitude, reason }

ALTER TABLE task_embeddings
  ADD COLUMN IF NOT EXISTS reflection_effects JSONB;

-- GIN index for JSONB queries (e.g., finding tasks affected by specific reflection)
CREATE INDEX IF NOT EXISTS idx_task_embeddings_reflection_effects
  ON task_embeddings USING GIN (reflection_effects);

-- ============================================================================
-- Update trigger for reflection_intents.updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_reflection_intent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reflection_intent_updated_at ON reflection_intents;
CREATE TRIGGER trigger_reflection_intent_updated_at
  BEFORE UPDATE ON reflection_intents
  FOR EACH ROW
  EXECUTE FUNCTION update_reflection_intent_updated_at();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE reflection_intents IS
'Stores AI-interpreted intent for each reflection. Used for fast adjustment without re-running LLM on every toggle. Created by reflectionInterpreter service.';

COMMENT ON COLUMN reflection_intents.type IS
'Primary intent category: constraint (blocks), opportunity (boosts), capacity (energy), sequencing (order), information (context only)';

COMMENT ON COLUMN reflection_intents.subtype IS
'Specific intent subtype within the category';

COMMENT ON COLUMN reflection_intents.keywords IS
'Keywords extracted from reflection for semantic task matching';

COMMENT ON COLUMN reflection_intents.strength IS
'Enforcement strength: hard (strict blocking), soft (deprioritization)';

COMMENT ON COLUMN reflection_intents.duration IS
'Optional temporal bounds as JSONB: { until, from, days }';

COMMENT ON COLUMN reflection_intents.summary IS
'Plain language interpretation shown to user for transparency';

COMMENT ON COLUMN task_embeddings.reflection_effects IS
'JSONB array of reflection effects on this task: [{ reflection_id, effect, magnitude, reason }]';
