# UI Implementation Plan: AI Notes Synthesis App (Craft-inspired Dark Theme)

## Overview
Building a comprehensive dark-themed UI with card-based layout, drag-and-drop functionality, and five distinct sections for note synthesis.

## Component Hierarchy

```
app/page.tsx (Client Component)
├── FileUploadSection
│   ├── Drag-and-drop zone
│   └── File list display
├── TopicsSection
│   └── TopicCard[] (draggable)
├── DecisionsSection
│   └── DecisionCard[] (draggable)
├── ActionsSection
│   └── ActionCard[] (draggable)
└── TasksSection
    ├── LeverageTasksList
    ├── NeutralTasksList
    └── OverheadTasksList
```

## Tailwind CSS Design System

### Color Palette
- Background: `bg-[#1a1a1a]` (main) / `bg-[#252525]` (cards)
- Text: `text-gray-100` (primary) / `text-gray-400` (secondary)
- Accent: `text-blue-500`, `bg-blue-500`
- L/N/O Tags:
  - Leverage: `bg-green-500/10`, `text-green-400`, `border-green-500/30`
  - Neutral: `bg-gray-500/10`, `text-gray-400`, `border-gray-500/30`
  - Overhead: `bg-orange-500/10`, `text-orange-400`, `border-orange-500/30`

### Typography
- Headers: `font-sans font-semibold text-xl`
- Body: `font-sans text-sm text-gray-300`
- Icons: Using Unicode/emoji for simplicity (no external icon library)

### Spacing & Layout
- Container: `max-w-7xl mx-auto p-6`
- Card padding: `p-6`
- Gap between sections: `gap-6`
- Border radius: `rounded-2xl`

### Interactive States
- Hover: `hover:bg-[#2a2a2a] transition-colors duration-200`
- Focus: `focus:ring-2 focus:ring-blue-500 focus:outline-none`
- Drag: `cursor-move opacity-50 (when dragging)`

## Component Specifications

### 1. FileUploadSection
**Purpose:** Drag-and-drop file upload area
**State:** `files: File[]`, `isDragging: boolean`
**Accessibility:**
- `aria-label="File upload area"`
- Keyboard accessible file input
- Visual feedback for drag state

### 2. TopicsSection
**Purpose:** Display extracted conversation topics
**State:** `topics: Topic[]` where `Topic = { id: string, text: string }`
**Drag:** Items draggable between topics/decisions/actions

### 3. DecisionsSection
**Purpose:** Show confirmed decisions with context
**State:** `decisions: Decision[]` where `Decision = { id: string, text: string, context?: string }`

### 4. ActionsSection
**Purpose:** High-level action items
**State:** `actions: Action[]` where `Action = { id: string, text: string }`

### 5. TasksSection
**Purpose:** L/N/O categorized tasks
**State:** `tasks: { leverage: Task[], neutral: Task[], overhead: Task[] }`
**Drag:** Tasks can be re-categorized by dragging between L/N/O lists
**Visual:** Color-coded tags and borders

## State Management
- React 19 hooks (`useState` for local state)
- Drag state managed via HTML5 Drag and Drop API
- No external state management library needed

## TypeScript Types

```typescript
interface Topic {
  id: string;
  text: string;
}

interface Decision {
  id: string;
  text: string;
  context?: string;
}

interface Action {
  id: string;
  text: string;
}

interface Task {
  id: string;
  text: string;
  category: 'leverage' | 'neutral' | 'overhead';
}

type DragItem = Topic | Decision | Action | Task;
```

## Accessibility Considerations
- Semantic HTML (`<section>`, `<article>`, `<header>`)
- ARIA labels for drag-and-drop zones
- Keyboard navigation support (Tab, Enter, Space)
- Focus management for dragged items
- Screen reader announcements for state changes

## Mock Data Structure
```typescript
const mockData = {
  files: [
    { id: '1', name: 'meeting-notes.pdf', size: 245000, uploadedAt: Date.now() }
  ],
  topics: [
    { id: 't1', text: 'Q4 Product Roadmap' },
    { id: 't2', text: 'Team Hiring Strategy' }
  ],
  decisions: [
    { id: 'd1', text: 'Proceed with mobile-first redesign', context: 'Approved by leadership team' }
  ],
  actions: [
    { id: 'a1', text: 'Schedule design review session' }
  ],
  tasks: {
    leverage: [
      { id: 'tl1', text: 'Complete competitor analysis', category: 'leverage' as const }
    ],
    neutral: [
      { id: 'tn1', text: 'Update project documentation', category: 'neutral' as const }
    ],
    overhead: [
      { id: 'to1', text: 'File expense reports', category: 'overhead' as const }
    ]
  }
};
```

## Implementation Steps
1. Update `app/globals.css` with dark theme variables
2. Create `app/components/` directory
3. Build individual components:
   - `FileUploadSection.tsx`
   - `TopicsSection.tsx`
   - `DecisionsSection.tsx`
   - `ActionsSection.tsx`
   - `TasksSection.tsx`
4. Update `app/page.tsx` to compose all sections
5. Implement drag-and-drop logic with HTML5 API

## Testing Considerations
- Component renders with mock data
- Drag-and-drop functionality works across sections
- L/N/O re-categorization updates state correctly
- File upload triggers state update
- Keyboard navigation works
- Visual feedback on hover/drag states

## Next.js 15 Patterns
- Client Component (`'use client'`) for interactivity
- Server Component by default for static content
- No API routes needed (mock data only)
