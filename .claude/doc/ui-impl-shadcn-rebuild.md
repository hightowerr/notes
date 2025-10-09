# UI Implementation Plan: Shadcn/UI Complete Rebuild

**Date:** 2025-10-06
**Task:** Complete rebuild of Notes Synthesis app using ONLY shadcn/ui components

## Requirements Summary

### Mandatory Constraints
- Use shadcn/ui components ONLY (no custom components)
- Use standard Tailwind/shadcn CSS variables ONLY (no inline hex colors)
- Utilize existing shadcn configuration (new-york style, neutral base color)
- Maintain same five-section layout as before

### Available Shadcn Components
- Card (CardHeader, CardTitle, CardDescription, CardContent)
- Badge
- Button
- Separator
- ScrollArea

## Component Architecture

### 1. File Upload Section
**Components Used:**
- `Card` - Main upload area with dashed border
- `Badge` - "Processed" status indicator
- Lucide icons: `Upload`, `FileText`

**Features:**
- Drag-and-drop file upload
- Click-to-browse functionality
- File list with size and timestamp
- Hover states using `hover:bg-accent/50`

**Color Scheme:**
- Upload area: `border-border`, `bg-primary/5` (when dragging)
- File cards: `bg-card`, `hover:bg-accent/50`
- Status badge: `bg-green-600` (Tailwind standard color)

### 2. Topics Section
**Components Used:**
- `Card` - Container and individual topic cards
- `Badge` - Count indicator
- `ScrollArea` - Scrollable list (h-[300px])
- Lucide icon: `Lightbulb`

**Layout:**
- Two-column grid with Decisions section (lg:grid-cols-2)
- Each topic as nested Card with `bg-accent/30`
- Icon: amber-500 for topics

### 3. Decisions Section
**Components Used:**
- `Card` - Container and individual decision cards
- `Badge` - Count indicator
- `ScrollArea` - Scrollable list (h-[300px])
- Lucide icon: `CheckCircle2`

**Features:**
- Decision text (font-medium)
- Optional context text (text-xs text-muted-foreground)
- Icon: green-500 for decisions

### 4. Actions Section
**Components Used:**
- `Card` - Container and individual action cards
- `Badge` - Count indicator
- Lucide icon: `MoveRight`

**Layout:**
- Two-column grid (md:grid-cols-2)
- Compact action cards with `bg-accent/30`
- Icon: blue-500 for actions

### 5. Tasks Section (L/N/O)
**Components Used:**
- `Card` - Column containers and task cards
- `CardHeader`, `CardTitle`, `CardDescription` - Column headers
- `Badge` - Task count badges
- `ScrollArea` - Scrollable task lists (h-[400px])
- Lucide icon: `ListTodo`

**Layout:**
- Three-column grid (md:grid-cols-3)
- Drag-and-drop between columns
- Visual feedback with opacity-50 when dragging

**Color Scheme:**
- Leverage: `bg-green-500/10`, `border-green-500/20`, badge `bg-green-600`
- Neutral: `bg-accent/50`, badge `variant="secondary"`
- Overhead: `bg-orange-500/10`, `border-orange-500/20`, badge `bg-orange-600`

## Drag-and-Drop Implementation

### Task Movement
- `draggable` attribute on task cards
- `onDragStart` - Sets draggedTask state
- `onDragEnd` - Clears draggedTask state
- `onDrop` - Moves task to target column category

### Visual Feedback
- Source card: `opacity-50` while dragging
- Target columns: `border-{color}-500/50` visual hint
- Empty state: "Drag tasks here" placeholder

## Color System

### Shadcn CSS Variables Used
- `bg-background` - Page background
- `bg-card` - Card backgrounds
- `text-foreground` - Primary text
- `text-muted-foreground` - Secondary text
- `bg-accent` - Hover states
- `border-border` - Borders
- `text-primary` - Primary accent

### Tailwind Standard Colors Used
- `amber-500` - Topic icons
- `green-500`, `green-600`, `green-700` - Leverage/success states
- `blue-500` - Action icons
- `orange-500`, `orange-600`, `orange-700` - Overhead states
- `gray-500` - Neutral states

### Removed Custom Colors
- `#1a1a1a` - Replaced with `bg-background`
- `#252525` - Replaced with `bg-card`
- `#3b82f6` - Replaced with Tailwind `blue-500/600`
- Custom CSS variables `--card-bg`, `--card-border`, `--accent-blue`

## Accessibility Features

### ARIA Labels
- Hidden file input: `aria-label="File input"`
- Upload area: Role and tabIndex for keyboard access

### Keyboard Navigation
- All interactive elements keyboard-accessible
- Focus states via shadcn's built-in `focus-visible:ring`

### Semantic HTML
- `<header>`, `<main>`, `<section>`, `<footer>` tags
- Proper heading hierarchy (h1, h2)

## Responsive Design

### Breakpoints
- Mobile-first approach
- `lg:grid-cols-2` - Topics/Decisions columns
- `md:grid-cols-2` - Actions grid
- `md:grid-cols-3` - Tasks L/N/O columns

### Spacing
- Consistent `space-y-8` for sections
- `gap-6` for grid layouts
- `gap-3` for inline elements

## State Management

### React Hooks Used
- `useState<NotesData>` - Main data state
- `useState<boolean>` - isDragging for file upload
- `useState<Task | null>` - draggedTask for task movement
- `useRef<HTMLInputElement>` - File input reference

### Data Flow
- File upload: Adds to `data.files` array
- Task movement: Updates `data.tasks.{category}` arrays
- All updates use functional setState for immutability

## Performance Optimizations

### React 19 Features
- Client component marked with 'use client'
- Efficient re-renders with proper key props
- Conditional rendering for empty states

### CSS Optimizations
- Tailwind utility classes (no custom CSS)
- CSS variables for theming
- Transitions for smooth interactions

## Files Modified

1. `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/page.tsx`
   - Complete rewrite using shadcn/ui components
   - 577 lines of TypeScript
   - All functionality in single file (no component imports)

2. `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/globals.css`
   - Removed custom color variables
   - Kept shadcn CSS variables
   - Removed custom scrollbar styles
   - Removed drag-and-drop classes

## Files to Delete

Custom component files (no longer needed):
1. `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/FileUploadSection.tsx`
2. `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/TopicsSection.tsx`
3. `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/DecisionsSection.tsx`
4. `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/ActionsSection.tsx`
5. `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/TasksSection.tsx`
6. `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/DraggableCard.tsx`
7. `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/components/TaskCard.tsx`

## Testing Checklist

- [ ] File upload via drag-and-drop
- [ ] File upload via click-to-browse
- [ ] File list displays correctly
- [ ] Topics section scrolls properly
- [ ] Decisions section shows context when available
- [ ] Actions grid layout responsive
- [ ] Task drag-and-drop between L/N/O columns
- [ ] Visual feedback during drag operations
- [ ] Empty states display correctly
- [ ] Responsive layout at mobile/tablet/desktop
- [ ] Dark mode support (via shadcn variables)
- [ ] Keyboard navigation for upload
- [ ] Screen reader accessibility

## Success Criteria

- Zero custom components
- Zero inline hex colors
- All functionality preserved
- Responsive design maintained
- Accessibility standards met
- TypeScript strict mode compliance
- Clean, maintainable code structure

## Implementation Status

- [x] Main page rebuilt with shadcn/ui components
- [x] Globals.css cleaned up
- [ ] Custom component files deleted
- [ ] Implementation plan documented
- [ ] Ready for testing
