-- Migration 021: Add webhook_registered_at to cloud_connections
-- Created: 2025-02-05
-- Feature: 010-cloud-sync
-- Purpose: Track webhook registration time separately from connection updates to fix renewal bug
-- Bug: Renewal cron uses updated_at, but token refreshes update it hourly, so active connections never qualify for renewal

ALTER TABLE cloud_connections
  ADD COLUMN IF NOT EXISTS webhook_registered_at TIMESTAMPTZ;

-- Set initial value to webhook creation time (or updated_at if webhook exists, NULL if not registered)
-- This ensures existing webhooks will be renewed on next cron run if they're approaching expiration
UPDATE cloud_connections
SET webhook_registered_at = updated_at
WHERE webhook_id IS NOT NULL AND webhook_registered_at IS NULL;

-- Index for efficient renewal queries (find webhooks older than 23 hours)
CREATE INDEX IF NOT EXISTS idx_cloud_connections_webhook_registered_at
  ON cloud_connections(webhook_registered_at)
  WHERE webhook_id IS NOT NULL;

COMMENT ON COLUMN cloud_connections.webhook_registered_at IS 'Timestamp of last webhook registration/renewal (not affected by token refreshes)';
