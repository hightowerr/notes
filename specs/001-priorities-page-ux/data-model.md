# Data Model: Priorities Page UX Refinement

**Feature**: Priorities Page UX Refinement
**Branch**: `001-priorities-page-ux`
**Date**: 2025-11-25

## Overview

This document defines the component prop interfaces and type definitions for the priorities page UX refactoring. Since this is a pure UI reorganization, there are no database schema changes or new data entities. All changes are confined to React component prop interfaces.

## Component Prop Interfaces

### TaskList Component

**File**: `app/priorities/components/TaskList.tsx`

**Current Props** (inferred from research):
```typescript
interface TaskListProps {
  tasks: PrioritizedTask[];
  onTaskClick?: (taskId: string) => void;
  // ... other existing props
}
```

**Enhanced Props** (with new sorting integration):
```typescript
interface TaskListProps {
  tasks: PrioritizedTask[];
  sortingStrategy: SortingStrategy;           // NEW - current strategy
  onStrategyChange: (strategy: SortingStrategy) => void;  // NEW - strategy change handler
  onTaskClick?: (taskId: string) => void;
  selectedTaskId?: string;
  showCompletedTasks?: boolean;
  // ... other existing props
}
```

**New Behavior**:
- Component must render header section with sorting dropdown before task rows
- Header displays: title, task count, and SortingStrategySelector
- Sorting dropdown disabled when `tasks.length === 0`

### ContextCard Component

**File**: `app/priorities/components/ContextCard.tsx`

**Current Props** (inferred from research):
```typescript
interface ContextCardProps {
  outcome: Outcome;
  reflectionsCount: number;
  onRecalculate: () => void;
}
```

**Enhanced Props** (with metadata integration):
```typescript
interface ContextCardProps {
  outcome: Outcome;
  reflectionsCount: number;
  onRecalculate: () => void;
  completionTime?: Date;                      // NEW - prioritization completion timestamp
  qualityCheckPassed?: boolean;               // NEW - quality threshold met
  isRecalculating?: boolean;                  // Existing - loading state
}
```

**New Behavior**:
- Component renders metadata section after reflections count
- `completionTime` formatted with `formatDistanceToNow` (e.g., "2 min ago")
- `qualityCheckPassed` renders Badge with variant:
  - `true` → `variant="default"` (green) with "✓ Passed"
  - `false` → `variant="secondary"` (yellow) with "⚠ Review"
  - `undefined` → not displayed (graceful absence)

### SortingStrategySelector Component

**File**: `app/priorities/components/SortingStrategySelector.tsx`

**Current Props**:
```typescript
interface SortingStrategySelectorProps {
  selectedStrategy: SortingStrategy;
  onStrategyChange: (strategy: SortingStrategy) => void;
}
```

**Enhanced Props** (with compact variant):
```typescript
interface SortingStrategySelectorProps {
  selectedStrategy: SortingStrategy;
  onStrategyChange: (strategy: SortingStrategy) => void;
  compact?: boolean;                          // NEW - enables header embedding
  disabled?: boolean;                         // NEW - disables when no tasks
}
```

**New Behavior**:
- `compact={true}` applies reduced padding and font size:
  - Default: `h-11 text-base px-4` (44px height, 16px font)
  - Compact: `h-9 text-sm px-2` (36px height, 14px font)
- `disabled={true}` disables Select with tooltip "No tasks to sort"

### ReasoningChain Component

**File**: `app/priorities/components/ReasoningChain.tsx`

**Current Props** (inferred):
```typescript
interface ReasoningChainProps {
  chainOfThought: string[];
  totalIterations: number;
}
```

**Enhanced Props** (with debug mode):
```typescript
interface ReasoningChainProps {
  chainOfThought: string[];
  totalIterations: number;
  debugMode?: boolean;                        // NEW - controls visibility
}
```

**New Behavior**:
- `debugMode={false}` or `undefined` → returns `null` (component not rendered)
- `debugMode={true}` → renders normally in collapsed Card
- No changes to internal rendering logic

### PrioritizationSummary Component

**File**: `app/priorities/components/PrioritizationSummary.tsx`

**Status**: **DEPRECATED** - Functionality moved to ContextCard

**Current Props**:
```typescript
/**
 * @deprecated This component is deprecated. Use ContextCard with completionTime and qualityCheckPassed props instead.
 */
interface PrioritizationSummaryProps {
  completionTime?: Date;
  qualityCheckPassed?: boolean;
}
```

**Migration Path**:
- Replace `<PrioritizationSummary ... />` with props on `<ContextCard ... />`
- No standalone usage in page.tsx
- Component file remains for backward compatibility (mark for removal in future cleanup)

## Type Definitions

### SortingStrategy (existing type)

```typescript
type SortingStrategy =
  | 'strategic-impact'     // Sort by strategic_score DESC
  | 'effort-weighted'      // Sort by effort/impact ratio
  | 'deadline-focused'     // Sort by deadline proximity
  | 'lno-first'            // Prioritize Least Negative Outcome tasks
  | 'manual-override';     // User-defined order with overrides
```

**Usage**: Shared across TaskList, SortingStrategySelector, and page.tsx

### PrioritizedTask (existing type)

```typescript
interface PrioritizedTask {
  task_id: string;
  task_text: string;
  document_id: string;
  strategic_score?: number;
  effort_estimate_hours?: number;
  deadline?: string;
  lno_relevance?: boolean;
  manual_rank?: number;
  display_rank: number;
  // ... other fields from database
}
```

**Usage**: Array of tasks passed to TaskList component

### Outcome (existing type)

```typescript
interface Outcome {
  id: string;
  user_id: string;
  assembled_text: string;
  state_preference?: string;
  daily_capacity_hours?: number;
  created_at: string;
  // ... other fields
}
```

**Usage**: Passed to ContextCard component

## Page-Level State Management

### Current State (page.tsx)

```typescript
// Existing state
const [tasks, setTasks] = useState<PrioritizedTask[]>([]);
const [activeOutcome, setActiveOutcome] = useState<Outcome | null>(null);
const [reflections, setReflections] = useState<Reflection[]>([]);
const [isRecalculating, setIsRecalculating] = useState(false);

// From agent session
const completedAt: string | null = agentSession?.completed_at;
const baseline_quality_threshold_met: boolean = agentSession?.baseline_quality_threshold_met ?? false;
const chainOfThought: string[] = agentSession?.chain_of_thought ?? [];
const iterationCount: number = agentSession?.iteration_count ?? 0;
```

### New State (additions)

```typescript
// NEW: Sorting strategy state
const [sortingStrategy, setSortingStrategy] = useState<SortingStrategy>('strategic-impact');

// NEW: Debug mode from query params
const searchParams = useSearchParams();
const debugMode = searchParams.get('debug') === 'true';
```

### State Flow

```
page.tsx state
  ↓
  ├── ContextCard props:
  │   - outcome (activeOutcome)
  │   - reflectionsCount (reflections.length)
  │   - completionTime (new Date(completedAt))  [NEW]
  │   - qualityCheckPassed (baseline_quality_threshold_met)  [NEW]
  │   - onRecalculate (handleRecalculate)
  │
  ├── TaskList props:
  │   - tasks (tasks)
  │   - sortingStrategy (sortingStrategy)  [NEW]
  │   - onStrategyChange (setSortingStrategy)  [NEW]
  │   - onTaskClick (handleTaskClick)
  │
  └── ReasoningChain props:
      - chainOfThought (chainOfThought)
      - totalIterations (iterationCount)
      - debugMode (debugMode)  [NEW]
```

## Data Transformations

### Completion Time Formatting

**Source**: `agent_sessions.completed_at` (ISO 8601 timestamp string)
**Transformation**: Convert to Date, format with `formatDistanceToNow`
**Example**:
```typescript
import { formatDistanceToNow } from 'date-fns';

const completedAt = "2025-11-25T10:30:00Z";
const completionTime = new Date(completedAt);
const displayText = formatDistanceToNow(completionTime);  // "2 minutes ago"
```

### Quality Check Badge Variant

**Source**: `agent_sessions.baseline_quality_threshold_met` (boolean)
**Transformation**: Map to Badge variant
**Mapping**:
```typescript
const badgeVariant = qualityCheckPassed ? "default" : "secondary";
const badgeText = qualityCheckPassed ? "✓ Passed" : "⚠ Review";
const badgeColor = qualityCheckPassed ? "green" : "yellow";
```

### Sorting Strategy Display Names

**Source**: SortingStrategy type
**Transformation**: Map enum to user-friendly labels
**Mapping**:
```typescript
const STRATEGY_LABELS: Record<SortingStrategy, string> = {
  'strategic-impact': 'Impact First',
  'effort-weighted': 'Effort Weighted',
  'deadline-focused': 'Deadline Focused',
  'lno-first': 'LNO First',
  'manual-override': 'Manual Override'
};
```

## Validation Rules

### Component Prop Validation

**TaskList**:
- `tasks`: Array (can be empty)
- `sortingStrategy`: Must be valid SortingStrategy enum value
- `onStrategyChange`: Must be function
- Validation: Disable dropdown if `tasks.length === 0`

**ContextCard**:
- `outcome`: Required, must have `assembled_text`
- `completionTime`: Optional, must be valid Date or undefined
- `qualityCheckPassed`: Optional, must be boolean or undefined
- Validation: Only render metadata section if at least one metadata prop defined

**SortingStrategySelector**:
- `selectedStrategy`: Must be valid SortingStrategy enum value
- `compact`: Optional, defaults to `false`
- `disabled`: Optional, defaults to `false`
- Validation: Prevent change when disabled

**ReasoningChain**:
- `chainOfThought`: Array (can be empty)
- `debugMode`: Optional, defaults to `false`
- Validation: Return `null` if `!debugMode`

## Component Communication Flow

```
User Action: Change Sorting Strategy
  ↓
SortingStrategySelector (in TaskList header)
  → calls onStrategyChange('effort-weighted')
    ↓
  page.tsx: setSortingStrategy('effort-weighted')
    ↓
  TaskList re-renders with new sortingStrategy prop
    ↓
  Tasks re-order based on new strategy
    ↓
  User sees new order in same viewport ✓
```

```
System Event: Prioritization Complete
  ↓
page.tsx: Receives agentSession with completed_at and baseline_quality_threshold_met
  ↓
Converts completedAt to Date, passes to ContextCard
  ↓
ContextCard renders metadata in CardContent
  ↓
User sees "Completed 2 min ago" and "Quality check: ✓ Passed" ✓
```

```
User Action: Load page with ?debug=true
  ↓
page.tsx: useSearchParams().get('debug') === 'true'
  ↓
Sets debugMode = true
  ↓
Passes debugMode to ReasoningChain
  ↓
ReasoningChain renders (not null)
  ↓
User sees chain-of-thought at bottom ✓
```

## Database Schema (No Changes)

This feature does **NOT** modify any database schemas. All changes are frontend-only component prop interfaces.

**Existing Tables Used**:
- `agent_sessions` - Read `completed_at`, `baseline_quality_threshold_met`, `chain_of_thought`, `iteration_count`
- `task_embeddings` - Read tasks for display (no schema changes)
- `user_outcomes` - Read outcome for ContextCard (no schema changes)
- `reflections` - Read reflections count (no schema changes)

**No Migrations Required**: This is a pure UI refactoring.

## TypeScript Strict Mode Compliance

All prop interfaces follow TypeScript strict mode requirements:

- **No `any` types**: All props explicitly typed
- **Optional props**: Marked with `?` and handled with conditional rendering
- **Union types**: SortingStrategy uses string literal union
- **Null safety**: All optional props checked before use
- **Type guards**: Use `typeof`, `Array.isArray()`, `!== undefined` checks

**Example Null Safety**:
```typescript
// Safe access to optional props
{completionTime && (
  <span>Completed {formatDistanceToNow(completionTime)} ago</span>
)}

{qualityCheckPassed !== undefined && (
  <Badge variant={qualityCheckPassed ? "default" : "secondary"}>
    Quality check: {qualityCheckPassed ? "✓ Passed" : "⚠ Review"}
  </Badge>
)}
```

## Summary

**Key Changes**:
1. TaskList: Added `sortingStrategy` and `onStrategyChange` props for header integration
2. ContextCard: Added `completionTime` and `qualityCheckPassed` props for metadata display
3. SortingStrategySelector: Added `compact` and `disabled` props for header embedding
4. ReasoningChain: Added `debugMode` prop for conditional visibility
5. PrioritizationSummary: Marked as deprecated, no new development

**No Database Changes**: All modifications are React component prop interfaces.

**Type Safety**: All changes maintain TypeScript strict mode compliance with proper null safety and type guards.
