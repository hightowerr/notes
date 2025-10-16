# Quickstart: Context-Aware Action Extraction Manual Testing

## Prerequisites

- Development server running (`npm run dev`)
- Supabase migrations applied (including 005_add_context_fields.sql)
- OpenAI API key configured
- Test documents ready (PDF/DOCX with 10+ action items)

## Test Scenario 1: Set Context via Outcome Builder

**Objective**: Verify state and capacity fields persist correctly

### Steps:
1. Navigate to home page (http://localhost:3000)
2. Click "Set Outcome" button
3. Fill outcome form:
   - Direction: "Increase"
   - Object: "monthly recurring revenue"
   - Metric: "25% within 6 months"
   - Clarifier: "enterprise customer acquisition"
4. **NEW**: Select state: "Low energy"
5. **NEW**: Enter capacity: "2" (hours/day)
6. Click "Save"

### Expected Results:
- ✅ Outcome banner displays assembled text
- ✅ Banner shows state: "Low energy" (new)
- ✅ Banner shows capacity: "2h/day" (new)
- ✅ Reload page → state + capacity persist
- ✅ Database check: `user_outcomes` row has `state_preference='Low energy'`, `daily_capacity_hours=2.0`

---

## Test Scenario 2: Upload Document with Context

**Objective**: Verify filtering reduces action list from 15+ to 3-5

### Preparation:
- Use test document with ~15 mixed actions (some sales-related, some not)
- Outcome set to "Increase revenue" (from Scenario 1)
- State: "Low energy", Capacity: "2 hours"

### Steps:
1. Upload test document via drag-and-drop
2. Wait for processing (≤8 seconds)
3. Observe SummaryPanel

### Expected Results:
- ✅ Only 3-5 actions displayed (down from 15)
- ✅ Displayed actions are:
  - Semantically related to "increase revenue"
  - Low-effort (state is "Low energy")
  - Total time ≤2 hours (capacity constraint)
- ✅ "Show all 15 actions" button appears
- ✅ Each action shows estimated time (e.g., "1.5h")
- ✅ Database check: `filtering_decisions` JSON contains 15 total, ~10 excluded

---

## Test Scenario 3: View Unfiltered List ("Show All")

**Objective**: Verify "show all" reveals complete unfiltered action list

### Steps:
1. After Scenario 2, click "Show all 15 actions" button
2. Observe expanded list

### Expected Results:
- ✅ All 15 actions now visible
- ✅ Filtered actions (3-5) marked/highlighted differently
- ✅ Excluded actions show exclusion reason:
  - "Below 90% relevance" (e.g., "Plan team lunch")
  - "Exceeds capacity" (e.g., "Redesign website - 6h")
- ✅ Button toggles to "Show filtered (3-5)"
- ✅ Click toggle → returns to filtered view

---

## Test Scenario 4: Change Context Mid-Session

**Objective**: Verify changing state/capacity produces different filtered results

### Steps:
1. Edit outcome (click banner)
2. Change state to "Energized"
3. Change capacity to "6" hours
4. Save
5. Upload SAME document from Scenario 2

### Expected Results:
- ✅ Different action set displayed
- ✅ More actions shown (capacity increased 2h → 6h)
- ✅ Higher-effort actions included (state is "Energized")
- ✅ Example: "Redesign website - 6h" now included (was excluded before)
- ✅ Database: New `filtering_decisions` with updated context snapshot

---

## Test Scenario 5: Backward Compatibility (No Outcome)

**Objective**: Verify system works without outcome (no filtering)

### Steps:
1. Delete outcome statement (banner → "Delete")
2. Upload document

### Expected Results:
- ✅ All actions displayed (no filtering applied)
- ✅ NO "Show all" button (nothing to toggle)
- ✅ Actions still show estimated time/effort (AI always computes these)
- ✅ Database: `filtering_decisions` is NULL
- ✅ Processing completes in <8s (no embedding overhead)

---

## Test Scenario 6: Edge Case - No Actions Meet Threshold

**Objective**: Verify graceful handling when no actions ≥90% relevance

### Preparation:
- Set outcome: "Learn quantum physics"
- Upload document about sales metrics (no physics-related actions)

### Steps:
1. Upload document
2. Wait for processing

### Expected Results:
- ✅ Warning message: "No actions align with your outcome. Try adjusting your outcome or view all extracted actions."
- ✅ "Show all X actions" button available immediately
- ✅ Click "Show all" → See unfiltered list with low relevance scores
- ✅ Database: `filtering_decisions.included` = empty array

---

## Test Scenario 7: Edge Case - All Actions Exceed Capacity

**Objective**: Verify handling when all actions require >capacity hours

### Preparation:
- Set capacity: "0.5" hours (30 min)
- Upload document with only complex actions (each 2-4 hours)

### Steps:
1. Upload document
2. Wait for processing

### Expected Results:
- ✅ Warning message: "No actions fit within your 0.5h capacity. Consider increasing capacity or breaking down complex tasks."
- ✅ Top 1-2 highest-relevance actions shown (even though they exceed capacity)
- ✅ Actions marked with overflow warning icon
- ✅ Total time displayed: "3.5h / 0.5h capacity"

---

## Acceptance Criteria Checklist

- [ ] State field accepts only "Energized" | "Low energy" (rejects invalid)
- [ ] Capacity field validates 0.25-24 range (rejects 0, 25, negative)
- [ ] Filtering reduces 15+ actions to 3-5 when context set
- [ ] Backward compat: No outcome = no filtering (all actions shown)
- [ ] "Show all" toggle works bidirectionally
- [ ] Different state/capacity produces different filtered results
- [ ] Processing time remains <8s (with filtering overhead)
- [ ] Filtering decisions logged to database (JSON structure valid)
- [ ] Estimated time displayed for each action
- [ ] Low energy prioritizes low-effort, Energized prioritizes high-effort

---

## Debug Checks

**If filtering not working**:
1. Check `user_outcomes` has `state_preference` and `daily_capacity_hours` NOT NULL
2. Check AI response includes `relevance_score`, `estimated_hours`, `effort_level`
3. Check console logs for filtering decisions
4. Check `processed_documents.filtering_decisions` JSON structure

**If embeddings fail**:
1. Verify OPENAI_API_KEY in .env.local
2. Check console for API errors
3. Fallback should trigger: actions still extracted, no filtering applied

**If UI doesn't show new fields**:
1. Clear browser cache (hard reload)
2. Check OutcomeBuilder.tsx has state/capacity inputs
3. Check form validation schema updated (Zod)

---

## Performance Validation

Run with Chrome DevTools Performance tab:

- **Target**: Total processing time <8s
- **Breakdown**:
  - File upload: <1s
  - Text extraction: 2-4s
  - AI summarization + scoring: 3-5s
  - Filtering: <0.5s
  - Database write: <0.5s

**If >8s**: Check embedding API latency, consider caching outcome embedding.
