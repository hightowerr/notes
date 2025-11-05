# Shape Up Pitch: Phase 6 - Document-Level Reprocessing

## Problem

**Users cannot re-analyze documents after OCR/AI improvements, forcing manual deletion and re-upload for hundreds of files.**

**Current pain:**
1. Improved OCR gibberish detection deployed (2025-11-05)
2. User has 300+ Google Drive presentations with gibberish output
3. Only option: Delete + re-upload (10 minutes per file = **50 hours** of manual work)
4. Google Drive files must be deleted from database, lose sync state, then manually re-synced
5. Users lose processing history, confidence scores, and timestamps

**Real-world scenario (TODAY):**
- User: "Guest Lecture Dexter Horthy.pdf" → 90% confidence, gibberish tasks
- System improved: Now detects gibberish, would show 30% confidence + helpful message
- User stuck: Cannot apply improvement without deleting 300 files individually

**Root cause:** No document-level reprocessing endpoint. Processing pipeline only runs on initial upload.

**Current workarounds (all bad):**
- ❌ Delete + re-upload (loses sync state, manual work)
- ❌ Wait for Google Drive webhook (only for modified files, not processing improvements)
- ❌ Manual folder re-sync (processes ALL files, not just ones needing retry)

**Business impact:**
- OCR improvements worthless if users can't apply them
- User frustration at "one-shot" processing
- Lost opportunity to surface improved insights

---

## Solution

**Add "Reprocess" button to each document card that re-runs the complete pipeline with latest improvements.**

### Appetite: Small batch (1-2 days)

**Why small batch:**
- Backend: Simple cascade delete + re-trigger existing pipeline (4 hours)
- Frontend: Dropdown menu + loading states (3 hours)
- Total: ~1 day actual work, 2 days with testing/polish

### Breadboard Sketch

```
┌──────────────────────────────────────────────────────────┐
│  Dashboard Card (UPDATED)                                │
│                                                          │
│  Guest Lecture.pdf                                       │
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │   [✓]        │  │  [⋮] Actions ▼                  │  │
│  │              │  │   ├─ ↻ Reprocess document        │  │
│  │              │  │   └─ 🗑 Delete document          │  │
│  └──────────────┘  └─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘

Reprocess Flow:
┌──────────────────────────────────────────────────────────┐
│  1. User clicks "Reprocess"                              │
│  2. Confirm dialog:                                      │
│     "Re-analyze with latest AI/OCR improvements?"        │
│  3. POST /api/documents/{id}/reprocess                   │
│     ├─ Google Drive: Download latest from Drive         │
│     ├─ Manual upload: Use existing storage_path         │
│     └─ Text input: ERROR (cannot reprocess)             │
│  4. Delete old processed_documents (CASCADE cleanup)     │
│  5. Reset status to 'pending'                            │
│  6. Trigger POST /api/process (existing pipeline)        │
│  7. Card shows loading spinner                           │
│  8. Background polling detects completion                │
│  9. Toast: "Document reprocessed successfully"           │
└──────────────────────────────────────────────────────────┘
```

### Technical Implementation

**New API Endpoint: `app/api/documents/[id]/reprocess/route.ts`**

```typescript
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const docId = params.id;

  // 1. Validate document exists
  const { data: file } = await supabase
    .from('uploaded_files')
    .select('id, name, source, external_id, storage_path')
    .eq('id', docId)
    .single();

  // 2. Source-specific handling
  let filePath = file.storage_path;

  if (file.source === 'google_drive') {
    // Re-download from Drive (latest version)
    const latestFile = await downloadFileById(file.external_id, tokens);
    filePath = await uploadToStorage(latestFile.buffer, docId);
  } else if (file.source === 'text_input') {
    return error('Cannot reprocess text input - no file stored');
  }

  // 3. Delete old processed data (CASCADE handles embeddings/relationships)
  await supabase
    .from('processed_documents')
    .delete()
    .eq('file_id', docId);

  // 4. Reset status
  await supabase
    .from('uploaded_files')
    .update({ status: 'pending' })
    .eq('id', docId);

  // 5. Trigger processing pipeline
  await fetch('/api/process', {
    method: 'POST',
    body: JSON.stringify({ fileId: docId }),
  });

  return { success: true, status: 'processing' };
}
```

**Frontend Changes: `app/dashboard/page.tsx`**

```typescript
// Replace single Delete button with dropdown menu
<DropdownMenu>
  <DropdownMenuTrigger>
    <Button variant="ghost" size="icon">⋮</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => handleReprocess(doc.id)}>
      <RefreshCw className="mr-2 h-4 w-4" />
      Reprocess
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => handleDelete(doc.id)} destructive>
      <Trash2 className="mr-2 h-4 w-4" />
      Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## Rabbit Holes

**1. Building complex "compare old vs new" UI**
- **Risk:** Spending 2 days on diff view showing changes
- **Timebox:** Not in scope. User sees standard dashboard card update.
- **Why it doesn't matter:** Processing improvements are self-evident (confidence score changes)

**2. Selective reprocessing (only run OCR, skip AI)**
- **Risk:** Complex flags for partial pipeline execution
- **Timebox:** Out of scope. Always run complete pipeline.
- **Why it doesn't matter:** Pipeline is fast enough (<10s), no user benefit from partial

**3. Batch reprocessing UI ("Reprocess all failed documents")**
- **Risk:** Building batch operations + progress tracking
- **Timebox:** Not in scope. Users can Reprocess one at a time.
- **Exit strategy:** If batch needed later, add as Phase 2

**4. Preserving confidence history**
- **Risk:** Building confidence score timeline/history
- **Timebox:** Out of scope. Only current confidence shown.
- **Why it doesn't matter:** Users care about final result, not history

---

## No-Gos

**❌ Automatic reprocessing when code changes**
- Too expensive. User opts in manually.

**❌ Reprocessing text input documents**
- No file stored, nothing to reprocess. Return clear error.

**❌ Partial pipeline execution (skip steps)**
- Always run full pipeline. Keeps code simple.

**❌ Reprocess history/audit log**
- Don't track "reprocessed on X date". Status field sufficient.

**❌ Side-by-side comparison view**
- Don't show old vs new output. User sees updated result only.

**❌ Bulk reprocessing from dashboard**
- One at a time only. Batch operations deferred to Phase 2 if needed.

---

## Success Metrics

**Performance:**
- Reprocess completes in <15s for typical document
- No memory leaks from cascade deletes

**User Experience:**
- User can click "Reprocess" → See loading → Get updated output in <15s
- Clear error for text input documents
- Toast notification confirms completion

**Data Integrity:**
- Old embeddings/relationships cleaned up (no orphans)
- Processing history preserved in `processing_logs`
- Google Drive sync state maintained

**Deliverables:**
- ✅ POST /api/documents/[id]/reprocess endpoint
- ✅ Dropdown menu in dashboard cards
- ✅ Google Drive re-download logic
- ✅ Cascade delete verification
- ✅ Loading states + error handling
- ✅ Manual test: Reprocess gibberish PDF → See improved output

---

## Executive Constraints

**Scope Commitment:**
This is a **1-2 day small batch**. If scope expands:
- **Circuit breaker:** Ship basic reprocess button first, defer enhancements
- **No scope creep:** Batch operations, comparison views, history tracking are Phase 2

**What executives must commit to:**
1. This ships with single-document reprocess only (no batch)
2. Text input documents return error (won't be supported)
3. No diff view showing old vs new (just updated result)

**If executives want batch reprocessing:**
- **Appetite increase:** +1 day (total 3 days small batch)
- **Trade-off:** Delayed ship date OR defer another feature

**Prevention mechanism:**
- Feature flag: `ENABLE_REPROCESS` (default: true)
- If complexity spikes, ship behind flag, iterate later

---

## Implementation File List

**New files:**
1. `app/api/documents/[id]/reprocess/route.ts` (~150 lines)

**Modified files:**
1. `app/dashboard/page.tsx` (~30 lines changed)
2. `lib/services/googleDriveService.ts` (~50 lines, add `downloadFileById()`)

**Total diff:** ~230 lines added/modified

**Testing:**
- Manual test: Reprocess Google Drive PDF
- Manual test: Reprocess manual upload
- Manual test: Attempt text input (should error)
- Verify cascade deletes work

---

## Risk Mitigation

**What could go wrong:**

1. **Google Drive file deleted** → Return 404 with clear message
2. **Token expired** → Return 401 with "Reconnect Drive"
3. **Processing fails** → Keep old data, return 500, user can retry
4. **Cascade delete orphans data** → Manual DB query test before ship

**Safety valves:**
- Feature flag allows emergency disable
- Old data deleted AFTER new processing succeeds (not before)
- Processing queue prevents overload (max 3 concurrent)

---

**Time Budget:**
- Backend endpoint: 4 hours
- Frontend UI: 3 hours
- Testing + polish: 4 hours
- **Total:** 11 hours (~1.5 days)

**Appetite:** 2 days (with buffer)
**Deliverable:** Users can reprocess documents individually with latest improvements

---

**Created:** 2025-11-05
**Status:** Pitched (awaiting approval)
**Appetite:** Small batch (1-2 days)
