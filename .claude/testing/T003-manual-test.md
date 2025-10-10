# Manual Test: T003 Dashboard View

## Reason for Manual Testing
Contract tests require a running Next.js development server. Component tests pass for rendering, but interaction tests with real API integration need manual verification.

## Prerequisites
- Development server running (`npm run dev`)
- At least 3 files uploaded via T001 and processed via T002
  - 1 completed file (confidence > 0.8)
  - 1 review_required file (confidence < 0.8)
  - 1 processing file (optional)
- Database populated with test data

## Test Steps

### 1. Basic Rendering
**Action**: Navigate to http://localhost:3000/dashboard
**Expected Result**:
- Page loads without errors
- "Document Dashboard" heading visible 
- Filter tabs displayed (All, Completed, Processing, Review Required, Failed)
- Sort dropdown visible with options (Date, Name, Confidence, Size)
- Sort order toggle button visible (↓)
- Document count shows "Showing X documents"
- Grid layout displays file cards (3 columns on desktop, 2 on tablet, 1 on mobile)

### 2. Document Cards Display
**Action**: Observe the file cards
**Expected Result** for each card:
- File name displayed (truncated if too long)
- File size and upload date shown
- Status badge visible (color-coded: green for completed, yellow for review_required, etc.)
- Confidence badge shown for processed files (percentage)
- Quick preview of topics (first 3) visible
- "Expand ▼" button present for completed files
- "Processing in progress..." shown for processing files

### 3. Filter by Status - Completed
**Action**: Click "Completed" filter tab
**Expected Result**:
- URL updates to include ?status=completed
- Only completed files displayed
- All cards show green "completed" status badge
- All cards show confidence ≥ 80%
- Document count updates to show filtered count
- Grid re-renders with only matching documents

### 4. Filter by Status - Review Required
**Action**: Click "Review Required" filter tab
**Expected Result**:
- URL updates to include ?status=review_required
- Only review_required files displayed
- All cards show yellow/orange status badge
- All cards show confidence < 80%
- If no review_required files exist, empty state shown
- Document count updates

### 5. Filter by Status - Processing
**Action**: Click "Processing" filter tab
**Expected Result**:
- Only processing files displayed
- Cards show "Processing in progress..." message
- No summary data visible
- No expand button present
- If no processing files, empty state shown

### 6. Filter by Status - All (Reset)
**Action**: Click "All" filter tab
**Expected Result**:
- All files displayed again
- URL returns to /dashboard (no status query param)
- Mix of statuses visible
- Document count shows total

### 7. Sort by Date (Default)
**Action**: Verify default sort
**Expected Result**:
- Files sorted by upload date, newest first
- Most recently uploaded file at top-left
- Oldest file at bottom-right
- Sort dropdown shows "Sort by Date"
- Sort order button shows ↓ (descending)

### 8. Sort by Name Ascending
**Action**:
1. Select "Sort by Name" from dropdown
2. Click sort order button to change to ↑
**Expected Result**:
- Files re-order alphabetically (A-Z)
- File starting with "a" or "A" appears first
- File starting with "z" or "Z" appears last
- Sort order button shows ↑ (ascending)

### 9. Sort by Confidence Ascending
**Action**:
1. Select "Sort by Confidence" from dropdown
2. Ensure sort order is ascending (↑)
**Expected Result**:
- Files with lowest confidence appear first
- Files without confidence (processing) appear at end or beginning
- Highest confidence files at bottom
- Order visually verifiable by confidence badges

### 10. Sort by Size Descending
**Action**:
1. Select "Sort by Size" from dropdown
2. Click sort order button to descending (↓)
**Expected Result**:
- Largest files appear first
- Smallest files appear last
- File sizes in descending order

### 11. Expand Card to Show Full Summary
**Action**: Click "Expand ▼" button on a completed file card
**Expected Result**:
- Card expands vertically
- Full summary displays:
  - All topics shown as badges (not just first 3)
  - Decisions section with bullet list
  - Actions section with bullet list
  - LNO Task Classification section with 3 subsections:
    - Leverage tasks (green color)
    - Neutral tasks (blue color)
    - Overhead tasks (orange color)
  - Processing time shown at bottom
- Button text changes to "Collapse ▲"
- Other cards remain collapsed

### 12. Collapse Card
**Action**: Click "Collapse ▲" button on expanded card
**Expected Result**:
- Card shrinks back to preview size
- Only first 3 topics visible again
- Decisions, actions, and LNO sections hidden
- Button text changes to "Expand ▼"

### 13. Empty State
**Action**:
1. Clear all documents from database OR
2. Filter by a status with no documents
**Expected Result**:
- No file cards displayed
- Empty state alert shown with message:
  - "No documents found"
  - "Upload your first document to get started" (if no files at all)
  - "No documents with status: [filter]" (if filtered)
- "Upload Document" button visible
- Clicking button navigates to home page

### 14. Loading State
**Action**: Refresh page and observe quickly
**Expected Result**:
- 3 skeleton cards appear while loading
- Skeleton shows placeholder for header and content
- After data loads, skeletons replaced with real cards

### 15. Error Handling
**Action**: Stop database or cause API error
**Expected Result**:
- Error alert displayed
- Error message shown ("Error loading documents")
- "Retry" button visible
- Clicking retry re-attempts fetch

### 16. Keyboard Navigation
**Action**: Use Tab key to navigate
**Expected Result**:
- Tab focuses on filter tabs
- Arrow keys switch between filter tabs
- Tab focuses on sort dropdown
- Enter opens dropdown
- Arrow keys navigate options
- Tab focuses on sort order button
- Tab focuses on first "Expand" button
- Tab cycles through all expand buttons
- All focus indicators clearly visible

### 17. Screen Reader Accessibility
**Action**: Use screen reader (VoiceOver, NVDA, or JAWS)
**Expected Result**:
- Page title announced: "Document Dashboard"
- Filter tabs announced with labels
- Sort controls announced with current selection
- Document count announced: "Showing X documents"
- Each card announced with file name and status
- Expand buttons announced: "Expand document details for [filename]"

### 18. Responsive Design - Mobile
**Action**: Resize browser to mobile width (< 640px)
**Expected Result**:
- Single column grid layout
- Filter tabs stack vertically or scroll horizontally
- Sort controls remain accessible
- Cards full-width
- All content readable and accessible
- Touch targets large enough (44x44px minimum)

### 19. Responsive Design - Tablet
**Action**: Resize browser to tablet width (640px - 1024px)
**Expected Result**:
- Two column grid layout
- Filters and sort controls horizontal
- Cards resize appropriately
- No horizontal scrolling

### 20. Responsive Design - Desktop
**Action**: View on desktop (> 1024px)
**Expected Result**:
- Three column grid layout (xl breakpoint)
- All controls horizontal
- Maximum use of screen space
- Cards evenly distributed

### 21. Dark Mode
**Action**: Toggle dark mode (if theme switcher present)
**Expected Result**:
- Page background dark
- Text light colored
- Cards have dark background
- Status badges maintain contrast
- LNO task colors (green, blue, orange) remain distinguishable
- All text meets 4.5:1 contrast ratio

## Acceptance Criteria
- [ ] All 21 test scenarios pass
- [ ] No console errors
- [ ] No accessibility violations
- [ ] User can filter documents by status
- [ ] User can sort documents by multiple fields
- [ ] User can expand/collapse cards to view summaries
- [ ] Empty state handles no documents gracefully
- [ ] Loading state shows skeletons
- [ ] Error state shows retry option
- [ ] Keyboard navigation works throughout
- [ ] Screen reader announces all content
- [ ] Responsive on all screen sizes
- [ ] Dark mode supported

## Edge Cases to Test
- File with very long name (truncation)
- File with no topics (empty array)
- File with 50+ topics (display all when expanded)
- Multiple files with same confidence (stable sort)
- File with 0% confidence
- File with 100% confidence
- Processing file with no summary
- Failed file with no summary
- Database with 100+ documents (performance)

## Results
**Tested by**: [Name]
**Date**: [Date]
**Status**: PENDING
**Notes**: [Any observations, issues, or deviations from expected behavior]
