# Quickstart: Strategic Prioritization (Impact-Effort Model)

**Feature Branch**: `001-strategic-prioritization-impact`
**Estimated Time**: 10 minutes
**Prerequisites**: Existing Note Synthesiser installation with tasks and outcome

## Table of Contents
- [Overview](#overview)
- [Setup](#setup)
- [Quick Demo](#quick-demo)
- [User Stories Walkthrough](#user-stories-walkthrough)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## Overview

This feature adds strategic prioritization to the existing task system, allowing you to:
- **See** Impact (0-10), Effort (hours), Confidence (0-1), and Priority (0-100) scores for each task
- **Sort** tasks by different strategies (Balanced, Quick Wins, Strategic Bets, Urgent)
- **Visualize** tasks in a 2×2 Impact/Effort quadrant chart
- **Override** AI estimates with your own domain knowledge
- **Understand** why tasks are ranked using detailed score breakdowns

---

## Setup

### 1. Database Migration

```bash
# Apply migration to add strategic_scores and manual_overrides columns
cd /path/to/project
supabase db push

# OR manually apply migration via Supabase Dashboard
# SQL Editor → Paste contents of contracts/database-migration.sql → Run
```

**Verify migration succeeded:**
```bash
# Check columns exist
supabase db diff

# Or via psql:
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_sessions' AND column_name = 'strategic_scores';"
```

### 2. Environment Variables

No new environment variables required. Uses existing:
- `OPENAI_API_KEY` (for Impact LLM estimation)
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3. Install Dependencies

```bash
# Install Recharts for quadrant visualization (if not already installed)
pnpm add recharts

# Verify installation
pnpm list recharts
# Should show: recharts@2.x.x
```

### 4. Start Development Server

```bash
pnpm dev
# Navigate to http://localhost:3000/priorities
```

---

## Quick Demo

### Step 0: Observe Loading & Toast States

1. Reload `/priorities` with DevTools network throttling (e.g., “Slow 3G”).
2. Click **“Prioritize Tasks”** while throttled.
   - You should see shimmering skeleton rows and a "Prioritizing…" badge while results stream in.
3. Temporarily kill the dev server or block requests to watch the toast notifications fire (outcome load failure, session polling failure, trigger failure). Each event emits a descriptive toast plus inline error copy.

### Step 1: Trigger Strategic Prioritization

1. Open http://localhost:3000/priorities
2. Click **"Prioritize Tasks"** button (existing workflow)
3. Wait for prioritization to complete (~2-5 seconds for 50 tasks)

**What happens:**
- Backend scores each task with Impact/Effort/Confidence/Priority
- Tasks that fail LLM scoring show "Scoring..." status and queue for retry
- UI displays scores reactively as they complete

### Step 2: View Strategic Scores

You should now see each task displaying:
- **Impact**: 0-10 score (e.g., "Impact: 8.5")
- **Effort**: Hours estimate (e.g., "Effort: 16h")
- **Confidence**: 0-1 probability (e.g., "Confidence: 0.78")
- **Priority**: 0-100 overall score (e.g., "Priority: 66")
- **Quadrant badge**: Color-coded (🌟 Green, 🚀 Blue, ⚡ Yellow, ⏸ Red)

### Step 3: Try Different Sorting Strategies

1. Click **"Sort Strategy"** dropdown at top of page
2. Select **"Quick Wins"**
   - Only tasks ≤8h effort shown
   - Sorted by Impact × Confidence (highest first)
3. Select **"Strategic Bets"**
   - Only tasks with Impact ≥7 AND Effort >40h shown
   - Sorted by Impact (highest first)
4. Select **"Urgent"**
   - Tasks with keywords "urgent", "critical", "blocking" get 2× priority boost
5. Return to **"Balanced"**
   - All tasks shown, sorted by Priority score

### Step 4: View Quadrant Visualization

1. Scroll to **"Impact/Effort Quadrant"** section
2. See tasks plotted as bubbles:
   - **X-axis**: Effort (log scale, 1h → 160h)
   - **Y-axis**: Impact (0 → 10)
   - **Bubble size**: Confidence (larger = more confident)
   - **Bubble color**: Quadrant (Green/Blue/Yellow/Red)
3. Click a bubble to scroll to that task in the list

### Step 5: Manual Override

1. Hover over any task
2. Click **"Edit scores"** (pencil icon)
3. Adjust **Impact** slider (0-10)
4. Adjust **Effort** input (0.5-160 hours)
5. Optionally add **Reason** ("I know this touches payment flow")
6. Click **"Save"**
   - Priority recalculates instantly
   - Task shows **"Manual override"** badge
   - Override persists across page reloads

### Step 6: View Score Breakdown

1. Click **"Why this score?"** link on any task
2. Modal shows:
   - **Impact reasoning**: Keywords found, LLM rationale
   - **Effort source**: Extracted from text vs. heuristic
   - **Confidence formula**: Breakdown of 60% similarity + 30% deps + 10% history
   - **Priority calculation**: Formula with values plugged in

### Step 7: Large Task Lists (Virtual Scrolling)

1. Seed ≥600 tasks (fixtures/Supabase SQL).
2. Visit `/priorities` and ensure the Active list shows >500 tasks.
3. Scroll the list; only the currently visible rows render (virtualized window) while sticky headers/tooltips continue to work.
4. Drop below 500 tasks (complete or archive) and confirm the list automatically switches back to the standard rendering.

---

## User Stories Walkthrough

### User Story 1: View Strategic Task Rankings (P1)

**Objective**: See tasks prioritized by strategic value instead of just semantic similarity.

**Steps**:
1. Navigate to /priorities
2. Trigger prioritization (click "Prioritize Tasks")
3. Verify each task displays Impact/Effort/Confidence/Priority
4. Verify tasks are sorted by Priority (highest first) in Balanced mode
5. Verify high-impact/low-effort tasks rank higher than medium-impact/medium-effort

**Expected Result**:
- Task "Implement payment processing" (Impact: 8.5, Effort: 16h, Confidence: 0.78) → Priority: 66
- Ranks higher than "Refactor database layer" (Impact: 5, Effort: 16h, Confidence: 0.6) → Priority: 15

---

### User Story 2: Switch Between Sorting Strategies (P1)

**Objective**: Filter and sort tasks by different strategic lenses.

**Steps**:
1. Select "Quick Wins" from sort dropdown
2. Verify only tasks with Effort ≤8h shown
3. Verify sorted by Impact × Confidence (descending)
4. Select "Strategic Bets"
5. Verify only tasks with Impact ≥7 AND Effort >40h shown
6. Verify sorted by Impact (descending)
7. Select "Urgent"
8. Verify tasks with keywords "urgent", "critical", "blocking" appear at top

**Expected Result**:
- Quick Wins: "Fix critical bug" (Impact: 7, Effort: 4h) appears above "Update docs" (Impact: 3, Effort: 2h)
- Strategic Bets: "Redesign architecture" (Impact: 9, Effort: 80h) appears above "Build new feature" (Impact: 7, Effort: 60h)
- Urgent: "Critical payment bug" gets 2× multiplier, ranks at top

---

### User Story 3: Visualize Impact/Effort Trade-offs (P2)

**Objective**: See tasks in a 2×2 quadrant visualization.

**Steps**:
1. Navigate to /priorities
2. Scroll to "Impact/Effort Quadrant" section
3. Verify tasks appear as bubbles:
   - X-axis: Effort (log scale)
   - Y-axis: Impact (0-10)
   - Bubble size: Confidence
4. Identify quadrants:
   - Top-left (green): High Impact / Low Effort (🌟 Quick Wins)
   - Top-right (blue): High Impact / High Effort (🚀 Strategic Bets)
   - Bottom-left (yellow): Low Impact / Low Effort (⚡ Incremental)
   - Bottom-right (red): Low Impact / High Effort (⏸ Avoid)
5. Click a bubble
6. Verify page scrolls to that task in list

**Expected Result**:
- "Implement payment flow" appears in top-left (green) quadrant
- "Refactor legacy code" appears in bottom-right (red) quadrant
- Clicking bubble scrolls to task and highlights it

---

### User Story 4: Understand Score Reasoning (P2)

**Objective**: View detailed breakdown of how priority score was calculated.

**Steps**:
1. Click "Why this score?" link on any task
2. Verify modal displays:
   - **Impact section**: Score (8.5), keywords found (["payment", "revenue"]), LLM reasoning
   - **Effort section**: Hours (16h), source (extracted), hint ("16h" from task text)
   - **Confidence section**: Score (0.78), formula breakdown (0.6×0.85 + 0.3×0.8 + 0.1×0.5)
   - **Priority section**: Formula ((8.5 × 10) / (16 / 8) × 0.78 = 66.3)
3. Close modal

**Expected Result**:
- All score components shown with reasoning
- Formula values match task's displayed scores
- User understands why task received its priority

---

### User Story 5: Manually Override Scores (P3)

**Objective**: Adjust AI estimates when they don't match domain knowledge.

**Steps**:
1. Click "Edit scores" on task "Refactor database layer" (AI: Impact 5, Effort 16h)
2. Adjust Impact slider from 5 to 8
3. Adjust Effort input from 16h to 8h
4. Add reason: "User knows this is critical for performance"
5. Click "Save"
6. Verify Priority recalculates instantly (5→15 becomes 8→8 = higher priority)
7. Verify "Manual override" badge appears
8. Reload page
9. Verify override persists
10. Trigger new prioritization
11. Verify override is cleared and fresh AI scores appear

**Expected Result**:
- Priority updates instantly: (5×10)/(16/8)×0.6 = 15 → (8×10)/(8/8)×0.6 = 48
- Badge shows "Manual override"
- Override survives page reload
- Override cleared when agent re-runs prioritization

---

## Testing

### Run All Tests

```bash
# Unit tests (scoring logic, formulas)
pnpm test:run lib/services/__tests__/strategicScoring.test.ts

# Contract tests (API endpoints)
pnpm test:run __tests__/contract/strategic-scoring-api.test.ts

# Integration tests (user workflows)
pnpm test:run __tests__/integration/strategic-prioritization.test.tsx
```

### Manual UI Testing

1. **Quadrant interactions**: Click bubbles, verify scroll-to-task
2. **Slider UX**: Drag Impact slider, verify instant priority update
3. **Retry polling**: Simulate LLM failure (disconnect network during prioritization), verify "Scoring..." status, reconnect, verify score appears

### Performance Testing

```bash
# Generate 100 test tasks
npx tsx scripts/generate-test-tasks.ts --count 100

# Trigger prioritization and measure time
curl -X POST http://localhost:3000/api/agent/prioritize \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nTime: %{time_total}s\n"

# Expected: <2s overhead (meets SC-006)
```

---

## Troubleshooting

### Problem: Strategic scores not appearing

**Symptoms**: Tasks show only semantic similarity, no Impact/Effort/Priority

**Solutions**:
1. Verify migration applied: `SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_sessions' AND column_name = 'strategic_scores';`
2. Check API response: Network tab → /api/agent/prioritize → Response should include `strategic_scores` field
3. Check browser console for errors
4. Verify `OPENAI_API_KEY` is set in `.env.local`

---

### Problem: All tasks show "Scoring..." status

**Symptoms**: No scores appear, all tasks stuck in retry queue

**Solutions**:
1. Check OpenAI API key is valid: `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"`
2. Check rate limits: Dashboard → OpenAI → Usage
3. Check processing_logs table: `SELECT * FROM processing_logs WHERE status = 'retry_exhausted';`
4. Manually trigger retry: Click "Retry failed scores" button in UI

---

### Problem: Manual overrides not persisting

**Symptoms**: Overrides disappear after page reload

**Solutions**:
1. Verify migration applied: `SELECT manual_overrides FROM task_embeddings WHERE manual_overrides IS NOT NULL LIMIT 1;`
2. Check API response: Network tab → PATCH /api/tasks/{id}/override → Should return 200
3. Verify session_id matches current session
4. Check browser console for errors during save

---

### Problem: Quadrant visualization not rendering

**Symptoms**: Blank space where chart should be, or console errors

**Solutions**:
1. Verify Recharts installed: `pnpm list recharts`
2. Check for TypeScript errors: `pnpm tsc --noEmit`
3. Check browser console for React errors
4. Verify tasks have Impact/Effort scores (check data in dev tools)

---

### Problem: Priority scores seem incorrect

**Symptoms**: High-impact/low-effort tasks rank lower than expected

**Solutions**:
1. Check formula: Priority = (Impact × 10) / (Effort / 8) × Confidence
2. Verify Confidence calculation: 0.6 × Similarity + 0.3 × DepConfidence + 0.1 × History
3. Check for manual overrides affecting score: Look for "Manual override" badge
4. View score breakdown: Click "Why this score?" to see formula values

---

## Next Steps

### After Quickstart

1. **Read full spec**: `specs/001-strategic-prioritization-impact/spec.md`
2. **Review data model**: `specs/001-strategic-prioritization-impact/data-model.md`
3. **Explore API contracts**: `specs/001-strategic-prioritization-impact/contracts/`
4. **Run /tasks workflow**: Execute `/tasks` command to generate implementation tasks

### Common Customizations

**Adjust quadrant thresholds**:
```typescript
// lib/schemas/quadrant.ts
export function getQuadrant(impact: number, effort: number): Quadrant {
  const highImpact = impact >= 5  // Change to 6 or 7
  const lowEffort = effort <= 8   // Change to 4 or 12
  // ...
}
```

**Add new sorting strategy**:
```typescript
// lib/schemas/sortingStrategy.ts
export const STRATEGY_CONFIGS = {
  // ...
  custom_strategy: {
    label: 'Custom',
    description: 'Your custom sorting logic',
    filter: (task) => task.impact > 3,
    sort: (a, b) => b.effort - a.effort,
  },
}
```

**Modify Impact heuristics**:
```typescript
// lib/services/strategicScoring.ts
const IMPACT_MODIFIERS = {
  high: ['+3', ['revenue', 'conversion', 'payment']],
  medium: ['+2', ['launch', 'test', 'experiment']],
  low: ['-1', ['document', 'refactor']],
}
```

---

## Support

- **Issues**: Report bugs at GitHub repo issues
- **Questions**: Ask in team Slack #prioritization channel
- **Documentation**: See `CLAUDE.md` for full development guide
- **API Reference**: See `contracts/prioritize-api.yaml` for OpenAPI spec

---

**Last Updated**: 2025-11-17
**Maintained By**: Project team
