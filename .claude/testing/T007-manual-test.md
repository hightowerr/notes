# Manual Test: T007 - Export Functionality for Summaries

**Task**: T007 [P] [POLISH] Add export functionality for summaries (JSON/Markdown download)
**Status**: Ready for Testing
**Date**: 2025-10-10

## Test Overview

This test validates the export functionality for document summaries, including:
1. Individual export from SummaryPanel (JSON and Markdown)
2. Bulk export from Dashboard (JSON and Markdown)
3. Export format validation and file naming

## Prerequisites

- Development server running (`npm run dev`)
- At least 3 documents uploaded and processed (status: "completed" or "review_required")
- Documents should have varied summaries with topics, decisions, actions, and LNO tasks

## Test Scenarios

### Scenario 1: Single Export - JSON from SummaryPanel

**Steps:**
1. Navigate to home page (`http://localhost:3000`)
2. Upload a document and wait for processing to complete
3. Locate the SummaryPanel that appears after processing
4. Click the "JSON" export button in the header

**Expected Results:**
- ✅ "Exporting..." loading state appears on button
- ✅ File downloads automatically with name format: `{filename}-summary.json`
- ✅ Success toast notification appears: "Summary exported as JSON"
- ✅ Downloaded JSON contains:
  - `filename` field with original filename
  - `exportedAt` timestamp
  - `processedAt` timestamp
  - `confidence` score
  - `processingDuration` in milliseconds
  - `summary` object with topics, decisions, actions, lno_tasks

**Pass/Fail:** _____

---

### Scenario 2: Single Export - Markdown from SummaryPanel

**Steps:**
1. From the same SummaryPanel as Scenario 1
2. Click the "Markdown" export button

**Expected Results:**
- ✅ "Exporting..." loading state appears on button
- ✅ File downloads automatically with name format: `{filename}-summary.md`
- ✅ Success toast notification appears: "Summary exported as Markdown"
- ✅ Downloaded Markdown is properly formatted with:
  - `# Summary: {filename}` header
  - Generation timestamp
  - `## Topics` section with bullet list
  - `## Decisions` section with numbered list
  - `## Action Items` section with checkboxes `- [ ]`
  - `## Task Prioritization (Leverage / Neutral / Overhead)` sections with emoji indicators

**Pass/Fail:** _____

---

### Scenario 3: Bulk Export - Select Multiple Documents

**Steps:**
1. Navigate to Dashboard (`http://localhost:3000/dashboard`)
2. Verify at least 3 completed documents are visible
3. Click checkboxes on 3 different documents
4. Verify the bulk export controls bar appears at the top

**Expected Results:**
- ✅ Checkboxes only appear on completed/review_required documents
- ✅ Checkboxes do not appear on pending/processing/failed documents
- ✅ Bulk export bar shows correct count: "3 documents selected"
- ✅ Bulk export bar contains: "Export JSON", "Export Markdown", "Clear Selection" buttons
- ✅ "Select All" button visible in filter controls

**Pass/Fail:** _____

---

### Scenario 4: Bulk Export - JSON Format

**Steps:**
1. With 3 documents selected (from Scenario 3)
2. Click "Export JSON" button in bulk export controls

**Expected Results:**
- ✅ Button shows "Exporting..." loading state
- ✅ ZIP file downloads with name format: `summaries-export-{date}.zip`
- ✅ Success toast shows: "3 documents exported successfully"
- ✅ Selection is cleared after successful export
- ✅ Bulk export bar disappears
- ✅ Extracted ZIP contains 3 JSON files named: `{filename}-summary.json`
- ✅ Each JSON file has correct structure (same as Scenario 1)

**Pass/Fail:** _____

---

### Scenario 5: Bulk Export - Markdown Format

**Steps:**
1. Select 3 documents again
2. Click "Export Markdown" button in bulk export controls

**Expected Results:**
- ✅ Button shows "Exporting..." loading state
- ✅ ZIP file downloads with name format: `summaries-export-{date}.zip`
- ✅ Success toast shows: "3 documents exported successfully"
- ✅ Selection is cleared after successful export
- ✅ Extracted ZIP contains 3 Markdown files named: `{filename}-summary.md`
- ✅ Each Markdown file is properly formatted (same as Scenario 2)

**Pass/Fail:** _____

---

### Scenario 6: Select All / Deselect All

**Steps:**
1. Click "Select All" button in filter controls
2. Verify all completed documents are selected
3. Click "Deselect All" button (button text changes after selection)
4. Verify all checkboxes are unchecked

**Expected Results:**
- ✅ "Select All" selects only completed/review_required documents
- ✅ Button text changes to "Deselect All" when documents are selected
- ✅ Count in bulk export bar updates correctly
- ✅ "Deselect All" clears all selections
- ✅ Bulk export bar disappears after deselecting all

**Pass/Fail:** _____

---

### Scenario 7: Clear Selection Button

**Steps:**
1. Select 2 documents
2. Click "Clear Selection" button in bulk export bar

**Expected Results:**
- ✅ All checkboxes unchecked
- ✅ Bulk export bar disappears
- ✅ No toast notification appears

**Pass/Fail:** _____

---

### Scenario 8: Export Button Disabled State

**Steps:**
1. Select 1 document
2. Click "Export JSON" button
3. While export is in progress, try clicking "Export Markdown" button

**Expected Results:**
- ✅ Both export buttons disabled during export
- ✅ "Clear Selection" button disabled during export
- ✅ Checkboxes remain interactive (can still check/uncheck)
- ✅ After export completes, buttons re-enable

**Pass/Fail:** _____

---

### Scenario 9: No Selection Error

**Steps:**
1. Navigate to Dashboard with no documents selected
2. Verify bulk export bar is not visible
3. (Cannot click export without selecting documents - this is by design)

**Expected Results:**
- ✅ Bulk export bar only appears when at least 1 document is selected
- ✅ No way to trigger export without selection

**Pass/Fail:** _____

---

### Scenario 10: Export Non-Processed Document (Should Not Be Possible)

**Steps:**
1. Upload a document
2. While document is processing, go to Dashboard
3. Verify no checkbox appears on processing document

**Expected Results:**
- ✅ Checkboxes do not appear on documents with status: "pending", "processing", or "failed"
- ✅ Only completed and review_required documents can be selected

**Pass/Fail:** _____

---

### Scenario 11: Special Characters in Filename

**Steps:**
1. Upload a document with special characters in name: `Meeting Notes (2025-10-10) #1.pdf`
2. Wait for processing to complete
3. Export as JSON from SummaryPanel

**Expected Results:**
- ✅ Filename is sanitized in exported file: `Meeting_Notes__2025-10-10___1-summary.json`
- ✅ No errors during export
- ✅ File downloads successfully

**Pass/Fail:** _____

---

### Scenario 12: Concurrent Exports

**Steps:**
1. Open Dashboard
2. Open uploaded document in new tab (to see SummaryPanel)
3. Click "Export JSON" on SummaryPanel in tab 2
4. Immediately switch to Dashboard tab and click "Export JSON" for bulk export

**Expected Results:**
- ✅ Both exports complete successfully
- ✅ Two separate downloads occur
- ✅ No errors or conflicts
- ✅ Proper toast notifications for each export

**Pass/Fail:** _____

---

## Edge Cases

### Edge Case 1: Empty Summary Fields

**Steps:**
1. Export a document with minimal summary (e.g., only topics, no decisions/actions)

**Expected Results:**
- ✅ JSON export shows empty arrays for missing fields: `"decisions": [], "actions": []`
- ✅ Markdown export shows "*No decisions identified*" for empty sections
- ✅ No errors during export

**Pass/Fail:** _____

---

### Edge Case 2: Very Long Document Names

**Steps:**
1. Upload document with very long name (>100 characters)
2. Export as Markdown

**Expected Results:**
- ✅ Filename is truncated appropriately (within OS limits)
- ✅ Export completes without errors

**Pass/Fail:** _____

---

## API Contract Validation

### Test API Endpoint Directly

**Steps:**
1. Get a `fileId` from a completed document (check browser DevTools Network tab or database)
2. Test JSON export: `curl http://localhost:3000/api/export/{fileId}?format=json`
3. Test Markdown export: `curl http://localhost:3000/api/export/{fileId}?format=markdown`

**Expected Results:**
- ✅ JSON endpoint returns Content-Type: `application/json`
- ✅ JSON endpoint includes Content-Disposition header with filename
- ✅ Markdown endpoint returns Content-Type: `text/markdown`
- ✅ Markdown endpoint includes Content-Disposition header with filename
- ✅ Invalid fileId returns 404 with error message
- ✅ Missing document returns 400 with "Document has not been processed yet"
- ✅ Invalid format parameter returns 400 with "Invalid format" message

**Pass/Fail:** _____

---

## Summary

**Total Scenarios:** 12 + 2 edge cases + 1 API validation = 15 tests

**Passed:** _____ / 15
**Failed:** _____ / 15
**Blocked:** _____ / 15

**Overall Status:** PASS / FAIL

---

## Notes

### Issues Found

(Document any issues, unexpected behavior, or bugs discovered during testing)

---

### Performance Observations

- Single export time: _____ ms (average)
- Bulk export time (3 docs): _____ seconds
- ZIP generation time: _____ ms

---

### Browser Compatibility

Tested on:
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari
- [ ] Mobile (iOS Safari)
- [ ] Mobile (Chrome Android)

---

**Tester Name:** _________________
**Date Tested:** _________________
**Environment:** Development / Staging / Production
