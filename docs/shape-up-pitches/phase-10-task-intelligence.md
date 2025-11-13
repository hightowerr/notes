# Shape Up Pitch: Phase 10 – Task Intelligence (Gap & Quality Detection)

## Problem

**The agent accepts whatever tasks exist without questioning if they're well-defined, comprehensive, or properly scoped to achieve the user's goal.**

### Reality today
- User uploads documents → Agent extracts tasks → System assumes these tasks are "good enough".
- No validation that tasks cover the full path to the stated goal.
- No detection of vague tasks like "Improve UX" or "Fix bugs" that lack clear success criteria.
- No warning when obvious workflow steps are missing (e.g., "Launch campaign" exists but no "Run QA" task before it).
- Users discover gaps only after starting work and hitting blockers.

### User feedback
> "I ran prioritization and got 'Improve site performance' as the #1 task. What does that even mean? Where do I start?"
> "The agent suggested I work on launching the feature, but there's no task about testing it first. I had to manually add that myself."
> "Half these tasks are so broad I don't know what 'done' looks like. I need the system to push back on vague tasks."

**Core issue:** The system acts as a passive sorter instead of an active strategist. It never asks "Is this task clear?" or "What's missing between these two steps?" Users waste time clarifying and filling gaps that AI should catch upfront.

---

## Appetite
- **6-week big batch** (full cycle)
- We're building new reasoning capabilities (gap detection, quality evaluation, auto-suggestion) that touch agent instructions, Mastra tools, quality heuristics, and UI feedback layers.

---

## Solution – High Level

Deliver a task intelligence layer that:
1. **Runs goal-task coverage analysis** comparing the user's stated outcome against the semantic coverage of existing tasks.
2. **Detects logical gaps** in task sequences using time, action-type, skill, and dependency indicators.
3. **Evaluates task quality** via clarity heuristics (specificity, measurability, verb strength).
4. **Auto-generates draft tasks** to fill detected gaps, with human approval before insertion.
5. **Flags quality issues** with actionable suggestions (e.g., "Split 'Improve CVR' into 2 measurable sub-tasks").
6. **Shows transparent reasoning** via visual gap cards and quality scores.

---

## Breadboard Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  Priorities View – Task Intelligence Panel                    │
│                                                              │
│  Goal Coverage Analysis                                       │
│  ⚠ 72% coverage of outcome "Increase ARR 15%"                │
│  Missing concepts: ["pricing experiments", "upsell flow"]    │
│  [Show Missing Areas] [Generate Draft Tasks]                 │
│                                                              │
│  Task Quality Issues (3)                                      │
│  🔴 "Improve UX" – Too vague                                 │
│     → Suggestion: Split into "Audit checkout flow UX" +      │
│                   "Reduce form fields from 12 → 8"           │
│  🟡 "Launch feature" – Missing prerequisite                  │
│     → Gap detected: No QA/testing task before launch         │
│  🟢 Most tasks clear (17/20)                                 │
│                                                              │
│  Generated Draft Tasks (2)                                    │
│  • "Run pricing A/B test: $49 vs $59 tier"                  │
│    Reason: Addresses gap in outcome alignment                │
│    [Accept & Insert] [Edit] [Dismiss]                       │
│  • "Build upsell modal for annual plan"                      │
│    Reason: Fills missing "upsell flow" concept               │
│    [Accept & Insert] [Edit] [Dismiss]                       │
│                                                              │
│  [Re-Analyze Tasks]                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## What We're Building

### 1. Goal-Task Coverage Analyzer
- **Vector embedding approach**: Use OpenAI `text-embedding-3-small` (512 dimensions for faster computation)
- Compare outcome embedding vs. task cluster centroid using cosine similarity
- Identify semantic distance > threshold (e.g., 0.6-0.7) as "missing coverage"
- **Similarity calculation**:
  ```typescript
  cosineSimilarity(taskEmbedding, goalEmbedding) > 0.7 → adequate coverage
  ```
- Extract missing conceptual areas using LLM prompt: "What concepts are needed for [outcome] but missing from [tasks]?"
- Store coverage score + missing areas in `agent_sessions.gap_analysis` (JSONB column)
- **Storage**: Leverage existing Supabase pgvector infrastructure with IVFFlat index for fast similarity search

### 2. Task Quality Evaluator Service
- **Implementation**: New Mastra tool `task-quality-evaluator`
- **Model**: GPT-4o-mini for cost-efficient quality assessment
- **Input schema**:
  ```typescript
  z.object({
    task_description: z.string(),
    goal_context: z.string()
  })
  ```
- **Clarity score** (0-1):
  - Length check: 10-100 chars = good, <10 or >100 = penalty
  - Verb strength: "Launch", "Test", "Build" = strong; "Improve", "Fix" = weak
  - Specificity: Contains numbers/metrics = +0.2 boost
  - Example: "Improve UX" = 0.3 | "Reduce checkout steps from 5 → 3" = 0.9
- **Granularity check**:
  - Flag tasks >80 hours as "too broad"
  - Suggest split if task contains multiple action verbs
- **Dependency gap detection**:
  - Use existing `detect-dependencies` tool
  - Flag if high-confidence (>0.8) prerequisite is missing from plan
- **Storage**: Store quality scores in `task_embeddings.quality_metadata jsonb`
- **Output**: Structured quality assessment with improvement suggestions array

### 3. Gap-Filling Draft Generator
- **New Mastra tool**: `generate-missing-tasks` (follows Mastra `createTool` pattern)
- **Input schema** (Zod):
  ```typescript
  z.object({
    current_tasks: z.array(z.object({
      id: z.string(),
      description: z.string(),
      embedding: z.array(z.number())
    })),
    goal_embedding: z.array(z.number()),
    coverage_threshold: z.number().min(0).max(1).default(0.7)
  })
  ```
- **Output schema**:
  ```typescript
  {
    draft_tasks: [{
      task_text: string,
      estimated_hours: number,
      cognition_level: "low" | "medium" | "high",
      reasoning: string,
      fills_gap: string  // which missing area this addresses
    }]
  }
  ```
- **Execution**: Use GPT-4o-mini for cost efficiency (simpler prompt than full orchestration)
- **Workflow integration**: Leverage Mastra's `createWorkflow` with parallel execution:
  ```typescript
  .then(createStep(generateMissingTasksTool))
  .parallel([
    createStep(evaluateTaskQualityTool),
    createStep(recommendPrioritizationTool)
  ])
  ```

### 4. Self-Questioning Protocol
- Before finalizing plan, agent asks:
  1. "Do these tasks ladder to the goal?" (coverage check)
  2. "Are any tasks too vague?" (quality check)
  3. "Are dependencies logical?" (gap check)
- Append questions + answers to reasoning trace
- Surface in UI as "Agent's Pre-Flight Check" section

### 5. Task Intelligence UI Components
**Gap Detection Modal:**
- Triggered by "Analyze Gaps" button or auto-shown if coverage <70%
- Shows missing conceptual areas
- Lists generated draft tasks with approve/edit/dismiss actions
- Real-time coverage score update as tasks accepted

**Quality Indicators:**
- Color-coded badges on task cards: 🟢 Clear | 🟡 Review | 🔴 Needs Work
- Hover tooltip shows quality breakdown + suggestions
- Inline "Refine" button opens modal with AI-suggested improvements

**Coverage Progress Bar:**
- Visual indicator: 0-100% goal coverage
- Breaks down by concept (e.g., "Pricing: 60%, Upsell: 40%")
- Updates live as tasks added/removed
- **Implementation pattern**:
  ```typescript
  function TaskCoverageIndicator({ tasks, goalEmbedding, coverageThreshold = 0.7 }) {
    const coverage = calculateTaskCoverage(tasks, goalEmbedding);
    const coveragePercentage = (coverage.length / tasks.length) * 100;

    return (
      <div className={`coverage-meter ${
        coveragePercentage > 80 ? 'high' :
        coveragePercentage > 50 ? 'medium' : 'low'
      }`}>
        {coveragePercentage.toFixed(0)}% Goal Coverage
      </div>
    );
  }
  ```

### 6. Integration with Existing Gap Filling (Phase 5)
- Extend `suggestBridgingTasks` to use quality scores
- Deprioritize low-quality tasks in suggestions
- Auto-flag quality issues in bridging task review

---

## Out of Scope (No-gos)
- Automatic task editing without user approval
- Rewriting existing task text (only suggest, don't change)
- Building task templates library
- Integration with external PM tools (Jira, Asana)
- Historical quality analysis of past tasks

---

## Risks & Rabbit Holes

| Risk | Why it's scary | Mitigation |
|------|----------------|------------|
| False positives – flagging good tasks as low quality | Users lose trust if system is too picky | Set conservative thresholds; allow "Dismiss" feedback; track false positive rate |
| Over-generation – too many draft tasks suggested | UI cluttered, user overwhelmed | Limit to 3 drafts per gap; use confidence threshold >0.7 |
| Performance hit – analysis adds latency to prioritization | Users wait longer for results | Run async after initial plan returned; show "Analyzing gaps..." progressive disclosure |
| Conflicting suggestions – quality evaluator vs. gap detector | Draft tasks might also be low quality | Run quality check on generated drafts before showing; filter out low-scoring suggestions |
| Scope creep – temptation to build full task management | 6 weeks becomes 12 weeks | Hard stop at gap detection + quality scoring; no workflow automation features |

---

## Success Metrics
- **Gap detection accuracy**: ≥80% of flagged gaps confirmed valid by users (via accept rate)
- **Quality improvement**: Average task clarity score increases from ~0.6 → 0.8+ after suggestions applied
- **Coverage increase**: Goal-task coverage improves from ~65% → 85%+ after draft task acceptance
- **User satisfaction**: "Task quality" complaints decrease by 60% (in-app feedback)
- **Suggestion acceptance**: ≥50% of generated draft tasks accepted or edited (not dismissed)
- **Performance**: Gap analysis completes in <3s at P95 (async, doesn't block main prioritization)

---

## Deliverables
1. `goalTaskCoverageService.ts` – Semantic coverage analysis
2. `taskQualityEvaluator.ts` – Clarity scoring + granularity checks
3. New Mastra tool: `generate-missing-tasks` (draft task generator)
4. Enhanced agent instructions with self-questioning protocol
5. UI components:
   - Gap Detection Modal
   - Quality badges + tooltips on task cards
   - Coverage progress indicator
   - Draft task review interface
6. Database schema updates:
   - `agent_sessions.coverage_analysis` jsonb (stores coverage scores and missing areas)
   - `task_embeddings.quality_metadata` jsonb (stores clarity scores and improvement suggestions)
   - Leverage existing pgvector extension with IVFFlat index:
     ```sql
     CREATE INDEX ON task_embeddings
     USING ivfflat (embedding vector_cosine_ops);
     ```
   - Support for `match_tasks` RPC function for fast similarity search
7. Integration tests:
   - Coverage analysis with various outcome types
   - Quality scoring across task types
   - Draft task generation + acceptance flow
   - UI gap modal workflow
8. Performance benchmarks (ensure <3s async analysis)

---

## Technical Implementation Notes

### Vector Embedding Strategy
- **Model**: OpenAI `text-embedding-3-small` with 512 dimensions (optimized for speed vs. accuracy)
- **Batching**: Batch embed tasks to reduce API calls and improve performance
- **Caching**: Cache embeddings in Supabase for repeated use (avoid regeneration)
- **Similarity threshold**: Use 0.7-0.8 for production (0.3 for testing/debugging)

### Supabase pgvector Integration
- **Query method**: Use `match_tasks` RPC function for semantic search
  ```typescript
  await supabase.rpc('match_tasks', {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: 10
  });
  ```
- **Index optimization**: IVFFlat index suitable for 10K-100K scale (upgrade to HNSW for >100K)
- **Performance target**: <500ms at P95 for similarity queries

### Mastra Workflow Pattern
- **Async execution**: Run gap analysis async after initial prioritization (progressive disclosure)
- **Parallel processing**: Execute quality evaluation and prioritization recommendations in parallel
- **Tool composition**: Chain `generate-missing-tasks` → quality checks → user approval

### Performance Optimization
- **Embedding generation**: ~200ms per task (batch to reduce latency)
- **Coverage analysis**: Run asynchronously, show "Analyzing gaps..." indicator
- **Quality scoring**: Use GPT-4o-mini for fast, cost-efficient evaluation
- **Target latency**: <3s for full gap analysis at P95

### Common Pitfalls to Avoid
1. Over-reliance on embeddings without human review → Always require user approval for generated tasks
2. Generating too many low-quality bridging tasks → Limit to 3 drafts per gap, confidence threshold >0.7
3. Not updating embeddings as task context changes → Implement incremental embedding updates
4. Ignoring task dependencies and skill requirements → Run dependency validation before insertion

### React UI Patterns
- **Coverage indicator**: Real-time progress bar with concept breakdown
- **Quality badges**: Color-coded (🟢 Clear | 🟡 Review | 🔴 Needs Work) with hover tooltips
- **Gap modal**: Draft task review with approve/edit/dismiss actions
- **Progressive disclosure**: Show gap detection only when coverage <70% or user triggers

### References
- [Mastra Workflows Documentation](https://mastra.ai/docs/workflows)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Supabase pgvector Extension](https://supabase.com/docs/guides/database/extensions/pgvector)
- Implementation examples: `docs/shape-up-pitches/phase-10-curated-docs.md`

---

## Dependencies
- Phase 1: Vector embeddings (for coverage analysis)
- Phase 2: Mastra tool registry (for new generate-missing-tasks tool)
- Phase 3: Agent runtime (for self-questioning integration)
- Phase 5: Gap detection framework (extends existing logic)
- Phase 7: Reflection system (quality checks should respect reflection constraints)

---

## Ready When
- User runs prioritization → System flags low-quality tasks with clear, actionable suggestions
- Coverage score shows <80% → Gap detection automatically triggers and suggests draft tasks
- User accepts draft task → It's inserted into plan with proper dependencies + priority
- Quality badges visible on all task cards → Users can immediately identify tasks needing refinement
- Agent's reasoning trace includes "Pre-Flight Check" section showing gap + quality validation
- Users report: "The system finally pushes back on vague tasks" and "I don't have to manually fill obvious gaps anymore"

---

**Appetite:** 6 weeks
**Status:** Proposed
**Next Phase:** Phase 11 (Strategic Prioritization with Impact-Effort Model)
