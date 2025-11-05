# Webhook Fix Testing Guide

## What Was Fixed

✅ **Root Cause:** Folder-level webhook notifications didn't include file IDs, causing webhooks to be rejected
✅ **Solution:** Detect folder notifications and poll folder contents to identify new/modified files
✅ **Result:** Automatic file modification detection with `file_modified` events in database

## Changes Made

### 1. Database Migration
```sql
-- Migration 020: Add modified_time column
ALTER TABLE uploaded_files ADD COLUMN modified_time TIMESTAMPTZ;
CREATE INDEX idx_uploaded_files_external_id_modified ON uploaded_files(external_id, modified_time);
```

### 2. Code Updates
- ✅ `googleDriveFolderSync.ts` - Store `modified_time` when syncing files
- ✅ `webhooks/google-drive/route.ts` - Add `processFolderChange()` function
- ✅ `webhooks/google-drive/route.ts` - Detect folder vs file notifications
- ✅ `webhooks/google-drive/route.ts` - Compare timestamps to detect modifications

## Testing Steps

### Step 1: Apply Database Migration

Run the migration in Supabase SQL Editor:

```bash
# Option A: Via Supabase Dashboard
# 1. Go to https://supabase.com/dashboard
# 2. Select your project
# 3. Go to SQL Editor
# 4. Paste contents of supabase/migrations/020_add_modified_time_to_uploaded_files.sql
# 5. Click "Run"

# Option B: Via Supabase CLI (if installed)
supabase db push
```

Verify migration success:
```sql
-- Check column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'uploaded_files' AND column_name = 'modified_time';

-- Should return:
-- column_name    | data_type
-- modified_time  | timestamp with time zone
```

### Step 2: Restart Development Server

```bash
# Kill existing server (Ctrl+C)
# Restart
pnpm dev
```

### Step 3: Set Up Google Drive Sync

If not already connected:

```bash
# 1. Navigate to settings
http://localhost:3000/settings

# 2. Click "Connect Google Drive"
# 3. Complete OAuth flow
# 4. Select a folder to monitor
```

### Step 4: Test File Modification Detection

#### Test Case 1: Modify Existing File

```bash
# 1. Ensure you have at least one file synced from Drive
# 2. Open that file in Google Drive web interface
# 3. Make a visible change (add text, change formatting)
# 4. Save the file
# 5. Wait 30 seconds for webhook
```

**Expected Results:**

Terminal logs (http://localhost:3000 terminal):
```
[Webhook] Received notification for channel <channel-id>
[Google Drive Webhook] Processing folder change notification
[Google Drive Webhook] Detected modified file from folder poll
[Webhook] Processing file: <filename>
```

Database check:
```sql
-- Check sync events table
SELECT event_type, external_file_id, file_name, status, created_at
FROM sync_events
WHERE event_type = 'file_modified'
ORDER BY created_at DESC
LIMIT 5;

-- Should show:
-- event_type     | file_name        | status    | created_at
-- file_modified  | your-file.pdf    | completed | 2025-11-04 ...
```

File record check:
```sql
-- Verify modified_time was updated
SELECT name, modified_time, updated_at
FROM uploaded_files
WHERE source = 'google_drive'
ORDER BY updated_at DESC
LIMIT 1;

-- Should show updated timestamp
```

#### Test Case 2: Add New File

```bash
# 1. Upload a NEW file to your synced Drive folder
# 2. Wait 30 seconds for webhook
```

**Expected Results:**

Terminal logs:
```
[Google Drive Webhook] Detected new file from folder poll
[Webhook] Processing file: <new-filename>
```

Database check:
```sql
SELECT event_type, file_name, status
FROM sync_events
WHERE event_type = 'file_added'
ORDER BY created_at DESC
LIMIT 1;

-- Should show:
-- event_type  | file_name         | status
-- file_added  | new-file.docx     | completed
```

### Step 5: Verify No Duplicate Processing

```bash
# 1. Modify a file in Drive
# 2. Wait 5 seconds
# 3. Modify SAME file again
# 4. Wait 30 seconds
```

**Expected:** Only ONE `file_modified` event (content hash prevents duplicates)

```sql
SELECT COUNT(*), file_name
FROM sync_events
WHERE created_at > NOW() - INTERVAL '2 minutes'
GROUP BY file_name;

-- Each file should have count = 1
```

## Troubleshooting

### Webhook Not Received

**Symptom:** No terminal logs after modifying file

**Check:**
```bash
# 1. Verify webhook is registered
SELECT webhook_id, folder_id, status
FROM cloud_connections
WHERE provider = 'google_drive';

# Should show webhook_id (not null)
```

**Fix:** Re-select folder to re-register webhook:
```bash
# Navigate to settings
http://localhost:3000/settings
# Click "Disconnect"
# Click "Connect" again
# Select same folder
```

### Migration Failed

**Symptom:** Column already exists error

**Fix:**
```sql
-- Check if column exists
SELECT COUNT(*) FROM information_schema.columns
WHERE table_name = 'uploaded_files' AND column_name = 'modified_time';

-- If returns 1, migration already applied (safe to proceed)
```

### Modified Files Not Detected

**Symptom:** Webhook received but no file_modified events

**Debug:**
```bash
# 1. Check terminal for errors
# 2. Look for: "Detected modified file from folder poll"
```

**Check modified_time values:**
```sql
SELECT name, external_id, modified_time
FROM uploaded_files
WHERE source = 'google_drive';

-- If modified_time is NULL, re-sync folder
```

**Fix:** Trigger manual sync:
```bash
curl -X POST http://localhost:3000/api/cloud/google-drive/manual-sync \
  -H "Content-Type: application/json"
```

### File Processed But Still Shows "Processing"

**Symptom:** Status stuck in processing

**Check:**
```sql
SELECT id, name, status, queue_position
FROM uploaded_files
WHERE status = 'processing';
```

**Fix:** Trigger manual process:
```bash
# Get file ID from query above
curl -X POST http://localhost:3000/api/process \
  -H "Content-Type: application/json" \
  -d '{"fileId": "<file-id-here>"}'
```

## Success Criteria

✅ **Webhook receives folder notifications** (terminal shows logs)
✅ **File modifications create `file_modified` events** (database query confirms)
✅ **Timestamp comparison works** (only processes when modifiedTime changes)
✅ **No false positives** (same content = no reprocessing)
✅ **New files still work** (file_added events created)

## Performance Benchmarks

**Expected Latencies:**
- Webhook acknowledgment: <200ms
- Folder poll (100 files): 200-500ms
- File metadata fetch: 100-300ms per file
- Total detection time: <2 seconds for typical folder

**Monitor in terminal:**
```
[Google Drive Webhook] Processing folder change notification  # Start
[Google Drive Webhook] Detected modified file from folder poll  # ~500ms later
[Webhook] Processing file: <name>  # ~1-2s total
```

## Next Steps After Testing

Once all tests pass:

1. **Commit changes:**
```bash
git add .
git commit -m "Fix Google Drive webhook to detect folder changes and file modifications

- Add modified_time column to track file timestamps
- Implement folder polling when webhook received
- Compare Drive modifiedTime with DB to detect updates
- Create file_modified events for changed files
- Tested with real Drive file modifications"
```

2. **Deploy to production:**
```bash
# Ensure webhook URL is publicly accessible
# Google Drive requires HTTPS endpoint
```

3. **Monitor production:**
```sql
-- Check sync events over time
SELECT DATE(created_at) as date, event_type, COUNT(*)
FROM sync_events
GROUP BY DATE(created_at), event_type
ORDER BY date DESC
LIMIT 30;
```

## Rollback Plan (If Needed)

If issues occur, rollback database:

```sql
-- Remove migration
DROP INDEX IF EXISTS idx_uploaded_files_external_id_modified;
ALTER TABLE uploaded_files DROP COLUMN IF EXISTS modified_time;

-- Clear recent sync events
DELETE FROM sync_events WHERE created_at > '2025-11-04';
```

Then revert code changes:
```bash
git revert HEAD
```
