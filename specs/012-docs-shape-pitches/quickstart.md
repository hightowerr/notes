# Quickstart: Phase 14 Unified Prioritization

**Target Audience**: Developers implementing the outcome-driven prioritization system
**Estimated Time**: 30 minutes to understand, 4 weeks to implement
**Prerequisites**: Familiarity with Mastra agents, Zod schemas, Supabase

---

## 🚀 Quick Overview

**What This Does**:
- Replaces 4 competing prioritization layers with 1 unified agent
- Fixes broken reflection negation ("ignore X" → correctly excludes X tasks)
- Adds quality evaluation loop (Anthropic evaluator-optimizer pattern)
- Provides transparent reasoning for every inclusion/exclusion decision

**Key Metrics**:
- ⚡ 30% faster (25s → 17.6s average)
- 🎯 95% reflection accuracy (0% → 95%)
- 🔍 100% transparency (every decision has reasoning)
- 💰 <$0.05 per run (hybrid optimization)

## ⏳ Deprecation: reflectionBasedRanking.ts
- Status: Legacy fallback only (character-frequency re-ranking). Unified loop in `lib/services/prioritizationLoop.ts` replaces it when `USE_UNIFIED_PRIORITIZATION=true` (default).
- Migration timeline: keep for rollback during Week 1-2, freeze new imports immediately, plan removal after Week 4 once unified path is fully verified.
- Action: Do not add new callers; adjust-priorities endpoint is the only temporary consumer. Prefer hybrid loop outputs instead of legacy re-ranking.

## 🧹 Maintenance: Evaluation Metadata Cleanup
- Job: `scripts/cleanup-agent-sessions.ts` clears `evaluation_metadata` older than 30 days; run daily at 02:00 UTC (configure via Vercel Cron or pg_cron).
- Dry run: `pnpm tsx scripts/cleanup-agent-sessions.ts --dry-run` (counts rows only).
- Observability: Logs `evaluation_metadata_cleanup` to `processing_logs` with removed counts for monitoring.

---

## 📋 Pre-Flight Checklist

Before starting implementation, ensure you have:

- [ ] ✅ Node.js 20+ installed (`nvm use`)
- [ ] ✅ Supabase project with `agent_sessions` table
- [ ] ✅ OpenAI API key with GPT-4o and GPT-4o-mini access
- [ ] ✅ Mastra infrastructure (Phase 3) operational
- [ ] ✅ Reflection system (Phase 7) active
- [ ] ✅ Read `research.md` for context on current system problems
- [ ] ✅ Read `data-model.md` for schema understanding
- [ ] ✅ Reviewed `contracts/prioritize-api.yaml` for API spec

---

## ✅ Success Criteria (from spec)
- Hybrid loop enabled via `USE_UNIFIED_PRIORITIZATION=true` and returns excluded_tasks + evaluation_metadata.
- Reflection negation fixed (e.g., "ignore analytics" removes analytics tasks) with reasoning attached.
- Quality evaluator triggers only when needed (≤3 iterations, <20s average; fast path flagged).
- Manual overrides persisted + logged to processing_logs; adjustments do not erase baseline_plan.
- Feedback + maintenance: reflection quality feedback hits processing_logs; evaluation metadata cleanup job active.

---

## 🧪 Manual Validation Checklist (happy path + regressions)
- Prioritization run: Trigger `/priorities` → click Analyze → expect streaming updates and completion <20s; see excluded tasks section and reasoning chain.
- Reflection negation: Add reflection "ignore billing" → rerun → billing tasks appear under excluded with rationale referencing reflection.
- Fast vs quality path: Run with small task set → expect `evaluation_triggered=false`; run with low confidence scenario (mock via test) → `evaluation_triggered=true`.
- Manual overrides: Change impact/effort via sliders → expect updated priority, manual override badge, and processing_logs entry (`operation=manual_override`).
- Feedback survey: After 20 runs or 7 days gap (can set localStorage counter), survey appears; submit thumbs up/down → processing_logs entry (`reflection_quality_feedback`).
- Cleanup job: Dry run `pnpm tsx scripts/cleanup-agent-sessions.ts --dry-run` to view candidate count; real run clears old evaluation_metadata.

---

## 🔍 SQL Verification Snippets
- Latest session health:
```sql
SELECT id, status, jsonb_typeof(excluded_tasks), evaluation_metadata->>'evaluation_triggered'
FROM agent_sessions
ORDER BY created_at DESC
LIMIT 5;
```
- Reflection feedback logs:
```sql
SELECT metadata->>'rating', metadata->>'session_id', timestamp
FROM processing_logs
WHERE operation = 'reflection_quality_feedback'
ORDER BY timestamp DESC
LIMIT 10;
```
- Evaluation metadata cleanup check (30d):
```sql
SELECT count(*) AS with_eval_meta
FROM agent_sessions
WHERE evaluation_metadata IS NOT NULL
  AND updated_at < NOW() - INTERVAL '30 days';
```
- Manual override logs:
```sql
SELECT metadata->>'task_id', metadata->'user_decision' AS user_decision
FROM processing_logs
WHERE operation = 'manual_override'
ORDER BY timestamp DESC
LIMIT 10;
```

---

## 🛠️ Troubleshooting
- `DATABASE_ERROR` on feedback/cleanup: ensure `SUPABASE_SERVICE_ROLE_KEY` is set for server-side jobs and Next routes.
- Survey never appears: check localStorage key `reflection-quality-survey` (remove to reset), ensure session status hits `completed`.
- Missing excluded_tasks/evaluation_metadata: confirm `USE_UNIFIED_PRIORITIZATION=true` and migration 026 applied.
- Manual overrides ignored: verify `agent_sessions.strategic_scores` is populated and latest session exists; see API error message for `SESSION_REQUIRED` / `SCORES_UNAVAILABLE`.

---

## 🏗️ Implementation Roadmap (4 Weeks)

### Week 1: Foundation & Data Layer

**Day 1-2: Database Migration**
```bash
# 1. Apply database migration
psql $DATABASE_URL -f specs/012-docs-shape-pitches/contracts/database-migration.sql

# 2. Verify columns added
psql $DATABASE_URL -c "
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'agent_sessions'
    AND column_name IN ('excluded_tasks', 'evaluation_metadata');
"

# 3. Test validation functions
psql $DATABASE_URL -c "
  SELECT validate_excluded_tasks('[{
    \"task_id\": \"123e4567-e89b-12d3-a456-426614174000\",
    \"task_text\": \"Test task\",
    \"exclusion_reason\": \"Testing validation\",
    \"alignment_score\": 5
  }]'::jsonb);
"
```

**Day 3-4: Zod Schemas**
```typescript
// lib/schemas/prioritizationResultSchema.ts
import { z } from 'zod';

export const prioritizationResultSchema = z.object({
  thoughts: z.object({
    outcome_analysis: z.string().min(10).max(1000),
    filtering_rationale: z.string().min(10).max(1000),
    prioritization_strategy: z.string().min(10).max(1000),
    self_check_notes: z.string().min(10).max(1000),
  }),
  included_tasks: z.array(z.object({
    task_id: z.string().uuid(),
    inclusion_reason: z.string().min(10).max(300),
    alignment_score: z.number().min(0).max(10),
  })).min(1).max(500),
  excluded_tasks: z.array(z.object({
    task_id: z.string().uuid(),
    exclusion_reason: z.string().min(10).max(300),
  })).max(500),
  ordered_task_ids: z.array(z.string().uuid()).min(1).max(500),
  per_task_scores: z.record(z.object({
    impact: z.number().min(0).max(10),
    effort: z.number().min(0.5).max(160),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().min(10).max(500),
    dependencies: z.array(z.string().uuid()).optional(),
  })),
  confidence: z.number().min(0).max(1),
  critical_path_reasoning: z.string().min(10).max(1000),
  corrections_made: z.string().max(500).optional(),
});

export type PrioritizationResult = z.infer<typeof prioritizationResultSchema>;
```

**Day 5: Write Tests**
```typescript
// lib/schemas/__tests__/prioritizationResultSchema.test.ts
import { describe, it, expect } from 'vitest';
import { prioritizationResultSchema } from '../prioritizationResultSchema';

describe('PrioritizationResult Schema', () => {
  it('validates correct structure', () => {
    const valid = {
      thoughts: {
        outcome_analysis: "Analysis text here",
        filtering_rationale: "Filtering logic",
        prioritization_strategy: "Strategy explanation",
        self_check_notes: "Self-check details"
      },
      included_tasks: [{
        task_id: "123e4567-e89b-12d3-a456-426614174000",
        inclusion_reason: "This task advances the outcome",
        alignment_score: 8
      }],
      excluded_tasks: [],
      ordered_task_ids: ["123e4567-e89b-12d3-a456-426614174000"],
      per_task_scores: {
        "123e4567-e89b-12d3-a456-426614174000": {
          impact: 8,
          effort: 12,
          confidence: 0.85,
          reasoning: "High impact payment feature"
        }
      },
      confidence: 0.87,
      critical_path_reasoning: "Top 10 tasks form logical progression"
    };

    const result = prioritizationResultSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid confidence values', () => {
    const invalid = { /* ... */ confidence: 1.5 }; // >1
    const result = prioritizationResultSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
```

---

### Week 2: Agent Implementation

**Day 1-3: Unified Generator Agent**

```typescript
// lib/mastra/agents/prioritizationGenerator.ts
import { Agent } from '@mastra/core/agent';
import { initializeMastra } from '@/lib/mastra/init';

const GENERATOR_PROMPT = `You are a task prioritization expert. Your goal: filter and order tasks
based on their alignment with a user's outcome.

## OUTCOME
{outcome}

## USER REFLECTIONS (Recent context)
{reflections}

## TASKS TO EVALUATE ({taskCount})
{tasks}

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
}`;

export const prioritizationGenerator = new Agent({
  name: 'prioritization-generator',
  description: 'Unified agent for outcome-driven task filtering and prioritization',
  instructions: GENERATOR_PROMPT,
  model: 'openai/gpt-4o',
  maxRetries: 1,
  defaultGenerateOptions: {
    maxSteps: 1, // Single-pass generation
    response_format: { type: 'json_object' },
  },
  mastra: initializeMastra(),
});
```

**Day 4-5: Evaluator Agent**

```typescript
// lib/mastra/agents/prioritizationEvaluator.ts
import { Agent } from '@mastra/core/agent';
import { initializeMastra } from '@/lib/mastra/init';

const EVALUATOR_PROMPT = `You are a prioritization quality evaluator. Your ONLY job: evaluate
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
{
  "status": "PASS | NEEDS_IMPROVEMENT | FAIL",
  "feedback": "Specific, actionable feedback...",
  "criteria_scores": {
    "outcome_alignment": { "score": 8, "notes": "..." },
    "strategic_coherence": { "score": 7, "notes": "..." },
    "reflection_integration": { "score": 9, "notes": "..." },
    "continuity": { "score": 8, "notes": "..." }
  },
  "evaluation_duration_ms": 4521,
  "evaluator_model": "gpt-4o-mini"
}`;

export const prioritizationEvaluator = new Agent({
  name: 'prioritization-evaluator',
  description: 'Quality evaluator for prioritization results',
  instructions: EVALUATOR_PROMPT,
  model: 'openai/gpt-4o-mini', // Cheaper model for evaluation
  maxRetries: 1,
  defaultGenerateOptions: {
    maxSteps: 1,
    response_format: { type: 'json_object' },
  },
  mastra: initializeMastra(),
});
```

---

### Week 3: Hybrid Loop Service

```typescript
// lib/services/prioritizationLoop.ts
import { performance } from 'node:perf_hooks';
import { prioritizationGenerator } from '@/lib/mastra/agents/prioritizationGenerator';
import { prioritizationEvaluator } from '@/lib/mastra/agents/prioritizationEvaluator';
import {
  prioritizationResultSchema,
  type PrioritizationResult,
} from '@/lib/schemas/prioritizationResultSchema';
import {
  evaluationResultSchema,
  type EvaluationResult,
} from '@/lib/schemas/evaluationResultSchema';
import type { HybridLoopMetadata, ChainOfThoughtStep } from '@/lib/schemas/hybridLoopMetadataSchema';

type LoopOptions = {
  tasks: TaskSummary[];
  outcome: string;
  reflections: string[];
  previousPlan?: PrioritizedTaskPlan;
  maxIterations?: number;
};

function needsEvaluation(result: PrioritizationResult, previousPlan?: PrioritizedTaskPlan): boolean {
  // Fast path: skip evaluation if high confidence
  if (result.confidence >= 0.85) return false;

  // Trigger if confidence low
  if (result.confidence < 0.7) return true;

  // Trigger if over-aggressive filtering
  if (result.included_tasks.length < 10) return true;

  // Trigger if agent uncertain (many self-corrections)
  if (result.corrections_made && result.corrections_made.length > 100) return true;

  // Trigger if >30% of tasks moved >5 positions
  if (previousPlan && hasMajorMovement(result, previousPlan)) return true;

  return false;
}

function hasMajorMovement(result: PrioritizationResult, previousPlan: PrioritizedTaskPlan): boolean {
  const previousPositions = new Map<string, number>();
  previousPlan.ordered_task_ids.forEach((taskId, index) => {
    previousPositions.set(taskId, index + 1);
  });

  let majorMoves = 0;
  result.ordered_task_ids.forEach((taskId, index) => {
    const previousPos = previousPositions.get(taskId);
    if (previousPos && Math.abs((index + 1) - previousPos) > 5) {
      majorMoves++;
    }
  });

  const movePercentage = majorMoves / result.ordered_task_ids.length;
  return movePercentage > 0.3;
}

export async function prioritizeWithHybridLoop(options: LoopOptions): Promise<{
  plan: PrioritizedTaskPlan;
  metadata: HybridLoopMetadata;
}> {
  const { tasks, outcome, reflections, previousPlan, maxIterations = 3 } = options;
  const startTime = performance.now();
  const chainOfThought: ChainOfThoughtStep[] = [];

  let iteration = 1;
  let currentResult: PrioritizationResult;

  // PASS 1: Generate with inline self-check
  const prompt = buildGeneratorPrompt(tasks, outcome, reflections, previousPlan);
  const response = await prioritizationGenerator.generate([{ role: 'user', content: prompt }]);
  const parsed = prioritizationResultSchema.safeParse(response.text);

  if (!parsed.success) {
    throw new Error(`Generator returned invalid JSON: ${parsed.error.message}`);
  }

  currentResult = parsed.data;
  chainOfThought.push({
    iteration: 1,
    confidence: currentResult.confidence,
    corrections: currentResult.corrections_made || '',
    timestamp: new Date().toISOString(),
  });

  // CONDITIONAL: Evaluate only if needed
  if (!needsEvaluation(currentResult, previousPlan)) {
    const duration = performance.now() - startTime;
    return {
      plan: convertToPlan(currentResult),
      metadata: {
        iterations: 1,
        duration_ms: Math.round(duration),
        evaluation_triggered: false,
        chain_of_thought: chainOfThought,
        converged: true,
        final_confidence: currentResult.confidence,
      },
    };
  }

  // EVALUATION LOOP (max 3 iterations)
  while (iteration < maxIterations) {
    const evalPrompt = buildEvaluatorPrompt(currentResult, outcome, reflections);
    const evalResponse = await prioritizationEvaluator.generate([{ role: 'user', content: evalPrompt }]);
    const evalParsed = evaluationResultSchema.safeParse(evalResponse.text);

    if (!evalParsed.success) {
      console.warn('[PrioritizationLoop] Evaluator returned invalid JSON, proceeding with current result');
      break;
    }

    const evaluation: EvaluationResult = evalParsed.data;

    if (evaluation.status === 'PASS') {
      const duration = performance.now() - startTime;
      return {
        plan: convertToPlan(currentResult),
        metadata: {
          iterations: iteration + 1,
          duration_ms: Math.round(duration),
          evaluation_triggered: true,
          chain_of_thought: chainOfThought,
          converged: true,
          final_confidence: currentResult.confidence,
        },
      };
    }

    // Refine based on feedback
    iteration++;
    const refinementPrompt = buildRefinementPrompt(currentResult, evaluation.feedback, chainOfThought);
    const refinedResponse = await prioritizationGenerator.generate([{ role: 'user', content: refinementPrompt }]);
    const refinedParsed = prioritizationResultSchema.safeParse(refinedResponse.text);

    if (!refinedParsed.success) {
      console.warn('[PrioritizationLoop] Refinement failed, using previous result');
      break;
    }

    currentResult = refinedParsed.data;
    chainOfThought.push({
      iteration,
      confidence: currentResult.confidence,
      corrections: currentResult.corrections_made || '',
      evaluator_feedback: evaluation.feedback,
      timestamp: new Date().toISOString(),
    });
  }

  // Max iterations reached - return best effort
  const duration = performance.now() - startTime;
  return {
    plan: convertToPlan(currentResult),
    metadata: {
      iterations: iteration,
      duration_ms: Math.round(duration),
      evaluation_triggered: true,
      chain_of_thought: chainOfThought,
      converged: false, // Did not reach PASS
      final_confidence: currentResult.confidence,
    },
  };
}

function convertToPlan(result: PrioritizationResult): PrioritizedTaskPlan {
  // Convert PrioritizationResult to existing PrioritizedTaskPlan format
  return {
    ordered_task_ids: result.ordered_task_ids,
    confidence_scores: Object.fromEntries(
      Object.entries(result.per_task_scores).map(([taskId, score]) => [taskId, score.confidence])
    ),
    synthesis_summary: result.critical_path_reasoning,
    // ... other fields
  };
}
```

---

### Week 4: Integration & Testing

**Day 1-2: Update Agent Orchestration**

```typescript
// lib/mastra/services/agentOrchestration.ts
import { prioritizeWithHybridLoop } from '@/lib/services/prioritizationLoop';

async function runAgent(context: AgentRuntimeContext): Promise<AgentRunResult> {
  const startedAt = performance.now();

  // NEW: Use hybrid evaluator-optimizer loop
  const { plan, metadata: loopMetadata } = await prioritizeWithHybridLoop({
    tasks: context.tasks,
    outcome: context.outcome.assembled_text,
    reflections: context.reflections.map(r => r.text),
    previousPlan: context.history?.previous_plan,
    maxIterations: 3,
  });

  const completedAt = performance.now();

  return {
    status: 'completed',
    plan,
    metadata: {
      steps_taken: loopMetadata.iterations,
      total_time_ms: loopMetadata.duration_ms,
      evaluation_triggered: loopMetadata.evaluation_triggered,
      // ... rest
    },
  };
}
```

**Day 3: UI Components**

```tsx
// app/priorities/components/ExcludedTasksSection.tsx
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function ExcludedTasksSection({ tasks }: { tasks: ExcludedTask[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-sm text-muted-foreground">
        Show {tasks.length} excluded tasks ↓
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 mt-4">
          {tasks.map(task => (
            <div key={task.task_id} className="p-3 bg-muted rounded-lg">
              <div className="font-medium">{task.task_text}</div>
              <div className="text-sm text-muted-foreground mt-1">
                ✗ Excluded: {task.exclusion_reason}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

**Day 4-5: Testing & Validation**

```bash
# Run full test suite
pnpm test

# Run specific Phase 14 tests
pnpm test:run __tests__/contract/unified-prioritization.test.ts
pnpm test:run lib/services/__tests__/prioritizationLoop.test.ts

# Manual testing
# 1. Set outcome: "Increase credit payments by 20%"
# 2. Write reflection: "ignore documentation tasks"
# 3. Run prioritization
# 4. Verify: Documentation tasks in excluded section
# 5. Verify: Payment tasks in included section with high scores
```

---

## ✅ Success Validation

Before marking Phase 14 complete, verify these criteria:

### Functional Quality
- [ ] ✅ "ignore X" correctly excludes X tasks (95% success rate)
- [ ] ✅ Payment tasks show LEVERAGE, not NEUTRAL
- [ ] ✅ Excluded tasks section displays with clear reasoning
- [ ] ✅ Evaluation loop triggers 15-25% of the time
- [ ] ✅ Chain-of-thought shows inline self-corrections

### Performance
- [ ] ✅ Fast path: <18s for 80% of runs (confidence ≥0.85)
- [ ] ✅ Quality path: <30s for 20% of runs
- [ ] ✅ Average: ≤20s across 100 test runs
- [ ] ✅ API cost: <$0.05 per prioritization

### User Experience
- [ ] ✅ Users can expand excluded section (40%+ engagement)
- [ ] ✅ Manual override rate <15%
- [ ] ✅ Reflection usage increases (target: 50%+ weekly)

---

## 🐛 Troubleshooting

### "Schema validation failed for PrioritizationResult"
**Cause**: Generator returned unexpected JSON structure
**Fix**: Check agent prompt, ensure JSON schema matches Zod definition
**Debug**:
```typescript
console.log('Raw agent output:', response.text);
const parsed = prioritizationResultSchema.safeParse(response.text);
if (!parsed.success) {
  console.error('Validation errors:', parsed.error.flatten());
}
```

### "Evaluation loop never converges"
**Cause**: Agent keeps failing evaluation after 3 iterations
**Fix**: Return best effort with warning
**Mitigation**: Log to `processing_logs` for prompt tuning
```typescript
if (!metadata.converged) {
  console.warn('[PrioritizationLoop] Failed to converge after 3 iterations', {
    final_confidence: metadata.final_confidence,
    session_id,
  });
}
```

### "Excluded tasks empty but included tasks < 200"
**Cause**: Agent not filtering aggressively enough
**Fix**: Tune generator prompt to be more ruthless
**Adjustment**: Lower confidence threshold or add explicit filtering examples

---

## 📚 Next Steps

After Phase 14 is complete:

1. **Monitor Metrics** (Week 1-2 post-launch)
   - Track evaluation trigger rate (target: 15-25%)
   - Monitor override rates (target: <15%)
   - Measure reflection usage (target: 50%+ weekly)

2. **Gather Feedback** (Week 3-4)
   - User surveys: "Did reflections work as expected?" (FR-025)
   - Override logging analysis (FR-024)
   - NPS improvement tracking (target: +30 points)

3. **Phase 15: Learning Loop** (Future)
   - Historical outcome tracking
   - Automated prompt optimization based on override patterns
   - Multi-outcome support

---

**Version**: 1.0
**Last Updated**: 2025-11-18
**Estimated Implementation Time**: 4 weeks (small batch)
