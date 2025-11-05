# Research: Document Reprocessing

**Feature**: Document Reprocessing
**Date**: 2025-11-05
**Status**: Complete

## Research Questions

### 1. CASCADE Delete Verification

**Question**: How do we ensure CASCADE deletion removes all related data (embeddings, relationships) without orphans?

**Decision**: Use existing Supabase CASCADE foreign key constraints

**Rationale**:
- Database migrations 007-009 already define CASCADE DELETE relationships:
  - `processed_documents.file_id` → `uploaded_files.id` (CASCADE)
  - `task_embeddings.file_id` → `uploaded_files.id` (CASCADE)
  - `task_relationships.file_id` → `uploaded_files.id` (CASCADE)
- When `processed_documents` record is deleted, PostgreSQL automatically removes related embeddings and relationships

**Verification Required Before Ship**:
```sql
-- Test CASCADE behavior manually
BEGIN;
  DELETE FROM processed_documents WHERE file_id = '<test-doc-id>';
  SELECT count(*) FROM task_embeddings WHERE file_id = '<test-doc-id>';  -- Should return 0
  SELECT count(*) FROM task_relationships WHERE file_id = '<test-doc-id>';  -- Should return 0
ROLLBACK;
```

**Alternatives Considered**:
- Manual deletion of related records → Rejected: Error-prone, race conditions
- Application-level cleanup → Rejected: Already have database-level CASCADE

---

### 2. Google Drive API - Download Latest File

**Question**: How do we download the latest version of a Google Drive file for reprocessing?

**Decision**: Use existing `googleapis` client with `files.get` and `alt=media`

**Rationale**:
- Pattern already implemented in `lib/services/googleDriveService.ts` for initial sync
- Google Drive API `files.get({ fileId, alt: 'media' })` returns binary content
- Existing code handles OAuth token refresh automatically

**Implementation**:
```typescript
// Extract reusable function from existing downloadFiles()
export async function downloadFileById(
  fileId: string,
  tokens: { access_token: string; refresh_token: string }
): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const drive = google.drive({ version: 'v3', auth: createOAuthClient(tokens) });

  // Get file metadata
  const metadata = await drive.files.get({
    fileId,
    fields: 'name,mimeType'
  });

  // Download binary content
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  return {
    name: metadata.data.name,
    mimeType: metadata.data.mimeType,
    buffer: Buffer.from(response.data as ArrayBuffer)
  };
}
```

**Error Handling**:
- File deleted from Drive → Catch 404, return user-friendly error
- Token expired → Catch 401, trigger re-authentication flow
- Rate limit → Catch 429, implement exponential backoff (existing pattern)

**Alternatives Considered**:
- Use existing `storage_path` → Rejected: For Drive files, we want latest version from Drive
- Download all files and compare → Rejected: Inefficient, reprocessing is single-document operation

---

### 3. Processing Queue Integration

**Question**: How does reprocessing integrate with the existing processing queue (max 3 concurrent)?

**Decision**: Reuse existing `processingQueue.ts` singleton

**Rationale**:
- Reprocessing is functionally identical to initial processing from queue's perspective
- Both operations:
  - Convert file to Markdown
  - Extract AI summary
  - Generate embeddings
  - Update database
- Queue already handles concurrency limits, status transitions, error handling

**Implementation**:
- Reprocess endpoint calls `POST /api/process` with `fileId`
- `/api/process` checks queue, adds to queue if at limit
- Queue processes document using existing pipeline
- No changes to `processingQueue.ts` required

**Queue Behavior**:
```
Max 3 concurrent processing:
  Slot 1: [doc-abc] processing
  Slot 2: [doc-def] processing
  Slot 3: [doc-ghi] processing

User triggers reprocess on doc-xyz:
  → Added to queue (queue_position = 4)
  → When slot opens, doc-xyz starts processing
```

**Alternatives Considered**:
- Separate reprocessing queue → Rejected: Unnecessary complexity, same resource constraints
- Priority queue for reprocessing → Rejected: FIFO is simpler, users can wait

---

### 4. Error Handling Patterns

**Question**: What error scenarios must be handled, and how?

**Decision**: Follow existing error handling patterns from `/api/upload` and `/api/process`

**Error Scenarios**:

| Scenario | HTTP Status | Response | User Experience |
|----------|------------|----------|-----------------|
| Text input document | 400 | `{ error: "Cannot reprocess text input documents - no file stored" }` | Toast error message |
| Drive file deleted | 404 | `{ error: "File no longer available in Google Drive" }` | Toast error message |
| Drive token expired | 401 | `{ error: "Google Drive authentication expired. Please reconnect your account." }` | Toast error + redirect to /settings/cloud |
| Already processing | 409 | `{ error: "Document is already being processed. Please wait for current operation to complete." }` | Toast info message |
| Processing fails | 500 | `{ error: "Reprocessing failed. Please try again." }` | Toast error + preserve old data |
| Queue full | 200 | `{ success: true, status: "queued", position: 4 }` | Toast info "Queued at position 4" |

**Error Recovery**:
- On failure, old `processed_documents` data is preserved (delete only AFTER new processing succeeds)
- User can retry reprocessing manually
- Processing errors logged to `processing_logs` table with 'reprocess' operation type

**Alternatives Considered**:
- Auto-retry on failure → Rejected: Let user decide when to retry (they might need to fix Drive permissions first)
- Queue reprocessing failures for later → Rejected: User triggered action, give immediate feedback

---

## Summary

**All research questions resolved**. Implementation can proceed with:
- CASCADE deletion (verified via existing migrations)
- Google Drive download API (reuse existing pattern)
- Processing queue integration (no changes needed)
- Error handling (follow existing patterns)

**No blockers identified**. Ready for Phase 1 (Design & Contracts).
