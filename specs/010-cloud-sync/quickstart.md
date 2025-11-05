# Quickstart Guide: Cloud Storage Sync and Direct Text Input

**Feature**: 010-cloud-sync
**Date**: 2025-10-31
**Purpose**: Manual testing procedures for Google Drive sync and text input features

## Prerequisites

Before running these tests, ensure:
1. ✅ Environment variables configured:
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (from Google Cloud Console)
   - `GOOGLE_REDIRECT_URI=http://localhost:3000/api/cloud/google-drive/callback`
   - `ENCRYPTION_KEY` (32-byte random string)
2. ✅ Database migrations applied (015, 016, 017)
3. ✅ Development server running (`pnpm dev`)
4. ✅ Test Google Drive account with sample documents

---

## Scenario 1: Connect Google Drive and Sync Existing Files

**Objective**: Verify OAuth flow and initial folder sync

### Steps
1. **Navigate to cloud settings**
   - Open `http://localhost:3000/settings/cloud`
   - Expected: Cloud settings page loads, "Connect Google Drive" button visible

2. **Initiate OAuth**
   - Click "Connect Google Drive" button
   - Expected: Redirected to Google OAuth consent screen
   - Verify: URL starts with `https://accounts.google.com/o/oauth2/`
   - Verify: Scope includes `drive.readonly` (read-only access)

3. **Grant permissions**
   - Sign in with test Google account
   - Click "Allow" to grant drive.readonly permission
   - Expected: Redirected to `/api/cloud/google-drive/callback?code=...`
   - Expected: Auto-redirected to `/settings/cloud`

4. **Select folder to monitor**
   - Expected: "Select Folder" button appears
   - Click "Select Folder"
   - Choose "Test Notes" folder (create if doesn't exist)
   - Expected: "Monitoring: Test Notes" status appears
   - Expected: Sync status shows "Active"

5. **Verify initial sync**
   - Place 2-3 test files in "Test Notes" folder (PDF, DOCX, TXT)
   - Wait 30 seconds
   - Navigate to `/dashboard`
   - Expected: All files from "Test Notes" folder appear in dashboard
   - Expected: Source indicator shows "Google Drive" icon
   - Expected: `sync_enabled=true` badge visible

6. **Database verification**
   ```sql
   -- Check cloud_connections record created
   SELECT * FROM cloud_connections
   WHERE provider = 'google_drive';
   -- Expected: 1 row, access_token encrypted, webhook_id populated

   -- Check sync_events logged
   SELECT * FROM sync_events
   ORDER BY created_at DESC LIMIT 10;
   -- Expected: 3 rows (file_added events), all status='completed'

   -- Check uploaded_files records
   SELECT filename, source, external_id, sync_enabled
   FROM uploaded_files
   WHERE source = 'google_drive';
   -- Expected: 3 rows matching Drive files
   ```

**Expected Result**: ✅ All Drive files synced and processed automatically

**Failure Modes**:
- OAuth error → Check CLIENT_ID/SECRET configuration
- No redirect → Check REDIRECT_URI matches Google Cloud Console
- Files not synced → Check webhook registration (logs should show webhook_id)

---

## Scenario 2: Detect New File Added to Drive

**Objective**: Verify webhook-based change detection

### Steps
1. **Add new file to monitored folder**
   - In Google Drive web UI, upload `new-meeting-notes.pdf` to "Test Notes" folder
   - Start timer

2. **Monitor webhook reception**
   - Check terminal logs for webhook POST
   - Expected: `[Webhook] Received notification for channel <id>` within 30 seconds
   - Expected: `[Webhook] Processing file: new-meeting-notes.pdf`

3. **Verify automatic processing**
   - Navigate to `/dashboard`
   - Expected: `new-meeting-notes.pdf` appears automatically (no refresh needed if polling enabled)
   - Manual refresh if needed
   - Expected: File shows Google Drive source icon
   - Expected: Processing status → completed

4. **Check latency**
   - Time from Drive upload → dashboard appearance
   - Target: <60 seconds total (30s webhook + 30s processing)

5. **Database verification**
   ```sql
   SELECT event_type, file_name, status, created_at
   FROM sync_events
   WHERE file_name = 'new-meeting-notes.pdf';
   -- Expected: 1 row, event_type='file_added', status='completed'
   ```

**Expected Result**: ✅ New file detected and processed automatically within 60 seconds

**Failure Modes**:
- Webhook not received → Check webhook_id exists in cloud_connections
- Webhook received but file not processed → Check sync_events for error_message

---

## Scenario 3: Process Text Input via Quick Capture

**Objective**: Verify direct text processing without file upload

### Steps
1. **Open Quick Capture modal**
   - Click "Quick Capture" button in navigation bar
   - Expected: Modal opens with empty text area

2. **Enter text content**
   - Paste the following test content:
     ```markdown
     # Team Standup - Oct 31

     ## Topics Discussed
     - Q4 roadmap priorities
     - New hire onboarding

     ## Decisions
     - Approved hiring freeze until Q1
     - Postponed feature X to Q1

     ## Actions
     - [ ] Update roadmap doc
     - [ ] Send team announcement
     - [ ] Schedule Q1 planning session
     ```
   - Optional: Enter title "Team Standup"
   - Expected: Character count updates in real-time
   - Expected: "Process" button enabled (not grayed out)

3. **Verify draft auto-save**
   - Type some text
   - Close modal (click X or Cancel)
   - Reopen modal
   - Expected: Draft text restored with toast notification "Draft restored"

4. **Submit for processing**
   - Click "Process" button
   - Expected: Success toast "Processing text input..."
   - Expected: Modal closes
   - Expected: Redirected to `/dashboard?highlight=<fileId>`

5. **Verify processing**
   - Check dashboard for new document
   - Expected: Document title shows "Team Standup" (or auto-generated timestamp)
   - Expected: Source indicator shows "Text Input" icon (not file/Drive)
   - Expected: Processing completes in <5 seconds

6. **Database verification**
   ```sql
   SELECT filename, source, storage_path, external_id
   FROM uploaded_files
   WHERE source = 'text_input'
   ORDER BY created_at DESC LIMIT 1;
   -- Expected: source='text_input', storage_path=NULL, external_id=NULL

   SELECT markdown_content FROM processed_documents
   WHERE file_id = (SELECT id FROM uploaded_files WHERE source = 'text_input' ORDER BY created_at DESC LIMIT 1);
   -- Expected: Markdown content matches input
   ```

7. **Test draft cleanup**
   - After successful submission, reopen Quick Capture
   - Expected: Empty text area (draft cleared after submission)

**Expected Result**: ✅ Text processed immediately without file creation

**Failure Modes**:
- Character limit exceeded → Try 101KB content, should show error "Content exceeds 100KB limit"
- Empty content → Clear text, try to submit, should show "Content cannot be empty"

---

## Scenario 4: Handle OAuth Token Expiration

**Objective**: Verify automatic token refresh

### Steps
1. **Simulate token expiration**
   - In database, update `cloud_connections.token_expires_at` to past timestamp:
     ```sql
     UPDATE cloud_connections
     SET token_expires_at = NOW() - INTERVAL '1 hour'
     WHERE provider = 'google_drive';
     ```

2. **Trigger sync operation**
   - Add new file to monitored Drive folder
   - Wait for webhook notification

3. **Monitor token refresh**
   - Check terminal logs for token refresh attempt
   - Expected: `[Drive] Access token expired, refreshing...`
   - Expected: `[Drive] Token refresh successful`

4. **Verify sync continues**
   - Expected: File processes successfully despite initial token expiration
   - Expected: No user intervention required

5. **Database verification**
   ```sql
   SELECT token_expires_at FROM cloud_connections WHERE provider = 'google_drive';
   -- Expected: token_expires_at updated to future timestamp (~1 hour from now)
   ```

**Expected Result**: ✅ Token refreshed automatically, sync uninterrupted

**Failure Modes**:
- Refresh fails → User should see notification "Reconnect Google Drive" in settings
- Check sync_events for `event_type='sync_error'` with error_message about OAuth

---

## Scenario 5: Disconnect Google Drive

**Objective**: Verify sync stops when user disconnects

### Steps
1. **Navigate to cloud settings**
   - Open `/settings/cloud`
   - Expected: Connection shows as "Connected"

2. **Disconnect**
   - Click "Disconnect" button
   - Expected: Confirmation dialog appears
   - Confirm disconnection

3. **Verify disconnection**
   - Expected: Connection removed from UI
   - Expected: "Connect Google Drive" button reappears

4. **Verify sync stops**
   - Add new file to previously monitored Drive folder
   - Wait 60 seconds
   - Check dashboard
   - Expected: New file does NOT appear (sync disabled)

5. **Database verification**
   ```sql
   SELECT * FROM cloud_connections WHERE provider = 'google_drive';
   -- Expected: 0 rows (connection deleted)

   SELECT * FROM sync_events WHERE connection_id = '<deleted_connection_id>';
   -- Expected: Historical events remain (ON DELETE CASCADE doesn't apply to past data)
   ```

**Expected Result**: ✅ Sync stops immediately, no new files processed

---

## Scenario 6: Duplicate File Detection

**Objective**: Verify content-hash deduplication

### Steps
1. **Manually upload test file**
   - Upload `duplicate-test.pdf` via drag-and-drop on home page
   - Wait for processing to complete

2. **Sync same file from Drive**
   - Upload same `duplicate-test.pdf` to monitored Drive folder
   - Wait 30 seconds

3. **Verify deduplication**
   - Check dashboard
   - Expected: Only ONE `duplicate-test.pdf` entry (not duplicated)
   - Expected: Source shows "Manual Upload" (first upload wins)

4. **Database verification**
   ```sql
   SELECT COUNT(*), content_hash
   FROM uploaded_files
   WHERE filename = 'duplicate-test.pdf'
   GROUP BY content_hash;
   -- Expected: COUNT=1 (deduplicated)

   SELECT event_type, status, error_message
   FROM sync_events
   WHERE file_name = 'duplicate-test.pdf';
   -- Expected: event_type='file_added', status='completed', error_message contains 'Duplicate'
   ```

**Expected Result**: ✅ Duplicate file skipped, logged in sync_events

---

## Edge Case Tests

### Edge Case 1: Large Text Input
- **Test**: Paste 101,000 characters into Quick Capture
- **Expected**: Error toast "Content exceeds 100KB limit"
- **Expected**: "Process" button disabled

### Edge Case 2: Whitespace-Only Text
- **Test**: Enter only spaces/newlines in Quick Capture
- **Expected**: Validation error "Content cannot be empty"
- **Expected**: Form prevents submission

### Edge Case 3: Updated Drive File
- **Test**: Edit existing file in Drive (change content), save
- **Expected**: Webhook triggers within 30s
- **Expected**: File reprocessed (old summary replaced)
- **Expected**: sync_events shows `event_type='file_modified'`

### Edge Case 4: Multiple Google Accounts
- **Test**: Try connecting second Google account while one is already connected
- **Expected**: Error message "Disconnect existing account first"
- **Expected**: Only one cloud_connections row exists

---

## Performance Benchmarks

Record these metrics during testing (per FR-028, FR-029, FR-030):

| Operation | Target (p50 / p95 / p99) | Actual | Pass/Fail |
|-----------|--------------------------|--------|-----------|
| OAuth flow completion | <10s (manual flow) | | |
| Webhook latency (Drive change → notification) | <30s (Google limitation) | | |
| Webhook response time (FR-028) | <100ms / <200ms / <500ms | | |
| Text input processing (FR-029) | <3s / <5s / <8s | | |
| Drive file download 10MB (FR-030) | <2s / <3s / <5s | | |
| End-to-end sync (add file → dashboard) | <60s (combined) | | |

**Notes**:
- p50 = median (50th percentile)
- p95 = 95th percentile
- p99 = 99th percentile
- Test with minimum 20 samples per operation for statistical validity
- Network latency may affect Drive operations (test on stable connection)

---

## Cleanup

After testing, clean up test data:

```sql
-- Delete test connections
DELETE FROM cloud_connections WHERE provider = 'google_drive';

-- Delete test uploaded_files
DELETE FROM uploaded_files WHERE source IN ('google_drive', 'text_input');

-- Sync events cascade deleted automatically
```

Clear localStorage draft:
```javascript
localStorage.removeItem('text-input-draft');
```

---

## Success Criteria

All scenarios MUST pass before feature is considered complete:
- [x] Scenario 1: OAuth and initial sync working
- [x] Scenario 2: Webhook change detection working
- [x] Scenario 3: Text input processing working
- [x] Scenario 4: Token refresh working
- [x] Scenario 5: Disconnection working
- [x] Scenario 6: Deduplication working

All edge cases MUST pass:
- [x] Large text input rejected
- [x] Whitespace-only input rejected
- [x] Updated Drive file reprocessed
- [x] Multiple accounts prevented

All performance benchmarks MUST meet targets.

**Next Step**: After quickstart validation passes, proceed to /tasks command for vertical slice task generation.
