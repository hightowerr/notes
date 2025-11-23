# Manual Test: Gap Detection Modal Redesign

## Task
Redesigned Gap Detection Modal for better desktop and mobile UX

## Reason for Manual Testing
- Complex modal interaction patterns require visual verification
- Responsive behavior needs testing across actual viewport sizes
- Tab/pagination switching best verified in browser
- ScrollArea behavior needs visual confirmation

## Prerequisites
- Development server running (`pnpm dev`)
- Access to http://localhost:3000/priorities
- Existing prioritized plan with gaps between tasks
- Browser DevTools for responsive testing

## Desktop Test Steps (≥768px)

### 1. Open Gap Analysis Modal
**Action:** Click "Detect Gaps" button on priorities page
**Expected:**
- Modal opens with centered dialog
- "Gap Analysis" title visible
- Description text visible
- Progress indicator shows 0/X gaps reviewed

### 2. Verify Progress Indicator
**Action:** Review the progress section at top of modal
**Expected:**
- Shows "Progress: 0 of X gaps reviewed"
- Progress bar displays 0% initially
- Updates as you review gaps (manual verification needed)

### 3. Verify Tabs Navigation (Desktop)
**Action:** Click through each tab ("Gap 1", "Gap 2", "Gap 3", etc.)
**Expected:**
- Tabs render horizontally in a row
- Active tab has different background color
- Clicking tab switches gap content below
- Content scrolls smoothly in ScrollArea
- Tab overflow handled with scroll if many gaps (6+)

### 4. Verify Gap Content Display
**Action:** Review content for each gap
**Expected:**
- Clear header: "Gap between [Task A] → [Task B]"
- Confidence percentage and detection timestamp
- Indicator badges (Time gap, Workflow jump, etc.)
- Horizontal separator below header
- Bridging task cards listed below

### 5. Verify ScrollArea Behavior
**Action:** If content is long, scroll within modal body
**Expected:**
- Content scrolls smoothly
- Header stays fixed at top
- Footer stays fixed at bottom
- Only middle section scrolls
- Custom scrollbar visible on right

### 6. Verify Task Selection
**Action:** Toggle checkboxes on bridging task cards
**Expected:**
- Checkbox toggles on/off
- Selection count updates in footer (e.g., "3 tasks selected")
- Count updates immediately
- ARIA live region announces change (verify with screen reader)

### 7. Verify Task Editing
**Action:** Edit task description and hours
**Expected:**
- Textarea expands for long text
- Hours input accepts numbers only
- Changes reflect immediately
- No console errors

### 8. Verify Footer Actions
**Action:** Interact with Cancel and Accept buttons
**Expected:**
- Cancel always enabled (unless accepting)
- Accept enabled only when tasks selected
- Accept disabled when no tasks selected
- Loading spinner appears during acceptance
- Footer visible at bottom (sticky)

### 9. Verify Error Handling
**Action:** Trigger acceptance error (if possible)
**Expected:**
- Red Alert box appears in footer
- Error message displayed clearly
- Details list shown if available
- Accept button re-enabled after error

## Mobile Test Steps (<768px)

### 10. Resize to Mobile Viewport
**Action:** Open DevTools → Toggle device toolbar → Select mobile device
**Expected:**
- Layout adjusts automatically
- No horizontal scroll
- Touch-friendly button sizes (≥44px)

### 11. Verify Mobile Pagination
**Action:** Review pagination controls
**Expected:**
- Prev/Next buttons visible
- Current gap indicator: "Gap 1 of 3"
- Prev disabled on first gap
- Next disabled on last gap
- Buttons have adequate touch target size

### 12. Verify Mobile Navigation
**Action:** Click Next button multiple times
**Expected:**
- Gap content switches
- Indicator updates (Gap 2 of 3, Gap 3 of 3, etc.)
- ScrollArea resets to top for new gap
- No tabs visible (hidden on mobile)

### 13. Verify Mobile Footer
**Action:** Scroll to bottom of modal
**Expected:**
- Footer buttons stack vertically on small screens
- Selection count above buttons
- Adequate spacing between elements
- Easy to tap buttons

## Keyboard Accessibility Tests

### 14. Keyboard Navigation (Desktop)
**Action:** Use keyboard only to navigate
**Expected:**
- Tab key moves through interactive elements
- Arrow keys switch between tabs
- Space/Enter activates buttons
- Focus indicators visible on all elements
- Escape key closes modal

### 15. Keyboard Navigation (Mobile)
**Action:** Use keyboard on mobile viewport
**Expected:**
- Tab key moves to Prev/Next buttons
- Enter/Space activates pagination
- Focus management works correctly

## Screen Reader Tests

### 16. Screen Reader Announcements
**Action:** Use screen reader (VoiceOver, NVDA, JAWS)
**Expected:**
- Modal announced when opened
- Progress indicator: "Gap analysis progress: X of Y gaps reviewed"
- Tab labels: "Gap 1", "Gap 2", etc.
- Selection count updates announced (aria-live="polite")
- All buttons have descriptive labels

## Edge Case Tests

### 17. Single Gap
**Action:** Test with only 1 gap detected
**Expected:**
- Progress shows "1 of 1"
- Tabs still work (single tab)
- Mobile pagination: Next/Prev both disabled

### 18. Many Gaps (6+)
**Action:** Test with 6 or more gaps
**Expected:**
- Desktop: Tabs overflow with horizontal scroll
- Mobile: Pagination works smoothly
- No performance issues

### 19. No Gaps Detected
**Action:** Test with no gaps
**Expected:**
- Empty state message: "Your plan is complete — no gaps detected"
- No tabs or pagination
- Only Cancel button enabled

### 20. Long Task Descriptions
**Action:** Review gaps with very long task names
**Expected:**
- Text wraps properly (break-words)
- No overflow issues
- ScrollArea handles long content

### 21. Manual Examples Required
**Action:** Trigger "requires_examples" state
**Expected:**
- Alert shown: "No similar tasks found"
- Two input fields visible
- Generate button disabled until 10+ chars entered
- Skip button always enabled

## Acceptance Criteria Checklist

- [ ] **Desktop**: Tabs render and switch between gaps smoothly
- [ ] **Mobile**: Prev/Next pagination works without tabs
- [ ] **Progress**: Indicator shows X of Y with percentage
- [ ] **ScrollArea**: Content scrolls smoothly, header/footer fixed
- [ ] **Selection**: Checkbox toggles update count immediately
- [ ] **Editing**: Task text and hours editable inline
- [ ] **Footer**: Cancel and Accept buttons always accessible
- [ ] **Errors**: Acceptance errors display with details
- [ ] **Keyboard**: Full keyboard navigation support
- [ ] **Screen Reader**: Proper ARIA labels and live regions
- [ ] **Responsive**: Layout adapts at 768px breakpoint
- [ ] **Touch**: Minimum 44px touch targets on mobile
- [ ] **Performance**: No lag switching gaps or scrolling
- [ ] **No Breaking Changes**: All existing props/callbacks work

## Browser Compatibility

Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

## Results

**Tested by**: _______________
**Date**: _______________
**Browser**: _______________
**Viewport sizes tested**: _______________

**Status**: PASS / FAIL

**Notes**:
-
-
-

**Issues Found**:
1.
2.
3.

**Screenshots** (if issues found):
-
