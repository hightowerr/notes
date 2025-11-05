-- Migration 019: Add retry context metadata to sync_events
-- Created: 2025-11-01
-- Feature: 010-cloud-sync
-- Purpose: Persist retry execution context for recovery after restarts

ALTER TABLE sync_events
ADD COLUMN IF NOT EXISTS retry_context JSONB;

COMMENT ON COLUMN sync_events.retry_context IS 'Serialized context required to resume webhook retry execution.';
