# Tasks: Cloud Storage Sync and Direct Text Input

**Input**: Design documents from `/home/yunix/learning-agentic/ideas/Note-synth/notes/specs/010-cloud-sync/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Execution Flow (Slice-Based)
```
1. Load plan.md from feature directory
   → ✅ Loaded: Google Drive sync + Direct text input features
   → Tech stack: Next.js 15, googleapis, crypto-js, Supabase

2. Load spec.md for user journeys:
   → ✅ Primary journeys: OAuth connection, webhook sync, text input
   → UI entry points: Settings page, Quick Capture modal, Dashboard

3. Load optional design documents:
   → ✅ contracts/: 5 API endpoints defined
   → ✅ data-model.md: CloudConnection, SyncEvent, VirtualDocument entities
   → ✅ research.md: Webhook pattern, token encryption, draft recovery

4. Generate VERTICAL SLICE tasks:
   → Each user story = ONE complete slice task
   → Validated: All tasks include UI + API + Data + Feedback

5. Apply slice ordering rules:
   → P0: Database migrations + OAuth flow + Text input (independent)
   → P1: Webhook sync (depends on OAuth)
   → Polish: Error recovery, monitoring enhancements

6. Mark parallel execution:
   → Text input slices [P] with OAuth slices (independent features)
   → Webhook slices sequential after OAuth (dependency)

7. Validation: All tasks pass completeness checks
```

## Format: `[ID] [TYPE] [P?] User Story & Implementation Scope`
- **[SLICE]**: Complete vertical slice (UI → Backend → Data → Feedback)
- **[SETUP]**: Foundational work blocking ALL slices (minimal, justified)
- **[POLISH]**: Enhancement to existing working slice
- **[P]**: Can run in parallel with other [P] tasks

---

## Phase 0: Database Foundation (Required for ALL Slices)

### [X] T001 [SETUP] Apply database migrations for cloud sync entities
**Why Needed**: All subsequent slices require cloud_connections, sync_events, and modified uploaded_files tables

**Implementation Scope**:
- **Database**: Apply 3 Supabase migrations
  - Migration 015: Add source tracking to uploaded_files (source, external_id, sync_enabled columns)
  - Migration 016: Create cloud_connections table for OAuth credentials
  - Migration 017: Create sync_events table for audit logging
- **Schema Validation**: Create Zod schemas
  - `lib/schemas/cloudConnectionSchema.ts` - CloudConnection validation
  - `lib/schemas/syncEventSchema.ts` - SyncEvent validation
  - Extend existing `uploadedFileSchema.ts` with new fields
- **Services**: Create encryption utilities
  - `lib/services/tokenEncryption.ts` - AES-256 encrypt/decrypt for OAuth tokens
  - Add `ENCRYPTION_KEY` environment variable
- **Feedback**: All migrations applied successfully, tables exist in database

**Validation**:
1. Run migrations via Supabase Dashboard SQL Editor
2. Verify tables created: `\dt cloud_connections sync_events`
3. Check uploaded_files columns added: `\d uploaded_files`
4. Test encryption utility: encrypt/decrypt sample token
5. Confirm schema validation works with sample data

**Files Created**:
- `supabase/migrations/015_add_source_to_uploaded_files.sql`
- `supabase/migrations/016_create_cloud_connections.sql`
- `supabase/migrations/017_create_sync_events.sql`
- `lib/schemas/cloudConnectionSchema.ts`
- `lib/schemas/syncEventSchema.ts`
- `lib/services/tokenEncryption.ts`

**Dependencies**: None (foundation for all other tasks)

---

## Phase 1: P0 User Journeys (Must-Have Features)

### [X] T002 [P] [SLICE] User connects Google Drive account and sees connection confirmation
**User Story**: As a user maintaining notes in Google Drive, I can connect my Google account and see confirmation that the connection is active

**Implementation Scope**:
- **UI**: Cloud settings page (`app/settings/cloud/page.tsx`)
  - "Connect Google Drive" button with Drive icon
  - Disable "Connect" button if connection already exists (FR-035)
  - Show "Disconnect existing account first" message if connection active
  - Connection status indicator (Connected/Disconnected)
  - Loading state during OAuth flow
  - CloudSyncButton component (`app/components/CloudSyncButton.tsx`)
  - ConnectionStatus component (`app/components/ConnectionStatus.tsx`)
- **Backend**:
  - POST `/api/cloud/google-drive/connect` (`app/api/cloud/google-drive/connect/route.ts`)
    * Generate OAuth authorization URL
    * Include drive.readonly scope
    * Redirect to Google consent screen
  - GET `/api/cloud/google-drive/callback` (`app/api/cloud/google-drive/callback/route.ts`)
    * Exchange authorization code for tokens
    * Check if connection already exists (SELECT WHERE user_id AND provider='google_drive')
    * If exists: Return 409 Conflict with message "Disconnect existing account first"
    * Encrypt access_token and refresh_token using tokenEncryption service
    * Store encrypted tokens in cloud_connections table (UNIQUE constraint enforced)
    * Redirect to settings page with success message
  - GET `/api/cloud-connections` (`app/api/cloud-connections/route.ts`)
    * Retrieve user's active cloud connections
    * Return provider, status, folder_id, created_at
- **Data**:
  - INSERT cloud_connections record with encrypted tokens
  - Store provider='google_drive', token_expires_at (1 hour from now)
- **Services**:
  - `lib/services/googleDriveService.ts` - OAuth flow wrapper using googleapis
- **Feedback**: Success toast "Google Drive connected successfully" + ConnectionStatus shows "Connected" badge

**Test Scenario** (from quickstart.md Scenario 1, steps 1-3):
1. Navigate to `/settings/cloud`
2. Click "Connect Google Drive" button
3. Redirected to Google OAuth consent screen
4. Sign in, grant drive.readonly permission
5. Redirected back to `/settings/cloud`
6. Verify "Connected" status appears
7. Check database: `SELECT * FROM cloud_connections WHERE provider='google_drive';`
8. Confirm tokens are encrypted (not plaintext)

**Files Created/Modified**:
- `app/settings/cloud/page.tsx` (create)
- `app/components/CloudSyncButton.tsx` (create)
- `app/components/ConnectionStatus.tsx` (create)
- `app/api/cloud/google-drive/connect/route.ts` (create)
- `app/api/cloud/google-drive/callback/route.ts` (create)
- `app/api/cloud-connections/route.ts` (create)
- `lib/services/googleDriveService.ts` (create)
- `.env.local` - Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI

**Dependencies**: T001 (requires cloud_connections table)

---

### [X] T003 [SLICE] User selects Drive folder to monitor and sees sync start
**User Story**: As a user with connected Drive, I can select a specific folder to monitor and see existing files from that folder begin syncing automatically

**Implementation Scope**:
- **UI**: Folder selection interface in settings page
  - "Select Folder" button (appears after connection)
  - Drive folder picker modal (Google Picker API integration)
  - Selected folder display: "Monitoring: [Folder Name]"
  - Initial sync progress indicator
- **Backend**:
  - POST `/api/cloud/google-drive/select-folder` (`app/api/cloud/google-drive/select-folder/route.ts`)
    * Update cloud_connections.folder_id with selected Drive folder ID
    * List all files in folder using Drive API
    * For each file:
      - Check content_hash for duplicates
      - Download file content
      - Create uploaded_files record (source='google_drive', external_id=Drive ID)
      - Queue for processing
    * Register webhook for folder changes
    * Store webhook_id in cloud_connections
  - Extend googleDriveService.ts with:
    * `listFilesInFolder(folderId)` - Drive API files.list
    * `downloadFile(fileId)` - Drive API files.get with alt=media
    * `registerWebhook(folderId)` - Drive API files.watch
- **Data**:
  - UPDATE cloud_connections SET folder_id, webhook_id
  - INSERT uploaded_files records for each file in folder (source='google_drive')
  - INSERT sync_events for initial sync (event_type='file_added', status='completed')
- **Feedback**:
  - Progress indicator: "Syncing 3 files from folder..."
  - Success toast: "3 files synced from [Folder Name]"
  - Files appear in dashboard with Google Drive icon

**Test Scenario** (from quickstart.md Scenario 1, steps 4-6):
1. Connected Drive account from T002
2. Create "Test Notes" folder in Google Drive with 2-3 test files
3. Click "Select Folder" button in settings
4. Choose "Test Notes" folder from picker
5. Wait for initial sync (should be <30s for 3 files)
6. Navigate to `/dashboard`
7. Verify all files appear with "Google Drive" source icon
8. Check database: `SELECT * FROM uploaded_files WHERE source='google_drive';`
9. Verify sync_events logged: `SELECT * FROM sync_events ORDER BY created_at DESC;`

**Files Created/Modified**:
- `app/settings/cloud/page.tsx` (modify - add folder selection UI)
- `app/api/cloud/google-drive/select-folder/route.ts` (create)
- `lib/services/googleDriveService.ts` (extend with folder operations)
- `app/dashboard/page.tsx` (modify - add source icon display logic)

**Dependencies**: T002 (requires active connection), T001 (requires tables)

---

### [X] T004 [P] [SLICE] User pastes text in Quick Capture and sees processing start
**User Story**: As a user with quick thoughts or copy-pasted content, I can directly input text without creating a file and see it processed immediately

**Implementation Scope**:
- **UI**: Quick Capture modal (`app/components/TextInputModal.tsx`)
  - Floating action button "Quick Capture" in navigation bar (app/layout.tsx)
  - Modal with:
    * Title input field (optional)
    * Large textarea for markdown/plaintext content
    * Real-time character count (shows XX,XXX / 100,000)
    * "Process" button (disabled if empty or >100KB)
    * "Cancel" button
- **Backend**:
  - POST `/api/text-input` (`app/api/text-input/route.ts`)
    * Validate content not empty, ≤100KB
    * Generate content_hash (SHA-256)
    * Check for duplicate hash in uploaded_files
    * Create virtual uploaded_files record:
      - source='text_input'
      - storage_path=NULL
      - external_id=NULL
      - sync_enabled=FALSE
      - filename=title || `Text Input - ${timestamp}`
    * Skip Supabase Storage upload (content already in memory)
    * Call existing processingQueue to trigger AI extraction
    * Return { fileId, status: 'processing' }
- **Services**:
  - `lib/services/textInputService.ts` - Text validation, virtual file creation
  - Integrate with existing `lib/services/aiSummarizer.ts` (no file conversion needed)
- **Data**:
  - INSERT uploaded_files (virtual record, no storage_path)
  - INSERT processed_documents (markdown_content = input text)
  - INSERT task_embeddings (reuse existing embedding generation)
- **Feedback**:
  - Success toast: "Processing text input..."
  - Redirect to `/dashboard?highlight=[fileId]`
  - Processing status visible in dashboard

**Test Scenario** (from quickstart.md Scenario 3, steps 1-6):
1. Click "Quick Capture" button in nav bar
2. Modal opens with empty textarea
3. Paste test content (markdown meeting notes, ~500 chars)
4. Enter optional title "Team Standup"
5. Verify character count updates in real-time
6. Click "Process" button
7. Modal closes, success toast appears
8. Redirected to dashboard with new "Text Input" document highlighted
9. Check database: `SELECT * FROM uploaded_files WHERE source='text_input';`
10. Verify storage_path IS NULL and external_id IS NULL

**Files Created/Modified**:
- `app/components/TextInputModal.tsx` (create)
- `app/layout.tsx` (modify - add Quick Capture button)
- `app/api/text-input/route.ts` (create)
- `lib/services/textInputService.ts` (create)
- `app/dashboard/page.tsx` (modify - add "Text Input" source icon)

**Dependencies**: T001 (requires uploaded_files modifications), existing processing pipeline

**Parallel**: Can run in parallel with T002-T003 (independent features)

---

### [X] T005 [SLICE] User draft auto-saves and restores when modal reopens
**User Story**: As a user typing in Quick Capture, if I accidentally close the modal, my draft content is preserved and restored when I reopen it

**Implementation Scope**:
- **UI**: Enhance TextInputModal with draft recovery
  - localStorage auto-save (debounced 500ms)
  - Restore draft on modal open (if <24 hours old)
  - Toast notification "Draft restored" when recovering
  - Clear draft after successful submission
- **Browser Storage**:
  - localStorage key: `text-input-draft`
  - Data: `{ content: string, title: string, timestamp: number }`
  - Stale draft detection: ignore drafts >24 hours old
- **Logic**:
  - `useEffect` hook watches content/title changes
  - Debounced save every 500ms (lodash.debounce or custom)
  - Load draft on modal mount if timestamp recent
  - Clear localStorage on successful POST `/api/text-input`
- **Feedback**:
  - Draft saves silently (no UI distraction)
  - Restore shows toast: "Draft restored from [timestamp]"
  - After submit: draft removed (fresh modal next time)

**Test Scenario** (from quickstart.md Scenario 3, steps 3 + 7):
1. Open Quick Capture modal
2. Type 200 characters
3. Close modal (click X)
4. Reopen modal
5. Verify content restored + toast appears
6. Complete submission
7. Reopen modal
8. Verify empty textarea (draft cleared)
9. Check browser localStorage: `text-input-draft` should be absent

**Files Modified**:
- `app/components/TextInputModal.tsx` (enhance with localStorage logic)

**Dependencies**: T004 (extends text input slice)

---

## Phase 2: P1 User Journeys (Webhook-Based Sync)

### [X] T006 [SLICE] User adds file to Drive folder and sees it appear in dashboard automatically
**User Story**: As a user with Drive sync enabled, when I add a new document to my monitored folder, the system detects and processes it within 30 seconds without any manual action

**Implementation Scope**:
- **Backend**: Webhook receiver endpoint
  - POST `/api/webhooks/google-drive` (`app/api/webhooks/google-drive/route.ts`)
    * Validate webhook signature/token (X-Goog-Channel-Token header)
    * Extract Drive file ID from X-Goog-Resource-ID header
    * Log incoming webhook in sync_events (status='pending')
    * Fetch file metadata from Drive API
    * Download file content
    * Check content_hash for duplicates
    * If not duplicate:
      - Create uploaded_files record (source='google_drive', external_id=fileId)
      - Queue for processing via existing processingQueue
    * If duplicate:
      - Log in sync_events with error_message="Duplicate of [existing filename]"
    * Update sync_events status='completed' or 'failed'
    * Return 200 OK within 200ms (webhook acknowledgment)
- **Services**:
  - `lib/services/webhookVerification.ts` - Validate Google webhook authenticity
  - Extend googleDriveService.ts with file download logic
- **Data**:
  - INSERT sync_events (event_type='file_added', external_file_id, status)
  - INSERT uploaded_files (if not duplicate)
- **UI**: No UI changes needed (existing dashboard polling will show new file)
- **Feedback**:
  - File appears in dashboard within 60s (30s webhook latency + 30s processing)
  - Source icon shows "Google Drive"
  - Sync status badge shows "Synced"

**Test Scenario** (from quickstart.md Scenario 2):
1. Drive connected and folder selected (from T002-T003)
2. Upload `new-meeting-notes.pdf` to monitored Drive folder via Drive web UI
3. Start timer
4. Monitor terminal logs for webhook POST
5. Verify log: "[Webhook] Received notification for channel <id>"
6. Navigate to `/dashboard`
7. Verify `new-meeting-notes.pdf` appears (manual refresh if needed)
8. Check elapsed time: should be <60 seconds
9. Database check: `SELECT * FROM sync_events WHERE file_name='new-meeting-notes.pdf';`
10. Verify event_type='file_added', status='completed'

**Files Created/Modified**:
- `app/api/webhooks/google-drive/route.ts` (create)
- `lib/services/webhookVerification.ts` (create)
- `lib/services/googleDriveService.ts` (extend with file download)

**Dependencies**: T003 (requires webhook_id registration), T001 (requires sync_events table)

---

### [X] T007 [SLICE] User updates file in Drive and sees reprocessed summary
**User Story**: As a user with Drive sync enabled, when I edit an existing document in my monitored folder, the system automatically reprocesses it and updates the summary

**Implementation Scope**:
- **Backend**: Enhance webhook handler for modified files
  - Detect file modification events (X-Goog-Resource-State: update header)
  - Lookup existing uploaded_files record by external_id
  - Download updated file content
  - Recompute content_hash
  - If hash changed:
    * Update uploaded_files record (new hash, updated_at)
    * Delete old processed_documents entry
    * Queue for reprocessing
    * Log sync_event (event_type='file_modified', status='processing')
  - If hash unchanged (metadata-only change):
    * Skip reprocessing
    * Log as "No content changes detected"
- **Data**:
  - UPDATE uploaded_files SET content_hash, updated_at
  - DELETE processed_documents WHERE file_id
  - INSERT new processed_documents after reprocessing
  - INSERT sync_events (event_type='file_modified')
- **UI**: Dashboard shows "Updated XX minutes ago" timestamp
- **Feedback**:
  - File card in dashboard shows "Processing..." state
  - Summary updates after reprocessing completes
  - Timestamp reflects last update time

**Test Scenario** (from quickstart.md Edge Case 3):
1. Drive sync active with at least one file synced
2. Edit existing file in Drive (change content, save)
3. Wait 30 seconds for webhook
4. Monitor terminal for webhook log
5. Navigate to dashboard
6. Verify file shows "Processing..." state
7. Wait for processing to complete
8. Verify summary content reflects changes
9. Check sync_events: `SELECT * FROM sync_events WHERE event_type='file_modified';`

**Files Modified**:
- `app/api/webhooks/google-drive/route.ts` (enhance with modification logic)
- `app/dashboard/page.tsx` (add "Updated at" timestamp display)

**Dependencies**: T006 (extends webhook handler)

---

### T008 [SLICE] User disconnects Drive and sync stops immediately
**User Story**: As a user with Drive sync enabled, I can disconnect my Google Drive account and verify that no further sync operations occur

**Implementation Scope**:
- **UI**: Disconnect button in settings
  - "Disconnect" button appears when connection active
  - Confirmation dialog: "Stop syncing from Google Drive?"
  - Loading state during disconnection
- **Backend**:
  - POST `/api/cloud/google-drive/disconnect` (`app/api/cloud/google-drive/disconnect/route.ts`)
    * Retrieve cloud_connections record
    * Call Drive API to stop webhook channel (drive.channels.stop)
    * DELETE cloud_connections record (CASCADE deletes sync_events via FK)
    * Clear any cached tokens
    * Return success status
- **Data**:
  - DELETE FROM cloud_connections WHERE provider='google_drive'
  - Sync_events CASCADE deleted (ON DELETE CASCADE in FK)
  - Existing uploaded_files remain (historical data preserved)
- **Feedback**:
  - Success toast: "Google Drive disconnected"
  - ConnectionStatus shows "Disconnected"
  - "Connect Google Drive" button reappears

**Test Scenario** (from quickstart.md Scenario 5):
1. Navigate to `/settings/cloud` with active connection
2. Click "Disconnect" button
3. Confirm in dialog
4. Verify "Disconnected" status appears
5. Add new file to previously monitored Drive folder
6. Wait 60 seconds
7. Check dashboard - new file should NOT appear
8. Database check: `SELECT * FROM cloud_connections WHERE provider='google_drive';`
9. Verify 0 rows returned (connection deleted)

**Files Created/Modified**:
- `app/settings/cloud/page.tsx` (add disconnect UI)
- `app/api/cloud/google-drive/disconnect/route.ts` (create)
- `lib/services/googleDriveService.ts` (add stopWebhook method)

**Dependencies**: T002 (requires connection to disconnect)

---

## Phase 3: Error Handling & Recovery

### [X] T009 [SLICE] User sees automatic token refresh when tokens expire
**User Story**: As a user with Drive sync enabled, when my OAuth access token expires, the system automatically refreshes it without requiring me to reconnect

**Implementation Scope**:
- **Backend**: Token refresh logic in googleDriveService
  - Intercept Drive API 401 Unauthorized responses
  - Check token_expires_at timestamp (proactive refresh if <5 min remaining)
  - Call Google OAuth token refresh endpoint with refresh_token
  - Decrypt existing refresh_token
  - Obtain new access_token and refresh_token
  - Encrypt and update cloud_connections record
  - Retry original API call with new token
  - Log token refresh event in sync_events (event_type='sync_error', status='completed', error_message='Token refreshed')
- **Error Handling**:
  - If refresh fails (invalid_grant):
    * Update cloud_connections with error flag
    * Send notification to user: "Reconnect Google Drive"
    * Log sync_event (event_type='sync_error', status='failed', error_message='Token refresh failed')
- **Data**:
  - UPDATE cloud_connections SET access_token, refresh_token, token_expires_at, updated_at
  - INSERT sync_events for refresh attempts
- **UI**: Settings page shows error badge if refresh fails
- **Feedback**:
  - Successful refresh: silent (no user action needed)
  - Failed refresh: error notification "Reconnect Google Drive"

**Test Scenario** (from quickstart.md Scenario 4):
1. Drive sync active
2. Manually expire token in database:
   ```sql
   UPDATE cloud_connections
   SET token_expires_at = NOW() - INTERVAL '1 hour'
   WHERE provider = 'google_drive';
   ```
3. Add new file to monitored Drive folder
4. Wait for webhook to trigger
5. Monitor terminal logs: should see "Token expired, refreshing..."
6. Verify file processes successfully despite initial expiration
7. Database check: `SELECT token_expires_at FROM cloud_connections;`
8. Verify token_expires_at updated to future timestamp (~1 hour from now)

**Files Modified**:
- `lib/services/googleDriveService.ts` (add token refresh interceptor)
- `app/settings/cloud/page.tsx` (add error state UI)

**Dependencies**: T002 (requires OAuth tokens)

---

### [X] T010 [SLICE] User sees validation errors for invalid text input
**User Story**: As a user entering text in Quick Capture, if I try to submit empty content or exceed 100KB, I see clear error messages

**Implementation Scope**:
- **UI**: Form validation in TextInputModal
  - Empty content error: "Content cannot be empty"
  - Oversized content error: "Content exceeds 100KB limit (current: XXX KB)"
  - "Process" button disabled when invalid
  - Error messages display below textarea (red text)
- **Backend**: Server-side validation in `/api/text-input`
  - Check content.trim().length > 0
  - Check Buffer.byteLength(content) ≤ 102400 bytes
  - Return 400 Bad Request with error details if invalid
- **Validation**:
  - Client-side (instant feedback): React state validation
  - Server-side (security): Zod schema validation
- **Feedback**:
  - Error text appears immediately as user types
  - Button remains disabled until content valid
  - Server validation errors shown as toast

**Test Scenario** (from quickstart.md Edge Cases 1-2):
1. Open Quick Capture modal
2. Click "Process" with empty textarea
3. Verify error: "Content cannot be empty"
4. Paste 101,000 characters
5. Verify error: "Content exceeds 100KB limit"
6. Verify "Process" button disabled
7. Reduce to 50,000 characters
8. Verify error clears, button enabled
9. Try server bypass (curl POST with empty content)
10. Verify 400 response with error message

**Files Modified**:
- `app/components/TextInputModal.tsx` (add validation logic)
- `app/api/text-input/route.ts` (add server-side validation)

**Dependencies**: T004 (extends text input validation)

---

## Phase 4: Monitoring & Polish

### [X] T011 [P] [POLISH] Add webhook delivery retry with exponential backoff
**Enhancement to**: T006, T007

**Implementation Scope**:
- **Backend**: Implement retry queue for failed webhook processing
  - If webhook processing fails (network error, Drive API timeout):
    * Log sync_event with status='failed', error_message
    * Add to retry queue with exponential backoff (1min, 5min, 15min, 1hr)
    * Background job processes retry queue
  - If all retries exhausted:
    * Mark sync_event as permanently failed
    * Log error for monitoring
- **Services**:
  - `lib/services/webhookRetry.ts` - Retry queue management
- **Data**:
  - UPDATE sync_events SET status='failed', retry_count, next_retry_at
- **Feedback**: Sync errors visible in settings page "Sync Activity" log

**Test Scenario**:
1. Simulate Drive API timeout during webhook processing
2. Verify sync_event logged with status='failed'
3. Wait 1 minute
4. Verify retry attempt logged
5. If retry succeeds, status='completed'

**Files Created/Modified**:
- `lib/services/webhookRetry.ts` (create)
- `app/api/webhooks/google-drive/route.ts` (integrate retry logic)

**Dependencies**: T006 (extends webhook error handling)

---

### [X] T012 [P] [POLISH] Add "Sync Activity" log in settings page
**Enhancement to**: T002, T003, T006

**Implementation Scope**:
- **UI**: Sync activity panel in settings
  - Table showing recent sync_events (last 20)
  - Columns: timestamp, file_name, event_type, status
  - Status indicators: success (green), failed (red), processing (yellow)
  - Expandable error messages for failed events
  - "Manual Sync" button to trigger full folder rescan
- **Backend**:
  - Extend GET `/api/cloud-connections` to include recent sync_events
  - POST `/api/cloud/google-drive/manual-sync` for manual folder rescan
- **Data**:
  - Query sync_events with pagination
- **Feedback**: User can see sync history and troubleshoot issues

**Test Scenario**:
1. Navigate to `/settings/cloud` with active connection
2. Verify "Sync Activity" section appears
3. Check recent sync events displayed
4. Add new file to Drive
5. Verify event appears in log within 30s
6. Click "Manual Sync" button
7. Verify full folder rescan initiated

**Files Modified**:
- `app/settings/cloud/page.tsx` (add sync activity UI)
- `app/api/cloud-connections/route.ts` (include sync_events in response)
- `app/api/cloud/google-drive/manual-sync/route.ts` (create)

**Dependencies**: T003 (requires sync_events data)

---

### [X] T013 [P] [POLISH] Add Vercel Cron job for webhook channel renewal
**Enhancement to**: T003

**Implementation Scope**:
- **Backend**: Daily cron job to renew webhook channels
  - Create `/api/cron/renew-webhooks/route.ts`
  - Query cloud_connections WHERE updated_at < NOW() - 23 hours
  - For each connection:
    * Call drive.channels.stop(webhook_id)
    * Re-register webhook with drive.files.watch(folder_id)
    * Update webhook_id and updated_at
  - Log renewal events in sync_events
- **Configuration**:
  - Add `vercel.json` cron configuration:
    ```json
    {
      "crons": [{
        "path": "/api/cron/renew-webhooks",
        "schedule": "0 2 * * *"
      }]
    }
    ```
- **Data**:
  - UPDATE cloud_connections SET webhook_id, updated_at
  - INSERT sync_events (event_type='sync_error', error_message='Webhook renewed')
- **Feedback**: Webhook channels never expire (renewed automatically)

**Test Scenario**:
1. Deploy to Vercel
2. Verify cron job scheduled in Vercel dashboard
3. Wait for 2 AM UTC
4. Check logs: should see "Webhook renewal job started"
5. Database check: verify updated_at timestamps refreshed
6. Confirm sync continues working after 24+ hours

**Files Created**:
- `app/api/cron/renew-webhooks/route.ts` (create)
- `vercel.json` (create or modify)

**Dependencies**: T003 (requires webhook_id to renew)

---

## Dependencies

```
T001 (Setup) → [Blocks ALL other tasks]
  ↓
T002 [P] (OAuth) ──────────┬──→ T003 (Folder Selection)
T004 [P] (Text Input) ────┘      ↓
  ↓                              T006 (Webhook Sync)
T005 (Draft Recovery)             ↓
  ↓                              T007 (File Modified)
T010 (Text Validation)            ↓
                                 T008 (Disconnect)
                                  ↓
                                 T009 (Token Refresh)
                                  ↓
                                 T011 [P] (Webhook Retry)
                                 T012 [P] (Sync Activity Log)
                                 T013 [P] (Cron Renewal)
```

**Critical Path**:
1. T001 (required foundation)
2. T002 → T003 → T006 → T007 (Drive sync flow)
3. T004 → T005 → T010 (Text input flow, can run parallel with Drive flow)

**Parallel Execution**:
- After T001: T002 + T004 can run in parallel (independent features)
- After T003: T008 + T009 can run with text input tasks
- Polish tasks (T011, T012, T013) can all run in parallel after core slices complete

---

## Validation Checklist
*All requirements verified*

- [x] Every [SLICE] task has a user story
- [x] Every [SLICE] task includes UI + Backend + Data + Feedback
- [x] Every [SLICE] task has a test scenario from quickstart.md
- [x] No backend-only or frontend-only tasks exist (T001 is justified setup)
- [x] Setup tasks are minimal (only T001 for database migrations)
- [x] Tasks ordered by user value: P0 journeys first, then error handling, then polish
- [x] Parallel tasks ([P]) operate on independent features (OAuth vs. Text Input)
- [x] Each task specifies exact file paths to modify (contracts referenced)

---

## Notes

- **[SLICE]** tasks are independently deployable and user-testable
- **[P]** tasks operate on different features/files and can run in parallel
- Text input feature (T004-T005, T010) is completely independent of Drive sync and can be developed/tested separately
- Drive sync flow (T002→T003→T006→T007→T008→T009) must be sequential due to OAuth dependencies
- Every slice MUST enable user to SEE, DO, and VERIFY something
- All tasks reference test scenarios from `quickstart.md` for validation
- Contract tests for each API endpoint available in `contracts/` directory
- Migration SQL files pre-written in `data-model.md` for T001

**Total Tasks**: 13 (1 setup + 12 slices)
**Estimated Completion**:
- Phase 0: 1 day (T001 - database setup)
- Phase 1: 3-4 days (T002-T005 - core user journeys)
- Phase 2: 2-3 days (T006-T008 - webhook sync)
- Phase 3: 2 days (T009-T010 - error handling)
- Phase 4: 2-3 days (T011-T013 - polish)

**Total**: ~10-12 days for complete feature with all slices validated
