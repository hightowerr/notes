# Shape Up Pitch: Phase 13 – Path Explorer (Alternative Strategy Simulation)

## Problem

**Users see one recommended plan and must trust it's optimal without exploring alternative approaches, trade-offs, or risk profiles.**

### Reality today
- Agent generates ONE priority list based on current heuristics
- No way to explore: "What if we focused on quick wins first?" or "What if we took the risky strategic bet?"
- Users can't compare conservative vs. aggressive strategies
- No visibility into alternative paths that might achieve the same goal
- Decisions made without understanding opportunity cost of chosen approach
- No "what-if" scenario planning for stakeholder discussions

### User feedback
> "The agent suggested we build the full feature first. But what if we ran a landing page test instead? How do I compare those approaches?"
> "I need to show my team three options: safe bet, balanced, and moonshot. Right now the system only gives me one answer."
> "What's the risk/reward trade-off if we take Path A vs. Path B? I can't make strategic decisions without this."

**Core issue:** Single-path recommendation assumes the system knows best. Real strategic planning requires exploring multiple viable approaches, understanding their trade-offs, and choosing based on risk appetite, timeline, and resources.

---

## Appetite
- **6-week big batch** (full cycle)
- We're building scenario generation, multi-path reasoning, trade-off analysis, simulation engine, and comparative visualization—all requiring new agent capabilities and complex UI components.

---

## Solution – High Level

Deliver a path exploration system that:
1. **Generates 3 alternative strategies** for achieving the same goal (conservative, balanced, aggressive)
2. **Simulates outcomes** using Bayesian probability + historical data (when available)
3. **Compares paths** on dimensions: timeline, risk, resource cost, expected impact
4. **Visualizes trade-offs** via interactive decision tree and scenario cards
5. **Supports "what-if" mode** where user tweaks assumptions and sees updated predictions
6. **Enables stakeholder collaboration** via shareable scenario URLs

---

## Breadboard Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  Path Explorer – Alternative Strategies                       │
│                                                              │
│  Goal: "Increase monthly ARR 15% in Q2"                      │
│                                                              │
│  Generated Paths (3)                                          │
│  ┌────────────────────────────────────────────────┐          │
│  │ 🛡 Path A: Safe Bet (Conservative)             │          │
│  │ Timeline: 12 weeks  |  Risk: Low (15%)         │          │
│  │ Expected Impact: 12-15% ARR increase          │          │
│  │                                                 │          │
│  │ Strategy: Optimize existing conversion funnel  │          │
│  │ Key Tasks:                                      │          │
│  │ • Fix checkout UX issues (2w)                  │          │
│  │ • A/B test payment page layouts (1w)           │          │
│  │ • Add trust badges + testimonials (1w)         │          │
│  │ • Run email re-engagement campaign (ongoing)   │          │
│  │                                                 │          │
│  │ Pros: Low risk, proven tactics, fast start     │          │
│  │ Cons: Ceiling limited, no breakthrough         │          │
│  │ [Select Path A] [View Details] [Customize]     │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  ┌────────────────────────────────────────────────┐          │
│  │ ⚖ Path B: Balanced (Recommended)               │          │
│  │ Timeline: 10 weeks  |  Risk: Medium (35%)      │          │
│  │ Expected Impact: 14-18% ARR increase          │          │
│  │                                                 │          │
│  │ Strategy: Quick wins + one strategic bet       │          │
│  │ Key Tasks:                                      │          │
│  │ • Launch pricing experiment (2w)               │          │
│  │ • Build annual plan upsell (3w)                │          │
│  │ • Optimize onboarding (2w)                     │          │
│  │ • Fix 3 critical bugs (1w)                     │          │
│  │                                                 │          │
│  │ Pros: Balances speed + innovation              │          │
│  │ Cons: Requires coordination across teams       │          │
│  │ [Select Path B] [View Details] [Customize]     │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  ┌────────────────────────────────────────────────┐          │
│  │ 🚀 Path C: Moonshot (Aggressive)               │          │
│  │ Timeline: 8 weeks   |  Risk: High (60%)        │          │
│  │ Expected Impact: 18-25% ARR increase (if success) │      │
│  │                                                 │          │
│  │ Strategy: Bet on product-led growth            │          │
│  │ Key Tasks:                                      │          │
│  │ • Build freemium tier (4w)                     │          │
│  │ • Launch viral referral program (2w)           │          │
│  │ • Redesign landing page (1w)                   │          │
│  │ • Launch PR campaign (1w)                      │          │
│  │                                                 │          │
│  │ Pros: Highest upside, market differentiator    │          │
│  │ Cons: High risk, resource-intensive            │          │
│  │ [Select Path C] [View Details] [Customize]     │          │
│  └────────────────────────────────────────────────┘          │
│                                                              │
│  Compare Paths                                               │
│  [Show Decision Tree] [Run Simulation] [Export Report]      │
│                                                              │
│  What-If Mode                                                │
│  Adjust: Risk Tolerance [●─────] Conservative               │
│          Timeline [─────●─] 8-12 weeks                       │
│          Budget [───●───] $50k                               │
│  [Regenerate Paths]                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## What We're Building

### 1. Multi-Path Strategy Generator

**Path Generation Algorithm:**
```typescript
interface Path {
  id: string;
  name: string;  // "Safe Bet", "Balanced", "Moonshot"
  strategy_type: 'conservative' | 'balanced' | 'aggressive';
  timeline_weeks: number;
  risk_score: number;  // 0-100
  expected_impact: { min: number; max: number };  // % toward goal
  task_ids: string[];
  reasoning: string;
  pros: string[];
  cons: string[];
}

function generateAlternativePaths(
  goal: Outcome,
  allTasks: Task[],
  riskAppetite: 'low' | 'medium' | 'high'
): Path[] {
  // Conservative Path: Low-risk, proven tactics
  const safePath = {
    strategy: 'Optimize what exists',
    tasks: filterTasks(allTasks, {
      maxRisk: 0.3,
      maxEffort: 40,
      requiresProven: true
    }),
    timeline: estimateTimeline(tasks, 'sequential'),  // Series, not parallel
    risk: 15,  // Low probability of failure
    impact: { min: goal.metric * 0.8, max: goal.metric * 1.0 }
  };

  // Balanced Path: Mix of quick wins + one strategic bet
  const balancedPath = {
    strategy: 'Quick wins + strategic investment',
    tasks: [...getQuickWins(allTasks, 5), ...getStrategicBets(allTasks, 2)],
    timeline: estimateTimeline(tasks, 'parallel'),  // Some overlap
    risk: 35,
    impact: { min: goal.metric * 0.9, max: goal.metric * 1.2 }
  };

  // Aggressive Path: High-risk, high-reward bets
  const moonshotPath = {
    strategy: 'Big swings for breakthrough',
    tasks: filterTasks(allTasks, {
      minImpact: 8,
      allowExperimental: true,
      acceptHighRisk: true
    }),
    timeline: estimateTimeline(tasks, 'aggressive-parallel'),  // Max concurrency
    risk: 60,  // High chance something fails
    impact: { min: goal.metric * 0.7, max: goal.metric * 1.5 }  // Wide range
  };

  return [safePath, balancedPath, moonshotPath];
}
```

**Task Filtering Heuristics:**
- **Conservative:** Impact ≥ 6, Effort ≤ 40h, Confidence ≥ 0.8, No "experimental" keywords
- **Balanced:** Mix 70% proven + 30% innovative, Prioritize high leverage (multi-goal) tasks
- **Aggressive:** Impact ≥ 8, Accept confidence ≥ 0.5, Include "launch", "new", "experiment" keywords

### 2. Bayesian Risk/Impact Simulation

**Monte Carlo Simulation Engine:**
```typescript
interface SimulationResult {
  path_id: string;
  simulations_run: number;  // 10,000 iterations
  probability_distribution: {
    p10: number;  // 10th percentile outcome
    p50: number;  // Median outcome
    p90: number;  // 90th percentile outcome
  };
  success_probability: number;  // % of sims that hit goal
  expected_value: number;  // Weighted average outcome
  failure_modes: Array<{
    scenario: string;
    probability: number;
    mitigation: string;
  }>;
}

function runSimulation(path: Path, iterations = 10000): SimulationResult {
  const outcomes = [];

  for (let i = 0; i < iterations; i++) {
    let totalImpact = 0;

    for (const task of path.tasks) {
      // Sample from task's impact distribution
      const taskSuccess = Math.random() < task.confidence;
      const taskImpact = taskSuccess
        ? sampleNormal(task.impact, task.impact * 0.2)  // ±20% variance
        : 0;  // Task fails → no impact

      totalImpact += taskImpact;
    }

    // Add systemic risk (external factors)
    const systemicShock = Math.random() < 0.1 ? -0.2 : 0;  // 10% chance of market shift
    totalImpact += systemicShock;

    outcomes.push(totalImpact);
  }

  return analyzeDistribution(outcomes);
}
```

**Failure Mode Analysis:**
- Identify tasks with high failure risk
- Generate "If [task] fails, then [consequence]" scenarios
- Suggest mitigations: "Add backup task X if Y fails"

### 3. Path Comparison Dashboard

**Comparison Table:**
| Dimension | Safe Bet | Balanced | Moonshot |
|-----------|----------|----------|----------|
| Timeline | 12 weeks | 10 weeks | 8 weeks |
| Risk (failure %) | 15% | 35% | 60% |
| Expected Impact | 12-15% | 14-18% | 18-25% |
| Resource Cost | $30k | $50k | $80k |
| Team Size | 2 people | 3 people | 5 people |
| Success Probability | 85% | 65% | 40% |
| Expected Value | 13.2% | 15.6% | 17.4% |

**Decision Tree Visualization:**
```
Start
├─ Safe Bet → 85% success → 13% impact
│             15% failure → 5% impact
├─ Balanced → 65% success → 16% impact
│             35% failure → 8% impact
└─ Moonshot → 40% success → 22% impact
              60% failure → 3% impact
```

**Radar Chart (5 dimensions):**
- Speed (time to completion)
- Risk (probability of failure)
- Impact (expected outcome)
- Cost (resources required)
- Innovation (novelty of approach)

### 4. Interactive What-If Mode

**User Adjustable Parameters:**
- Risk tolerance slider: Conservative ← → Aggressive
- Timeline constraint: 4-16 weeks
- Budget cap: $10k-$200k
- Team size: 1-10 people
- Innovation appetite: Proven tactics ← → Experimental

**Real-Time Path Regeneration:**
- User adjusts slider → Trigger path regeneration
- Debounced API call (500ms delay)
- Update all 3 paths based on new constraints
- Highlight what changed (task swaps, timeline shifts)

### 5. Scenario Customization

**Edit Path Workflow:**
1. User clicks "Customize" on Path B
2. Modal opens with task list
3. User can:
   - Remove tasks (recalculates impact/risk)
   - Add tasks from pool (updates timeline)
   - Reorder tasks (changes dependency logic)
   - Adjust effort estimates (updates timeline)
4. Click "Save as Custom Path D"
5. Custom path appears alongside A/B/C
6. Simulation re-runs for custom path

**Path Forking:**
- Start from Path B
- Swap out 2 tasks
- Compare "Modified B" vs. "Original B"

### 6. Collaborative Features

**Shareable Scenario URLs:**
```
/path-explorer?scenario=abc123
Query params encode: goal, selected paths, what-if settings
```

**Export Options:**
- PDF report: All 3 paths with charts
- CSV: Task list per path
- Slide deck: Pre-formatted comparison for presentations

**Comment/Annotation:**
- Stakeholders can add notes to paths
- "CEO prefers Path A for Q2"
- "Engineering concerned about Path C timeline"

### 7. Agent Integration

**New Mastra Tool: `generate-alternative-paths`**
```typescript
export const generatePathsTool = createTool({
  id: 'generate-alternative-paths',
  description: 'Generate 3 strategic paths (safe, balanced, aggressive) for achieving goal',
  inputSchema: z.object({
    outcome_id: z.string(),
    task_pool: z.array(z.string()),  // Available task IDs
    risk_appetite: z.enum(['low', 'medium', 'high']).default('medium')
  }),
  execute: async ({ outcome_id, task_pool, risk_appetite }) => {
    // 1. Fetch goal + tasks
    // 2. Run path generation algorithm
    // 3. Run Monte Carlo simulation for each path
    // 4. Return 3 paths with risk/impact/timeline

    return {
      paths: [safePath, balancedPath, moonshotPath],
      simulations: [safeSimResult, balancedSimResult, moonshotSimResult]
    };
  }
});
```

**Enhanced Agent Reasoning:**
- Agent now generates multiple hypotheses
- Evaluates pros/cons of each approach
- Recommends default path but surfaces alternatives
- Explains reasoning for recommendation

---

## Out of Scope (No-gos)
- Real-time collaboration (Google Docs style)
- Integration with roadmap tools (Productboard, Aha)
- Historical outcome tracking (deferred to separate "Learning Loop" phase)
- Gantt charts / timeline visualization (simple list view only)
- Resource allocation optimization (LP solver)

---

## Risks & Rabbit Holes

| Risk | Why it's scary | Mitigation |
|------|----------------|------------|
| Simulation accuracy | Monte Carlo depends on good estimates | Use conservative ranges; show confidence intervals; allow manual override |
| Analysis paralysis | 3 paths becomes 10 custom variants → paralysis | Limit to 3 default + 2 custom paths; hide advanced options by default |
| Complexity overload | Too many charts/metrics → user confused | Progressive disclosure; default to simple card view; advanced as opt-in |
| Performance – simulation slow | 10k iterations × 3 paths = 30k sims | Run async; cache results; use Web Workers for client-side sims |
| Over-promising – "Moonshot" sounds guaranteed | Users misinterpret 60% risk as 40% success guarantee | Clear labeling: "High risk" not "High chance"; show failure scenarios prominently |

---

## Success Metrics
- **Exploration adoption**: ≥50% of users view all 3 paths before selecting
- **Custom path usage**: ≥30% of users create at least 1 custom path variant
- **Decision confidence**: Users report 45% increase in "confidence in chosen strategy"
- **Stakeholder alignment**: ≥70% of exported reports used in team/exec discussions
- **What-if engagement**: ≥40% of users adjust sliders to explore different constraints
- **Performance**: Path generation + simulation completes in <8s for 50-task pool

---

## Deliverables
1. `pathGenerationEngine.ts` – Multi-path strategy generator
2. `monteCarloSimulator.ts` – Bayesian risk/impact simulation
3. New Mastra tool: `generate-alternative-paths`
4. UI components:
   - Path Explorer Dashboard (3-card layout)
   - Path Comparison Table + Radar Chart
   - Decision Tree Visualization (D3.js)
   - What-If Control Panel (sliders)
   - Path Customization Modal
5. Database schema updates:
   - `alternative_paths` table (path_id, goal_id, strategy_type, task_ids, simulation_result)
   - `path_selections` table (user decision tracking)
6. API endpoints:
   - `POST /api/paths/generate` – Generate 3 alternative paths
   - `POST /api/paths/simulate` – Run Monte Carlo simulation
   - `POST /api/paths/customize` – Save custom path
   - `GET /api/paths/export?format=pdf` – Export scenario report
7. Integration tests:
   - Path generation across goal types
   - Simulation accuracy (compare to known outcomes)
   - Custom path creation + modification
   - Export functionality (PDF, CSV)
8. Performance benchmarks (<8s path generation + simulation)

---

## Dependencies
- Phase 10: Task Intelligence (gap detection informs path completeness)
- Phase 11: Strategic Prioritization (impact/effort scores drive path generation)
- Phase 12: Goal Harmony (conflict detection applies to multi-goal paths)

---

## Ready When
- User triggers path exploration → System generates 3 distinct paths (safe, balanced, aggressive)
- Each path shows timeline, risk, expected impact, and key tasks
- Comparison dashboard clearly visualizes trade-offs across dimensions
- User adjusts "Risk Tolerance" slider → Paths regenerate with different task mixes
- User customizes Path B by swapping tasks → Simulation updates instantly
- Export button generates PDF with all 3 paths + charts for stakeholder review
- Users report: "I finally understand the strategic options" and "This helped us align as a team on which bet to make"

---

**Appetite:** 6 weeks
**Status:** Proposed
**Dependencies:** Phase 10 (Intelligence), Phase 11 (Strategic), Phase 12 (Harmony)
**Future Enhancement:** Phase 14 (Learning Loop – track actual outcomes vs. predictions)
