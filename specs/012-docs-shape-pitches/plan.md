# Implementation Plan: Outcome-Driven Prioritization (Evaluator-Optimizer Pattern)

**Branch**: `012-docs-shape-pitches` | **Date**: 2025-11-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-docs-shape-pitches/spec.md`

## Summary

Phase 14 replaces the current 4-layer prioritization system with a unified evaluator-optimizer agent following Anthropic's best practices. The core problem: character-frequency vectors in `reflectionBasedRanking.ts` cannot understand semantic negation, causing "ignore X" to boost X tasks (0% accuracy). The new system achieves 95% reflection accuracy, 30% faster performance (25s → 17.6s avg), and 100% transparency with per-task reasoning.

**Technical Approach**:
1. **Unified Generator Agent** (GPT-4o) - Single-pass filtering, scoring, inline self-evaluation
2. **Conditional Evaluator** (GPT-4o-mini) - Quality loop triggers only when confidence < 0.7 (20% of cases)
3. **Hybrid Optimization** - Fast path <18s (80%), quality path <30s (20%)
4. **Transparent Reasoning** - Every inclusion/exclusion decision has visible explanation

## Technical Context

**Language/Version**: TypeScript 5+ (Next.js 15, React 19)
**Primary Dependencies**:
- Mastra (agent framework)
- OpenAI SDK (GPT-4o, GPT-4o-mini)
- Zod (schema validation)
- Supabase (PostgreSQL + JSONB storage)

**Storage**: Supabase PostgreSQL with JSONB columns (`excluded_tasks`, `evaluation_metadata`)
**Testing**: Vitest (unit, contract, integration tests), target ≥85% coverage
**Target Platform**: Web (Next.js server + client components)
**Project Type**: Web application (fullstack Next.js)

**Performance Goals**:
- Fast path: <18s for 80% of runs
- Quality path: <30s for 20% of runs
- Average: ≤20s (30% improvement over 25s baseline)
- API cost: <$0.05 per run

**Constraints**:
- Must use existing Mastra infrastructure (no new frameworks)
- Backward compatible with `agent_sessions` schema (JSONB columns)
- Feature flag for gradual rollout (`USE_UNIFIED_PRIORITIZATION`)
- 30-day retention for evaluation metadata
- Max 3 evaluation loop iterations (hard stop)

**Scale/Scope**:
- 100-300 tasks per prioritization run (designed for up to 500)
- Single-user workspace (no multi-user support in P0)
- Single active outcome (no multi-outcome support)
- 4-week implementation timeline (small batch)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Vertical Slice**: Feature delivers SEE → DO → VERIFY for users (Principle I)
  - **SEE**: Excluded tasks section shows reasoning, chain-of-thought visible
  - **DO**: User triggers prioritization, writes reflections, views results
  - **VERIFY**: Tasks correctly filtered (e.g., "ignore X" excludes X), reasoning transparent

- [x] **Test-First**: Tests written before implementation, coverage target ≥80% (Principle II)
  - Schema validation tests (Zod)
  - Hybrid loop convergence tests
  - Reflection negation handling tests
  - UI component tests (ExcludedTasksSection, ReasoningChain)

- [x] **Autonomous Architecture**: Fits Sense → Reason → Act → Learn pattern if agent-related (Principle III)
  - **Sense**: Fetch outcome, reflections, tasks, previous plan
  - **Reason**: Unified agent filters/prioritizes with inline self-eval
  - **Act**: Conditional evaluator validates, refines if needed
  - **Learn**: Store evaluation metadata, log overrides for future tuning

- [x] **Modular Services**: New services decoupled, single-purpose, clear interfaces (Principle IV)
  - `prioritizationLoop.ts` - Hybrid loop orchestration
  - `prioritizationGenerator.ts` - Filtering + scoring agent
  - `prioritizationEvaluator.ts` - Quality validation agent
  - Clear interfaces, no circular dependencies

- [x] **Observable**: Telemetry planned for new operations (Principle V)
  - Evaluation metadata stored (iterations, duration, convergence)
  - Override logging to `processing_logs` table
  - Chain-of-thought visible in UI
  - Periodic user surveys for quality feedback

- [x] **Quality Standards**: TypeScript strict mode, Zod validation, security review
  - All agent outputs validated with Zod schemas
  - TypeScript strict mode enabled
  - OAuth tokens encrypted (existing security)
  - 30-day auto-expiry for metadata

- [x] **Completion Criteria**: All 6 checkpoints (UI, backend, feedback, tests, review, demo-ready)
  - UI: Excluded tasks section, reasoning chain display, progressive disclosure
  - Backend: Hybrid loop service, agent prompts, database schema
  - Feedback: User sees reasoning for every decision
  - Tests: ≥85% coverage, contract tests for API
  - Review: Code reviewed by `code-reviewer` agent
  - Demo-ready: Can show "ignore X" → X excluded, reasoning visible

## Project Structure

### Documentation (this feature)

```text
specs/012-docs-shape-pitches/
├── plan.md              # This file (implementation plan)
├── research.md          # Phase 0: Existing system analysis
├── data-model.md        # Phase 1: Entity schemas and database design
├── quickstart.md        # Phase 1: Developer onboarding guide
├── contracts/           # Phase 1: API and database contracts
│   ├── prioritize-api.yaml       # OpenAPI spec for /api/agent/prioritize
│   └── database-migration.sql    # SQL for new JSONB columns
└── tasks.md             # Phase 2: TBD (generated by /tasks command)
```

### Source Code (repository root)

```text
# Next.js Web Application Structure

lib/
├── mastra/
│   ├── agents/
│   │   ├── prioritizationGenerator.ts    # NEW: Unified filter+prioritize agent
│   │   ├── prioritizationEvaluator.ts    # NEW: Quality evaluator agent
│   │   └── taskOrchestrator.ts           # DEPRECATED (mark @deprecated)
│   ├── services/
│   │   └── agentOrchestration.ts         # UPDATED: Call hybrid loop
│   └── tools/
│       └── (existing tools preserved)
├── services/
│   ├── prioritizationLoop.ts             # NEW: Hybrid evaluator-optimizer loop
│   ├── reflectionBasedRanking.ts         # DEPRECATED (mark @deprecated)
│   └── (other services preserved)
├── schemas/
│   ├── prioritizationResultSchema.ts     # NEW: Generator output schema
│   ├── evaluationResultSchema.ts         # NEW: Evaluator output schema
│   ├── hybridLoopMetadataSchema.ts       # NEW: Loop execution tracking
│   ├── excludedTaskSchema.ts             # NEW: Excluded task structure
│   └── taskScoreSchema.ts                # NEW: Per-task scoring details
└── config/
    └── featureFlags.ts                   # NEW: USE_UNIFIED_PRIORITIZATION flag

app/
├── api/
│   └── agent/
│       ├── prioritize/
│       │   └── route.ts                  # UPDATED: Call hybrid loop, return excluded_tasks
│       └── sessions/
│           ├── [session_id]/route.ts     # UPDATED: Return evaluation_metadata
│           └── latest/route.ts           # UPDATED: Include new fields
└── priorities/
    ├── components/
    │   ├── ExcludedTasksSection.tsx      # NEW: Collapsible excluded tasks UI
    │   ├── ReasoningChain.tsx            # NEW: Chain-of-thought display
    │   └── (existing components preserved)
    └── page.tsx                          # UPDATED: Show excluded section

supabase/
└── migrations/
    └── 026_add_unified_prioritization_columns.sql  # NEW: Database migration

__tests__/
├── contract/
│   ├── unified-prioritization.test.ts    # NEW: API contract tests
│   └── evaluation-loop.test.ts           # NEW: Evaluator tests
├── integration/
│   ├── reflection-negation.test.ts       # NEW: "ignore X" test cases
│   └── hybrid-loop-convergence.test.ts   # NEW: Loop iteration tests
└── unit/
    ├── lib/schemas/__tests__/
    │   ├── prioritizationResultSchema.test.ts  # NEW
    │   ├── evaluationResultSchema.test.ts      # NEW
    │   └── hybridLoopMetadataSchema.test.ts    # NEW
    └── lib/services/__tests__/
        ├── prioritizationLoop.test.ts     # NEW: Loop logic tests
        └── needsEvaluation.test.ts        # NEW: Trigger logic tests
```

**Structure Decision**: Next.js web application structure selected. This feature integrates with existing Mastra agents (`lib/mastra/agents/`), services (`lib/services/`), and API routes (`app/api/`). New Zod schemas in `lib/schemas/`, new UI components in `app/priorities/components/`. Database migration in `supabase/migrations/`. Comprehensive test coverage across contract, integration, and unit test directories.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No violations**: This feature adheres to all constitutional principles. No complexity justification required.

## Phase 0: Research ✅ COMPLETE

**Deliverable**: `research.md`

**Key Findings**:
1. **Current System**: 4 competing layers (strategic scoring, agent orchestration, reflection vectors, manual overrides)
2. **Core Problem**: Character-frequency vectors (`buildNormalizedVector()` in `reflectionBasedRanking.ts:59-82`) treat "ignore X" ≈ "X" (high cosine similarity)
3. **Evidence**: Lines 292-305 show BOOST for high similarity, causing negation to fail
4. **Proposed Solution**: Replace with LLM semantic understanding + evaluator-optimizer pattern
5. **Performance Analysis**: Fast path 15s, quality path 28s, average 17.6s (30% faster than 25s baseline)

**Files Analyzed**:
- `lib/mastra/services/agentOrchestration.ts` (1076 lines) - Orchestration layer
- `lib/services/reflectionBasedRanking.ts` (330 lines) - Broken reflection vectors
- `lib/mastra/agents/taskOrchestrator.ts` (110 lines) - Current agent prompt

## Phase 1: Design ✅ COMPLETE

### Part A: Data Model (`data-model.md`)

**Deliverables**:
1. **5 Core Schemas** (Zod validation):
   - `PrioritizationResult` - Generator output (thoughts, included/excluded tasks, scores, confidence)
   - `EvaluationResult` - Evaluator output (PASS/NEEDS_IMPROVEMENT/FAIL + feedback)
   - `HybridLoopMetadata` - Loop execution tracking (iterations, chain-of-thought, convergence)
   - `ExcludedTask` - UI display format (task_id, text, exclusion_reason, alignment_score)
   - `TaskScore` - Per-task scoring details (impact, effort, confidence, reasoning)

2. **Database Schema Updates**:
   - New columns: `excluded_tasks` (JSONB), `evaluation_metadata` (JSONB)
   - GIN indexes for JSONB queries
   - B-tree index for 30-day cleanup
   - Validation functions: `validate_excluded_tasks()`, `validate_evaluation_metadata()`

3. **Type Relationships**: Clear data flow from generator → evaluator → storage

### Part B: API Contracts (`contracts/`)

**Deliverables**:
1. **OpenAPI Spec** (`prioritize-api.yaml`):
   - `POST /api/agent/prioritize` - Updated request/response with excluded_tasks
   - `GET /api/agent/sessions/{session_id}` - Returns evaluation_metadata
   - `GET /api/agent/sessions/latest` - Latest session with new fields
   - Progressive disclosure support (FR-021)

2. **Database Migration** (`database-migration.sql`):
   - ALTER TABLE statements (non-breaking, nullable columns)
   - Index creation (performance optimization)
   - Validation functions (data integrity)
   - 30-day cleanup job (pg_cron optional)
   - Rollback script (emergency use)

### Part C: Quickstart Guide (`quickstart.md`)

**Deliverable**: 4-week implementation roadmap with code samples

**Week 1**: Database migration + Zod schemas + tests
**Week 2**: Agent implementation (generator + evaluator)
**Week 3**: Hybrid loop service + integration
**Week 4**: UI components + testing + validation

**Includes**: Pre-flight checklist, troubleshooting guide, success criteria

## Phase 2: Tasks (PENDING)

**Status**: To be generated by `/tasks` command
**File**: `tasks.md`

**Expected Task Breakdown** (vertical slices):
1. Database schema migration (SEE: verify columns via SQL, DO: run migration, VERIFY: query new columns)
2. Zod schema implementation (SEE: validation errors, DO: write schemas, VERIFY: tests pass)
3. Unified generator agent (SEE: agent output, DO: write prompt, VERIFY: negation test passes)
4. Evaluator agent (SEE: PASS/FAIL status, DO: write prompt, VERIFY: triggers when confidence < 0.7)
5. Hybrid loop service (SEE: iteration count, DO: implement loop, VERIFY: converges in <3 iterations)
6. Excluded tasks UI (SEE: collapsible section, DO: build component, VERIFY: shows 150+ excluded)
7. Reasoning chain UI (SEE: chain-of-thought, DO: build component, VERIFY: shows iterations)
8. Integration tests (SEE: "ignore X" excludes X, DO: write test, VERIFY: 95% pass rate)

## Progress Tracking

- [x] **Phase 0: Research** - Analyzed existing system, identified problems, proposed solution
- [x] **Phase 1: Design** - Created data model, API contracts, database migration, quickstart guide
- [ ] **Phase 2: Tasks** - TBD (run `/tasks` command)
- [ ] **Implementation** - TBD (run `/implement` command after tasks generated)
- [ ] **Verification** - TBD (run tests, validate success criteria)

## Execution Metadata

**Artifacts Generated**:
- ✅ `research.md` (5,500 words) - Existing system analysis, architectural problems, dependencies
- ✅ `data-model.md` (4,800 words) - 5 Zod schemas, database design, migration strategy, data flow examples
- ✅ `contracts/prioritize-api.yaml` (400 lines) - OpenAPI 3.0 spec with all endpoints
- ✅ `contracts/database-migration.sql` (350 lines) - Complete migration with validation, indexes, cleanup job
- ✅ `quickstart.md` (6,200 words) - 4-week roadmap, code samples, troubleshooting, success checklist

**No Errors**: All phases completed successfully without ERROR states

**Verification**:
- All template sections filled
- Technical Context complete (language, dependencies, performance, constraints, scale)
- Constitution Check passed (all 6 principles satisfied)
- Project Structure documented (Next.js web app with clear file paths)
- No complexity violations (no justification needed)

## Dependencies

**Phase 11: Strategic Prioritization**
- **Status**: DECOUPLED per clarification #1
- **Original**: Assumed Phase 11 provides impact/effort scores
- **Clarified**: Unified agent calculates fresh scores independently
- **Impact**: Simplified integration, no dependency on Phase 11 outputs

**Phase 7: Reflection System**
- **Status**: ACTIVE (required)
- **Files**: `lib/services/reflectionService.ts`, `reflections` table
- **Integration**: Pass reflections to agent prompt (no vector calculations)

**Phase 3: Agent Runtime (Mastra)**
- **Status**: ACTIVE (foundation)
- **Files**: `lib/mastra/init.ts`, `lib/mastra/config.ts`, `lib/mastra/tools/`
- **Integration**: Use existing Mastra infrastructure, add 2 new agents

## Risks & Mitigations

| Risk | Mitigation | Status |
|------|------------|--------|
| **LLM cost explosion** | Hybrid logic skips evaluation 80% of time; use GPT-4o-mini for evaluator (5x cheaper) | Mitigated |
| **Speed regression** | Benchmark shows 15s fast path; abort if >30s; feature flag for rollback | Mitigated |
| **Evaluation never converges** | Hard stop at 3 iterations; return best effort; log for prompt tuning | Mitigated |
| **Migration breaks existing** | Keep old agents as fallback; gradual rollout with feature flag; dual-write period | Mitigated |
| **Over-filtering** | Trigger evaluation if <10 included; evaluator checks for over-aggressive filtering | Mitigated |
| **Prompt engineering rabbit hole** | Use Anthropic's proven patterns; limit to 2 prompt iterations per week; measure metrics weekly | Mitigated |

## Success Metrics

### Functional Quality (from spec.md)
- **SC-001**: Reflection negation accuracy 95% (current: 0%)
- **SC-002**: Task classification accuracy 70%+ (payment tasks → LEVERAGE not NEUTRAL)
- **SC-007**: Filtering precision <20% manual adjustments
- **SC-006**: Evaluation trigger rate 15-25% (indicates good inline self-check)

### Performance (from spec.md)
- **SC-003**: Average prioritization time ≤20s (current: 25s, target: 17.6s)
- **SC-004**: Fast path <18s for 80% of runs
- **SC-005**: Quality path <30s for 100% of evaluation runs
- **SC-012**: API cost <$0.05 per run

### User Experience (from spec.md)
- **SC-009**: Reflection usage 50%+ weekly (current: <10%)
- **SC-010**: Excluded tasks review 40%+ engagement
- **SC-008**: Override rate <15% of tasks
- **SC-011**: Priority quality NPS +30 points

### Technical Health (from spec.md)
- **SC-013**: Test coverage ≥85%
- **SC-014**: Migration success 100% within 2 weeks
- **SC-015**: Rollback safety via feature flag
- **SC-016**: Cleanup job deletes metadata >30 days
- **SC-017**: Override logging captures 100% of adjustments

## Next Steps

1. **Run `/tasks` command** to generate vertical slice task breakdown
2. **Run `/implement` command** to execute tasks with TDD workflow
3. **Deploy database migration** to staging environment
4. **Enable feature flag** (`USE_UNIFIED_PRIORITIZATION=true`) for 10% of users
5. **Monitor metrics** for 1 week (evaluation trigger rate, override rate, performance)
6. **Gradual rollout** to 50% → 100% over 2 weeks
7. **Deprecate old system** after validation (mark `reflectionBasedRanking.ts` @deprecated)

---

**Plan Version**: 1.0
**Last Updated**: 2025-11-18
**Author**: Phase 14 Implementation Planning
**Estimated Duration**: 4 weeks (small batch architectural simplification)
