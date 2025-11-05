# Webhook Fix Guide: Google Drive Folder Sync

## Problem
Webhooks are being sent by Google Drive, but the handler rejects them because it can't extract individual file IDs from folder-level notifications.

## Root Cause
When watching a **folder** with `drive.files.watch({ fileId: folderId })`, Google Drive sends notifications about folder changes, NOT individual file changes. The headers contain folder information only.

## Solution

### Option 1: Poll Folder on Webhook (Recommended for Phase 5)

When a folder webhook is received, query the folder to find what changed.

**Modified Webhook Handler Logic:**

```typescript
// app/api/webhooks/google-drive/route.ts

export async function POST(request: Request) {
  // ... existing validation ...

  const snapshot = getDriveWebhookHeaders(headers);
  const resourceState = snapshot.resourceState?.toLowerCase();

  // Load connection
  const { data: connection } = await supabase
    .from('cloud_connections')
    .select('id, folder_id, access_token, refresh_token, token_expires_at, webhook_id')
    .eq('id', snapshot.channelToken)
    .maybeSingle();

  if (!connection || !connection.folder_id) {
    return NextResponse.json({ accepted: false }, { status: 202 });
  }

  // Detect if this is a FOLDER notification (not a specific file)
  const fileId = extractFileIdFromHeaders(headers);
  const isFolderNotification = !fileId || fileId === connection.folder_id;

  if (isFolderNotification) {
    // This is a folder change notification
    // Schedule background task to poll folder for changes
    scheduleWebhookTask(() =>
      processFolderChange({
        connection,
        folderId: connection.folder_id,
        requestUrl: request.url,
        headersSnapshot: snapshot,
      })
    );

    return NextResponse.json({ accepted: true }, { status: 202 });
  }

  // Otherwise process as individual file notification (future enhancement)
  scheduleWebhookTask(() =>
    processWebhookNotification({
      connection,
      fileId,
      requestUrl: request.url,
      headersSnapshot: snapshot,
    })
  );

  return NextResponse.json({ accepted: true }, { status: 202 });
}
```

**New Function: processFolderChange**

```typescript
async function processFolderChange({
  connection,
  folderId,
  requestUrl,
  headersSnapshot,
}: {
  connection: CloudConnectionRow & { folder_id: string };
  folderId: string;
  requestUrl: string;
  headersSnapshot: DriveWebhookHeaders;
}) {
  try {
    const tokens: DriveCredentials = {
      accessToken: decryptToken(connection.access_token),
      refreshToken: decryptToken(connection.refresh_token),
      tokenExpiresAt: connection.token_expires_at,
      connectionId: connection.id,
    };

    const driveClient = createDriveClient(tokens);

    // List all files in the folder
    const driveFiles = await listFilesInFolder(
      folderId,
      tokens,
      { connectionId: connection.id },
      driveClient
    );

    // Get all currently synced files from this folder
    const { data: syncedFiles } = await supabase
      .from('uploaded_files')
      .select('external_id, content_hash, modified_time')
      .eq('source', 'google_drive')
      .not('external_id', 'is', null);

    const syncedFileMap = new Map(
      (syncedFiles || []).map(f => [f.external_id, f])
    );

    // Identify new and modified files
    for (const driveFile of driveFiles) {
      const existing = syncedFileMap.get(driveFile.id);

      if (!existing) {
        // New file - process it
        await processWebhookNotification({
          connection,
          fileId: driveFile.id,
          requestUrl,
          headersSnapshot: {
            ...headersSnapshot,
            resourceState: 'add',
          },
        });
      } else if (
        driveFile.modifiedTime &&
        existing.modified_time &&
        new Date(driveFile.modifiedTime) > new Date(existing.modified_time)
      ) {
        // Modified file - reprocess it
        await processWebhookNotification({
          connection,
          fileId: driveFile.id,
          requestUrl,
          headersSnapshot: {
            ...headersSnapshot,
            resourceState: 'update',
          },
        });
      }
    }

    // Update last_sync timestamp
    await supabase
      .from('cloud_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', connection.id);

  } catch (error) {
    console.error('[Google Drive Webhook] Folder change processing failed', {
      connectionId: connection.id,
      folderId,
      error,
    });

    await supabase.from('sync_events').insert({
      connection_id: connection.id,
      event_type: 'sync_error',
      external_file_id: folderId,
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Folder polling failed',
    });
  }
}
```

**Required Schema Change:**

Add `modified_time` column to track file timestamps:

```sql
ALTER TABLE uploaded_files ADD COLUMN modified_time TIMESTAMPTZ;
```

Update `googleDriveFolderSync.ts` to store modified time:

```typescript
// In syncFolderContents(), line ~165
const { error: insertError } = await supabase.from('uploaded_files').insert({
  id: fileId,
  name: file.name,
  size: fileBuffer.byteLength,
  mime_type: file.mimeType,
  content_hash: contentHash,
  uploaded_at: new Date().toISOString(),
  storage_path: storagePath,
  status: initialStatus,
  source: 'google_drive',
  external_id: file.id,
  modified_time: file.modifiedTime, // ← ADD THIS
  sync_enabled: true,
  queue_position: queueResult.queuePosition,
});
```

### Option 2: Use Changes API Instead (Better for Production)

Switch from folder watch to Changes API which provides file-level granularity.

**Pros:**
- More efficient (only processes actual changes)
- Provides file IDs directly in notifications
- Supports deletions
- Industry standard for Drive sync

**Cons:**
- More complex to implement
- Requires tracking `pageToken` state
- Out of scope for initial implementation

## Testing the Fix

1. **After implementing Option 1:**

```bash
# 1. Apply schema change
# Run migration: ALTER TABLE uploaded_files ADD COLUMN modified_time TIMESTAMPTZ;

# 2. Sync a folder (sets up webhook)
curl -X POST http://localhost:3000/api/cloud/google-drive/select-folder \
  -H "Content-Type: application/json" \
  -d '{"folderId": "YOUR_FOLDER_ID", "folderName": "Test Folder"}'

# 3. Modify a file in Google Drive
# Wait 10-30 seconds for webhook notification

# 4. Check sync events
SELECT * FROM sync_events ORDER BY created_at DESC LIMIT 10;
# Should see event_type = 'file_modified' for updated files

# 5. Check terminal logs
# Look for: "[Webhook] Processing file: {filename}" with resourceState: 'update'
```

## Implementation Steps

1. Add `modified_time` column to `uploaded_files` table
2. Update `googleDriveFolderSync.ts` to store `modifiedTime`
3. Add `processFolderChange()` function to webhook handler
4. Modify webhook POST handler to detect folder notifications
5. Update `processWebhookNotification()` to handle both add and update states
6. Test with file modifications in Drive

## Expected Behavior After Fix

✅ **New file added to Drive folder:**
- Webhook received with resourceState = 'change'
- Folder polled, new file detected
- `file_added` event created in sync_events
- File downloaded and processed

✅ **Existing file modified in Drive:**
- Webhook received with resourceState = 'update'
- Folder polled, modified timestamp compared
- `file_modified` event created in sync_events ← **THIS SHOULD NOW WORK**
- File re-downloaded and reprocessed

## Performance Considerations

**Polling Overhead:**
- Each webhook triggers one folder list operation
- For folders with 100 files: ~200-500ms polling time
- Trade-off: simplicity vs efficiency

**Future Optimization:**
- Implement Changes API for production
- Add incremental sync with pageToken tracking
- Batch webhook notifications (debounce rapid changes)
