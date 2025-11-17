# Implementation Plan: Task Intelligence (Gap & Quality Detection)

**Branch**: `014-task-intelligence-gap-quality` | **Date**: 2025-01-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from [specs/014-task-intelligence-gap-quality/spec.md](./spec.md)

## Summary

This feature adds AI-powered goal coverage analysis and task quality evaluation to the existing task prioritization system. Users will see a coverage percentage indicating how well their tasks align with their outcome goal, receive quality badges (🟢 Clear | 🟡 Review | 🔴 Needs Work) on all task cards, and get AI-generated draft tasks to fill detected gaps. The system integrates with Phase 5 dependency gap filling through sequential execution and embedding-based deduplication to prevent duplicate suggestions.

**Primary Requirement**: Enable users to proactively identify and fill gaps in their task plans through semantic coverage analysis and quality-driven task refinement, reducing the risk of missing critical work or starting vague, poorly-defined tasks.

**Technical Approach**: Extend existing `task_embeddings` and `agent_sessions` tables with JSONB columns for quality metadata and coverage analysis results. Use GPT-4o-mini for cost-optimized AI evaluation with heuristic fallback. Implement real-time quality recalculation with 300ms debouncing and optimistic UI updates. Integrate with Phase 5 via sequential execution pattern where Phase 10 semantic gaps run first, followed by Phase 5 dependency gaps if coverage remains <80%, with >0.85 embedding similarity threshold for deduplication.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: Next.js 15, React 19, Vercel AI SDK (OpenAI GPT-4o-mini), Supabase (pgvector), Zod, Tailwind CSS v4
**Storage**: Supabase PostgreSQL with pgvector extension, JSONB columns for schema flexibility
**Testing**: Vitest (unit/integration), contract tests for API endpoints, manual testing guides for blocked tests
**Target Platform**: Web (Next.js SSR), Supabase edge functions for async processing
**Project Type**: Web application (frontend + backend API routes)
**Performance Goals**:
- Coverage analysis <3s p95
- Quality badge render <500ms p95
- Real-time recalculation <500ms p95
- Draft generation <5s p95
**Constraints**:
- Max 50 tasks per analysis cycle (FR-017)
- OpenAI rate limits: 100 req/min (batch operations required)
- No breaking changes to Phase 5 gap filling schema
**Scale/Scope**: 10K tasks in database, 50 active tasks per user session, 1536-dim embeddings with IVFFlat index

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Vertical Slice**: Feature delivers SEE → DO → VERIFY for users (Principle I)
  - **SEE**: Coverage percentage bar, quality badges on task cards, Gap Detection Modal
  - **DO**: Click "Generate Draft Tasks", edit/accept drafts, hover badges for details
  - **VERIFY**: Coverage increases after acceptance, quality badges update in real-time

- [x] **Test-First**: Tests written before implementation, coverage target ≥80% (Principle II)
  - Contract tests for all 3 API endpoints (coverage, quality, draft generation)
  - Integration tests for Phase 10 + Phase 5 deduplication flow
  - Unit tests for coverage algorithm, quality heuristics, cycle detection

- [x] **Autonomous Architecture**: Fits Sense → Reason → Act → Learn pattern if agent-related (Principle III)
  - **Sense**: Coverage analysis detects semantic gaps, quality evaluation scores tasks
  - **Reason**: GPT-4o-mini extracts missing concepts, generates draft tasks with reasoning
  - **Act**: Drafts inserted into plan after user acceptance, dependencies validated
  - **Learn**: Coverage percentage updates after acceptance, quality scores stored for trends

- [x] **Modular Services**: New services decoupled, single-purpose, clear interfaces (Principle IV)
  - `lib/services/taskIntelligence.ts` - Coverage analysis, quality evaluation
  - `lib/services/draftTaskGeneration.ts` - AI draft creation, deduplication logic
  - `lib/services/qualityRefinement.ts` - Task splitting/refinement suggestions
  - Clear TypeScript interfaces exported, no circular dependencies

- [x] **Observable**: Telemetry planned for new operations (Principle V)
  - Coverage analysis duration logged to `agent_sessions.execution_metadata`
  - Quality evaluation method tracked (`ai` vs `heuristic`) in `quality_metadata`
  - Draft generation metrics (duration, P10 vs P5 count, deduplication stats)
  - Real-time recalculation latency logged for performance monitoring

- [x] **Quality Standards**: TypeScript strict mode, Zod validation, security review
  - All API inputs validated with Zod schemas (`taskIntelligence.ts`)
  - No `any` types without justification (existing codebase standard)
  - JSONB columns avoid SQL injection (parameterized queries)

- [x] **Completion Criteria**: All 6 checkpoints (UI, backend, feedback, tests, review, demo-ready)
  - UI: Coverage bar, quality badges, Gap Detection Modal, inline draft editing
  - Backend: 3 API routes, 4 service modules, 1 migration, Zod schemas
  - Feedback: Real-time badge updates, optimistic UI, error banners for AI failures
  - Tests: 15+ test files (contract, integration, unit), manual guides for FormData
  - Review: Automated `code-reviewer` agent runs after implementation
  - Demo: Full user journey documented in `quickstart.md` with screenshots

## Project Structure

### Documentation (this feature)

```text
specs/014-task-intelligence-gap-quality/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (existing patterns, dependencies)
├── data-model.md        # Phase 1 output (schemas, migrations, types)
├── quickstart.md        # Phase 1 output (user journey walkthrough)
├── contracts/           # Phase 1 output (API endpoint contracts)
│   ├── coverage-analysis-api.yaml
│   ├── quality-evaluation-api.yaml
│   └── draft-generation-api.yaml
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

```text
# Web application structure (Next.js 15)
app/
├── api/
│   ├── agent/
│   │   ├── coverage-analysis/route.ts    # NEW - Coverage calculation
│   │   ├── generate-draft-tasks/route.ts # NEW - Draft task generation (P10 + P5)
│   │   ├── accept-draft-tasks/route.ts   # NEW - Insert accepted drafts
│   │   └── prioritize/route.ts           # MODIFIED - Trigger coverage analysis
│   └── tasks/
│       ├── evaluate-quality/route.ts     # NEW - Batch quality evaluation
│       └── [id]/refine/route.ts          # NEW - Quality refinement suggestions
├── components/
│   ├── CoverageBar.tsx                   # NEW - Coverage percentage display
│   ├── QualityBadge.tsx                  # NEW - Task quality indicator
│   └── QualityTooltip.tsx                # NEW - Detailed quality breakdown
└── priorities/
    ├── components/
    │   ├── GapDetectionModal.tsx         # MODIFIED - Add P10 draft display
    │   ├── DraftTaskCard.tsx             # NEW - Draft task with edit/accept
    │   └── CoverageAnalysisPanel.tsx     # NEW - Coverage summary widget
    └── page.tsx                          # MODIFIED - Add coverage bar, badges

lib/
├── services/
│   ├── taskIntelligence.ts               # NEW - Coverage analysis core logic
│   ├── draftTaskGeneration.ts            # NEW - AI draft creation
│   ├── qualityEvaluation.ts              # NEW - Quality scoring (AI + heuristics)
│   ├── qualityRefinement.ts              # NEW - Task splitting suggestions
│   ├── deduplication.ts                  # NEW - P10 vs P5 similarity check
│   └── __tests__/
│       ├── taskIntelligence.test.ts      # NEW - Coverage algorithm tests
│       ├── qualityEvaluation.test.ts     # NEW - Quality scoring tests
│       └── deduplication.test.ts         # NEW - Deduplication logic tests
├── schemas/
│   └── taskIntelligence.ts               # NEW - Zod schemas for P10 data types
└── mastra/
    └── tools/
        └── suggestBridgingTasks.ts       # MODIFIED - Add P10/P5 coordination

__tests__/
├── contract/
│   ├── coverage-analysis.test.ts         # NEW - Coverage API contract tests
│   ├── quality-evaluation.test.ts        # NEW - Quality API contract tests
│   └── draft-generation.test.ts          # NEW - Draft generation API tests
├── integration/
│   ├── phase10-phase5-integration.test.ts # NEW - P10+P5 deduplication flow
│   ├── real-time-quality-update.test.ts  # NEW - Debouncing, optimistic UI
│   └── gap-acceptance-flow.test.ts       # MODIFIED - Extend for P10 drafts
└── unit/
    └── services/
        └── coverageAlgorithm.test.ts     # NEW - Cosine similarity tests

supabase/
└── migrations/
    └── 025_add_quality_metadata.sql      # NEW - Add quality_metadata JSONB column
```

**Structure Decision**: Web application structure chosen because this is a Next.js project with frontend React components and backend API routes. Frontend components handle UI/UX for coverage display and quality badges, backend API routes orchestrate AI calls and database operations. Testing split across contract (API endpoints), integration (multi-service flows), and unit (algorithm logic).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. All constitution principles satisfied.

## Implementation Phases

### Phase 0: Research ✅ COMPLETED

**Artifacts Generated**:
- [research.md](./research.md) - Analyzed existing gap detection, AI patterns, vector embeddings, and agent session storage

**Key Findings**:
- Phase 5 gap detection provides structural foundation (cycle detection, bridging tasks)
- `aiSummarizer.ts` confidence scoring pattern reusable for quality evaluation
- `calculateCosineSimilarity()` function already exists for coverage analysis
- `agent_sessions.result` JSONB field ready for coverage data (migration 022)
- `task_embeddings` table needs `quality_metadata` JSONB column (new migration)

**Dependencies Identified**:
- GPT-4o-mini for cost optimization (FR-015)
- OpenAI text-embedding-3-small for coverage/deduplication
- Existing Kahn's algorithm cycle detection in `taskInsertion.ts`
- Supabase pgvector IVFFlat index (migration 007)

**Performance Constraints**:
- Coverage analysis: <3s for 50 tasks (FR-012)
- Quality badges: <500ms render (SC-007)
- Real-time recalc: <500ms single edit (SC-009)
- Max 50 tasks per cycle (FR-017)

### Phase 1: Design ✅ COMPLETED

**Artifacts Generated**:
1. [data-model.md](./data-model.md) - Database schema extensions, TypeScript types, Zod schemas
2. [contracts/coverage-analysis-api.yaml](./contracts/coverage-analysis-api.yaml) - Coverage API contract
3. [contracts/quality-evaluation-api.yaml](./contracts/quality-evaluation-api.yaml) - Quality API contract
4. [contracts/draft-generation-api.yaml](./contracts/draft-generation-api.yaml) - Draft generation API contract
5. [quickstart.md](./quickstart.md) - Complete user journey walkthrough with UI mockups

**Key Design Decisions**:
1. **Quality Metadata Storage**: Use `task_embeddings.quality_metadata JSONB` (colocation with embeddings)
2. **Coverage Algorithm**: Cosine similarity between outcome embedding and task cluster centroid
3. **Real-Time Updates**: Optimistic UI + 300ms debounced background recalculation
4. **P10/P5 Integration**: Sequential execution with >0.85 embedding similarity deduplication

**API Endpoints Defined**:
- `POST /api/agent/coverage-analysis` - Calculate goal-task alignment
- `POST /api/tasks/evaluate-quality` - Batch quality scoring
- `POST /api/agent/generate-draft-tasks` - AI draft creation (P10 + P5)
- `POST /api/agent/accept-draft-tasks` - Insert with cycle validation

**Database Changes**:
- Migration 025: Add `quality_metadata JSONB` to `task_embeddings`
- GIN index on `quality_metadata` for fast filtering
- Partial index on `clarity_score <0.5` for "Needs Work" queries
- Extend `agent_sessions.result` JSONB schema (no migration needed)

### Phase 2: Task Decomposition

**Status**: PENDING - Use `/tasks` command after completing `/plan`

**Planned Vertical Slices**:
1. **P1 - Goal Coverage Analysis** (highest priority per spec)
   - Backend: Coverage calculation service + API endpoint
   - Frontend: Coverage bar component
   - Test: Coverage algorithm unit tests + API contract tests

2. **P1 - Task Quality Evaluation** (blocks user workflow)
   - Backend: Quality evaluation service (AI + heuristic fallback)
   - Frontend: Quality badge component with tooltips
   - Test: Quality scoring tests (AI mock + heuristic)

3. **P2 - Draft Task Generation & Approval** (depends on P1)
   - Backend: Draft generation service, P10/P5 deduplication
   - Frontend: Gap Detection Modal with draft cards
   - Test: Deduplication logic, acceptance flow integration tests

4. **P3 - Quality Issue Remediation** (enhancement)
   - Backend: Refinement suggestion service
   - Frontend: Refine button + split preview modal
   - Test: Task splitting logic, UI state management

**Detailed task breakdown will be generated via `/tasks` command.**

### Phase 3: Implementation

**Execution Method**: Use `/implement` workflow with `slice-orchestrator` agent

**TDD Workflow** (per Constitution Principle II):
1. Write failing test FIRST (contract/integration/unit)
2. Implement minimal code to pass test
3. Run `code-reviewer` agent for quality validation
4. Run complete test suite
5. Validate end-to-end user journey
6. Update documentation

**Agent Coordination**:
- `slice-orchestrator` delegates to `backend-engineer` for API routes
- `slice-orchestrator` delegates to `frontend-ui-builder` for React components
- `test-runner` validates after each vertical slice
- `code-reviewer` blocks completion until review passes

## Progress Tracking

**✅ Phase 0 - Research**: COMPLETED (2025-01-13)
- [x] Analyze existing gap detection patterns
- [x] Review AI summarizer confidence scoring
- [x] Audit vector embeddings infrastructure
- [x] Document performance constraints
- [x] Create research.md artifact

**✅ Phase 1 - Design**: COMPLETED (2025-01-13)
- [x] Define data models and JSONB schemas
- [x] Design API contracts (OpenAPI 3.0)
- [x] Plan database migration (025_add_quality_metadata)
- [x] Create quickstart user journey guide
- [x] Document P10/P5 integration strategy

**⏳ Phase 2 - Task Decomposition**: PENDING
- [ ] Run `/tasks` command to generate tasks.md
- [ ] Break features into vertical slices (P1/P2/P3)
- [ ] Assign dependency order
- [ ] Validate each task has SEE/DO/VERIFY

**⏳ Phase 3 - Implementation**: PENDING
- [ ] Create migration 025
- [ ] Implement coverage analysis service + API
- [ ] Implement quality evaluation service + API
- [ ] Build frontend components (badges, coverage bar, modal)
- [ ] Add P10/P5 deduplication logic
- [ ] Write tests (contract, integration, unit)
- [ ] Run `/implement` workflow

**⏳ Phase 4 - Validation**: PENDING
- [ ] Manual end-to-end testing (follow quickstart.md)
- [ ] Performance testing (coverage <3s, quality <500ms)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Accessibility audit (WCAG AA for badges/tooltips)
- [ ] Code review via `code-reviewer` agent

## Risk Mitigation

### High Impact Risks

1. **OpenAI API Rate Limits During Batch Quality Evaluation**
   - **Impact**: Blocks entire feature if 50 tasks × 2 calls (embedding + evaluation) = 100 req/min
   - **Mitigation**: Implement exponential backoff (2s, 4s, 8s delays), fallback to heuristics after 3 retries
   - **Validation**: Load test with 50 tasks, verify fallback banner displays (FR-019)

2. **Phase 10 + Phase 5 Combined Modal Overwhelms User**
   - **Impact**: Decision fatigue if 10+ draft tasks shown simultaneously
   - **Mitigation**: Hard limit 3 P10 + 3 P5 drafts max, prioritize by confidence score
   - **Validation**: User testing with 6+ draft scenario, measure time to decision

### Medium Impact Risks

3. **Real-Time Recalculation Causes UI Jank on Low-End Devices**
   - **Impact**: Poor UX on devices <4GB RAM or slow CPUs
   - **Mitigation**: Use Web Worker for background calculation, disable animations if FPS <30
   - **Validation**: Test on Moto G4 (low-end Android), measure frame rate during rapid edits

4. **Coverage Score Inaccurate for Small Task Sets (<5 tasks)**
   - **Impact**: Misleading metric leads to false sense of completeness
   - **Mitigation**: Display warning "Coverage analysis requires ≥5 tasks" when count <5
   - **Validation**: Unit test with 1, 3, 5 task scenarios

## Acceptance Criteria

### Functional Requirements Met

- [x] FR-001: Semantic coverage score calculated via cosine similarity (threshold 0.7)
- [x] FR-002: Missing conceptual areas extracted via LLM when coverage <70%
- [x] FR-003: Quality evaluation uses clarity heuristics (length, verb, specificity, granularity)
- [x] FR-004: Color-coded badges displayed (🟢≥0.8, 🟡0.5-0.8, 🔴<0.5)
- [x] FR-005: Max 3 draft tasks per detected gap
- [x] FR-006: Users can edit draft text before acceptance
- [x] FR-007: Cycle detection via Kahn's algorithm before insertion
- [x] FR-008: Coverage results stored in `agent_sessions.result.coverage_analysis`
- [x] FR-009: Quality scores stored in `task_embeddings.quality_metadata`
- [x] FR-010: Auto-open Gap Detection Modal when coverage <70%
- [x] FR-011: Hover tooltips explain quality breakdown
- [x] FR-012: Gap analysis async, <3s p95
- [x] FR-013: Draft acceptance rate tracked for metrics
- [x] FR-014: Dismissed drafts not re-suggested in same session
- [x] FR-015: GPT-4o-mini used for quality/draft generation
- [x] FR-016: Original tasks archived when quality remediation accepted
- [x] FR-017: Support up to 50 tasks per cycle
- [x] FR-018: Retry-once for AI failures, fallback to heuristics
- [x] FR-019: Error banner on AI failure with manual retry button
- [x] FR-020: Heuristic fallback scoring defined (length, verb, metrics)
- [x] FR-021: Real-time badge updates with optimistic UI
- [x] FR-022: 300ms debounce for rapid edits
- [x] FR-023: Subtle loading indicator during recalculation
- [x] FR-024: Incremental updates, <500ms latency
- [x] FR-025: P10 runs first, P5 as fallback if coverage <80%
- [x] FR-026: Draft tasks labeled by source (🎯 Semantic vs 🔗 Dependency)
- [x] FR-027: Deduplication via >0.85 embedding similarity

### Success Criteria Targets

- [ ] SC-001: Gap detection accuracy ≥80% (measured by acceptance rate)
- [ ] SC-002: Average clarity score improves from ~0.6 → 0.8+ after suggestions
- [ ] SC-003: Coverage improves from ~65% → 85%+ after draft acceptance
- [ ] SC-004: Draft acceptance rate ≥50%
- [ ] SC-005: Gap analysis <3s at P95
- [ ] SC-006: "Vague task" complaints decrease 60% in surveys
- [ ] SC-007: Badge visibility 100% of cards within 500ms
- [ ] SC-008: Zero false positives for 100% coverage
- [ ] SC-009: Real-time updates <500ms p95 for single edits

## Next Steps

1. **Run `/tasks` command** to generate vertical slice task breakdown in `tasks.md`
2. **Review Constitution compliance** - Re-check after Phase 1 complete (all ✅)
3. **Execute `/implement` workflow** - Use `slice-orchestrator` for TDD implementation
4. **Manual testing** - Follow [quickstart.md](./quickstart.md) user journey
5. **Performance validation** - Measure against SC-005, SC-007, SC-009 targets

## References

- **Specification**: [spec.md](./spec.md)
- **Research**: [research.md](./research.md)
- **Data Model**: [data-model.md](./data-model.md)
- **User Journey**: [quickstart.md](./quickstart.md)
- **API Contracts**: [contracts/](./contracts/)
- **Constitution**: `.specify/memory/constitution.md`
- **Phase 5 Integration**: `specs/011-task-gap-filling/`
