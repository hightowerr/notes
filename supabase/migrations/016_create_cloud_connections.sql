-- Migration 016: Create cloud_connections table
-- Created: 2025-10-31
-- Feature: 010-cloud-sync
-- Purpose: Persist OAuth credentials and webhook metadata for cloud providers

CREATE TABLE IF NOT EXISTS cloud_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google_drive'
    CHECK (provider IN ('google_drive')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  folder_id TEXT,
  webhook_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one connection per user/provider pair
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_cloud_connections_user_provider'
  ) THEN
    CREATE UNIQUE INDEX idx_cloud_connections_user_provider
      ON cloud_connections(user_id, provider);
  END IF;
END
$$;

-- Supporting lookup indexes
CREATE INDEX IF NOT EXISTS idx_cloud_connections_user_id
  ON cloud_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_cloud_connections_webhook_id
  ON cloud_connections(webhook_id)
  WHERE webhook_id IS NOT NULL;

-- Trigger to maintain updated_at timestamps
CREATE OR REPLACE FUNCTION update_cloud_connections_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_cloud_connections_updated_at ON cloud_connections;
CREATE TRIGGER trigger_update_cloud_connections_updated_at
  BEFORE UPDATE ON cloud_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_cloud_connections_updated_at();

-- Document table intent
COMMENT ON TABLE cloud_connections IS 'OAuth credentials and configuration for external cloud storage providers';
COMMENT ON COLUMN cloud_connections.access_token IS 'Encrypted OAuth access token (AES-256, crypto-js)';
COMMENT ON COLUMN cloud_connections.refresh_token IS 'Encrypted OAuth refresh token (AES-256, crypto-js)';
COMMENT ON COLUMN cloud_connections.webhook_id IS 'Google Drive webhook channel identifier used for push notifications';
