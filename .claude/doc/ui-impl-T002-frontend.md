# Frontend UI Implementation Plan - T002

**Task ID**: T002-frontend
**Agent**: frontend-ui-builder
**Date**: 2025-10-08

## User Story
As a knowledge worker, after uploading a note file, I can see an AI-generated summary with topics, decisions, actions, and LNO tasks appear automatically within 8 seconds without clicking anything.

## Implementation Scope

### 1. Components to Create

#### `app/components/SummaryPanel.tsx`
**Purpose**: Display AI-generated summary with structured data

**Props Interface**:
```typescript
interface SummaryPanelProps {
  summary: {
    topics: string[];
    decisions: string[];
    actions: string[];
    lno_tasks: {
      leverage: string[];
      neutral: string[];
      overhead: string[];
    };
  };
  confidence: number;
  filename: string;
  processingDuration: number;
}
```

**shadcn Components Used**:
- `Card` - Container for summary sections
- `Badge` - Topics display + confidence indicator
- `ScrollArea` - Scrollable lists for large data sets
- `Separator` - Visual dividers between sections

**Icons Used** (from lucide-react):
- `Lightbulb` - Topics
- `CheckCircle2` - Decisions
- `MoveRight` - Actions
- `ListTodo` - LNO Tasks
- `AlertCircle` - Low confidence warning

**Layout Structure**:
1. Header with filename and confidence badge
2. Topics section with badge chips
3. Decisions section with checkmarks
4. Actions section with arrow icons
5. LNO Tasks in 3-column grid (Leverage/Neutral/Overhead)

**Animations**:
- Slide-in from right when summary appears (`animate-in slide-in-from-right`)
- Fade-in for content (`fade-in`)

**Accessibility**:
- Semantic HTML with proper headings
- ARIA labels for icon-only elements
- Keyboard navigation support
- Screen reader announcements for status changes

**Responsiveness**:
- Mobile: Single column layout
- Tablet: 2-column for topics/decisions
- Desktop: 3-column for LNO tasks

### 2. Files to Modify

#### `app/page.tsx`
**Changes**:
1. Add status polling mechanism
   - `useEffect` hook with interval (every 2 seconds)
   - Call `/api/status/[fileId]` endpoint
   - Clear interval when status is 'completed', 'review_required', or 'failed'

2. State management updates:
   ```typescript
   interface UploadedFileInfo {
     // ... existing fields
     summary?: DocumentOutput;
     confidence?: number;
     processingDuration?: number;
   }
   ```

3. Status badge updates:
   - "Uploading" → gray with spinner
   - "Processing" → blue with spinner
   - "Complete" → green with checkmark
   - "Review Required" → yellow with warning icon
   - "Failed" → red with error icon

4. Toast notifications:
   - Install `sonner` package
   - Add `Toaster` component to layout
   - Show toast when summary is ready: "Summary ready for {filename}"

5. SummaryPanel integration:
   - Conditionally render when status is 'completed' or 'review_required'
   - Pass summary data, confidence, filename

### 3. TypeScript Types

**Import from schemas**:
```typescript
import type { DocumentOutput, StatusResponse } from '@/lib/schemas';
```

**New local types**:
```typescript
type FileUploadStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'review_required' | 'failed';

interface UploadedFileInfo {
  id: string;
  name: string;
  size: number;
  uploadedAt: number;
  status: FileUploadStatus;
  error?: string;
  summary?: DocumentOutput;
  confidence?: number;
  processingDuration?: number;
}
```

### 4. API Integration

**Status Polling Flow**:
```typescript
const pollStatus = async (fileId: string) => {
  const response = await fetch(`/api/status/${fileId}`);
  const data: StatusResponse = await response.json();

  // Update file status
  setData(prev => ({
    ...prev,
    files: prev.files.map(f =>
      f.id === fileId
        ? {
            ...f,
            status: data.status,
            summary: data.summary,
            confidence: data.confidence,
            processingDuration: data.processingDuration,
            error: data.error
          }
        : f
    )
  }));

  // Show toast notification when complete
  if (data.status === 'completed' || data.status === 'review_required') {
    toast.success(`Summary ready for ${filename}`);
  }

  // Return status to determine if polling should continue
  return data.status;
};
```

**Polling Pattern**:
- Start polling after successful upload
- Poll every 2 seconds
- Stop when status is terminal ('completed', 'review_required', 'failed')
- Clean up interval on component unmount

### 5. Design System Compliance

**Colors** (standard shadcn/Tailwind):
- Primary actions: `bg-primary text-primary-foreground`
- Success: `bg-green-600 hover:bg-green-700`
- Warning: `bg-yellow-600 hover:bg-yellow-700`
- Error: `bg-red-600 hover:bg-red-700`
- Neutral: `bg-secondary text-secondary-foreground`

**Spacing**:
- Consistent gap-3, gap-4, gap-6 for spacing
- Padding: p-3, p-4, p-6 for cards

**Typography**:
- Headers: text-xl font-semibold
- Subheaders: text-base font-medium
- Body: text-sm
- Captions: text-xs text-muted-foreground

### 6. Testing Strategy

**Component Tests** (`app/components/__tests__/SummaryPanel.test.tsx`):
- Renders all sections correctly
- Displays topics as badges
- Shows decisions with checkmarks
- Displays actions with icons
- Renders LNO tasks in 3 columns
- Shows "Review Required" badge when confidence < 0.8
- Handles empty arrays gracefully
- Applies correct animations

**Integration Tests** (`__tests__/integration/summary-display.test.tsx`):
- Upload file → status updates → summary appears
- Status badge changes: Uploading → Processing → Complete
- Toast notification appears when complete
- Summary panel slides in with data
- Polling stops after completion
- Error state displays correctly

**User Journey Test**:
1. User uploads file
2. Status badge shows "Processing" with spinner
3. Frontend polls `/api/status/[fileId]` every 2 seconds
4. After ~3-5 seconds, backend completes processing
5. Status badge changes to "Complete" with green checkmark
6. Toast notification: "Summary ready for sample-notes.pdf"
7. SummaryPanel slides in showing all extracted data
8. User can scroll through topics, decisions, actions, LNO tasks

### 7. Accessibility Requirements

- Semantic HTML: `<section>`, `<article>`, `<header>`
- Heading hierarchy: h2 → h3 → h4
- ARIA labels for icons: `aria-label="Processing status"`
- Live regions for status updates: `aria-live="polite"`
- Keyboard navigation: Tab order follows visual flow
- Focus indicators on interactive elements
- High contrast ratios (WCAG AA)

### 8. Performance Considerations

- Debounced status polling (avoid excessive requests)
- Cleanup intervals on unmount (prevent memory leaks)
- Memoize expensive computations with `useMemo`
- Use React 19 concurrent features for smooth animations

### 9. Error Handling

**Failed Processing**:
- Display error message in card
- Show "Retry" button (future enhancement)
- Log error to console

**Network Errors**:
- Retry polling after 5 seconds
- Show toast: "Connection lost, retrying..."
- Max 3 retry attempts before showing error

**Low Confidence**:
- Show yellow "Review Required" badge
- Display confidence percentage
- Add visual indicator for manual review

## Implementation Checklist

- [ ] Install sonner package
- [ ] Create SummaryPanel component with tests
- [ ] Write failing test for status polling
- [ ] Implement status polling in page.tsx
- [ ] Add Toaster component
- [ ] Update status badge variants
- [ ] Integrate SummaryPanel rendering
- [ ] Add error handling
- [ ] Test accessibility
- [ ] Verify responsiveness
- [ ] Run integration tests

## Files Created/Modified

**Created**:
- `app/components/SummaryPanel.tsx`
- `app/components/__tests__/SummaryPanel.test.tsx`
- `__tests__/integration/summary-display.test.tsx`

**Modified**:
- `app/page.tsx` (status polling + SummaryPanel integration)
- `package.json` (add sonner dependency)

## Success Criteria

✅ User sees status badge update in real-time
✅ Summary panel appears automatically after processing
✅ Toast notification confirms completion
✅ All extracted data (topics, decisions, actions, LNO) displayed correctly
✅ Low confidence items show "Review Required" badge
✅ Responsive on mobile, tablet, desktop
✅ Accessible with keyboard and screen readers
✅ No console errors or warnings
✅ 100% test coverage for new components
