# Quickstart: Document Reprocessing

**Feature**: Document Reprocessing
**Purpose**: Validate end-to-end reprocessing functionality
**Estimated Time**: 5 minutes

## Prerequisites

1. Development server running (`pnpm dev`)
2. Supabase database with at least one completed document
3. Test documents available:
   - Manual upload: `test-meeting-notes.pdf` (with gibberish or low confidence)
   - Google Drive: Account connected with at least one synced document
   - Text input: One document created via Quick Capture

## Test Scenario 1: Reprocess Manual Upload (Happy Path)

### Step 1: Locate Document

1. Navigate to `/dashboard`
2. Find document with low confidence or gibberish output
   - Example: "Guest Lecture Dexter Horthy.pdf" (90% confidence but gibberish tasks)
3. Note current summary details:
   - Confidence score
   - Number of tasks
   - Topics/decisions/actions

### Step 2: Trigger Reprocessing

1. Click three-dot menu (⋮) on document card
2. Verify dropdown shows two options:
   - "Reprocess" (with refresh icon)
   - "Delete" (with trash icon)
3. Click "Reprocess"

**Expected UI**:
- Document card shows loading spinner overlay
- Other cards remain interactive
- No page reload

### Step 3: Observe Processing

1. Wait for processing to complete (should be <15 seconds)
2. Observe toast notification:
   - Success: "Document reprocessed successfully"
   - Or queued: "Document queued for reprocessing (position X)"

**Expected UI**:
- Loading spinner disappears
- Document card updates with new summary
- Confidence score changes (hopefully improves)
- Topics/decisions/actions reflect latest AI logic

### Step 4: Verify Database Changes

Open Supabase Dashboard → SQL Editor:

```sql
-- Check processed_documents record (should have new created_at)
SELECT
  created_at,
  confidence_score,
  summary_json->>'topics' as topics
FROM processed_documents
WHERE file_id = '<document-id>'
ORDER BY created_at DESC
LIMIT 1;

-- Verify old embeddings deleted, new ones created
SELECT count(*), status
FROM task_embeddings
WHERE file_id = '<document-id>'
GROUP BY status;
-- Expected: Only 'completed' status, count may differ from before

-- Check processing log
SELECT operation, status, created_at
FROM processing_logs
WHERE file_id = '<document-id>'
ORDER BY created_at DESC
LIMIT 2;
-- Expected: Latest entry has operation='reprocess', status='completed'
```

**Pass Criteria**:
- ✅ New `processed_documents` record created
- ✅ Embeddings regenerated (no orphaned old embeddings)
- ✅ Processing log shows 'reprocess' operation
- ✅ `uploaded_at` timestamp unchanged (preserved)

---

## Test Scenario 2: Reprocess Google Drive Document

### Prerequisites
- Google Drive account connected
- At least one document synced from Drive

### Step 1: Modify File in Google Drive (Optional)

1. Open Google Drive in browser
2. Find synced document
3. Upload new version or edit content
4. Wait 30 seconds for Drive to save changes

### Step 2: Trigger Reprocessing

1. Navigate to `/dashboard`
2. Find Google Drive document (shows Drive icon)
3. Click ⋮ → "Reprocess"

**Expected Behavior**:
- Loading spinner appears
- System downloads latest version from Drive
- Processing completes with updated analysis

### Step 3: Verify Latest Version Downloaded

Check processing logs:

```sql
SELECT metadata->>'source', created_at
FROM processing_logs
WHERE file_id = '<drive-document-id>'
  AND operation = 'reprocess'
ORDER BY created_at DESC
LIMIT 1;
```

**Pass Criteria**:
- ✅ New content from Drive reflected in summary
- ✅ `external_id` preserved (Drive file ID)
- ✅ `source` = 'google_drive' unchanged

---

## Test Scenario 3: Text Input Rejection (Error Path)

### Step 1: Locate Text Input Document

1. Navigate to `/dashboard`
2. Find document with source = "Quick Capture" (text input icon)

### Step 2: Attempt Reprocessing

1. Click ⋮ → "Reprocess"

**Expected UI**:
- Toast error appears immediately
- Message: "Cannot reprocess text input documents - no file stored"
- Document card remains unchanged
- No loading state

### Step 3: Verify No Database Changes

```sql
SELECT status, processed_at
FROM uploaded_files
WHERE id = '<text-input-document-id>';
-- Values should be unchanged from before
```

**Pass Criteria**:
- ✅ Error toast displayed
- ✅ No status change in database
- ✅ No processing log entry created

---

## Test Scenario 4: Concurrent Processing Prevention

### Step 1: Start Processing on Document A

1. Upload a large document (5-10MB)
2. Trigger reprocessing
3. Verify status changes to 'processing'

### Step 2: Immediately Attempt Reprocess Again

1. While Document A still processing, click ⋮ → "Reprocess" again

**Expected UI**:
- Toast info message: "Document is already being processed. Please wait for current operation to complete."
- No duplicate processing started

### Step 3: Verify Single Processing

```sql
SELECT count(*)
FROM processing_logs
WHERE file_id = '<document-id>'
  AND operation = 'reprocess'
  AND status = 'started'
  AND created_at > NOW() - INTERVAL '1 minute';
-- Expected: count = 1 (not 2)
```

**Pass Criteria**:
- ✅ Second reprocess attempt rejected
- ✅ Only one processing operation in progress
- ✅ User receives clear feedback

---

## Test Scenario 5: Google Drive File Deleted (Error Path)

### Prerequisites
- Document synced from Google Drive
- Delete file from Drive (move to trash or permanent delete)

### Step 1: Attempt Reprocessing

1. Navigate to `/dashboard`
2. Find deleted Drive document
3. Click ⋮ → "Reprocess"

**Expected UI**:
- Toast error: "File no longer available in Google Drive"
- Document remains in dashboard (old analysis preserved)

### Step 2: Verify Error Logged

```sql
SELECT status, error_message
FROM processing_logs
WHERE file_id = '<deleted-drive-document-id>'
  AND operation = 'reprocess'
ORDER BY created_at DESC
LIMIT 1;
-- Expected: status='failed', error_message contains 'not found' or '404'
```

**Pass Criteria**:
- ✅ User-friendly error message
- ✅ Old data preserved (not deleted)
- ✅ Error logged for debugging

---

## Test Scenario 6: Processing Queue Limit

### Prerequisites
- Upload 4+ documents quickly to trigger queue

### Step 1: Fill Processing Queue

1. Upload 3 large documents simultaneously (queue limit = 3)
2. Documents show 'processing' status

### Step 2: Trigger Reprocessing

1. Reprocess a 4th document

**Expected UI**:
- Toast: "Document queued for reprocessing (position 4)"
- Document card shows "Queued" badge
- Processing starts when slot opens

### Step 3: Verify Queue Position

```sql
SELECT queue_position, status
FROM uploaded_files
WHERE id = '<queued-document-id>';
-- Expected: queue_position = 4, status = 'pending'
```

**Pass Criteria**:
- ✅ Document queued instead of rejected
- ✅ Queue position displayed to user
- ✅ Processing starts automatically when slot opens

---

## Cleanup

After testing, you may want to:

1. Delete test documents: Click ⋮ → "Delete"
2. Reset Google Drive sync: `/settings/cloud` → "Disconnect"
3. Clear processing logs (optional):
   ```sql
   DELETE FROM processing_logs WHERE operation = 'reprocess';
   ```

---

## Success Criteria Summary

All scenarios must pass:
- ✅ Manual upload reprocessing works end-to-end
- ✅ Google Drive reprocessing downloads latest version
- ✅ Text input documents properly rejected
- ✅ Concurrent processing prevented
- ✅ Drive file deletion handled gracefully
- ✅ Queue limit respected

**Time Budget**: ~5 minutes per scenario = 30 minutes total testing time
