# Shape Up Pitch: Phase 14 – Outcome-Driven Prioritization (Evaluator-Optimizer Pattern)

## Problem

**Prioritization is broken: reflections don't work, tasks are misclassified (NEUTRAL when they should be LEVERAGE), and 4 competing systems fight each other—leading to nonsensical priority lists.**

### Reality today
- User writes reflection: "ignore wishlist related items"
- System **boosts** wishlist tasks to the top instead of filtering them
- Why? Character-frequency vectors can't understand negation
- Payment integration tasks show as **NEUTRAL** instead of **LEVERAGE**
- Why? Regex heuristics add +8h for "integration" keyword, inflating effort → wrong quadrant
- Four layers fight each other:
  1. Strategic scoring (LLM) → calculates impact/effort
  2. Agent orchestration (LLM + tools) → orders tasks
  3. Reflection adjustment (char vectors) → re-ranks incorrectly
  4. Manual overrides (localStorage) → user fixes the mess

### User feedback
> "I wrote 'ignore documentation tasks' in my reflection, but the agent put 'Update API docs' at #7. This is backwards!"

> "My outcome is 'Increase credit payments by 20%', but the Apple Pay integration spike is showing as NEUTRAL with low priority. That's literally the most important task!"

> "The reflections feature doesn't work. I've given up using it because it makes things worse, not better."

**Core issue:** Current system uses character-frequency cosine similarity for reflections (`lib/services/reflectionBasedRanking.ts:59-82`), which cannot understand semantic negation. "ignore X" has high similarity to "X", so it **boosts** X tasks. Meanwhile, regex-based effort estimation inflates scores for integration work, misclassifying high-value tasks as low-priority. The result: users get a priority list that contradicts both their outcome and their reflections.

---

## Appetite
- **4-week small batch** (architectural simplification)
- We're replacing 4 competing layers with a single unified agent loop, which is primarily a refactor with new agent prompts. The evaluator-optimizer pattern adds quality checks without rebuilding the entire system.

---

## Solution – High Level

Deliver an **outcome-driven prioritization system** using Anthropic's Evaluator-Optimizer pattern that:
1. **Filters tasks by outcome alignment first** (Agent reviews each task: "Does this advance the metric?")
2. **Prioritizes filtered tasks with reflections** (Only relevant tasks get ordered)
3. **Self-evaluates inline** (Agent checks its own work in the same pass)
4. **Refines conditionally** (Evaluation loop only triggers when confidence < 0.7)
5. **Shows transparent reasoning** (Every inclusion/exclusion/movement has a visible explanation)

### Key Innovation: Hybrid Optimization
- **Fast path (80% of cases)**: Single LLM call with inline self-check → 15s
- **Quality path (20% of cases)**: Evaluator feedback loop → 28s
- **Average**: 17.6s (30% faster than current 25s)

### Alignment with Anthropic Best Practices
Per ["Building Effective Agents"](https://www.anthropic.com/engineering/building-effective-agents):
- ✅ **Routing pattern**: Filter stage classifies tasks (include/exclude)
- ✅ **Evaluator-Optimizer pattern**: Quality loop catches mistakes
- ✅ **Simplicity first**: 4 layers → 2 stages
- ✅ **Transparent planning**: Chain-of-thought visible in UI

---

## Breadboard Sketch

```
┌────────────────────────────────────────────────────────────────┐
│  OLD SYSTEM (4 Competing Layers)                               │
│                                                                │
│  1. Strategic Scoring (LLM)                                    │
│     ↓ calculates impact/effort                                 │
│  2. Agent Orchestration (LLM + tools)                          │
│     ↓ orders tasks with semantic search                        │
│  3. Reflection Adjustment (char-freq vectors) ❌ BROKEN        │
│     ↓ re-ranks with cosine similarity                          │
│  4. Manual Overrides (localStorage)                            │
│     ↓ user fixes the chaos                                     │
│                                                                │
│  Result: 25s, inconsistent, reflections boost wrong tasks     │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  NEW SYSTEM (Hybrid Evaluator-Optimizer)                       │
│                                                                │
│  STAGE 1: Outcome-Driven Filter (Generator Agent)             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Input: 200 tasks + outcome + reflections                  │ │
│  │                                                            │ │
│  │ Agent evaluates each task:                                │ │
│  │ • "Does this advance [metric]?"                           │ │
│  │ • "Is this blocked/waiting?"                              │ │
│  │ • Decision: INCLUDE or EXCLUDE + reasoning                │ │
│  │                                                            │ │
│  │ Inline Self-Check:                                        │ │
│  │ • "Did I exclude any high-impact tasks by mistake?"       │ │
│  │ • "Did I include low-impact tasks?"                       │ │
│  │ • Confidence: 0-1 (self-assessment)                       │ │
│  │                                                            │ │
│  │ Output: ~50 included tasks, ~150 excluded tasks           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                    ↓                                           │
│  STAGE 2: Strategic Prioritization (Same Agent)               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Input: 50 filtered tasks                                  │ │
│  │                                                            │ │
│  │ Agent orders by:                                          │ │
│  │ • Impact (LLM estimates 0-10)                             │ │
│  │ • Effort (LLM estimates hours)                            │ │
│  │ • Dependencies                                            │ │
│  │ • Reflections (fine-tune within included set)            │ │
│  │                                                            │ │
│  │ Output: Ordered list + per-task scores + reasoning       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                    ↓                                           │
│  CONDITIONAL: Evaluation Loop (Evaluator Agent)               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Triggers if:                                              │ │
│  │ • Confidence < 0.7                                        │ │
│  │ • <10 tasks included (over-aggressive filtering)          │ │
│  │ • >30% of tasks moved >5 positions                        │ │
│  │                                                            │ │
│  │ Evaluator checks:                                         │ │
│  │ • Outcome alignment (included/excluded correct?)          │ │
│  │ • Strategic coherence (ordering makes sense?)             │ │
│  │ • Reflection integration (negations handled?)             │ │
│  │                                                            │ │
│  │ Decision: PASS | NEEDS_IMPROVEMENT | FAIL                │ │
│  │ Feedback: Specific issues to fix                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                    ↓ (if not PASS)                            │
│  REFINEMENT: Generator improves based on feedback             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Context: Previous attempts + evaluator feedback          │ │
│  │ Agent corrects mistakes and regenerates                   │ │
│  │ Max 3 iterations (then best effort)                       │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  Result: 15-28s (avg 17.6s), consistent, reflections work    │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  UI: Task Priorities (New Display)                             │
│                                                                │
│  Outcome: Increase credit payment conversion by 20%           │
│                                                                │
│  Active Tasks (47) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ │
│                                                                │
│  1. 🌟 Implement Apple Pay V6 integration                     │
│     ✓ Included: Directly enables new credit payment option   │
│     Impact: 8/10 | Effort: 12h | Confidence: 0.85            │
│     Priority: 56.7 | [Why this score?]                        │
│                                                                │
│  2. 🎯 Optimize checkout flow for mobile                      │
│     ✓ Included: 40% of users on mobile, improves conversion  │
│     Impact: 7/10 | Effort: 16h | Confidence: 0.78            │
│     Priority: 34.1 | [Why this score?]                        │
│                                                                │
│  ...                                                           │
│                                                                │
│  [▼ Show 153 excluded tasks]                                  │
│                                                                │
│  Excluded Tasks (153) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ │
│                                                                │
│  • Update API documentation                                   │
│    ✗ Excluded: Documentation doesn't advance payment metric  │
│                                                                │
│  • Refactor test suite                                        │
│    ✗ Excluded: Internal quality work, no direct revenue impact│
│                                                                │
│  • Add loading spinner to dashboard                           │
│    ✗ Excluded: Minor UX polish, not on critical path         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## What We're Building

### 1. Unified Prioritization Generator Agent
**File**: `lib/mastra/agents/prioritizationGenerator.ts`

**Prompt structure:**
```typescript
const GENERATOR_PROMPT = `
You are a task prioritization expert. Your goal: filter and order tasks
based on their alignment with a user's outcome.

## OUTCOME
{outcome}

## USER REFLECTIONS (Recent context)
{reflections}

## TASKS TO EVALUATE ({taskCount})
{tasks}

## PREVIOUS PLAN (For continuity)
{previousPlan}

---

## YOUR PROCESS

### Step 1: FILTER (Outcome Alignment)
For each task, decide INCLUDE or EXCLUDE based on:
- Does this task DIRECTLY advance the outcome metric?
- Is this task blocked or waiting on external dependencies?
- Is this administrative overhead that doesn't move the needle?

Be ruthless: Only include tasks with clear, measurable impact.

### Step 2: PRIORITIZE (Strategic Ordering)
Order INCLUDED tasks by:
1. Impact on outcome (primary)
2. Effort required (prefer high-impact, low-effort)
3. Dependencies (unblocking tasks get priority)
4. User reflections (fine-tune within included set)

### Step 3: SELF-EVALUATE (Quality Check) ⭐
Before finalizing, critically review your work:
- Did I exclude any high-impact tasks by mistake?
- Did I include any low-impact tasks?
- Does the top 10 make sense as the "critical path"?
- Are reflection adjustments aligned with outcome?
- Are major movements from previous plan justified?

If you spot errors, CORRECT them now and note what you fixed.

### Step 4: ASSESS CONFIDENCE
Rate your confidence (0-1) in this prioritization:
- 0.9+: Very confident
- 0.7-0.9: Confident, minor ambiguities
- 0.5-0.7: Moderate, several judgment calls
- <0.5: Low confidence, needs review

## OUTPUT FORMAT
{
  "thoughts": {
    "outcome_analysis": "...",
    "filtering_rationale": "...",
    "prioritization_strategy": "...",
    "self_check_notes": "..."
  },
  "included_tasks": [
    { "task_id": "...", "inclusion_reason": "...", "alignment_score": 8 }
  ],
  "excluded_tasks": [
    { "task_id": "...", "exclusion_reason": "..." }
  ],
  "ordered_task_ids": ["task-1", "task-2", ...],
  "per_task_scores": {
    "task-1": { "impact": 8, "effort": 12, "confidence": 0.85, "reasoning": "..." }
  },
  "confidence": 0.85,
  "critical_path_reasoning": "...",
  "corrections_made": "..."
}
`;
```

**Output schema** (Zod):
```typescript
const PrioritizationResultSchema = z.object({
  thoughts: z.object({
    outcome_analysis: z.string(),
    filtering_rationale: z.string(),
    prioritization_strategy: z.string(),
    self_check_notes: z.string(),
  }),
  included_tasks: z.array(z.object({
    task_id: z.string(),
    inclusion_reason: z.string(),
    alignment_score: z.number().min(0).max(10),
  })),
  excluded_tasks: z.array(z.object({
    task_id: z.string(),
    exclusion_reason: z.string(),
  })),
  ordered_task_ids: z.array(z.string()),
  per_task_scores: z.record(z.object({
    impact: z.number().min(0).max(10),
    effort: z.number().min(0.5).max(160),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  })),
  confidence: z.number().min(0).max(1),
  critical_path_reasoning: z.string(),
  corrections_made: z.string().optional(),
});
```

### 2. Quality Evaluator Agent
**File**: `lib/mastra/agents/prioritizationEvaluator.ts`

**Prompt structure:**
```typescript
const EVALUATOR_PROMPT = `
You are a prioritization quality evaluator. Your ONLY job: evaluate
if a prioritization meets quality criteria.

## EVALUATION CRITERIA

1. **Outcome Alignment** (Critical)
   - Included tasks clearly advance the outcome?
   - Excluded tasks genuinely low-impact?
   - No high-value tasks excluded by mistake?

2. **Strategic Coherence** (Important)
   - Ordering makes logical sense?
   - Dependencies respected?
   - "Critical path" credible?

3. **Reflection Integration** (Important)
   - User reflections properly incorporated?
   - Reflection adjustments align with outcome?
   - Negations handled correctly ("ignore X" excludes X)?

4. **Continuity** (Nice to have)
   - If major movements, are they justified?
   - Explanation for significant changes?

## EVALUATION LEVELS
- PASS: All criteria met, no improvements needed
- NEEDS_IMPROVEMENT: Minor issues, specific feedback provided
- FAIL: Major issues, complete rework needed

## OUTPUT FORMAT
<evaluation>PASS | NEEDS_IMPROVEMENT | FAIL</evaluation>
<feedback>
Specific, actionable feedback on what needs fixing and why.
Focus on most critical issues first.
</feedback>
`;
```

**Model choice:**
- Generator: `gpt-4o` (needs reasoning depth)
- Evaluator: `gpt-4o-mini` (faster, cheaper for quality checks)

### 3. Hybrid Loop Service
**File**: `lib/services/prioritizationLoop.ts`

**Core function:**
```typescript
export async function prioritizeWithHybridLoop(options: {
  tasks: TaskSummary[];
  outcome: string;
  reflections: string[];
  previousPlan?: PrioritizedTaskPlan;
  maxIterations?: number;
}): Promise<{
  plan: PrioritizedTaskPlan;
  metadata: {
    iterations: number;
    duration_ms: number;
    evaluation_triggered: boolean;
    chain_of_thought: Array<{ iteration: number; confidence: number }>;
  };
}>;
```

**Hybrid decision logic:**
```typescript
function needsEvaluation(result, previousPlan): boolean {
  // Fast path: skip evaluation if high confidence
  if (result.confidence >= 0.85) return false;

  // Trigger if confidence low
  if (result.confidence < 0.7) return true;

  // Trigger if over-aggressive filtering
  if (result.included_tasks.length < 10) return true;

  // Trigger if agent uncertain (many self-corrections)
  if (result.corrections_made?.length > 100) return true;

  // Trigger if >30% of tasks moved >5 positions
  if (previousPlan && hasMajorMovement(result, previousPlan)) return true;

  return false;
}
```

**Loop structure** (mirrors Anthropic's Python example):
```typescript
// PASS 1: Generate with inline self-check
let result = await generator.generate(prompt);

// CONDITIONAL: Evaluate only if needed
if (!needsEvaluation(result)) {
  return { plan, iterations: 1, evaluation_triggered: false };
}

// EVALUATION LOOP (max 3 iterations)
while (iteration < maxIterations) {
  const evaluation = await evaluator.generate(evalPrompt);

  if (evaluation.status === 'PASS') break;

  // Refine based on feedback
  const context = buildRefinementContext(history, evaluation.feedback);
  result = await generator.generate(prompt, context);
  iteration++;
}

return { plan, iterations, evaluation_triggered: true };
```

### 4. UI Updates

**Excluded Tasks Section:**
```tsx
// app/priorities/components/ExcludedTasksSection.tsx
export function ExcludedTasksSection({ tasks }: { tasks: ExcludedTask[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger>
        Show {tasks.length} excluded tasks ↓
      </CollapsibleTrigger>
      <CollapsibleContent>
        {tasks.map(task => (
          <div key={task.task_id} className="excluded-task">
            <span className="task-text">{task.task_text}</span>
            <span className="exclusion-reason">
              ✗ Excluded: {task.exclusion_reason}
            </span>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
```

**Chain-of-Thought Display:**
```tsx
// app/priorities/components/ReasoningChain.tsx
export function ReasoningChain({ iterations }: { iterations: ChainOfThought[] }) {
  return (
    <div className="reasoning-chain">
      {iterations.map((iter, i) => (
        <div key={i} className="iteration">
          <h4>Iteration {iter.iteration}</h4>
          <p>Confidence: {iter.confidence.toFixed(2)}</p>
          <p>Corrections: {iter.corrections || 'None'}</p>
          {iter.evaluation_feedback && (
            <p className="feedback">Feedback: {iter.evaluation_feedback}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 5. Integration with Existing System

**Update agent orchestration:**
```typescript
// lib/mastra/services/agentOrchestration.ts

async function runAgent(context: AgentRuntimeContext) {
  // NEW: Use hybrid evaluator-optimizer loop
  const result = await prioritizeWithHybridLoop({
    tasks: context.tasks,
    outcome: context.outcome.assembled_text,
    reflections: context.reflections.map(r => r.text),
    previousPlan: context.history?.previous_plan,
    maxIterations: 3,
  });

  return {
    status: 'completed',
    plan: result.plan,
    metadata: {
      steps_taken: result.metadata.iterations,
      total_time_ms: result.metadata.duration_ms,
      evaluation_triggered: result.metadata.evaluation_triggered,
      // ... rest
    },
  };
}
```

**Deprecate broken reflection service:**
```typescript
// lib/services/reflectionBasedRanking.ts (mark deprecated)
/**
 * @deprecated This service uses character-frequency vectors that cannot
 * understand semantic negation. Use the unified prioritization loop instead.
 *
 * Migration: See Phase 14 implementation in lib/services/prioritizationLoop.ts
 */
export function buildAdjustedPlanFromReflections() {
  console.warn('[DEPRECATED] reflectionBasedRanking.ts is deprecated. Use prioritizationLoop.ts');
  // ... existing code (kept for backward compatibility during migration)
}
```

### 6. Performance Optimization

**Parallel scoring for included tasks:**
```typescript
// After filtering, score included tasks in parallel
const scores = await Promise.all(
  includedTasks.map(task =>
    scoreTask(task, outcome, previousScores[task.id])
  )
);
```

**Caching:**
```typescript
// Cache effort estimates for common task patterns
const effortCache = new Map<string, number>();
const cacheKey = `${taskType}:${complexity}`;
if (effortCache.has(cacheKey)) {
  return effortCache.get(cacheKey);
}
```

---

## Out of Scope (No-gos)
- **Historical outcome tracking** – Deferred to Phase 15 (Learning Loop)
- **Multi-outcome support** – Single active outcome only
- **Team-based prioritization** – Single-user workspace
- **Custom evaluation criteria** – Fixed rubric (outcome/coherence/reflections)
- **A/B testing different prompts** – We'll refine prompts iteratively, not split-test
- **Integration with strategic scoring** – Phase 11's impact/effort scores are inputs, not outputs

---

## Risks & Rabbit Holes

| Risk | Why it's scary | Mitigation |
|------|----------------|------------|
| **LLM cost explosion** | Evaluator loop = 2-3x more API calls | Hybrid logic skips evaluation 80% of the time; use gpt-4o-mini for evaluator (5x cheaper) |
| **Speed regression** | "Fast path" promise doesn't hold | Benchmark shows 15s for high-confidence cases; abort if >30s total; feature flag for rollback |
| **Evaluation loop never converges** | Agent keeps failing evaluation, hits max iterations | Hard stop at 3 iterations; return best effort with warning; gather failure cases for prompt tuning |
| **Migration breaks existing plans** | Old format incompatible with new system | Keep old agents as fallback; gradual rollout with feature flag; test both systems in parallel for 1 week |
| **Over-filtering** | Agent excludes too many tasks (>80%) | Trigger evaluation if <10 included; evaluator checks for over-aggressive filtering; user feedback button |
| **Prompt engineering rabbit hole** | Spending 4 weeks tweaking prompts | Use Anthropic's proven patterns; limit to 2 prompt iterations per week; measure success metrics weekly |

---

## Success Metrics

### Functional Quality
- **Reflection accuracy**: "ignore X" correctly excludes X tasks (0% today → 95% success rate)
- **Negation handling**: Tasks containing reflection keywords are excluded, not boosted
- **Classification improvement**: Payment tasks show LEVERAGE (not NEUTRAL) – 70%+ of high-value tasks correctly classified
- **Filtering precision**: <20% of included tasks manually moved to excluded by users
- **Evaluation trigger rate**: 15-25% of runs trigger evaluation loop (indicates good inline self-check)

### Performance
- **Fast path (high confidence)**: <18s (today: 25s)
- **Quality path (evaluation loop)**: <30s (acceptable for 20% of cases)
- **Average prioritization time**: <20s (today: 25s) – 20% improvement
- **API cost**: <$0.05 per prioritization run (within budget)

### User Experience
- **User satisfaction**: "Priority quality" NPS +30 points
- **Reflection usage**: 50%+ of users write reflections weekly (today: <10% because it's broken)
- **Excluded tasks review**: Users expand excluded section 40%+ of the time (validates filtering)
- **Override rate**: <15% of tasks manually adjusted (indicates agent alignment)

### Technical Health
- **Test coverage**: 85%+ for loop logic, agent prompts, evaluation criteria
- **Rollback safety**: Feature flag allows instant revert to old system
- **Migration success**: 100% of sessions processed by new system within 2 weeks

---

## Deliverables

1. **Agent implementations**:
   - `lib/mastra/agents/prioritizationGenerator.ts` – Unified filter + prioritize agent
   - `lib/mastra/agents/prioritizationEvaluator.ts` – Quality evaluator agent

2. **Core service**:
   - `lib/services/prioritizationLoop.ts` – Hybrid loop with conditional evaluation
   - Unit tests for `needsEvaluation()`, `hasMajorMovement()`, loop convergence

3. **Integration**:
   - Update `lib/mastra/services/agentOrchestration.ts` to use new loop
   - Deprecation warnings in `lib/services/reflectionBasedRanking.ts`
   - Feature flag: `USE_UNIFIED_PRIORITIZATION` (default: true)

4. **UI components**:
   - `app/priorities/components/ExcludedTasksSection.tsx` – Collapsible excluded tasks
   - `app/priorities/components/ReasoningChain.tsx` – Chain-of-thought display
   - Update `app/priorities/page.tsx` to show excluded count

5. **Database schema**:
   ```sql
   ALTER TABLE agent_sessions ADD COLUMN excluded_tasks JSONB;
   -- Format: [{ task_id, exclusion_reason, alignment_score }]

   ALTER TABLE agent_sessions ADD COLUMN evaluation_metadata JSONB;
   -- Format: { iterations, evaluation_triggered, chain_of_thought }
   ```

6. **API updates**:
   - `/api/agent/prioritize` – Returns excluded_tasks + evaluation_metadata
   - Migration script for existing sessions

7. **Performance tests**:
   - Benchmark fast path (<18s)
   - Benchmark evaluation path (<30s)
   - Load test with 200 tasks

8. **Documentation**:
   - Migration guide for Phase 11 → Phase 14
   - Prompt engineering notes (what worked, what didn't)
   - Anthropic pattern alignment doc

---

## Dependencies
- **Phase 11** (Strategic Prioritization) – Impact/effort scores are inputs to filtering
- **Phase 7** (Reflection System) – Reflections passed to agent, must be active
- **Phase 3** (Agent Runtime) – Mastra infrastructure for agent execution

---

## Ready When
- User writes "ignore documentation tasks" → No documentation tasks in active list
- Apple Pay integration task with impact=8, effort=12h shows as **LEVERAGE** (not NEUTRAL)
- Excluded tasks section shows 150+ excluded with clear reasons
- Evaluation loop triggers 20% of the time when confidence < 0.7
- Chain-of-thought shows inline self-corrections before evaluation
- Users report: "Reflections finally work!" and "The priority list makes sense now"
- Performance: 80% of runs complete in <18s, 100% complete in <30s
- Zero character-frequency vector calculations in production logs

---

**Appetite:** 4 weeks (small batch – architectural simplification)
**Status:** Proposed
**Dependencies:** Phase 11 (Scoring), Phase 7 (Reflections), Phase 3 (Agent Runtime)
**Next Phase:** Phase 15 (Learning Loop – Close feedback loop with actual outcomes)
