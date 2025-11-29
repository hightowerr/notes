# Research: Trust-Focused Task List Refactor

**Date**: 2025-01-28
**Feature**: Phase 19 - Trust-Focused Task List Refactor
**Branch**: `001-trust-focused-task`

## Executive Summary

This research documents the current implementation of the task prioritization UI and agent reasoning system, identifying specific files and patterns that must be modified to deliver the trust-focused refactor. The feature focuses on removing UI clutter, unifying manual/AI task treatment, and enhancing agent rationale transparency.

## Current Implementation Analysis

### 1. Task Display Layer (UI Components)

**Primary File**: `app/priorities/components/TaskRow.tsx` (940 lines)

**Current Structure** (lines 571-909):
- **5-column grid layout** on desktop: `grid-cols-[48px_minmax(0,1fr)_120px_96px_48px]`
- **12+ UI elements per task**:
  - Rank number (line 597-606)
  - Lock/unlock button (lines 613-628)
  - Task title editor (lines 629-688)
  - Edit button + status indicators (lines 672-687)
  - Strategic summary scores inline (lines 697-727)
  - Quadrant badge (lines 529-552)
  - Category badge (Leverage/Neutral/Overhead) (lines 776-789)
  - Manual task badge (lines 790-795)
  - Manual override badge (lines 826-830)
  - AI-generated badge (lines 860-874)
  - Dependencies list (lines 880-883)
  - Movement badge (lines 885-890)
  - Completion checkbox (lines 892-908)

**Manual Task Boost** (discovered):
- `lib/mastra/agents/prioritizationGenerator.ts:56`: "**MANUAL TASK BOOST**: If `is_manual=true`, multiply impact score by 1.2 (20% boost) before ranking"
- This creates the inconsistency mentioned in the spec

**Lock Feature** (lines 613-628):
- Button with Lock/Unlock icons
- Conditional styling for locked state
- Must be removed per FR-013

### 2. Prioritization Agent Layer

**Primary File**: `lib/mastra/agents/prioritizationGenerator.ts` (169 lines)

**Current Prompt Structure** (lines 5-113):
- Multi-step process: Check constraints → Filter → Prioritize → Self-evaluate → Assess confidence
- **Output schema** (lines 77-113):
  ```typescript
  {
    thoughts: {
      outcome_analysis,
      negative_constraints_found,
      filtering_rationale,
      prioritization_strategy,
      self_check_notes
    },
    included_tasks: [{ task_id, inclusion_reason, alignment_score }],
    excluded_tasks: [{ task_id, exclusion_reason, alignment_score }],
    ordered_task_ids: ["task-1", "task-2", ...],
    per_task_scores: {
      "task-1": {
        impact, effort, confidence,
        reasoning: { impact_keywords, effort_source, complexity_modifiers },
        dependencies,
        reflection_influence
      }
    },
    confidence, critical_path_reasoning, corrections_made
  }
  ```

**Missing brief_reasoning field**:
- Current schema has `reasoning` object with multiple fields
- Need to add `brief_reasoning: string` (≤20 words) to `per_task_scores`
- Must enforce outcome-linked format with validation

**Manual Task Boost Location** (line 56):
- Explicitly documented in prompt: "multiply impact score by 1.2 (20% boost)"
- Must be removed to achieve FR-004 (identical treatment)

### 3. Filtering & Sorting Layer

**Primary File**: `lib/schemas/sortingStrategy.ts` (92 lines)

**Current Strategies** (lines 64-91):
- `balanced`: All tasks by priority score
- `quick_wins`: High-impact ≤8h effort (lines 70-75)
- `strategic_bets`: High-impact high-effort (lines 76-81)
- `urgent`: Keyword-based 2× boost (lines 82-90)

**Quick Wins Filter Logic** (lines 31-34, 54):
```typescript
const matchesQuickWin = impact! >= HIGH_IMPACT_THRESHOLD && effort! <= LOW_EFFORT_THRESHOLD;
// HIGH_IMPACT_THRESHOLD = 5, LOW_EFFORT_THRESHOLD = 8
```

**Missing Focus Mode**:
- No `focus_mode` strategy combining Quick Wins + Strategic Bets
- Need to add per FR-006 (default filter showing only leverage tasks)

### 4. Page Layout & State Management

**Primary File**: `app/priorities/page.tsx` (2000+ lines)

**Current Default** (lines 136-150):
- No default filter applied
- Shows all tasks initially
- Lock feature integration present (search for "isLocked" throughout)

**Completed Tasks Handling**:
- Currently handled inline, no separate section
- Need to create CompletedTasksSection component per clarification

### 5. Task Details Drawer

**Primary File**: `app/priorities/components/TaskDetailsDrawer.tsx`

**Current Implementation**:
- Exists but needs verification for required content
- Must include: strategic scores, quadrant viz, dependencies, movement history, manual overrides

### 6. Data Schemas

**Relevant Schemas**:
- `lib/schemas/taskScoreSchema.ts` - Must add `brief_reasoning` field
- `lib/schemas/prioritizationResultSchema.ts` - Agent output validation
- `lib/schemas/sortingStrategy.ts` - Add `focus_mode` enum value
- `lib/schemas/manualOverride.ts` - Existing manual override state structure

## Dependencies & Integration Points

### Existing Infrastructure (NO CHANGES NEEDED)

**Database**:
- `agent_sessions` table - Stores prioritization results
- `manual_tasks` table (migration 029) - Manual task storage
- `reflections` table - User reflections
- `user_outcomes` table - Outcome definitions

**Services** (lib/services/):
- `prioritizationLoop.ts` - Orchestrates agent calls
- `manualTaskPlacement.ts` - Manual task scoring (contains boost logic)
- `reflectionAdjuster.ts` - Reflection effects
- `retryQueue.ts` - Handles agent failures

### Critical Files Requiring Modification

1. **Agent Prompt** (`lib/mastra/agents/prioritizationGenerator.ts`):
   - Remove 20% manual boost (line 56)
   - Add brief_reasoning field to output schema
   - Add validation for outcome-linked format
   - Implement retry logic (3 attempts) for failed validation

2. **Task Row Component** (`app/priorities/components/TaskRow.tsx`):
   - Simplify to 4-5 elements: rank, indicator, title, brief reasoning, checkbox
   - Remove: lock button, inline scores, category badges, AI badge, dependencies, movement (move to drawer)
   - Add "Details →" link for drawer
   - Remove ManualTaskBadge from main view (lines 790-795)

3. **Sorting Strategies** (`lib/schemas/sortingStrategy.ts`):
   - Add `focus_mode` strategy (Quick Wins + Strategic Bets)
   - Fix Quick Wins filter if broken

4. **Page Layout** (`app/priorities/page.tsx`):
   - Set default filter to `focus_mode`
   - Add localStorage persistence for filter selection
   - Create CompletedTasksSection component
   - Remove lock feature state management

5. **Manual Task Service** (`lib/services/manualTaskPlacement.ts`):
   - Remove 20% boost from scoring logic
   - Ensure identical treatment with AI tasks

## Technical Constraints

### Must Keep (from spec)
- Existing sorting algorithms (extend, don't replace)
- Agent architecture (prompt changes only)
- Current design system tokens
- Existing task types (manual = task, AI = task)
- Document processing pipeline (out of scope)

### Must Remove (from spec)
- Lock feature entirely
- Category badges from main view
- AI-generated badge from main view
- Strategic scores inline
- Dependencies list from main view
- Movement badge from prominent position
- 20% manual task boost
- ManualTaskBadge from main view

### Performance Targets (from spec)
- Drawer opens in <200ms desktop, <500ms mobile
- Manual override "Apply" triggers re-ranking in <100ms
- Agent reasoning validation retry succeeds within 3 attempts for ≥98% of tasks

## Mobile-First Considerations

**Current Mobile Layout** (TaskRow.tsx lines 578-596):
- Uses `grid-cols-1` on mobile, switches to 5-column grid on `lg:`
- Mobile labels use `MobileFieldLabel` component (lines 85-91)
- Border and rounded corners on mobile, flat list on desktop

**Target Mobile Layout** (320px viewport):
- Card-based layout with `flex-col` stacking
- All touch targets ≥44px (WCAG AAA)
- Typography scales up (18px title on mobile)
- No horizontal scroll
- Drawer becomes full-screen overlay (<768px)

## Risk Areas

1. **Agent Prompt Changes**: Altering prompt structure may affect prioritization quality → A/B test with 10% traffic
2. **Lock Removal**: Power users may depend on it → User testing (n=10) before removal
3. **Brief Reasoning Validation**: Generic phrases must be rejected → Retry mechanism (3 attempts)
4. **Filter State Persistence**: localStorage vs database → Use localStorage per clarification
5. **Manual Override Flow**: "Apply" button timing → Must be instant (<100ms re-rank)

## Next Steps (Phase 1)

1. Design data model for brief_reasoning field addition
2. Create API contracts for:
   - Agent reasoning validation
   - Filter persistence (localStorage, no API needed)
   - Completed tasks pagination
   - Manual override "Apply" endpoint
3. Document mobile responsive breakpoints
4. Create quickstart manual test guide

## References

- Current TaskRow: `app/priorities/components/TaskRow.tsx`
- Agent prompt: `lib/mastra/agents/prioritizationGenerator.ts`
- Sorting strategies: `lib/schemas/sortingStrategy.ts`
- Page layout: `app/priorities/page.tsx`
- Shape Up Pitch: `docs/shape-up-pitches/phase-19-trust-focused-task-list-refactor.md`
