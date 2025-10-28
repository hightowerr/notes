# Implementation Plan: Context-Aware Dynamic Re-Prioritization

**Branch**: `010-docs-shape-pitches` | **Date**: 2025-10-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-docs-shape-pitches/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path ✓
   → Spec loaded successfully
2. Fill Technical Context ✓
   → Project Type: web (Next.js application)
   → Structure Decision: Single Next.js project with app/ directory
3. Fill Constitution Check section ✓
4. Evaluate Constitution Check section ✓
   → PASS - No violations, all requirements align with constitution
5. Execute Phase 0 → research.md ✓
   → research.md complete with 5 key decisions
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md ✓
   → All artifacts generated successfully
7. Re-evaluate Constitution Check section ✓
   → PASS - Design maintains constitutional compliance
8. Plan Phase 2 → Describe task generation approach ✓
   → Task planning approach documented
9. STOP - Ready for /tasks command ✓
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

This feature makes the existing reflection system discoverable and actionable by surfacing reflections at the decision point (priorities page) and enabling instant priority adjustments (<500ms) when users toggle context on/off. The system uses semantic similarity matching between reflections and tasks to boost relevant priorities and demote contradictory ones, with recency weighting (step function: 100%/50%/25% at 0-7/8-14/14+ days). Users see visual movement badges explaining why tasks shifted, maintaining transparency without requiring full 30-second agent re-runs.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: Next.js 15.5, React 19, Vercel AI SDK, Supabase (pgvector), Mastra 0.21, Zod 3.24
**Storage**: Supabase PostgreSQL with pgvector extension (existing task_embeddings table), reflections table with is_active_for_prioritization column
**Testing**: Vitest 2.1, Testing Library, contract tests, integration tests
**Target Platform**: Web (browser, responsive mobile-first design)
**Project Type**: web (Next.js application with App Router)
**Performance Goals**: <500ms adjustment (p95), <100ms toggle UI response, ≤30s full agent re-run
**Constraints**: Debounce 1000ms for rapid toggles, show only 5 recent reflections, preserve append-only reflection history
**Scale/Scope**: Extends existing priorities page, adds 3 new components (ContextCard, TaskMovementBadge, ErrorSummaryBanner if needed), 1 new API endpoint (/api/agent/adjust-priorities), updates existing agent_sessions schema

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with AI Note Synthesiser Constitution v1.1.5:

- [x] **Autonomous by Default**: Reflection-based adjustment triggers automatically on toggle (user-initiated, not manual recalc); system auto-applies recency weighting
- [x] **Deterministic Outputs**: Adjusted plan follows existing prioritizedPlanSchema with added adjustment metadata (diff, confidence_scores); toggle state persisted with Zod validation
- [x] **Modular Architecture**: New reflectionBasedRanking service decoupled from agent orchestration; ContextCard component independent; adjustment endpoint reusable
- [x] **Test-First Development**: Contract tests for /adjust-priorities endpoint, integration tests for toggle→adjustment→UI flow, unit tests for semantic matching and recency weighting
- [x] **Observable by Design**: Server-side logging for SM-001 (reflection usage), adjustment duration metrics for PR-001, error logging for rollback scenarios
- [x] **Vertical Slice Architecture**: Each acceptance scenario deliverable as slice (SEE: ContextCard UI, DO: toggle reflection, VERIFY: task movement badges)

**No violations identified.** All requirements align with constitutional principles.

## Project Structure

### Documentation (this feature)
```
specs/010-docs-shape-pitches/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── POST_adjust_priorities.json
│   ├── POST_reflections_toggle.json
│   └── GET_reflections_recent.json
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
app/
├── api/
│   ├── agent/
│   │   ├── adjust-priorities/
│   │   │   └── route.ts              # NEW: Instant adjustment endpoint
│   │   └── prioritize/
│   │       └── route.ts              # UPDATED: Store baseline_plan
│   └── reflections/
│       ├── route.ts                  # UPDATED: Add recency weight calculation
│       └── toggle/
│           └── route.ts              # NEW: Toggle endpoint
├── priorities/
│   ├── page.tsx                      # UPDATED: Add ContextCard integration
│   └── components/
│       ├── ContextCard.tsx           # NEW: Pre-prioritization context UI
│       ├── TaskMovementBadge.tsx     # NEW: Visual diff component
│       ├── TaskList.tsx              # UPDATED: Show movement badges
│       └── TaskRow.tsx               # UPDATED: Display adjustment reasons
└── components/
    └── ReasoningTracePanel.tsx       # UPDATED: Show context summary

lib/
├── services/
│   ├── reflectionBasedRanking.ts    # NEW: Lightweight re-ranking service
│   └── agentOrchestration.ts        # UPDATED: Store baseline in session
├── schemas/
│   ├── reflectionSchema.ts          # UPDATED: Add is_active_for_prioritization
│   └── agentSessionSchema.ts        # UPDATED: Add baseline_plan, adjusted_plan
└── types/
    └── adjustment.ts                 # NEW: AdjustedPlan, AdjustmentDiff types

__tests__/
├── contract/
│   ├── adjust-priorities.test.ts    # NEW: Contract test for adjustment
│   └── reflections-toggle.test.ts   # NEW: Contract test for toggle
└── integration/
    ├── context-adjustment.test.ts   # NEW: Toggle→adjust→UI flow
    └── recency-weighting.test.ts    # NEW: Step function validation

supabase/
└── migrations/
    └── 015_add_reflection_toggle.sql # NEW: Add is_active_for_prioritization column
```

**Structure Decision**: Single Next.js project with App Router. This is a web application with frontend (React components in app/) and backend (API routes in app/api/). The existing codebase uses this pattern (app/, components/, lib/, __tests__/), so we extend it with new context-aware features while preserving modularity.

## Phase 0: Outline & Research

**Research Tasks**:

1. **Semantic Similarity Matching**
   - Research: How to calculate cosine similarity using existing embeddings (avoid regenerating)
   - Decision criteria: Threshold values (>0.7 boost, <0.3 penalize from pitch), library choice
   - Alternatives: Use existing `calculateCosineSimilarity` from aiSummarizer.ts vs. new implementation

2. **Debounce Strategy**
   - Research: React debounce patterns for rapid state changes (1000ms requirement)
   - Decision criteria: Custom hook vs. lodash.debounce vs. use-debounce library
   - Alternatives: Client-side debounce vs. server-side debounce vs. both

3. **Optimistic UI Updates**
   - Research: Patterns for optimistic toggle with rollback on failure (React Query, SWR, manual)
   - Decision criteria: Consistency with existing reflection toggle patterns
   - Alternatives: Pessimistic (wait for server) vs. optimistic (update immediately)

4. **Recency Weight Calculation**
   - Research: Step function implementation for date-based weighting
   - Decision criteria: Server-side (in reflection fetch) vs. client-side calculation
   - Alternatives: Precompute on insert vs. compute on query vs. compute in ranking service

5. **Baseline Plan Storage**
   - Research: JSON column vs. separate table for baseline/adjusted plans
   - Decision criteria: Query patterns, data size, migration complexity
   - Alternatives: Extend agent_sessions.prioritized_plan vs. new baseline_plan column

**Output**: research.md with decisions for semantic matching, debounce, optimistic UI, recency weighting, and baseline storage

## Phase 1: Design & Contracts

**Entities** (to be detailed in data-model.md):

1. **Reflection** (existing, extended)
   - Add: is_active_for_prioritization BOOLEAN DEFAULT true
   - Add: recency_weight FLOAT (computed from created_at)

2. **AgentSession** (existing, extended)
   - Add: baseline_plan JSONB (original priorities before adjustment)
   - Add: adjusted_plan JSONB (modified priorities after reflection toggles)

3. **AdjustedPlan** (new type)
   - Fields: ordered_task_ids, confidence_scores, diff, adjustment_metadata

4. **AdjustmentDiff** (new type)
   - Fields: moved[], filtered[] with task_id, from/to ranks, reasons

**API Contracts** (to be generated in /contracts/):

1. **POST /api/agent/adjust-priorities**
   - Request: { session_id, active_reflection_ids }
   - Response: { adjusted_plan, performance: { total_ms, ranking_ms } }
   - Validates: session exists, baseline_plan present, reflections valid

2. **POST /api/reflections/toggle**
   - Request: { reflection_id, is_active }
   - Response: { success, reflection }
   - Validates: reflection exists, belongs to user

3. **GET /api/reflections?limit=5&within_days=30**
   - Response: { reflections[] } with is_active_for_prioritization, recency_weight
   - Sorted by created_at DESC

**Contract Tests** (failing initially):
- `__tests__/contract/adjust-priorities.test.ts` - Schema validation
- `__tests__/contract/reflections-toggle.test.ts` - Toggle persistence
- `__tests__/contract/reflections-recent.test.ts` - Recency weight presence

**Integration Test Scenarios** (from user stories):
- Scenario 1: Empty state → Add context → Analyze → See affected tasks
- Scenario 2: Toggle OFF → Priorities adjust <500ms → See movement badges
- Scenario 3: Add reflection after prioritization → Instant adjustment
- Scenario 4: Contradictory context → Tasks demoted (not hidden)
- Edge case: Adjustment failure → Rollback toggle → Error message

**Quickstart Validation**: Manual test checklist covering all acceptance scenarios

**Agent File Update**: Run `.specify/scripts/bash/update-agent-context.sh claude` to add:
- New endpoints: /api/agent/adjust-priorities, /api/reflections/toggle
- New components: ContextCard, TaskMovementBadge
- New service: reflectionBasedRanking
- Recent changes: Context-aware re-prioritization feature

**Output**: data-model.md, contracts/*.json, failing tests, quickstart.md, CLAUDE.md updated

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate vertical slice tasks from acceptance scenarios (not implementation layers)
- Each scenario → one deliverable slice (UI + API + data + feedback)
- Contract tests → prerequisite tasks (must pass before slice implementation)
- Integration tests → validation tasks (must pass after slice delivery)

**Slice Decomposition**:
1. **Slice 1**: Context card empty state (FR-001, FR-002)
   - SEE: Empty ContextCard with "Add Current Context" button
   - DO: Click button → opens ReflectionPanel
   - VERIFY: Can add reflection, see it in context card

2. **Slice 2**: Reflection toggle UI (FR-003, FR-006, FR-007)
   - SEE: Toggle switches next to reflections
   - DO: Toggle reflection on/off
   - VERIFY: State persists across page refresh

3. **Slice 3**: Instant adjustment (FR-005, FR-008, FR-021)
   - SEE: Loading indicator during adjustment
   - DO: Toggle reflection → debounced recalculation
   - VERIFY: Priorities update <500ms, no full agent re-run

4. **Slice 4**: Visual movement feedback (FR-013, FR-014)
   - SEE: Badges on tasks showing "↑ 2 positions"
   - DO: Hover badge → tooltip with reason
   - VERIFY: Movement matches adjustment logic

5. **Slice 5**: Context transparency in trace (FR-015, FR-016)
   - SEE: "Context Used: 3 reflections" in trace panel
   - DO: Expand context section
   - VERIFY: See reflection texts that influenced priorities

**Ordering Strategy**:
- TDD order: Contract tests → Integration test shells → Slice implementation
- Dependency order: Database migration → API endpoints → UI components → Integration
- Mark [P] for parallel work: Contract tests (all independent), Component tests (UI-only)

**Estimated Output**: ~20-25 vertical slice tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*No violations identified - section intentionally empty*

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (none in spec)
- [x] Complexity deviations documented (none)

---
*Based on Constitution v1.1.5 - See `.specify/memory/constitution.md`*
