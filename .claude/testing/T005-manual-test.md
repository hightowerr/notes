# T005 Manual Test Plan - Concurrent Upload Queue Display

**Task**: T005 [SLICE] User sees system handle concurrent uploads correctly (max 3 parallel)

**Date**: 2025-10-10

**Status**: Ready for Testing

---

## Test Environment

- **Browser**: Chrome/Firefox (latest)
- **Server**: `npm run dev` (http://localhost:3000)
- **Test Files**: Prepare 5+ test files (PDF, DOCX, or TXT)

---

## Test Scenarios

### Scenario 1: Upload 5 Files Simultaneously

**Objective**: Verify queue display shows correct status for each file

**Steps**:
1. Start dev server: `npm run dev`
2. Open browser to http://localhost:3000
3. Prepare 5 test files (any mix of PDF/DOCX/TXT)
4. Drag and drop all 5 files at once onto the upload area

**Expected Results**:
- ✅ All 5 files appear in UI immediately with "Uploading" status
- ✅ Files 1-3 transition to "Processing" status (spinning loader icon)
- ✅ Files 4-5 show "Queued - Position 1" and "Queued - Position 2" (clock icon)
- ✅ Toast notifications show:
  - Files 1-3: "[filename] uploaded - Processing..."
  - Files 4-5: "[filename] uploaded - Queued at position X"
- ✅ Queue Status Summary shows:
  - Processing: 3
  - Queued: 2
  - Complete: 0

**Visual Verification**:
- Processing badge: Blue background, spinning loader icon
- Queued badge: Gray background, clock icon, shows position number
- Queue summary badges display at top of file list

---

### Scenario 2: Queue Progression (Files Complete)

**Objective**: Verify queued files automatically move to "Processing" as queue clears

**Steps**:
1. Continue from Scenario 1
2. Wait for first file to complete processing (~8 seconds)
3. Observe status changes

**Expected Results**:
- ✅ First file shows "Complete" status (green badge with checkmark)
- ✅ File 4 automatically transitions from "Queued - Position 1" → "Processing"
- ✅ File 5 updates from "Queued - Position 2" → "Queued - Position 1"
- ✅ Queue Status Summary updates:
  - Processing: 3 (files 2, 3, and 4)
  - Queued: 1 (file 5)
  - Complete: 1 (file 1)
- ✅ No manual refresh needed (automatic polling)

**Timing**:
- Status updates should occur within 2 seconds (polling interval)

---

### Scenario 3: All Files Complete

**Objective**: Verify final state after all processing completes

**Steps**:
1. Continue from Scenario 2
2. Wait for all files to complete (~8 seconds each)

**Expected Results**:
- ✅ All 5 files show "Complete" status
- ✅ Each file displays expanded SummaryPanel with AI output
- ✅ Queue Status Summary shows:
  - Processing: 0
  - Queued: 0
  - Complete: 5
- ✅ Console logs show concurrency metrics (check browser DevTools)

**Console Verification**:
```javascript
// Should see logs like:
[QUEUE] Job started: { fileId: '...', activeCount: 3, queuedCount: 2 }
[QUEUE] Job completed: { fileId: '...', activeCount: 2, queuedCount: 2 }
[QUEUE] Dequeued job: { fileId: '...', activeCount: 3, queuedCount: 1 }
```

---

### Scenario 4: Upload 10 Files (Stress Test)

**Objective**: Verify system handles larger queue gracefully

**Steps**:
1. Refresh page
2. Upload 10 files simultaneously

**Expected Results**:
- ✅ Files 1-3: "Processing" immediately
- ✅ Files 4-10: "Queued - Position 1" through "Position 7"
- ✅ Queue progresses smoothly as files complete
- ✅ UI remains responsive (no jank or freezing)
- ✅ Queue Status Summary updates correctly

**Performance**:
- No visual stuttering
- Smooth animations
- Accurate queue position updates

---

### Scenario 5: Upload One File at a Time

**Objective**: Verify single uploads still work (no regression)

**Steps**:
1. Refresh page
2. Upload 1 file
3. Wait for completion
4. Upload another file

**Expected Results**:
- ✅ First file shows "Processing" immediately (no queue)
- ✅ Toast: "[filename] uploaded - Processing..."
- ✅ No queue position displayed (null queuePosition)
- ✅ Second file also processes immediately (queue empty)

**Regression Check**:
- Behavior identical to pre-T005 implementation for single uploads

---

### Scenario 6: Mixed Upload Timing

**Objective**: Verify queue handles uploads added at different times

**Steps**:
1. Upload 3 files (all processing)
2. Wait 5 seconds
3. Upload 3 more files

**Expected Results**:
- ✅ First 3 files: "Processing" immediately
- ✅ Second batch (uploaded later):
  - If <3 slots available: "Processing"
  - If all 3 slots full: "Queued - Position X"
- ✅ Queue position calculated correctly based on current state

---

### Scenario 7: Error Handling with Queue

**Objective**: Verify queue handles failed uploads correctly

**Steps**:
1. Upload 5 files (3 processing, 2 queued)
2. If any fail (unlikely in test), observe behavior

**Expected Results**:
- ✅ Failed file shows "Failed" status (red badge)
- ✅ Queue continues processing remaining files
- ✅ Next queued file starts automatically

**Note**: Hard to test without intentional backend failure. Can verify in logs:
```javascript
[QUEUE] Job failed: { fileId: '...', error: '...' }
[QUEUE] Dequeued job: { fileId: '...', activeCount: 3, queuedCount: 1 }
```

---

## Visual Design Verification

### Status Badge Styles

**Uploading** (Transient):
- Icon: Spinning loader (Loader2)
- Color: Blue/Info
- Text: "Uploading"

**Queued** (NEW):
- Icon: Clock (static)
- Color: Gray/Accent
- Text: "Queued - Position X" or "Queued"
- Font: Medium weight

**Processing**:
- Icon: Spinning loader (Loader2)
- Color: Primary/Blue
- Text: "Processing"

**Complete**:
- Icon: Checkmark (CheckCircle2)
- Color: Green/Success
- Text: "Complete"

---

## Accessibility Verification

**ARIA Labels**:
- Clock icon: `aria-label="Queued"`
- Loader icons: `aria-label="Uploading"` / `aria-label="Processing"`
- Checkmark icon: `aria-label="Complete"`

**Screen Reader Test**:
- Tab through file list
- Verify status badges are announced correctly
- Queue position should be read: "Queued - Position 2"

---

## Browser Console Checks

### Expected Logs (Success Path)

```javascript
// Upload
[UPLOAD SUCCESS] {
  fileId: '...',
  filename: 'test.pdf',
  size: 12345,
  status: 'processing', // or 'pending'
  queuePosition: null, // or number
  timestamp: '...'
}

// Queue Management (Backend)
[QUEUE] Job started: { fileId: '...', activeCount: 3, queuedCount: 2 }
[QUEUE] Job completed: { fileId: '...', activeCount: 2, queuedCount: 2 }
[QUEUE] Dequeued job: { fileId: '...', activeCount: 3, queuedCount: 1 }

// Status Polling
[POLL SUCCESS] {
  fileId: '...',
  status: 'processing', // transitions: pending → processing → completed
  hasSummary: false,
  confidence: undefined
}

// Completion
[SUMMARY READY] {
  fileId: '...',
  filename: 'test.pdf',
  summary: { topics: [...], decisions: [...], actions: [...], lno_tasks: {...} }
}
```

---

## Success Criteria

- ✅ Multi-file upload works (5+ files simultaneously)
- ✅ Queue status displayed correctly (position numbers)
- ✅ Status badges use correct icons (Clock for queued)
- ✅ Toast notifications differentiate queued vs processing
- ✅ Queue Status Summary updates in real-time
- ✅ Automatic queue progression (no manual refresh)
- ✅ UI remains responsive with 10+ files
- ✅ Single-file uploads still work (no regression)
- ✅ ARIA labels present for accessibility
- ✅ Console logs show queue metrics

---

## Known Limitations (P0 Acceptable)

1. **In-Memory Queue**: Queue resets on server restart
2. **No Persistence**: Queued jobs lost if server crashes (can re-upload)
3. **No Cancellation**: No UI to cancel queued uploads (can refresh page)
4. **Fixed Concurrency**: Max 3 parallel jobs (not user-configurable)

---

## Testing Checklist

- [ ] Scenario 1: Upload 5 files simultaneously
- [ ] Scenario 2: Verify queue progression
- [ ] Scenario 3: All files complete
- [ ] Scenario 4: Upload 10 files (stress test)
- [ ] Scenario 5: Single file uploads (regression)
- [ ] Scenario 6: Mixed upload timing
- [ ] Scenario 7: Error handling with queue
- [ ] Visual design verification
- [ ] Accessibility verification
- [ ] Browser console checks

---

## Test Results

**Date Tested**: _____________

**Tester**: _____________

**Browser/Version**: _____________

**Results**: PASS / FAIL

**Notes**:
