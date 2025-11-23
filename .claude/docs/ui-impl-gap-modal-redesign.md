# UI Implementation: Gap Detection Modal Redesign

## Task Overview
Redesign the Gap Detection Modal for better desktop and mobile UX while preserving all existing functionality.

## Current Issues
1. **Poor mobile responsiveness** - Full-width modal may overflow on mobile
2. **Information density issues** - Too much text, cluttered layout
3. **Navigation problems** - Hard to scan through multiple gaps
4. **Action visibility** - Buttons may be hard to reach
5. **Readability issues** - Long task descriptions, unclear hierarchy

## Components Needed
- **Tabs** (already installed): Navigate between gaps
- **Collapsible** (need to install): Collapse reasoning sections
- **Drawer** (need to install): Mobile-responsive bottom sheet
- **ScrollArea** (already installed): Better scrolling for long content
- **Separator** (already installed): Visual dividers
- **Progress** (may need to install): Progress indicator for gaps

## ShadCN Selection

**Individual Components** (no blocks available):
- `tabs`: Use for navigating between multiple gaps (1 of 3)
- `collapsible`: Use for collapsible reasoning sections (reduce scroll)
- `drawer`: Use for mobile bottom-sheet pattern
- `scroll-area`: Use for smooth scrolling in modal body
- `separator`: Use for visual hierarchy between sections
- `progress`: Use for gap completion indicator

## Layout Structure

### Desktop (≥768px)
```
┌─────────────────────────────────────────────────┐
│ Gap Analysis                            [X]     │
│ Detect missing tasks...                         │
├─────────────────────────────────────────────────┤
│ ┌─ Progress: 2/3 gaps reviewed ───────────┐    │
│ │ [===========░░░░] 66%                    │    │
│ └──────────────────────────────────────────┘    │
│                                                  │
│ ┌─ Tabs ────────────────────────────────────┐  │
│ │ [Gap 1] [Gap 2] [Gap 3]                   │  │
│ └────────────────────────────────────────────┘  │
│                                                  │
│ ┌─ Gap Content (ScrollArea) ───────────────┐   │
│ │ Gap between "Task A" → "Task B"           │   │
│ │ [Time gap] [Workflow jump]                │   │
│ │                                            │   │
│ │ ┌─ Suggested Bridging Task 1 ──────────┐ │   │
│ │ │ [✓] Task description (editable)       │ │   │
│ │ │     8 hours | Cognition: 2 | 85%      │ │   │
│ │ │     > Reasoning (collapsible)         │ │   │
│ │ └────────────────────────────────────────┘ │   │
│ │ ┌─ Suggested Bridging Task 2 ──────────┐ │   │
│ │ │ [✓] Task description (editable)       │ │   │
│ │ └────────────────────────────────────────┘ │   │
│ └────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│ 3 tasks selected            [Cancel] [Accept]   │
└─────────────────────────────────────────────────┘
```

### Mobile (<768px)
```
┌──────────────────────────┐
│ Gap Analysis        [X]  │
├──────────────────────────┤
│ Progress: 1/3 gaps       │
│ [====░░░░░░] 33%         │
│                          │
│ [< Prev] Gap 1/3 [Next >]│
│                          │
│ ScrollArea (full-height) │
│ - Gap info               │
│ - Badges                 │
│ - Bridging tasks         │
│   (collapsed reasoning)  │
│                          │
├──────────────────────────┤
│ 3 tasks selected         │
│ [Cancel]    [Accept]     │
└──────────────────────────┘
```

## User Interaction Flow
1. User opens modal → sees progress indicator and tabs/navigation
2. User clicks tab (desktop) or prev/next (mobile) → switches between gaps
3. User reviews gap info → sees clear predecessor → successor
4. User expands reasoning (optional) → reads AI explanation
5. User toggles checkboxes → selects/deselects tasks
6. User edits task text/hours → updates inline
7. User sees manual example prompt (if needed) → provides examples
8. User clicks Accept → selected tasks inserted into plan
9. User sees success feedback → modal closes

## Backend Integration
No backend changes needed - all existing props and callbacks preserved:
- `onToggleTask`: Handle checkbox changes
- `onEditTask`: Handle inline edits
- `onRetryWithExamples`: Handle manual example submission
- `onSkipExamples`: Handle skip action
- `onAcceptSelected`: Handle final acceptance
- All existing state management preserved

## Accessibility Plan

### Keyboard Navigation
- Tab through gaps (Tabs component has built-in keyboard support)
- Arrow keys to navigate between tabs
- Space/Enter to toggle collapsible sections
- Tab to reach checkboxes, inputs, buttons
- Escape to close modal

### Screen Reader
- ARIA label on progress indicator: "Gap analysis progress: 2 of 3 gaps reviewed"
- ARIA label on tabs: "Gap 1 of 3: between Task A and Task B"
- ARIA label on collapsible: "Show reasoning" / "Hide reasoning"
- ARIA live region for task selection count updates
- Proper form labels on inputs (already implemented)

### Focus Management
- Focus trap within modal (Dialog component handles this)
- Focus first tab on modal open
- Maintain focus context when switching tabs
- Return focus to trigger button on close

### Visual Design
- Maintain WCAG AA contrast (4.5:1 for text)
- Use depth layers for backgrounds
- No reliance on color alone (use icons + text)
- Touch targets ≥44px on mobile

## Test Plan

### Render Tests
- Modal renders with loading state
- Modal renders with gaps detected
- Modal renders with no gaps detected
- Modal renders with error state
- Progress indicator shows correct percentage
- Tabs render with correct labels

### Interaction Tests
- Clicking tabs switches gap view
- Toggling checkbox updates selection count
- Editing task text updates state
- Editing hours updates state
- Expanding/collapsing reasoning works
- Manual example submission works
- Skip action works
- Accept button enabled only when tasks selected

### Integration Tests
- Full workflow: detect → review → select → accept
- Error handling: manual examples required
- Error handling: acceptance failure with details
- State synchronization between tabs

### Edge Cases
- Single gap (no tabs needed)
- Many gaps (6+) - tab overflow handling
- Long task descriptions (truncation/wrapping)
- No search results (manual examples prompt)
- All tasks deselected (button disabled)
- Mobile viewport (responsive layout)

## Responsive Breakpoints
- **Mobile**: <640px (sm) - Vertical layout, prev/next buttons, bottom sheet style
- **Tablet**: 640-768px (md) - Compact tabs, reduced spacing
- **Desktop**: ≥768px (lg) - Full tabs, comfortable spacing
- **Large**: ≥1024px (xl) - Max width 768px (3xl), centered

## Implementation Notes

### New Components to Install
```bash
npx shadcn-ui@latest add collapsible
npx shadcn-ui@latest add drawer
npx shadcn-ui@latest add progress
```

### Existing Components (Already Installed)
- Dialog (current container)
- Tabs (for gap navigation)
- ScrollArea (for content overflow)
- Separator (for visual dividers)
- Alert (for errors)
- Badge (for indicators)
- Button, Input, Textarea, Checkbox (for interactions)

### Design System Adherence
- Use `bg-layer-1` through `bg-layer-4` for depth
- Use `shadow-2layer-sm/md/lg` for elevation
- No borders (rely on color contrast and shadows)
- Semantic colors for status (`success-bg`, `warning-bg`, etc.)
- WCAG AA contrast minimum

### Component Structure
```tsx
GapDetectionModal (responsive container)
  ├─ Dialog (desktop) / Drawer (mobile ≤768px)
  ├─ DialogHeader (sticky)
  │   ├─ DialogTitle
  │   ├─ DialogDescription
  │   └─ Progress indicator
  ├─ ScrollArea (modal body)
  │   ├─ Tabs (desktop) / Pagination (mobile)
  │   └─ TabContent (per gap)
  │       ├─ GapHeader (predecessor → successor)
  │       ├─ IndicatorBadges
  │       ├─ ManualExamplesPrompt (conditional)
  │       └─ BridgingTaskCard[] (enhanced)
  │           ├─ Checkbox + Editable fields
  │           └─ Collapsible reasoning section
  └─ DialogFooter (sticky)
      ├─ Alert (acceptError, conditional)
      ├─ Selection count
      └─ Action buttons
```

### Mobile Optimizations
1. **Drawer instead of Dialog**: Bottom sheet pattern on mobile
2. **Pagination instead of Tabs**: Prev/Next buttons for gap navigation
3. **Collapsed by default**: Reasoning sections collapsed on mobile
4. **Larger touch targets**: Buttons minimum 44px height
5. **Reduced spacing**: Tighter padding on small screens
6. **Full-width inputs**: Better mobile input experience

### Desktop Improvements
1. **Tabs for navigation**: Easy gap switching
2. **Side-by-side layout**: Better use of horizontal space
3. **Sticky header/footer**: Always visible actions
4. **Hover states**: Enhanced interactivity feedback
5. **Keyboard shortcuts**: Tab navigation, arrow keys

## Files to Modify
1. `app/priorities/components/GapDetectionModal.tsx` (main redesign)
2. `app/priorities/components/BridgingTaskCard.tsx` (add collapsible reasoning)

## Completion Checklist
- [ ] Install missing ShadCN components (collapsible, drawer, progress)
- [ ] Create responsive layout with tabs (desktop) / pagination (mobile)
- [ ] Add progress indicator at top
- [ ] Implement collapsible reasoning sections
- [ ] Add sticky header and footer
- [ ] Ensure all existing functionality preserved
- [ ] Test keyboard navigation
- [ ] Test screen reader accessibility
- [ ] Test mobile responsiveness (320px - 768px)
- [ ] Test desktop layout (≥768px)
- [ ] Verify no breaking changes to parent integration
- [ ] Document any API changes (none expected)
