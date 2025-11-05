# Shape Up Pitch: Phase 5 - Context-Aware Dynamic Re-Prioritization

## Problem

**The agent prioritizes tasks based only on the long-term outcome, completely ignoring the user's current reality.**

### Real-World Example (Breaking the System)

**Outcome:** "Increase App downloads by 25% through organic ads"

**Agent surfaces:**
1. #1: A/B test app icon variations
2. #3: Be consistent with regular posting on social media
3. #4: Build 100-500 beta user community

**User's actual reality TODAY:**
- "We don't have an app yet, still in design phase"
- "Back-to-back meetings today, only 30min blocks available"
- "Feeling burnt out after launch, need lighter tasks"
- "Waiting on legal review, can't touch contracts"

**Result:** Tasks #1 and #4 require an app that doesn't exist. Task #2 requires sustained focus the user doesn't have today.

**Why this happens:**
1. Reflections ARE passed to the agent ✅
2. Agent IS instructed to use them ✅
3. BUT: Users don't know reflections exist ❌
4. AND: Reflections are hidden in sidebar ❌
5. AND: No way to adjust priorities without 30s full re-run ❌
6. AND: No visibility into how reflections influenced priorities ❌

### The Core Problem

**The system knows WHERE YOU'RE GOING (outcome) but not WHERE YOU ARE TODAY (current reality).**

**Current state:**
- ✅ Reflection system exists and works
- ✅ Agent receives reflections in context
- ✅ Agent instructions mention reflections
- ❌ Reflections invisible at decision point
- ❌ No instant adjustment when context changes
- ❌ No feedback showing context influence
- ❌ Full 30s agent re-run required for every change

---

## Solution

**Surface reflections at the decision point + enable instant priority adjustment via toggle switches (<500ms).**

### Appetite: 2 weeks (10 working days)

### Breadboard Sketch

```
┌─────────────────────────────────────────────────────────────┐
│  BEFORE (Current State)                                     │
│                                                             │
│  User → /priorities page                                    │
│    ↓                                                        │
│  Sees: [Analyze Tasks] button                               │
│    ↓                                                        │
│  Clicks → 30s agent run → priorities shown                  │
│    ↓                                                        │
│  Realizes "Still in design phase" → tasks irrelevant        │
│    ↓                                                        │
│  Opens hidden ReflectionPanel (Cmd+Shift+R)                 │
│    ↓                                                        │
│  Adds reflection → must click [Recalculate] → 30s wait      │
│    ↓                                                        │
│  Frustration: "Why didn't it know this before?"             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  AFTER (Context-Aware)                                      │
│                                                             │
│  User → /priorities page                                    │
│    ↓                                                        │
│  Sees: ┌────────────────────────────────┐                  │
│        │ Current Context (Optional)     │                  │
│        │                                │                  │
│        │ [✓] "Still in design phase"   │ ← VISIBLE!       │
│        │ [✓] "Only 30min blocks today" │                  │
│        │ [ ] "Burnt out after launch"  │ ← TOGGLED OFF    │
│        │                                │                  │
│        │ [+ Add Current Context]        │                  │
│        └────────────────────────────────┘                  │
│    ↓                                                        │
│  Clicks [Analyze Tasks] → 30s agent run (uses 2 contexts)  │
│    ↓                                                        │
│  Priorities shown with context applied:                     │
│    ↓ #1 → #4  [A/B test app icons]      ← Moved down      │
│               "Requires app (contradicts context)"          │
│    ↑ #5 → #1  [Design landing mockups]  ← Moved up        │
│               "Matches 'design phase' context"              │
│    ↓                                                        │
│  User adds new reflection: "Client demo tomorrow"           │
│    ↓                                                        │
│  Priorities adjust INSTANTLY (<500ms) without re-run        │
│    ↑ #3 → #1  [Prepare demo slides]     ← Auto-promoted   │
│               "Matches 'demo tomorrow' context"             │
└─────────────────────────────────────────────────────────────┘
```

### The Three Core Changes

**1. Pre-Prioritization Context Card**
- Show 5 recent reflections BEFORE "Analyze Tasks" button
- Make reflections discoverable at decision point
- Prompt user to add context if empty

**2. Instant Re-Ranking Engine**
- Lightweight semantic matching (no tool execution)
- Adjusts confidence scores based on reflection relevance
- Completes in <500ms vs 30s full agent re-run
- Toggle reflections on/off → priorities update instantly

**3. Context Visibility in Trace**
- Show "Context Used: 3 reflections" in reasoning trace panel
- Display which reflection texts were passed to agent
- Show recency weights (factual metric)
- Link trace steps to context filtering decisions

---

## Technical Implementation

### 1. Database Migration (Non-Breaking)

```sql
-- Add soft-toggle column for reflection filtering
ALTER TABLE reflections
ADD COLUMN is_active_for_prioritization BOOLEAN DEFAULT true;

-- Index for filtering active reflections efficiently
CREATE INDEX idx_reflections_active
ON reflections(user_id, is_active_for_prioritization, created_at DESC);

-- No breaking changes: existing rows default to active = true
```

### 2. Baseline Plan Storage

**Updated Agent Session Schema:**
```typescript
// After full agent run, store baseline for instant adjustments
{
  id: "uuid",
  status: "completed",

  // NEW: Baseline plan (for reference)
  baseline_plan: {
    ordered_task_ids: string[],
    confidence_scores: Record<string, number>,
    task_metadata: Record<string, TaskMetadata>,
    dependencies: Dependency[],
    created_at: "2025-10-24T12:00:00Z"
  },

  // NEW: Adjusted plan (after reflection toggles)
  adjusted_plan: {
    ordered_task_ids: string[],
    confidence_scores: Record<string, number>,
    diff: {
      moved: Array<{ task_id, from, to, reason }>,
      filtered: Array<{ task_id, reason }>,
    },
    adjustment_metadata: {
      reflections: Array<{ id: string; text: string; recency_weight: number; created_at: string }>,
      tasks_affected: number,
      duration_ms: number,
    }
  }
}
```

### 3. Lightweight Re-Ranking Service

**New Service: `lib/services/reflectionBasedRanking.ts`**
```typescript
import { calculateCosineSimilarity } from '@/lib/services/embeddingService';
import type { PrioritizedTaskPlan, Reflection } from '@/lib/types';

export async function adjustPrioritiesWithReflections(
  baselinePlan: PrioritizedTaskPlan,
  activeReflections: Reflection[]
): Promise<AdjustedPlan> {
  const startTime = performance.now();

  // 1. Fetch task embeddings from cache (no new generation)
  const taskEmbeddings = await getTaskEmbeddings(baselinePlan.ordered_task_ids);

  // 2. Get reflection embeddings (compute on-the-fly, only 5 items)
  const reflectionEmbeddings = await generateReflectionEmbeddings(activeReflections);

  // 3. Calculate semantic similarity matrix (task × reflection)
  // Uses existing cosine similarity function from aiSummarizer.ts
  const similarityMatrix = activeReflections.map(reflection =>
    taskEmbeddings.map(taskEmb =>
      calculateCosineSimilarity(taskEmb.embedding, reflection.embedding)
    )
  );

  // 4. Adjust confidence scores based on relevance + recency weight
  // High similarity + recent reflection = confidence boost
  // Low similarity + "no app yet" = confidence penalty
  const adjustedScores = applyReflectionWeights(
    baselinePlan.confidence_scores,
    similarityMatrix,
    activeReflections.map(r => r.weight) // Recency decay: 0.5^(days/7)
  );

  // 5. Filter contradicting tasks
  // Example: "no app yet" + task contains "test app" → filter out
  const filteredTasks = filterContradictingTasks(
    baselinePlan.ordered_task_ids,
    activeReflections,
    similarityMatrix
  );

  // 6. Re-sort by adjusted confidence
  const reorderedTasks = sortByConfidence(filteredTasks, adjustedScores);

  // 7. Generate diff (what moved and why)
  const diff = generateDiff(
    baselinePlan.ordered_task_ids,
    reorderedTasks,
    adjustedScores,
    activeReflections
  );

  const duration = performance.now() - startTime;

  return {
    ordered_task_ids: reorderedTasks,
    confidence_scores: adjustedScores,
    diff,
    adjustment_metadata: {
      reflections: activeReflections.map(reflection => ({
        id: reflection.id,
        text: reflection.text,
        recency_weight: reflection.weight,
        created_at: reflection.created_at,
      })),
      tasks_moved: diff.moved.length,
      tasks_filtered: diff.filtered.length,
      duration_ms: duration,
    },
  };
}

function applyReflectionWeights(
  baselineScores: Record<string, number>,
  similarityMatrix: number[][],
  recencyWeights: number[]
): Record<string, number> {
  const adjusted = { ...baselineScores };

  similarityMatrix.forEach((reflectionSimilarities, reflectionIdx) => {
    const recencyWeight = recencyWeights[reflectionIdx];

    reflectionSimilarities.forEach((similarity, taskIdx) => {
      const taskId = Object.keys(adjusted)[taskIdx];
      const baseScore = adjusted[taskId];

      // Boost or penalize based on similarity (threshold: 0.7)
      if (similarity > 0.7) {
        // High relevance: boost confidence by up to 0.2
        adjusted[taskId] = Math.min(1.0, baseScore + (similarity * recencyWeight * 0.2));
      } else if (similarity < 0.3) {
        // Low relevance: penalize by up to 0.15
        adjusted[taskId] = Math.max(0.0, baseScore - (0.15 * recencyWeight));
      }
    });
  });

  return adjusted;
}

function filterContradictingTasks(
  taskIds: string[],
  reflections: Reflection[],
  similarityMatrix: number[][]
): string[] {
  // Identify contradictions via keyword matching + low similarity
  // Example: reflection "no app yet" + task "A/B test app" → filter
  const negationReflections = reflections.filter(r =>
    /no |not |don't |haven't |still waiting/i.test(r.text)
  );

  if (negationReflections.length === 0) return taskIds;

  return taskIds.filter((taskId, taskIdx) => {
    // Check if task contradicts any negation reflection
    const hasContradiction = negationReflections.some((reflection, reflectionIdx) => {
      const similarity = similarityMatrix[reflectionIdx][taskIdx];

      // High similarity to negation = contradiction
      // Example: "no app" + "test app icon" (similarity 0.85) = FILTER
      return similarity > 0.75;
    });

    return !hasContradiction;
  });
}

function generateDiff(
  baselineTaskIds: string[],
  reorderedTaskIds: string[],
  adjustedScores: Record<string, number>,
  reflections: Reflection[]
): AdjustmentDiff {
  const moved = [];
  const filtered = [];

  // Track moved tasks
  baselineTaskIds.forEach((taskId, baselineIdx) => {
    const newIdx = reorderedTaskIds.indexOf(taskId);

    if (newIdx === -1) {
      // Task was filtered out
      const reason = findFilterReason(taskId, reflections);
      filtered.push({ task_id: taskId, reason });
    } else if (newIdx !== baselineIdx) {
      // Task moved positions
      const direction = newIdx < baselineIdx ? 'up' : 'down';
      const reason = findMovementReason(taskId, reflections, direction);
      moved.push({
        task_id: taskId,
        from: baselineIdx + 1, // 1-indexed for UI
        to: newIdx + 1,
        reason,
      });
    }
  });

  return { moved, filtered };
}

function findMovementReason(
  taskId: string,
  reflections: Reflection[],
  direction: 'up' | 'down'
): string {
  // Find most relevant reflection that caused movement
  const relevantReflection = reflections[0]; // Simplified: use most recent

  if (direction === 'up') {
    return `Moved up: matches "${relevantReflection.text}" context`;
  } else {
    return `Moved down: contradicts "${relevantReflection.text}" context`;
  }
}
```

### 4. API Endpoint for Instant Adjustment

**New Route: `app/api/agent/adjust-priorities/route.ts`**
```typescript
import { NextResponse } from 'next/server';
import { adjustPrioritiesWithReflections } from '@/lib/services/reflectionBasedRanking';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  const startTime = performance.now();

  try {
    const { session_id, active_reflection_ids } = await request.json();

    // 1. Fetch baseline plan from agent session
    const { data: session, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('baseline_plan, prioritized_plan')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Use baseline_plan if available, else fall back to prioritized_plan
    const baselinePlan = session.baseline_plan ?? session.prioritized_plan;

    if (!baselinePlan) {
      return NextResponse.json(
        { error: 'Baseline plan not found. Run analysis first.' },
        { status: 400 }
      );
    }

    // 2. Fetch active reflections
    const { data: reflections, error: reflectionError } = await supabase
      .from('reflections')
      .select('*')
      .in('id', active_reflection_ids)
      .eq('is_active_for_prioritization', true);

    if (reflectionError) {
      return NextResponse.json(
        { error: 'Failed to fetch reflections' },
        { status: 500 }
      );
    }

    // 3. Run lightweight re-ranking (target: <500ms)
    const adjusted = await adjustPrioritiesWithReflections(
      baselinePlan,
      reflections ?? []
    );

    // 4. Update session with adjusted plan
    await supabase
      .from('agent_sessions')
      .update({
        adjusted_plan: adjusted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session_id);

    const totalTime = performance.now() - startTime;

    console.log('[Adjust Priorities] Success', {
      session_id,
      reflections_applied: adjusted.adjustment_metadata.reflections.length,
      tasks_moved: adjusted.adjustment_metadata.tasks_moved,
      duration_ms: totalTime,
    });

    // 5. Return adjusted plan
    return NextResponse.json({
      adjusted_plan: adjusted,
      performance: {
        total_ms: totalTime,
        ranking_ms: adjusted.adjustment_metadata.duration_ms,
      },
    });
  } catch (error) {
    console.error('[Adjust Priorities] Error:', error);
    return NextResponse.json(
      { error: 'Failed to adjust priorities' },
      { status: 500 }
    );
  }
}
```

### 5. Context Card Component

**New Component: `app/priorities/components/ContextCard.tsx`**
```typescript
'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { Reflection } from '@/lib/schemas/reflectionSchema';

interface ContextCardProps {
  sessionId: string | null;
  onAdjustmentComplete: (adjusted: any) => void;
  onOpenReflectionPanel: () => void;
}

export function ContextCard({
  sessionId,
  onAdjustmentComplete,
  onOpenReflectionPanel,
}: ContextCardProps) {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch 5 recent reflections on mount
  useEffect(() => {
    fetchRecentReflections();
  }, []);

  const fetchRecentReflections = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/reflections?limit=5&within_days=30');
      if (response.ok) {
        const data = await response.json();
        setReflections(data.reflections || []);
      }
    } catch (error) {
      console.error('[Context Card] Failed to fetch reflections:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (reflectionId: string, isActive: boolean) => {
    if (!sessionId) {
      console.warn('[Context Card] No session ID available');
      return;
    }

    setIsAdjusting(true);

    // Update local state immediately (optimistic UI)
    setReflections(prev =>
      prev.map(r => r.id === reflectionId
        ? { ...r, is_active_for_prioritization: isActive }
        : r
      )
    );

    try {
      // Update toggle state in database
      await fetch('/api/reflections/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflection_id: reflectionId, is_active: isActive }),
      });

      // Trigger instant adjustment
      const activeIds = reflections
        .map(r => r.id === reflectionId ? { ...r, is_active_for_prioritization: isActive } : r)
        .filter(r => r.is_active_for_prioritization)
        .map(r => r.id);

      const response = await fetch('/api/agent/adjust-priorities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          active_reflection_ids: activeIds,
        }),
      });

      if (response.ok) {
        const adjusted = await response.json();
        onAdjustmentComplete(adjusted);
      }
    } catch (error) {
      console.error('[Context Card] Adjustment failed:', error);

      // Rollback optimistic update
      setReflections(prev =>
        prev.map(r => r.id === reflectionId
          ? { ...r, is_active_for_prioritization: !isActive }
          : r
        )
      );
    } finally {
      setIsAdjusting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Current Context <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
            </CardTitle>
            <CardDescription>
              Adding context helps prioritize with your current situation in mind.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {reflections.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No context added yet</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Add quick notes about your current stage, time constraints, or blockers to get more relevant priorities.
              </p>
            </div>
            <Button onClick={onOpenReflectionPanel} className="mt-2">
              <Plus className="h-4 w-4 mr-2" />
              Add Current Context
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {reflections.map(reflection => (
                <div
                  key={reflection.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/30 transition-colors"
                >
                  <Switch
                    checked={reflection.is_active_for_prioritization ?? true}
                    onCheckedChange={(checked) => handleToggle(reflection.id, checked)}
                    disabled={isAdjusting}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-relaxed">
                      {reflection.text}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {reflection.relative_time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={onOpenReflectionPanel}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add More Context
            </Button>

            {isAdjusting && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 text-sm text-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Adjusting priorities based on context...
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

### 6. Visual Diff Component

**New Component: `app/priorities/components/TaskMovementBadge.tsx`**
```typescript
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TaskMovementBadgeProps {
  task_id: string;
  baseline_rank: number | null;
  current_rank: number;
  adjustment_reason?: string;
}

export function TaskMovementBadge({
  baseline_rank,
  current_rank,
  adjustment_reason,
}: TaskMovementBadgeProps) {
  if (baseline_rank === null || baseline_rank === current_rank) {
    return (
      <Badge variant="outline" className="gap-1.5">
        <Minus className="h-3 w-3" />
        Unchanged
      </Badge>
    );
  }

  const direction = current_rank < baseline_rank ? 'up' : 'down';
  const movement = Math.abs(current_rank - baseline_rank);

  const badge = (
    <Badge
      variant={direction === 'up' ? 'success' : 'secondary'}
      className="gap-1.5"
    >
      {direction === 'up' ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      )}
      {movement} {movement === 1 ? 'position' : 'positions'}
    </Badge>
  );

  if (!adjustment_reason) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs max-w-xs">{adjustment_reason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

---

## Rabbit Holes

**1. Building complex semantic matching logic**
- **Risk:** Spending days tuning similarity thresholds and weighting formulas
- **Timebox:** 1 day for initial implementation. Use simple thresholds (>0.7 = boost, <0.3 = penalize).
- **Why it doesn't matter yet:** User will provide feedback. Iterate based on real usage.

**2. Embedding caching strategy**
- **Risk:** Building distributed cache with Redis for reflection embeddings
- **Timebox:** 4 hours. Compute on-the-fly (only 5 reflections, ~1s total).
- **Why it doesn't matter yet:** Performance target is <500ms. Caching adds complexity for minimal gain.

**3. Multi-reflection conflict resolution**
- **Risk:** Complex logic for contradicting reflections ("burnt out" vs "high energy")
- **Timebox:** Not in scope. Most recent reflection takes precedence (recency weight).
- **Exit strategy:** If users report confusion, add UI hint: "Newer reflections prioritized"

**4. Baseline plan staleness detection**
- **Risk:** Building sophisticated checks for when baseline is too old
- **Timebox:** 2 hours. Simple timestamp check: warn if >24 hours, block if >7 days.
- **Why it doesn't matter yet:** Most users recalculate daily. Edge case can be addressed later.

**5. Perfect visual diff algorithm**
- **Risk:** Building GitHub-style diff with line-by-line comparison
- **Timebox:** 4 hours. Simple rank comparison with "moved N positions" badge.
- **Why it doesn't matter yet:** Users care about WHY task moved, not precise diff visualization.

---

## No-Gos

### Reflection Integrity (Hard Constraints)
**❌ Editing reflections**
- Append-only forever. No text changes after creation.
- Toggle is SOFT (database rows preserved).

**❌ Deleting reflections**
- Soft toggle only. Database rows never removed.
- Users can toggle OFF but cannot delete.

**❌ Categorizing reflections**
- No tags, folders, or labels allowed.
- Plain text only, no metadata.

**❌ Reflection templates**
- No "Choose: Burnt out | Energized" dropdowns.
- Free-form text input only.

### Intelligence & Automation (P1+)
**❌ Sentiment analysis**
- No automatic mood detection or emotion parsing.
- Respect user's plain text input as-is.

**❌ Reflection reminders**
- No "Time to reflect!" notifications or prompts.
- User-initiated only.

**❌ AI-generated suggestions**
- No "You seem stressed" prompts or recommendations.
- No automatic reflection creation.

**❌ Reflection digests**
- No weekly summary emails or rollup reports.
- Show 5 most recent, nothing more.

### Search & Organization (P1+)
**❌ Reflection search**
- Just show 5 most recent, no filtering or search bar.
- No date range filters, no keyword search.

**❌ Reflection history view**
- Don't show all past reflections, only recent 5.
- No pagination, no "Load more".

**❌ Rich text formatting**
- Plain text only, no bold/markdown/links.
- No emoji pickers, no formatting toolbar.

### Social & Sharing (Never)
**❌ Sharing reflections**
- Private only, single-user. No collaboration.
- No export, no public links.

**❌ Reflection streaks/gamification**
- No "5 days in a row!" badges.
- No progress bars or achievement system.

### Advanced Features (Phase 6+)
**❌ Multi-agent coordination**
- Single agent only for prioritization.
- No hierarchical agents or agent-to-agent communication.

**❌ Reinforcement learning**
- No learning from past toggle patterns (yet).
- No prompt tuning based on user behavior.

**❌ Predictive toggling**
- No auto-suggestion of which reflections to enable.
- User explicitly toggles, no automation.

**❌ Reflection-to-task linking**
- No "This reflection influenced these 5 tasks" UI.
- Keep diff simple: task moved, reason shown.

---

## Success Metrics

### Performance
| Metric | Target | Why It Matters |
|--------|---------|----------------|
| Context adjustment (p50) | < 200ms | Feels instant |
| Context adjustment (p95) | < 500ms | 95% of users see fast response |
| Toggle UI responsiveness | < 100ms | No perceived lag |
| Semantic matching accuracy | ≥ 80% | Tasks move for correct reasons |

### User Satisfaction
| Metric | Target | Measurement |
|--------|---------|-------------|
| Reflection usage rate | ≥ 40% of sessions | Track `/api/reflections` POST calls |
| "Tone-deaf priority" complaints | -50% reduction | User feedback survey |
| "Priorities make sense" rating | ≥ 80% | Post-prioritization survey |
| Repeat prioritization sessions | +30% increase | Track session frequency |

### Technical Health
| Metric | Target | Alert Threshold |
|--------|---------|-----------------|
| Baseline plan cache hit rate | ≥ 95% | < 90% |
| Adjustment API success rate | ≥ 99% | < 95% |
| Toggle state persistence | 100% | Any failure |
| Semantic matching coverage | 100% of tasks | < 95% |

### Deliverables Checklist
- ✅ Database migration: `is_active_for_prioritization` column
- ✅ Reflection-based re-ranking service (`reflectionBasedRanking.ts`)
- ✅ Adjustment API endpoint (`/api/agent/adjust-priorities`)
- ✅ Context card component with toggle UI
- ✅ Visual diff component for task movements
- ✅ Context visibility in reasoning trace panel
- ✅ Reflection toggle persistence in database
- ✅ Unit tests: semantic matching logic
- ✅ Unit tests: confidence adjustment formulas
- ✅ Integration test: toggle → adjustment → UI update
- ✅ Performance test: <500ms adjustment (p95)
- ✅ User acceptance test: "No app yet" filters app tasks

---

## Time Breakdown (2 weeks / 10 days)

### Week 1: Core Infrastructure
**Day 1-2: Database + Re-Ranking Service**
- Database migration (2 hours)
- Semantic matching logic (6 hours)
- Confidence adjustment formulas (4 hours)
- Contradiction filtering (4 hours)

**Day 3-4: API + Testing**
- Adjustment API endpoint (4 hours)
- Reflection toggle endpoint (2 hours)
- Unit tests (6 hours)
- Integration tests (4 hours)

**Day 5: Baseline Plan Storage**
- Update agent orchestration to store baseline (4 hours)
- Add adjusted_plan schema (2 hours)
- Test full flow: baseline → adjustment (2 hours)

### Week 2: UI + Polish
**Day 6-7: Context Card Component**
- Build context card with toggles (6 hours)
- Handle optimistic UI updates (3 hours)
- Error handling + rollback (3 hours)

**Day 8: Visual Diff Component**
- Build movement badge component (3 hours)
- Integrate with task list (2 hours)
- Test diff accuracy (3 hours)

**Day 9: Context Visibility in Trace**
- Add context summary to trace panel (4 hours)
- Link reflections to trace steps (3 hours)
- Test trace rendering (1 hour)

**Day 10: Performance Tuning + Edge Cases**
- Optimize semantic matching (3 hours)
- Handle edge cases (no session, empty reflections) (3 hours)
- User acceptance testing (2 hours)

---

## What Changed from Original Design

| Feature | Original PRD | Simplified Pitch |
|---------|-------------|------------------|
| Reflection categories | Optional tags (P1+) | ❌ Removed entirely (no-go) |
| Context history view | Show all reflections | Only 5 most recent |
| Adjustment algorithm | Complex ML model | Simple semantic similarity |
| Baseline staleness | Sophisticated checks | Simple timestamp (>24h warn) |
| Visual diff | GitHub-style line diff | Simple rank comparison |
| Performance target | <300ms (p95) | <500ms (p95) - more realistic |

**Why Simplified:**
- Focus on core value: make reflections discoverable + enable instant adjustment
- Avoid rabbit holes: complex categorization, sophisticated staleness detection
- Ship faster: 2 weeks vs 3-4 weeks with full feature set

---

## Integration with Existing System

**Phase 1 (Vector Storage):**
- ✅ Uses existing task embeddings for semantic matching
- ✅ No new embedding generation (reads from cache)

**Phase 2 (Tool Registry):**
- ✅ No new tools required
- ✅ Re-ranking service is standalone (no Mastra dependency)

**Phase 3 (Agent Runtime):**
- ✅ Agent continues to receive reflections in context
- ✅ Baseline plan stored after full agent run
- ✅ Adjustment service complements agent, doesn't replace

**Phase 4 (Integration & UI):**
- ✅ Context visibility added to existing reasoning trace panel
- ✅ Context card added to existing priorities page layout
- ✅ No breaking changes to existing components

---

## Risk Mitigation

**Risk 1: Semantic matching produces poor results**
- **Likelihood:** Medium (embeddings may not capture negation well)
- **Impact:** High (users lose trust in adjustments)
- **Mitigation:** Add keyword-based filters for common negations ("no", "not", "don't")
- **Fallback:** Allow users to disable auto-adjustment, use only manual recalculation

**Risk 2: Performance exceeds 500ms target**
- **Likelihood:** Low (only 5 reflections, embeddings cached)
- **Impact:** Medium (feels sluggish, not instant)
- **Mitigation:** Debounce toggle changes, show loading state
- **Fallback:** Increase target to 1s, add "Adjusting..." progress indicator

**Risk 3: Users don't understand toggle semantics**
- **Likelihood:** Medium (ON/OFF may be ambiguous)
- **Impact:** Medium (users toggle incorrectly, get wrong results)
- **Mitigation:** Clear labels ("Active for prioritization" vs "Paused")
- **Fallback:** Add tooltip explaining toggle behavior on hover

**Risk 4: Baseline plan becomes stale**
- **Likelihood:** High (users may not recalculate for days)
- **Impact:** Low (adjustments based on old plan, not broken)
- **Mitigation:** Show warning: "Plan is 3 days old. Consider recalculating."
- **Fallback:** Block adjustments if plan >7 days old, force full re-run

---

## User Journey (Before → After)

### Before (Painful)
1. User visits `/priorities` → clicks "Analyze Tasks"
2. Waits 30s → sees priorities
3. Realizes "A/B test app icons" is #1 priority
4. Thinks: "Wait, we don't have an app yet!"
5. Opens hidden ReflectionPanel (if they even know it exists)
6. Adds "Still in design phase, no app yet"
7. Clicks "Recalculate priorities" → waits another 30s
8. Sees priorities adjust → finally makes sense
9. **Total time:** 60s + frustration

### After (Smooth)
1. User visits `/priorities` → sees context card with 5 recent reflections
2. Notices empty state: "No context added yet"
3. Clicks "+ Add Current Context" → panel opens
4. Types "Still in design phase, no app yet" → saves
5. Context card updates with new reflection (toggle auto-enabled)
6. Clicks "Analyze Tasks" → waits 30s
7. Sees priorities with context applied: "Design mockups" is #1, "A/B test app" moved down
8. Hover over "↓ moved down" badge → sees reason: "Requires app (contradicts context)"
9. **Total time:** 40s + confidence

### Later Session (Even Smoother)
1. User returns tomorrow → sees context card with yesterday's reflections
2. Notices "Still in design phase" is still active ✓
3. Adds new reflection: "Client demo tomorrow" → auto-adjusts in <500ms
4. Sees "Prepare demo slides" jump to #1 instantly
5. **Total time:** 5s + delight

---

## Questions & Answers

**Q: Why not use agent's tool calling for adjustment?**
A: Tools take 10-30s to execute. We need <500ms for instant feel. Lightweight service is faster.

**Q: Why not store reflection embeddings?**
A: Only 5 reflections per user. Generating on-the-fly (5 × 200ms = 1s) is acceptable. Caching adds complexity.

**Q: Why not build a full "context history" view?**
A: Out of scope (no-go). 5 most recent reflections are sufficient for 90% of use cases. Avoid feature creep.

**Q: What if user has 0 reflections?**
A: Show empty state with "+ Add Current Context" button. Make it obvious and inviting.

**Q: Can users edit reflections after creating?**
A: No (append-only forever). They can toggle OFF and create a new one.

**Q: What if two reflections contradict each other?**
A: Most recent takes precedence (recency weight). Users can toggle older ones OFF.

**Q: How do we measure success?**
A: Track reflection usage rate (target: ≥40% of sessions). Monitor "tone-deaf priority" complaints (target: -50% reduction).

---

**Last Updated:** 2025-10-24
**Status:** Ready for Implementation
**Appetite:** 2 weeks (10 working days)
**Dependencies:** Phases 1-4 (vector storage, tools, agent runtime, UI integration)
