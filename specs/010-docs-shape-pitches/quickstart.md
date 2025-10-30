# Quickstart: Context-Aware Dynamic Re-Prioritization

**Feature**: 010-docs-shape-pitches
**Date**: 2025-10-26
**Purpose**: Manual validation checklist for acceptance scenarios

---

## Prerequisites

- [ ] Database migration `015_add_reflection_toggle.sql` applied
- [ ] Dev server running (`pnpm dev`)
- [ ] User has at least one outcome statement created
- [ ] User has at least 5 tasks in system (for meaningful priorities)

---

## Scenario 1: Context Card Empty State (FR-001, FR-002)

**User Story**: As a new user, I see an invitation to add context before analyzing tasks.

### Steps
1. Navigate to `/priorities` page
2. **Verify**: See ContextCard component above "Analyze Tasks" button
3. **Verify**: Card shows "No context added yet" heading
4. **Verify**: Card displays "Add Current Context" button with MessageSquare icon
5. **Verify**: Empty state message explains value ("Add quick notes about your current stage...")

### Expected Outcome
- [ ] Context card is visible and inviting
- [ ] Button is clearly actionable
- [ ] Empty state provides guidance

### Test Data
- None (fresh user with no reflections)

---

## Scenario 2: Adding Context Before Prioritization (FR-004)

**User Story**: As a user, I can add context directly from the priorities page without leaving.

### Steps
1. From empty context card, click "Add Current Context" button
2. **Verify**: ReflectionPanel opens (existing component)
3. Add reflection: "Still in design phase, no app yet"
4. Submit reflection
5. **Verify**: Context card refreshes and shows the new reflection
6. **Verify**: Reflection has toggle switch (default ON)
7. Click "Analyze Tasks" button
8. Wait for agent to complete (~30s)
9. **Verify**: Priorities surface design-stage tasks higher than app-dependent tasks
10. **Verify**: Tasks affected by context show visual indicators

### Expected Outcome
- [ ] Reflection appears in context card immediately after submission
- [ ] Toggle switch is visible and defaults to ON (checked)
- [ ] Priorities reflect the context (design tasks prioritized)
- [ ] Movement badges show which tasks were affected

### Test Data
- Reflection text: "Still in design phase, no app yet"
- Expected affected tasks: "Design landing mockups" (up), "A/B test app icons" (down)

---

## Scenario 3: Toggling Existing Context (FR-003, FR-006, FR-007)

**User Story**: As a user, I can toggle reflections on/off to see instant impact on priorities.

### Steps
1. Ensure at least 2 reflections exist (from Scenario 2)
2. Add second reflection: "Burnt out after launch, need lighter tasks"
3. **Verify**: Context card shows both reflections with toggle switches
4. Run "Analyze Tasks" to establish baseline
5. Toggle the "Burnt out" reflection OFF (uncheck switch)
6. **Verify**: Loading indicator appears if >100ms
7. **Verify**: Priorities adjust within 500ms (no full 30s re-run)
8. **Verify**: Heavy/complex tasks move up in priority
9. **Verify**: Movement badges appear on affected tasks
10. Refresh page (F5)
11. **Verify**: Toggle state persists (reflection still OFF)

### Expected Outcome
- [ ] Toggle switches are visible on each reflection
- [ ] Toggling triggers instant adjustment (<500ms, not 30s)
- [ ] Visual feedback during adjustment (loading indicator)
- [ ] Movement badges show position changes with reasons
- [ ] Toggle state survives page refresh

### Test Data
- Reflection 1: "Still in design phase, no app yet" (ON)
- Reflection 2: "Burnt out after launch, need lighter tasks" (OFF after toggle)

### Performance Check
```bash
# Open browser DevTools → Network tab
# Toggle reflection
# Check request to /api/agent/adjust-priorities
# Verify response time <500ms (p95)
```

---

## Scenario 4: Rapid Toggle Debouncing (FR-021)

**User Story**: As a user, rapid toggling doesn't spam the server with requests.

### Steps
1. Have 3+ reflections in context card
2. Open browser DevTools → Network tab, filter to "/adjust-priorities"
3. Rapidly toggle 3 reflections within 2 seconds (ON → OFF → ON → OFF...)
4. **Verify**: Only 1 request sent after 1 second of inactivity (debounce)
5. **Verify**: No intermediate requests during rapid toggling

### Expected Outcome
- [ ] Network shows only 1 request after debounce delay
- [ ] Final request uses latest toggle states (not intermediate)
- [ ] UI feels responsive (optimistic updates)

---

## Scenario 5: Contradictory Context Demotion (FR-010)

**User Story**: As a user, contradictory tasks are demoted (not hidden) with clear explanations.

### Steps
1. Create outcome: "Increase App downloads by 25%"
2. Add reflection: "We don't have an app yet, still in design phase"
3. Run "Analyze Tasks"
4. **Verify**: App-dependent tasks demoted to lower positions (still visible)
5. **Verify**: Demoted tasks show badges like "↓ 3 positions"
6. Hover over movement badge
7. **Verify**: Tooltip shows reason: "Requires app (contradicts context)"

### Expected Outcome
- [ ] Contradictory tasks are demoted, NOT hidden
- [ ] Movement badges clearly indicate demotion (down arrow)
- [ ] Reasons explain the contradiction

### Test Data
- Outcome: "Increase App downloads by 25%"
- Reflection: "We don't have an app yet"
- Expected demoted task: "A/B test app icons" (contradicts "no app")

---

## Scenario 6: Adjustment Failure Rollback (FR-022)

**User Story**: As a user, failed adjustments revert my toggle state with error feedback.

### Steps (Simulated Failure)
1. Open browser DevTools → Network tab
2. Enable "Offline" mode or block `/api/agent/adjust-priorities` endpoint
3. Toggle a reflection
4. **Verify**: Optimistic UI update (toggle switches immediately)
5. **Verify**: Network request fails (simulated)
6. **Verify**: Toggle reverts to previous state (rollback)
7. **Verify**: Error message appears: "Failed to update reflection"

### Expected Outcome
- [ ] Optimistic update happens instantly
- [ ] Rollback occurs on failure (toggle returns to original state)
- [ ] User sees clear error message
- [ ] Database state remains consistent (no partial updates)

---

## Scenario 7: Visual Movement Feedback (FR-013, FR-014)

**User Story**: As a user, I see clear visual indicators showing which tasks moved and why.

### Steps
1. Have baseline priorities established
2. Add reflection: "Client demo tomorrow"
3. **Verify**: Demo-related tasks jump to higher priority
4. Inspect task rows
5. **Verify**: Moved tasks show TaskMovementBadge component
6. **Verify**: Badge displays arrow icon (↑ or ↓) and position change ("2 positions")
7. Hover over badge
8. **Verify**: Tooltip shows reason: "Matches 'client demo' context"

### Expected Outcome
- [ ] Movement badges appear on affected tasks only
- [ ] Badges show direction (up/down arrow) and magnitude (number)
- [ ] Tooltips explain the reason for movement
- [ ] Unchanged tasks show no badge or "Unchanged" badge

---

## Scenario 8: Context Transparency in Trace (FR-015, FR-016)

**User Story**: As a user, I can see which reflections influenced the priorities.

### Steps
1. Have 3 active reflections
2. Run "Analyze Tasks"
3. Open ReasoningTracePanel (expand trace section)
4. **Verify**: Summary shows "Context Used: 3 reflections"
5. Expand context section in trace
6. **Verify**: See list of reflection texts that were active during prioritization
7. **Verify**: Recency weights displayed (1.0, 0.5, 0.25 based on age)

### Expected Outcome
- [ ] Trace panel shows context summary
- [ ] Reflection texts are visible in trace
- [ ] Recency weights are displayed factually

---

## Scenario 9: Baseline Plan Staleness (FR-019, FR-020)

**User Story**: As a user, I'm warned about stale baseline plans and blocked from adjusting very old ones.

### Setup (Manual Database Edit)
```sql
-- Set baseline plan created_at to 25 hours ago (>24h, <7d)
UPDATE agent_sessions
SET baseline_plan = jsonb_set(
  baseline_plan,
  '{created_at}',
  to_jsonb((NOW() - INTERVAL '25 hours')::text)
)
WHERE id = '<your_session_id>';
```

### Steps (>24 hours staleness)
1. Navigate to `/priorities`
2. Toggle a reflection
3. **Verify**: Warning message appears: "Plan is 25 hours old. Consider recalculating."
4. **Verify**: Adjustment still proceeds (warning, not error)

### Steps (>7 days staleness)
1. Update baseline_plan created_at to 8 days ago
2. Toggle a reflection
3. **Verify**: Error message appears: "Baseline plan too old (>7 days). Run full analysis."
4. **Verify**: Adjustment is BLOCKED (400 error from API)

### Expected Outcome
- [ ] >24h: Warning shown, adjustment allowed
- [ ] >7d: Error shown, adjustment blocked

---

## Performance Validation

### Adjustment Response Time (PR-001)

**Target**: <500ms (p95)

```bash
# Use browser DevTools → Network tab
# Toggle 5 reflections sequentially (after debounce)
# Record response times for /api/agent/adjust-priorities

# Expected distribution:
# p50: <200ms
# p95: <500ms
# p99: <1000ms
```

### Toggle UI Responsiveness (PR-002)

**Target**: <100ms

```bash
# Open browser DevTools → Performance tab
# Record interaction
# Click toggle switch
# Stop recording
# Verify UI update <100ms (before network request completes)
```

---

## Regression Checks

### Existing Functionality Preserved

- [ ] Reflections can still be created via Cmd+Shift+R
- [ ] Full agent re-run (POST /api/agent/prioritize) still works
- [ ] ReasoningTracePanel displays agent reasoning correctly
- [ ] Outcome statements still influence base priorities

### Data Integrity

- [ ] Toggling OFF does NOT delete reflection rows (append-only)
- [ ] Baseline plan is preserved after adjustment
- [ ] Adjusted plan is stored separately from baseline

---

## Edge Case Validation

### No Reflections Available
- [ ] Empty state displays correctly
- [ ] "Analyze Tasks" works without context (baseline only)

### All Reflections Toggled OFF
- [ ] Adjustment returns baseline plan unchanged
- [ ] No error occurs (valid state)

### No Baseline Plan Exists
- [ ] Adjustment blocked with clear error: "Run analysis first"
- [ ] User directed to run full agent analysis

---

## Success Criteria

**All scenarios PASS** when:
1. Context card is discoverable and functional
2. Toggle operations complete <500ms (95% of attempts)
3. Visual feedback is clear and accurate
4. Rollback works on failures
5. Data integrity maintained (append-only, baseline preserved)
6. Performance targets met

---

**Validation Date**: _____________
**Tester**: _____________
**Pass/Fail**: _____________
**Notes**: _____________
