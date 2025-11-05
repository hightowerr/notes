# Tasks: Document Reprocessing

**Input**: Design documents from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/011-docs-shape-pitches/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

---

## Phase 1: P0 User Journeys (Must-Have Features)

### T001 [SLICE] User can reprocess manually uploaded document and see updated analysis

**User Story**: As a user, I can click "Reprocess" on a manually uploaded document (PDF/DOCX/TXT) and receive updated AI analysis using the latest OCR and extraction improvements.

**Implementation Scope**:

- **UI** (`app/dashboard/page.tsx`):
  - Replace single "Delete" button with dropdown menu (DropdownMenu component)
  - Dropdown shows two options:
    - "Reprocess" with RefreshCw icon
    - "Delete" with Trash2 icon
  - Loading state: Show spinner overlay on document card during reprocessing
  - Toast notifications:
    - Success: "Document reprocessed successfully"
    - Error: Display specific error message (text input, already processing, etc.)

- **Backend** (`app/api/documents/[id]/reprocess/route.ts` - NEW):
  - POST endpoint accepting document UUID as path parameter
  - Validation logic:
    1. Query `uploaded_files` by id
    2. Check `source` != 'text_input' (return 400 if text input)
    3. Check `status` != 'processing' (return 409 if already processing)
    4. For manual uploads: use existing `storage_path`
    5. Delete old `processed_documents` record (CASCADE removes embeddings/relationships)
    6. Update `uploaded_files`: set `status = 'pending'`
    7. Trigger existing pipeline: `POST /api/process` with `fileId`
    8. Return 200 with `{ success: true, status: 'processing' }`
  - Error handling:
    - 400: Text input documents
    - 404: Document not found
    - 409: Already processing
    - 500: Processing failed

- **Data**:
  - CASCADE deletion: `processed_documents` → `task_embeddings`, `task_relationships`
  - Status transition: `completed/failed/review_required` → `pending` → `processing` → `completed`
  - Preserve: `uploaded_at`, `name`, `source`, `storage_path`
  - Update: `processed_at` (when complete)

- **Feedback**:
  - Loading: Spinner on card while `status = 'processing'`
  - Success: Toast + updated summary displayed (confidence score, topics, actions)
  - Error: Toast with user-friendly message

**Test Scenario**:
1. Navigate to `/dashboard`
2. Locate document with low confidence (e.g., gibberish output)
3. Click ⋮ menu → "Reprocess"
4. Observe loading spinner on card
5. Wait <15 seconds for completion
6. Verify success toast appears
7. Check updated summary shows new confidence score
8. Verify database:
   - New `processed_documents` record (newer `created_at`)
   - Old embeddings deleted, new ones created
   - Processing log shows `operation='reprocess'`, `status='completed'`
   - `uploaded_at` timestamp unchanged

**Files Modified**:
- `app/dashboard/page.tsx` (add dropdown menu + reprocess handler)
- `app/api/documents/[id]/reprocess/route.ts` (create new endpoint)
- `lib/hooks/useDocuments.ts` (add `reprocessDocument()` function - optional)

**Dependencies**: None (reuses existing processing pipeline)

---

### T002 [P] [SLICE] User can reprocess Google Drive document and see latest version analyzed

**User Story**: As a user, I can reprocess a Google Drive-synced document to analyze the latest version from Drive using improved AI logic.

**Implementation Scope**:

- **UI** (`app/dashboard/page.tsx`):
  - Same dropdown menu as T001 (already implemented)
  - Source detection: Identify Drive documents by `source = 'google_drive'`
  - Drive-specific loading state: "Downloading latest from Drive..."
  - Toast notifications:
    - Success: "Document reprocessed successfully" (same as T001)
    - Errors:
      - "File no longer available in Google Drive" (404)
      - "Google Drive authentication expired. Please reconnect your account." (401)

- **Backend** (`app/api/documents/[id]/reprocess/route.ts` - extend T001):
  - Add Drive-specific logic:
    1. Detect `source = 'google_drive'`
    2. Call `downloadFileById(external_id, tokens)` to get latest from Drive
    3. Upload downloaded file to Supabase Storage (overwrite or new path)
    4. Update `storage_path` with new location
    5. Continue with CASCADE delete + status reset + trigger pipeline (same as T001)
  - Drive error handling:
    - 404: File deleted from Drive
    - 401: OAuth token expired/invalid
    - Handle Drive API errors gracefully

- **Backend** (`lib/services/googleDriveService.ts` - MODIFY):
  - Extract reusable function:
    ```typescript
    export async function downloadFileById(
      fileId: string,
      tokens: { access_token: string; refresh_token: string }
    ): Promise<{ name: string; mimeType: string; buffer: Buffer }>
    ```
  - Reuse existing Drive API client and OAuth logic
  - Handle rate limits, token refresh automatically

- **Data**:
  - Same CASCADE deletion as T001
  - Preserve: `external_id` (Drive file ID), `source`, `uploaded_at`
  - Update: `storage_path` (latest downloaded file), `processed_at`

- **Feedback**:
  - Loading: "Downloading latest version from Drive..." status
  - Success: Toast + summary reflects latest file content
  - Error: Clear message directing user to reconnect Drive if auth failed

**Test Scenario**:
1. Prerequisites: Google Drive account connected, at least one synced document
2. (Optional) Modify file in Google Drive, wait 30s for save
3. Navigate to `/dashboard`
4. Find Google Drive document (shows Drive icon)
5. Click ⋮ → "Reprocess"
6. Observe "Downloading..." message
7. Wait for completion (<15s)
8. Verify success toast
9. Check updated summary reflects latest Drive content
10. Verify database:
    - `external_id` preserved (Drive file ID)
    - `source = 'google_drive'` unchanged
    - New `processed_documents` record
    - Processing log shows `metadata->>'source' = 'google_drive'`

**Files Modified**:
- `app/api/documents/[id]/reprocess/route.ts` (add Drive logic)
- `lib/services/googleDriveService.ts` (extract `downloadFileById()`)

**Dependencies**: T001 (reuses endpoint, adds Drive-specific logic)

**Parallel Execution**: Can run in parallel with T001 if Drive logic is implemented as separate code path

---

## Phase 2: Error Handling & Edge Cases

### T003 [P] [SLICE] User sees clear error when attempting to reprocess text input or already-processing documents

**User Story**: As a user, I receive immediate, actionable feedback when reprocessing is not allowed (text input documents, concurrent reprocessing attempts).

**Implementation Scope**:

- **UI** (`app/dashboard/page.tsx`):
  - Error toast for text input: "Cannot reprocess text input documents - no file stored"
  - Info toast for concurrent: "Document is already being processed. Please wait for current operation to complete."
  - No loading state shown (error returned immediately)

- **Backend** (`app/api/documents/[id]/reprocess/route.ts` - extend T001/T002):
  - Validation checks (already implemented in T001):
    1. Text input check: `if (source === 'text_input')` → return 400
    2. Concurrent check: `if (status === 'processing')` → return 409
  - Ensure checks run BEFORE any data modifications

- **Data**:
  - No database changes (validation fails early)
  - No processing logs created for rejected attempts

- **Feedback**:
  - Instant error toast (no loading delay)
  - Error message explains WHY reprocessing not allowed
  - User remains on dashboard, can retry different document

**Test Scenario 1: Text Input Rejection**:
1. Navigate to `/dashboard`
2. Find document with source = "Quick Capture" (text input icon)
3. Click ⋮ → "Reprocess"
4. Immediately see error toast: "Cannot reprocess text input documents"
5. Verify document card unchanged
6. Check database: no status change, no processing log

**Test Scenario 2: Concurrent Processing Prevention**:
1. Upload large document (5-10MB)
2. Trigger reprocessing (status changes to 'processing')
3. Immediately click ⋮ → "Reprocess" again (while still processing)
4. See info toast: "Document is already being processed"
5. Verify database: only one `processing_logs` entry with `operation='reprocess'`

**Files Modified**:
- `app/api/documents/[id]/reprocess/route.ts` (validation logic - should already exist from T001)
- `app/dashboard/page.tsx` (error toast display)

**Dependencies**: T001 (validation logic should already be implemented)

**Parallel Execution**: Yes, independent error handling logic

---

## Phase 3: Testing & Validation

### T004 [TEST] Write contract tests for reprocess endpoint

**Purpose**: Validate API contract for POST `/api/documents/[id]/reprocess` endpoint.

**Implementation Scope**:

- **File**: `__tests__/contract/reprocess.test.ts` (NEW)

- **Test Cases**:
  ```typescript
  describe('POST /api/documents/[id]/reprocess', () => {
    it('should return 200 and queue document for reprocessing', async () => {
      const doc = await createTestDocument({ status: 'completed', source: 'upload' });
      const response = await fetch(`/api/documents/${doc.id}/reprocess`, { method: 'POST' });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({ success: true, status: 'processing' });
    });

    it('should return 400 for text input documents', async () => {
      const doc = await createTestDocument({ source: 'text_input' });
      const response = await fetch(`/api/documents/${doc.id}/reprocess`, { method: 'POST' });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Cannot reprocess text input documents');
    });

    it('should return 409 when document already processing', async () => {
      const doc = await createTestDocument({ status: 'processing' });
      const response = await fetch(`/api/documents/${doc.id}/reprocess`, { method: 'POST' });
      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toContain('already being processed');
    });

    it('should return 404 when document not found', async () => {
      const response = await fetch(`/api/documents/non-existent-id/reprocess`, { method: 'POST' });
      expect(response.status).toBe(404);
    });

    it('should preserve metadata after reprocessing', async () => {
      const doc = await createTestDocument({ status: 'completed', source: 'upload' });
      const beforeUploadedAt = doc.uploaded_at;

      await fetch(`/api/documents/${doc.id}/reprocess`, { method: 'POST' });

      // Wait for processing to complete (or mock)
      const afterDoc = await getDocument(doc.id);
      expect(afterDoc.uploaded_at).toEqual(beforeUploadedAt);
      expect(afterDoc.status).toBe('processing'); // or 'completed' if mocked
    });
  });
  ```

- **Test Helpers**:
  - `createTestDocument()`: Insert test document in Supabase
  - `getDocument()`: Fetch document by ID
  - Mock Drive API calls for Drive-specific tests

**Files Created**:
- `__tests__/contract/reprocess.test.ts`

**Dependencies**: T001, T002 (endpoint must exist)

---

### T005 [TEST] Write integration test for complete reprocessing flow

**Purpose**: Validate end-to-end reprocessing workflow (UI → API → Pipeline → Database → UI update).

**Implementation Scope**:

- **File**: `__tests__/integration/reprocess-flow.test.ts` (NEW)

- **Test Cases**:
  ```typescript
  describe('Document Reprocessing Flow', () => {
    it('should reprocess manual upload end-to-end', async () => {
      // 1. Setup: Create completed document with old analysis
      const doc = await createTestDocument({ status: 'completed', source: 'upload' });
      const oldSummary = await getProcessedDocument(doc.id);

      // 2. Trigger reprocessing
      const response = await fetch(`/api/documents/${doc.id}/reprocess`, { method: 'POST' });
      expect(response.status).toBe(200);

      // 3. Wait for processing to complete
      await waitForStatus(doc.id, 'completed', { timeout: 20000 });

      // 4. Verify new analysis created
      const newSummary = await getProcessedDocument(doc.id);
      expect(newSummary.id).not.toEqual(oldSummary.id); // New record
      expect(newSummary.created_at).toBeGreaterThan(oldSummary.created_at);

      // 5. Verify old embeddings deleted, new ones created
      const embeddings = await getEmbeddings(doc.id);
      expect(embeddings.every(e => e.status === 'completed')).toBe(true);

      // 6. Verify processing log
      const logs = await getProcessingLogs(doc.id, 'reprocess');
      expect(logs[0].status).toBe('completed');
    });

    it('should handle CASCADE deletion correctly', async () => {
      const doc = await createTestDocument({ status: 'completed' });

      // Create embeddings and relationships
      await createTestEmbeddings(doc.id, 5);
      await createTestRelationships(doc.id, 2);

      // Trigger reprocessing
      await fetch(`/api/documents/${doc.id}/reprocess`, { method: 'POST' });

      // Verify old data deleted (before new processing completes)
      const oldEmbeddings = await getEmbeddings(doc.id);
      expect(oldEmbeddings).toHaveLength(0); // CASCADE deleted

      // Wait for new processing
      await waitForStatus(doc.id, 'completed');

      // Verify new embeddings created
      const newEmbeddings = await getEmbeddings(doc.id);
      expect(newEmbeddings.length).toBeGreaterThan(0);
    });
  });
  ```

**Files Created**:
- `__tests__/integration/reprocess-flow.test.ts`

**Dependencies**: T001, T002 (full implementation)

---

### T006 [DOC] Create manual test guide for Google Drive reprocessing

**Purpose**: Provide step-by-step manual testing procedure for Drive integration (automated testing may be blocked by Drive API mocking complexity).

**Implementation Scope**:

- **File**: `.claude/testing/T011-reprocess-manual.md` (NEW)

- **Content**:
  ```markdown
  # Manual Test: T011 - Google Drive Document Reprocessing

  ## Reason for Manual Testing
  Google Drive API integration requires OAuth flow and Drive file modification,
  which are complex to mock in automated tests. Manual testing validates:
  - Drive OAuth token refresh
  - Latest file download from Drive
  - Drive API error handling (404, 401)

  ## Prerequisites
  1. Google Drive account connected (`/settings/cloud`)
  2. At least one document synced from Drive
  3. Access to Google Drive web interface

  ## Test Steps

  ### Happy Path: Reprocess Drive Document
  1. Open Google Drive in browser
  2. Locate synced document (e.g., "Meeting Notes.pdf")
  3. Upload new version or edit content
  4. Wait 30 seconds for Drive to save
  5. Navigate to `/dashboard`
  6. Find same document (shows Drive icon)
  7. Click ⋮ → "Reprocess"
  8. **Expected**: Loading spinner "Downloading latest from Drive..."
  9. **Expected**: Success toast after <15s
  10. **Expected**: Summary reflects new content from Drive

  ### Error Path: Drive File Deleted
  1. In Google Drive, move synced file to Trash
  2. Navigate to `/dashboard`
  3. Click ⋮ → "Reprocess" on deleted file's card
  4. **Expected**: Error toast "File no longer available in Google Drive"
  5. **Expected**: Old analysis preserved (not deleted)

  ### Error Path: OAuth Token Expired
  1. Manually expire Drive tokens (disconnect and reconnect Drive)
  2. Trigger reprocessing
  3. **Expected**: Error toast "Google Drive authentication expired"
  4. **Expected**: Redirect to `/settings/cloud` or clear reconnect prompt

  ## Acceptance Criteria
  - [ ] Latest Drive version downloaded and analyzed
  - [ ] Drive file deletion handled gracefully
  - [ ] OAuth errors show clear reconnect message
  - [ ] `external_id` preserved (Drive file ID)
  - [ ] `source = 'google_drive'` unchanged

  ## Edge Cases to Test
  - Reprocess while Drive file is being edited (race condition)
  - Very large Drive file (>10MB) download timeout
  - Drive API rate limit (trigger with multiple rapid reprocesses)

  ## Results
  **Tested by**: [Name]
  **Date**: [Date]
  **Status**: PASS / FAIL
  **Notes**: [Observations, issues encountered]
  ```

**Files Created**:
- `.claude/testing/T011-reprocess-manual.md`

**Dependencies**: T002 (Drive reprocessing implementation)

---

## Dependencies

```
T001 (manual upload reprocess)
  ↓
T002 (Drive reprocess - extends T001)
  ↓
T003 (error handling - validates T001/T002)
  ↓
T004 (contract tests - tests T001/T002/T003)
  ↓
T005 (integration tests - tests full flow)
  ↓
T006 (manual test guide - validates Drive integration)
```

**Parallel Execution**:
- T002 can start in parallel with T001 if Drive logic is isolated
- T003 can run in parallel with T002 (independent error handling)
- T004, T005, T006 run sequentially after implementation complete

---

## Notes

- **Vertical Slice Compliance**: Every [SLICE] task includes UI + Backend + Data + Feedback
- **User-Testable**: Each task can be demoed by clicking UI and seeing results
- **TDD**: Contract tests (T004) written before implementation validated
- **Manual Testing**: Drive integration (T006) uses manual test guide (FormData/API mock complexity)
- **Performance**: All tasks target <15s reprocessing time per spec
- **Data Integrity**: CASCADE deletion verified in integration tests (T005)

## Validation Checklist

- [x] Every [SLICE] task has user story
- [x] Every [SLICE] task includes UI + Backend + Data + Feedback
- [x] Every [SLICE] task has test scenario
- [x] No backend-only or frontend-only tasks
- [x] Tasks ordered by user value (P0 journeys first)
- [x] Each task specifies exact file paths to modify
- [x] Parallel execution marked with [P]
- [x] Dependencies clearly documented
