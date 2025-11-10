# Quickstart: Manual Task Control & Discard Approval

**Feature**: 013-docs-shape-pitches
**Purpose**: Validate end-to-end feature functionality through user-testable scenarios

## Prerequisites

1. **Environment Setup**:
   ```bash
   # Ensure development server running
   pnpm dev
   # Navigate to http://localhost:3000/priorities
   ```

2. **Database State**:
   - Migration 024 applied (`is_manual` and `created_by` columns exist)
   - At least one active outcome configured
   - Existing tasks in the task list (for re-prioritization testing)

3. **Required Environment Variables**:
   ```
   OPENAI_API_KEY=sk-proj-...
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

## Test Scenario 1: Manual Task Creation

**User Story**: As a user, I can add a new task manually and see it automatically prioritized.

### Steps

1. **Navigate to Active Priorities**:
   - Open `/priorities` page
   - Verify "Active Priorities" section is visible

2. **Open Manual Task Modal**:
   - Click "+ Add Task" button in Active Priorities header
   - Verify modal opens with title "Add Task"

3. **Enter Task Details**:
   - Enter task text: "Email legal department about contract review"
   - Set estimated hours: 16
   - Click "Add Task" button

4. **Verify Optimistic UI**:
   - Task appears immediately in list with [MANUAL] badge
   - "Prioritizing..." indicator shows below task

5. **Wait for Re-Prioritization** (~5-10 seconds):
   - "Prioritizing..." indicator disappears
   - Task moves to its prioritized position in the list
   - Rank number appears (e.g., #3)

### Expected Results

✅ Task appears with [MANUAL] badge
✅ Task is automatically prioritized without manual trigger
✅ Task persists after page refresh
✅ Task appears in correct position based on agent's priority calculation

### Edge Case: Duplicate Detection

1. Try to add the same task again: "Email legal department about contract review"
2. **Expected**: Error message "Similar task already exists: [task name]"
3. Modal should NOT close, allowing user to modify the text

## Test Scenario 2: Inline Task Editing

**User Story**: As a user, I can edit a task description and see the changes reflected after re-prioritization.

### Steps

1. **Enter Edit Mode**:
   - Hover over any task in Active Priorities
   - Click the pencil icon (✏️)
   - Verify task text becomes editable

2. **Edit Task Text**:
   - Change text from "Implement authentication" to "Implement user authentication system"
   - Press Enter or click outside the field

3. **Verify Save State**:
   - Save spinner (💾) appears briefly
   - Success checkmark (✅) flashes for 1 second
   - Text updates to new value

4. **Wait for Re-Prioritization** (~5-10 seconds):
   - Task may move position if priority changes
   - Verify final position matches updated priority

### Expected Results

✅ Edit saves successfully
✅ Visual feedback shows save progress
✅ Re-prioritization triggered automatically
✅ Changes persist after page refresh

### Edge Case: Edit During Prioritization

1. Start editing a task
2. While typing, trigger re-prioritization (e.g., add another manual task)
3. **Expected**: Edit field becomes disabled with message "Editing disabled during prioritization"
4. After prioritization completes, edit field re-enables

## Test Scenario 3: Discard Approval Workflow

**User Story**: As a user, I can review and approve which tasks get removed during re-prioritization.

### Setup

1. Add 3 manual tasks:
   - "Email legal about contract"
   - "Update documentation"
   - "Schedule team meeting"

2. Trigger re-prioritization that will remove at least one task:
   - Add a reflection: "Focus only on high-priority items"
   - Click "Analyze Tasks"

### Steps

1. **Wait for Re-Prioritization** (~10-30 seconds for agent run)

2. **Review Discard Modal**:
   - Modal appears with title "Review Proposed Removals (X tasks)"
   - Each task shows:
     - Task title
     - Removal reason
     - Previous rank number
     - [MANUAL] badge if applicable
   - All tasks are checked by default (approved for discard)

3. **Selective Approval**:
   - **Uncheck** "Schedule team meeting" (keep this task)
   - **Keep checked** "Update documentation" (approve discard)
   - Click "Apply Changes (Discard 1)"

4. **Verify Results**:
   - "Update documentation" moves to Discarded section
   - "Schedule team meeting" remains in Active Priorities
   - Modal closes

### Expected Results

✅ Discard modal appears before any tasks are removed
✅ User can approve/reject each task individually
✅ Only approved tasks get discarded
✅ Rejected tasks stay in Active Priorities
✅ "Cancel All" button keeps all tasks active

### Edge Case: No Discards

1. If re-prioritization doesn't remove any tasks
2. **Expected**: No discard modal appears
3. Task list updates normally

## Test Scenario 4: Error Handling

### 4A: Manual Task with No Outcome

**Steps**:
1. Remove all active outcomes (or work in clean environment)
2. Add manual task: "Test task with no outcome"
3. **Expected**:
   - Task appears in list
   - NO re-prioritization triggered
   - No "Prioritizing..." indicator
   - Task appears at bottom of list (unranked)

### 4B: Edit Save Failure

**Simulate** (via network throttling or API mock):
1. Edit a task
2. Force API error (disconnect network briefly)
3. **Expected**:
   - Error toast appears: "Failed to save task"
   - Task text reverts to original
   - Edit mode exits

### 4C: Duplicate Task Creation

**Steps**:
1. Add manual task: "Review code changes"
2. Try adding: "Review the code changes for bugs"
3. **Expected**:
   - Error message: "Similar task already exists: Review code changes"
   - Similarity score shown: (0.92)
   - Original task highlighted in list
   - Modal stays open for user to modify text

## Performance Validation

### Timing Benchmarks

Use browser DevTools Performance tab or console timestamps:

1. **Manual Task → Prioritized**: <10 seconds (P95)
   ```javascript
   console.time('manual-task-flow');
   // Add manual task
   // Wait for final position
   console.timeEnd('manual-task-flow'); // Should be <10000ms
   ```

2. **Edit Save**: <500ms (P95)
   ```javascript
   console.time('edit-save');
   // Edit task text
   // Blur field
   console.timeEnd('edit-save'); // Should be <500ms
   ```

3. **Discard Modal Render**: <200ms
   - Check for lag when modal opens
   - Test with 50 discard candidates (stress test)

### Load Testing

1. Create 20 manual tasks rapidly (batch add)
2. Edit 10 tasks in quick succession
3. **Expected**: Debouncing prevents excessive API calls
4. Check Network tab: Should see consolidated API calls, not one per keystroke

## Integration Validation

### Database Verification

```sql
-- Check manual tasks created
SELECT task_id, task_text, is_manual, created_by, created_at
FROM task_embeddings
WHERE is_manual = TRUE
ORDER BY created_at DESC;

-- Verify manual task document
SELECT id, file_name, source
FROM processed_documents
WHERE source = 'manual';

-- Check embeddings generated
SELECT task_id, status, array_length(embedding, 1) as embedding_dimensions
FROM task_embeddings
WHERE is_manual = TRUE;
```

**Expected**:
- `is_manual = TRUE` for manually added tasks
- `created_by = 'default-user'`
- `embedding` is 1536-dimension array
- `document_id` references `manual-tasks-default-user` document

### Re-Prioritization Integration

1. Add manual task
2. Check `agent_sessions` table:
   ```sql
   SELECT id, created_at, prioritized_plan
   FROM agent_sessions
   ORDER BY created_at DESC
   LIMIT 1;
   ```
3. **Expected**: New session created with manual task included in `ordered_task_ids`

## Acceptance Criteria Checklist

### Manual Task Creation
- [ ] "+ Add Task" button visible in Active Priorities header
- [ ] Modal opens on click with form fields
- [ ] Task text validation (10-500 chars)
- [ ] Estimated hours validation (8-160 range)
- [ ] Draft auto-saves to localStorage
- [ ] Duplicate detection blocks similar tasks (>0.9 similarity)
- [ ] [MANUAL] badge appears on created tasks
- [ ] Re-prioritization triggers automatically (when outcome exists)
- [ ] Task appears in prioritized position within 10 seconds
- [ ] Task persists after page refresh

### Inline Editing
- [ ] Pencil icon appears on hover for all tasks
- [ ] Click enters edit mode (contentEditable or input)
- [ ] Auto-save on blur/Enter after 500ms
- [ ] Save spinner shows during API call
- [ ] Success checkmark flashes on completion
- [ ] Error toast on failure, text reverts
- [ ] Edit locked during re-prioritization
- [ ] Re-prioritization triggers after successful edit
- [ ] Changes persist after page refresh

### Discard Approval
- [ ] Modal appears when re-prioritization removes tasks
- [ ] All tasks default to "approve discard" (checked)
- [ ] User can uncheck to reject discard
- [ ] Task title, reason, and previous rank displayed
- [ ] [MANUAL] badge shows for manually created tasks
- [ ] "Apply Changes (Discard X)" button shows count
- [ ] "Cancel All" keeps all tasks active
- [ ] Only approved tasks move to Discarded section
- [ ] Rejected tasks stay in Active Priorities
- [ ] Modal closes after applying changes

### Performance
- [ ] Manual task → prioritized: <10s (P95)
- [ ] Edit save: <500ms (P95)
- [ ] Discard modal render: <200ms
- [ ] Debouncing prevents API spam (500ms delay)
- [ ] No re-prioritization loops observed

### Error Handling
- [ ] Duplicate task error shows clearly
- [ ] Edit failure reverts to original text
- [ ] No outcome = no re-prioritization (expected behavior)
- [ ] Network errors show user-friendly messages

## Known Limitations

1. **Desktop-First**: Inline editing optimized for desktop; mobile gets basic functionality
2. **Single User**: No collaborative editing conflict resolution
3. **No Undo**: Edit history not tracked (localStorage draft only)
4. **5-Minute Embedding Cache**: Minor edits may not regenerate embedding immediately

## Troubleshooting

### Task Not Prioritizing

**Check**:
- Active outcome exists
- `SUPABASE_SERVICE_ROLE_KEY` set in `.env.local`
- `/api/agent/prioritize` endpoint operational
- Check browser console for errors

### Edit Not Saving

**Check**:
- Network tab shows PATCH request to `/api/tasks/{id}`
- Response status code (403 = permission error, 500 = server error)
- Task exists in database
- User owns manual task (if applicable)

### Discard Modal Not Appearing

**Check**:
- Re-prioritization actually removed tasks (compare `ordered_task_ids`)
- No JavaScript errors in console
- `TaskList.tsx` state management working

## Next Steps

After successful quickstart validation:
1. Run automated contract tests (when created)
2. Execute integration tests
3. Review with stakeholders for UX feedback
4. Proceed to Phase 2: Task generation
