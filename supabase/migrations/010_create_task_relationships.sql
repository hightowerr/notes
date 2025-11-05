-- Migration 010: Create task_relationships table
-- Created: 2025-10-18
-- Feature: Phase 2 - Tool Registry & Execution
-- Dependencies: 008_create_task_embeddings.sql

-- Create enum types for relationship attributes
CREATE TYPE relationship_type_enum AS ENUM ('prerequisite', 'blocks', 'related');
CREATE TYPE detection_method_enum AS ENUM ('manual', 'ai');

-- Create task_relationships table
CREATE TABLE task_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_task_id TEXT NOT NULL REFERENCES task_embeddings(task_id) ON DELETE CASCADE,
  target_task_id TEXT NOT NULL REFERENCES task_embeddings(task_id) ON DELETE CASCADE,
  relationship_type relationship_type_enum NOT NULL,
  confidence_score NUMERIC(3, 2) NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  detection_method detection_method_enum NOT NULL,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate relationships (same source, target, type)
  CONSTRAINT unique_task_relationship UNIQUE (source_task_id, target_task_id, relationship_type),

  -- Prevent self-referencing relationships
  CONSTRAINT no_self_reference CHECK (source_task_id != target_task_id)
);

-- Create indexes for query performance

-- Query all relationships for a specific task (as source or target)
CREATE INDEX idx_task_relationships_source ON task_relationships(source_task_id);
CREATE INDEX idx_task_relationships_target ON task_relationships(target_task_id);

-- Filter by relationship type
CREATE INDEX idx_task_relationships_type ON task_relationships(relationship_type);

-- Composite index for common query pattern (task + type)
CREATE INDEX idx_task_relationships_source_type ON task_relationships(source_task_id, relationship_type);
CREATE INDEX idx_task_relationships_target_type ON task_relationships(target_task_id, relationship_type);

-- Filter by detection method (manual vs AI)
CREATE INDEX idx_task_relationships_detection ON task_relationships(detection_method);

-- Partial index for low-confidence AI relationships (confidence < 0.7)
CREATE INDEX idx_task_relationships_low_confidence
  ON task_relationships(confidence_score)
  WHERE detection_method = 'ai' AND confidence_score < 0.7;

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_task_relationships_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_relationships_updated_at
  BEFORE UPDATE ON task_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_task_relationships_updated_at();