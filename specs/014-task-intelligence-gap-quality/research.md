# Research: Task Intelligence (Gap & Quality Detection)

**Feature Branch**: `014-task-intelligence-gap-quality`
**Created**: 2025-01-13
**Spec**: [spec.md](./spec.md)

## Existing Patterns Analysis

### 1. Gap Detection (Phase 5 - Dependency-Based)

**Location**: `lib/services/gapDetectionService.ts`

**Current Approach**:
- Detects gaps between task pairs using 4 heuristic indicators:
  - **Time gap**: >7 days between task creation dates
  - **Action type jump**: ≥2 workflow stage jumps (research→design→plan→build→test→deploy→launch)
  - **No dependency**: Missing explicit prerequisite/blocking relationship
  - **Skill jump**: Complete skill set change (frontend→backend, design→devops)
- Confidence scoring: 2 indicators = 0.6, 3 = 0.75, 4+ = 0.75-1.0
- Cycle detection using BFS to prevent circular dependencies
- Generates bridging tasks via `lib/mastra/tools/suggestBridgingTasks.ts`

**Gaps in Current Implementation**:
- No semantic/conceptual gap detection (only structural)
- No task quality evaluation
- No coverage analysis against outcome goals
- Limited to dependency chain gaps, not goal-task alignment gaps

### 2. AI Structured Extraction (Confidence Scoring)

**Location**: `lib/services/aiSummarizer.ts`

**Current Approach**:
- Uses GPT-4o with Vercel AI SDK `generateObject` for deterministic JSON output
- Zod schema validation for all AI outputs
- Confidence scoring based on output completeness (0.0-1.0 scale)
- Retry-once logic with adjusted temperature/tokens (FR-010 pattern)
- OCR placeholder detection to penalize hallucinated content

**Reusable Patterns**:
- `calculateConfidence()` function for scoring AI outputs
- Retry mechanism: first attempt (temp=0.7), second attempt (temp=0.3)
- Prompt engineering for structured output with clear guidelines

### 3. Vector Embeddings & Semantic Search

**Location**:
- `lib/services/embeddingService.ts` - OpenAI text-embedding-3-small generation
- `lib/services/vectorStorage.ts` - Supabase pgvector operations
- `lib/mastra/tools/semanticSearch.ts` - Mastra tool for agent access

**Current Approach**:
- 1536-dimension embeddings stored in `task_embeddings` table
- Cosine similarity search with dynamic threshold fallback (0.7 → 0.5 → 0.3)
- IVFFlat index for performance (lists=100, target <500ms p95)
- Rate limiting: max 3 concurrent embedding requests

**Reusable for P10**:
- `calculateCosineSimilarity()` function for coverage analysis
- Embedding cache to avoid regenerating for existing tasks
- Dynamic threshold pattern for coverage gap detection

### 4. Agent Session Storage

**Location**: `supabase/migrations/011_create_agent_sessions.sql`, `022_add_agent_sessions_result_column.sql`

**Current Schema**:
```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  outcome_id UUID REFERENCES user_outcomes(id),
  status agent_session_status_enum, -- running/completed/failed
  prioritized_plan JSONB,
  execution_metadata JSONB,
  result JSONB, -- Added in migration 022 for gap analysis
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Planned Extension for P10**:
- Store coverage analysis in `result.coverage_analysis` JSONB field
- Store quality assessments in `result.quality_assessments` JSONB field
- Maintain backward compatibility with Phase 5 gap filling

### 5. Task Embeddings Table

**Location**: `supabase/migrations/008_create_task_embeddings.sql`

**Current Schema**:
```sql
CREATE TABLE task_embeddings (
  id UUID PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  task_text TEXT NOT NULL,
  document_id UUID REFERENCES processed_documents(id),
  embedding vector(1536) NOT NULL,
  status TEXT CHECK (status IN ('completed', 'pending', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Planned Extension for P10**:
- Add `quality_metadata JSONB` column for storing quality scores
- Structure: `{ clarity_score, verb_strength, specificity, granularity, improvement_suggestions[] }`
- No migration needed if using JSONB - just start writing to new field

## Dependencies & Constraints

### AI Model Requirements

**Primary Model**: GPT-4o-mini (cost optimization per FR-015)
- Coverage gap detection: semantic analysis of outcome vs task cluster
- Quality evaluation: clarity scoring, specificity checks
- Draft task generation: max 3 per gap concept
- Quality remediation suggestions

**Embedding Model**: text-embedding-3-small (existing)
- Outcome embedding for coverage analysis
- Task cluster centroid calculation
- Deduplication between Phase 10 and Phase 5 suggestions

### Performance Constraints

**FR-012**: Gap analysis asynchronous, <3s at P95
- Coverage calculation: cosine similarity (vectorized, ~10ms for 50 tasks)
- Quality heuristics: parallel evaluation, ~50ms per task
- AI calls: batch where possible, use streaming for UX feedback

**FR-021**: Real-time quality badge updates
- Debounce 300ms for rapid edits (FR-022)
- Incremental recalculation (only affected tasks)
- Optimistic UI updates while background recalculates
- Target: <500ms recalculation latency

**FR-017**: Support up to 50 tasks per cycle
- OpenAI API batch limits: 100 requests/min (safe for 50 tasks)
- Database query optimization: single SELECT for all task metadata
- Embedding similarity: vectorized operations in Supabase

### Error Handling Strategy

**FR-018**: Retry-once for AI failures, fallback to heuristics
- Timeout: OpenAI default 60s → retry once → fallback
- Rate limit: 429 status → wait 2s → retry once → fallback
- Service down: 503 status → retry once → fallback

**Fallback Heuristics** (FR-020):
- Task length: 10-30 chars=0.7, 31-80=0.9, <10 or >100=0.4
- Verb strength: Build/Test/Deploy=strong (0.9), Improve/Fix=weak (0.5)
- Metric detection: contains numbers = +0.2 clarity bonus
- Total score: average of length + verb + metric checks

### Integration with Existing Features

**Phase 5 Fallback Chain** (FR-025, FR-026, FR-027):
1. Phase 10 runs first: semantic/quality gap detection
2. If coverage <80% after P10 draft acceptance → trigger Phase 5
3. Phase 5 runs: dependency-based gap filling (existing `suggestBridgingTasks`)
4. Deduplication: P10 and P5 suggestions compared via embedding similarity >0.85
5. UI labels: "🎯 Semantic Gap" (P10) vs "🔗 Dependency Gap" (P5)

## Technical Decisions

### 1. Quality Metadata Storage

**Decision**: Store in `task_embeddings.quality_metadata JSONB` column

**Rationale**:
- Colocation with task text and embedding simplifies queries
- JSONB allows schema evolution without migrations
- GIN index on `quality_metadata` enables fast filtering by quality score
- Avoids creating separate `task_quality` table (fewer JOINs)

**Schema**:
```json
{
  "clarity_score": 0.85,
  "verb_strength": "strong",
  "specificity_indicators": {
    "has_metrics": true,
    "has_acceptance_criteria": false,
    "contains_numbers": true
  },
  "granularity_flags": {
    "estimated_size": "small",
    "is_atomic": true
  },
  "improvement_suggestions": [
    "Add acceptance criteria for measurability"
  ],
  "calculated_at": "2025-01-13T10:30:00Z"
}
```

### 2. Coverage Analysis Algorithm

**Decision**: Cosine similarity between outcome embedding and task cluster centroid

**Rationale**:
- Cosine similarity already used in semantic search (proven pattern)
- Centroid calculation: average of all task embeddings (simple, fast)
- Threshold 0.7 for coverage detection (consistent with semantic search)
- Missing concepts extracted via LLM when coverage <70%

**Pseudocode**:
```typescript
// 1. Get outcome embedding
const outcomeEmbedding = await generateEmbedding(outcomeText);

// 2. Calculate task cluster centroid
const taskEmbeddings = await getTaskEmbeddings(taskIds);
const centroid = calculateCentroid(taskEmbeddings);

// 3. Compute coverage score
const coverageScore = calculateCosineSimilarity(outcomeEmbedding, centroid);

// 4. If coverage <0.7, use LLM to extract missing concepts
if (coverageScore < 0.7) {
  const missingConcepts = await extractMissingConcepts(outcomeText, taskTexts);
}
```

### 3. Real-Time Recalculation Strategy

**Decision**: Optimistic UI + debounced background recalculation

**Implementation**:
- User edit → immediate optimistic badge update (assume improvement)
- 300ms debounce timer starts
- After debounce → background async recalculation
- Show pulsing animation on affected badges during recalc
- Replace optimistic value with actual score when complete

**Trade-offs**:
- Pro: Instant feedback, no perceived lag
- Pro: Prevents API spam during rapid editing
- Con: Brief inconsistency (1-2s) between optimistic and actual score
- Con: Complexity in managing optimistic vs actual state

### 4. Phase 10 + Phase 5 Integration

**Decision**: Sequential execution with deduplication

**Flow**:
```
User runs prioritization
  ↓
Phase 10: Semantic gap detection (coverage analysis)
  ↓
Generate 🎯 Semantic Gap drafts (max 3 per concept)
  ↓
User accepts/dismisses P10 drafts
  ↓
Recalculate coverage after acceptance
  ↓
If coverage still <80%:
  → Trigger Phase 5: Dependency gap detection
  → Generate 🔗 Dependency Gap drafts
  → Deduplicate: suppress P5 if embedding similarity >0.85 to any P10 draft
  ↓
Display combined modal: P10 drafts at top, P5 drafts at bottom
```

**Why Sequential**:
- P10 (semantic) is broader, addresses conceptual gaps first
- P5 (dependency) is narrower, fills structural gaps second
- Avoids duplicate suggestions (semantic gap often implies dependency gap)

## Open Questions & Risks

### Open Questions

1. **Q**: Should quality badges be visible on task cards in all views (dashboard, priorities, gap modal)?
   - **A**: Yes per FR-004, but consider performance impact (50 tasks × 3 views = 150 badge renders)
   - **Mitigation**: Memoize quality score calculations, lazy load badges on scroll

2. **Q**: How to handle quality score drift when outcome changes?
   - **A**: Recalculate all quality scores after outcome update (acceptable <5s latency for 50 tasks)

3. **Q**: Should dismissed draft concepts persist across sessions?
   - **A**: Per FR-014, only same session. Reset on page refresh or new prioritization run.

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OpenAI API rate limits during batch quality evaluation | High - blocks entire feature | Medium | Implement exponential backoff, fallback to heuristics after 3 retries |
| Phase 10 + Phase 5 combined modal overwhelms user (>10 drafts) | Medium - decision fatigue | Medium | Hard limit: 3 P10 + 3 P5 drafts max, prioritize by confidence |
| Real-time recalculation causes UI jank on low-end devices | Medium - poor UX | Low | Web Worker for background calc, disable animations if fps <30 |
| Coverage score inaccurate for small task sets (<5 tasks) | Low - misleading metric | High | Display warning "Coverage analysis requires ≥5 tasks" when count <5 |

## Performance Targets

| Metric | Target | Baseline | Measurement Method |
|--------|--------|----------|-------------------|
| Coverage analysis latency | <3s p95 | N/A | `console.time` in API route |
| Quality badge render | <500ms p95 | N/A | React DevTools Profiler |
| Real-time recalculation | <500ms p95 | N/A | Performance API timeline |
| Draft task generation | <5s p95 | ~2s (Phase 5) | Agent session `execution_metadata` |
| Deduplication check | <100ms | N/A | Embedding similarity batch query |

## Next Steps

1. **Phase 1 - Design**: Define data models, API contracts, quickstart guide
2. **Phase 2 - Tasks**: Break down into vertical slices (TDD-first)
3. **Phase 3 - Implementation**: Use `/implement` workflow with test-driven approach

## References

- Specification: [spec.md](./spec.md)
- Phase 5 Gap Filling: `specs/011-task-gap-filling/`
- Semantic Search Tool: `lib/mastra/tools/semanticSearch.ts`
- AI Summarizer Patterns: `lib/services/aiSummarizer.ts`
- Constitution: `.specify/memory/constitution.md`
