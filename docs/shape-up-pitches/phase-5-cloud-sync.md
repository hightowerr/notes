# Shape Up Pitch: Phase 5 - Cloud Service Provider Sync

## Problem

**Users want seamless integration with their existing cloud storage, but currently must manually upload files through the web UI.**

Current workflow forces manual intervention:
1. User creates document in Google Drive
2. User must download file locally
3. User navigates to our app
4. User manually uploads via drag-and-drop
5. Document gets processed

**This breaks the autonomous principle** - users want "write once, sync everywhere" behavior.

**Pain points:**
- Manual file downloads are tedious
- No automatic sync when documents are updated in Drive
- Can't quickly capture raw text without creating a file first
- No way to paste markdown directly into the system
- Users forget to upload updated versions of documents

**Current state:**
- ✅ File upload works (`POST /api/upload`)
- ✅ Processing pipeline is autonomous
- ❌ No cloud storage integration
- ❌ No monitoring for new/updated files
- ❌ No direct text input option

**Example user story:**
> "I keep meeting notes in Google Drive. Every time I update a note, I have to remember to download and re-upload it. I just want the app to watch my 'Work Notes' folder and auto-sync changes."

---

## Solution

**Add Google Drive monitoring + direct text input field for quick captures.**

### Appetite: 1.5 weeks (7-8 working days)

### Breadboard Sketch

```
┌──────────────────────────────────────────────────────────┐
│  Input Sources (3 options)                               │
│                                                           │
│  1. Manual Upload (existing)                             │
│     - Drag & drop interface                              │
│     - File picker                                        │
│                                                           │
│  2. ✨ Google Drive Sync (NEW)                           │
│     - OAuth connection to Google Drive                   │
│     - Select folder(s) to monitor                        │
│     - Webhook notifications for changes                  │
│     - Auto-download and process new/updated files        │
│                                                           │
│  3. ✨ Direct Text Input (NEW)                           │
│     - Markdown editor with preview                       │
│     - "Quick Capture" button in nav                      │
│     - Saves as virtual document (no file storage)        │
│     - Processes immediately                              │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Google Drive Sync Flow                                  │
│                                                           │
│  1. User: "Connect Google Drive"                         │
│     → OAuth flow (read-only scope)                       │
│     → Select folder: "Work Notes"                        │
│                                                           │
│  2. System: Register webhook for folder                  │
│     → Google sends notification on file create/update    │
│                                                           │
│  3. Webhook received:                                    │
│     → Download changed file                              │
│     → Check content hash for deduplication               │
│     → Trigger existing processing pipeline               │
│                                                           │
│  4. User sees: New document auto-appears in dashboard    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  Text Input Flow                                         │
│                                                           │
│  1. User clicks: "Quick Capture" button                  │
│     → Modal opens with markdown editor                   │
│                                                           │
│  2. User types/pastes text content                       │
│     → Live markdown preview (optional)                   │
│     → Save draft to localStorage                         │
│                                                           │
│  3. User clicks: "Process"                               │
│     → Create virtual document (source: "text_input")     │
│     → Skip file storage, go straight to processing       │
│     → Run AI extraction pipeline                         │
│                                                           │
│  4. User sees: Summary appears in dashboard              │
│     → Tagged as "Text Input" (not file upload)           │
└──────────────────────────────────────────────────────────┘
```

### Technical Implementation

**1. Database Schema Changes**

```sql
-- Extend uploaded_files table to support multiple sources
ALTER TABLE uploaded_files ADD COLUMN source TEXT DEFAULT 'manual_upload';
-- Options: 'manual_upload' | 'google_drive' | 'text_input'

ALTER TABLE uploaded_files ADD COLUMN external_id TEXT;
-- For Google Drive: file ID from Drive API
-- For text input: NULL

ALTER TABLE uploaded_files ADD COLUMN sync_enabled BOOLEAN DEFAULT FALSE;
-- TRUE if file should be monitored for updates

-- New table: cloud_connections
CREATE TABLE cloud_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- Future: link to auth system
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  access_token TEXT NOT NULL, -- Encrypted
  refresh_token TEXT NOT NULL, -- Encrypted
  token_expires_at TIMESTAMPTZ NOT NULL,
  folder_id TEXT, -- Google Drive folder ID to monitor
  webhook_id TEXT, -- Google Drive webhook registration ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- New table: sync_events (audit log)
CREATE TABLE sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES cloud_connections(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('file_added', 'file_modified', 'file_deleted', 'sync_error')),
  external_file_id TEXT NOT NULL,
  file_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**2. New Services**

**`lib/services/googleDriveService.ts`**
```typescript
import { google } from 'googleapis';

interface DriveConnection {
  accessToken: string;
  refreshToken: string;
  folderId: string;
}

export async function connectGoogleDrive(
  authCode: string
): Promise<DriveConnection> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Exchange auth code for tokens
  const { tokens } = await oauth2Client.getToken(authCode);

  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    folderId: '', // User selects in next step
  };
}

export async function registerWebhook(
  connection: DriveConnection
): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: getAuthClient(connection) });

  // Register push notification webhook
  const response = await drive.files.watch({
    fileId: connection.folderId,
    requestBody: {
      id: crypto.randomUUID(), // Webhook channel ID
      type: 'web_hook',
      address: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/google-drive`,
      token: generateWebhookToken(), // Verify webhook authenticity
    },
  });

  return response.data.id!;
}

export async function downloadFile(
  connection: DriveConnection,
  fileId: string
): Promise<{ content: Buffer; metadata: DriveFileMetadata }> {
  const drive = google.drive({ version: 'v3', auth: getAuthClient(connection) });

  // Get file metadata
  const { data: metadata } = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime',
  });

  // Download file content
  const { data: content } = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );

  return {
    content: Buffer.from(content as ArrayBuffer),
    metadata: {
      name: metadata.name!,
      mimeType: metadata.mimeType!,
      size: parseInt(metadata.size || '0'),
      modifiedTime: metadata.modifiedTime!,
    },
  };
}
```

**`lib/services/textInputService.ts`**
```typescript
import { v4 as uuidv4 } from 'uuid';

export async function processTextInput(
  content: string,
  title?: string
): Promise<string> {
  const fileId = uuidv4();

  // Create virtual "file" record
  const { error: uploadError } = await supabase
    .from('uploaded_files')
    .insert({
      id: fileId,
      filename: title || `Text Input - ${new Date().toISOString()}`,
      file_size: Buffer.byteLength(content, 'utf-8'),
      file_type: 'text/markdown',
      source: 'text_input',
      status: 'processing',
      content_hash: hashContent(content), // For deduplication
    });

  if (uploadError) throw uploadError;

  // Skip file storage, go straight to processing
  // Content is already markdown - no conversion needed
  await processMarkdownContent(fileId, content);

  return fileId;
}

async function processMarkdownContent(
  fileId: string,
  markdown: string
): Promise<void> {
  // Reuse existing AI extraction logic
  const summary = await extractSummary(markdown);

  // Store results
  await supabase.from('processed_documents').insert({
    file_id: fileId,
    markdown_content: markdown,
    structured_output: summary,
    confidence_score: summary.confidence,
    status: summary.confidence >= 80 ? 'completed' : 'review_required',
  });

  // Generate embeddings
  await generateAndStoreEmbeddings(fileId, summary);
}
```

**3. New API Endpoints**

**`app/api/cloud/google-drive/connect/route.ts`**
```typescript
// POST /api/cloud/google-drive/connect
// Initiates OAuth flow
export async function POST(request: NextRequest) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.readonly'],
    prompt: 'consent', // Force refresh token
  });

  return NextResponse.json({ authUrl });
}
```

**`app/api/cloud/google-drive/callback/route.ts`**
```typescript
// GET /api/cloud/google-drive/callback?code=...
// Handles OAuth callback
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Missing auth code' }, { status: 400 });
  }

  const connection = await connectGoogleDrive(code);

  // Store encrypted tokens
  await supabase.from('cloud_connections').insert({
    provider: 'google_drive',
    access_token: encrypt(connection.accessToken),
    refresh_token: encrypt(connection.refreshToken),
    token_expires_at: new Date(Date.now() + 3600 * 1000), // 1 hour
  });

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/cloud`);
}
```

**`app/api/webhooks/google-drive/route.ts`**
```typescript
// POST /api/webhooks/google-drive
// Receives notifications from Google Drive
export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id');
  const resourceState = request.headers.get('x-goog-resource-state');
  const token = request.headers.get('x-goog-channel-token');

  // Verify webhook token
  if (!verifyWebhookToken(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  // Log event
  await supabase.from('sync_events').insert({
    event_type: resourceState === 'update' ? 'file_modified' : 'file_added',
    external_file_id: channelId,
    status: 'pending',
  });

  // Process in background (don't block webhook response)
  processDriveChange(channelId).catch(console.error);

  return NextResponse.json({ received: true });
}

async function processDriveChange(channelId: string) {
  // Fetch connection
  const { data: connection } = await supabase
    .from('cloud_connections')
    .select('*')
    .eq('webhook_id', channelId)
    .single();

  if (!connection) return;

  // Download and process file
  const { content, metadata } = await downloadFile(connection, fileId);

  // Check if already processed (deduplication)
  const hash = hashContent(content);
  const { data: existing } = await supabase
    .from('uploaded_files')
    .select('id')
    .eq('content_hash', hash)
    .single();

  if (existing) {
    console.log('[GoogleDrive] File already processed, skipping');
    return;
  }

  // Upload to Supabase storage
  await supabase.storage
    .from('notes')
    .upload(`google-drive/${metadata.name}`, content);

  // Trigger processing pipeline
  await processUpload({
    filename: metadata.name,
    source: 'google_drive',
    external_id: fileId,
    sync_enabled: true,
  });
}
```

**`app/api/text-input/route.ts`**
```typescript
// POST /api/text-input
// Process raw text/markdown
export async function POST(request: NextRequest) {
  const { content, title } = await request.json();

  if (!content || content.trim().length === 0) {
    return NextResponse.json(
      { error: 'Content is required' },
      { status: 400 }
    );
  }

  if (content.length > 100_000) {
    return NextResponse.json(
      { error: 'Content exceeds 100KB limit' },
      { status: 413 }
    );
  }

  const fileId = await processTextInput(content, title);

  return NextResponse.json({ fileId, status: 'processing' });
}
```

**4. UI Components**

**`app/components/CloudSyncButton.tsx`**
```typescript
'use client';

export function CloudSyncButton() {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    const { authUrl } = await fetch('/api/cloud/google-drive/connect', {
      method: 'POST',
    }).then(r => r.json());

    // Open OAuth popup
    window.location.href = authUrl;
  };

  return (
    <Button onClick={handleConnect} disabled={isConnecting}>
      <DriveIcon className="mr-2" />
      Connect Google Drive
    </Button>
  );
}
```

**`app/components/TextInputModal.tsx`**
```typescript
'use client';

export function TextInputModal({ open, onClose }: Props) {
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async () => {
    setIsProcessing(true);

    const { fileId } = await fetch('/api/text-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title }),
    }).then(r => r.json());

    toast.success('Processing text input...');
    onClose();
    router.push(`/dashboard?highlight=${fileId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Quick Capture</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Title (optional)"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          <Textarea
            placeholder="Paste markdown or plain text here..."
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={15}
            className="font-mono"
          />

          <div className="flex justify-between">
            <p className="text-sm text-muted">
              {content.length.toLocaleString()} characters
            </p>

            <div className="space-x-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || isProcessing}
              >
                Process
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**`app/settings/cloud/page.tsx`**
```typescript
export default function CloudSettingsPage() {
  const [connections, setConnections] = useState<CloudConnection[]>([]);

  return (
    <div className="space-y-6">
      <h1>Cloud Storage Connections</h1>

      <Card>
        <CardHeader>
          <CardTitle>Google Drive</CardTitle>
          <CardDescription>
            Automatically sync documents from Google Drive folders
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <CloudSyncButton />
          ) : (
            <div className="space-y-4">
              {connections.map(conn => (
                <div key={conn.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Connected to Drive</p>
                    <p className="text-sm text-muted">
                      Monitoring: {conn.folder_name}
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Disconnect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Rabbit Holes

**1. Supporting multiple cloud providers**
- **Risk:** Trying to build abstraction layer for Drive, Dropbox, OneDrive simultaneously
- **Timebox:** Start with Google Drive only. Add abstraction if/when adding second provider.
- **Why it doesn't matter yet:** 80% of users likely use Google Drive. Ship one provider first, validate usage.

**2. Real-time sync vs polling**
- **Risk:** Building complex websocket system for instant sync
- **Timebox:** Use Google Drive webhooks (they push to us). Don't poll.
- **Why it doesn't matter yet:** Webhook latency is <30s. Good enough for document updates.

**3. Conflict resolution for simultaneous edits**
- **Risk:** Building complex merge logic if file changes while processing
- **Timebox:** Not in scope. Last write wins. Show warning if detected.
- **Why it doesn't matter yet:** Document processing takes <8s. Conflicts extremely rare.

**4. Selective folder sync (nested folders)**
- **Risk:** Building complex UI for selecting multiple nested folders
- **Timebox:** Single folder selection only. Flat structure.
- **Why it doesn't matter yet:** Users can create "AI Notes" folder with all docs inside.

**5. Markdown editor features (syntax highlighting, preview)**
- **Risk:** Building full-featured markdown editor with plugins
- **Timebox:** Plain textarea + basic preview. No syntax highlighting.
- **Why it doesn't matter yet:** Power users already have editors. This is for quick captures.

---

## No-Gos

**❌ Two-way sync (editing in our app pushes to Drive)**
- Read-only for Phase 5. Two-way sync is Phase 6+ if needed.

**❌ Supporting file types beyond PDF/DOCX/TXT**
- Google Sheets, Slides, etc. require different processing. Out of scope.

**❌ Version history / time-travel**
- Don't track every Drive revision. Re-process on change only.

**❌ Sharing/collaboration features**
- Don't import Drive permissions or sharing settings.

**❌ Multiple Google accounts per user**
- One Drive connection per user. Multi-account is future enhancement.

**❌ Rich text editor for text input**
- Markdown only. No WYSIWYG editor.

**❌ Offline mode**
- Requires local storage sync. Out of scope for cloud-first feature.

---

## Success Metrics

**Google Drive Sync:**
- ✅ User can connect Drive account via OAuth
- ✅ User can select folder to monitor
- ✅ Webhook receives notifications within 30s of file change
- ✅ New files auto-process without manual upload
- ✅ Updated files re-process automatically
- ✅ Deduplication prevents duplicate processing

**Text Input:**
- ✅ User can paste text and process immediately
- ✅ No file creation required
- ✅ Processing completes in <5s for text input
- ✅ Markdown formatting preserved
- ✅ Draft auto-saves to localStorage

**Performance:**
- Drive webhook response: <200ms (acknowledge immediately)
- File download from Drive: <3s for 10MB file
- Text input processing: <5s total (no file I/O overhead)

**Security:**
- ✅ OAuth tokens encrypted at rest
- ✅ Webhook requests validated (token verification)
- ✅ Read-only Drive scope (no write permissions)
- ✅ Token refresh handled automatically

**Deliverables:**
- ✅ Database schema for cloud connections
- ✅ Google Drive OAuth flow
- ✅ Webhook endpoint for Drive notifications
- ✅ Text input API endpoint
- ✅ UI: Cloud settings page
- ✅ UI: Quick capture modal
- ✅ UI: "Connect Drive" button in nav
- ✅ Contract tests for webhook handling
- ✅ Integration tests for text input flow

---

## Timeline Breakdown

**Day 1-2: Database & OAuth Setup**
- Create `cloud_connections` and `sync_events` tables
- Implement OAuth flow (connect endpoint + callback)
- Test token storage and refresh logic

**Day 3-4: Google Drive Integration**
- Implement webhook registration
- Build webhook handler endpoint
- Implement file download and processing
- Test end-to-end sync flow

**Day 5-6: Text Input Feature**
- Create text input API endpoint
- Build `TextInputModal` component
- Implement draft saving to localStorage
- Add "Quick Capture" button to nav

**Day 7-8: Settings UI & Polish**
- Build cloud settings page
- Add connection status indicators
- Implement disconnect flow
- Write tests and documentation
- Deploy and validate webhooks in production

---

## Dependencies

**External Services:**
- Google Cloud Console project (for OAuth credentials)
- Webhook endpoint must be publicly accessible (production domain)

**Environment Variables:**
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/cloud/google-drive/callback
ENCRYPTION_KEY=random_32_byte_key # For token encryption
```

**NPM Packages:**
```bash
pnpm add googleapis crypto-js
pnpm add -D @types/crypto-js
```

---

## Future Enhancements (Out of Scope for Phase 5)

**Phase 6 possibilities:**
- Support Dropbox, OneDrive
- Two-way sync (edit in app → update Drive)
- Selective file sync (checkboxes in Drive folder picker)
- Real-time collaboration (live updates via websockets)
- Version history viewer
- Conflict resolution UI

---

**Last Updated:** 2025-10-30
**Status:** Ready for Review
**Appetite:** 1.5 weeks
**Dependencies:** Google Cloud Console OAuth setup
