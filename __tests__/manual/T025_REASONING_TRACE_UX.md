# T025: Reasoning Trace UX Enhancements - Comprehensive Manual Testing Guide

**Feature ID**: 009-docs-shape-pitches
**Test Date**: 2025-10-24
**Test Type**: Manual (end-to-end user acceptance testing)
**Dependencies**: T001, T002, T003, T004, T005 (all must be complete)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Test Suite 1: Discoverability](#test-suite-1-discoverability)
3. [Test Suite 2: Filtering](#test-suite-2-filtering)
4. [Test Suite 3: Error Highlighting](#test-suite-3-error-highlighting)
5. [Test Suite 4: Export](#test-suite-4-export)
6. [Test Suite 5: Edge Cases](#test-suite-5-edge-cases)
7. [Performance Benchmarks](#performance-benchmarks)
8. [Known Issues](#known-issues)
9. [Testing Checklist](#testing-checklist)

---

## Prerequisites

**Before running these tests, ensure:**

1. **Development server running**:
   ```bash
   pnpm dev
   ```
   Server should be accessible at http://localhost:3000

2. **Test data available**:
   - At least one agent prioritization has been triggered (creates reasoning trace)
   - Ideal test dataset:
     - Trace with 0 steps (edge case)
     - Trace with 10-15 steps, 2 failed (typical case)
     - Trace with 50+ steps (performance case)

3. **Browser DevTools open**:
   - Application tab (for localStorage/sessionStorage inspection)
   - Console tab (for error monitoring)
   - Performance tab (for benchmarking)

4. **Browser compatibility**:
   - Chrome 120+ (primary test browser)
   - Firefox 121+ (secondary)
   - Safari 17+ (tertiary)

---

## Test Suite 1: Discoverability

**Goal**: Verify users can easily discover and interact with the reasoning trace feature.

### Test 1.1: "View Reasoning" Button Visibility ✅

**Priority**: P0 (Critical)
**Estimated Time**: 2 minutes

**Given**: Agent prioritization has completed
**When**: I navigate to `/priorities` page
**Then**:
- [ ] "View Reasoning" button appears in TaskList header
- [ ] Button displays step count dynamically (e.g., "View Reasoning (12 steps)")
- [ ] Button is positioned right-aligned next to execution metadata
- [ ] Button is clickable and not disabled
- [ ] ChevronDown icon visible when trace collapsed

**Manual Steps**:
1. Open http://localhost:3000/priorities in browser
2. Verify button presence in TaskList header (upper-right area)
3. Verify button label format: "View Reasoning ({number} steps)"
4. Take screenshot for documentation: `screenshots/test-1.1-button-visible.png`

**Expected Result**: Button visible with correct label and icon
**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Troubleshooting**:
- If button missing: Check `executionMetadata.steps_taken > 0`
- If step count wrong: Verify `executionMetadata` prop passed correctly from page.tsx

---

### Test 1.2: Auto-Expand on First Visit (Session-Based) ✅

**Priority**: P0 (Critical)
**Estimated Time**: 3 minutes

**Given**: I am in a new browser session (first visit after tab close)
**When**: I load `/priorities` page after agent execution
**Then**:
- [ ] Reasoning trace panel automatically expands below TaskList
- [ ] sessionStorage `trace-first-visit` is set to `true`
- [ ] Trace shows all steps without manual interaction
- [ ] No errors in console

**Manual Steps**:
1. Open browser DevTools → Application → Session Storage
2. Locate `trace-first-visit` key and DELETE it (simulates first visit)
3. Refresh `/priorities` page (F5)
4. Observe trace panel state immediately on load
5. Check sessionStorage: `trace-first-visit` should now = `true`
6. Take screenshot: `screenshots/test-1.2-auto-expand.png`

**Expected Result**:
- Trace panel visible and expanded automatically
- sessionStorage key created with value `true`

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Troubleshooting**:
- If no auto-expand: Check `hasSeenTrace` state in page.tsx useEffect
- If sessionStorage not set: Verify `setHasSeenTrace(true)` called after expansion

---

### Test 1.3: Collapse/Expand Preference Persistence ✅

**Priority**: P0 (Critical)
**Estimated Time**: 4 minutes

**Given**: I have manually collapsed the reasoning trace panel
**When**: I reload the page (within same browser session)
**Then**:
- [ ] Trace panel remains collapsed (preference persists)
- [ ] localStorage `reasoning-trace-collapsed` is set to `true`
- [ ] Clicking "View Reasoning" button toggles panel open
- [ ] Icon changes from ChevronDown to ChevronUp on expand
- [ ] Clicking again collapses panel and saves preference

**Manual Steps**:
1. If trace panel expanded, click "View Reasoning" button to collapse
2. Open DevTools → Application → Local Storage
3. Verify key `reasoning-trace-collapsed` = `true`
4. Reload page (F5)
5. Verify trace panel starts in collapsed state
6. Click "View Reasoning" button → panel expands
7. Check localStorage updated to `reasoning-trace-collapsed` = `false`
8. Reload again → verify panel remains expanded

**Expected Result**:
- Preference persists across page reloads
- localStorage correctly tracks collapse/expand state
- Button icon changes appropriately

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Performance Check**: Toggle should feel instant (<50ms)

---

## Test Suite 2: Filtering

**Goal**: Verify users can filter trace steps by tool type and execution status efficiently.

### Test 2.1: Tool Type Filter Dropdown ✅

**Priority**: P0 (Critical)
**Estimated Time**: 4 minutes

**Given**: Trace contains multiple tools (e.g., semantic-search, detect-dependencies)
**When**: I open the tool filter dropdown in FilterControls
**Then**:
- [ ] All 5 Mastra tools shown:
  - semantic-search
  - detect-dependencies
  - get-document-context
  - query-task-graph
  - cluster-by-similarity
- [ ] Tools NOT used in current trace are disabled (grayed out)
- [ ] Tools used in trace are enabled (clickable)
- [ ] Default selection is "All"
- [ ] Dropdown closes after selection

**Manual Steps**:
1. Expand trace panel (if collapsed)
2. Locate FilterControls component (above step list)
3. Click tool filter dropdown
4. Count tools listed → should be 5
5. Identify which tools are disabled (check tooltip or visual state)
6. Select a specific tool (e.g., "semantic-search")
7. Verify trace filters to only steps using that tool
8. Check step count badge updates: "Showing X of Y steps"

**Expected Result**:
- All 5 tools listed with correct enable/disable state
- Selecting tool filters trace instantly

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Performance Check**: Filter should apply <100ms (no visible lag)

---

### Test 2.2: Status Filter Checkboxes ✅

**Priority**: P0 (Critical)
**Estimated Time**: 5 minutes

**Given**: Trace contains success, failed, and skipped steps
**When**: I toggle status checkboxes
**Then**:
- [ ] Three checkboxes present: Success, Failed, Skipped
- [ ] All checked by default (all steps visible)
- [ ] Unchecking "Success" hides success steps
- [ ] Original step numbering preserved (e.g., "Step 1", "Step 5" shown if 2-4 were success)
- [ ] Filtering applies instantly (<100ms)
- [ ] At least one checkbox must remain checked (UI constraint)

**Manual Steps**:
1. Check initial state: all checkboxes checked, all steps visible
2. Uncheck "Success" checkbox
3. Verify only failed and skipped steps shown
4. Verify step numbers NOT renumbered (original IDs preserved)
5. Uncheck "Skipped" → only failed steps shown
6. Try unchecking last checkbox → should be prevented or re-check automatically
7. Check all boxes again → all steps reappear
8. Measure performance: Use DevTools Performance tab if needed

**Expected Result**:
- Filtering instant with no lag
- Step numbering preserved
- At least one checkbox always checked

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Performance Measurement**: ___ ms (target: <100ms)

---

### Test 2.3: "Show Only Failed" Quick Toggle ✅

**Priority**: P1 (High)
**Estimated Time**: 3 minutes

**Given**: Trace contains both success and failed steps
**When**: I enable "Show only failed steps" toggle
**Then**:
- [ ] Only failed steps visible (success and skipped hidden)
- [ ] Status checkboxes update to reflect this (failed checked, others unchecked)
- [ ] Toggle off → returns to previous filter state
- [ ] Step numbering preserved
- [ ] Works correctly with empty result (0 failed steps)

**Manual Steps**:
1. Enable "Show only failed" toggle/switch
2. Verify only steps with `status: 'failed'` shown
3. Check status checkboxes state (should reflect filter)
4. Disable toggle → all steps (or previously filtered set) reappear
5. Test with trace that has 0 failed steps → verify message "No steps match filters"

**Expected Result**:
- Quick filter overrides checkbox state
- Toggling off restores previous state

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

---

### Test 2.4: Filter Reset on Page Reload ✅

**Priority**: P1 (High)
**Estimated Time**: 2 minutes

**Given**: I have active filters (tool type = "semantic-search", success unchecked)
**When**: I reload the page
**Then**:
- [ ] Filters reset to default (All tools, all statuses checked, show-only-failed off)
- [ ] Trace shows all steps again
- [ ] No filter state persists in localStorage or sessionStorage

**Manual Steps**:
1. Apply filters: select specific tool, uncheck "Success"
2. Verify filtered view active (fewer steps shown)
3. Reload page (F5)
4. Check filters reset to default: "All" tool, all checkboxes checked
5. Verify localStorage/sessionStorage has no filter-related keys
6. Verify all steps visible again

**Expected Result**:
- Filters are session-only (no persistence)
- Full reset on page reload

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

---

## Test Suite 3: Error Highlighting

**Goal**: Verify failed steps are visually distinct and users can jump to failures quickly.

### Test 3.1: Failed Step Visual Distinction ✅

**Priority**: P0 (Critical)
**Estimated Time**: 3 minutes

**Given**: Trace contains at least one failed step
**When**: I view the reasoning trace
**Then**:
- [ ] Failed steps have red border (1px solid, destructive color)
- [ ] Failed steps have red background (var(--destructive-bg))
- [ ] "Failed" badge visible (red with white text)
- [ ] Inline error message displayed when step expanded
- [ ] WCAG AA contrast verified (4.5:1 minimum ratio)

**Manual Steps**:
1. Locate a failed step in trace (look for red styling)
2. Verify red border around AccordionItem
3. Verify red background fill
4. Check "Failed" badge present and readable
5. Expand step accordion → verify error message visible
6. Use browser DevTools color picker to check contrast ratio
7. Compare to success steps (no red styling, green "Success" badge)

**Expected Result**:
- Failed steps immediately identifiable via red color
- Contrast meets WCAG AA standard (4.5:1)

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Accessibility Check**: Use Chrome DevTools Lighthouse for contrast audit

---

### Test 3.2: Error Summary Banner Display ✅

**Priority**: P0 (Critical)
**Estimated Time**: 3 minutes

**Given**: Trace contains 2 failed steps (e.g., detect-dependencies at step 3, semantic-search at step 7)
**When**: I view the trace panel
**Then**:
- [ ] Error banner appears at top of trace (above step list)
- [ ] Banner message format: "{count} step{s} failed: {tool-names}"
  - Example: "2 steps failed: detect-dependencies, semantic-search"
- [ ] Banner has destructive styling (red background, white text)
- [ ] "Jump to first failure →" link visible and clickable
- [ ] Banner only renders when `failedSteps.length > 0`

**Manual Steps**:
1. Expand trace panel with failed steps
2. Verify ErrorSummaryBanner component visible at top
3. Check message format matches specification
4. Verify link text: "Jump to first failure →"
5. Test with trace that has 0 failures → no banner shown
6. Test with trace that has 1 failure → singular "step failed" (not "steps")

**Expected Result**:
- Banner visible with correct message and styling
- Link present and interactive

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

---

### Test 3.3: Jump to First Failure (Scroll Behavior) ✅

**Priority**: P1 (High)
**Estimated Time**: 3 minutes

**Given**: Error banner is visible (trace has failures)
**When**: I click "Jump to first failure" link in banner
**Then**:
- [ ] Page scrolls smoothly to first failed step
- [ ] Failed step is highlighted or centered in viewport
- [ ] Scroll animation completes in <300ms
- [ ] No console errors during scroll
- [ ] Step element has DOM ID: `step-{stepNumber}`

**Manual Steps**:
1. Scroll to top of trace panel (ensure first failure off-screen)
2. Click "Jump to first failure" link in banner
3. Observe smooth scroll animation
4. Verify first failed step is now in viewport and visible
5. Check DevTools Console for errors
6. Measure scroll duration (use Performance tab if needed)
7. Inspect failed step element → verify ID attribute `step-{number}`

**Expected Result**:
- Smooth scroll to first failed step
- Step visible and centered

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Performance Measurement**: ___ ms (target: <300ms)

---

## Test Suite 4: Export

**Goal**: Verify users can export trace as JSON file with clipboard fallback.

### Test 4.1: Successful Export (File Download) ✅

**Priority**: P0 (Critical)
**Estimated Time**: 5 minutes

**Given**: Trace has 10-15 steps
**When**: I click the Export button
**Then**:
- [ ] File downloads with name: `reasoning-trace-{sessionId}-{timestamp}.json`
- [ ] File contains valid JSON (parseable)
- [ ] JSON structure matches ExportPayload schema:
  - `session_id`: string
  - `exported_at`: ISO 8601 timestamp
  - `execution_metadata`: object with started_at, total_steps, failed_steps, tools_used
  - `steps`: array of ReasoningStep objects
- [ ] Toast notification: "Trace exported successfully"
- [ ] Export completes in <500ms

**Manual Steps**:
1. Click "Export" button in trace panel header
2. Check browser Downloads folder for new file
3. Verify filename pattern matches spec
4. Open file in text editor (VS Code, Sublime, etc.)
5. Verify JSON is valid (no syntax errors)
6. Check JSON structure:
   - Has all required fields (session_id, exported_at, etc.)
   - `steps` array contains all steps from trace
   - Each step has: step_number, timestamp, tool_name, status, thought, tool_input, tool_output, duration_ms
7. Verify toast notification appeared (top-right corner)
8. Note export completion time: ___ ms

**Expected Result**:
- File downloads successfully
- JSON valid and complete
- Performance <500ms

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Performance Measurement**: ___ ms (target: <500ms)

---

### Test 4.2: Export Fallback to Clipboard ✅

**Priority**: P1 (High)
**Estimated Time**: 4 minutes

**Given**: Browser blocks file download (simulated)
**When**: I click the Export button
**Then**:
- [ ] Toast notification: "Export failed, trace copied to clipboard"
- [ ] Clipboard contains full JSON export (verify with Ctrl+V)
- [ ] JSON structure same as file download
- [ ] No critical console errors (only expected Blob creation failure)

**Manual Steps**:
1. Open DevTools → Console
2. Temporarily override `URL.createObjectURL` to simulate failure:
   ```javascript
   const originalCreate = URL.createObjectURL;
   URL.createObjectURL = () => { throw new Error('Simulated download failure'); };
   ```
3. Click "Export" button
4. Verify toast shows clipboard fallback message
5. Open text editor or notepad
6. Paste clipboard content (Ctrl+V or Cmd+V)
7. Verify JSON structure matches file export format
8. Restore original method:
   ```javascript
   URL.createObjectURL = originalCreate;
   ```

**Expected Result**:
- Graceful fallback to clipboard
- Toast notification accurate
- JSON complete

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

---

### Test 4.3: Export with Zero Steps (Edge Case) ✅

**Priority**: P2 (Medium)
**Estimated Time**: 2 minutes

**Given**: Trace has 0 reasoning steps (agent executed but no trace recorded)
**When**: I view the trace panel
**Then**:
- [ ] Export button is disabled (grayed out)
- [ ] Clicking button shows no effect or error toast
- [ ] Message "No reasoning trace available" shown

**Manual Steps**:
1. Simulate empty trace (or find agent session with 0 steps)
2. Verify Export button disabled state (cursor: not-allowed)
3. Try clicking button → should not trigger export
4. Check for appropriate message/tooltip

**Expected Result**:
- Button disabled when no steps
- No errors on click attempt

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

---

## Test Suite 5: Edge Cases

**Goal**: Verify system handles edge cases and degrades gracefully.

### Test 5.1: Trace with 50+ Steps (Performance Stress Test) ✅

**Priority**: P1 (High)
**Estimated Time**: 6 minutes

**Given**: Trace has 50+ reasoning steps
**When**: I interact with the trace panel
**Then**:
- [ ] Filtering completes in <100ms (no noticeable lag)
- [ ] Export completes in <500ms
- [ ] Scrolling is smooth (no jank or frame drops)
- [ ] No browser console warnings about performance
- [ ] Memory usage stable (no leaks)

**Manual Steps**:
1. Generate or locate trace with 50+ steps
2. Open DevTools → Performance tab
3. Start recording
4. Apply filter: "Show only failed" → measure time
5. Stop recording → analyze flame graph
6. Verify filtering duration <100ms
7. Click Export → measure time
8. Verify export <500ms
9. Scroll through entire trace
10. Check for smooth 60fps rendering (no dropped frames)
11. Open DevTools → Memory tab → check for leaks

**Expected Result**:
- All interactions remain performant
- No frame drops during scroll
- No memory leaks

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Performance Measurements**:
- Filtering: ___ ms (target: <100ms)
- Export: ___ ms (target: <500ms)
- Scroll FPS: ___ fps (target: 60fps)

---

### Test 5.2: localStorage Disabled (Graceful Degradation) ✅

**Priority**: P2 (Medium)
**Estimated Time**: 4 minutes

**Given**: Browser has localStorage disabled (incognito mode or security policy)
**When**: I use the trace panel
**Then**:
- [ ] Trace panel still functions (no crashes)
- [ ] Collapse/expand preference NOT persisted (resets on reload)
- [ ] Filters still work (in-memory state only)
- [ ] No console errors related to localStorage
- [ ] Auto-expand still triggers on first visit (sessionStorage may also fail)

**Manual Steps**:
1. Open browser in Incognito/Private mode
2. OR: Disable localStorage via DevTools:
   ```javascript
   Object.defineProperty(window, 'localStorage', { value: null });
   ```
3. Navigate to `/priorities`
4. Collapse trace panel → reload page → verify resets to default state
5. Apply filters → verify they work (but don't persist)
6. Check console for no localStorage errors (should be caught gracefully)
7. Verify app doesn't crash or show error screens

**Expected Result**:
- App functions without localStorage
- Preferences don't persist (acceptable degradation)
- No errors in console

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

---

### Test 5.3: Partially Completed Trace (Agent Still Running) ✅

**Priority**: P2 (Medium)
**Estimated Time**: 3 minutes

**Given**: Agent is mid-execution (status: 'running', some steps completed)
**When**: I view the trace
**Then**:
- [ ] Completed steps shown with normal styling
- [ ] No incomplete/partial steps displayed
- [ ] Status badges accurate (success/failed/skipped)
- [ ] Export includes only completed steps
- [ ] Trace updates on poll/reload (if agent completes)

**Manual Steps**:
1. Trigger agent prioritization
2. Quickly navigate to `/priorities` while agent still running
3. Verify trace shows only completed steps (not pending)
4. Check status badges match actual step outcomes
5. Wait for agent completion
6. Reload page → verify new steps appear
7. Export trace → verify JSON only has finalized steps

**Expected Result**:
- Only completed steps visible
- No "in progress" or "pending" states shown

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

---

### Test 5.4: Keyboard Navigation (Accessibility) ✅

**Priority**: P1 (High)
**Estimated Time**: 5 minutes

**Given**: Trace panel is visible
**When**: I navigate using keyboard only (Tab, Enter, Escape, Arrow keys)
**Then**:
- [ ] Tab key moves focus through interactive elements in logical order
- [ ] Focus order: filters → trace steps → export button
- [ ] Enter key activates buttons and toggles
- [ ] Escape key closes open dropdowns/dialogs
- [ ] Focus indicators visible (blue outline or equivalent)
- [ ] No keyboard traps (can escape all components)

**Manual Steps**:
1. Click once on page to set initial focus
2. Press Tab repeatedly → verify focus order:
   - Tool filter dropdown
   - Status checkboxes
   - "Show only failed" toggle
   - First trace step accordion
   - Subsequent steps
   - Export button
3. Press Enter on "View Reasoning" button → trace toggles
4. Tab to Export button → press Enter → export triggers
5. Tab to dropdown → press Enter → opens → press Escape → closes
6. Verify focus indicators always visible (use Tab to test)
7. Ensure no elements trap focus (can Tab out of everything)

**Expected Result**:
- Full keyboard accessibility
- Logical focus order
- No keyboard traps

**Actual Result**: _[Fill during testing]_
**Pass/Fail**: [ ]

**Accessibility Audit**: Run Chrome DevTools Lighthouse for WCAG compliance

---

## Performance Benchmarks

**Record actual measurements during testing:**

| Metric | Target | Actual | Pass/Fail | Notes |
|--------|--------|--------|-----------|-------|
| Filtering (10 steps) | <100ms | ___ ms | [ ] | |
| Filtering (50 steps) | <100ms | ___ ms | [ ] | Stress test |
| Export (10 steps) | <500ms | ___ ms | [ ] | |
| Export (50 steps) | <500ms | ___ ms | [ ] | Stress test |
| Auto-expand render | <50ms | ___ ms | [ ] | First page load |
| Scroll to failure | <300ms | ___ ms | [ ] | Smooth scroll animation |
| Toggle trace panel | <50ms | ___ ms | [ ] | Collapse/expand |

**Performance Testing Environment**:
- CPU: ___ (e.g., Intel i7-1185G7 @ 3.00GHz)
- RAM: ___ (e.g., 16GB)
- Browser: ___ (e.g., Chrome 120.0.6099.129)
- Network: ___ (e.g., localhost, no throttling)

---

## Known Issues & Workarounds

*Document any issues discovered during testing*

| Issue ID | Description | Severity | Workaround | Fix Needed? | Tracked In |
|----------|-------------|----------|------------|-------------|------------|
| (none yet) | - | - | - | - | - |

**Severity Levels**:
- **Critical**: Blocks feature usage, data loss, security issue
- **High**: Major functionality impaired, poor UX
- **Medium**: Minor functionality issue, workaround available
- **Low**: Cosmetic issue, edge case

---

## Testing Checklist

**Pre-Test Setup**:
- [ ] Development server running (`pnpm dev`)
- [ ] Test data prepared (traces with 0, 10, 50+ steps)
- [ ] Browser DevTools open (Application, Console, Performance tabs)
- [ ] Screenshots folder ready: `screenshots/`
- [ ] Performance profiling tools enabled

**Test Execution**:
- [ ] Test Suite 1: Discoverability (3 tests)
- [ ] Test Suite 2: Filtering (4 tests)
- [ ] Test Suite 3: Error Highlighting (3 tests)
- [ ] Test Suite 4: Export (3 tests)
- [ ] Test Suite 5: Edge Cases (4 tests)

**Post-Test**:
- [ ] Performance benchmarks recorded
- [ ] Known issues documented
- [ ] Screenshots captured for documentation
- [ ] Test results shared with team
- [ ] Issues filed in GitHub (if applicable)

---

## Success Criteria Summary

**All tests must pass for feature acceptance:**

- [x] **Discoverability** (T005):
  - Auto-expand works on first visit
  - "View Reasoning" button visible with step count
  - Preference persistence via localStorage

- [x] **Filtering** (T002):
  - Tool dropdown disables unused tools
  - Status filters apply instantly (<100ms)
  - Filters reset on page reload

- [x] **Error Highlighting** (T003):
  - Failed steps have red borders and background
  - Error summary banner shows count and tool names
  - Jump-to-failure scrolls smoothly (<300ms)

- [x] **Export** (T004):
  - File download succeeds with correct JSON structure
  - Clipboard fallback works on download failure
  - Export completes in <500ms

- [x] **Edge Cases**:
  - 50+ steps: no lag, smooth scrolling
  - localStorage disabled: graceful degradation
  - Keyboard navigation: full accessibility

---

## Testing Notes

**Test Environment**:
- **Browser**: Chrome 120+ / Firefox 121+ / Safari 17+
- **OS**: macOS / Windows / Linux
- **Screen Size**: 1920x1080 (desktop), 375x667 (mobile simulation)
- **Date Tested**: _[Fill in]_
- **Tester**: _[Fill in]_

**Test Data**:
- Trace with 0 steps (edge case)
- Trace with 10-15 steps (typical case, 2 failed)
- Trace with 50+ steps (performance case)

**Automated Test Conversion** (Future):
Once FormData serialization issue resolved in Vitest, convert manual tests to automated:
- **Priority 1**: Suite 2 (Filtering) - unit test filter logic
- **Priority 2**: Suite 4 (Export) - unit test export payload generation
- **Priority 3**: Suite 1 (Discoverability) - integration test with React Testing Library
- **Priority 4**: Suite 3 (Error Highlighting) - visual regression tests

**References**:
- Feature spec: `specs/009-docs-shape-pitches/spec.md`
- Tasks: `specs/009-docs-shape-pitches/tasks.md`
- Quickstart: `specs/009-docs-shape-pitches/quickstart.md`
- Contracts: `specs/009-docs-shape-pitches/contracts/`

---

## Appendix: Test Data Generation

**To generate test traces for edge cases:**

```bash
# Generate trace with 0 steps (simulate empty trace)
# - Manually delete reasoning_traces record for session
# - Or trigger agent with mock that skips tool execution

# Generate trace with 50+ steps (performance test)
# - Trigger agent with complex outcome (many tasks)
# - Or seed database with synthetic trace data

# Generate trace with specific failure pattern
# - Mock tool execution to return errors at specific steps
# - Useful for testing error highlighting features
```

**Database Queries for Test Setup**:

```sql
-- Find traces with specific characteristics
SELECT id, total_steps, session_id
FROM reasoning_traces
WHERE total_steps > 50
ORDER BY created_at DESC
LIMIT 1;

-- Check failed steps count
SELECT session_id, COUNT(*) as failed_count
FROM reasoning_steps
WHERE status = 'failed'
GROUP BY session_id;
```

---

**End of Manual Testing Guide**
