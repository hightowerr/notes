-- Migration 018: Add folder_name column to cloud_connections
-- Created: 2025-11-01
-- Feature: 010-cloud-sync (T003)
-- Purpose: Persist selected Google Drive folder display name for connection summaries

ALTER TABLE cloud_connections
ADD COLUMN IF NOT EXISTS folder_name TEXT;

COMMENT ON COLUMN cloud_connections.folder_name IS 'Human-readable name of monitored folder (nullable until user selects one)';
