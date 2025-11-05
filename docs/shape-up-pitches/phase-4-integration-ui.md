# Shape Up Pitch: Phase 4 - Reasoning Trace Enhancements

## Problem

**Reasoning trace exists but could be more discoverable and actionable.**

Current state:
- ✅ Agent integration complete (`/api/agent/prioritize`)
- ✅ Reasoning trace panel built and functional
- ✅ Task list with movement indicators working
- ✅ Mastra telemetry storing all traces
- ✅ API endpoints operational (`/api/agent/sessions/*`)
- ❓ Trace collapsed by default - users may not discover it
- ❓ No filtering or search within reasoning steps
- ❓ Failed steps could be more prominent

**Opportunity:** Small UX improvements to increase trace visibility and utility without rebuilding what already works.

---

## Solution

**Minor enhancements to existing ReasoningTracePanel for better discoverability and debugging.**

### Appetite: 2-3 days (reduced from original 1 week estimate)

### What's Already Built (No Work Needed)

The following components are **production-ready**:

✅ **Agent Orchestration**: `lib/mastra/services/agentOrchestration.ts`
- Complete integration with Mastra agent
- Context assembly (outcome, reflections, tasks, previous plans)
- Graceful failure handling with fallback plans
- Execution metadata tracking

✅ **API Endpoints**: All functional and tested
- `POST /api/agent/prioritize` - Trigger prioritization
- `GET /api/agent/sessions/[sessionId]` - Get session details
- `GET /api/agent/sessions/[sessionId]/trace` - Get reasoning trace
- `GET /api/agent/sessions/latest` - Get latest session for outcome

✅ **Reasoning Trace Panel**: `app/components/ReasoningTracePanel.tsx`
- Step-by-step breakdown with accordion UI
- Tool usage summary with counts
- Status badges (success/failed/skipped)
- Duration tracking per step
- Collapsible tool input/output display

✅ **Priorities Page**: `app/priorities/page.tsx`
- Complete workflow (trigger → poll → display results)
- Task list with prioritization and movement indicators
- Recalculation support with diff visualization
- Error handling and loading states

✅ **Database Schema**: `reasoning_traces` table
- Stores all reasoning steps with 7-day retention
- Automatic cleanup via trigger
- Efficient querying by session_id

---

## Scope (What's Left to Build)

### 1. Improve Trace Discoverability

**Problem**: Reasoning trace is hidden in collapsed accordion. Users may not know it exists.

**Solution**:
- Add prominent "View Reasoning" button in TaskList header
- Show trace step count badge (e.g., "12 steps")
- Auto-expand trace on first visit per session
- Save collapse/expand preference to localStorage

**UI Mockup**:
```
[TaskList Header]
  Prioritized Tasks (15)    [View Reasoning (12 steps) ▼]
```

---

### 2. Add Basic Filtering

**Problem**: Trace with 10+ steps is hard to scan. Users want to focus on failures or specific tools.

**Solution**:
- Filter by tool type dropdown (All, semantic-search, detect-dependencies, etc.)
- Filter by status chips (All, Success, Failed, Skipped)
- Quick toggle: "Show only failed steps"

**UI Mockup**:
```
[Reasoning Trace Panel]
  Filters: [All Tools ▼] [✓ Success] [✓ Failed] [✓ Skipped]
           [Toggle: Show only failures]
```

---

### 3. Better Error Highlighting

**Problem**: Failed steps blend in with successful ones. Errors hard to spot.

**Solution**:
- Failed steps get red border + destructive background
- Error summary banner at top of trace panel
- Click error banner to jump to first failed step
- Show error message inline at step level

**UI Mockup**:
```
[Error Banner - Red]
  ⚠ 2 steps failed: detect-dependencies, semantic-search
  [Jump to first failure →]
```

---

### 4. Optional: Export Trace

**Problem**: Users want to save traces for debugging or sharing with support.

**Solution**:
- "Export as JSON" button in trace panel header
- Downloads reasoning trace with all step details
- Filename: `reasoning-trace-{sessionId}-{date}.json`

---

## Files to Modify

**Estimated changes: ~150-200 lines total**

1. `app/components/ReasoningTracePanel.tsx` (~100 lines)
   - Add filtering state and UI
   - Add error summary banner
   - Add export button

2. `app/priorities/components/TaskList.tsx` (~30 lines)
   - Add "View Reasoning" button in header
   - Pass trace open/close state to parent

3. `app/priorities/page.tsx` (~20 lines)
   - Manage trace visibility state
   - Pass sessionId to trace panel

4. `lib/hooks/useLocalStorage.ts` (~20 lines - new file)
   - Helper for saving trace collapse preference

---

## Rabbit Holes (Timeboxed)

**1. Advanced filtering**
- **Risk:** Adding complex query builder or regex search
- **Timebox:** Basic dropdown + checkboxes only. No search for Phase 4.
- **Why:** 95% of use cases covered by tool/status filters.

**2. Inline editing of trace**
- **Risk:** Allowing users to annotate or modify reasoning steps
- **Timebox:** Read-only display only. No editing.
- **Why:** Trace is historical record, should not be mutable.

**3. Trace comparison**
- **Risk:** Building diff view to compare two reasoning traces
- **Timebox:** Single trace view only. Comparison in Phase 6+.
- **Why:** Low frequency use case, not worth complexity.

---

## No-Gos

**❌ Dependency graph visualization (D3.js)**
- Current inline dependency display in TaskList is sufficient
- Graph adds complexity without user value

**❌ Execution waves timeline**
- Movement indicators already show task reordering
- Redundant with existing TaskList visualization

**❌ Real-time streaming updates**
- Agent runs complete in <30s
- Polling every 2s works fine

**❌ Agent performance profiling UI**
- No charts for token usage or detailed tool timing
- Execution metadata already captures key metrics

**❌ Manual step-by-step agent execution**
- No debugger or pause/resume controls
- Agent runs to completion only

**❌ Trace history browser**
- Show current execution only
- Historical traces via database queries (future)

---

## Success Metrics

**Discoverability:**
- 60%+ of users expand reasoning trace at least once
- Average time to discover trace: <1 minute from page load

**Utility:**
- Failed step errors surfaced within 5 seconds
- Users can identify problematic tools without reading full trace
- Error recovery actions clear from failure messages

**Performance:**
- Filtering applies instantly (<100ms)
- Export completes in <500ms
- No UI lag when expanding/collapsing steps

**User Satisfaction:**
- Manual review: 80% of error messages are actionable
- Survey: "I understand why prioritization failed" ≥4.0/5.0

---

## Deliverables

### Must-Have (Day 1-2)
- ✅ "View Reasoning" button in TaskList header with step count
- ✅ Filter by tool type (dropdown)
- ✅ Filter by status (checkboxes)
- ✅ Failed step error highlighting (red border + background)

### Nice-to-Have (Day 3)
- ✅ Error summary banner with "jump to failure" link
- ✅ Auto-expand trace on first visit (localStorage)
- ✅ Export trace as JSON button

### Out of Scope (Future Phases)
- ❌ Dependency graph visualization
- ❌ Trace comparison/diff view
- ❌ Real-time streaming progress
- ❌ Inline step editing or annotations
- ❌ Historical trace browser

---

## Implementation Notes

**Existing Infrastructure (Reuse):**
- Trace fetching: `GET /api/agent/sessions/[sessionId]/trace`
- Trace data type: `ReasoningTraceRecord` (already defined)
- UI components: ShadCN Accordion, Badge, Alert (already installed)

**New Patterns:**
- Filtering state: Use React useState, filter client-side (no API changes)
- localStorage: Wrap in custom hook for SSR safety
- Export: Use browser `download` attribute, no backend needed

**Testing:**
- Manual testing only (existing pattern for UI features)
- Test with traces that have 0, 1, and 10+ failed steps
- Verify filtering doesn't break step numbering

---

## What Changed from Original Pitch

| Aspect | Original (5 days) | Revised (2-3 days) |
|--------|-------------------|---------------------|
| Scope | Full integration + 3 components | Minor enhancements to 1 existing component |
| Agent Integration | Build from scratch | ✅ Already complete |
| API Endpoints | Build 2 new endpoints | ✅ Already exist |
| ReasoningTracePanel | Build new component | ✅ Enhance existing |
| DependencyGraph | D3.js visualization | ❌ Not needed (inline display works) |
| ExecutionWaves | Timeline component | ❌ Not needed (movement indicators work) |
| Effort | ~40 hours | ~16-20 hours |

**Time Saved:** 60% (2-3 days vs 5 days)

**Key Insight:** Phase 4 integration was largely completed during earlier phases. This pitch now focuses on polish and discoverability rather than foundational work.

---

## Next Steps

1. **Validate scope** with user (this document)
2. **Prototype filtering UI** in ReasoningTracePanel (~2 hours)
3. **Implement error highlighting** (~3 hours)
4. **Add "View Reasoning" button** to TaskList (~2 hours)
5. **Test with real agent runs** (multiple failure scenarios)
6. **Ship to production** and gather user feedback

**Total estimated effort:** 2-3 days for complete delivery of all enhancements.
