# Quickstart: Task Gap Filling Manual Test Guide

**Feature**: 011-task-gap-filling
**Date**: 2025-11-05
**Phase**: Phase 1 - Design & Contracts

## Purpose

This guide provides step-by-step manual test scenarios for validating the Task Gap Filling feature. Use this when automated tests are blocked or for exploratory testing.

## Prerequisites

Before running any scenario:

1. **System Running**:
   - AI Note Synthesiser dev server: `pnpm dev` at `http://localhost:3000`
   - Supabase connection active (check `.env.local`)
   - OpenAI API key configured

2. **Test Data Setup**:
   - At least one user outcome defined (e.g., "Launch mobile app by Q4")
   - One or more documents processed with extracted tasks
   - At least one agent session with prioritized tasks

3. **Browser**:
   - Chrome, Firefox, or Safari (latest version)
   - Dev tools open for observing network requests

---

## Scenario 1: Detect and Fill Implementation Gap

**Goal**: Verify system detects gap between high-level tasks and generates appropriate bridging tasks.

**Setup**:
1. Create mock agent session with incomplete task sequence:
   ```typescript
   // Manual setup via Supabase SQL Editor or seed script
   const mockPlan = {
     tasks: [
       { id: '001', text: 'Define Q4 goals', estimated_hours: 8, depends_on: [] },
       { id: '002', text: 'Design app mockups', estimated_hours: 40, depends_on: ['001'] },
       { id: '005', text: 'Launch on app store', estimated_hours: 16, depends_on: [] } // Note: no dependency on 002
     ]
   };
   ```
2. Set active outcome: "Launch mobile app by Q4 through MVP release"

**Steps**:
1. Navigate to `http://localhost:3000/priorities`
2. Verify task list displays:
   - #1: Define Q4 goals
   - #2: Design app mockups
   - #5: Launch on app store (notice jump from #2 to #5)
3. Click **"Find Missing Tasks"** button
4. Wait for loading state (should be <10s per FR performance goal)

**Expected Results**:
- ✅ Modal appears with title "💡 X Tasks Suggested to Fill Gaps" (X = 1-3)
- ✅ Gap context displayed:
  - "Gap detected between:"
  - "#2: Design app mockups → #5: Launch on app store"
  - "Time gap: ~3 weeks unaccounted"
  - "Jump type: design → launch (skips implementation)"
- ✅ 2-3 suggested tasks shown:
  - Example: "Build MVP frontend with authentication" (80 hours, medium, 82% confidence)
  - Example: "Implement backend API and database" (60 hours, medium, 78% confidence)
  - Example: "Conduct beta testing with 20 users" (20 hours, low, 68% confidence)
- ✅ Each suggestion displays:
  - Checkbox (all pre-checked by default)
  - Task text
  - Estimated hours ("X weeks")
  - Cognition level badge ("medium focus")
  - Confidence percentage badge ("82% confident")
  - [Edit] button

**Pass Criteria**:
- Gap detected correctly (3+ indicators: time=true, action_type_jump=true, no_dependency=true)
- Suggestions are relevant (mention implementation, building, testing)
- Confidence scores ≥70% (FR-023)
- Generation time <5s (FR-020)

**Failure Debug**:
- Check browser console for errors
- Verify `/api/agent/suggest-gaps` returns 200
- Check Supabase agent_sessions table for gap_analysis data
- Verify OpenAI API key is valid

---

## Scenario 2: Review and Accept Suggestions

**Goal**: Verify user can accept/reject suggestions and they're inserted correctly.

**Prerequisites**: Scenario 1 completed with modal open

**Steps**:
1. Review the 3 suggested tasks
2. Identify the lowest confidence suggestion (e.g., 68%)
3. **Uncheck** the lowest confidence task
4. Verify unchecked task shows different visual state (opacity reduced)
5. Click **"Accept Selected (2)"** button (count should update based on checked items)

**Expected Results**:
- ✅ Modal closes smoothly
- ✅ Task list refreshes within 2s
- ✅ New tasks appear in correct positions:
  - #1: Define Q4 goals (unchanged)
  - #2: Design app mockups (unchanged)
  - **#3: Build MVP frontend with authentication** (NEW, "AI Generated" badge)
  - **#4: Implement backend API and database** (NEW, "AI Generated" badge)
  - #5: Launch on app store (unchanged, now depends on #4)
- ✅ Dependencies updated correctly:
  - #3 depends_on: ['002']
  - #4 depends_on: ['003']
  - #5 depends_on: ['004']
- ✅ Task IDs maintain sequence integrity (no gaps in numbering except rejected task)

**Pass Criteria**:
- Accepted tasks inserted at correct positions (FR-015, FR-016)
- Dependencies form valid chain with no cycles (FR-017, FR-018)
- Rejected task NOT inserted
- "AI Generated" badge or metadata visible (FR-019)

**Failure Debug**:
- Check POST `/api/agent/accept-suggestions` response
- Verify task_insertion.ts doesn't report cycle
- Check agent_sessions.result.prioritized_tasks in Supabase
- Confirm GapAnalysisSession.user_acceptances logged correctly

---

## Scenario 3: Edit Suggestion Before Accepting

**Goal**: Verify inline editing works and edited values are preserved.

**Prerequisites**: Scenario 1 completed with modal open (fresh modal, not after acceptance)

**Steps**:
1. Locate first suggestion: "Build MVP frontend with authentication" (80 hours, medium)
2. Click **[Edit]** button next to the suggestion
3. Observe task text becomes editable (input field or contentEditable)
4. Modify text to: **"Build MVP frontend with core screens only"**
5. Change estimated hours from **80 to 60** (via input field)
6. Click away or press Enter to save inline edits
7. Verify edited values display in suggestion card
8. Click **"Accept Selected (3)"** (assuming all still checked)

**Expected Results**:
- ✅ Edit mode activates: Text and hours become editable
- ✅ Changes save immediately on blur/Enter
- ✅ Modal shows updated values before acceptance
- ✅ After acceptance, inserted task has:
  - Text: "Build MVP frontend with core screens only" (edited)
  - Hours: 60 (edited)
  - Cognition: "medium" (unchanged, readonly)
  - Confidence: 82% (unchanged, readonly - represents original AI confidence)
- ✅ GapAnalysisSession.user_acceptances logs: `{task_id, accepted: true, edited: true, final_text, final_hours}`

**Pass Criteria**:
- Edits persist through acceptance (FR-013)
- Original AI metadata preserved (confidence, cognition)
- Validation enforced: task text 10-200 chars, hours 8-160

**Failure Debug**:
- Check React state updates on edit
- Verify edit validation in SuggestedTasksModal.tsx
- Confirm edited values sent to /api/agent/accept-suggestions
- Check insertion logic handles edited vs original values

---

## Scenario 4: No Gaps Detected

**Goal**: Verify graceful handling when plan has no gaps.

**Setup**:
1. Create complete agent session with no gaps:
   ```typescript
   const completePlan = {
     tasks: [
       { id: '001', text: 'Define goals', estimated_hours: 8, depends_on: [] },
       { id: '002', text: 'Research competitors', estimated_hours: 16, depends_on: ['001'] },
       { id: '003', text: 'Design mockups', estimated_hours: 40, depends_on: ['002'] },
       { id: '004', text: 'Build frontend', estimated_hours: 80, depends_on: ['003'] },
       { id: '005', text: 'Build backend', estimated_hours: 60, depends_on: ['003'] },
       { id: '006', text: 'Test MVP', estimated_hours: 20, depends_on: ['004', '005'] },
       { id: '007', text: 'Launch app', estimated_hours: 16, depends_on: ['006'] }
     ]
   };
   ```
   - No time gaps (all reasonable hour estimates)
   - No action type jumps (logical progression)
   - Dependencies explicit (no orphaned tasks)
   - No skill jumps (gradual transitions)

**Steps**:
1. Navigate to `/priorities` with complete plan
2. Click **"Find Missing Tasks"** button
3. Wait for analysis (~2s)

**Expected Results**:
- ✅ No modal appears
- ✅ Toast notification or inline message displays: **"No gaps detected. Your plan appears complete."**
- ✅ Button remains enabled (user can re-check later)
- ✅ Task list unchanged

**Pass Criteria**:
- System correctly identifies no gaps (all indicator counts <3)
- User receives positive feedback (not just silence)
- No false positives generated (FR-022: <20% false positive rate)

**Failure Debug**:
- Check gap detection logic: Verify 3+ indicator threshold
- Confirm detection_ms and generation_ms logged even for no-gap case
- Verify GapAnalysisSession created with empty detected_gaps array

---

## Scenario 5: AI Generation Failure

**Goal**: Verify graceful error handling when OpenAI fails.

**Setup**:
1. Temporarily invalidate OpenAI API key:
   - Edit `.env.local`: Set `OPENAI_API_KEY=invalid_key`
   - Restart dev server
2. Create agent session with obvious gap (use Scenario 1 setup)

**Steps**:
1. Navigate to `/priorities`
2. Click **"Find Missing Tasks"** button
3. Wait for analysis

**Expected Results**:
- ✅ Error message displayed (toast or modal): **"Unable to generate suggestions. Please try again."**
- ✅ No partial results shown (all-or-nothing approach)
- ✅ Original plan unchanged
- ✅ Button remains enabled for retry
- ✅ Console logs error details (for debugging)
- ✅ Error logged to GapAnalysisSession.insertion_result: `{success: false, error: "AI generation failed: 401 Unauthorized"}`

**Pass Criteria**:
- User-friendly error message (no raw API errors exposed)
- Retry capability available (FR-024)
- System doesn't crash or leave partial state

**Failure Debug**:
- Check try/catch in Mastra tool execute function
- Verify error boundary in SuggestedTasksModal
- Confirm error logged to Supabase for telemetry

**Cleanup**: Restore valid OpenAI API key in `.env.local` and restart server

---

## Scenario 6: Circular Dependency Prevention

**Goal**: Verify system blocks insertion that would create cycles.

**Setup**:
1. Create agent session with existing dependency chain:
   ```typescript
   const cyclicPlan = {
     tasks: [
       { id: '001', text: 'Task A', depends_on: ['003'] }, // Creates cycle if 003 depends on 001
       { id: '002', text: 'Task B', depends_on: [] },
       { id: '003', text: 'Task C', depends_on: ['002'] }
     ]
   };
   ```
2. Manually craft suggestion that would complete cycle:
   - Suggestion: Insert task between 001 and 003 that depends on 001 and is dependency of 003
   - This would create: 003 → 001 → new_task → 003 (cycle)

**Steps**:
1. Trigger gap detection (may need to force via dev tools)
2. Accept suggestion that creates cycle
3. Click "Accept Selected"

**Expected Results**:
- ✅ API returns **400 Bad Request**
- ✅ Error message: **"Cannot insert tasks - would create circular dependency chain"**
- ✅ Modal remains open with suggestions unchanged
- ✅ No tasks inserted (rollback successful)
- ✅ User can modify or reject problematic suggestion

**Pass Criteria**:
- Cycle detected before commit (FR-018)
- Clear error explanation
- No data corruption (original plan intact)

**Failure Debug**:
- Check Kahn's algorithm implementation in taskInsertion.ts
- Verify detectCycle() called before persist
- Confirm rollback on validation failure

---

## Scenario 7: Multiple Gaps in One Plan

**Goal**: Verify system handles multiple gaps and groups suggestions correctly.

**Setup**:
1. Create agent session with 2 gaps:
   ```typescript
   const multiGapPlan = {
     tasks: [
       { id: '001', text: 'Define goals', estimated_hours: 8, depends_on: [] },
       { id: '002', text: 'Design mockups', estimated_hours: 40, depends_on: ['001'] },
       { id: '005', text: 'Launch app', estimated_hours: 16, depends_on: [] }, // Gap 1: 002 → 005
       { id: '006', text: 'Monitor metrics', estimated_hours: 8, depends_on: [] },
       { id: '007', text: 'Plan Q2', estimated_hours: 8, depends_on: [] },
       { id: '010', text: 'Ship Q2 features', estimated_hours: 40, depends_on: [] } // Gap 2: 007 → 010
     ]
   };
   ```

**Steps**:
1. Click "Find Missing Tasks"
2. Observe modal structure

**Expected Results**:
- ✅ Modal displays 2 gap sections:
  - **Gap 1**: "#2: Design mockups → #5: Launch app"
    - 2-3 suggestions for gap 1
  - **Gap 2**: "#7: Plan Q2 → #10: Ship Q2 features"
    - 2-3 suggestions for gap 2
- ✅ Each gap section has separate context and suggestions
- ✅ User can accept/reject suggestions independently per gap
- ✅ Total suggestions ≤9 (3 gaps × 3 tasks max per FR-025)

**Pass Criteria**:
- Multiple gaps detected (FR-003: top 3 by confidence)
- Suggestions grouped by gap context
- Acceptance per gap independent

**Failure Debug**:
- Check gap ranking logic (confidence-based sort)
- Verify UI component handles multiple gap sections
- Confirm insertion logic handles non-contiguous IDs

---

## Performance Benchmarks

Run these timing checks across scenarios:

| Metric | Target | Measured | Pass? |
|--------|--------|----------|-------|
| Gap Detection | <2s for 50-task plan | ____s | ☐ |
| Task Generation | <5s per gap (FR-020) | ____s | ☐ |
| Modal Display | <10s E2E from click | ____s | ☐ |
| Task Insertion | <2s for 3 tasks | ____s | ☐ |
| Dependency Validation | <1s for 50-task graph | ____ms | ☐ |

**How to Measure**:
1. Open browser dev tools → Network tab
2. Note timestamps on API calls:
   - `/api/agent/suggest-gaps`: Gap detection + generation time
   - `/api/agent/accept-suggestions`: Insertion + validation time
3. Use Performance tab to profile React render times

---

## Acceptance Checklist

Before marking feature complete, verify:

**Core Functionality**:
- [ ] Scenario 1: Gaps detected with ≥80% precision
- [ ] Scenario 2: Tasks inserted with correct dependencies
- [ ] Scenario 3: Inline edits preserved through acceptance
- [ ] Scenario 4: No false positives (no-gap case handled)
- [ ] Scenario 5: AI failures handled gracefully
- [ ] Scenario 6: Circular dependencies blocked
- [ ] Scenario 7: Multiple gaps supported

**Non-Functional Requirements**:
- [ ] All performance benchmarks met (table above)
- [ ] Mobile responsive (test on iPhone/Android viewport)
- [ ] Keyboard navigation works (Tab, Enter, Esc)
- [ ] Screen reader accessible (test with VoiceOver/NVDA)
- [ ] Error messages user-friendly (no stack traces exposed)

**Data Integrity**:
- [ ] GapAnalysisSession logged to Supabase
- [ ] User acceptances tracked
- [ ] Performance metrics captured
- [ ] Original plan never corrupted on errors

---

## Troubleshooting Guide

**Issue**: Modal doesn't appear after clicking button
- Check: Browser console for JS errors
- Check: Network tab for 500 errors on `/api/agent/suggest-gaps`
- Check: Supabase connection (verify NEXT_PUBLIC_SUPABASE_URL)
- Fix: Restart dev server, clear browser cache

**Issue**: Generated tasks are irrelevant
- Check: User outcome is set and descriptive
- Check: Semantic search returns similar tasks (verify embeddings exist)
- Check: OpenAI prompt in suggestBridgingTasks.ts
- Fix: Tune prompt, adjust temperature, add more context

**Issue**: Circular dependency error on valid insertion
- Check: Kahn's algorithm implementation in taskInsertion.ts
- Check: Existing plan dependencies (visualize graph)
- Fix: Debug with smaller test case, verify topological sort logic

**Issue**: Performance slower than target
- Check: Database query times (Supabase slow query log)
- Check: OpenAI API latency (network tab timing breakdown)
- Check: React render performance (Profiler tab)
- Fix: Add indexes, optimize re-renders, cache semantic search results

---

## Next Steps

1. **Automate**: Convert manual scenarios to Vitest integration tests (when FormData issue resolved)
2. **CI/CD**: Add quickstart scenarios to GitHub Actions workflow
3. **Metrics**: Collect real user data on acceptance rates, gap detection precision
4. **Iterate**: Refine heuristics based on false positive/negative rates

**Estimated Manual Test Time**: 45-60 minutes for all scenarios
