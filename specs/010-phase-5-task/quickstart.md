# Quickstart Guide: Task Gap Filling

**Feature**: Task Gap Filling
**Branch**: `010-phase-5-task`
**Date**: 2025-10-28

## Prerequisites

Before testing this feature, ensure:
- [ ] Database migrations applied (task_embeddings and task_relationships tables exist)
- [ ] At least 5-10 tasks exist in task_embeddings with varied time gaps and descriptions
- [ ] OpenAI API key configured in .env.local
- [ ] Development server running (`pnpm dev`)

## Test Scenario 1: Happy Path - Gap Detection and Acceptance

**Goal**: Detect gaps in a task list, generate suggestions, and accept one bridging task.

### Setup
1. Navigate to http://localhost:3000/priorities
2. Verify you see an existing prioritized task list
3. Ensure list has at least 3 tasks with noticeable gaps (e.g., "Design mockups" → "Launch app")

### Steps

1. **Trigger Gap Detection**
   - Click "Find Missing Tasks" button on priorities page
   - **Expected**: Modal opens with "Analyzing..." loading state
   - **Verify**: Loading state lasts <2 seconds for 10-20 tasks

2. **Review Gap Detection Results**
   - **Expected**: Modal shows one of:
     - "No gaps detected" (if all tasks are well-connected)
     - "3 Tasks Suggested to Fill Gaps" (if gaps found)
   - **Verify**: If gaps detected:
     - 1-3 gaps shown (never more than 3)
     - Each gap shows predecessor → successor context
     - Each suggestion has confidence score ≥0.7

3. **Review Bridging Task Suggestion**
   - **Expected**: Each bridging task card displays:
     - Pre-checked checkbox
     - Task description (10-500 chars)
     - Estimated hours (8-160 range)
     - Cognition level badge (low/medium/high)
     - Confidence score (0.70-1.00)
     - Reasoning explanation (why this task is needed)
   - **Verify**: All fields are populated and realistic

4. **Edit Suggestion (Optional)**
   - Click on task description → **Expected**: Inline editable text area appears
   - Modify description: "Build app frontend" → "Build mobile app frontend with React Native"
   - Click on estimated hours → **Expected**: Number input appears
   - Modify hours: 80 → 96
   - **Verify**: Edits are reflected immediately in UI

5. **Accept Selected Tasks**
   - Uncheck one suggestion (to test partial acceptance)
   - Click "Accept Selected" button
   - **Expected**:
     - Modal closes
     - Task list refreshes
     - Accepted tasks appear in correct sequence
     - Dependency arrows show predecessor → bridging → successor
   - **Verify**:
     - Database: `SELECT * FROM task_embeddings WHERE source = 'ai_generated'` shows new task
     - Database: `SELECT * FROM task_relationships WHERE predecessor_id = '[bridging_task_id]'` shows 2 relationships

6. **Verify Integration**
   - Check priorities page for updated task list
   - **Expected**: Bridging task appears between predecessor and successor
   - **Verify**: Task can be reordered, marked complete, etc. (same behavior as extracted tasks)

### Success Criteria
- [ ] Gap detection completes in <2s for 20 tasks
- [ ] Suggestions have ≥70% average confidence
- [ ] Accepted tasks appear in correct position
- [ ] Dependencies are correctly established
- [ ] No console errors during flow

---

## Test Scenario 2: No Gaps Detected

**Goal**: Verify graceful handling when no gaps exist.

### Setup
Create a well-connected task list with no logical gaps (e.g., sequential tasks with clear dependencies).

### Steps
1. Click "Find Missing Tasks" button
2. **Expected**: Modal shows "Your plan is complete - no gaps detected"
3. **Verify**: No suggestions displayed, only success message and "Close" button

### Success Criteria
- [ ] Modal displays success message
- [ ] No errors logged
- [ ] User can close modal and continue working

---

## Test Scenario 3: Zero Semantic Search Results

**Goal**: Handle case where no similar historical tasks exist.

### Setup
Create a task list in a novel domain (e.g., quantum computing) with minimal historical data.

### Steps
1. Click "Find Missing Tasks" button
2. **Expected**: Modal shows "No similar tasks found" prompt
3. Provide 1-2 manual examples:
   - "Implement quantum circuit simulator"
   - "Optimize qubit error correction"
4. Click "Generate with Examples"
5. **Expected**: Suggestions generated using manual examples as context
6. **Verify**: Confidence scores may be lower (0.5-0.7 acceptable)

### Alternative: Skip Manual Examples
1. Click "Generate Anyway" (without providing examples)
2. **Expected**: Suggestions generated with lower confidence (<0.7)
3. **Verify**: Tasks are marked with lower confidence indicator

### Success Criteria
- [ ] Prompt displays when semantic search returns 0 results
- [ ] Manual examples are accepted and used
- [ ] Skip option works and flags lower confidence
- [ ] Generated tasks are still relevant to gap

---

## Test Scenario 4: AI Generation Failure

**Goal**: Verify retry handling for AI timeouts/errors.

### Setup
1. Temporarily set `OPENAI_API_KEY` to invalid value in .env.local
2. Restart dev server

### Steps
1. Click "Find Missing Tasks" button
2. Proceed to generation step
3. **Expected**: Error message appears: "Failed to generate suggestions. Please try again."
4. **Verify**: "Try Again" button is visible
5. Restore correct API key, click "Try Again"
6. **Expected**: Generation succeeds on retry

### Success Criteria
- [ ] Clear error message displayed
- [ ] Retry button functional
- [ ] No automatic retries (user-initiated only)
- [ ] Logs show failure reason

---

## Test Scenario 5: Circular Dependency Detection

**Goal**: Verify cycle prevention during task insertion.

### Setup
Create a task list with potential for circular dependencies:
- Task A → Task B → Task C
- Attempt to insert bridging task between C and A (would create C → Bridging → A cycle)

### Steps
1. Manually trigger gap detection between Task C and Task A
2. Accept generated bridging task
3. **Expected**: Error modal appears:
   - "Circular dependency detected: cannot insert task"
   - Explanation: "Task creates cycle: A → B → C → A"
4. **Verify**: No database changes occur, task list unchanged

### Success Criteria
- [ ] Cycle detected before insertion
- [ ] Clear error message explaining cycle
- [ ] Database integrity maintained (no partial writes)
- [ ] User can dismiss error and try different tasks

---

## Test Scenario 6: Duplicate Task Detection

**Goal**: Verify duplicate prevention during task insertion.

### Setup
Create existing task: "Build mobile app frontend"

### Steps
1. Trigger gap detection that generates suggestion: "Create mobile app UI"
2. Accept suggestion
3. **Expected**: Error modal appears:
   - "Duplicate task detected"
   - Explanation: "Task 'Create mobile app UI' duplicates existing task 'Build mobile app frontend' (similarity: 0.94)"
4. **Verify**: Task not inserted, user can edit description to differentiate

### Success Criteria
- [ ] Semantic similarity check runs before insertion
- [ ] Duplicates rejected at >0.9 similarity threshold
- [ ] Clear error message with existing task reference
- [ ] User can edit and retry

---

## Test Scenario 7: Edit Before Acceptance

**Goal**: Verify user edits are preserved during insertion.

### Steps
1. Generate bridging task with description "Build app" and 40 hours estimate
2. Edit description to "Build mobile app with authentication"
3. Edit estimate to 60 hours
4. Accept task
5. **Expected**:
   - Database: `task_embeddings.text = 'Build mobile app with authentication'`
   - Database: `task_embeddings.estimated_hours = 60`
   - Metadata: Original values stored for audit trail

### Success Criteria
- [ ] Edits preserved in database
- [ ] Original values stored in metadata
- [ ] UI reflects edited values
- [ ] No data loss during insertion

---

## Test Scenario 8: Parallel Gap Processing

**Goal**: Verify multiple gaps are processed in parallel.

### Setup
Create task list with 3 distinct gaps.

### Steps
1. Click "Find Missing Tasks"
2. **Expected**: All 3 gaps processed simultaneously
3. Monitor network tab: **Verify** 3 concurrent `/api/gaps/generate` calls
4. **Expected**: Total time ≈ max(individual times), not sum
5. **Verify**: All suggestions displayed after completion

### Success Criteria
- [ ] Parallel processing occurs (not sequential)
- [ ] Total time <6s for 3 gaps
- [ ] All results displayed correctly
- [ ] No race conditions or errors

---

## Performance Benchmarks

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Gap detection | <100ms (p95) | Check browser DevTools Network tab for `/api/gaps/detect` |
| Task generation per gap | <5s (p95) | Check Network tab for `/api/gaps/generate` |
| Task insertion | <500ms (p95) | Check Network tab for `/api/gaps/accept` |
| False positive rate | <20% | Manual review: count gaps that user dismisses without accepting any tasks |
| User acceptance rate | ≥60% | Track: accepted tasks / suggested tasks across sessions |

---

## Manual Validation Checklist

After completing all scenarios:

- [ ] No console errors during entire flow
- [ ] All API responses match contract schemas
- [ ] Database constraints enforced (no orphaned relationships)
- [ ] UI is responsive (no janky animations or freezes)
- [ ] Error messages are user-friendly (no stack traces)
- [ ] Logging captures gap_count, generation_latency_ms, acceptance_rate
- [ ] Mobile view works (modal is full-screen, cards stack vertically)

---

## Troubleshooting

### Issue: Gap detection returns empty array
**Solution**: Verify tasks have varied timestamps and descriptions. Manually inspect indicators logic.

### Issue: Semantic search returns 422 error
**Solution**: Check that task_embeddings table has embeddings generated. Run embedding service if needed.

### Issue: AI generation always fails
**Solution**: Verify `OPENAI_API_KEY` is valid, check OpenAI account has credits.

### Issue: Circular dependency false positives
**Solution**: Check task_relationships table for existing cycles. Run topological sort manually to debug.

### Issue: Duplicates not detected
**Solution**: Verify embeddings are generated for all tasks. Check similarity threshold (should be 0.9).

---

## Next Steps After Validation

1. Run contract tests: `pnpm test:run __tests__/contract/gaps-*.test.ts`
2. Run integration tests: `pnpm test:run __tests__/integration/gap-detection-flow.test.ts`
3. Measure performance benchmarks with realistic task corpus (50+ tasks)
4. Collect user feedback on suggestion quality
5. Iterate on heuristic thresholds if false positive rate >20%

---

**Quickstart Complete**: 2025-10-28
**Status**: Ready for implementation and testing
