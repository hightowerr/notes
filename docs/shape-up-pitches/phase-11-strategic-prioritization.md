# Shape Up Pitch: Phase 11 – Strategic Prioritization (Impact-Effort Model)

## Problem

**Tasks are ranked purely by semantic similarity to the goal, ignoring business impact, effort required, and confidence—leading to poor strategic decisions.**

### Reality today
- Agent prioritizes Task A over Task B solely because A's text is semantically closer to the outcome statement
- No consideration of:
  - **Impact:** Will this task actually move the metric? (e.g., A/B test vs. documentation update)
  - **Effort:** Is this a 2-hour fix or a 2-week project?
  - **Risk/Confidence:** Are we sure this will work, or is it experimental?
- Users see high-effort, low-impact tasks at the top of their priority list
- No way to filter by "quick wins" vs. "strategic bets"
- Business context (ROI, urgency, resource constraints) ignored

### User feedback
> "The agent put 'Rewrite entire checkout flow' as #1 priority. That's 4 weeks of work! I need quick wins to show progress this week."
> "Why is 'Write FAQ page' ranked above 'Fix payment bug'? The FAQ has zero impact on revenue."
> "I can't tell which tasks are strategic bets vs. safe incremental improvements. Everything looks equally important."

**Core issue:** Semantic similarity ≠ strategic value. The system lacks business reasoning to trade off impact, effort, and risk. Users manually re-sort tasks based on intuition that the AI should encode.

---

## Appetite
- **6-week big batch** (full cycle)
- We're adding a new prioritization model layer, UI visualization for impact/effort quadrants, and multi-dimensional scoring that requires agent instruction updates, backend services, and frontend components.

---

## Solution – High Level

Deliver a strategic prioritization engine that:
1. **Scores tasks on 3 dimensions**: Impact (0-10), Effort (hours), Confidence (0-1)
2. **Calculates strategic priority**: `Priority = E[Impact] / E[Effort] × Confidence`
3. **Surfaces multiple sorting strategies**: Quick wins, strategic bets, balanced, urgent
4. **Visualizes trade-offs** via 2×2 quadrant (Impact vs. Effort)
5. **Learns from outcomes** (future Phase 13 will close the loop with actual results)
6. **Maintains transparency** showing score breakdowns for every task

---

## Breadboard Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  Priorities View – Strategic Prioritization                   │
│                                                              │
│  Sort by:  [● Balanced] [ Quick Wins] [ Strategic Bets]      │
│                                                              │
│  Impact/Effort Quadrant                                       │
│  High Impact │  🌟 Launch pricing test (2d)                  │
│  Low Effort  │  🌟 Fix payment validation bug (4h)           │
│  ────────────┼──────────────────────────────────              │
│  High Impact │  🎯 Rebuild checkout UX (3w)                  │
│  High Effort │  🎯 Migrate to new CRM (6w)                   │
│  ────────────┼──────────────────────────────────              │
│  Low Impact  │  ⚡ Add loading spinner (2h)                  │
│  Low Effort  │  ⚡ Update copyright year (15min)             │
│  ────────────┼──────────────────────────────────              │
│  Low Impact  │  ⏸ Write internal wiki (1w)                   │
│  High Effort │  ⏸ Redesign entire dashboard (4w)             │
│                                                              │
│  Task List (Balanced Sort)                                    │
│  1. 🌟 Fix payment validation bug                            │
│     Impact: 8/10  Effort: 4h  Confidence: 0.9               │
│     Priority Score: 180.0  [Why this score?]                 │
│  2. 🎯 Launch pricing A/B test                               │
│     Impact: 9/10  Effort: 16h  Confidence: 0.7              │
│     Priority Score: 39.4   [Why this score?]                 │
│  3. ⚡ Add onboarding tooltip                                │
│     Impact: 5/10  Effort: 2h  Confidence: 0.8               │
│     Priority Score: 20.0   [Why this score?]                 │
│                                                              │
│  [Adjust Impact/Effort] [View Reasoning]                     │
└──────────────────────────────────────────────────────────────┘
```

---

## What We're Building

### 1. Strategic Scoring Service
**Impact Estimation (0-10 scale):**
- Use LLM to analyze task against outcome: "Rate how much this task will move [metric]"
- Factors:
  - Direct vs. indirect impact on stated metric
  - Scope of change (user-facing = higher, internal = lower)
  - Reversibility (A/B test = higher confidence than full redesign)
- Baseline heuristics:
  - Contains "launch", "test", "experiment" = +2 impact
  - Contains "document", "refactor", "cleanup" = -1 impact
  - Revenue/conversion keywords = +3 impact

**Effort Estimation (hours):**
- Extract from task text if numeric hint exists ("2-day sprint" = 16h)
- Fall back to task complexity heuristic:
  - Low cognition + short text = 2-8h
  - Medium cognition + moderate text = 8-40h
  - High cognition + long text = 40-160h
- Allow manual override via UI slider

**Confidence Scoring (0-1):**
- Semantic similarity to outcome (existing logic)
- Dependency confidence (from detect-dependencies tool)
- Historical success rate (future phase)
- Formula: `Confidence = 0.6 × SemanticSim + 0.3 × DepConfidence + 0.1 × HistSuccess`

**Priority Calculation:**
```typescript
Priority = (Impact / max(Effort, 1)) × Confidence

// Normalized to 0-100 scale:
Priority = min(100, (Impact × 10) / (Effort / 8) × Confidence)
```

### 2. Multi-Strategy Sorting

**Balanced (default):**
- Sort by priority score (highest first)
- Best overall strategic value

**Quick Wins:**
- Filter: Effort ≤ 8 hours
- Sort by: Impact × Confidence
- Shows high-value tasks doable this week

**Strategic Bets:**
- Filter: Impact ≥ 7 AND Effort > 40 hours
- Sort by: Impact (highest first)
- Shows long-term, high-stakes investments

**Urgent:**
- Boost priority if task contains time-sensitive keywords ("urgent", "critical", "blocking")
- Apply 2× multiplier to priority score

### 3. Impact/Effort Visualization
**2×2 Quadrant Component:**
- X-axis: Effort (log scale: 1h → 160h)
- Y-axis: Impact (0-10)
- Task bubbles sized by confidence
- Color-coded by quadrant:
  - 🌟 High Impact / Low Effort = Green (do first)
  - 🎯 High Impact / High Effort = Blue (strategic)
  - ⚡ Low Impact / Low Effort = Yellow (filler work)
  - ⏸ Low Impact / High Effort = Red (avoid)
- Interactive: click bubble → scroll to task in list

### 4. Score Transparency UI
**"Why this score?" Modal:**
```
Priority Score: 180.0

Breakdown:
• Impact: 8/10
  → Direct revenue impact (payment bug blocks checkout)
  → Keywords: "payment", "bug", "validation"
• Effort: 4 hours
  → Short estimated time
  → Low complexity (backend validation fix)
• Confidence: 0.9 (High)
  → 0.85 semantic similarity to outcome
  → 0.95 dependency confidence
  → 0.90 estimated based on historical similar tasks

Formula: (8 / 4) × 0.9 = 1.8 → Scaled to 180

[Adjust Impact] [Adjust Effort] [Override Priority]
```

### 5. Manual Override System
- User can adjust any task's Impact (slider 0-10)
- User can adjust Effort (input hours)
- Priority recalculates instantly
- Override stored in `task_embeddings.manual_overrides jsonb`
- Badge shows "Manual override" on adjusted tasks

### 6. Agent Integration
**Enhanced Agent Instructions:**
```typescript
// Add to taskOrchestratorAgent prompt:
"For each task, estimate:
1. Impact (0-10): How much will this move [metric]?
2. Effort (hours): Realistic time to complete
3. Confidence (0-1): How certain are we this helps?

Return in prioritized_plan.strategic_scores:
{ task_id: { impact, effort, confidence, priority } }
"
```

### 7. Storage Schema
```sql
ALTER TABLE agent_sessions ADD COLUMN strategic_scores JSONB;
-- Format: { "task-id": { impact: 8, effort: 16, confidence: 0.7, priority: 35.0 } }

ALTER TABLE task_embeddings ADD COLUMN manual_overrides JSONB;
-- Format: { impact: 9, effort: 8, reason: "User adjusted based on actual complexity" }
```

---

## Out of Scope (No-gos)
- Historical outcome tracking (deferred to Phase 13: Learning Loop)
- Integration with time tracking tools (Toggl, Harvest)
- Team capacity planning (multi-user resource allocation)
- Automatic effort estimation via code analysis
- Impact prediction models trained on past data

---

## Risks & Rabbit Holes

| Risk | Why it's scary | Mitigation |
|------|----------------|------------|
| Inaccurate impact estimates | LLM guesses wrong, users lose trust | Allow manual override; show confidence intervals; gather feedback for tuning |
| Effort estimation drift | 4h estimate becomes 40h in reality | Emphasize estimates are rough; provide "actual vs. estimated" tracking (future phase) |
| Over-optimization for quick wins | Users only do easy tasks, neglect strategic work | Balance sort shows both; quadrant visualizes trade-offs clearly |
| Complexity creep – building full PM tool | 6 weeks becomes 12 weeks | Hard stop at scoring + visualization; no workflow automation, no timelines |
| Performance – scoring adds latency | Prioritization slows down | Score in parallel with dependency detection; cache impact heuristics |

---

## Success Metrics
- **Prioritization quality**: Users report 70%+ agreement with top 5 tasks (vs. <40% baseline)
- **Strategic balance**: ≥60% of users try both "Quick Wins" and "Strategic Bets" views within first week
- **Override rate**: <20% of tasks manually adjusted (indicates estimates are good)
- **Quadrant distribution**: Healthy spread across all 4 quadrants (not all tasks in one corner)
- **User satisfaction**: "Priority quality" NPS increases by 25+ points
- **Performance**: Strategic scoring adds <2s to total prioritization time

---

## Deliverables
1. `strategicScoringService.ts` – Impact/Effort/Confidence estimation
2. Enhanced agent instructions with strategic scoring requirements
3. UI components:
   - Impact/Effort 2×2 quadrant visualization (D3.js or Recharts)
   - Multi-strategy sort dropdown (Balanced, Quick Wins, Strategic Bets, Urgent)
   - Score breakdown modal ("Why this score?")
   - Manual override sliders
4. Database schema updates:
   - `agent_sessions.strategic_scores` jsonb
   - `task_embeddings.manual_overrides` jsonb
5. API endpoints:
   - `PATCH /api/tasks/[id]/override` – Update impact/effort
   - `GET /api/priorities?sort=quick-wins` – Filtered sorting
6. Integration tests:
   - Strategic scoring across task types
   - Quadrant visualization data accuracy
   - Manual override persistence + recalculation
   - Multi-strategy sorting correctness
7. Performance benchmarks (<2s scoring overhead)

---

## Dependencies
- Phase 3: Agent runtime (for enhanced instructions)
- Phase 7: Reflection system (strategic scores should respect reflection constraints)
- Phase 10: Task Intelligence (quality scores inform confidence)

---

## Ready When
- Every task shows Impact/Effort/Confidence/Priority scores
- User can toggle between Balanced, Quick Wins, Strategic Bets, Urgent sorts
- 2×2 quadrant clearly shows strategic positioning of all tasks
- "Why this score?" modal provides transparent breakdown
- User adjusts Impact slider → Priority recalculates instantly → Change persists across sessions
- Users report: "I finally understand why Task A is ranked above Task B" and "The quick wins filter is a game-changer"

---

**Appetite:** 6 weeks
**Status:** Proposed
**Dependencies:** Phase 3 (Agent), Phase 7 (Reflections), Phase 10 (Intelligence)
**Next Phase:** Phase 12 (Goal Harmony – Conflict Detection)
