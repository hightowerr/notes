# Data Model: P0 – Thinnest Agentic Slice

**Date**: 2025-10-07
**Phase**: 1 (Design & Contracts)
**Status**: Complete

## Entity Definitions

### 1. UploadedFile

Represents the original file uploaded by the user before processing.

**Fields**:
```typescript
{
  id: string;              // UUID v4
  name: string;            // Original filename (e.g., "meeting-notes.pdf")
  size: number;            // File size in bytes (max 10MB = 10485760)
  mimeType: string;        // MIME type ("application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain", "text/markdown")
  contentHash: string;     // SHA-256 hash of file content (for deduplication)
  uploadedAt: timestamp;   // ISO 8601 timestamp
  storagePath: string;     // Supabase storage path ("notes/[hash]-[filename]")
  status: enum;            // "pending" | "processing" | "completed" | "failed" | "review_required"
}
```

**Validation Rules**:
- `size` ≤ 10485760 bytes (10MB) - per FR-016
- `mimeType` must be one of: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/markdown`
- `contentHash` computed via: `crypto.createHash('sha256').update(buffer).digest('hex')`
- `name` sanitized to prevent path traversal

**Relationships**:
- One UploadedFile → One ProcessedDocument (1:1)
- One UploadedFile → Many ProcessingLogs (1:N)

---

### 2. ProcessedDocument

Represents the converted and summarized document output.

**Fields**:
```typescript
{
  id: string;                     // UUID v4
  fileId: string;                 // Foreign key → UploadedFile.id
  markdownContent: string;        // Converted Markdown text
  markdownStoragePath: string;    // Supabase storage path for MD file
  structuredOutput: DocumentOutput; // JSON output (see schema below)
  jsonStoragePath: string;        // Supabase storage path for JSON file
  confidence: number;             // 0.0-1.0 (from AI model)
  processingDuration: number;     // Milliseconds (for FR-013 tracking)
  processedAt: timestamp;         // ISO 8601 timestamp
  expiresAt: timestamp;           // processedAt + 30 days (FR-018)
}
```

**DocumentOutput Schema** (Zod):
```typescript
const DocumentOutputSchema = z.object({
  topics: z.array(z.string()).min(1).describe('Key topics/themes from document'),
  decisions: z.array(z.string()).describe('Decisions made or documented'),
  actions: z.array(z.string()).describe('Action items identified'),
  lno_tasks: z.object({
    leverage: z.array(z.string()).describe('High-impact strategic tasks'),
    neutral: z.array(z.string()).describe('Necessary operational tasks'),
    overhead: z.array(z.string()).describe('Low-value administrative tasks')
  })
});
```

**Validation Rules**:
- `confidence` ∈ [0.0, 1.0]
- If `confidence` < 0.8, flag as "review_required" per FR-011
- `structuredOutput` must pass `DocumentOutputSchema.parse()`
- `processingDuration` tracked against <8000ms target (FR-013)
- `expiresAt` = `processedAt + 30 days` for auto-cleanup (FR-018)

**Relationships**:
- One ProcessedDocument → One UploadedFile (1:1)
- One ProcessedDocument → Many ProcessingLogs (1:N)

---

### 3. ProcessingLog

Tracks all processing operations for observability (Constitution Principle V).

**Fields**:
```typescript
{
  id: string;             // UUID v4
  fileId: string;         // Foreign key → UploadedFile.id (nullable if system log)
  documentId: string;     // Foreign key → ProcessedDocument.id (nullable if processing failed)
  operation: enum;        // "upload" | "convert" | "summarize" | "store" | "retry" | "error"
  status: enum;           // "started" | "completed" | "failed"
  duration: number;       // Milliseconds (null if status = "started")
  error: string;          // Error message (null if status ≠ "failed")
  metadata: json;         // Operation-specific data (e.g., { retryCount: 1, model: "gpt-4-turbo" })
  timestamp: timestamp;   // ISO 8601 timestamp
}
```

**Validation Rules**:
- `operation` must be one of: "upload", "convert", "summarize", "store", "retry", "error"
- `status` must be one of: "started", "completed", "failed"
- `error` required if `status` = "failed"
- `duration` required if `status` ∈ ["completed", "failed"]

**Relationships**:
- Many ProcessingLogs → One UploadedFile (N:1)
- Many ProcessingLogs → One ProcessedDocument (N:1)

---

## Database Schema (Supabase / PostgreSQL)

### Table: `uploaded_files`
```sql
CREATE TABLE uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
  mime_type TEXT NOT NULL CHECK (mime_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  )),
  content_hash TEXT NOT NULL UNIQUE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed', 'review_required'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uploaded_files_content_hash ON uploaded_files(content_hash);
CREATE INDEX idx_uploaded_files_status ON uploaded_files(status);
CREATE INDEX idx_uploaded_files_uploaded_at ON uploaded_files(uploaded_at DESC);
```

### Table: `processed_documents`
```sql
CREATE TABLE processed_documents (
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

CREATE INDEX idx_processed_documents_file_id ON processed_documents(file_id);
CREATE INDEX idx_processed_documents_expires_at ON processed_documents(expires_at);
CREATE INDEX idx_processed_documents_confidence ON processed_documents(confidence);
```

### Table: `processing_logs`
```sql
CREATE TABLE processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES uploaded_files(id) ON DELETE CASCADE,
  document_id UUID REFERENCES processed_documents(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN (
    'upload', 'convert', 'summarize', 'store', 'retry', 'error',
    'cleanup', 'action_filtering_applied'
  )),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  duration INTEGER CHECK (duration >= 0),
  error TEXT,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processing_logs_file_id ON processing_logs(file_id);
CREATE INDEX idx_processing_logs_document_id ON processing_logs(document_id);
CREATE INDEX idx_processing_logs_operation ON processing_logs(operation);
CREATE INDEX idx_processing_logs_timestamp ON processing_logs(timestamp DESC);
```

---

## State Transitions

### UploadedFile Status Flow
```
pending → processing → completed
        ↘ failed
        ↘ review_required (if confidence < 0.8)
```

**Transitions**:
1. **pending → processing**: File uploaded, processing pipeline started
2. **processing → completed**: Processing successful, confidence ≥ 0.8
3. **processing → review_required**: Processing successful, confidence < 0.8
4. **processing → failed**: Conversion or summarization failed after retry

### ProcessingLog Operation Sequence
```
upload (started) → upload (completed)
                → convert (started) → convert (completed)
                                   → summarize (started) → summarize (completed)
                                                         → store (started) → store (completed)
                                   → convert (failed) → retry (started) → ...
                                   → summarize (failed) → retry (started) → ...
```

---

## Data Retention Policy

Per FR-018, processed outputs expire after 30 days:

```sql
-- Cron job (daily): Delete expired processed documents
DELETE FROM processed_documents
WHERE expires_at < NOW();

-- Cascade deletes will clean up:
-- - Markdown files in Supabase storage
-- - JSON files in Supabase storage
-- - Associated processing logs
```

**Note**: `uploaded_files` table retains metadata even after `processed_documents` deletion for audit trail.

---

## Example Data Flow

**1. User uploads "meeting-notes.pdf" (2MB)**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "meeting-notes.pdf",
  "size": 2097152,
  "mimeType": "application/pdf",
  "contentHash": "a3b5c7...",
  "uploadedAt": "2025-10-07T10:00:00Z",
  "storagePath": "notes/a3b5c7-meeting-notes.pdf",
  "status": "pending"
}
```

**2. System processes file**
- Converts PDF → Markdown (2s)
- Summarizes with AI (4s)
- Validates JSON schema (100ms)
- Stores in Supabase (500ms)

**3. ProcessedDocument created**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "fileId": "550e8400-e29b-41d4-a716-446655440000",
  "markdownStoragePath": "notes/markdown/a3b5c7-meeting-notes.md",
  "structuredOutput": {
    "topics": ["Q4 Strategy", "Budget Planning"],
    "decisions": ["Hire 3 engineers by EOY"],
    "actions": ["Schedule design review"],
    "lno_tasks": {
      "leverage": ["Define metrics for Q4"],
      "neutral": ["Update documentation"],
      "overhead": ["File expense reports"]
    }
  },
  "jsonStoragePath": "notes/json/a3b5c7-meeting-notes.json",
  "confidence": 0.92,
  "processingDuration": 6700,
  "processedAt": "2025-10-07T10:00:07Z",
  "expiresAt": "2025-11-06T10:00:07Z"
}
```

**4. ProcessingLogs track each step**
```json
[
  { "operation": "upload", "status": "completed", "duration": 500 },
  { "operation": "convert", "status": "completed", "duration": 2000 },
  { "operation": "summarize", "status": "completed", "duration": 4000, "metadata": { "model": "gpt-4-turbo" } },
  { "operation": "store", "status": "completed", "duration": 200 }
]
```

---

## Schema Validation Tests

Contract tests will verify:
- ✅ `DocumentOutputSchema` rejects invalid JSON (missing topics, wrong types)
- ✅ Database constraints enforce size limits, enum values
- ✅ Foreign key relationships prevent orphaned records
- ✅ Indexes improve query performance (< 100ms for recent files)

---

**Data Model Complete** ✅ - Ready for contract generation.
