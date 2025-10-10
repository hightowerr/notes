# Frontend Implementation Plan: T005 - Multi-File Upload with Queue Display

**Task**: T005 [SLICE] User sees system handle concurrent uploads correctly (max 3 parallel)

**Agent**: frontend-ui-builder

**Date**: 2025-10-10

---

## Overview

Enhance the upload UI to support multiple file uploads simultaneously with visual queue status display. Show users which files are processing immediately vs queued.

## Acceptance Criteria

1. User can drag and drop multiple files at once
2. User can select multiple files via file picker
3. Each file shows individual status badge: "Uploading" / "Processing" / "Queued" / "Complete"
4. Queued files display position: "Queued - Position 2 of 2"
5. Status updates automatically via existing polling mechanism
6. UI handles 5+ concurrent uploads gracefully
7. Staggered animations for multiple file cards

## Technical Requirements

### 1. Multi-File Upload Support (Already Exists!)

**Current State**: `app/page.tsx` already has multi-file support:
- File input has `multiple` attribute
- `handleFilesAdded` iterates over `File[]`
- Existing code processes each file individually

**No changes needed** - multi-file upload already works!

### 2. Enhanced Status Display

**New Status Badge**: Add "Queued" status display

**Current file statuses**:
```typescript
type FileUploadStatus = 'idle' | 'uploading' | 'pending' | 'processing' | 'completed' | 'review_required' | 'failed';
```

**Backend returns**:
- `status: 'pending'` when queued
- `queuePosition: number` (1-based position in queue)

**UI Enhancement**:
```typescript
interface UploadedFileInfo {
  id: string;
  name: string;
  size: number;
  uploadedAt: number;
  status: FileUploadStatus;
  queuePosition?: number; // NEW: Track queue position
  error?: string;
  summary?: DocumentOutput;
  confidence?: number;
  processingDuration?: number;
}
```

### 3. Queue Position Badge

**Design**:
```tsx
case 'pending':
  return (
    <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
      <Clock className="h-3.5 w-3.5" aria-label="Queued" />
      <span className="font-medium">
        {file.queuePosition
          ? `Queued - Position ${file.queuePosition}`
          : 'Queued'}
      </span>
    </Badge>
  );
```

**Icon**: Use `Clock` icon from lucide-react (already installed)

### 4. Upload Response Handling

**Update upload success handler**:

```typescript
if (response.ok && result.success) {
  setFiles((prev) =>
    prev.map((f) =>
      f.id === tempId
        ? {
            ...f,
            id: result.fileId,
            status: result.status, // 'processing' or 'pending'
            queuePosition: result.queuePosition, // null or number
          }
        : f
    )
  );

  // Show appropriate toast based on queue status
  const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
  if (result.queuePosition !== null) {
    toast.info(
      `${file.name} (${sizeInMB}MB) uploaded - Queued at position ${result.queuePosition}`
    );
  } else {
    toast.success(`${file.name} (${sizeInMB}MB) uploaded - Processing...`);
  }

  // Start status polling (existing code)
  startPolling(result.fileId, file.name);
}
```

### 5. Status Polling Enhancement

**Current polling**: Already handles status transitions correctly

**Queue position updates**: As files complete, backend updates `status` from 'pending' → 'processing'

**Polling logic** (no changes needed):
- Polls `/api/status/[fileId]` every 2 seconds
- Updates file status in state
- Shows toast when complete

The backend `/api/status` endpoint will return updated status as queue progresses.

### 6. Visual Enhancements

**Multiple File Cards**:
- Already animated with `framer-motion`
- Staggered animation delay: `delay: index * 0.05`
- Cards expand/collapse with SummaryPanel

**Queue Status Indicator** (Optional Enhancement):
```tsx
{files.length > 0 && (
  <div className="mb-4 flex gap-2">
    <Badge variant="outline">
      Processing: {files.filter(f => f.status === 'processing').length}
    </Badge>
    <Badge variant="secondary">
      Queued: {files.filter(f => f.status === 'pending').length}
    </Badge>
    <Badge variant="outline">
      Complete: {files.filter(f => f.status === 'completed' || f.status === 'review_required').length}
    </Badge>
  </div>
)}
```

## Implementation Steps

### Step 1: Update TypeScript Interface

Add `queuePosition` to `UploadedFileInfo` interface.

### Step 2: Add "Queued" Status Badge

Update `getStatusBadge()` function to handle 'pending' status.

### Step 3: Update Upload Response Handler

Extract `queuePosition` from backend response and store in file state.

### Step 4: Update Toast Notifications

Show different message for queued vs immediate processing.

### Step 5: (Optional) Add Queue Status Summary

Display overall queue metrics at top of file list.

### Step 6: Test with Multiple Files

Manually test with 5+ files to verify queue display.

## Files to Modify

- `app/page.tsx` (MODIFY - enhance for queue display)

**Note**: Multi-file upload already works! This task is primarily about **displaying** queue status.

## Component Integration

**Backend provides**:
- `queuePosition: number | null` in upload response
- `status: 'pending'` when queued
- Automatic status transitions via polling

**Frontend displays**:
- "Queued - Position X" badge for pending files
- "Processing" badge when status changes to processing
- Appropriate toast notifications

## Edge Cases

1. **Queue position updates**: As queue progresses, backend changes status from 'pending' → 'processing'. Frontend polling picks up change automatically.
2. **Multiple simultaneous uploads**: All files added at once, staggered display, each tracked independently.
3. **Fast processing**: Files may process before queue position updates - polling handles this.
4. **Server restart**: In-memory queue resets (P0 acceptable limitation) - files remain in 'pending' status.

## Accessibility

- ARIA labels on status badges
- Screen reader announces queue position changes
- Keyboard navigation already supported
- Focus management maintained

## Success Metrics

- User can drop 5 files at once
- First 3 show "Processing" immediately
- Files 4-5 show "Queued - Position 1" and "Position 2"
- Queue position updates as files complete
- All files eventually complete
- No UI jank or performance issues

---

**Agent Status**: Ready to implement
**Next Step**: Update page.tsx with queue status display
