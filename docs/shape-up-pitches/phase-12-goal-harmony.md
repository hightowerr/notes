# Shape Up Pitch: Phase 12 – Goal Harmony (Conflict Detection & Resolution)

## Problem

**Users work toward multiple goals simultaneously without realizing they contradict each other, wasting effort on tasks that cancel out.**

### Reality today
- User creates Outcome 1: "Increase monthly conversions 15%"
- User creates Outcome 2: "Reduce customer acquisition cost 25%"
- System treats these as independent—prioritizes high-discount experiments for Outcome 1 that hurt Outcome 2
- No warning that running aggressive discounts conflicts with reducing CAC
- Users discover conflicts only after weeks of work pulling in opposite directions
- No visibility into resource overlaps (e.g., both goals need designer time, but only 20h/week available)

### User feedback
> "I spent 2 weeks building a discount flow to boost conversions. Then finance told me we're trying to reduce discounts to improve margins. Why didn't the system warn me?"
> "I have 3 active outcomes, all marked high priority. How do I know which tasks to actually do first when they conflict?"
> "The agent suggested I work on two tasks that both require the same designer, but she's only available 10 hours this week."

**Core issue:** The system prioritizes within goals but never across goals. Users play whack-a-mole, optimizing one metric while unknowingly degrading another. Multi-goal reasoning requires explicit conflict detection and trade-off analysis.

---

## Appetite
- **6-week big batch** (full cycle)
- We're adding multi-goal analysis, conflict detection logic, trade-off visualization, and resolution workflows that touch outcome management, agent reasoning, and priority arbitration UI.

---

## Solution – High Level

Deliver a goal harmony system that:
1. **Detects conflicting goals** via semantic analysis + heuristic rules
2. **Identifies resource overlaps** (time, people, budget) across goal task sets
3. **Flags contradictory tasks** that advance one goal while harming another
4. **Surfaces trade-off analysis** showing impact of choosing Goal A over Goal B
5. **Guides resolution** via conflict resolution workflows (prioritize, merge, defer)
6. **Maintains goal relationship graph** showing harmony, conflict, and dependency between outcomes

---

## Breadboard Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  Outcomes Dashboard – Goal Harmony View                       │
│                                                              │
│  Active Goals (3)                                             │
│  1. 🎯 Increase monthly ARR 15%                              │
│  2. ⚠ Reduce CAC by 25%  [CONFLICT with #1]                 │
│  3. 🎯 Launch enterprise tier by Q2                          │
│                                                              │
│  Detected Conflicts (2)                                       │
│  🔴 Critical: Goals #1 and #2                                │
│     Problem: "Increase ARR" tasks include aggressive         │
│              discounting which raises CAC                     │
│     Affected Tasks:                                           │
│     • "Run 40% off promotion" (Goal #1, rank 3)              │
│     • "Test $99→$79 pricing" (Goal #1, rank 7)              │
│     Trade-off: Choosing #1 will likely worsen #2 by ~10%     │
│     [Resolve Conflict] [View Details]                        │
│                                                              │
│  🟡 Warning: Goals #1 and #3                                 │
│     Problem: Resource overlap – Designer needs 45h, only      │
│              20h available this week                          │
│     Affected Tasks:                                           │
│     • "Design checkout A/B test" (Goal #1, 16h)              │
│     • "Design enterprise dashboard" (Goal #3, 24h)           │
│     • "Redesign pricing page" (Goal #1, 12h)                │
│     [Adjust Capacity] [Defer Tasks] [Hire Contractor]        │
│                                                              │
│  Goal Relationship Graph                                      │
│  [Goal 1] ──conflict──> [Goal 2]                             │
│  [Goal 1] ──shares resources──> [Goal 3]                     │
│  [Goal 2] ──independent──> [Goal 3]                          │
│                                                              │
│  [Run Harmony Analysis] [Create Combined Plan]               │
└──────────────────────────────────────────────────────────────┘
```

---

## What We're Building

### 1. Multi-Goal Conflict Detector

**Semantic Conflict Analysis:**
- Embed all active outcome statements
- Calculate pairwise similarity
- If similarity < 0.3 AND contain opposite verbs (increase/decrease) = potential conflict
- Example:
  - "Increase conversion 15%" (embed = [0.8, 0.2, ...])
  - "Reduce acquisition cost 25%" (embed = [0.7, 0.15, ...])
  - Similarity = 0.82 BUT opposite intent = HIGH CONFLICT

**Heuristic Conflict Rules:**
```typescript
const conflictRules = [
  {
    pattern: ['increase revenue', 'reduce price'],
    severity: 'high',
    explanation: 'Lowering prices typically reduces revenue per customer'
  },
  {
    pattern: ['increase conversions', 'reduce CAC'],
    severity: 'high',
    explanation: 'Conversion tactics (discounts, ads) often increase CAC'
  },
  {
    pattern: ['move fast', 'reduce technical debt'],
    severity: 'medium',
    explanation: 'Speed vs. quality trade-off'
  },
  {
    pattern: ['expand features', 'simplify UX'],
    severity: 'medium',
    explanation: 'Feature bloat conflicts with simplification'
  }
];
```

**Task-Level Conflict Detection:**
- For each task in Goal A's plan:
  - Check if task contains keywords that harm Goal B's metric
  - Example: Task "Run 50% discount" in Goal A ("Increase sales")
    - Conflicts with Goal B ("Improve profit margin")
    - Severity: High (discount directly reduces margin)

### 2. Resource Overlap Analyzer

**Capacity Conflict Detection:**
- Parse estimated hours from all goal tasks
- Group by skill/role (designer, engineer, PM)
- Compare to user's stated capacity (from outcome `daily_capacity_hours`)
- Flag if total demand > supply by >20%

**Example:**
```typescript
// Goal 1 tasks: 40h design work
// Goal 2 tasks: 30h design work
// Goal 3 tasks: 20h design work
// Total: 90h design work this week
// Available: 40h design capacity (2 designers × 20h)
// Conflict: 90h demand - 40h supply = 50h overage (125% over capacity)
```

**Budget Conflict (future enhancement):**
- Track if tasks have cost estimates
- Sum across goals
- Warn if total exceeds budget

### 3. Trade-Off Analysis Engine

**Impact Simulation:**
```typescript
interface TradeOffAnalysis {
  scenario: 'prioritize_goal_A' | 'prioritize_goal_B' | 'balanced';
  goal_A_impact: {
    expected_progress: number;  // % toward goal
    risk: number;  // likelihood of failure
    opportunity_cost: string;  // what we give up
  };
  goal_B_impact: { /* same structure */ };
  recommendation: string;
  confidence: number;
}
```

**Prioritization Matrix:**
- If goals conflict, calculate urgency × impact for each
- Recommend higher-scoring goal
- Show user what they sacrifice by choosing one over the other

### 4. Conflict Resolution Workflows

**Resolution Modal:**
```typescript
interface ConflictResolution {
  conflict_id: string;
  action: 'prioritize' | 'merge' | 'defer' | 'adjust';

  // If 'prioritize'
  chosen_goal_id: string;
  deferred_goal_id: string;
  deferred_until: Date;

  // If 'merge'
  merged_outcome_text: string;  // New combined goal
  merged_tasks: string[];

  // If 'adjust'
  adjusted_tasks: {
    task_id: string;
    new_approach: string;  // How to do task without conflict
  }[];
}
```

**4 Resolution Paths:**

1. **Prioritize:** Pick Goal A, defer Goal B
   - Move Goal B tasks to "Paused" state
   - Set reminder to revisit Goal B after Goal A milestone

2. **Merge:** Combine goals into new hybrid goal
   - "Increase profitable conversions 10%" (combines revenue + margin)
   - Re-run prioritization with merged goal
   - Archive original conflicting goals

3. **Defer:** Delay one goal to next cycle
   - Keep both goals active but sequence them
   - Goal A: "This month", Goal B: "Next month"

4. **Adjust:** Modify conflicting tasks to reduce harm
   - Example: "Run 40% discount" → "Run 20% discount to top 10% of leads"
   - Reduces conflict severity without abandoning task

### 5. Goal Relationship Graph

**Visual Component:**
- Nodes = Active outcomes
- Edges = Relationships (conflict, synergy, independence)
- Color-coded:
  - 🔴 Red edge = High conflict
  - 🟡 Yellow edge = Resource overlap
  - 🟢 Green edge = Synergy (tasks help both goals)
  - Gray edge = Independent
- Interactive: Click node → Show tasks, Click edge → Show conflict details

**Synergy Detection (bonus feature):**
- Some tasks advance multiple goals simultaneously
- Example: "Improve checkout UX" helps both "Increase conversions" AND "Reduce support tickets"
- Badge these tasks as "High Leverage" in UI

### 6. Conflict Prevention

**Pre-Flight Check on New Outcome:**
- Before saving new outcome, run conflict analysis against existing outcomes
- Show warning: "This goal conflicts with [Existing Goal]. Are you sure?"
- Suggest adjustments: "Consider changing 'Reduce prices' to 'Optimize pricing' to reduce conflict"

### 7. Combined Priority Plan

**Cross-Goal Orchestration:**
- Generate single priority list that balances all active goals
- Weight tasks by goal priority × strategic score
- Highlight which goal each task serves
- Show allocation: "40% of top 10 tasks serve Goal A, 30% Goal B, 30% Goal C"

---

## Out of Scope (No-gos)
- Automatic goal editing (system can suggest, not change)
- Multi-user collaboration / team consensus features
- Budget tracking integration with finance systems
- Historical conflict analysis (reviewing past conflicts)
- External calendar / project management tool integration

---

## Risks & Rabbit Holes

| Risk | Why it's scary | Mitigation |
|------|----------------|------------|
| False positive conflicts | System flags goals that don't actually conflict | Conservative conflict rules; allow "Mark as resolved"; gather feedback for tuning |
| Over-simplification of trade-offs | Real business decisions more nuanced than model | Show trade-offs as guidance, not mandates; encourage user judgment |
| Analysis paralysis | Too many conflicts shown → user overwhelmed | Limit to top 3 conflicts; prioritize by severity; progressive disclosure |
| Resolution UX complexity | 4 resolution paths = confusing decision tree | Default to "Prioritize" workflow; show others as "Advanced options" |
| Performance – multi-goal analysis slow | Analyzing N×N goal pairs adds latency | Run async; cache conflict analysis; incremental updates on goal changes |

---

## Success Metrics
- **Conflict detection accuracy**: ≥75% of flagged conflicts confirmed valid by users
- **Resolution adoption**: ≥60% of detected conflicts get resolved via one of 4 workflows (not ignored)
- **Goal quality**: Multi-goal users report 40% reduction in "working at cross-purposes" incidents
- **Synergy discovery**: ≥20% of high-leverage tasks identified and prioritized
- **User satisfaction**: "Goal clarity" NPS increases by 30+ points for multi-goal users
- **Performance**: Conflict analysis completes in <5s for up to 5 active goals

---

## Deliverables
1. `goalConflictDetector.ts` – Multi-goal semantic + heuristic conflict analysis
2. `resourceOverlapAnalyzer.ts` – Capacity conflict detection
3. `tradeOffEngine.ts` – Impact simulation for conflict resolution
4. UI components:
   - Goal Harmony Dashboard
   - Conflict Resolution Modal (4 workflows)
   - Goal Relationship Graph (D3.js)
   - Combined Priority Plan view
5. Database schema updates:
   - `goal_conflicts` table (goal_a_id, goal_b_id, severity, explanation, resolution)
   - `user_outcomes.priority_weight` (for cross-goal balancing)
6. API endpoints:
   - `GET /api/goals/conflicts` – Detect conflicts across active goals
   - `POST /api/goals/resolve-conflict` – Apply resolution workflow
   - `GET /api/priorities/combined` – Cross-goal priority list
7. Integration tests:
   - Conflict detection across goal types
   - Resolution workflows (prioritize, merge, defer, adjust)
   - Combined priority plan generation
   - Resource overlap calculation
8. Performance benchmarks (<5s conflict analysis)

---

## Dependencies
- Phase 10: Task Intelligence (quality/gap detection informs conflict analysis)
- Phase 11: Strategic Prioritization (impact scores used in trade-off analysis)

---

## Ready When
- User with multiple active goals sees conflict warnings in dashboard
- Clicking "Resolve Conflict" opens modal with 4 clear resolution paths
- Goal relationship graph visually shows conflicts, synergies, and independence
- Combined priority plan intelligently balances tasks across all goals
- Pre-flight check warns user before creating conflicting goal
- Users report: "I finally understand how my goals interact" and "The system caught a conflict that would have wasted 3 weeks of work"

---

**Appetite:** 6 weeks
**Status:** Proposed
**Dependencies:** Phase 10 (Intelligence), Phase 11 (Strategic Prioritization)
**Next Phase:** Phase 13 (Path Explorer – Alternative Strategy Simulation)
