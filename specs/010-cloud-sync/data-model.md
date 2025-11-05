# Data Model: Cloud Storage Sync and Direct Text Input

**Feature**: 010-cloud-sync
**Date**: 2025-10-31
**Status**: Complete

## Overview

This document defines the database schema changes and entity relationships for Google Drive sync and direct text input features. All schema changes are implemented via Supabase migrations.

---

## Entity Relationship Diagram

```
┌─────────────────────┐
│  cloud_connections  │
│                     │
│  id (PK)            │
│  user_id            │
│  provider           │
│  access_token       │◄──── Encrypted with AES-256
│  refresh_token      │◄──── Encrypted with AES-256
│  token_expires_at   │
│  folder_id          │
│  webhook_id         │
│  created_at         │
│  updated_at         │
└──────────┬──────────┘
           │
           │ 1:N
           ▼
┌─────────────────────┐
│    sync_events      │
│                     │
│  id (PK)            │
│  connection_id (FK) │───► cloud_connections.id
│  event_type         │
│  external_file_id   │
│  file_name          │
│  status             │
│  error_message      │
│  created_at         │
└─────────────────────┘
           │
           │ References
           ▼
┌─────────────────────┐
│  uploaded_files     │───────────► MODIFIED (new columns)
│                     │
│  id (PK)            │
│  filename           │
│  file_size          │
│  file_type          │
│  content_hash       │
│  storage_path       │◄──── Now NULLABLE (NULL for text_input)
│  status             │
│  source             │◄──── NEW: 'manual_upload' | 'google_drive' | 'text_input'
│  external_id        │◄──── NEW: Google Drive file ID (NULL for others)
│  sync_enabled       │◄──── NEW: Track Drive sync status
│  queue_position     │
│  created_at         │
│  updated_at         │
└──────────┬──────────┘
           │ 1:1
           ▼
┌─────────────────────┐
│ processed_documents │───────────► UNCHANGED
│                     │
│  id (PK)            │
│  file_id (FK)       │───► uploaded_files.id
│  markdown_content   │
│  structured_output  │
│  confidence_score   │
│  status             │
│  created_at         │
│  expires_at         │
└─────────────────────┘
```

---

## Entities

### 1. CloudConnection

**Purpose**: Stores OAuth credentials and configuration for cloud storage provider connections.

**Table Name**: `cloud_connections`

**Columns**:
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique connection identifier |
| `user_id` | UUID | NOT NULL | Future: links to auth system (P0 uses placeholder) |
| `provider` | TEXT | NOT NULL, CHECK IN ('google_drive') | Cloud provider type |
| `access_token` | TEXT | NOT NULL | Encrypted OAuth access token |
| `refresh_token` | TEXT | NOT NULL | Encrypted OAuth refresh token |
| `token_expires_at` | TIMESTAMPTZ | NOT NULL | Access token expiration (typically 1 hour) |
| `folder_id` | TEXT | NULLABLE | Google Drive folder ID to monitor |
| `webhook_id` | TEXT | NULLABLE | Google Drive webhook channel ID |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Connection creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp (token refresh, webhook renewal) |

**Indexes**:
- `PRIMARY KEY (id)`
- `INDEX idx_cloud_connections_user_id ON cloud_connections(user_id)` - Fast user lookup
- `INDEX idx_cloud_connections_webhook_id ON cloud_connections(webhook_id)` - Webhook handler lookup

**Relationships**:
- `1:N` with `sync_events` (one connection has many events)

**Validation Rules**:
- `provider` must be 'google_drive' (Phase 5 constraint)
- `access_token` and `refresh_token` are encrypted before storage (never plaintext)
- `webhook_id` is NULL until webhook registration completes
- `folder_id` is NULL until user selects folder

**State Transitions**:
```
[Created] → user selects folder → [Folder Selected]
[Folder Selected] → webhook registered → [Active Sync]
[Active Sync] → webhook expires → [Renewal Needed]
[Renewal Needed] → renewal succeeds → [Active Sync]
[Renewal Needed] → renewal fails → [Error State]
[Active Sync] → user disconnects → [Disconnected]
```

**Zod Schema** (`lib/schemas/cloudConnectionSchema.ts`):
```typescript
import { z } from 'zod';

export const cloudConnectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: z.enum(['google_drive']),
  access_token: z.string().min(1),   // Encrypted
  refresh_token: z.string().min(1),  // Encrypted
  token_expires_at: z.date(),
  folder_id: z.string().nullable(),
  webhook_id: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type CloudConnection = z.infer<typeof cloudConnectionSchema>;
```

---

### 2. SyncEvent

**Purpose**: Audit log for all cloud sync operations (file added/modified, errors, deduplication events).

**Table Name**: `sync_events`

**Columns**:
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Event identifier |
| `connection_id` | UUID | FOREIGN KEY → cloud_connections(id) ON DELETE CASCADE | Which connection triggered event |
| `event_type` | TEXT | NOT NULL, CHECK IN ('file_added', 'file_modified', 'file_deleted', 'sync_error') | Event category |
| `external_file_id` | TEXT | NOT NULL | Google Drive file ID |
| `file_name` | TEXT | NULLABLE | Filename from Drive metadata |
| `status` | TEXT | NOT NULL, CHECK IN ('pending', 'processing', 'completed', 'failed') | Processing status |
| `error_message` | TEXT | NULLABLE | Error details if status=failed |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Event timestamp |

**Indexes**:
- `PRIMARY KEY (id)`
- `INDEX idx_sync_events_connection_id ON sync_events(connection_id)` - Connection history
- `INDEX idx_sync_events_created_at ON sync_events(created_at DESC)` - Recent events first
- `INDEX idx_sync_events_status ON sync_events(status)` - Failed event queries

**Relationships**:
- `N:1` with `cloud_connections` (many events belong to one connection)
- Soft reference to `uploaded_files` via `external_file_id` (not enforced FK)

**Validation Rules**:
- `event_type='file_deleted'` doesn't create `uploaded_files` record
- `status='completed'` requires either `error_message=NULL` or duplicate detection message
- `external_file_id` is Drive-specific identifier (not our internal UUID)

**Event Lifecycle**:
```
Webhook received → INSERT (status='pending', event_type='file_added')
↓
Download started → UPDATE (status='processing')
↓
Success → UPDATE (status='completed')
OR
Failure → UPDATE (status='failed', error_message='...')
```

**Zod Schema** (`lib/schemas/syncEventSchema.ts`):
```typescript
import { z } from 'zod';

export const syncEventSchema = z.object({
  id: z.string().uuid(),
  connection_id: z.string().uuid(),
  event_type: z.enum(['file_added', 'file_modified', 'file_deleted', 'sync_error']),
  external_file_id: z.string().min(1),
  file_name: z.string().nullable(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  error_message: z.string().nullable(),
  created_at: z.date(),
});

export type SyncEvent = z.infer<typeof syncEventSchema>;
```

---

### 3. Uploaded Files (Modified)

**Purpose**: Extends existing `uploaded_files` table to support multiple document sources.

**Table Name**: `uploaded_files` (EXISTING TABLE - MODIFICATIONS ONLY)

**New Columns** (added via migration):
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `source` | TEXT | DEFAULT 'manual_upload', CHECK IN ('manual_upload', 'google_drive', 'text_input') | Document origin |
| `external_id` | TEXT | NULLABLE | Google Drive file ID (NULL for manual/text_input) |
| `sync_enabled` | BOOLEAN | DEFAULT FALSE | TRUE if Drive file should be monitored |

**Modified Columns**:
| Column | Change | Reason |
|--------|--------|--------|
| `storage_path` | Add NULLABLE constraint | Text input has no Supabase Storage file |

**Indexes** (added):
- `INDEX idx_uploaded_files_source ON uploaded_files(source)` - Filter by source type
- `INDEX idx_uploaded_files_external_id ON uploaded_files(external_id)` WHERE external_id IS NOT NULL - Drive file lookup

**Validation Rules**:
- `source='text_input'` → `storage_path=NULL` AND `external_id=NULL`
- `source='google_drive'` → `external_id IS NOT NULL` AND `sync_enabled=TRUE`
- `source='manual_upload'` → `external_id=NULL` AND `sync_enabled=FALSE`

**Dashboard Display Logic**:
```typescript
// Icon/badge based on source
const sourceIcons = {
  manual_upload: <UploadIcon />,
  google_drive: <DriveIcon />,
  text_input: <TextIcon />
};

// Show sync status indicator only for google_drive source
{file.source === 'google_drive' && <SyncStatusBadge enabled={file.sync_enabled} />}
```

---

## Database Migrations

### Migration 015: Add Source to Uploaded Files

**File**: `supabase/migrations/015_add_source_to_uploaded_files.sql`

```sql
-- Add source tracking columns to uploaded_files
ALTER TABLE uploaded_files
  ADD COLUMN source TEXT DEFAULT 'manual_upload'
  CHECK (source IN ('manual_upload', 'google_drive', 'text_input'));

ALTER TABLE uploaded_files ADD COLUMN external_id TEXT;
ALTER TABLE uploaded_files ADD COLUMN sync_enabled BOOLEAN DEFAULT FALSE;

-- Allow NULL storage_path for text_input
ALTER TABLE uploaded_files ALTER COLUMN storage_path DROP NOT NULL;

-- Add indexes for performance
CREATE INDEX idx_uploaded_files_source ON uploaded_files(source);
CREATE INDEX idx_uploaded_files_external_id ON uploaded_files(external_id)
  WHERE external_id IS NOT NULL;

-- Add check constraint for text_input consistency
ALTER TABLE uploaded_files ADD CONSTRAINT check_text_input_no_storage
  CHECK (
    (source = 'text_input' AND storage_path IS NULL AND external_id IS NULL) OR
    (source != 'text_input')
  );

COMMENT ON COLUMN uploaded_files.source IS 'Document origin: manual_upload, google_drive, or text_input';
COMMENT ON COLUMN uploaded_files.external_id IS 'Google Drive file ID (NULL for manual uploads and text input)';
COMMENT ON COLUMN uploaded_files.sync_enabled IS 'TRUE if file should be monitored for updates (Google Drive only)';
```

### Migration 016: Create Cloud Connections

**File**: `supabase/migrations/016_create_cloud_connections.sql`

```sql
-- Create cloud_connections table for OAuth credentials
CREATE TABLE cloud_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  folder_id TEXT,
  webhook_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enforce one connection per user per provider (FR-035)
CREATE UNIQUE INDEX idx_cloud_connections_user_provider ON cloud_connections(user_id, provider);

-- Indexes for performance
CREATE INDEX idx_cloud_connections_user_id ON cloud_connections(user_id);
CREATE INDEX idx_cloud_connections_webhook_id ON cloud_connections(webhook_id)
  WHERE webhook_id IS NOT NULL;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cloud_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cloud_connections_updated_at
  BEFORE UPDATE ON cloud_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_cloud_connections_updated_at();

COMMENT ON TABLE cloud_connections IS 'OAuth credentials and configuration for cloud storage providers';
COMMENT ON COLUMN cloud_connections.access_token IS 'Encrypted OAuth access token (AES-256)';
COMMENT ON COLUMN cloud_connections.refresh_token IS 'Encrypted OAuth refresh token (AES-256)';
COMMENT ON COLUMN cloud_connections.webhook_id IS 'Google Drive webhook channel ID for push notifications';
```

### Migration 017: Create Sync Events

**File**: `supabase/migrations/017_create_sync_events.sql`

```sql
-- Create sync_events table for audit logging
CREATE TABLE sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES cloud_connections(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('file_added', 'file_modified', 'file_deleted', 'sync_error')),
  external_file_id TEXT NOT NULL,
  file_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  retry_context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sync_events_connection_id ON sync_events(connection_id);
CREATE INDEX idx_sync_events_created_at ON sync_events(created_at DESC);
CREATE INDEX idx_sync_events_status ON sync_events(status) WHERE status = 'failed';

COMMENT ON TABLE sync_events IS 'Audit log for all cloud sync operations';
COMMENT ON COLUMN sync_events.external_file_id IS 'Cloud provider file ID (Google Drive ID)';
COMMENT ON COLUMN sync_events.status IS 'Processing status: pending → processing → completed/failed';
COMMENT ON COLUMN sync_events.retry_count IS 'Number of retry attempts that have been executed';
COMMENT ON COLUMN sync_events.next_retry_at IS 'Timestamp for the next scheduled retry';
COMMENT ON COLUMN sync_events.retry_context IS 'Serialized metadata required to resume webhook retries (request URL, headers, etc.)';
```

---

## Data Flow Examples

### Example 1: Google Drive File Added

```
1. Webhook POST /api/webhooks/google-drive
   → Extract Drive file ID from headers

2. INSERT sync_events
   connection_id: <uuid>
   event_type: 'file_added'
   external_file_id: '1a2b3c4d5e'
   status: 'pending'

3. Download file from Drive API
   → Update sync_events.status = 'processing'

4. Hash file content (SHA-256)
   → Query uploaded_files WHERE content_hash = <hash>
   → IF EXISTS: Skip processing, log duplicate
   → IF NOT EXISTS: Continue

5. INSERT uploaded_files
   filename: 'meeting-notes.pdf'
   source: 'google_drive'
   external_id: '1a2b3c4d5e'
   sync_enabled: TRUE
   content_hash: <sha256>
   status: 'processing'

6. Process file → INSERT processed_documents
   → Update sync_events.status = 'completed'
```

### Example 2: Text Input Submission

```
1. POST /api/text-input
   body: { content: "# Meeting Notes...", title: "Weekly Sync" }

2. Validate content (not empty, <100KB)

3. INSERT uploaded_files (virtual record)
   filename: "Weekly Sync"
   source: 'text_input'
   external_id: NULL
   storage_path: NULL
   sync_enabled: FALSE
   content_hash: sha256(content)
   file_type: 'text/markdown'
   status: 'processing'

4. Skip file storage (content already in memory)

5. AI extraction → INSERT processed_documents
   markdown_content: <content>
   structured_output: <summary JSON>

6. Generate embeddings → INSERT task_embeddings

7. Return { fileId, status: 'processing' }
```

---

## Schema Validation

All entities use Zod schemas for runtime validation:
- `cloudConnectionSchema.ts` - CloudConnection validation
- `syncEventSchema.ts` - SyncEvent validation
- Existing schemas reused: `uploadedFileSchema.ts`, `processedDocumentSchema.ts`

**Next Phase**: Generate API contracts and test scenarios.
