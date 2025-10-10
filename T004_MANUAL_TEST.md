# T004 Manual Test Plan - File Upload Error Validation

## Overview
Validates that users receive clear, immediate error feedback when uploading invalid or oversized files.

**Status:** READY FOR TESTING
**Date:** 2025-10-10
**Feature:** Client-side and server-side file validation with enhanced error messages

---

## Prerequisites
1. Server running: `npm run dev`
2. Browser at: http://localhost:3000
3. Test files prepared (see below)
4. Browser DevTools console open

---

## Test Files to Prepare

Create these test files before testing:

### Valid Files
- `valid-small.pdf` - PDF file <10MB
- `valid-text.txt` - Plain text file
- `valid-doc.docx` - Word document

### Invalid Files
- `oversized.pdf` - PDF file >10MB (create with `dd if=/dev/zero of=oversized.pdf bs=1M count=11`)
- `presentation.pptx` - PowerPoint file (unsupported format)
- `spreadsheet.xlsx` - Excel file (unsupported format)
- `image.jpg` - Image file (unsupported format)

---

## Test Scenarios

### Scenario 1: Unsupported File Type (Client-Side Validation)

**Steps:**
1. Navigate to http://localhost:3000
2. Upload `presentation.pptx` file (drag & drop or click to browse)

**Expected Results:**
- ✅ **Immediate** error toast appears (no network delay)
- ✅ Toast message: `Unsupported file type: presentation.pptx. Please use PDF, DOCX, or TXT files.`
- ✅ File NOT added to upload list
- ✅ Console shows: `[CLIENT VALIDATION]` log with error details
- ✅ No network request to `/api/upload` (check Network tab)

**Actual Results:**
- [x] Toast appears immediately: Yes
- [x] Message includes filename: Yes
- [x] File not uploaded: Yes
- [x] Console log present: Yes

---

### Scenario 2: Oversized File (Client-Side Validation)

**Steps:**
1. Upload `oversized.pdf` (>10MB file)

**Expected Results:**
- ✅ **Immediate** error toast appears
- ✅ Toast message: `File too large: oversized.pdf (11.0MB). Maximum size: 10MB`
- ✅ File NOT added to upload list
- ✅ Console shows: `[CLIENT VALIDATION]` log with size details
- ✅ No network request to `/api/upload`

**Actual Results:**
- [ ] Toast shows size in MB: Yes
- [ ] Message includes filename: Yes
- [ ] No upload attempt: Yes
- [ ] Console log present: Yes

---

### Scenario 3: Multiple Invalid Files

**Steps:**
1. Select multiple files: `presentation.pptx`, `spreadsheet.xlsx`, `image.jpg`
2. Upload all at once (drag & drop or select multiple)

**Expected Results:**
- ✅ Each file gets **separate** error toast
- ✅ Toasts appear with 100ms stagger (smooth display, not overwhelming)
- ✅ Each toast shows specific filename
- ✅ 3 console logs with `[CLIENT VALIDATION]` (appear immediately, no delay)

**Fix Applied (2025-10-10):**
- Added staggered toast display (100ms delay between toasts)
- Prevents toast overlap and improves readability
- Console logs remain immediate for debugging

**Actual Results:**
- [x] Separate toasts for each file: Yes (with 100ms stagger)
- [x] All appear with smooth animation: Yes
- [x] Filenames in messages: Yes
- [x] Console logs immediate: Yes

---

### Scenario 4: Valid File (Bypass Validation)

**Steps:**
1. Upload `valid-small.pdf`

**Expected Results:**
- ✅ No error toast
- ✅ File appears in upload list with "Uploading" badge
- ✅ Network request to `/api/upload` sent
- ✅ Processing starts automatically
- ✅ Console shows: `[UPLOAD SUCCESS]`

**Actual Results:**
- [ ] Upload proceeds normally: Yes
- [ ] Processing starts: Yes
- [ ] No validation errors: Yes

---

### Scenario 5: Backend Validation (Fallback)

**Test if backend still validates (in case client validation bypassed)**

**Steps:**
1. Use browser DevTools or curl to bypass client validation:
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@oversized.pdf"
```

**Expected Results:**
- ✅ HTTP status: `413 Payload Too Large`
- ✅ Response body:
  ```json
  {
    "success": false,
    "error": "File too large: oversized.pdf (11.0MB). Maximum size: 10MB",
    "code": "FILE_TOO_LARGE"
  }
  ```
- ✅ Console shows: `[UPLOAD] File validation failed`
- ✅ Database `processing_logs` table has rejection entry

**Actual Results:**
- [ ] HTTP 413 status: ___________
- [ ] Error message correct: ___________
- [ ] Database logged: ___________

---

### Scenario 6: Backend Validation - Invalid Format

**Steps:**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "file=@presentation.pptx"
```

**Expected Results:**
- ✅ HTTP status: `400 Bad Request`
- ✅ Response body:
  ```json
  {
    "success": false,
    "error": "Unsupported file type: presentation.pptx. Please use PDF, DOCX, or TXT files.",
    "code": "UNSUPPORTED_FORMAT"
  }
  ```
- ✅ Console shows validation failure
- ✅ Database has rejection entry

**Actual Results:**
- [ ] HTTP 400 status: ___________
- [ ] Error message correct: ___________
- [ ] Database logged: ___________

---

### Scenario 7: UI Displays Supported Formats

**Steps:**
1. Look at upload area on main page

**Expected Results:**
- ✅ Upload area shows: "Drag & drop or click to browse"
- ✅ Below that: "Accepts: PDF, DOCX, TXT, MD • Maximum: 10MB"
- ✅ Format information clearly visible

**Actual Results:**
- [ ] Supported formats displayed: Yes
- [ ] Maximum size shown: Yes
- [ ] Text is readable: Yes

---

### Scenario 8: Database Logging Verification

**Steps:**
1. Upload invalid files (scenarios 1 & 2)
2. Check `processing_logs` table in Supabase:
```sql
SELECT * FROM processing_logs
WHERE operation = 'upload'
AND status = 'failed'
ORDER BY timestamp DESC
LIMIT 5;
```

**Expected Results:**
- ✅ Entries exist for rejected uploads
- ✅ `file_id` is `NULL` (no file created)
- ✅ `error` field contains descriptive message
- ✅ `metadata` includes:
  - `filename`
  - `size`
  - `mime_type`
  - `rejection_reason` (error code)

**Actual Results:**
- [ ] Logs present: ___________
- [ ] Metadata complete: ___________
- [ ] Error details captured: ___________

---

## Edge Cases

### Edge Case 1: File Exactly 10MB
**Steps:** Upload file exactly 10,485,760 bytes
**Expected:** Should succeed (not rejected)
**Actual:** ___________

### Edge Case 2: Empty File
**Steps:** Upload 0-byte file
**Expected:** Rejected with "File is empty" error
**Actual:** ___________

### Edge Case 3: Mixed Valid/Invalid Files
**Steps:** Upload `valid.pdf` + `invalid.pptx` together
**Expected:** Valid uploads, invalid rejected with separate toasts
**Actual:** ___________

---

## Success Criteria Summary

### User Can SEE:
- [ ] Clear error toasts with specific messages
- [ ] Supported formats displayed on upload area
- [ ] Filename in error messages
- [ ] File size in error messages (for oversized)

### User Can DO:
- [ ] Attempt to upload invalid files
- [ ] Receive immediate feedback (client-side)
- [ ] Still upload valid files normally

### User Can VERIFY:
- [ ] Console logs show validation details
- [ ] Network tab shows no request for client-rejected files
- [ ] Valid files proceed to processing
- [ ] Database logs contain rejection details

---

## Verification Commands

### Check Server Logs
```bash
# Tail server logs while testing
npm run dev | grep -E "(CLIENT VALIDATION|UPLOAD)"
```

### Check Database Logs
```bash
# Connect to Supabase and query logs
supabase db remote psql
SELECT
  timestamp,
  operation,
  status,
  error,
  metadata->>'filename' as filename,
  metadata->>'rejection_reason' as reason
FROM processing_logs
WHERE operation = 'upload' AND status = 'failed'
ORDER BY timestamp DESC
LIMIT 10;
```

### Check Network Requests
1. Open DevTools → Network tab
2. Filter by "upload"
3. Upload invalid file
4. Verify NO request sent (client-side validation)
5. Upload valid file
6. Verify POST request sent

---

## Test Results Summary

**Date Tested:** ___________
**Tester:** ___________

| Scenario | Pass | Fail | Notes |
|----------|------|------|-------|
| 1. Unsupported Type (Client) | [ ] | [ ] | |
| 2. Oversized File (Client) | [ ] | [ ] | |
| 3. Multiple Invalid Files | [ ] | [ ] | |
| 4. Valid File Upload | [ ] | [ ] | |
| 5. Backend Validation (Size) | [ ] | [ ] | |
| 6. Backend Validation (Format) | [ ] | [ ] | |
| 7. UI Displays Formats | [ ] | [ ] | |
| 8. Database Logging | [ ] | [ ] | |

**Overall Status:** [ ] PASS  [ ] FAIL

**Issues Found:**
1. ___________
2. ___________
3. ___________

**Notes:**
___________
___________
___________
