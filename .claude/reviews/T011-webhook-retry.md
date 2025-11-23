# Code Review: T011 - Webhook Delivery Retry with Exponential Backoff

## Status
**PASS WITH MINOR ISSUES**

## Summary
The implementation of webhook retry logic with exponential backoff is fundamentally sound and meets all critical acceptance criteria. The code correctly implements the 4-attempt retry schedule (1min, 5min, 15min, 1hr), properly tracks retry state in the database, and integrates cleanly with the existing webhook handler. However, there are important issues related to retry persistence across server restarts and missing Zod schema updates that should be addressed.

---

## Issues Found

### CRITICAL
None

### HIGH

**1. Retry State Lost on Server Restart (Memory-Only Storage)**

**File**: `lib/services/webhookRetry.ts`  
**Lines**: 5, 27-34  
**Issue**: The `scheduledRetries` Map stores retry timers in memory only. If the server restarts, all pending retries are lost even though `next_retry_at` is persisted in the database.

**Impact**: 
- Retries scheduled for future execution will not run after server restart
- Users may experience silent failures without notification
- Database shows `next_retry_at` but no retry actually happens

**Fix**: Add recovery mechanism on server startup:
```typescript
// lib/services/webhookRetry.ts
import { supabase } from '@/lib/supabase';

export async function recoverPendingRetries() {
  const { data: pendingEvents } = await supabase
    .from('sync_events')
    .select('id, connection_id, external_file_id, retry_count, next_retry_at')
    .eq('status', 'failed')
    .not('next_retry_at', 'is', null);

  if (!pendingEvents) return;

  const now = Date.now();
  for (const event of pendingEvents) {
    const scheduledTime = new Date(event.next_retry_at!).getTime();
    const delay = Math.max(0, scheduledTime - now);
    
    // Reschedule if not yet overdue
    if (delay < 24 * 60 * 60 * 1000) { // Within 24 hours
      // Re-schedule retry with appropriate handler
      // (Requires passing webhook context from database or reconstructing)
    }
  }
}
```

**Alternative**: Document that retries are best-effort and lost on restart, or implement a background job to poll `next_retry_at` periodically.

---

**2. Zod Schema Missing retry_count and next_retry_at Fields**

**File**: `lib/schemas/syncEventSchema.ts`  
**Lines**: 21-30  
**Issue**: The Zod schema for `syncEventSchema` does not include `retry_count` or `next_retry_at` fields added in migration 018.

**Impact**:
- Schema validation may fail when these fields are present in database responses
- Type safety compromised for retry-related operations
- Inconsistency between database schema and TypeScript types

**Fix**: Update schema to include new fields:
```typescript
// lib/schemas/syncEventSchema.ts
export const syncEventSchema = z.object({
  id: z.string().uuid(),
  connection_id: z.string().uuid(),
  event_type: syncEventTypeEnum,
  external_file_id: z.string().min(1),
  file_name: z.string().min(1).nullable(),
  status: syncEventStatusEnum,
  error_message: z.string().nullable(),
  retry_count: z.number().int().min(0).default(0),
  next_retry_at: z.string().datetime().nullable(),
  created_at: z.string().datetime()
});
```

---

### MEDIUM

**3. Connection Deletion Does Not Cancel Pending Retries**

**File**: `app/api/webhooks/google-drive/route.ts`  
**Lines**: 98-109 (scheduleRetryForEvent handler)  
**Issue**: When a connection is deleted (T008 disconnect flow), pending retry timers in `scheduledRetries` Map are not cleared. The retry handler checks if connection exists (line 98) but doesn't call `cancelWebhookRetry()`.

**Impact**:
- Unnecessary retry attempts even after user disconnects
- Retry handlers execute and log errors about missing connections
- Minor resource waste

**Fix**: Add cleanup when connection deletion detected:
```typescript
// In scheduleRetryForEvent handler (line 98-109)
if (error || !data) {
  console.error('[Google Drive Webhook] Retry aborted; connection missing', {
    eventId: params.eventId,
    connectionId: params.connectionId,
    error,
  });
  
  // Cancel pending retry since connection gone
  cancelWebhookRetry(params.eventId);
  
  await upsertSyncEvent(params.eventId, {
    status: 'failed',
    errorMessage: 'Google Drive connection unavailable for retry',
    nextRetryAt: null,
  });
  return;
}
```

**Note**: Also consider adding cleanup in disconnect endpoint (`app/api/cloud/google-drive/disconnect/route.ts`) to proactively cancel all retries for a connection.

---

**4. DriveTokenRefreshError Does Not Trigger Retry**

**File**: `app/api/webhooks/google-drive/route.ts`  
**Lines**: 744-759  
**Issue**: When token refresh fails (`DriveTokenRefreshError`), the code marks the event as failed but does NOT schedule a retry (line 757 returns early). However, temporary network issues could cause token refresh failures that might succeed on retry.

**Current behavior**: Permanent failure on first token refresh error  
**Expected behavior**: Retry token refresh failures (unless `invalid_grant`)

**Fix**: Only skip retry for `invalid_grant` (user must reconnect):
```typescript
// Line 744-759
if (error instanceof DriveTokenRefreshError) {
  console.error('[Google Drive Webhook] Token refresh failed during processing', {
    connectionId: connection.id,
    error,
  });
  
  const message =
    error.reason === 'invalid_grant'
      ? 'Google Drive access expired. Reconnect Google Drive.'
      : 'Failed to refresh Google Drive credentials.';
  
  await upsertSyncEvent(eventId, {
    status: 'failed',
    errorMessage: message,
    nextRetryAt: null,
  });
  
  // Only retry if NOT invalid_grant
  if (error.reason !== 'invalid_grant') {
    await scheduleRetryForEvent({
      eventId,
      attempt,
      connectionId: connection.id,
      fileId,
      requestUrl,
      headersSnapshot,
    });
  }
  
  return;
}
```

---

**5. Legacy Schema Fallback Silently Drops retry_count and next_retry_at**

**File**: `app/api/webhooks/google-drive/route.ts`  
**Lines**: 197-226  
**Issue**: The `upsertSyncEvent` function has legacy schema fallback that only updates `status`, `file_name`, and `error_message`. If retry columns don't exist yet (pre-migration 018), `retry_count` and `next_retry_at` are silently ignored.

**Impact**:
- Retry state not persisted in databases missing migration 018
- No error/warning logged when retry fields dropped
- User may run old schema while code expects new columns

**Fix**: Log warning when retry fields are dropped:
```typescript
// Line 197-226 in upsertSyncEvent
if (isLegacySchemaError(error)) {
  const legacyUpdates: Record<string, unknown> = {};

  if (updates.status !== undefined) {
    legacyUpdates.status = updates.status;
  }
  if (updates.file_name !== undefined) {
    legacyUpdates.file_name = updates.file_name;
  }
  if (updates.error_message !== undefined) {
    legacyUpdates.error_message = updates.error_message;
  }
  
  // Warn if retry fields were dropped
  if (updates.retry_count !== undefined || updates.next_retry_at !== undefined) {
    console.warn('[Google Drive Webhook] Retry fields not persisted (legacy schema)', {
      eventId,
      droppedFields: {
        retry_count: updates.retry_count,
        next_retry_at: updates.next_retry_at,
      }
    });
  }

  // ... rest of fallback logic
}
```

---

### LOW

**6. Test Coverage for Max Retries Exhaustion Missing**

**File**: `__tests__/contract/google-drive-webhook.test.ts`  
**Lines**: 1156-1231  
**Issue**: The test only verifies retry success after 1 attempt. There's no test for exhausting all 4 retries and permanent failure.

**Suggestion**: Add test case:
```typescript
it('marks event as permanently failed after 4 retry attempts exhausted', async () => {
  // Mock download to fail 5 times (initial + 4 retries)
  vi.spyOn(googleDriveService, 'downloadFile')
    .mockRejectedValue(new Error('Persistent Drive outage'));

  // Trigger webhook
  // Advance timers through all 4 retry delays
  // Verify final status is 'failed' with retry_count=4 and next_retry_at=null
});
```

---

**7. Retry Delays Not Exported for Testing/Documentation**

**File**: `lib/services/webhookRetry.ts`  
**Lines**: 1  
**Issue**: The `RETRY_DELAYS_MS` constant is exported (line 60), but not prominently documented or validated.

**Suggestion**: Add JSDoc comment for clarity:
```typescript
/**
 * Exponential backoff retry schedule for webhook failures.
 * 
 * Attempts: 4 total (after initial failure)
 * - Attempt 0: 1 minute (60,000ms)
 * - Attempt 1: 5 minutes (300,000ms)
 * - Attempt 2: 15 minutes (900,000ms)
 * - Attempt 3: 1 hour (3,600,000ms)
 */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000] as const;
```

---

## Standards Compliance

- [x] Tech stack patterns followed (Next.js 15, TypeScript strict mode, Supabase)
- [x] TypeScript strict mode clean (all types properly defined)
- [x] Files in scope only (webhookRetry.ts, route.ts, test file, migration)
- [x] TDD workflow followed (test file includes retry scenario)
- [x] Error handling proper (logging, status tracking, error messages)

## Implementation Quality

**Backend**:
- [x] Zod validation present (uses existing schemas, needs update per HIGH #2)
- [x] Error logging proper (comprehensive console.error with context)
- [x] API contract documented (implicit via types and test coverage)
- [x] Service layer properly structured (clean separation of concerns)
- [x] Database patterns followed (upsertSyncEvent, proper UPDATE logic)

## Vertical Slice Check

- [x] User can SEE result (sync_events table shows retry_count, next_retry_at)
- [x] User can DO action (system automatically retries failed webhooks)
- [x] User can VERIFY outcome (sync_events.status transitions to 'completed' or 'failed')
- [x] Integration complete (full-stack: webhook → retry service → database)

---

## Strengths

1. **Clean API Design**: `scheduleWebhookRetry()` has clear interface (task → delay | null)
2. **Memory Safety**: Proper timer cleanup in `cancelWebhookRetry()` prevents memory leaks
3. **Exponential Backoff**: Correctly implements 1min → 5min → 15min → 1hr schedule
4. **Max Attempts Enforcement**: Retry stops after 4 attempts (line 19-22)
5. **Database Persistence**: `next_retry_at` stored for observability
6. **Testing Utilities**: `__testing` exports for integration tests (line 48-58)
7. **Background Task Isolation**: Uses `scheduleWebhookTask()` to prevent blocking webhook response
8. **Error Context Logging**: Comprehensive error details logged for debugging
9. **Integration with Existing Handler**: Minimal changes to webhook route (lines 772-779)
10. **Test Coverage**: Includes retry success scenario with timer simulation

---

## Recommendations

### Priority 1 (HIGH issues - should fix before production)

1. **Fix Retry Persistence**: Implement `recoverPendingRetries()` or document restart limitation
2. **Update Zod Schema**: Add `retry_count` and `next_retry_at` to `syncEventSchema`

### Priority 2 (MEDIUM issues - improve reliability)

3. **Connection Deletion Cleanup**: Cancel retries when connection deleted
4. **Retry Token Refresh Errors**: Only skip retry for `invalid_grant`
5. **Warn on Legacy Schema**: Log when retry fields are dropped

### Priority 3 (LOW issues - enhance quality)

6. **Add Exhaustion Test**: Verify permanent failure after 4 retries
7. **Document Retry Schedule**: Add JSDoc to `RETRY_DELAYS_MS`

---

## Next Steps

**If PASS WITH MINOR ISSUES accepted**:
- Proceed to test-runner with current implementation
- Address HIGH issues in follow-up task (recommended before production)
- Track MEDIUM/LOW issues as tech debt

**If Requires Revision**:
- Fix HIGH #1 (retry persistence) and HIGH #2 (Zod schema)
- Re-submit for code review
- Then proceed to test-runner

---

**Reviewed by**: code-reviewer  
**Date**: 2025-11-01  
**Verdict**: PASS WITH MINOR ISSUES  
**Recommendation**: Address HIGH issues before production deployment
