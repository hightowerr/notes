-- Migration 007: Enable pgvector extension for vector similarity search
-- Created: 2025-10-17
-- Feature: Vector Storage Foundation (T020)

-- Enable pgvector extension (requires superuser or Supabase dashboard)
-- This extension adds support for vector data types and operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify extension is enabled
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
