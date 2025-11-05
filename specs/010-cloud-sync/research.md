# Research: Cloud Storage Sync and Direct Text Input

**Feature**: 010-cloud-sync
**Date**: 2025-10-31
**Status**: Complete

## Overview

This document consolidates research findings for integrating Google Drive sync and direct text input features. All technical decisions support the constitutional principles of autonomous operation, modular architecture, and deterministic outputs.

---

## Research Area 1: Google Drive API Integration

### Decision
Use Google Drive Push Notifications (webhooks) for change detection instead of polling.

### Rationale
- **Latency**: Webhooks provide <30 second notification latency vs. 60+ seconds for polling intervals
- **Quota efficiency**: Webhooks don't consume API quota during idle periods. Polling would hit quota limits with 100+ users checking every minute
- **Scalability**: Webhook-based architecture scales horizontally (multiple servers receive same webhook)
- **Cost**: No unnecessary API calls when no changes occur

### Alternatives Considered
1. **Polling (rejected)**
   - Would require 1 API call/minute/user = 86,400 calls/day/user
   - Google Drive API quota: 1,000 queries per 100 seconds per user (max ~864K/day)
   - With 100 users, polling exhausts 100% of quota budget
   - Polling introduces 30-120s latency based on interval

2. **Google Drive Activity API (rejected)**
   - Still requires polling (no push notifications available)
   - More complex query syntax
   - Same quota consumption as file polling
   - No latency improvement

### Implementation Details
- **Webhook registration**: `googleapis` library `drive.files.watch()` method
- **Webhook endpoint**: `/api/webhooks/google-drive` (POST handler)
- **Channel expiration**: 24 hours (Google Drive limitation)
- **Renewal strategy**: Daily cron job renews channels before expiry

### References
- [Google Drive Push Notifications](https://developers.google.com/drive/api/guides/push)
- [Webhook channel lifecycle](https://developers.google.com/drive/api/guides/manage-changes)

---

## Research Area 2: OAuth Token Security

### Decision
Encrypt OAuth tokens at rest using AES-256-CBC via `crypto-js`, store encryption key in `ENCRYPTION_KEY` environment variable.

### Rationale
- **Threat model**: Database compromise (SQL injection, credential leak, backup exposure)
- **Token longevity**: OAuth refresh tokens have no expiration (valid until revoked)
- **Compliance**: Industry standard practice for sensitive credentials
- **Performance**: Negligible encryption/decryption overhead (<1ms per token)

### Alternatives Considered
1. **Database-level encryption (rejected)**
   - Supabase free tier doesn't support column-level encryption
   - Would require migration to paid tier
   - Less granular control (encrypts entire database, not specific fields)

2. **Token hashing (rejected)**
   - Hashing is one-way (can't decrypt for API calls)
   - Would require storing tokens in plaintext to use them
   - Defeats purpose of security measure

3. **No encryption (rejected)**
   - High risk if database compromised
   - Violates security best practices
   - Refresh tokens grant long-term access to user's Drive

### Implementation Details
- **Algorithm**: AES-256-CBC (symmetric encryption)
- **Library**: `crypto-js` (widely used, well-audited)
- **Key management**: 32-byte random key stored in environment variable
- **Rotation**: Manual key rotation requires re-encrypting all tokens (documented procedure)

### Code Pattern
```typescript
import CryptoJS from 'crypto-js';

export function encryptToken(token: string): string {
  const key = process.env.ENCRYPTION_KEY!;
  return CryptoJS.AES.encrypt(token, key).toString();
}

export function decryptToken(encrypted: string): string {
  const key = process.env.ENCRYPTION_KEY!;
  const bytes = CryptoJS.AES.decrypt(encrypted, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}
```

### References
- [OAuth 2.0 Token Security](https://datatracker.ietf.org/doc/html/rfc6749#section-10.4)
- [CryptoJS Documentation](https://cryptojs.gitbook.io/docs/)

---

## Research Area 3: Webhook Channel Management

### Decision
Store webhook `channel_id` and `resource_id` in `cloud_connections.webhook_id`, implement daily renewal cron job (Vercel Cron or separate scheduler).

### Rationale
- **Google limitation**: Webhook channels expire after 24 hours (hard limit)
- **Failure mode**: Expired channels stop receiving notifications (sync breaks silently)
- **Renewal requirement**: Must call `drive.channels.stop()` then re-register with `drive.files.watch()`
- **Timing**: Renew at 23 hours (1-hour safety margin)

### Alternatives Considered
1. **No renewal (rejected)**
   - Sync breaks after 24 hours for all users
   - Manual reconnection required (violates Autonomous principle)
   - Poor user experience (data loss risk)

2. **On-demand renewal when webhook fails (rejected)**
   - Can't detect expiry until first failure occurs
   - Gap in monitoring (miss changes between expiry and renewal)
   - Reactive instead of proactive

3. **Per-connection cron jobs (rejected)**
   - Scaling issue: 1000 users = 1000 cron jobs
   - Cron systems have job limits
   - Single daily job can check all connections

### Implementation Details
- **Cron schedule**: Daily at 2 AM UTC (low-traffic window)
- **Query**: `SELECT * FROM cloud_connections WHERE created_at < NOW() - INTERVAL '23 hours'`
- **Renewal logic**:
  1. Call `drive.channels.stop({ channelId, resourceId })`
  2. Re-register with `drive.files.watch()`
  3. Update `webhook_id` and `updated_at` in database
  4. Log renewal event in `sync_events`

- **Error handling**: If renewal fails, mark connection status as `error`, notify user

### Vercel Cron Configuration
```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/renew-webhooks",
    "schedule": "0 2 * * *"
  }]
}
```

### References
- [Google Drive Channels Expiration](https://developers.google.com/drive/api/guides/push#renewing-channels)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)

---

## Research Area 4: Text Input Storage Strategy

### Decision
Create "virtual" `uploaded_files` records with `source='text_input'`, skip Supabase Storage upload, store markdown directly in `processed_documents.markdown_content`.

### Rationale
- **Pipeline reuse**: Existing processing pipeline expects `uploaded_files` record (status tracking, embeddings, dashboard display)
- **Storage optimization**: No file upload overhead (text is already in memory)
- **Consistency**: Same data model for manual uploads, Drive sync, and text input
- **Deduplication**: Content hash still works (prevents duplicate processing of identical text)

### Alternatives Considered
1. **Separate `text_inputs` table (rejected)**
   - Duplicates schema fields (filename, status, content_hash, timestamps)
   - Requires separate dashboard queries (JOIN or UNION)
   - Breaks existing embedding/search logic (expects `uploaded_files` FK)
   - Adds schema complexity without benefit

2. **Temporary file creation (rejected)**
   - Unnecessary I/O (write to `/tmp`, upload to Supabase, delete temp file)
   - Performance overhead (3 extra operations)
   - Storage quota consumption (counts against bucket limits)
   - Cleanup complexity (orphaned temp files)

3. **Bypass `uploaded_files`, direct to `processed_documents` (rejected)**
   - Dashboard expects `uploaded_files` records (breaks existing UI)
   - Status polling broken (no `uploaded_files.status` to query)
   - Embedding generation fails (embeddingService expects file_id FK)

### Implementation Details
- **Virtual file record**:
  ```typescript
  {
    id: uuidv4(),
    filename: title || `Text Input - ${new Date().toISOString()}`,
    file_size: Buffer.byteLength(content, 'utf-8'),
    file_type: 'text/markdown',
    source: 'text_input',       // NEW: distinguishes from uploads
    external_id: null,           // NEW: no Drive ID
    sync_enabled: false,         // NEW: not monitored
    storage_path: null,          // No Supabase Storage file
    content_hash: sha256(content), // Deduplication
    status: 'processing'
  }
  ```

- **Processing flow**:
  1. Insert virtual `uploaded_files` record
  2. Skip Supabase Storage upload
  3. Call `aiSummarizer.extractSummary(content)` directly (content already markdown)
  4. Insert `processed_documents` with markdown_content
  5. Generate embeddings (same as file uploads)

### Schema Migration
```sql
-- 015_add_source_to_uploaded_files.sql
ALTER TABLE uploaded_files
  ADD COLUMN source TEXT DEFAULT 'manual_upload'
  CHECK (source IN ('manual_upload', 'google_drive', 'text_input'));

ALTER TABLE uploaded_files ADD COLUMN external_id TEXT;
ALTER TABLE uploaded_files ADD COLUMN sync_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE uploaded_files ALTER COLUMN storage_path DROP NOT NULL; -- Allow NULL for text_input
```

---

## Research Area 5: Drive File Deduplication

### Decision
Compute SHA-256 content hash for Drive files, query `uploaded_files.content_hash` before processing. Skip if hash exists.

### Rationale
- **Use case**: User manually uploads `meeting-notes.pdf`, then enables Drive sync for folder containing same file
- **Without deduplication**: File processed twice (wasted API quota, duplicate embeddings, confusing dashboard)
- **Hash collision**: SHA-256 collision probability is ~10^-60 (negligible for 10K documents)
- **Consistency**: Reuses existing hash algorithm from manual upload flow

### Alternatives Considered
1. **Drive file ID tracking (rejected)**
   - Doesn't detect manual uploads (different identifiers)
   - False negative: Same file uploaded manually + synced from Drive
   - Requires complex ID mapping table

2. **Filename matching (rejected)**
   - False negatives if file renamed
   - False positives if two files have same name (different content)
   - Unreliable identifier

3. **No deduplication (rejected)**
   - Poor user experience (duplicate summaries)
   - Wasted processing resources
   - Dashboard clutter

### Implementation Details
- **Hash computation**:
  ```typescript
  import crypto from 'crypto';

  function hashContent(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
  ```

- **Deduplication check** (in webhook handler):
  ```typescript
  const fileBuffer = await downloadFromDrive(fileId);
  const hash = hashContent(fileBuffer);

  const { data: existing } = await supabase
    .from('uploaded_files')
    .select('id, filename')
    .eq('content_hash', hash)
    .single();

  if (existing) {
    console.log(`[Webhook] Duplicate detected: ${existing.filename} (skipping)`);
    await supabase.from('sync_events').insert({
      event_type: 'file_added',
      external_file_id: fileId,
      status: 'completed',
      error_message: `Duplicate of ${existing.filename}`
    });
    return; // Skip processing
  }
  ```

### Performance
- **Hash speed**: SHA-256 hashes 10MB file in ~50ms (negligible overhead)
- **Query speed**: Indexed `content_hash` field enables <10ms lookups

---

## Research Area 6: LocalStorage Draft Recovery

### Decision
Auto-save text input draft to browser `localStorage` every 500ms (debounced), restore on modal open.

### Rationale
- **Use case**: User types 500 words, accidentally closes browser tab, loses all content
- **UX impact**: Critical for trust (users won't use feature if data loss occurs)
- **Storage location**: LocalStorage (100% client-side, no backend storage/auth required)
- **Debounce interval**: 500ms balances responsiveness (feels instant) vs. write frequency (reduces overhead)

### Alternatives Considered
1. **Server-side draft storage (rejected)**
   - Requires user authentication (P0 doesn't have auth)
   - Adds API endpoint complexity
   - Network latency (slower than localStorage)
   - Requires periodic cleanup (orphaned drafts)

2. **No draft recovery (rejected)**
   - Poor UX (data loss risk)
   - Users won't trust feature
   - Common browser behavior (users accidentally close tabs)

3. **Save on blur/close only (rejected)**
   - `beforeunload` event unreliable (not triggered on force-close)
   - No recovery if browser crashes
   - Misses browser tab crashes (common on mobile)

### Implementation Details
- **LocalStorage key**: `text-input-draft` (simple, single draft per browser)
- **Debounce**: 500ms (using `lodash.debounce` or custom implementation)
- **Save logic**:
  ```typescript
  const debouncedSave = useCallback(
    debounce((content: string, title: string) => {
      localStorage.setItem('text-input-draft', JSON.stringify({ content, title, timestamp: Date.now() }));
    }, 500),
    []
  );

  useEffect(() => {
    debouncedSave(content, title);
  }, [content, title]);
  ```

- **Restore logic** (on modal open):
  ```typescript
  useEffect(() => {
    if (open) {
      const draft = localStorage.getItem('text-input-draft');
      if (draft) {
        const { content, title, timestamp } = JSON.parse(draft);
        // Only restore if draft is <24 hours old (prevent stale drafts)
        if (Date.now() - timestamp < 86400000) {
          setContent(content);
          setTitle(title);
          toast.info('Draft restored');
        }
      }
    }
  }, [open]);
  ```

- **Clear draft** (after successful submission):
  ```typescript
  localStorage.removeItem('text-input-draft');
  ```

### Storage Limits
- **LocalStorage capacity**: 5-10MB per origin (browser-dependent)
- **Draft size**: 100KB max (feature constraint) = <2% of storage
- **Collision risk**: None (single draft per feature, overwrite on each save)

### References
- [LocalStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [beforeunload reliability issues](https://developer.chrome.com/blog/page-lifecycle-api/)

---

## Summary

All research decisions align with constitutional principles:
- **Autonomous**: Webhooks detect changes automatically, text input processes immediately
- **Deterministic**: All data structures use Zod schemas, consistent processing pipeline
- **Modular**: New services integrate via existing interfaces (processingQueue, embeddingService)
- **Observable**: Sync events logged, token refresh tracked, draft saves visible
- **Testable**: Contract tests for webhooks, integration tests for OAuth flow

**Next Phase**: Design data models and API contracts based on these decisions.
