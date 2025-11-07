# Manual Test: Google Drive Document Reprocessing

## Goal
Verify that a synced Google Drive document can be reprocessed to pull the latest file revision and update analysis results end-to-end.

---

## Prerequisites
- Google Drive connection already linked under **Settings → Cloud Sync**.
- A Google Drive file (PDF/DOCX/TXT) synced into the dashboard (status `completed`).
- Ability to edit the source Drive file (so we can change content before reprocessing).
- Local environment variables set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, Google OAuth secrets.

---

## Test Steps

1. **Prepare source file**
   - Open Google Drive and locate the synced document (e.g., `Meeting Notes.pdf`).
   - Make a clear edit (e.g., append “Reprocessing Manual Test” near the top).
   - Wait ~30 seconds for Drive to auto-save.

2. **Confirm dashboard state**
   - Navigate to `/dashboard`.
   - Locate the document card. Ensure status is `completed` (no pending jobs).
   - Expand the card and note current summary/decisions for later comparison.

3. **Trigger reprocess**
   - Click the card’s actions menu (`⋮`) → choose **Reprocess**.
   - Observe toast: “Document reprocessed successfully” (or similar).
   - Card should show overlay text `Downloading latest from Drive...` followed by `Processing...`.

4. **Verify dashboard refresh**
   - Wait for the card to return to `completed` or `review_required`.
   - Expand the card again. Confirm summary content matches Drive edit (new phrase appears).
   - Note the updated `Updated` timestamp on the card.

5. **Check Supabase tables**
   - In Supabase SQL editor, confirm new processed record:
     ```sql
     SELECT id, file_id, processed_at
     FROM processed_documents
     WHERE file_id = '<DOCUMENT_UUID>'
     ORDER BY processed_at DESC;
     ```
     Expect newest row with recent `processed_at`.
   - Ensure old processed row is removed.
   - Verify processing log recorded event:
     ```sql
     SELECT operation, status, timestamp
     FROM processing_logs
     WHERE file_id = '<DOCUMENT_UUID>'
       AND operation = 'reprocess'
     ORDER BY timestamp DESC
     LIMIT 1;
     ```
     Expect `status = 'completed'`.

6. **Confirm storage updates**
   - In Supabase Storage (`notes` bucket), locate new file path under `cloud/google-drive/<connection>/<hash>-...`.
   - Optionally download to ensure it matches the latest Drive edit.

---

## Failure Scenarios to Validate

### A. Drive file deleted
1. Remove the source file from Google Drive.
2. On the dashboard, try reprocessing.
3. Expect toast error: “File no longer available in Google Drive”.
4. Confirm API returned HTTP 404.

### B. Drive auth expired
1. Revoke app access via Google Account → Security → Third-party access.
2. Attempt reprocess from dashboard.
3. Expect toast error: “Google Drive authentication expired. Please reconnect your account.”
4. Settings page should show connection in error state.

### C. Already processing / queued
1. Trigger a reprocess, but before it finishes, trigger again.
2. Expect immediate toast: “Document is already being processed. Please wait...”.
3. API returns 409.

---

## Cleanup
- Optionally revert Drive changes.
- Ensure dashboard card reflects latest correct summary.
- If Google auth was revoked, reconnect under Settings.

---

## Expected Outcomes
- Dashboard overlays show appropriate statuses (`Downloading latest from Drive...`, `Processing...`).
- Supabase tables updated with fresh `processed_documents` row and `reprocess` log entry.
- Toast notifications surface success or clear error messages for edge cases.
