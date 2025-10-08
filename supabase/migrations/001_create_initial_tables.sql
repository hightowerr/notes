-- Migration: Create initial tables for P0 Thinnest Agentic Slice
-- Date: 2025-10-08
-- Feature: 001-prd-p0-thinnest
-- Task: T001 - User uploads note file and sees processing begin automatically

-- =============================================================================
-- Table: uploaded_files
-- Purpose: Store metadata for uploaded files
-- =============================================================================

CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760), -- Max 10MB
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  )),
  content_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash for deduplication
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed', 'review_required'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for uploaded_files
CREATE INDEX idx_uploaded_files_content_hash ON uploaded_files(content_hash);
CREATE INDEX idx_uploaded_files_status ON uploaded_files(status);
CREATE INDEX idx_uploaded_files_uploaded_at ON uploaded_files(uploaded_at DESC);

-- =============================================================================
-- Table: processed_documents
-- Purpose: Store converted and summarized document outputs
-- =============================================================================

CREATE TABLE IF NOT EXISTS processed_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES uploaded_files(id) ON DELETE CASCADE,
  markdown_content TEXT NOT NULL,
  markdown_storage_path TEXT NOT NULL,
  structured_output JSONB NOT NULL,
  json_storage_path TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  processing_duration INTEGER NOT NULL CHECK (processing_duration >= 0), -- milliseconds
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, -- processed_at + 30 days
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(file_id)
);

-- Indexes for processed_documents
CREATE INDEX idx_processed_documents_file_id ON processed_documents(file_id);
CREATE INDEX idx_processed_documents_expires_at ON processed_documents(expires_at);
CREATE INDEX idx_processed_documents_confidence ON processed_documents(confidence);

-- =============================================================================
-- Table: processing_logs
-- Purpose: Track all processing operations for observability
-- =============================================================================

CREATE TABLE IF NOT EXISTS processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES uploaded_files(id) ON DELETE CASCADE,
  document_id UUID REFERENCES processed_documents(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN (
    'upload', 'convert', 'summarize', 'store', 'retry', 'error'
  )),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  duration INTEGER CHECK (duration >= 0), -- milliseconds, NULL if status = 'started'
  error TEXT, -- Error message, NULL if status != 'failed'
  metadata JSONB, -- Operation-specific data
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for processing_logs
CREATE INDEX idx_processing_logs_file_id ON processing_logs(file_id);
CREATE INDEX idx_processing_logs_document_id ON processing_logs(document_id);
CREATE INDEX idx_processing_logs_operation ON processing_logs(operation);
CREATE INDEX idx_processing_logs_timestamp ON processing_logs(timestamp DESC);

-- =============================================================================
-- Triggers: Automatic timestamp updates
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for uploaded_files
CREATE TRIGGER update_uploaded_files_updated_at
  BEFORE UPDATE ON uploaded_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;

-- For P0, we'll use simple public access policies
-- In production, these should be restricted to authenticated users

-- uploaded_files: Public read/write for development
CREATE POLICY "Enable all access for uploaded_files" ON uploaded_files
  FOR ALL USING (true) WITH CHECK (true);

-- processed_documents: Public read/write for development
CREATE POLICY "Enable all access for processed_documents" ON processed_documents
  FOR ALL USING (true) WITH CHECK (true);

-- processing_logs: Public read/write for development
CREATE POLICY "Enable all access for processing_logs" ON processing_logs
  FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- Validation Comments
-- =============================================================================

COMMENT ON TABLE uploaded_files IS 'Stores metadata for uploaded note files (PDF, DOCX, TXT, MD). Max 10MB per file. Content hash used for deduplication.';
COMMENT ON TABLE processed_documents IS 'Stores processed outputs: Markdown content + structured JSON summary. Expires after 30 days.';
COMMENT ON TABLE processing_logs IS 'Observability logs for all processing operations. Tracks durations, errors, and metadata.';

COMMENT ON COLUMN uploaded_files.content_hash IS 'SHA-256 hash of file content for deduplication (FR-012)';
COMMENT ON COLUMN uploaded_files.status IS 'Processing status: pending → processing → completed/failed/review_required';
COMMENT ON COLUMN processed_documents.confidence IS 'AI summarization confidence score (0.0-1.0). <0.8 flags review_required (FR-011)';
COMMENT ON COLUMN processed_documents.expires_at IS 'Auto-deletion timestamp = processed_at + 30 days (FR-018)';
COMMENT ON COLUMN processing_logs.operation IS 'Operation type: upload, convert, summarize, store, retry, error';
COMMENT ON COLUMN processing_logs.duration IS 'Operation duration in milliseconds. NULL if status=started';
