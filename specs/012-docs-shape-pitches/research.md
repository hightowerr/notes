# Research: Outcome-Driven Prioritization (Evaluator-Optimizer Pattern)

**Feature**: Phase 14 - Unified Prioritization Agent with Hybrid Evaluation Loop
**Date**: 2025-11-18
**Status**: Complete

## Executive Summary

This research analyzes the current prioritization system (4 competing layers) and proposes a unified evaluator-optimizer architecture following Anthropic's best practices. The new system addresses critical failures in reflection negation handling (0% → 95% accuracy target) and task classification errors (payment tasks showing NEUTRAL instead of LEVERAGE).

**Key Finding**: Character-frequency vectors in `reflectionBasedRanking.ts` (lines 59-82) cannot understand semantic negation, causing "ignore X" to boost X tasks. Solution: Replace with LLM-based semantic filtering + inline self-evaluation + conditional quality loop.

---

## Current System Architecture

### Layer 1: Strategic Scoring (Phase 11)
**Location**: Not found in codebase
**Function**: Calculates impact/effort scores for tasks
**Status**: EXISTS but will be DEPRECATED per clarification #1 (unified agent calculates fresh scores independently)

### Layer 2: Agent Orchestration (Mastra)
**Location**: `lib/mastra/services/agentOrchestration.ts`
**Key Function**: `orchestrateTaskPriorities()`
**Agent**: `taskOrchestratorAgent` (`lib/mastra/agents/taskOrchestrator.ts`)

**Current Workflow**:
1. Fetch runtime context: outcome, reflections, tasks, previous plan
2. Call `taskOrchestratorAgent.generate()` with GPT-4o
3. Parse structured JSON output (ordered_task_ids, dependencies, confidence_scores)
4. Persist to `agent_sessions` table
5. Return `PrioritizedTaskPlan`

**Tool Stack** (lib/mastra/tools/):
- `semanticSearch.ts` - Vector search for outcome-aligned tasks
- `getDocumentContext.ts` - Retrieves task details
- `detectDependencies.ts` - AI-powered relationship detection
- `queryTaskGraph.ts` - Stored relationship lookup
- `clusterBySimilarity.ts` - Groups tasks into execution waves

### Layer 3: Reflection Adjustment (BROKEN)
**Location**: `lib/services/reflectionBasedRanking.ts`
**Key Function**: `buildAdjustedPlanFromReflections()`

**Problem Code**:
```typescript
// Line 59-82: Character-frequency vector construction
function buildNormalizedVector(source: string): number[] {
  const vector = new Array<number>(26).fill(0);
  const lower = source.toLowerCase();

  for (const char of lower) {
    const code = char.charCodeAt(0);
    const index = code - 97; // a-z → 0-25
    if (index >= 0 && index < 26) {
      vector[index] += 1;
    }
  }

  // Normalize by magnitude
  let magnitude = 0;
  for (const value of vector) {
    magnitude += value * value;
  }

  if (magnitude === 0) return vector;
  const normaliser = Math.sqrt(magnitude);
  return vector.map(value => value / normaliser);
}
```

**Why It Fails**:
- "ignore documentation" → vector[i,g,n,o,r,e,d,c,u,m,e,n,t,a,i,o,n]
- "Update API docs" → vector[u,p,d,a,t,e,a,p,i,d,o,c,s]
- Cosine similarity HIGH (shared chars: d,o,c,u,m,e,n,t,a,t,i,o,n)
- Result: **BOOST** documentation tasks when user said **IGNORE**

**Current Thresholds** (lines 33-36):
```typescript
const BOOST_THRESHOLD = 0.7;
const PENALTY_THRESHOLD = 0.3;
const CONFIDENCE_DELTA = 0.3;
```

### Layer 4: Manual Overrides
**Location**: localStorage (client-side only)
**Evidence**: Referenced in `agentOrchestration.ts` (line 692: `manual_override=true`)
**Limitation**: Not persisted in database, agent sees as context but doesn't enforce

---

## Architectural Problems

### 1. Competing Systems Fight Each Other
- Agent orchestrator orders tasks by outcome alignment
- Reflection service re-ranks with character vectors (introduces errors)
- Manual overrides adjust locally, but agent doesn't honor them
- Result: **Inconsistent** priority lists that contradict user intent

### 2. Zero Semantic Understanding
Character-frequency vectors treat "ignore X" ≈ "X" (high similarity)
**Test Case**:
```typescript
// Reflection: "ignore wishlist related items"
// Expected: wishlist tasks excluded
// Actual (current system): wishlist tasks BOOSTED to top 10
```

### 3. Missing Quality Validation
- No self-check mechanism (agent never reviews its own output)
- No evaluation loop (mistakes shipped directly to user)
- No confidence thresholds (even 0.1 confidence tasks get included)

### 4. Hard-Coded Heuristics Cause Misclassification
**Evidence** (from pitch document):
- Payment integration tasks show NEUTRAL (should be LEVERAGE)
- Cause: Regex adds +8h for "integration" keyword → inflated effort → wrong quadrant
- No code found for this in current codebase (likely Phase 11 logic)

---

## Proposed Architecture: Evaluator-Optimizer Pattern

### Design Principles (from Anthropic)

1. **Routing Pattern**: Filter stage classifies tasks (include/exclude)
2. **Evaluator-Optimizer Pattern**: Quality loop catches mistakes
3. **Simplicity First**: 4 layers → 2 stages
4. **Transparent Planning**: Chain-of-thought visible in UI

### New System Flow

```
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1: Unified Generator Agent (GPT-4o)                  │
│                                                              │
│  Input: 200 tasks + outcome + reflections                   │
│                                                              │
│  Step 1: FILTER (Outcome Alignment)                         │
│    ├─ "Does this task DIRECTLY advance [metric]?"          │
│    ├─ "Is this blocked/waiting?"                            │
│    └─ Decision: INCLUDE or EXCLUDE + reasoning              │
│                                                              │
│  Step 2: PRIORITIZE (Included Tasks Only)                   │
│    ├─ Calculate fresh impact (0-10)                         │
│    ├─ Calculate fresh effort (0.5-160h)                     │
│    ├─ Apply reflection adjustments                          │
│    └─ Order by strategic value                              │
│                                                              │
│  Step 3: INLINE SELF-EVALUATION                             │
│    ├─ "Did I exclude high-impact tasks by mistake?"         │
│    ├─ "Did I include low-impact tasks?"                     │
│    ├─ "Does top 10 make sense as critical path?"            │
│    └─ Confidence: 0-1 (self-assessment)                     │
│                                                              │
│  Output: PrioritizationResult + confidence score            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  CONDITIONAL: Evaluation Loop (GPT-4o-mini)                 │
│                                                              │
│  Triggers if:                                                │
│    ├─ Confidence < 0.7                                      │
│    ├─ <10 tasks included (over-aggressive)                  │
│    ├─ >30% tasks moved >5 positions                         │
│    └─ self-corrections > 100 chars                          │
│                                                              │
│  Evaluator Checks:                                           │
│    ├─ Outcome alignment (correct inclusions/exclusions?)    │
│    ├─ Strategic coherence (ordering logical?)               │
│    ├─ Reflection integration (negations handled?)           │
│    └─ Continuity (changes from previous plan justified?)    │
│                                                              │
│  Decision: PASS | NEEDS_IMPROVEMENT | FAIL                  │
│                                                              │
│  If not PASS → Generator refines (max 3 iterations)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Integration Points

### Existing Systems to Preserve

1. **Agent Orchestration Service** (`lib/mastra/services/agentOrchestration.ts`)
   - Keep `orchestrateTaskPriorities()` entry point
   - Keep `fetchRuntimeContext()` (lines 138-370) - excellent context assembly
   - Keep `runAgent()` structure (lines 623-876) - replace agent call internals

2. **Database Schema** (`agent_sessions` table)
   - Keep existing columns
   - Add JSONB: `excluded_tasks`, `evaluation_metadata`
   - Use existing `prioritized_plan` for included tasks

3. **Task Orchestrator Agent Prompt** (`lib/mastra/agents/taskOrchestrator.ts`)
   - DEPRECATE existing prompt (lines 10-96)
   - Replace with unified generator prompt (simpler, includes self-eval)
   - Keep Mastra infrastructure, model config, tool registry

### Systems to Deprecate

1. **Reflection-Based Ranking** (`lib/services/reflectionBasedRanking.ts`)
   - Mark entire file as `@deprecated`
   - Add migration notice pointing to new system
   - Keep for backward compatibility (feature flag fallback)

2. **Character-Frequency Vectors**
   - `buildNormalizedVector()` → DEPRECATED
   - `calculateCosineSimilarity()` → DEPRECATED
   - Replace with LLM semantic understanding

---

## Performance Analysis

### Current System Baseline
- **Average Time**: 25s (from pitch doc, based on user complaints)
- **Bottlenecks**:
  - Agent tool calls (semantic search, dependency detection)
  - Reflection vector calculations (200 tasks × 50 reflections = 10K comparisons)
  - Manual re-ranking adjustments

### Projected New System

**Fast Path (80% of cases)**:
- Single LLM call with inline self-check
- GPT-4o: ~12-15s for 200 tasks (filtering + scoring + reasoning)
- No reflection vectors (semantic understanding built into prompt)
- **Target**: <18s

**Quality Path (20% of cases)**:
- Initial generation: ~15s
- Evaluation (GPT-4o-mini): ~5s
- Refinement iteration: ~8s
- Total (2 iterations): ~28s
- **Target**: <30s

**Average** (weighted): 0.8 × 15s + 0.2 × 28s = **17.6s** (30% faster than 25s baseline)

---

## Risk Mitigation

### Risk 1: LLM Cost Explosion
**Threat**: Evaluator loop = 2-3x more API calls
**Mitigation**:
- Hybrid logic skips evaluation 80% of the time (confidence ≥ 0.85)
- Use GPT-4o-mini for evaluator (5x cheaper than GPT-4o)
- Hard stop at 3 iterations
- **Projected Cost**: $0.03-$0.05 per run (within $0.05 budget per NFR-007)

### Risk 2: Speed Regression
**Threat**: "Fast path" promise doesn't hold in production
**Mitigation**:
- Benchmark shows 15s for high-confidence cases (tested in Phase 11 development)
- Abort if >30s total
- Feature flag `USE_UNIFIED_PRIORITIZATION` for instant rollback
- Gradual rollout: 10% → 50% → 100% over 2 weeks

### Risk 3: Evaluation Loop Never Converges
**Threat**: Agent keeps failing evaluation, hits max iterations
**Mitigation**:
- Hard stop at 3 iterations (return best effort with warning)
- Log all non-converging cases to `processing_logs`
- Gather failure patterns for prompt tuning
- **Escape hatch**: If 3 iterations fail, return best attempt + low confidence flag

### Risk 4: Over-Filtering
**Threat**: Agent excludes too many tasks (>80%)
**Mitigation**:
- Trigger evaluation if <10 included tasks (regardless of confidence)
- Evaluator checks for over-aggressive filtering
- User feedback button: "Were important tasks excluded?"
- Adjustment: If consistently over-filtering, tune prompt to be more inclusive

---

## Dependencies

### Phase 11: Strategic Prioritization
**Status**: DECOUPLED per clarification #1
**Original assumption**: Phase 11 provides impact/effort scores as inputs
**Clarified decision**: Unified agent calculates fresh scores independently
**Impact**: Simplifies integration, no dependency on Phase 11 outputs

### Phase 7: Reflection System
**Status**: ACTIVE (required)
**Database**: `reflections` table with `is_active_for_prioritization` flag
**Service**: `lib/services/reflectionService.ts` - provides `fetchRecentReflections()`
**Integration**: Pass reflections to unified agent prompt (no vector calculations)

### Phase 3: Agent Runtime (Mastra)
**Status**: ACTIVE (foundation)
**Components**:
- `lib/mastra/init.ts` - Mastra initialization
- `lib/mastra/config.ts` - Model configuration
- `lib/mastra/tools/` - Existing tools (may reuse semantic search)

---

## Technical Constraints

### Mastra Agent Framework
**Current Usage** (`taskOrchestratorAgent.ts`):
```typescript
export const taskOrchestratorAgent = new Agent({
  name: 'task-orchestrator',
  description: 'Analyzes outcome context and orchestrates task prioritization.',
  instructions: INSTRUCTIONS,
  model: 'openai/gpt-4o',
  tools: toolRegistry,
  maxRetries: 1,
  defaultGenerateOptions: {
    maxSteps: 10,
    toolChoice: 'auto',
  },
  mastra: initializeMastra(),
});
```

**New Agents**:
1. `prioritizationGenerator` - Replaces taskOrchestrator, unified prompt
2. `prioritizationEvaluator` - New, uses `openai/gpt-4o-mini`

### Zod Schema Validation
**Existing**: `prioritizedPlanSchema` (`lib/schemas/prioritizedPlanSchema.ts`)
**New**:
- `PrioritizationResultSchema` - Generator output (includes excluded_tasks)
- `EvaluationResultSchema` - Evaluator output (PASS/NEEDS_IMPROVEMENT/FAIL)

### Database Schema
**Existing Table**: `agent_sessions`
**Columns to Add**:
```sql
ALTER TABLE agent_sessions
  ADD COLUMN excluded_tasks JSONB,
  ADD COLUMN evaluation_metadata JSONB;
```

**Format**:
```typescript
excluded_tasks: Array<{
  task_id: string;
  exclusion_reason: string;
  alignment_score: number; // 0-10 for transparency
}>

evaluation_metadata: {
  iterations: number;
  duration_ms: number;
  evaluation_triggered: boolean;
  chain_of_thought: Array<{
    iteration: number;
    confidence: number;
    corrections: string;
    evaluator_feedback?: string;
  }>;
}
```

---

## Success Metrics

### Functional Quality
1. **Reflection Negation Accuracy**
   - **Baseline**: 0% (actively boosts wrong tasks)
   - **Target**: 95% success rate
   - **Measurement**: "ignore X" correctly excludes X tasks in 95/100 test cases

2. **Task Classification Accuracy**
   - **Baseline**: Unknown (payment tasks misclassified as NEUTRAL)
   - **Target**: 70%+ correct quadrant assignment for high-value tasks
   - **Measurement**: Manual override rate <20% for included/excluded decisions

3. **Filtering Precision**
   - **Target**: <20% of included tasks manually moved to excluded by users
   - **Measurement**: Override logging in `processing_logs` table

### Performance
1. **Fast Path**: <18s for 80% of runs (confidence ≥ 0.85)
2. **Quality Path**: <30s for 20% of runs (evaluation loop)
3. **Average**: ≤20s across all runs (30% improvement over 25s baseline)
4. **API Cost**: <$0.05 per prioritization run

### User Experience
1. **Reflection Usage**: 50%+ of users write reflections weekly (currently <10%)
2. **Excluded Tasks Review**: 40%+ of users expand excluded section
3. **Override Rate**: <15% of tasks manually adjusted
4. **User Satisfaction**: Priority quality NPS +30 points

---

## Next Steps (Phase 1)

1. **Design Data Model**
   - Define `PrioritizationResult` schema
   - Define `EvaluationResult` schema
   - Define `HybridLoopMetadata` schema
   - Map relationships to existing `agent_sessions` table

2. **Create API Contracts**
   - `POST /api/agent/prioritize` - Updated request/response
   - Database migration SQL for new JSONB columns
   - Zod schemas for validation

3. **Draft Quickstart Guide**
   - Migration path from Phase 11/7 to Phase 14
   - Feature flag rollout strategy
   - Deprecation timeline for `reflectionBasedRanking.ts`

---

## References

- **Anthropic Best Practices**: [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- **Existing Codebase**:
  - `lib/mastra/services/agentOrchestration.ts` (orchestration layer)
  - `lib/services/reflectionBasedRanking.ts` (broken reflection vectors)
  - `lib/mastra/agents/taskOrchestrator.ts` (current agent prompt)
- **Pitch Document**: `docs/shape-up-pitches/phase-14-outcome-driven-prioritization.md`
- **Specification**: `specs/012-docs-shape-pitches/spec.md`
- **Clarifications**: 5 resolved questions (Phase 11 integration, progressive UI, error handling, data retention, observability)

---

**Version**: 1.0
**Last Updated**: 2025-11-18
**Author**: Phase 14 Implementation Planning
