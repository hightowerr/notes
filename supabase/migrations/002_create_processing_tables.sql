-- Migration 002: Create processing tables for T002
-- Created: 2025-10-08
-- Purpose: Support AI summarization and processing pipeline

-- Create processed_documents table
CREATE TABLE IF NOT EXISTS processed_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES uploaded_files(id) ON DELETE CASCADE,
  markdown_content TEXT NOT NULL,
  markdown_storage_path TEXT NOT NULL,
  structured_output JSONB NOT NULL,
  json_storage_path TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  processing_duration INTEGER NOT NULL CHECK (processing_duration >= 0),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(file_id)
);

-- Create indexes for processed_documents
CREATE INDEX IF NOT EXISTS idx_processed_documents_file_id ON processed_documents(file_id);
CREATE INDEX IF NOT EXISTS idx_processed_documents_expires_at ON processed_documents(expires_at);
CREATE INDEX IF NOT EXISTS idx_processed_documents_confidence ON processed_documents(confidence);

-- Add document_id foreign key to processing_logs (it was nullable in previous migration)
ALTER TABLE processing_logs
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES processed_documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_processing_logs_document_id ON processing_logs(document_id);

-- Create function to automatically set expires_at to 30 days from processed_at
CREATE OR REPLACE FUNCTION set_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.processed_at + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to set expires_at automatically
DROP TRIGGER IF EXISTS set_expires_at_trigger ON processed_documents;
CREATE TRIGGER set_expires_at_trigger
  BEFORE INSERT ON processed_documents
  FOR EACH ROW
  EXECUTE FUNCTION set_expires_at();

-- Grant permissions (for development - adjust for production)
ALTER TABLE processed_documents ENABLE ROW LEVEL SECURITY;

-- Allow public access for P0 development
CREATE POLICY "Allow public read access" ON processed_documents
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert" ON processed_documents
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update" ON processed_documents
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete" ON processed_documents
  FOR DELETE USING (true);

-- Add comments for documentation
COMMENT ON TABLE processed_documents IS 'Stores AI-generated summaries and converted Markdown content';
COMMENT ON COLUMN processed_documents.confidence IS 'AI confidence score (0.0-1.0). Values < 0.8 flag review_required status';
COMMENT ON COLUMN processed_documents.processing_duration IS 'Processing time in milliseconds. Target: < 8000ms per FR-013';
COMMENT ON COLUMN processed_documents.expires_at IS 'Auto-deletion date (30 days from processed_at) per FR-018';
COMMENT ON COLUMN processed_documents.structured_output IS 'JSON output with topics, decisions, actions, lno_tasks following DocumentOutputSchema';
