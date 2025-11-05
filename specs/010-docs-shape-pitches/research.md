# Research: Context-Aware Dynamic Re-Prioritization

**Feature**: 010-docs-shape-pitches
**Date**: 2025-10-26
**Status**: Complete

## Overview

This document records research decisions for implementing instant priority adjustment based on reflection context. The system must achieve <500ms adjustment time while reusing existing embeddings and maintaining semantic accuracy.

---

## 1. Semantic Similarity Matching

### Decision
**Use existing `calculateCosineSimilarity` from lib/services/aiSummarizer.ts**

###Rationale
- Function already exists and is battle-tested for semantic search
- Operates on existing task_embeddings (no regeneration needed)
- Performance: O(n) for n=1536 dimensions (embedding size), well under 500ms budget
- Threshold values from pitch (>0.7 boost, <0.3 penalize) align with OpenAI embedding similarity ranges

### Alternatives Considered
1. **New implementation**: Rejected - reinventing the wheel, no performance benefit
2. **External library (ml-distance)**: Rejected - adds dependency for single function
3. **Database pgvector similarity**: Rejected - adds network latency, harder to debug

### Implementation Notes
```typescript
// Reuse pattern from embeddingService.ts
import { calculateCosineSimilarity } from '@/lib/services/aiSummarizer';

const similarity = calculateCosineSimilarity(
  taskEmbedding.embedding,
  reflectionEmbedding.embedding
);

// Apply thresholds from clarifications
if (similarity > 0.7) {
  // Boost confidence
} else if (similarity < 0.3) {
  // Penalize confidence
}
```

---

## 2. Debounce Strategy

### Decision
**Client-side debounce using custom React hook (1000ms delay)**

### Rationale
- Reduces unnecessary server requests (user rapidly toggling 5 reflections → 1 API call instead of 5)
- Matches existing pattern in ReflectionInput component (submit debounce)
- Custom hook allows reuse across ContextCard and future components
- 1000ms delay from clarifications balances responsiveness with stability

### Alternatives Considered
1. **lodash.debounce**: Rejected - adds 70KB dependency for single util
2. **use-debounce library**: Considered - good option, but custom hook is 10 lines
3. **Server-side debounce**: Rejected - can't prevent redundant network requests
4. **No debounce**: Rejected - violates FR-021 requirement

### Implementation Notes
```typescript
// New hook: lib/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Usage in ContextCard
const debouncedReflectionIds = useDebounce(activeReflectionIds, 1000);
```

---

## 3. Optimistic UI Updates

### Decision
**Manual optimistic update with rollback (no React Query/SWR)**

### Rationale
- Existing codebase doesn't use React Query or SWR (avoid new dependency)
- Pattern already established in ReflectionInput (immediate local state update)
- Rollback requirement (FR-022) needs explicit control over state reversion
- Simple pattern: setState → API call → rollback on error

### Alternatives Considered
1. **React Query with optimistic updates**: Rejected - 50KB dependency, overkill for single feature
2. **SWR optimistic UI**: Rejected - not used in existing codebase
3. **Pessimistic (wait for server)**: Rejected - violates UX requirement for instant feel

### Implementation Notes
```typescript
// Pattern from ReflectionInput (optimistic state management)
const handleToggle = async (reflectionId: string, isActive: boolean) => {
  // Optimistic update
  setReflections(prev =>
    prev.map(r => r.id === reflectionId
      ? { ...r, is_active_for_prioritization: isActive }
      : r
    )
  );

  try {
    await fetch('/api/reflections/toggle', {
      method: 'POST',
      body: JSON.stringify({ reflection_id: reflectionId, is_active: isActive }),
    });
  } catch (error) {
    // Rollback on failure (FR-022)
    setReflections(prev =>
      prev.map(r => r.id === reflectionId
        ? { ...r, is_active_for_prioritization: !isActive }
        : r
      )
    );
    toast.error('Failed to update reflection');
  }
};
```

---

## 4. Recency Weight Calculation

### Decision
**Server-side calculation on query (compute in reflection fetch endpoint)**

### Rationale
- Step function is simple (3 branches based on date diff)
- Computed fresh on each query → always accurate
- Avoids precompute overhead on every reflection insert
- Centralizes business logic in API layer (easier to test/modify)

### Alternatives Considered
1. **Precompute on insert**: Rejected - weight changes daily, needs background job
2. **Client-side calculation**: Rejected - duplicates logic, harder to test
3. **Compute in ranking service**: Rejected - service shouldn't fetch reflections

### Implementation Notes
```typescript
// In GET /api/reflections route
const calculateRecencyWeight = (createdAt: Date): number => {
  const daysSinceCreation = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Step function from clarifications
  if (daysSinceCreation <= 7) return 1.0;
  if (daysSinceCreation <= 14) return 0.5;
  return 0.25;
};

// Add to reflection objects before response
reflections.map(r => ({
  ...r,
  recency_weight: calculateRecencyWeight(r.created_at),
}));
```

---

## 5. Baseline Plan Storage

### Decision
**Add baseline_plan and adjusted_plan JSONB columns to agent_sessions table**

### Rationale
- Existing table already stores prioritized_plan JSONB (same pattern)
- No additional joins needed for baseline vs. adjusted comparison
- JSONB supports flexible schema evolution (diff structure may change)
- Migration is simple: ALTER TABLE ADD COLUMN (non-breaking)

### Alternatives Considered
1. **Separate baseline_plans table**: Rejected - overkill, adds join overhead
2. **Overwrite prioritized_plan**: Rejected - loses baseline for comparison (FR-012)
3. **Store in agent_sessions.metadata**: Rejected - metadata is for small key-value pairs

### Implementation Notes
```sql
-- Migration 015_add_reflection_toggle.sql
ALTER TABLE agent_sessions
ADD COLUMN baseline_plan JSONB,
ADD COLUMN adjusted_plan JSONB;

-- baseline_plan populated by agent orchestration after full run
-- adjusted_plan populated by /adjust-priorities endpoint
```

---

## Research Summary

All research decisions made with performance (<500ms p95) and simplicity as primary constraints:

1. **Semantic Similarity**: Reuse existing `calculateCosineSimilarity` (0 new dependencies)
2. **Debounce**: Custom React hook, 1000ms delay (10-line implementation)
3. **Optimistic UI**: Manual pattern from existing ReflectionInput (no React Query)
4. **Recency Weight**: Server-side computation on query (step function logic)
5. **Baseline Storage**: JSONB columns in agent_sessions (follows existing pattern)

**No new external dependencies required.** All solutions leverage existing codebase patterns.

---

**Status**: All unknowns resolved, ready for Phase 1 (Design & Contracts)
