# Quickstart: Reasoning Trace Enhancements Manual Testing

**Feature**: 009-docs-shape-pitches
**Date**: 2025-10-23
**Test Type**: Manual (end-to-end user acceptance testing)

## Prerequisites

Before running these tests, ensure:
1. Development server running (`pnpm dev`)
2. At least one agent prioritization has been triggered (creates reasoning trace)
3. Browser DevTools open (Application tab for storage inspection, Console for error logs)

---

## Test Suite 1: Discoverability

### Test 1.1: "View Reasoning" Button Visibility

**Given**: Agent prioritization has completed
**When**: I navigate to `/priorities` page
**Then**:
- [ ] "View Reasoning" button appears in TaskList header
- [ ] Button displays step count (e.g., "View Reasoning (12 steps)")
- [ ] Button is clickable and visually distinct (not disabled)

**Manual Steps**:
1. Open `/priorities` in browser
2. Verify button presence and label
3. Take screenshot for documentation

---

### Test 1.2: Auto-Expand on First Visit (Browser Session)

**Given**: I am in a new browser session (or first load after tab close)
**When**: I load `/priorities` page after agent execution
**Then**:
- [ ] Reasoning trace panel is automatically expanded
- [ ] sessionStorage `trace-first-visit` is set to `true`
- [ ] Trace shows all steps without manual interaction

**Manual Steps**:
1. Open browser DevTools → Application → Session Storage
2. Clear `trace-first-visit` key (simulate first visit)
3. Refresh `/priorities` page
4. Verify trace panel expanded automatically
5. Check sessionStorage shows `trace-first-visit: true`

---

### Test 1.3: Collapse/Expand Preference Persistence

**Given**: I have collapsed the reasoning trace panel
**When**: I reload the page (within same browser session)
**Then**:
- [ ] Trace panel remains collapsed (preference persists)
- [ ] localStorage `reasoning-trace-collapsed` is set to `true`
- [ ] Clicking "View Reasoning" button toggles panel open

**Manual Steps**:
1. Collapse trace panel manually
2. Check localStorage `reasoning-trace-collapsed: true`
3. Reload page (F5)
4. Verify trace starts collapsed
5. Click "View Reasoning" button → panel expands

---

## Test Suite 2: Filtering

### Test 2.1: Tool Type Filter Dropdown

**Given**: Trace contains multiple tools (e.g., semantic-search, detect-dependencies)
**When**: I open the tool filter dropdown
**Then**:
- [ ] All Mastra tools shown (semantic-search, detect-dependencies, get-document-context, query-task-graph, cluster-by-similarity)
- [ ] Tools NOT used in current trace are disabled (grayed out)
- [ ] Tools used in trace are enabled (selectable)
- [ ] Default selection is "All"

**Manual Steps**:
1. Expand trace panel
2. Open tool filter dropdown
3. Verify all 5 tools listed
4. Check disabled state matches actual trace tool usage
5. Select a specific tool → trace filters to only that tool's steps

---

### Test 2.2: Status Filter Checkboxes

**Given**: Trace contains success, failed, and skipped steps
**When**: I uncheck "Success" checkbox
**Then**:
- [ ] Only failed and skipped steps visible
- [ ] Original step numbering preserved (e.g., Step 1, Step 5, Step 8 shown if 2-4, 6-7 were success)
- [ ] Filtering applies instantly (<100ms, no spinner/loading state)

**Manual Steps**:
1. Check initial state: all checkboxes checked, all steps visible
2. Uncheck "Success" → verify only non-success steps shown
3. Uncheck "Skipped" → verify only failed steps shown
4. Check all boxes again → all steps reappear
5. Measure performance: Should feel instant (use DevTools Performance tab if needed)

---

### Test 2.3: "Show Only Failed" Quick Toggle

**Given**: Trace contains both success and failed steps
**When**: I enable "Show only failed steps" toggle
**Then**:
- [ ] Only failed steps visible (success and skipped hidden)
- [ ] Status checkboxes reflect this (failed checked, others unchecked or overridden)
- [ ] Toggle off → returns to previous filter state
- [ ] Step numbering preserved

**Manual Steps**:
1. Enable "Show only failed" toggle
2. Verify only steps with `status: 'failed'` shown
3. Disable toggle → all steps (or previously filtered set) reappear
4. Test with trace that has 0 failed steps → verify no steps shown with clear message

---

### Test 2.4: Filter Reset on Page Reload

**Given**: I have active filters (tool type = "semantic-search", failed only)
**When**: I reload the page
**Then**:
- [ ] Filters reset to default (All tools, all statuses checked, show-only-failed off)
- [ ] Trace shows all steps again
- [ ] No filter state persists in localStorage or sessionStorage

**Manual Steps**:
1. Apply filters (select specific tool, uncheck some statuses)
2. Verify filtered view active
3. Reload page (F5)
4. Check filters reset to default ("All" tool, all checkboxes checked)
5. Verify localStorage/sessionStorage has no filter keys

---

## Test Suite 3: Error Highlighting

### Test 3.1: Failed Step Visual Distinction

**Given**: Trace contains at least one failed step
**When**: I view the reasoning trace
**Then**:
- [ ] Failed steps have red border (1px solid, destructive color)
- [ ] Failed steps have red background (var(--destructive-bg))
- [ ] Failed badge is visible (red with "Failed" text)
- [ ] Inline error message displayed below step summary

**Manual Steps**:
1. Locate a failed step in trace (status: 'failed')
2. Verify red border and background applied
3. Check error message visible and readable (WCAG AA contrast)
4. Compare to success steps (no red styling)

---

### Test 3.2: Error Summary Banner Display

**Given**: Trace contains 2 failed steps (detect-dependencies at step 3, semantic-search at step 7)
**When**: I view the trace panel
**Then**:
- [ ] Error banner appears at top of trace (above step list)
- [ ] Banner message: "2 steps failed: detect-dependencies, semantic-search"
- [ ] Banner has destructive styling (red background, white text, ⚠️ icon)
- [ ] "Jump to first failure" link visible

**Manual Steps**:
1. Verify banner only appears when failedSteps.length > 0
2. Check message format matches expected pattern
3. Test with trace that has 0 failures → no banner shown
4. Test with trace that has 1 failure → singular "step failed" (no plural 's')

---

### Test 3.3: Jump to First Failure

**Given**: Error banner is visible (trace has failures)
**When**: I click "Jump to first failure" link in banner
**Then**:
- [ ] Page scrolls smoothly to first failed step
- [ ] Failed step is highlighted or in viewport
- [ ] No console errors during scroll

**Manual Steps**:
1. Scroll to top of trace panel (so first failure is off-screen)
2. Click "Jump to first failure" link in banner
3. Verify smooth scroll animation to first failed step
4. Check step is fully visible (not cut off by viewport edge)

---

## Test Suite 4: Export

### Test 4.1: Successful Export (File Download)

**Given**: Trace has 10 steps
**When**: I click the Export button
**Then**:
- [ ] File downloads with name `reasoning-trace-{sessionId}-{timestamp}.json`
- [ ] File contains valid JSON (can be opened in text editor)
- [ ] JSON structure matches ExportPayload schema (session_id, exported_at, execution_metadata, steps)
- [ ] Toast notification shows "Trace exported successfully"
- [ ] Export completes in <500ms

**Manual Steps**:
1. Click "Export" button
2. Check browser Downloads folder for new file
3. Open file in text editor → verify JSON structure
4. Check all steps present in `steps` array
5. Verify `execution_metadata` includes started_at, total_steps, failed_steps, tools_used
6. Note timestamp and verify <500ms completion

---

### Test 4.2: Export Fallback to Clipboard

**Given**: Browser blocks file download (simulate by disabling downloads in DevTools)
**When**: I click the Export button
**Then**:
- [ ] Toast notification shows "Export failed, trace copied to clipboard"
- [ ] Clipboard contains full JSON export (Ctrl+V to verify)
- [ ] JSON structure same as file download (session_id, exported_at, etc.)
- [ ] No console errors (only expected Blob creation failure)

**Manual Steps**:
1. Open DevTools → Console
2. Temporarily override `URL.createObjectURL` to throw error (simulate failure):
   ```javascript
   const originalCreate = URL.createObjectURL;
   URL.createObjectURL = () => { throw new Error('Simulated download failure'); };
   ```
3. Click "Export" button
4. Verify toast shows clipboard fallback message
5. Paste clipboard content (Ctrl+V) → verify JSON structure
6. Restore original method: `URL.createObjectURL = originalCreate;`

---

### Test 4.3: Export with Zero Steps

**Given**: Trace has 0 reasoning steps (agent executed but no trace recorded)
**When**: I view the trace panel
**Then**:
- [ ] Export button is disabled or hidden
- [ ] Message "No reasoning trace available" shown
- [ ] Clicking button (if enabled) shows error toast

**Manual Steps**:
1. Simulate empty trace (or find agent session with 0 steps)
2. Verify export button disabled state
3. If button clickable, verify error handling (toast or inline message)

---

## Test Suite 5: Edge Cases

### Test 5.1: Trace with 50+ Steps (Performance)

**Given**: Trace has 50 reasoning steps
**When**: I apply filters or export
**Then**:
- [ ] Filtering completes in <100ms (no noticeable lag)
- [ ] Export completes in <500ms
- [ ] Scrolling is smooth (no jank or frame drops)
- [ ] No browser console warnings about performance

**Manual Steps**:
1. Generate or locate trace with 50+ steps
2. Open DevTools Performance tab
3. Apply filter (e.g., "Show only failed") → record performance
4. Verify filtering time <100ms
5. Export trace → verify completion <500ms
6. Scroll through trace → check for smooth 60fps rendering

---

### Test 5.2: localStorage Disabled (Graceful Degradation)

**Given**: Browser has localStorage disabled (incognito mode or security policy)
**When**: I use the trace panel
**Then**:
- [ ] Trace panel still functions (no crashes)
- [ ] Collapse/expand preference NOT persisted (resets on reload)
- [ ] Filters still work (in-memory state only)
- [ ] No console errors related to localStorage

**Manual Steps**:
1. Open browser in Incognito/Private mode (or disable localStorage via DevTools)
2. Navigate to `/priorities`
3. Collapse trace panel → reload page → verify resets to default state
4. Apply filters → verify they work (but don't persist)
5. Check console for no localStorage errors

---

### Test 5.3: Partially Completed Trace (Agent Still Running)

**Given**: Agent is mid-execution (status: 'running', some steps completed)
**When**: I view the trace
**Then**:
- [ ] Completed steps shown with normal styling
- [ ] No incomplete/partial steps displayed (only finalized entries)
- [ ] Status badges accurate (success/failed/skipped)
- [ ] Export includes only completed steps

**Manual Steps**:
1. Trigger agent prioritization
2. Quickly navigate to `/priorities` while agent running
3. Verify trace shows only completed steps (not pending/in-progress)
4. Wait for completion → verify new steps appear on poll/reload

---

### Test 5.4: Keyboard Navigation (Native Browser Behavior)

**Given**: Trace panel is visible
**When**: I navigate using keyboard only (Tab, Enter, Escape)
**Then**:
- [ ] Tab key moves focus through filters → trace steps → export button
- [ ] Enter key activates buttons and dropdowns
- [ ] Escape key closes open dropdowns
- [ ] Focus indicators visible (blue outline or equivalent)

**Manual Steps**:
1. Click once on page to focus
2. Use Tab key to navigate through UI
3. Verify focus order: filters → steps → export
4. Press Enter on "View Reasoning" button → trace toggles
5. Press Enter on Export button → export triggers
6. Verify no keyboard traps (can tab out of all components)

---

## Success Criteria Summary

All tests must pass for feature acceptance:
- [x] Discoverability: Auto-expand works, button visible, preference persists
- [x] Filtering: Tool dropdown disables unused tools, status filters instant, reset on reload
- [x] Error Highlighting: Red borders, error banner, jump-to-failure works
- [x] Export: File download succeeds, clipboard fallback works, <500ms performance
- [x] Edge Cases: 50+ steps no lag, localStorage disabled graceful, keyboard nav works

---

## Performance Benchmarks

Record actual measurements during testing:

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Filtering (50 steps) | <100ms | ___ ms | [ ] |
| Export (20 steps) | <500ms | ___ ms | [ ] |
| Auto-expand render | <50ms | ___ ms | [ ] |
| Scroll to failure | <300ms | ___ ms | [ ] |

---

## Known Issues & Workarounds

*Document any issues discovered during testing here*

| Issue | Severity | Workaround | Fix Needed? |
|-------|----------|------------|-------------|
| (none yet) | - | - | - |

---

## Testing Notes

**Test Environment**:
- Browser: Chrome 120+ / Firefox 121+ / Safari 17+
- OS: macOS / Windows / Linux
- Screen Size: 1920x1080 (desktop), 375x667 (mobile simulation)

**Test Data**:
- Trace with 0 steps (edge case)
- Trace with 10 steps (typical case, 2 failed)
- Trace with 50+ steps (performance case)

**Automated Test Conversion** (Future):
- Once FormData serialization issue resolved, convert manual tests to Vitest + React Testing Library
- Priority: Suite 2 (Filtering) and Suite 4 (Export) are highest value for automation
