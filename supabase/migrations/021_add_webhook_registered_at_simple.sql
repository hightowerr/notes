-- Migration 021: Add webhook_registered_at to cloud_connections
-- Created: 2025-02-05
-- Feature: 010-cloud-sync
-- Purpose: Track webhook registration time separately from connection updates

-- Step 1: Add column
ALTER TABLE cloud_connections
  ADD COLUMN IF NOT EXISTS webhook_registered_at TIMESTAMPTZ;

-- Step 2: Backfill existing webhooks
UPDATE cloud_connections
SET webhook_registered_at = updated_at
WHERE webhook_id IS NOT NULL AND webhook_registered_at IS NULL;

-- Step 3: Add index
CREATE INDEX IF NOT EXISTS idx_cloud_connections_webhook_registered_at
  ON cloud_connections(webhook_registered_at)
  WHERE webhook_id IS NOT NULL;
