# UI Implementation: T003 Dashboard Page

## Components Needed
- `app/dashboard/page.tsx`: Main dashboard page component (Server Component with Client interactivity)
- File card components for displaying document metadata
- Filter/sort controls
- Empty state component
- Loading skeleton component

## ShadCN Selection

**Individual Components** (no dashboard blocks available):
- **Card**: Display each document's metadata (CardHeader, CardTitle, CardDescription, CardContent)
- **Badge**: Show status and confidence score
- **Skeleton**: Loading state while fetching
- **Alert**: Empty state message
- **Tabs**: Filter by status (All/Completed/Failed/Review Required)
- **Select**: Sort dropdown (Date/Name/Confidence)
- **Button**: Expand/collapse cards
- **Separator**: Visual separation between sections

## Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard Header                                           │
│  ┌──────────────┐  ┌────────────────────────────┐          │
│  │ Filter Tabs  │  │ Sort Select ▼              │          │
│  └──────────────┘  └────────────────────────────┘          │
├─────────────────────────────────────────────────────────────┤
│  Grid Layout (responsive: 1 col mobile, 2 col tablet, 3 xl)│
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ File Card 1  │  │ File Card 2  │  │ File Card 3  │     │
│  │  Name        │  │  Name        │  │  Name        │     │
│  │  Size • Date │  │  Size • Date │  │  Size • Date │     │
│  │  [Status]    │  │  [Status]    │  │  [Status]    │     │
│  │  Topics...   │  │  Topics...   │  │  Topics...   │     │
│  │  [Expand ▼]  │  │  [Expand ▼]  │  │  [Expand ▼]  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  (If expanded, show full summary inline)                   │
└─────────────────────────────────────────────────────────────┘
```

## Backend Integration
- Calls: `GET /api/documents` (from backend-engineer state file)
- Data flow:
  1. Page loads → fetch documents
  2. User changes filter → fetch with ?status=X
  3. User changes sort → fetch with ?sort=X&order=Y
  4. Response → update displayed cards
  5. User clicks card → expand to show full summary

## User Interaction Flow
1. User navigates to `/dashboard`
2. Loading skeletons appear
3. Component fetches `GET /api/documents`
4. Grid of file cards renders with metadata
5. User clicks filter tab (e.g., "Completed")
6. Component re-fetches with `?status=completed`
7. Grid updates to show only completed files
8. User clicks sort dropdown (e.g., "Confidence")
9. Component re-fetches with `?sort=confidence&order=asc`
10. Cards re-order by confidence
11. User clicks "Expand" on a card
12. Full summary (topics, decisions, actions, LNO tasks) displays inline
13. User clicks "Collapse" to hide details

## Accessibility Plan
- **Keyboard navigation**:
  - Tab through filter tabs
  - Tab through sort dropdown
  - Tab through card expand buttons
  - Enter/Space to activate buttons
  - Arrow keys for Tabs navigation
- **Screen reader**:
  - ARIA labels on filter tabs: "Filter by status: All"
  - ARIA labels on sort select: "Sort documents by: Date"
  - ARIA labels on expand buttons: "Expand document details for [filename]"
  - ARIA live region for status updates: "Showing X documents"
  - Proper heading hierarchy (h1 for page, h2 for cards)
- **Focus management**:
  - Focus stays on active filter tab
  - Focus returns to expand button after collapse
  - Visible focus indicators on all interactive elements
- **Color contrast**: Status badges meet 3:1 ratio, text meets 4.5:1 ratio

## Responsive Design
- **Mobile (< 640px)**: 1 column grid, stacked filters
- **Tablet (640px - 1024px)**: 2 column grid, horizontal filters
- **Desktop (> 1024px)**: 3 column grid, horizontal filters
- **Touch targets**: Minimum 44x44px for all buttons

## Test Plan
- **Render tests**:
  - Dashboard page renders without errors
  - Shows loading skeletons initially
  - Displays file cards after data loads
  - Shows empty state when no documents
- **Interaction tests**:
  - Clicking filter tab updates displayed documents
  - Changing sort dropdown re-orders cards
  - Clicking expand button shows full summary
  - Clicking collapse button hides summary
- **Integration tests**:
  - Fetches documents from /api/documents on mount
  - Passes correct query params for filter/sort
  - Handles empty response gracefully
  - Handles API error gracefully
- **Accessibility tests**:
  - All interactive elements keyboard accessible
  - ARIA labels present on key elements
  - Focus indicators visible
  - Screen reader announcements work
- **Edge cases**:
  - No documents uploaded yet (empty state)
  - All documents same status (filter shows all)
  - Document with no summary (processing status)
  - Very long file names (truncation)
  - Many documents (performance check)

## State Management
- Client-side state for:
  - Current filter selection
  - Current sort field and order
  - Expanded card IDs (Set<string>)
  - Loading state
  - Error state
- No global state needed (local component state sufficient)

## Error Handling
- API error → Show error alert with retry button
- Empty results → Show friendly empty state with upload prompt
- Loading → Show skeleton cards (3 minimum)
- Network error → Show retry button with error message

## Performance Considerations
- Use Server Component for initial render
- Client Component only for interactive filters/sort/expand
- Virtualization not needed for P0 (expect < 100 documents)
- Debounce filter/sort changes if needed (300ms)
