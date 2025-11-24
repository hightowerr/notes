# Research: Reflection Intelligence

**Feature Branch**: `015-reflection-intelligence`
**Research Date**: 2025-11-23

## Executive Summary

This research investigates the current reflection system to understand the gap between user expectations (reflections affect priorities) and reality (reflections are ignored until manual analysis). The system needs a Reflection Intelligence Layer that interprets, acts on, and explains reflection effects in real-time.

## Current State Analysis

### Reflection Data Model

**Table**: `reflections` (Migration 006)
```sql
CREATE TABLE reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 10 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active_for_prioritization BOOLEAN DEFAULT true  -- Added in Migration 015
);
```

**Key Observations**:
- No semantic interpretation stored
- No intent classification
- No task effect tracking
- Toggle exists but only controls inclusion in raw text dump to LLM

### Current Reflection Flow

1. User adds reflection via `POST /api/reflections`
2. Reflection stored in database
3. `debounceRecompute()` schedules background recompute
4. `triggerRecomputeJob()` queues a full prioritization run
5. Prioritization agent receives raw reflection text as context
6. No immediate UI feedback on effect

**Critical Gap**: Time from reflection add to visible effect is unbounded (requires manual "Analyze" or waiting for background job).

### Existing Services

#### `lib/services/reflectionService.ts` (236 lines)
- `calculateRecencyWeight(createdAt)`: Step-function weight (1.0/0.5/0.25)
- `formatRelativeTime(createdAt)`: Human-readable time strings
- `enrichReflection(reflection)`: Adds weight and relative_time
- `fetchRecentReflections(userId, options)`: Query with filters
- `createReflection(userId, text)`: Insert and enrich
- `deleteReflection(userId, reflectionId)`: Delete with session cleanup

**Status**: Core service, well-structured, missing intent interpretation.

#### `lib/services/reflectionBasedRanking.ts` (340 lines)
- **DEPRECATED** - Comment at line 169: "Use the unified prioritization flow"
- Uses naive character-frequency matching (26-dim letter vectors)
- `buildNormalizedVector()`: Creates character frequency vector
- `buildAdjustedPlanFromReflections()`: Legacy re-ranking

**Status**: Should be deleted per FR-008.

#### `lib/services/prioritizationLoop.ts` (621 lines)
- `prioritizeWithHybridLoop()`: Main entry point
- Receives `reflections: string[]` as raw text
- Builds context with `reflectionsText` as bullet list
- No semantic interpretation or classification

**Key Code (lines 348-351)**:
```typescript
const reflectionsText =
  input.reflections.length > 0
    ? input.reflections.map(line => `- ${line}`).join('\n')
    : 'No active reflections.';
```

### UI Components

#### `app/priorities/components/ContextCard.tsx`
- **Duplicate CTA Issue**: Two "Add Current Context" buttons
  - Line 205-208: In CardHeader (always visible)
  - Line 271-274: In empty state
- Toggle functionality works but only affects raw text inclusion
- No intent classification display
- No affected task count

#### `app/priorities/components/TaskRow.tsx` (887 lines)
- Has `reflection_influence` display (lines 709-720)
- Shows Lightbulb icon with influence text
- Ready for attribution badge expansion

#### `app/priorities/page.tsx` (2700+ lines)
- **Duplicate Utilities** (lines ~124-171):
  - `calculateFallbackWeight()` - duplicates `reflectionService.calculateRecencyWeight()`
  - `formatFallbackRelativeTime()` - duplicates `reflectionService.formatRelativeTime()`
  - `normalizeReflection()` - duplicates `reflectionService.enrichReflection()`
- `onReflectionAdded()` callback fetches reflections but doesn't trigger immediate adjustment

### API Routes

#### `app/api/reflections/route.ts`
- `POST`: Creates reflection, triggers debounced recompute
- No intent interpretation call
- Returns enriched reflection immediately

#### `app/api/reflections/[id]/route.ts`
- `PATCH`: Toggle active state
- No fast adjustment trigger

## Technical Patterns Found

### Recency Weighting
Used throughout for time-based relevance:
```typescript
function calculateRecencyWeight(createdAt: Date): number {
  const ageInDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (ageInDays <= 7) return 1.0;
  if (ageInDays <= 14) return 0.5;
  return 0.25;
}
```

### Task Score Structure
From `lib/schemas/strategicScore.ts`:
```typescript
type TaskWithScores = {
  id: string;
  title: string;
  impact: number;
  effort: number;
  confidence: number;
  priority: number;
  reflection_influence?: string;  // Already exists!
  // ...
}
```

### Agent Session Storage
Baseline and adjusted plans stored in `agent_sessions` table (Migration 015):
- `baseline_plan JSONB`
- `adjusted_plan JSONB`

## GPT-4o-mini Integration Pattern

From `lib/mastra/agents/prioritizationGenerator.ts`:
- Uses OpenAI via Vercel AI SDK
- Structured output with Zod schemas
- Model: `gpt-4o` for prioritization

For intent classification, GPT-4o-mini is appropriate:
- Faster (~200ms vs ~2s)
- Cheaper
- Sufficient for 5-class classification

## Dependencies Analysis

### Required Services (Exist)
- `lib/services/reflectionService.ts` - Base operations
- `lib/services/prioritizationLoop.ts` - Full prioritization
- `lib/mastra/init.ts` - Mastra initialization
- `lib/supabase/admin.ts` - Database access

### Required Schema Changes
1. New `reflection_intents` table for intent persistence
2. New `reflection_effects` table for task attribution (or inline in tasks)

### Required New Services
1. `lib/services/reflectionInterpreter.ts` - GPT-4o-mini classification
2. `lib/services/reflectionAdjuster.ts` - Fast adjustment engine

## Performance Targets

| Operation | Current | Target | Approach |
|-----------|---------|--------|----------|
| Reflection add → effect | Manual/infinite | <3s | Immediate interpret + adjust |
| Toggle → effect | N/A | <500ms | Cached intent, skip LLM |
| Intent classification | N/A | <200ms | GPT-4o-mini |
| Fast adjustment | N/A | <300ms | Cached baseline + delta |

## Risk Analysis

### Technical Risks

| Risk | Mitigation |
|------|------------|
| LLM latency variance | Optimistic UI, background completion |
| Classification errors | Preview before save, delete + retry |
| Over-blocking | Minimum 5-task floor with warning |
| Conflicting reflections | Priority: hard blocks > soft blocks > boosts |

### Integration Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing flow | Keep deprecated service until full migration |
| Test coverage gaps | Contract tests for all new APIs |
| Mobile performance | Defer heavy computation to server |

## Recommendations

### Phase 1: Cleanup (Estimated: 2-3 hours)
1. Delete `reflectionBasedRanking.ts`
2. Remove duplicate utilities from `priorities/page.tsx`
3. Export shared utilities from `reflectionService.ts`
4. Fix duplicate CTA buttons in ContextCard

### Phase 2: Intelligence Layer (Estimated: 6-8 hours)
1. Create `reflection_intents` table
2. Build `reflectionInterpreter.ts` with GPT-4o-mini
3. Build `reflectionAdjuster.ts` for fast adjustments
4. Update `/api/reflections` POST to call interpreter

### Phase 3: Integration (Estimated: 4-6 hours)
1. Auto-trigger adjustment on reflection add
2. Add attribution badges to TaskRow
3. Fast toggle path (skip LLM, use cached intent)
4. Loading states and feedback

### Phase 4: Polish (Estimated: 3-4 hours)
1. Intent preview before saving
2. Helpful input prompts
3. Cross-page notification (Home → Priorities)
4. Edge case handling

## Appendix: Code References

### Files to Delete
- `lib/services/reflectionBasedRanking.ts` (340 lines)

### Files to Create
- `lib/services/reflectionInterpreter.ts`
- `lib/services/reflectionAdjuster.ts`
- `lib/schemas/reflectionIntent.ts`
- `supabase/migrations/027_add_reflection_intents.sql`

### Files to Modify
- `lib/services/reflectionService.ts` - Export utilities
- `lib/schemas/reflectionSchema.ts` - Add intent types
- `app/api/reflections/route.ts` - Call interpreter
- `app/api/reflections/[id]/route.ts` - Fast toggle
- `app/priorities/page.tsx` - Remove duplicates, add triggers
- `app/priorities/components/ContextCard.tsx` - Fix duplicate CTA
- `app/priorities/components/TaskRow.tsx` - Attribution badges
