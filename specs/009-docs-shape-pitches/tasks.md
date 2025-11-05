# Tasks: Reasoning Trace Enhancements

**Input**: Design documents from `/specs/009-docs-shape-pitches/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

## Execution Flow (Slice-Based)
```
1. Load plan.md from feature directory
   → ✅ Loaded successfully
   → Tech stack: TypeScript 5.x, Next.js 15, React 19, ShadCN UI, Tailwind CSS v4
   → User journeys: Filter trace, highlight errors, export data, discover feature

2. Load spec.md for user journeys:
   → Primary actions: View trace, apply filters, export JSON, jump to failures
   → UI entry points: /priorities page, ReasoningTracePanel component
   → Data flows: Client-side filtering, browser storage (localStorage/sessionStorage)

3. Load optional design documents:
   → contracts/: FilterControls, ErrorSummaryBanner, ExportButton
   → data-model.md: Reuses existing schemas (ReasoningTrace, ReasoningStep)
   → research.md: 5 technical decisions (auto-expand scope, filter persistence, etc.)

4. Generate VERTICAL SLICE tasks:
   → Each user journey = ONE complete slice
   → Filtering: UI controls + state management + visual feedback + test
   → Error highlighting: Banner + scroll behavior + styling + test
   → Export: Button + JSON generation + clipboard fallback + test
   → Discoverability: Button + auto-expand + preference persistence + test

5. Apply slice ordering rules:
   → Foundation first: Storage hooks (needed by all slices)
   → P0 journeys: Filtering (most user value), Error highlighting (debugging)
   → P1 journeys: Export (data extraction), Discoverability (feature awareness)

6. Mark parallel execution:
   → Hooks can be parallel (independent files)
   → Filter + Error slices sequential (both modify ReasoningTracePanel)
   → Export + Discoverability parallel (independent features)

7. Validate EVERY task:
   → ✅ All tasks include UI + state + feedback + test
   → ✅ No backend work needed (client-side only per plan)
   → ✅ Each delivers complete user value (SEE + DO + VERIFY)
   → ✅ All tasks have manual test scenarios

8. Return: SUCCESS (6 vertical slice tasks ready)
```

## Format: `[ID] [TYPE] [P?] User Story & Implementation Scope`
- **[SLICE]**: Complete vertical slice (UI → State → Feedback → Test)
- **[SETUP]**: Foundational work blocking ALL slices
- **[POLISH]**: Enhancement to existing working slice
- **[P]**: Can run in parallel with other [P] tasks

## Path Conventions
- **Frontend**: `app/` (Next.js App Router), `lib/hooks/`, `app/components/`
- **Types**: `lib/types/` (reuse existing)
- **Tests**: Manual testing via `quickstart.md` scenarios

---

## Phase 1: Foundation (Shared Infrastructure)

### T001 [x] [P] [SETUP] Create browser storage hooks for preference persistence

**Why Needed**: All subsequent slices require localStorage and sessionStorage utilities

**Implementation Scope**:
- **Hooks**:
  - `lib/hooks/useLocalStorage.ts`: localStorage persistence with SSR safety
    * Returns `[value, setValue, remove]` tuple
    * Handles `QuotaExceededError` gracefully
    * Defaults to in-memory state if localStorage unavailable
  - `lib/hooks/useSessionStorage.ts`: sessionStorage for auto-expand tracking
    * Same API as useLocalStorage
    * Resets on tab close (session-only state)
- **No UI**: Foundation work, validated via DevTools
- **Test Validation**:
  * Open DevTools → Application → Local/Session Storage
  * Call `setValue('test-key', 'test-value')`
  * Verify storage entry created
  * Reload page → verify localStorage persists, sessionStorage clears

**Test Scenario**:
```typescript
// In browser console
const [value, setValue] = useLocalStorage('trace-collapsed', false);
setValue(true);
// Check Application tab → localStorage shows 'trace-collapsed: true'
// Reload page → value persists

const [seen, setSeen] = useSessionStorage('trace-first-visit', false);
setSeen(true);
// Check sessionStorage shows 'trace-first-visit: true'
// Close tab and reopen → sessionStorage cleared
```

**Files Modified**:
- `lib/hooks/useLocalStorage.ts` (create ~50 lines)
- `lib/hooks/useSessionStorage.ts` (create ~50 lines)

**Dependencies**: None (foundation task)

---

## Phase 2: P0 User Journeys (Core Debugging Features)

### T002 [x] [SLICE] User filters reasoning trace by tool type and status

**User Story**: As a user debugging agent prioritization, I can filter the reasoning trace by specific tool types and execution status so that I can focus on relevant steps without cognitive overload.

**Implementation Scope**:
- **UI Component**: `app/components/reasoning-trace/FilterControls.tsx`
  - Tool type dropdown (ShadCN Select component)
    * Shows all 5 Mastra tools (semantic-search, detect-dependencies, get-document-context, query-task-graph, cluster-by-similarity)
    * Disables tools not present in current trace (gray out)
    * Default selection: "All"
  - Status checkboxes (ShadCN Checkbox components)
    * Success, Failed, Skipped (all checked by default)
    * At least one must remain checked (UI enforces constraint)
  - "Show only failed steps" quick toggle
    * Overrides status checkboxes when enabled
- **State Management**: Add filtering logic to `app/components/ReasoningTracePanel.tsx`
  - Filter state: `{ toolType: string, statusFilters: {success, failed, skipped}, showOnlyFailed: boolean }`
  - useMemo for filtered steps array (target <100ms)
  - Preserve original step numbering in filtered view
  - Filters reset on page reload (session-only state, no persistence)
- **Visual Feedback**:
  - Filtered trace updates instantly (<100ms)
  - Disabled dropdown items show "(not used)" label
  - Step count updates: "Showing 3 of 12 steps"
- **Test Validation**: See quickstart.md Test Suite 2 (Tests 2.1-2.4)

**Test Scenario**:
1. Navigate to `/priorities` with existing agent trace (12 steps, 2 failed)
2. Observe all 12 steps visible initially
3. Open tool filter dropdown → verify all 5 tools listed
4. Select "semantic-search" → trace filters to only semantic-search steps
5. Uncheck "Success" status → only failed semantic-search steps shown
6. Enable "Show only failed" toggle → all failed steps (any tool) shown
7. Reload page → filters reset to default (all tools, all statuses)
8. Verify filtering completes <100ms (no visible lag)

**Files Modified**:
- `app/components/reasoning-trace/FilterControls.tsx` (create ~120 lines)
- `app/components/ReasoningTracePanel.tsx` (modify ~80 lines)
  * Add filter state
  * Integrate FilterControls component
  * Implement useMemo filtering logic
  * Update step count display

**Dependencies**: T001 (uses storage hooks for future enhancement, but works without)

---

### T003 [x] [SLICE] User identifies failed steps via error highlighting and jumps to first failure

**User Story**: As a user debugging a failed agent run, I can immediately see which steps failed (red visual distinction) and jump directly to the first failure so that I can diagnose root causes quickly.

**Implementation Scope**:
- **UI Component**: `app/components/reasoning-trace/ErrorSummaryBanner.tsx`
  - Red banner at top of trace panel (destructive color scheme)
  - Message format: "{count} step{s} failed: {tool-names}"
    * Example: "2 steps failed: detect-dependencies, semantic-search"
  - "Jump to first failure →" link
  - Only renders when `failedSteps.length > 0`
- **Visual Styling**: Enhance failed steps in `app/components/ReasoningTracePanel.tsx`
  - Failed steps get:
    * Red border (1px solid var(--destructive-hover))
    * Red background (var(--destructive-bg))
    * "Failed" badge (red with white text)
    * Inline error message below step summary
  - WCAG AA contrast: Verify 4.5:1 minimum ratio
- **Scroll Behavior**:
  - Clicking banner triggers smooth scroll to first failed step
  - Step receives temporary highlight/focus after scroll
  - Uses DOM ID: `step-{stepNumber}`
- **Test Validation**: See quickstart.md Test Suite 3 (Tests 3.1-3.3)

**Test Scenario**:
1. Navigate to `/priorities` with trace containing 2 failed steps (step 3, step 7)
2. Observe error banner appears: "2 steps failed: detect-dependencies, semantic-search"
3. Verify failed steps have red border and background
4. Click step 7 accordion → verify error message shown inline
5. Scroll to top of trace panel (so step 3 is off-screen)
6. Click "Jump to first failure" link in banner
7. Observe smooth scroll to step 3
8. Verify step 3 is in viewport and visually distinct
9. Test with trace that has 0 failures → no banner shown

**Files Modified**:
- `app/components/reasoning-trace/ErrorSummaryBanner.tsx` (create ~80 lines)
- `app/components/ReasoningTracePanel.tsx` (modify ~60 lines)
  * Integrate ErrorSummaryBanner component
  * Add failed step styling (Tailwind classes)
  * Implement scroll-to-failure handler
  * Add step DOM IDs for scroll targets

**Dependencies**: T002 (modifies same component, sequential execution required)

---

## Phase 3: P1 User Journeys (Data Export & Feature Discovery)

### T004 [x] [P] [SLICE] User exports reasoning trace as JSON file with clipboard fallback

**User Story**: As a user who needs to share or archive a reasoning trace, I can export the complete trace as a JSON file, and if the download fails, the system automatically copies it to my clipboard so that I always have access to the trace data.

**Implementation Scope**:
- **UI Component**: `app/components/reasoning-trace/ExportButton.tsx`
  - Export button in trace panel header (next to collapse/expand toggle)
  - Icon: Download symbol (ShadCN Button with icon)
  - Disabled state when `traceSteps.length === 0`
- **Export Logic**:
  - Build ExportPayload:
    * session_id, exported_at (ISO 8601), execution_metadata, steps array
  - Filename pattern: `reasoning-trace-{sessionId}-{timestamp}.json`
  - Try: Blob → URL.createObjectURL → trigger download
  - Catch: navigator.clipboard.writeText(json) fallback
  - Target: <500ms completion for 10-20 steps
- **User Feedback** (ShadCN Toast notifications):
  - Success: "Trace exported successfully"
  - Clipboard fallback: "Export failed, trace copied to clipboard"
  - Error (rare): "Failed to export trace"
- **Test Validation**: See quickstart.md Test Suite 4 (Tests 4.1-4.3)

**Test Scenario**:
1. Navigate to `/priorities` with 10-step trace
2. Click "Export" button in trace panel header
3. Verify file downloads: `reasoning-trace-{sessionId}-{timestamp}.json`
4. Open file in text editor → verify JSON structure:
   - Has session_id, exported_at, execution_metadata, steps
   - All 10 steps present with full details
5. Test clipboard fallback:
   - Open DevTools Console
   - Override: `URL.createObjectURL = () => { throw new Error('Test failure'); }`
   - Click "Export" button
   - Verify toast: "Export failed, trace copied to clipboard"
   - Paste clipboard (Ctrl+V) → verify JSON content matches file export
6. Measure performance: Export completes <500ms

**Files Modified**:
- `app/components/reasoning-trace/ExportButton.tsx` (create ~100 lines)
- `app/components/ReasoningTracePanel.tsx` (modify ~30 lines)
  * Integrate ExportButton in header
  * Pass sessionId, traceData, executionMetadata props

**Dependencies**: T001 (no direct dependency, parallel execution OK)

---

### T005 [x] [P] [SLICE] User discovers reasoning trace via header button and auto-expand behavior

**User Story**: As a user who has triggered agent prioritization, I can easily discover the reasoning trace feature through a prominent "View Reasoning" button, and the trace automatically expands on my first visit to encourage exploration.

**Implementation Scope**:
- **UI Component**: Add "View Reasoning" button to `app/priorities/components/TaskList.tsx`
  - Button in header (right-aligned, next to task count)
  - Label: "View Reasoning ({stepCount} steps)"
    * Example: "View Reasoning (12 steps)"
  - Toggle behavior: Click to expand/collapse trace panel
  - Icon: ChevronDown (collapsed) / ChevronUp (expanded)
- **Auto-Expand Logic**: Enhance `app/priorities/page.tsx`
  - Use `useSessionStorage('trace-first-visit', false)` hook (from T001)
  - On page load:
    * If `!hasSeenTrace && traceSteps.length > 0`: Expand trace automatically
    * Set `hasSeenTrace = true` in sessionStorage
  - On subsequent reloads within same session: Respect user's last toggle state
  - On tab close: sessionStorage cleared → auto-expand on next visit
- **Preference Persistence**: Use `useLocalStorage('reasoning-trace-collapsed', false)` (from T001)
  - User's manual collapse/expand persists across page reloads
  - Session-based auto-expand overrides preference only on first visit
- **Test Validation**: See quickstart.md Test Suite 1 (Tests 1.1-1.3)

**Test Scenario**:
1. Clear sessionStorage: Delete `trace-first-visit` key in DevTools
2. Navigate to `/priorities` with agent execution complete
3. Verify "View Reasoning (12 steps)" button visible in TaskList header
4. Observe trace panel automatically expanded (first visit)
5. Check sessionStorage: `trace-first-visit: true` set
6. Collapse trace manually using header button
7. Reload page (F5)
8. Verify trace remains collapsed (preference persisted in localStorage)
9. Check localStorage: `reasoning-trace-collapsed: true`
10. Click "View Reasoning" button → trace expands
11. Close tab and reopen `/priorities`
12. Verify auto-expand triggers again (sessionStorage cleared)

**Files Modified**:
- `app/priorities/components/TaskList.tsx` (modify ~40 lines)
  * Add "View Reasoning" button in header
  * Wire onClick to toggle trace panel
  * Display step count dynamically
- `app/priorities/page.tsx` (modify ~50 lines)
  * Manage trace visibility state
  * Implement auto-expand logic with sessionStorage
  * Integrate localStorage for preference persistence
- `app/components/ReasoningTracePanel.tsx` (modify ~20 lines)
  * Accept `isExpanded` prop
  * Wire collapse/expand state to parent

**Dependencies**: T001 (uses storage hooks)

---

## Phase 4: Integration & Polish

### T006 [x] [POLISH] Create comprehensive manual testing guide

**Enhancement to**: All slices (T002-T005)

**Implementation Scope**:
- **Documentation**: `__tests__/manual/T025_REASONING_TRACE_UX.md`
  - Test Suite 1: Discoverability (3 tests)
  - Test Suite 2: Filtering (4 tests)
  - Test Suite 3: Error Highlighting (3 tests)
  - Test Suite 4: Export (3 tests)
  - Test Suite 5: Edge Cases (4 tests - 50+ steps, localStorage disabled, keyboard nav, etc.)
- **Performance Benchmarks**: Include measurement table for targets
  - Filtering: <100ms
  - Export: <500ms
  - Auto-expand render: <50ms
- **Known Issues Section**: Document any bugs discovered during testing

**Test Scenario**:
1. Follow all test scenarios in quickstart.md
2. Record actual performance measurements
3. Document any deviations from expected behavior
4. Update test guide with workarounds if needed

**Files Modified**:
- `__tests__/manual/T025_REASONING_TRACE_UX.md` (already created in Phase 1 design, validate completeness)

**Dependencies**: T002, T003, T004, T005 (all slices must be implemented)

---

## Dependencies

```
T001 [SETUP] Storage hooks
  ↓ (enables)
  ├─→ T005 [SLICE] Discoverability (uses hooks)
  └─→ (optional for) T002, T003, T004

T002 [SLICE] Filtering
  ↓ (modifies ReasoningTracePanel, sequential)
  └─→ T003 [SLICE] Error highlighting

T004 [SLICE] Export (parallel with T005, independent component)

T005 [SLICE] Discoverability (parallel with T004, different component)

T002, T003, T004, T005
  ↓ (all complete)
  └─→ T006 [POLISH] Manual testing guide
```

**Critical Path**: T001 → T002 → T003 (sequential modifications to ReasoningTracePanel)

**Parallel Execution**:
- T001 can start immediately (foundation)
- T004 can run parallel with T005 after T001 completes (independent components)
- T002 and T003 are sequential (both modify ReasoningTracePanel.tsx)

---

## Execution Order

**Recommended sequence for maximum parallelism:**

```
Step 1: T001 [SETUP] Storage hooks (foundation)
        ↓
Step 2: Launch in parallel:
        - T002 [SLICE] Filtering
        - T004 [SLICE] Export
        - T005 [SLICE] Discoverability
        ↓
Step 3: T003 [SLICE] Error highlighting (after T002 completes)
        ↓
Step 4: T006 [POLISH] Manual testing (after all slices complete)
```

**Time Estimate**: 2-3 days total
- T001: 2-3 hours (hooks are straightforward)
- T002: 6-8 hours (filtering logic + UI)
- T003: 4-6 hours (error styling + scroll behavior)
- T004: 4-5 hours (export + clipboard fallback)
- T005: 5-7 hours (auto-expand + button integration)
- T006: 2-3 hours (run manual tests, document findings)

---

## Notes

- **Client-Side Only**: All tasks are frontend work (no new API endpoints per plan.md)
- **No Backend Slices**: Feature enhances existing trace data (already fetched by API)
- **Storage Hooks Justify Setup**: T001 is the only [SETUP] task because hooks are reusable across multiple slices
- **Parallel Opportunities**: T004 and T005 are truly independent (different components, different files)
- **Sequential Constraint**: T002 and T003 must be sequential (both modify ReasoningTracePanel.tsx critical sections)
- **Manual Testing Acceptable**: Per constitution, manual testing guide is valid when automated tests blocked
- **Performance Targets**: All targets documented (100ms filtering, 500ms export, no jank)

## Validation Checklist
*Verified before creating tasks.md*

- [x] Every [SLICE] task has a user story
- [x] Every [SLICE] task includes UI + State + Feedback + Test
- [x] Every [SLICE] task has a test scenario from quickstart.md
- [x] No backend-only or frontend-only tasks (all are complete UI enhancements)
- [x] Setup tasks minimal (only T001 hooks, justified as blocking dependency)
- [x] Tasks ordered by user value (filtering/error highlighting P0, export/discoverability P1)
- [x] Parallel tasks operate on independent files (T004 + T005 parallel, T002 + T003 sequential)
- [x] Each task specifies exact file paths to modify

---

## Constitutional Compliance

**Vertical Slice Validation**:
- ✅ T002 (Filtering): SEE dropdown/checkboxes → DO select filters → VERIFY trace filters instantly
- ✅ T003 (Error highlighting): SEE red borders/banner → DO click jump-to-failure → VERIFY scrolls to step
- ✅ T004 (Export): SEE export button → DO click export → VERIFY file downloads or clipboard copy
- ✅ T005 (Discoverability): SEE "View Reasoning" button → DO click button → VERIFY trace expands

**Test-First Development**: Manual testing guide (quickstart.md) created in Phase 1 design before task generation

**Observable by Design**: Each slice includes visual feedback (toast notifications, UI updates, console logs)

**Autonomous by Default**: Auto-expand behavior (T005) triggers automatically without user opt-in
