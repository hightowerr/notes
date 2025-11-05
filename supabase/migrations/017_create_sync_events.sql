-- Migration 017: Create sync_events table
-- Created: 2025-10-31
-- Feature: 010-cloud-sync
-- Purpose: Record audit events for cloud storage synchronisation

CREATE TABLE IF NOT EXISTS sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES cloud_connections(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('file_added', 'file_modified', 'file_deleted', 'sync_error')),
  external_file_id TEXT NOT NULL,
  file_name TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup indexes for monitoring and troubleshooting
CREATE INDEX IF NOT EXISTS idx_sync_events_connection_id
  ON sync_events(connection_id);

CREATE INDEX IF NOT EXISTS idx_sync_events_created_at
  ON sync_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_events_failed_status
  ON sync_events(status)
  WHERE status = 'failed';

-- Document table intent
COMMENT ON TABLE sync_events IS 'Audit log for all cloud sync operations';
COMMENT ON COLUMN sync_events.external_file_id IS 'External provider identifier (e.g. Google Drive file ID)';
COMMENT ON COLUMN sync_events.status IS 'Processing lifecycle: pending → processing → completed/failed';
