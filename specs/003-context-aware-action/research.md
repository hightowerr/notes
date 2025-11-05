# Research: Context-Aware Action Extraction

## Research Summary

All clarifications resolved via `/clarify` command (5 questions answered). This document consolidates technical research from Phase 0 of plan.md.

## Key Decisions

### 1. Semantic Similarity Approach
**Decision**: Vercel AI SDK `embed()` + OpenAI text-embedding-3-small + cosine similarity

**Rationale**:
- Consistent with existing AI stack (already using Vercel AI SDK for summarization)
- Cost-effective: $0.02/1M tokens
- Fast: 1536-dimensional embeddings, O(n) similarity computation
- 90% threshold = cosine similarity ≥0.90

**Alternatives Rejected**:
- Keyword matching only → Misses semantic relationships
- Fine-tuned model → Overkill for P0
- Local embedding model → Infrastructure complexity

### 2. Time/Effort Estimation
**Decision**: AI-driven estimation via structured output during extraction

**Rationale**:
- GPT-4o already analyzing action text
- No external tools needed
- Deterministic via Zod schema

**Schema Extension**:
```typescript
actions: z.array(z.object({
  text: z.string(),
  estimated_hours: z.number().min(0.25).max(8),
  effort_level: z.enum(['high', 'low']),
  category: z.enum(['leverage', 'neutral', 'overhead'])
}))
```

### 3. Multi-Criteria Filtering Algorithm
**Decision**: Three-phase cascade filter

**Phases**:
1. Relevance filter (≥90% threshold) - hard cutoff
2. Capacity filter (cumulative time ≤ daily hours)
3. State-based priority (effort preference for sorting)

**Complexity**: O(n log n) for sorting, acceptable for n=10-30 actions

### 4. Database Schema
**Decision**: Extend existing tables (user_outcomes, processed_documents)

**Changes**:
- user_outcomes: +2 columns (state_preference, daily_capacity_hours)
- processed_documents: +1 column (filtering_decisions JSONB)

**Rationale**:
- Minimal schema impact
- Backward compatible (nullable fields)
- Co-located data (context with outcome)

### 5. UI Integration
**Decision**: Extend OutcomeBuilder.tsx modal

**New Fields** (below clarifier):
- State: Radio buttons ("Energized" | "Low energy")
- Capacity: Number input (0.5-24 hours)

**Rationale**:
- Users already familiar with outcome flow
- No new navigation required
- Conceptual cohesion (outcome + context set together)

## Technical Feasibility Confirmed

✅ Vercel AI SDK supports embeddings (tested in existing codebase)
✅ Cosine similarity computation straightforward
✅ Supabase supports JSONB + GIN indexes
✅ OutcomeBuilder.tsx extensible (uses React Hook Form)
✅ Backward compatibility maintained (nullable fields)

## Performance Estimates

- Embedding API calls: ~500ms
- Cosine similarity: <100ms (after embeddings)
- Filtering algorithm: <50ms (sort + filter)
- Database writes: ~200ms
- **Total overhead**: <2s (well within <8s budget)

## Dependencies

**No new external dependencies required**:
- Vercel AI SDK (existing)
- Zod (existing)
- Supabase client (existing)
- React Hook Form (existing)

**New internal modules**:
- `lib/services/filteringService.ts` (new)
- `lib/schemas/filteringSchema.ts` (new)

## Risks & Mitigation

**Risk 1**: 90% threshold too strict (no actions pass)
- **Mitigation**: Log warning, offer to "show all" or adjust outcome

**Risk 2**: AI estimation inaccurate (time/effort)
- **Mitigation**: Fallback defaults (1.0h, 'high' effort), user can see raw actions

**Risk 3**: Embedding API rate limits
- **Mitigation**: Batch embeddings, retry with backoff (existing pattern)

## Research Complete

All unknowns resolved. No blockers. Ready for implementation.
