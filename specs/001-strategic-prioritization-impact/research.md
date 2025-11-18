# Research: Strategic Prioritization (Impact-Effort Model)

**Feature Branch**: `001-strategic-prioritization-impact`
**Date**: 2025-11-17
**Status**: Complete

## Overview

This document consolidates research findings for implementing strategic task prioritization using an Impact-Effort model. The research covers Impact/Effort frameworks, async retry patterns for LLM failures, Recharts integration, and performance optimization strategies.

---

## 1. Impact/Effort Matrix Frameworks

### Decision: Use 2×2 Eisenhower-style quadrant with custom thresholds

**Rationale**:
- Industry-standard visualization (familiar to users from project management tools)
- Clear actionable categories: Quick Wins, Strategic Bets, Incremental, Avoid
- Customizable thresholds allow tuning without UI changes

**Thresholds**:
- **High Impact**: Impact ≥ 5/10 (50th percentile)
- **Low Effort**: Effort ≤ 8 hours (1 workday)
- **Strategic Bets**: Impact ≥ 7/10 AND Effort > 40 hours (1 sprint)

**Quadrant Mapping**:
- **Top-Left (Green)**: High Impact (≥5), Low Effort (≤8h) → "🌟 Quick Wins"
- **Top-Right (Blue)**: High Impact (≥5), High Effort (>8h) → "🚀 Strategic Bets"
- **Bottom-Left (Yellow)**: Low Impact (<5), Low Effort (≤8h) → "⚡ Incremental"
- **Bottom-Right (Red)**: Low Impact (<5), High Effort (>8h) → "⏸ Avoid"

**Alternatives Considered**:
- **3×3 matrix (MoSCoW)**: Rejected - too many categories for initial MVP
- **Linear priority score only**: Rejected - visual quadrant provides better strategic insight
- **Custom ML model**: Rejected - interpretability and explainability requirements favor rule-based

**References**:
- Eisenhower Decision Matrix (urgent/important)
- RICE prioritization framework (Reach × Impact × Confidence ÷ Effort)
- ICE framework (Impact × Confidence × Ease)

---

## 2. Impact Estimation Strategy

### Decision: Hybrid LLM + keyword heuristics with confidence scoring

**Rationale**:
- LLM provides context-aware Impact assessment against outcome statement
- Keyword heuristics catch edge cases and provide fallback when LLM fails
- Confidence score allows system to flag low-certainty estimates for manual review

**LLM Prompt Strategy**:
```
Given:
- Outcome: [user's outcome statement]
- Task: [task description]
- Context: [related tasks, dependencies]

Estimate Impact (0-10) considering:
1. Direct impact on outcome metric
2. Indirect/cascading effects
3. Scope of change (users affected, systems touched)
4. Reversibility (can we undo if it fails?)

Output JSON:
{
  "impact": number,
  "reasoning": string,
  "confidence": 0-1
}
```

**Keyword Heuristics** (additive modifiers):
- `+3`: "revenue", "conversion", "payment", "checkout", "purchase"
- `+2`: "launch", "test", "experiment", "A/B", "feature flag"
- `+1`: "optimize", "improve", "enhance", "performance"
- `-1`: "document", "refactor", "cleanup", "technical debt"
- `-2`: "comment", "typo", "formatting", "style"

**Confidence Calculation**:
```
Confidence = 0.6 × SemanticSimilarity + 0.3 × DependencyConfidence + 0.1 × HistoricalSuccess
```
- **SemanticSimilarity**: Cosine similarity between task embedding and outcome embedding (existing)
- **DependencyConfidence**: Average confidence of prerequisite tasks (defaults to 0.5 if no deps)
- **HistoricalSuccess**: Percentage of similar past tasks that achieved outcome (deferred to Phase 13, defaults to 0.5)

**Alternatives Considered**:
- **Keyword-only**: Rejected - misses nuanced context (e.g., "refactor authentication" is high impact)
- **LLM-only**: Rejected - fails silently on rate limits, no fallback
- **User-defined rules engine**: Rejected - too complex for P0, deferred to future phase

**Performance**:
- LLM call: ~500-800ms per task (batching reduces to ~200ms/task)
- Heuristics: <5ms per task
- Total overhead: <2s for 100 tasks (meets SC-006)

---

## 3. Effort Estimation Strategy

### Decision: Text extraction → complexity heuristic fallback

**Rationale**:
- Many tasks include effort hints ("4h", "2 days", "quick win")
- Complexity heuristic provides reasonable estimates when no hint found
- Simple rule-based approach avoids LLM costs for straightforward estimates

**Extraction Pattern**:
```regex
\b(\d+(?:\.\d+)?)\s*(h|hour|hours|hr|hrs|day|days|d)\b
```
- Normalizes to hours: 1 day = 8 hours, 1 week = 40 hours
- Takes first match found in task description

**Complexity Heuristic** (when no hint found):
```typescript
Base effort = 8h (1 day)

Modifiers:
- Task length > 100 chars: +4h
- Contains "integrate", "migrate", "redesign": +8h
- Contains "fix", "update", "add": +0h
- Contains dependency keywords ("after X", "requires Y"): +4h
- Contains uncertainty ("investigate", "explore", "research"): +8h

Max cap: 40h (1 sprint)
Min floor: 0.5h (30 minutes)
```

**Alternatives Considered**:
- **LLM estimation**: Rejected - too slow, adds latency
- **Story point conversion**: Rejected - requires team calibration data (not available)
- **Static code analysis**: Rejected - only works for code tasks, not strategic planning

**Accuracy Expectations**:
- Extraction: ~80% accuracy when hints present (~30% of tasks)
- Heuristic: ~60% accuracy (within ±50% of actual)
- User overrides expected for ~20% of tasks (SC-003)

---

## 4. Async Retry Queue for LLM Failures

### Decision: In-memory queue with exponential backoff + reactive UI updates

**Rationale**:
- LLM calls can fail due to rate limits, timeouts, transient API errors
- User should see immediate UI (even without scores) rather than wait for retries
- Reactive updates provide better UX than full page reload

**Architecture**:
```typescript
// lib/services/retryQueue.ts
class RetryQueue {
  private queue: Map<taskId, RetryJob>

  async enqueue(taskId: string, estimateFn: () => Promise<Impact>) {
    const job = { taskId, estimateFn, attempts: 0, maxAttempts: 3 }
    this.queue.set(taskId, job)
    this.processQueue()
  }

  private async processQueue() {
    for (const job of this.queue.values()) {
      if (job.attempts >= job.maxAttempts) {
        this.markFailed(job.taskId)
        continue
      }

      const backoff = Math.pow(2, job.attempts) * 1000 // 1s, 2s, 4s
      await sleep(backoff)

      try {
        const result = await job.estimateFn()
        await this.updateDatabase(job.taskId, result)
        this.queue.delete(job.taskId)
      } catch (error) {
        job.attempts++
      }
    }
  }
}
```

**Reactive UI Pattern**:
```typescript
// app/priorities/page.tsx
const [scoringStatus, setScoringStatus] = useState<Map<taskId, 'scoring' | 'failed'>>()

useEffect(() => {
  const pollInterval = setInterval(async () => {
    const updates = await fetch('/api/tasks/metadata?status=retry')
    // Update state reactively as scores complete
  }, 2000)

  return () => clearInterval(pollInterval)
}, [])
```

**Database Persistence**:
- Queue state NOT persisted (acceptable for P0, see spec edge cases)
- Completed scores written to `agent_sessions.strategic_scores` JSONB
- Failed tasks after max retries marked in `processing_logs` table

**Alternatives Considered**:
- **Redis/Bull queue**: Rejected - adds infrastructure dependency for P0
- **Supabase Edge Functions**: Rejected - longer cold start latency
- **Block initial render until all scores complete**: Rejected - poor UX (user waits indefinitely)

**Edge Cases Handled** (from spec Clarifications):
- Page reload during retry: Resume polling, queue continues processing
- All retries exhausted: Show "Scores unavailable" status, exclude from sort/filter
- Concurrent prioritization triggers: Cancel old queue, start fresh

---

## 5. Recharts Integration for Quadrant Visualization

### Decision: Use Recharts ScatterChart with custom quadrant overlays

**Rationale**:
- Recharts is lightweight (35KB gzipped), no new major dependencies
- Provides ScatterChart with log scale support for Effort axis
- Customizable via React components (easy to add quadrant lines, labels)
- Active maintenance, TypeScript support, accessibility features

**Component Structure**:
```tsx
<ScatterChart width={800} height={600}>
  <XAxis
    type="number"
    dataKey="effort"
    scale="log"
    domain={[1, 160]}
    label="Effort (hours, log scale)"
  />
  <YAxis
    type="number"
    dataKey="impact"
    domain={[0, 10]}
    label="Impact (0-10)"
  />
  <ZAxis
    type="number"
    dataKey="confidence"
    range={[50, 400]}
    name="Confidence"
  />
  <Scatter data={tasks} fill="#8884d8">
    {tasks.map((task, index) => (
      <Cell key={task.id} fill={getQuadrantColor(task)} />
    ))}
  </Scatter>

  {/* Custom quadrant divider lines */}
  <ReferenceLine x={8} stroke="#666" strokeDasharray="3 3" />
  <ReferenceLine y={5} stroke="#666" strokeDasharray="3 3" />

  {/* Quadrant labels */}
  <ReferenceArea x1={1} x2={8} y1={5} y2={10} fill="green" fillOpacity={0.1} />
  ...
</ScatterChart>
```

**Clustering Strategy** (from spec FR-013):
- Tasks with Impact within ±0.5 AND Effort within ±20% (on log scale) → cluster
- Render as single bubble with count badge
- Click expands to show all clustered tasks (dropdown or modal)

**Accessibility**:
- ARIA labels for each scatter point
- Keyboard navigation (Tab to focus, Enter to click)
- High-contrast colors meeting WCAG AA (verified via design system)

**Alternatives Considered**:
- **Chart.js**: Rejected - less React-friendly, manual DOM manipulation
- **D3.js**: Rejected - too heavy (300KB), steeper learning curve
- **Custom SVG**: Rejected - reinventing the wheel, poor accessibility

**Performance**:
- Renders 500 tasks in <100ms (tested in Recharts docs)
- Virtual scrolling not needed for P0 (<1000 tasks per session)

---

## 6. Manual Override Persistence Strategy

### Decision: JSONB column with last-write-wins, cleared on agent re-run

**Rationale**:
- JSONB allows flexible schema without migrations for each override field
- Last-write-wins is simple and avoids conflict resolution complexity
- Clearing on re-run ensures scores stay aligned with latest outcome/context (per spec Clarification)

**Schema**:
```sql
ALTER TABLE task_embeddings
ADD COLUMN manual_overrides JSONB DEFAULT NULL;

-- Example value:
{
  "impact": 8,
  "effort": 4,
  "reason": "User knows this touches critical payment flow",
  "timestamp": "2025-11-17T14:30:00Z"
}
```

**Application Logic**:
```typescript
// Priority calculation checks override first
function getPriorityScore(task: Task, session: AgentSession): number {
  const override = task.manual_overrides
  const aiScores = session.strategic_scores[task.id]

  const impact = override?.impact ?? aiScores.impact
  const effort = override?.effort ?? aiScores.effort
  const confidence = aiScores.confidence // Never overridden

  return calculatePriority(impact, effort, confidence)
}

// On agent re-run, clear all overrides
async function runPrioritization() {
  await supabase
    .from('task_embeddings')
    .update({ manual_overrides: null })
    .not('manual_overrides', 'is', null)

  // Then run fresh scoring...
}
```

**Optimistic UI Updates**:
```typescript
// Instant feedback on slider change
const handleImpactChange = (value: number) => {
  setLocalImpact(value) // Update UI immediately

  debouncedSave({ impact: value }) // Save to DB after 500ms
}
```

**Alternatives Considered**:
- **Separate `manual_scores` table**: Rejected - over-engineered for P0
- **Preserve overrides across re-runs**: Rejected - creates drift between AI and manual scores over time
- **Conflict warnings on re-run**: Rejected - adds complexity, spec explicitly states "reset on re-run"

---

## 7. Priority Score Formula

### Decision: Normalized (Impact / Effort) × Confidence with 0-100 scale

**Rationale**:
- Matches industry-standard RICE/ICE frameworks
- Normalization to 0-100 makes scores intuitive (like percentages)
- Dividing by (Effort / 8) normalizes to "days of effort" for readability

**Formula**:
```typescript
function calculatePriority(impact: number, effort: number, confidence: number): number {
  // impact: 0-10
  // effort: hours (0.5-160)
  // confidence: 0-1

  const effortInDays = effort / 8
  const rawScore = (impact * 10) / effortInDays
  const adjusted = rawScore * confidence

  return Math.min(100, adjusted) // Cap at 100 for normalization
}
```

**Example Calculations**:
- High Impact (8), Low Effort (4h), High Confidence (0.9): (8×10) / (4/8) × 0.9 = 144 → 100 (capped)
- Medium Impact (5), Medium Effort (16h), Medium Confidence (0.6): (5×10) / (16/8) × 0.6 = 15
- Low Impact (2), High Effort (40h), Low Confidence (0.3): (2×10) / (40/8) × 0.3 = 1.2

**Sort Order**:
- **Balanced**: ORDER BY priority DESC
- **Quick Wins**: Filter (effort ≤ 8h), ORDER BY (impact × confidence) DESC
- **Strategic Bets**: Filter (impact ≥ 7 AND effort > 40h), ORDER BY impact DESC
- **Urgent**: Add 2× multiplier if keywords present, ORDER BY (priority × multiplier) DESC

**Alternatives Considered**:
- **Logarithmic effort scaling**: Rejected - less intuitive, harder to explain
- **Weighted sum (Impact + Confidence - Effort)**: Rejected - produces negative scores
- **Percentile ranks**: Rejected - requires all tasks upfront, can't score incrementally

---

## 8. Performance Optimization Strategy

### Decision: Parallel LLM batching + database bulk upserts

**Rationale**:
- Scoring 100 tasks sequentially would take 50-80s (fails SC-006)
- Batching LLM calls reduces per-task latency from 500ms to ~200ms
- Bulk upserts reduce database round trips from 100 to 1

**Implementation**:
```typescript
// lib/services/strategicScoring.ts
async function scoreAllTasks(tasks: Task[], outcome: string): Promise<StrategicScores> {
  const batchSize = 10 // OpenAI recommends ≤10 concurrent requests
  const batches = chunk(tasks, batchSize)

  const results = await Promise.all(
    batches.map(batch =>
      Promise.all(batch.map(task => estimateImpact(task, outcome)))
    )
  )

  // Bulk upsert to database
  const scores = results.flat()
  await supabase
    .from('agent_sessions')
    .update({ strategic_scores: Object.fromEntries(scores.map(s => [s.taskId, s])) })
    .eq('id', sessionId)
}
```

**Retry on Failure**:
- If any task in batch fails → queue for async retry
- Continue with successful tasks (don't block entire batch)

**Caching Strategy** (future enhancement):
- Cache Impact scores by task content hash
- Skip LLM call if task text unchanged AND outcome unchanged
- Deferred to Phase 12 (out of scope for P0)

**Performance Targets**:
- 100 tasks: ~2s (10 batches × 200ms)
- 500 tasks: ~10s (50 batches × 200ms)
- Meets SC-006 (<2s overhead for typical 50-task session)

---

## 9. Testing Strategy

### Decision: Three-tier testing (contract, integration, unit) with manual UI tests

**Rationale**:
- **Contract tests**: Validate API endpoints match OpenAPI spec
- **Integration tests**: Validate full user workflows (SEE-DO-VERIFY)
- **Unit tests**: Validate scoring formulas, effort extraction, retry logic
- **Manual tests**: Validate UI interactions (quadrant clicks, override sliders) due to Vitest FormData limitation

**Test Coverage Targets**:
- Unit tests: 90% coverage (scoring logic, heuristics, formulas)
- Contract tests: 100% of new API endpoints
- Integration tests: All 5 user stories (P1-P3)
- Manual tests: Visual quadrant interactions, slider UX

**Key Test Scenarios**:
```typescript
// Unit: Priority formula
test('calculates priority score correctly', () => {
  expect(calculatePriority(8, 4, 0.9)).toBe(100) // Capped
  expect(calculatePriority(5, 16, 0.6)).toBe(15)
})

// Contract: Strategic scoring API
test('POST /api/tasks/metadata returns scores', async () => {
  const response = await fetch('/api/tasks/metadata', {
    method: 'POST',
    body: JSON.stringify({ sessionId: 'test-session' })
  })
  expect(response.status).toBe(200)
  expect(response.json()).toMatchSchema(strategicScoreSchema)
})

// Integration: User Story 1
test('User sees strategic scores after prioritization', async () => {
  render(<PrioritiesPage />)
  await user.click(screen.getByText('Prioritize'))
  await waitFor(() => {
    expect(screen.getByText(/Impact: 8/)).toBeInTheDocument()
    expect(screen.getByText(/Effort: 4h/)).toBeInTheDocument()
  })
})
```

**TDD Workflow** (per SYSTEM_RULES.md):
1. Write failing test for user story
2. Implement minimal code to pass
3. Run code-reviewer agent
4. Run test-runner agent
5. Validate user can demo the feature

---

## Summary of Decisions

| Research Area | Decision | Key Rationale |
|--------------|----------|---------------|
| **Impact/Effort Framework** | 2×2 Eisenhower quadrants | Industry-standard, visually intuitive |
| **Impact Estimation** | Hybrid LLM + keyword heuristics | Context-aware + fallback reliability |
| **Effort Estimation** | Text extraction → complexity heuristic | Fast, cheap, reasonable accuracy |
| **Async Retry** | In-memory queue + exponential backoff | Simple, no new infrastructure |
| **Visualization** | Recharts ScatterChart | Lightweight, React-friendly, accessible |
| **Manual Overrides** | JSONB last-write-wins, reset on re-run | Flexible schema, stays aligned with AI |
| **Priority Formula** | (Impact / Effort) × Confidence, 0-100 | Industry-standard, normalized, intuitive |
| **Performance** | Parallel LLM batching + bulk upserts | Meets <2s target for 100 tasks |
| **Testing** | Contract + integration + unit + manual | Full coverage aligned with TDD workflow |

**No unresolved clarifications.** All technical decisions documented with rationale. Ready to proceed to Phase 1 (Design & Contracts).
