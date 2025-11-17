# Quickstart: Task Intelligence (Gap & Quality Detection)

**Feature Branch**: `014-task-intelligence-gap-quality`
**Created**: 2025-01-13

## User Journey Walkthrough

This guide demonstrates the complete user experience for Phase 10 Task Intelligence, from coverage analysis through draft task acceptance.

---

## Scenario: SaaS Founder Increasing ARR

**User**: Sarah, founder of a B2B SaaS product
**Goal**: "Increase monthly recurring revenue by 25% within 6 months"
**Current State**: 10 tasks extracted from planning documents

---

### Step 1: User Runs Prioritization

**UI Action**: Sarah clicks "Prioritize Tasks" button on `/priorities` page

**System Response**:
1. Loads outcome statement: "Increase MRR by 25% in 6 months"
2. Fetches 10 task embeddings from database
3. Triggers **Coverage Analysis** in background (async)
4. Shows prioritized task list within 2-3 seconds

**What Sarah Sees**:
```
┌─────────────────────────────────────────────────────┐
│  Your Outcome: Increase MRR by 25% in 6 months     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Coverage: 72% ⚠️  (< 70% threshold)                │
│  Missing areas: pricing experiments, upsell flow   │
│                                                      │
│  [Generate Draft Tasks]                             │
└─────────────────────────────────────────────────────┘

Prioritized Task List:
  1. 🟢 Build pricing page with tiered plans       ← "Clear" badge
  2. 🟡 Improve checkout UX                        ← "Review" badge
  3. 🟢 Setup analytics dashboard (conversion tracking)
  4. 🔴 Fix bugs                                   ← "Needs Work" badge
  ...
```

**Behind the Scenes** (FR-012):
- Coverage analysis completes in 1.2s
- Quality badges calculated in parallel (batch AI call: 800ms)
- Gap Detection Modal auto-opens because coverage <70% (FR-010)

---

### Step 2: Coverage Analysis Results

**UI State**: Gap Detection Modal appears automatically

**What Sarah Sees**:
```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 Task Coverage Gap Detected (72%)                           │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                  │
│  Your task list covers 72% of your outcome goal.               │
│  Missing conceptual areas:                                      │
│                                                                  │
│  • Pricing experiments                                          │
│  • Upsell flow                                                  │
│                                                                  │
│  [Generate Draft Tasks] [Dismiss]                              │
└─────────────────────────────────────────────────────────────────┘
```

**Behind the Scenes**:
- Cosine similarity: outcome embedding ↔ task cluster centroid = 0.72
- LLM extraction identified 2 missing concepts (GPT-4o-mini call: 1.5s)
- Stored in `agent_sessions.result.coverage_analysis`

---

### Step 3: Generate Draft Tasks

**UI Action**: Sarah clicks "Generate Draft Tasks"

**What Sarah Sees** (loading state):
```
Analyzing gaps... 🔄
Generating draft tasks... 🤖
```

**System Response** (FR-015, FR-025):
1. **Phase 10 Semantic Drafts**: GPT-4o-mini generates 3 drafts for each missing area (max 6 total)
2. **Phase 5 Fallback Check**: Coverage still <80%? → Trigger dependency gap detection
3. **Deduplication** (FR-027): Compare P10 and P5 embeddings, suppress P5 if similarity >0.85

**What Sarah Sees** (after 4s):
```
┌───────────────────────────────────────────────────────────────────┐
│  🎯 Suggested Tasks to Fill Gaps                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                    │
│  🎯 Semantic Gaps (Phase 10)                                      │
│                                                                    │
│  ☐ Run pricing A/B test: $49 vs $59 tier for SMB segment         │
│     ├─ 4.0 hours | Medium cognition                               │
│     ├─ 85% confidence                                             │
│     └─ Why: Outcome mentions ARR increase, pricing is key lever   │
│     [Edit] [✓ Accept] [✗ Dismiss]                                │
│                                                                    │
│  ☐ Design upsell prompt at end of onboarding flow                │
│     ├─ 2.5 hours | Low cognition                                  │
│     ├─ 78% confidence                                             │
│     └─ Why: Addresses 'upsell flow' gap in coverage               │
│     [Edit] [✓ Accept] [✗ Dismiss]                                │
│                                                                    │
│  ☐ Analyze pricing page conversion by traffic source             │
│     ├─ 3.0 hours | High cognition                                 │
│     ├─ 72% confidence                                             │
│     └─ Why: Data-driven pricing optimization                      │
│     [Edit] [✓ Accept] [✗ Dismiss]                                │
│                                                                    │
│  🔗 Dependency Gaps (Phase 5)                                     │
│                                                                    │
│  ☐ Setup email tracking before running upsell experiment         │
│     ├─ 1.5 hours | Low cognition                                  │
│     ├─ 90% confidence                                             │
│     └─ Why: Prerequisite for measuring upsell conversion          │
│     [Edit] [✓ Accept] [✗ Dismiss]                                │
│                                                                    │
│  [Accept Selected (0)] [Dismiss All]                              │
└───────────────────────────────────────────────────────────────────┘
```

**Behind the Scenes**:
- Phase 10 generated 3 drafts (1 per area, 1 extra for "pricing")
- Phase 5 generated 2 drafts (dependency gaps)
- Deduplication: 1 P5 draft suppressed (similar to P10 pricing task)
- Total: 4 drafts shown (3 P10 + 1 P5)

---

### Step 4: Edit Draft Task

**UI Action**: Sarah clicks "Edit" on the pricing A/B test task

**What Sarah Sees**:
```
☑ Run pricing A/B test: $49 vs $59 tier for SMB segment
  ├─ [Inline text editor opens]
  │
  │   ┌─────────────────────────────────────────────────────────┐
  │   │ Run pricing A/B test: $49 vs $59 vs $69 tier          │
  │   │ for SMB segment (target 500 impressions)              │
  │   └─────────────────────────────────────────────────────────┘
  │
  │   [Cancel] [Save Edit]
```

**UI Action**: Sarah clicks "Save Edit"

**System Response** (FR-006):
- Updates draft task text in memory (not yet persisted)
- Checkbox auto-checks for acceptance
- Edit marked for final submission

---

### Step 5: Accept Draft Tasks

**UI Action**: Sarah selects 2 drafts and clicks "Accept Selected (2)"

**What Sarah Sees** (loading state):
```
Validating dependencies... 🔄
Inserting tasks... ⏳
```

**System Response** (FR-007):
1. Run Kahn's algorithm cycle detection
2. Insert tasks into `task_embeddings` table
3. Generate embeddings for new tasks
4. Update `agent_sessions.result.draft_tasks.accepted` array
5. Recalculate coverage percentage

**What Sarah Sees** (after 1.5s):
```
✅ 2 tasks added to your plan

Updated Coverage: 72% → 86% ✓

[View Updated Plan]
```

**UI State**: Modal closes, task list refreshes

**Updated Task List**:
```
Prioritized Task List:
  1. 🟢 Run pricing A/B test: $49 vs $59 vs $69 tier (NEW)
  2. 🟢 Build pricing page with tiered plans
  3. 🟢 Design upsell prompt at end of onboarding flow (NEW)
  4. 🟡 Improve checkout UX
  5. 🟢 Setup analytics dashboard
  ...
```

---

### Step 6: Quality Badge Interaction

**UI Action**: Sarah hovers over 🔴 "Needs Work" badge on "Fix bugs"

**What Sarah Sees** (tooltip):
```
┌─────────────────────────────────────────────┐
│  Quality Score: 0.42 (Needs Work)          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Issues:                                    │
│  • Weak action verb ("Fix")                │
│  • No specificity (which bugs?)            │
│  • Task too broad (likely >8 hours)       │
│                                             │
│  Suggestions:                               │
│  • Split into specific bug tasks           │
│  • Add bug IDs or symptoms                 │
│                                             │
│  [Refine This Task]                         │
└─────────────────────────────────────────────┘
```

**UI Action**: Sarah clicks "Refine This Task"

**System Response** (FR-012, P3 feature):
1. GPT-4o-mini analyzes task + context
2. Suggests 2 specific sub-tasks
3. Shows split preview

**What Sarah Sees**:
```
┌──────────────────────────────────────────────────────────┐
│  🔧 Task Refinement Suggestions                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                           │
│  Original: Fix bugs                                      │
│                                                           │
│  Split into 2 specific tasks:                            │
│                                                           │
│  ☐ Fix login timeout bug (max 3s response time)         │
│     └─ Quality Score: 0.88 (Clear)                       │
│                                                           │
│  ☐ Fix checkout form validation errors on mobile        │
│     └─ Quality Score: 0.85 (Clear)                       │
│                                                           │
│  [Apply Refinement] [Cancel]                             │
└──────────────────────────────────────────────────────────┘
```

**UI Action**: Sarah clicks "Apply Refinement"

**System Response** (FR-016):
1. Original task archived (hidden from active list)
2. Two new tasks inserted
3. Quality badges recalculated
4. Task list refreshes

**Updated Task List**:
```
  4. 🟢 Fix login timeout bug (max 3s response)  ← NEW
  5. 🟢 Fix checkout validation errors on mobile ← NEW
  ... (original "Fix bugs" task archived)
```

---

### Step 7: Real-Time Quality Updates

**UI Action**: Sarah edits a task inline: "Improve checkout" → "Reduce checkout steps from 5 to 3"

**System Response** (FR-021, FR-022, FR-023):
1. **Immediate**: Badge changes from 🟡 → 🟢 (optimistic UI)
2. **300ms debounce**: Wait for more edits
3. **Background**: Trigger async recalculation
4. **During calc**: Badge shows subtle pulsing animation
5. **After 450ms**: Actual score replaces optimistic value

**What Sarah Sees** (timeline):
```
T+0ms:   "Reduce checkout steps from 5 to 3" [🟢 pulsing...]
T+300ms: Debounce complete, background calc starts
T+750ms: Actual quality score returned: 0.89
         Badge updates: [🟢 Clear] (no change, optimistic was correct)
```

**Behind the Scenes** (FR-024):
- Only recalculated the 1 edited task (incremental update)
- Cached previous embeddings, no re-generation needed
- Total latency: 450ms (within <500ms target per SC-009)

---

## Key User Value Delivered

### ✅ SEE IT (Visible UI Changes)
- Coverage percentage bar with color coding
- Quality badges on all task cards (🟢🟡🔴)
- Gap Detection Modal with missing areas
- Draft task suggestions with reasoning

### ✅ DO IT (Interactive Capabilities)
- Click "Generate Draft Tasks"
- Edit draft text inline before acceptance
- Accept/dismiss individual drafts
- Hover quality badges for detailed breakdown
- Click "Refine This Task" for AI suggestions

### ✅ VERIFY IT (Observable Outcomes)
- Coverage increases from 72% → 86% after acceptance
- New tasks appear in prioritized list
- Quality badges update in real-time during edits
- Refined tasks replace vague originals with clear sub-tasks

---

## Performance Metrics (from this journey)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Coverage analysis | <3s | 1.2s | ✅ |
| Draft generation | <5s | 4.0s | ✅ |
| Quality badge render | <500ms | 400ms | ✅ |
| Real-time recalculation | <500ms | 450ms | ✅ |
| Task acceptance (cycle check) | <2s | 1.5s | ✅ |

---

## API Calls Made (for reference)

1. `POST /api/agent/prioritize` - Initial prioritization
2. `POST /api/agent/coverage-analysis` - Coverage calculation
3. `POST /api/tasks/evaluate-quality` - Batch quality evaluation (10 tasks)
4. `POST /api/agent/generate-draft-tasks` - Draft generation (P10 + P5)
5. `POST /api/agent/accept-draft-tasks` - Insert 2 accepted drafts
6. `POST /api/tasks/evaluate-quality` - Single task real-time recalc

**Total AI Calls**: 5 GPT-4o-mini calls, 4 embedding generations
**Total Cost**: ~$0.03 (estimated at current pricing)

---

## Next Steps

1. **For Developers**: See [plan.md](./plan.md) for implementation phases
2. **For Testers**: Use this guide to create manual test scenarios
3. **For Product**: Validate this flow matches expected UX

## References

- Specification: [spec.md](./spec.md)
- Data Model: [data-model.md](./data-model.md)
- API Contracts: [contracts/](./contracts/)
