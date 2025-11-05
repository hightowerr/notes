-- Migration 019: Add connection error metadata to cloud_connections
-- Created: 2025-02-14
-- Purpose: Track connection error state (e.g., token decryption failures, webhook expirations)

ALTER TABLE cloud_connections
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'error'));

ALTER TABLE cloud_connections
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

ALTER TABLE cloud_connections
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

ALTER TABLE cloud_connections
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

COMMENT ON COLUMN cloud_connections.status IS 'Connection lifecycle state: active | error';
COMMENT ON COLUMN cloud_connections.last_error_code IS 'Most recent error code recorded for this connection';
COMMENT ON COLUMN cloud_connections.last_error_message IS 'Human-readable detail for the most recent connection error';
COMMENT ON COLUMN cloud_connections.last_error_at IS 'Timestamp of the most recent connection error event';
