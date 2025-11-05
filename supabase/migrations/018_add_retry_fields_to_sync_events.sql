-- Migration 018: Add retry metadata to sync_events
-- Created: 2025-11-01
-- Feature: 010-cloud-sync
-- Purpose: Track retry attempts and scheduling for webhook processing

ALTER TABLE sync_events
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sync_events_next_retry_at
  ON sync_events(next_retry_at)
  WHERE next_retry_at IS NOT NULL;

COMMENT ON COLUMN sync_events.retry_count IS 'Number of retry attempts executed for this event';
COMMENT ON COLUMN sync_events.next_retry_at IS 'Timestamp when the next retry is scheduled';
