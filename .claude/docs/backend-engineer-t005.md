# Backend Implementation Plan: T005 - Concurrent Upload Queue System

**Task**: T005 [SLICE] User sees system handle concurrent uploads correctly (max 3 parallel)

**Agent**: backend-engineer

**Date**: 2025-10-10

---

## Overview

Implement a processing queue service that manages concurrent file uploads, limiting parallel processing to a maximum of 3 files while queuing additional uploads in FIFO order.

## Acceptance Criteria

1. Queue service enforces max 3 parallel processing jobs
2. Additional uploads beyond limit are queued with position tracking
3. Queue processes in FIFO order
4. Upload endpoint integrates with queue service
5. Database tracks queue positions
6. Console logs show concurrency metrics

## Technical Requirements

### 1. Queue Service (`lib/services/processingQueue.ts`)

**Responsibilities**:
- Track active processing jobs (in-memory for P0)
- Enforce max 3 concurrent jobs
- Queue additional jobs beyond limit
- Process queue in FIFO order
- Provide queue position for new jobs

**Interface**:
```typescript
export interface QueueJob {
  fileId: string;
  filename: string;
  addedAt: number;
}

export class ProcessingQueue {
  private activeJobs: Set<string>; // fileId set
  private queuedJobs: QueueJob[];
  private readonly MAX_CONCURRENT = 3;

  // Add job to queue or mark as active
  enqueue(fileId: string, filename: string): {
    immediate: boolean;
    queuePosition: number | null
  }

  // Mark job as complete and process next in queue
  complete(fileId: string): Promise<void>

  // Get current queue status
  getStatus(): {
    activeCount: number;
    queuedCount: number;
    queuedJobs: QueueJob[];
  }
}
```

**Singleton Pattern**: Export single instance for shared state across API routes

### 2. Upload Endpoint Enhancement (`app/api/upload/route.ts`)

**Changes**:
1. Import and use ProcessingQueue service
2. Check queue status before triggering processing
3. If <3 active jobs: trigger immediately + return `queuePosition: null`
4. If ≥3 active jobs: add to queue + return `queuePosition: number`
5. Update console logs to include queue metrics

**Modified Response**:
```typescript
const successResponse: UploadSuccessResponse = {
  success: true,
  fileId,
  status: immediate ? 'processing' : 'pending',
  message: immediate
    ? `File uploaded successfully. Processing started.`
    : `File uploaded successfully. Queued at position ${queuePosition}.`,
  queuePosition: queuePosition, // null if immediate, number if queued
};
```

### 3. Process Endpoint Enhancement (`app/api/process/route.ts`)

**Changes**:
1. Import ProcessingQueue service
2. Call `queue.complete(fileId)` when processing finishes (success or failure)
3. This will trigger next queued job automatically

### 4. Database Migration

**Migration File**: `supabase/migrations/003_add_queue_position.sql`

```sql
-- Add queue_position column to uploaded_files table
ALTER TABLE uploaded_files
ADD COLUMN queue_position INTEGER DEFAULT NULL;

-- Add index for queue position
CREATE INDEX idx_uploaded_files_queue_position
ON uploaded_files(queue_position)
WHERE queue_position IS NOT NULL;

-- Comment
COMMENT ON COLUMN uploaded_files.queue_position IS
'Queue position for pending uploads (1-based). NULL if processing immediately or already processed.';
```

**Note**: For P0, queue state is in-memory. Queue position in database is for observability only.

## Implementation Steps (TDD Approach)

### Step 1: Write Failing Tests FIRST

Create `lib/services/__tests__/processingQueue.test.ts`:

```typescript
describe('ProcessingQueue', () => {
  it('should allow immediate processing when under limit', () => {
    const queue = new ProcessingQueue();
    const result = queue.enqueue('file-1', 'test.pdf');
    expect(result.immediate).toBe(true);
    expect(result.queuePosition).toBeNull();
  });

  it('should queue files when at max concurrent limit', () => {
    const queue = new ProcessingQueue();
    // Fill up to max
    queue.enqueue('file-1', 'test1.pdf');
    queue.enqueue('file-2', 'test2.pdf');
    queue.enqueue('file-3', 'test3.pdf');

    // 4th should queue
    const result = queue.enqueue('file-4', 'test4.pdf');
    expect(result.immediate).toBe(false);
    expect(result.queuePosition).toBe(1);
  });

  it('should process next queued job when one completes', async () => {
    const queue = new ProcessingQueue();
    // Fill to max
    queue.enqueue('file-1', 'test1.pdf');
    queue.enqueue('file-2', 'test2.pdf');
    queue.enqueue('file-3', 'test3.pdf');
    queue.enqueue('file-4', 'test4.pdf'); // Queued

    // Complete one
    await queue.complete('file-1');

    const status = queue.getStatus();
    expect(status.activeCount).toBe(3);
    expect(status.queuedCount).toBe(0);
  });

  it('should maintain FIFO order', () => {
    const queue = new ProcessingQueue();
    queue.enqueue('file-1', 'test1.pdf');
    queue.enqueue('file-2', 'test2.pdf');
    queue.enqueue('file-3', 'test3.pdf');

    const result4 = queue.enqueue('file-4', 'test4.pdf');
    const result5 = queue.enqueue('file-5', 'test5.pdf');

    expect(result4.queuePosition).toBe(1);
    expect(result5.queuePosition).toBe(2);
  });
});
```

### Step 2: Implement ProcessingQueue Service

Create `lib/services/processingQueue.ts` with full implementation.

### Step 3: Enhance Upload Endpoint

Modify `app/api/upload/route.ts` to integrate queue service.

### Step 4: Enhance Process Endpoint

Modify `app/api/process/route.ts` to call `queue.complete()`.

### Step 5: Create Database Migration

Write `supabase/migrations/003_add_queue_position.sql`.

### Step 6: Run Tests and Verify

Run test suite and ensure all tests pass.

## Files to Modify

- `lib/services/processingQueue.ts` (CREATE)
- `lib/services/__tests__/processingQueue.test.ts` (CREATE)
- `app/api/upload/route.ts` (MODIFY - integrate queue)
- `app/api/process/route.ts` (MODIFY - call complete)
- `supabase/migrations/003_add_queue_position.sql` (CREATE)
- `lib/schemas.ts` (MODIFY - update UploadSuccessResponse to match)

## Edge Cases to Handle

1. **Race conditions**: Multiple uploads finishing simultaneously
2. **Process endpoint called directly**: Should still respect queue
3. **Queue persistence**: P0 uses in-memory (resets on server restart - acceptable for P0)
4. **Error handling**: Failed jobs should still call `complete()` to process next
5. **Job not in queue**: `complete()` should handle gracefully (no-op)

## Console Logging

Add structured logging:

```typescript
console.log('[QUEUE] File enqueued:', {
  fileId,
  filename,
  immediate,
  queuePosition,
  activeCount: queue.getStatus().activeCount,
  queuedCount: queue.getStatus().queuedCount,
});

console.log('[QUEUE] Job completed, processing next:', {
  completedFileId,
  nextFileId,
  activeCount,
  queuedCount,
});
```

## Success Metrics

- Queue enforces 3 parallel max
- FIFO ordering maintained
- Queue positions accurate
- Automatic processing of next job on completion
- Console logs show queue state transitions
- No race conditions in concurrent scenarios

## Frontend Integration Notes

Backend provides:
- `queuePosition` in upload response (null or number)
- `status` field ('pending' vs 'processing')

Frontend will use these to:
- Display "Queued - Position X of Y" badge
- Poll for status changes (existing polling logic)

---

**Agent Status**: Ready to implement
**Next Step**: Write failing tests first, then implement
