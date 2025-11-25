# Research: Priorities Page UX Refactoring

**Feature**: Priorities Page UX Refinement
**Branch**: `001-priorities-page-ux`
**Date**: 2025-11-25

## Executive Summary

This document captures research findings for refactoring the priorities page layout to fix UX issues where controls are separated from their effects. Research confirms that all target components exist, are well-structured, and can be extended with minimal changes to support the planned layout improvements.

**Key Findings**:
- TaskList (100KB file) is already complex but has no header - will need careful integration
- ContextCard is extensible and already uses Card components from shadcn/ui
- SortingStrategySelector is simple and can easily accept a `compact` prop
- PrioritizationSummary is minimal and can be deprecated without side effects
- ReasoningChain has conditional rendering logic that can be extended with debug mode

## Component Analysis

### 1. TaskList Component

**File**: `app/priorities/components/TaskList.tsx` (100KB)
**Current Structure**: Large component handling task display, filtering, and interactions

**Findings**:
- **Size**: 100,982 bytes - substantial component with complex logic
- **Current Props**: Accepts tasks array, likely has callbacks for task interactions
- **Styling**: Uses responsive design patterns from Phase 8
- **Header**: No existing header structure - will need to add one
- **Extension Point**: Can add header div before task rows without breaking existing logic

**Integration Approach**:
```typescript
// Proposed structure
<Card>
  {/* NEW: Header section */}
  <div className="flex items-center justify-between border-b border-border p-4">
    <h2>Your Prioritized Tasks</h2>
    <div className="flex items-center gap-3">
      <span>{tasks.length} tasks</span>
      <SortingStrategySelector compact />
    </div>
  </div>

  {/* EXISTING: Task rows */}
  <div className="divide-y divide-border">
    {tasks.map(task => <TaskRow key={task.id} task={task} />)}
  </div>
</Card>
```

**Risk Assessment**: **MEDIUM** - Large file size suggests complex logic, but header is additive change with low coupling risk.

### 2. ContextCard Component

**File**: `app/priorities/components/ContextCard.tsx` (19KB)
**Current Structure**: Displays outcome, reflections, and recalculate button

**Findings**:
- **Size**: 19,450 bytes - moderate component, well-structured
- **Current Display**: Outcome statement, reflections count, recalculate CTA
- **Extensibility**: Uses CardContent for main content - easy to extend
- **Styling**: Already uses Badge component for reflections
- **Dependencies**: May need to import `formatDistanceToNow` from `date-fns`

**Integration Approach**:
```typescript
<CardContent>
  {/* EXISTING: Reflections info */}
  <div className="flex items-center gap-2">
    <Badge>{reflectionsCount} reflections active</Badge>
  </div>

  {/* NEW: Metadata section */}
  <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
    {completionTime && (
      <span>Completed {formatDistanceToNow(completionTime)} ago</span>
    )}
    {qualityCheckPassed !== undefined && (
      <Badge variant={qualityCheckPassed ? "default" : "secondary"}>
        Quality check: {qualityCheckPassed ? "✓ Passed" : "⚠ Review"}
      </Badge>
    )}
  </div>
</CardContent>
```

**Risk Assessment**: **LOW** - Well-structured component with clear extension point. Adding props and metadata display is straightforward.

### 3. SortingStrategySelector Component

**File**: `app/priorities/components/SortingStrategySelector.tsx` (1.7KB)
**Current Structure**: Simple dropdown for sorting strategy selection

**Findings**:
- **Size**: 1,750 bytes - small, focused component
- **Current Props**: `selectedStrategy`, `onStrategyChange`
- **Styling**: Uses Select component from shadcn/ui
- **Simplicity**: Minimal logic, just renders dropdown options
- **Compact Variant**: Can add conditional className easily

**Integration Approach**:
```typescript
interface SortingStrategySelectorProps {
  selectedStrategy: SortingStrategy;
  onStrategyChange: (strategy: SortingStrategy) => void;
  compact?: boolean;  // NEW
  disabled?: boolean;
}

export function SortingStrategySelector({
  selectedStrategy,
  onStrategyChange,
  compact = false,
  disabled = false
}: SortingStrategySelectorProps) {
  return (
    <Select
      value={selectedStrategy}
      onValueChange={onStrategyChange}
      disabled={disabled}
    >
      <SelectTrigger className={compact ? "h-9 text-sm px-2" : "h-11 text-base px-4"}>
        {/* ... */}
      </SelectTrigger>
    </Select>
  );
}
```

**Risk Assessment**: **LOW** - Minimal component, trivial to extend with compact prop.

### 4. PrioritizationSummary Component

**File**: `app/priorities/components/PrioritizationSummary.tsx` (1.4KB)
**Current Structure**: Displays completion time and quality check

**Findings**:
- **Size**: 1,414 bytes - very small component
- **Current Display**: Completion time badge, quality check badge
- **Usage**: Standalone component in page.tsx
- **Dependencies**: Uses `formatDistanceToNow` from `date-fns`
- **Deprecation Path**: Can mark as deprecated, move functionality to ContextCard

**Current Implementation** (inferred):
```typescript
export function PrioritizationSummary({
  completionTime,
  qualityCheckPassed
}: PrioritizationSummaryProps) {
  return (
    <div className="flex items-center gap-2">
      {completionTime && (
        <Badge variant="secondary">
          Completed {formatDistanceToNow(completionTime)} ago
        </Badge>
      )}
      {qualityCheckPassed !== undefined && (
        <Badge variant={qualityCheckPassed ? "default" : "destructive"}>
          Quality: {qualityCheckPassed ? "✓" : "✗"}
        </Badge>
      )}
    </div>
  );
}
```

**Deprecation Approach**:
1. Add `@deprecated` JSDoc comment to component
2. Move functionality into ContextCard
3. Remove usage from page.tsx
4. Keep file for backward compatibility (mark for future removal)

**Risk Assessment**: **LOW** - Small component with clear deprecation path. No complex dependencies.

### 5. ReasoningChain Component

**File**: `app/priorities/components/ReasoningChain.tsx` (4.4KB)
**Current Structure**: Displays chain-of-thought from quality loop

**Findings**:
- **Size**: 4,397 bytes - small component with conditional rendering
- **Current Display**: Collapsible Card showing iteration steps
- **Visibility**: Always rendered in current implementation
- **Debug Mode**: Can add prop to control visibility
- **Query Param**: Need to read `searchParams` in page.tsx for `?debug=true`

**Integration Approach**:
```typescript
interface ReasoningChainProps {
  chainOfThought: string[];
  totalIterations: number;
  debugMode?: boolean;  // NEW
}

export function ReasoningChain({
  chainOfThought,
  totalIterations,
  debugMode = false
}: ReasoningChainProps) {
  // Don't render if debug mode is off
  if (!debugMode) return null;

  return (
    <Card>
      {/* Existing rendering logic */}
    </Card>
  );
}
```

**Page Integration**:
```typescript
// In page.tsx
const searchParams = useSearchParams();
const debugMode = searchParams.get('debug') === 'true';

return (
  <>
    <ContextCard {...} />
    <TaskList {...} />
    <ReasoningChain debugMode={debugMode} {...} />
  </>
);
```

**Risk Assessment**: **LOW** - Simple conditional rendering. Query param reading is standard Next.js pattern.

## Layout Flow Comparison

### Current Layout (page.tsx)

```
PrioritiesPage
├── ContextCard (outcome, reflections, recalculate)
├── PrioritizationSummary (standalone - REMOVE)  ← Line 2383-2387
├── SortingStrategySelector (standalone - REMOVE)  ← Line 2712-2723
├── ReasoningChain (always visible - HIDE)  ← Line 2724-2730
└── TaskList
    └── TaskRow[]
```

**Issues**:
- 4+ standalone sections (cognitive overload)
- Sorting control ~500px away from task list (broken feedback loop)
- Metadata has no user action (violates vertical slice protocol)
- Debug info clutters primary workflow

### Target Layout (proposed)

```
PrioritiesPage
├── ContextCard (+ completion time, + quality badge)
├── TaskList
│   ├── Header
│   │   ├── Title: "Your Prioritized Tasks"
│   │   ├── Count: "12 tasks"
│   │   └── SortingStrategySelector (compact)
│   └── TaskRow[]
└── ReasoningChain (only if ?debug=true)
```

**Improvements**:
- 2 cohesive sections (reduced cognitive load)
- Sorting control in same viewport as tasks (immediate feedback)
- Metadata integrated with outcome context (cohesive information)
- Debug info hidden by default (clean primary workflow)

## Design System Patterns

### Mobile-First Responsive Patterns (from Phase 8)

**Touch Targets**:
```css
/* Mobile: 44px minimum (Apple/Android guidelines) */
.h-11 { height: 2.75rem; }  /* 44px */

/* Desktop: 36px (compact) */
.sm:h-9 { height: 2.25rem; }  /* 36px */
```

**Typography**:
```css
/* Mobile: Larger for readability */
.text-base { font-size: 1rem; }  /* 16px */

/* Desktop: Compact */
.sm:text-sm { font-size: 0.875rem; }  /* 14px */
```

**Spacing**:
```css
/* Mobile: Generous spacing for touch */
.p-4 { padding: 1rem; }

/* Desktop: Tighter */
.sm:p-6 { padding: 1.5rem; }
```

### shadcn/ui Components in Use

**Card Structure**:
```typescript
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Main content */}
  </CardContent>
  <CardFooter>
    {/* Actions */}
  </CardFooter>
</Card>
```

**Badge Variants**:
```typescript
<Badge variant="default">Primary</Badge>      // Green, for success
<Badge variant="secondary">Neutral</Badge>   // Gray, for info
<Badge variant="destructive">Error</Badge>   // Red, for failures
<Badge variant="outline">Subtle</Badge>      // Border only
```

**Select Component**:
```typescript
<Select value={value} onValueChange={onChange}>
  <SelectTrigger className="...">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

## Testing Considerations

### Existing Test Files

**Component Tests**:
- `app/priorities/components/__tests__/TaskList.test.tsx` - Will need updates for header
- `app/priorities/components/__tests__/ContextCard.test.tsx` - Will need updates for metadata
- `app/priorities/components/__tests__/SortingStrategySelector.test.tsx` - Will need compact variant tests
- `app/priorities/components/__tests__/PrioritizationSummary.test.tsx` - Can be deprecated
- `app/priorities/components/__tests__/ReasoningChain.test.tsx` - Will need debug mode tests

**Integration Tests**:
- `__tests__/integration/sorting-strategies.test.tsx` - Will need selector location updates
- `__tests__/integration/strategic-prioritization.test.tsx` - Will need layout structure updates

### Test Selector Strategy

**Current Selectors** (likely to break):
- `getByTestId('prioritization-summary')` → Will be removed
- `getByRole('combobox', { name: /sort/i })` → Location changes, selector OK
- `getByTestId('reasoning-chain')` → May need conditional rendering check

**Proposed Selectors** (new/updated):
- `getByRole('region', { name: /prioritized tasks/i })` → TaskList with header
- `getByRole('heading', { name: /your prioritized tasks/i })` → TaskList header title
- `getByText(/\d+ tasks/)` → Task count in header
- `getByText(/completed.*ago/i)` → Metadata in ContextCard
- `getByText(/quality check/i)` → Quality badge in ContextCard

### Test Isolation Strategy

**Unit Tests** (Component Level):
- Mock all props, test rendering logic only
- Test conditional rendering (metadata, debug mode)
- Test prop propagation (compact variant)

**Integration Tests** (User Journey):
- Render full page component
- Test sorting feedback loop (viewport verification)
- Test metadata updates after recalculation
- Test debug mode query parameter handling

## Dependencies & Imports

### New Imports Required

**ContextCard.tsx**:
```typescript
import { formatDistanceToNow } from 'date-fns';
```

**page.tsx**:
```typescript
import { useSearchParams } from 'next/navigation';  // For ?debug=true
```

### Existing Dependencies (verified)

- `date-fns`: Already in package.json (used elsewhere)
- shadcn/ui components: Already installed (Card, Badge, Select)
- Next.js 15: Provides useSearchParams hook
- React 19: Component patterns compatible

## Performance Considerations

### Render Performance

**TaskList Header**:
- Adding header div: Minimal impact (<1ms)
- SortingStrategySelector already rendered: No additional cost
- Header will re-render on sorting change: Acceptable (part of normal flow)

**ContextCard Metadata**:
- `formatDistanceToNow` computation: ~0.1ms per call
- Conditional rendering (if completionTime): No cost when undefined
- Badge components: Lightweight, no performance impact

**ReasoningChain Debug Mode**:
- Conditional rendering (`if (!debugMode) return null`): <0.01ms
- Removes component from DOM when hidden: Performance gain

### Bundle Size Impact

**New Code**:
- TaskList header: ~50 lines (+0.5KB)
- ContextCard metadata: ~20 lines (+0.3KB)
- SortingStrategySelector compact: ~5 lines (+0.1KB)
- ReasoningChain debug mode: ~3 lines (+0.05KB)

**Removed Code**:
- Standalone sections in page.tsx: ~30 lines (-0.4KB)

**Net Impact**: +0.5KB (negligible)

## Risk Analysis

### High-Risk Areas

1. **TaskList Integration** (100KB file)
   - Risk: Breaking existing task display logic
   - Mitigation: Add header as separate div, don't touch task rows
   - Test Coverage: Extensive unit tests for header, integration tests for full component

2. **Test Selector Changes**
   - Risk: Many tests may break due to layout changes
   - Mitigation: Update selectors incrementally, run tests after each change
   - Rollback Plan: Git commit after each green slice

### Medium-Risk Areas

1. **ContextCard Overcrowding**
   - Risk: Too much metadata makes card visually cluttered
   - Mitigation: Use muted colors, compact badges, test on mobile
   - Fallback: Move metadata to TaskList header if needed

2. **Mobile Responsiveness**
   - Risk: Header may not stack properly on 320px viewports
   - Mitigation: Follow Phase 8 patterns (`flex-col sm:flex-row`)
   - Test Coverage: Manual testing on 320px, 375px, 768px

### Low-Risk Areas

1. **SortingStrategySelector Compact Variant**
   - Risk: Minimal - just adding conditional className
   - Mitigation: Test on smallest viewport (320px)

2. **ReasoningChain Debug Mode**
   - Risk: Minimal - simple conditional rendering
   - Mitigation: Test with and without query parameter

## Recommendations

### Implementation Order

1. **Start with SortingStrategySelector** (lowest risk, smallest change)
2. **Then ContextCard metadata** (medium risk, clear extension point)
3. **Then TaskList header** (highest risk, largest file)
4. **Then ReasoningChain debug mode** (low risk, simple change)
5. **Finally page.tsx cleanup** (remove standalone sections)

### Testing Strategy

1. **Unit tests first** for each component modification
2. **Integration tests** after all components updated
3. **Manual testing** for mobile responsiveness and visual regression
4. **Code review** with code-reviewer agent before merge

### Rollback Plan

- Git commit after each green slice
- If TaskList integration breaks, revert to previous commit
- If tests fail extensively, pause and reassess selector strategy
- If mobile layout breaks, fall back to stacked sorting (separate row)

## Conclusion

Research confirms that the planned UX refactoring is feasible with **low-to-medium risk**. All target components are well-structured and can be extended without breaking changes. The main risk areas (TaskList integration, test selector updates) have clear mitigation strategies.

**Key Success Factors**:
- Follow TDD workflow (failing test → implementation → green)
- Commit after each green slice for easy rollback
- Test mobile responsiveness at each step
- Update test selectors incrementally
- Monitor render performance with React DevTools

**Estimated Effort**: 8-11 hours (matches appetite from plan.md)
- Day 1: 4 hours (TaskList + SortingStrategySelector)
- Day 2: 3 hours (ContextCard + ReasoningChain)
- Day 3: 4 hours (Integration tests + polish)

Research phase complete. Ready to proceed to implementation.
