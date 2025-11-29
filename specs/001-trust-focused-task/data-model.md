# Data Model: Trust-Focused Task List Refactor

**Date**: 2025-01-28
**Feature**: Phase 19 - Trust-Focused Task List Refactor

## Overview

This document defines the data model changes required to support brief reasoning display, Focus Mode filtering, completed task pagination, and unified manual/AI task treatment. All changes are additive or behavioral - no database migrations required.

## Schema Changes

### 1. Brief Reasoning Field (Agent Output)

**Location**: `lib/schemas/prioritizationResultSchema.ts` (extend existing)

**Addition to `per_task_scores` object**:
```typescript
import { z } from 'zod';

// Extend existing TaskScoreSchema
export const BriefReasoningSchema = z.string()
  .min(5, 'Brief reasoning must be at least 5 characters')
  .max(150, 'Brief reasoning must be ≤20 words (~150 chars)')
  .refine(
    (val) => {
      const wordCount = val.trim().split(/\s+/).length;
      return wordCount <= 20;
    },
    { message: 'Brief reasoning must be ≤20 words' }
  )
  .refine(
    (val) => {
      // Reject generic phrases without specifics
      const genericPatterns = [
        /^(important|critical|high priority)$/i,
        /^this is (important|critical|urgent)$/i,
        /^(must|should|need to) (do|complete|finish) this$/i,
      ];
      return !genericPatterns.some(pattern => pattern.test(val.trim()));
    },
    { message: 'Brief reasoning must be specific, not generic phrases like "important"' }
  );

export const TaskScoreSchema = z.object({
  task_id: z.string(),
  impact: z.number().min(0).max(10),
  effort: z.number().positive(),
  confidence: z.number().min(0).max(1),
  reasoning: z.object({
    impact_keywords: z.array(z.string()),
    effort_source: z.string(),
    effort_hint: z.string().optional(),
    complexity_modifiers: z.array(z.string()).optional(),
  }),
  dependencies: z.array(z.string()).optional(),
  reflection_influence: z.string().optional(),
  brief_reasoning: BriefReasoningSchema, // NEW FIELD
});
```

**Fallback Value**:
- When agent fails validation after 3 retries: `"Priority: [rank]"`
- Example: Task #1 → `"Priority: 1"`

**Validation Rules**:
1. Length: 5-150 characters
2. Word count: ≤20 words
3. No generic phrases: "important", "critical", "high priority" without specifics
4. Must contain outcome link or dependency reference

### 2. Focus Mode Filter (Enum Extension)

**Location**: `lib/schemas/sortingStrategy.ts`

**Current Enum**:
```typescript
export const SortingStrategySchema = z.enum([
  'balanced',
  'quick_wins',
  'strategic_bets',
  'urgent',
]);
```

**Extended Enum**:
```typescript
export const SortingStrategySchema = z.enum([
  'balanced',
  'quick_wins',
  'strategic_bets',
  'urgent',
  'focus_mode', // NEW
]);
```

**Strategy Config** (add to `STRATEGY_CONFIGS`):
```typescript
focus_mode: {
  label: 'Focus Mode (Recommended)',
  description: 'High-leverage work only (Quick Wins + Strategic Bets)',
  filter: task => isQuickWinTask(task) || isStrategicBetTask(task),
  sort: (a, b) => b.priority - a.priority,
}
```

**Filter Logic**:
- Includes: `high_impact_low_effort` OR `high_impact_high_effort` quadrants
- Excludes: `low_impact_*` (neutral/overhead)
- Target: Reduce visible tasks by 40-60%

### 3. Completed Tasks Pagination

**Location**: New component `app/priorities/components/CompletedTasksSection.tsx`

**Component State**:
```typescript
type CompletedTasksState = {
  visible: Task[]; // Last 10 completed tasks
  hidden: Task[]; // Older completions (lazy-loaded)
  page: number; // Current page (1-based)
  hasMore: boolean; // More pages available
  isExpanding: boolean; // "Show more" loading state
};
```

**Pagination Logic**:
- Default: Show last 10 completed tasks
- "Show more" button: Load next 10
- Hide button when `hidden.length === 0`
- Store completion timestamp for sorting

**Data Source**:
- Existing `checked: boolean` field on tasks
- Filter by `checked === true`
- Sort by completion timestamp (descending)
- No database changes needed

### 4. Manual Override "Apply" Button

**Location**: `app/priorities/components/ManualOverrideControls.tsx` (existing component)

**State Addition**:
```typescript
type ManualOverrideControlsProps = {
  // ... existing props
  onApply?: (override: ManualOverrideState) => Promise<void>; // NEW
  isApplying?: boolean; // NEW loading state
};
```

**Flow**:
1. User adjusts sliders (impact/effort)
2. Changes staged in local state
3. User clicks "Apply" button
4. `onApply` callback triggers:
   - POST `/api/tasks/[id]/override` with new scores
   - Instant re-ranking (<100ms target)
   - Reasoning regenerates on next agent cycle
5. Drawer stays open showing new position

**Performance Target**:
- Re-ranking: <100ms (client-side sort, no agent call)
- Visual update: Instant (optimistic UI)
- Drawer remains open with success indicator

### 5. Filter Persistence (localStorage)

**Storage Key**: `'task-filter-preference'`

**Schema**:
```typescript
type FilterPreference = {
  strategy: SortingStrategy; // Current filter
  savedAt: number; // Timestamp for staleness check
};
```

**Lifecycle**:
- **Load**: On page mount, read from localStorage
- **Save**: On filter change, write to localStorage
- **Default**: `'focus_mode'` for first-time users
- **Staleness**: No expiry (persists indefinitely)

**Implementation**:
```typescript
const loadFilterPreference = (): SortingStrategy => {
  if (typeof window === 'undefined') return 'focus_mode';
  const stored = localStorage.getItem('task-filter-preference');
  if (!stored) return 'focus_mode';
  try {
    const parsed = JSON.parse(stored) as FilterPreference;
    return SortingStrategySchema.parse(parsed.strategy);
  } catch {
    return 'focus_mode';
  }
};

const saveFilterPreference = (strategy: SortingStrategy) => {
  if (typeof window === 'undefined') return;
  const pref: FilterPreference = { strategy, savedAt: Date.now() };
  localStorage.setItem('task-filter-preference', JSON.stringify(pref));
};
```

## Behavioral Changes (No Schema Changes)

### 1. Remove 20% Manual Task Boost

**Location**: `lib/mastra/agents/prioritizationGenerator.ts:56`

**Current Behavior**:
```typescript
// Prompt line 56:
"**MANUAL TASK BOOST**: If `is_manual=true`, multiply impact score by 1.2 (20% boost)"
```

**New Behavior**:
```typescript
// Line 56 removed entirely
// Manual tasks scored identically to AI tasks
```

**Validation**:
- Unit test: Manual task with impact:8, effort:12h receives same priority as AI task with identical scores
- Integration test: Mixed task list shows manual/AI interleaved by pure score, no source bias

### 2. Agent Retry Logic (3 Attempts)

**Location**: `lib/services/prioritizationLoop.ts` (existing service)

**Current Flow**:
```
Agent call → Parse JSON → Validate schema → Return result
```

**New Flow**:
```
Agent call → Parse JSON → Validate schema (includes brief_reasoning)
  ↓ (if validation fails)
Retry 1 → Parse → Validate
  ↓ (if validation fails)
Retry 2 → Parse → Validate
  ↓ (if validation fails)
Retry 3 → Parse → Validate
  ↓ (if validation fails)
Fallback: Set brief_reasoning = "Priority: [rank]"
```

**Telemetry**:
- Log retry attempts: `console.log('[PrioritizationLoop] Brief reasoning validation failed, retry X/3')`
- Track success rate: Target ≥98% success within 3 attempts

## Type Definitions

### BriefReasoning

```typescript
/**
 * Brief, outcome-linked reasoning for task priority (≤20 words)
 * @example "Unblocks #3, #7 • Enables payment feature"
 * @example "Addresses user complaint from reflection 'slow checkout'"
 */
export type BriefReasoning = string;
```

### FocusModeFilter

```typescript
/**
 * Filter combining Quick Wins + Strategic Bets
 * Reduces task count by 40-60% for typical users
 */
export type FocusModeFilter = {
  includeQuadrants: ['high_impact_low_effort', 'high_impact_high_effort'];
  excludeQuadrants: ['low_impact_low_effort', 'low_impact_high_effort'];
};
```

### CompletedTaskPage

```typescript
/**
 * Pagination state for completed tasks section
 */
export type CompletedTaskPage = {
  tasks: Task[];
  page: number;
  pageSize: 10;
  totalCount: number;
  hasMore: boolean;
};
```

## Edge Cases

### Brief Reasoning Edge Cases

1. **Exceeds 20 words**: Truncate with "..." and show full in drawer
2. **No dependencies**: Focus on outcome impact, not dependency links
3. **Agent failure (3 retries)**: Fallback to "Priority: [rank]"
4. **Empty/null reasoning**: Validation fails, triggers retry
5. **Generic phrases**: Validation rejects, triggers retry with prompt hint

### Filter Persistence Edge Cases

1. **First-time user**: Default to `'focus_mode'`
2. **Invalid stored value**: Default to `'focus_mode'`
3. **localStorage disabled**: In-memory state only, no persistence
4. **Page reload**: Restore filter from localStorage

### Completed Tasks Edge Cases

1. **≤10 completed tasks**: Hide "Show more" button
2. **0 completed tasks**: Show "No completed tasks yet"
3. **Rapid completion**: Optimistic UI update, poll for confirmation
4. **Completion undo** (future): Move back to active list

### Manual Override Edge Cases

1. **Close drawer without "Apply"**: Discard changes
2. **Apply with invalid scores**: Validate before API call
3. **Network failure**: Show error, retry option
4. **Concurrent edit**: Last write wins (no conflict resolution v1)

## Migration Plan

**No database migrations required.** All changes are:
- Agent output schema extensions (backward-compatible)
- UI state management (localStorage)
- Component structure simplification
- Behavioral logic changes (removing boost)

**Rollback Strategy**:
- Agent prompt: Revert to previous version
- UI components: Feature flag for new vs old TaskRow
- localStorage: Ignore stored preferences if needed

## Testing Requirements

### Schema Validation Tests

- BriefReasoningSchema: Word count, character length, generic phrase rejection
- Focus mode filter: Quadrant inclusion/exclusion logic
- Agent output: Full per_task_scores validation with brief_reasoning

### Integration Tests

- Manual task scoring: No boost applied
- Agent retry: 3-attempt cycle with fallback
- Filter persistence: localStorage read/write cycle
- Completed tasks: Pagination with "Show more"
- Manual override: "Apply" button triggers re-rank <100ms

### Contract Tests

- Agent output schema includes brief_reasoning
- Focus mode strategy exists in enum
- CompletedTasksSection renders pagination controls

## Performance Considerations

### Brief Reasoning Validation

- **Cost**: ~50ms per validation (Zod schema parse)
- **Retry overhead**: 150ms max (3 attempts × 50ms)
- **Optimization**: Cache validation results for duplicate tasks

### Filter Persistence

- **Read**: ~1ms (localStorage.getItem + JSON.parse)
- **Write**: ~2ms (JSON.stringify + localStorage.setItem)
- **Impact**: Negligible (<5ms total on page load)

### Completed Tasks Pagination

- **Initial render**: 10 tasks (fast)
- **"Show more"**: 10 tasks per click (incremental load)
- **Memory**: ~1KB per task × 50 tasks max = 50KB (acceptable)

### Manual Override "Apply"

- **Target**: <100ms re-ranking
- **Strategy**: Client-side sort (no agent call)
- **Reasoning regeneration**: Next agent cycle (async, not blocking)

## References

- Current schemas: `lib/schemas/` directory
- Agent output: `lib/mastra/agents/prioritizationGenerator.ts`
- Sorting strategies: `lib/schemas/sortingStrategy.ts`
- Manual override: `lib/schemas/manualOverride.ts`
- Feature spec: `specs/001-trust-focused-task/spec.md`
- Research: `specs/001-trust-focused-task/research.md`
