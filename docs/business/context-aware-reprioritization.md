# PRD: Context-Aware Dynamic Re-Prioritization

## Project Spec
**Project:** AI Note Synthesiser
**Feature:** Context-Aware Dynamic Re-Prioritization
**Platforms:** Web (Next.js 15 + TypeScript + Mastra + Supabase)
**Primary Users:** Knowledge workers who need task prioritization that adapts to current reality (product stage, time constraints, energy state, blockers)
**Deadline / Appetite:** 2 weeks
**Objective:** Enable users to add/toggle contextual reflections that instantly adjust task priorities WITHOUT requiring full agent re-runs, making the system responsive to current situation.

---

## Problem

**The agent prioritizes tasks based only on the long-term outcome statement, ignoring critical current context.**

### Real-World Example
**Outcome:** "Increase App downloads by 25% through organic ads"

**Agent surfaces:**
1. A/B test app icons
2. Be consistent with regular posting
3. Build 100-500 beta users

**User's current reality:**
- "We don't have an app yet, still in design phase"
- "Back-to-back meetings today, only 30min blocks available"
- "Feeling burnt out after launch, need lighter tasks"

**Result:** Tasks #1 and #2 are irrelevant. The system has no way to know the user hasn't built the app yet.

### Why Current System Fails

**The Gap:** The system knows *where you're going* (outcome) but not *where you are today* (current reality).

**Existing reflection system is invisible:**
- Reflections ARE passed to agent during prioritization
- Agent IS instructed to use them for filtering
- BUT: Users don't know reflections exist or matter
- AND: No way to adjust priorities after initial run without full re-calculation

**Pain points:**
1. "Tone-deaf" task suggestions that ignore current constraints
2. Full agent re-run (30s) required for every context change
3. No visibility into how reflections influenced priorities
4. Reflections hidden in sidebar, not discoverable at decision point

---

## Goals

1. **Make reflections discoverable** at the moment they matter (BEFORE prioritization)
2. **Enable instant re-ranking** when context changes (add/toggle reflections)
3. **Show context influence** in reasoning trace (which reflections filtered which tasks)
4. **Preserve append-only** reflection integrity (no editing, no deletion)
5. **Maintain fast UX** (<500ms for context-based adjustments)
6. **Reduce "tone-deaf" priorities** via better context visibility

---

## Non-Functional Notes

- **Append-only forever** — Reflections can be toggled off for prioritization, but NEVER edited or deleted from database
- **Plain text only** — No rich text, markdown, links, or formatting
- **Performance critical** — Context adjustments must complete in <500ms (no tool execution)
- **Semantic matching** — Use existing embeddings for reflection-to-task relevance
- **Privacy-first** — Reflections remain private, single-user only
- **No intelligence layer** — No AI-generated suggestions, sentiment analysis, or categorization
- **5 recent max** — Show only 5 most recent reflections, no search/filtering
- **Deterministic output** — Same reflection toggles = same priority adjustments

---

## Scope Guardrails

**In Scope:**
- Pre-prioritization context card showing 5 recent reflections
- Toggle switches to enable/disable reflections for prioritization
- Lightweight re-ranking engine (semantic matching + confidence adjustment)
- Context visibility in reasoning trace panel
- Soft-toggle state storage (`is_active_for_prioritization` column)
- Visual diff showing task movement and reasons
- Baseline plan caching for instant adjustments

**Out of Scope:**
- ❌ Editing or deleting reflections (append-only forever)
- ❌ Categorizing reflections (no tags, folders, or labels)
- ❌ Reflection templates (no "Choose: Burnt out | Energized" dropdowns)
- ❌ Sentiment analysis (no automatic mood detection)
- ❌ Reflection reminders (no "Time to reflect!" notifications)
- ❌ Reflection streaks/gamification (no "5 days in a row!" badges)
- ❌ Reflection search (just show most recent 5, no filtering)
- ❌ Rich text formatting (plain text only)
- ❌ Sharing reflections (private only, single-user)
- ❌ AI-generated suggestions (no "You seem stressed" prompts)
- ❌ Reflection digests (no weekly summary emails)
- ❌ Reflection history view (don't show all past reflections)

---

## Dependencies

| Type | Upstream | Downstream |
|------|-----------|------------|
| Tech | Baseline plan from agent session | Re-ranking service |
| Tech | Existing task embeddings | Semantic similarity matching |
| Tech | Reflection service | Toggle state management |
| Tech | Agent orchestration | Trace parsing for context visibility |
| Non-tech | User adds reflections | System adjusts priorities instantly |
| Non-tech | User toggles reflections | Task list updates in <500ms |

---

## Edge Cases & Error States

| Case | Expected Behaviour |
|------|--------------------|
| No reflections exist | Show empty context card with "Add context" prompt |
| All reflections toggled off | Revert to baseline plan (no adjustments) |
| Contradicting reflections | Most recent reflection takes precedence (recency weight) |
| Baseline plan unavailable | Disable toggle UI, show "Run analysis first" message |
| Semantic matching fails | Graceful degradation: show baseline plan unchanged |
| Adjustment takes >500ms | Show loading state, allow fallback to baseline |
| User adds reflection mid-session | Auto-enable toggle, trigger instant adjustment |
| Reflection text matches no tasks | No tasks filtered, confidence unchanged |
| Network error during adjustment | Retry once, then show baseline plan with error banner |

---

## TDD Approach

### 1. Lightweight Re-Ranking Service
**GIVEN** a baseline plan with 10 tasks
**AND** reflection "Still in design phase, no app yet"
**WHEN** re-ranking is triggered
**THEN** tasks containing "app icon" or "beta users" drop in confidence
**AND** tasks containing "design" or "mockup" increase in confidence
**AND** adjustment completes in <500ms

### 2. Reflection Toggle UI
**GIVEN** a prioritized plan exists
**AND** 3 active reflections are displayed
**WHEN** user toggles one reflection off
**THEN** API call to `/api/agent/adjust-priorities` succeeds
**AND** task list updates with visual diff
**AND** toggle state persists in database

### 3. Context Card Discovery
**GIVEN** user visits `/priorities` page
**WHEN** page loads and no plan exists
**THEN** context card displays with 5 recent reflections
**AND** "+ Add Current Context" button opens ReflectionPanel
**AND** card collapses after prioritization starts

### 4. Semantic Matching Logic
**GIVEN** reflection "Only 30min blocks available"
**AND** task "Draft 40-page strategy document"
**WHEN** semantic similarity is calculated
**THEN** task receives low relevance score
**AND** confidence drops by ≥0.15
**AND** task moves down in priority ranking

### 5. Context Visibility in Trace
**GIVEN** agent session with 3 reflections used
**WHEN** reasoning trace panel opens
**THEN** "Context Used" section displays 3 reflection texts
**AND** recency weights shown for each
**AND** trace steps reference context in filtering decisions

---

## Acceptance Criteria

### Discovery & Visibility
- [ ] Context card appears on `/priorities` page before "Analyze Tasks" button
- [ ] Card shows 5 most recent reflections with plain text display
- [ ] "+ Add Current Context" button opens ReflectionPanel in sidebar
- [ ] Card collapses when prioritization starts (status becomes "running")
- [ ] Reasoning trace panel shows "Context Used: N reflections" summary

### Dynamic Adjustment
- [ ] Toggle switches appear next to each reflection in context card
- [ ] Toggling reflection OFF triggers instant priority adjustment (<500ms)
- [ ] Toggling reflection ON restores previous adjustment
- [ ] Adding new reflection auto-enables toggle and adjusts priorities
- [ ] Visual diff shows task rank changes with reasons (e.g., "Moved down: requires app")

### Data Integrity
- [ ] Reflections remain in database when toggled off (`is_active_for_prioritization = false`)
- [ ] Toggle state persists across page refreshes
- [ ] Baseline plan cached in agent session for reference
- [ ] Original agent reasoning trace preserved unchanged

### Performance
- [ ] Context adjustment completes in <500ms (95th percentile)
- [ ] No full agent re-run triggered by toggle changes
- [ ] Semantic matching uses pre-computed embeddings (no new embeddings generated)
- [ ] UI remains responsive during adjustment (loading states shown)

---

## Implementation Notes

### Sense → Reason → Act → Learn

**Sense:**
- Detect when user visits `/priorities` page
- Fetch 5 most recent reflections via `/api/reflections?limit=5`
- Display context card with toggle switches
- Listen for toggle events and new reflection additions

**Reason:**
- On toggle change: Call lightweight re-ranking service
- Calculate semantic similarity between active reflections and task texts
- Adjust confidence scores based on relevance (+/- 0.1 to 0.2 range)
- Filter out tasks that contradict active reflections
- Re-sort tasks by adjusted confidence
- Generate visual diff comparing baseline to adjusted plan

**Act:**
- Update task list UI with new order
- Show diff badges (↑ moved up, ↓ moved down, — unchanged)
- Display adjustment reason for each moved task
- Persist toggle state to `reflections.is_active_for_prioritization`
- Log adjustment metadata (duration, tasks affected, confidence deltas)

**Learn:**
- Track reflection usage rate (% of sessions with active reflections)
- Monitor adjustment accuracy (user satisfaction signals)
- Log semantic matching effectiveness (relevance scores)
- Measure performance (p50, p95, p99 adjustment times)

---

## Architecture

### 1. Database Schema Change (Non-Breaking)
```sql
-- Add soft-toggle column to reflections table
ALTER TABLE reflections
ADD COLUMN is_active_for_prioritization BOOLEAN DEFAULT true;

-- Index for filtering active reflections
CREATE INDEX idx_reflections_active
ON reflections(user_id, is_active_for_prioritization, created_at DESC);
```

### 2. Baseline Plan Storage
```typescript
// After full agent run, store baseline in agent_sessions
{
  id: "uuid",
  baseline_plan: {
    ordered_task_ids: string[],
    confidence_scores: Record<string, number>,
    task_metadata: Record<string, TaskMetadata>,
    dependencies: Dependency[],
  },
  adjusted_plan: null, // Populated on reflection toggle
}
```

### 3. Lightweight Re-Ranking Service
```typescript
// lib/services/reflectionBasedRanking.ts

export async function adjustPrioritiesWithReflections(
  baselinePlan: PrioritizedTaskPlan,
  activeReflections: Reflection[]
): Promise<AdjustedPlan> {
  // 1. Get task embeddings from existing cache
  const taskEmbeddings = await getTaskEmbeddings(baselinePlan.ordered_task_ids);

  // 2. Get reflection embeddings (or compute on-the-fly for <5 items)
  const reflectionEmbeddings = await getReflectionEmbeddings(activeReflections);

  // 3. Calculate semantic similarity matrix
  const similarityMatrix = calculateCosineSimilarity(taskEmbeddings, reflectionEmbeddings);

  // 4. Adjust confidence scores based on relevance
  const adjustedScores = applyReflectionWeights(
    baselinePlan.confidence_scores,
    similarityMatrix,
    activeReflections // Include recency weights
  );

  // 5. Filter contradicting tasks
  const filteredTasks = filterContradictingTasks(
    baselinePlan.ordered_task_ids,
    activeReflections,
    similarityMatrix
  );

  // 6. Re-sort by adjusted confidence
  const reorderedTasks = sortByConfidence(filteredTasks, adjustedScores);

  // 7. Generate diff
  const diff = generateDiff(baselinePlan.ordered_task_ids, reorderedTasks);

  return {
    ordered_task_ids: reorderedTasks,
    confidence_scores: adjustedScores,
    diff,
    adjustment_metadata: {
      reflections: activeReflections.map((reflection) => ({
        id: reflection.id,
        text: reflection.text,
        recency_weight: reflection.recency_weight,
        created_at: reflection.created_at,
      })),
      tasks_moved: diff.moved.length,
      tasks_filtered: diff.removed.length,
      duration_ms: performance.now() - startTime,
    },
  };
}
```

### 4. API Endpoint
```typescript
// app/api/agent/adjust-priorities/route.ts

export async function POST(request: Request) {
  const { session_id, active_reflection_ids } = await request.json();

  // 1. Fetch baseline plan from session
  const session = await getAgentSession(session_id);
  if (!session.baseline_plan) {
    return NextResponse.json(
      { error: 'Baseline plan not found. Run analysis first.' },
      { status: 400 }
    );
  }

  // 2. Fetch active reflections
  const reflections = await getReflectionsByIds(active_reflection_ids);

  // 3. Run lightweight re-ranking
  const adjusted = await adjustPrioritiesWithReflections(
    session.baseline_plan,
    reflections
  );

  // 4. Update session with adjusted plan
  await updateAgentSession(session_id, {
    adjusted_plan: adjusted,
    updated_at: new Date().toISOString(),
  });

  // 5. Return adjusted plan
  return NextResponse.json({
    adjusted_plan: adjusted,
    adjustment_metadata: adjusted.adjustment_metadata,
  });
}
```

### 5. Context Card Component
```typescript
// app/priorities/components/ContextCard.tsx

export function ContextCard({
  sessionId,
  onAdjustmentComplete
}: ContextCardProps) {
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Fetch 5 recent reflections on mount
  useEffect(() => {
    fetchRecentReflections(5).then(setReflections);
  }, []);

  const handleToggle = async (reflectionId: string, isActive: boolean) => {
    setIsAdjusting(true);

    // Update local state immediately (optimistic)
    setReflections(prev =>
      prev.map(r => r.id === reflectionId
        ? { ...r, is_active_for_prioritization: isActive }
        : r
      )
    );

    // Update database
    await updateReflectionToggle(reflectionId, isActive);

    // Trigger adjustment
    const activeIds = reflections
      .filter(r => r.is_active_for_prioritization)
      .map(r => r.id);

    const adjusted = await adjustPriorities(sessionId, activeIds);

    setIsAdjusting(false);
    onAdjustmentComplete(adjusted);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current Context (Optional)</CardTitle>
        <CardDescription>
          Adding context helps prioritize with your current situation in mind.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {reflections.length === 0 ? (
          <Button onClick={() => openReflectionPanel()}>
            + Add Current Context
          </Button>
        ) : (
          <>
            <div className="space-y-2">
              {reflections.map(reflection => (
                <div key={reflection.id} className="flex items-start gap-3">
                  <Switch
                    checked={reflection.is_active_for_prioritization}
                    onCheckedChange={(checked) => handleToggle(reflection.id, checked)}
                    disabled={isAdjusting}
                  />
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{reflection.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {reflection.relative_time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => openReflectionPanel()}
              className="mt-4"
            >
              + Add Current Context
            </Button>
          </>
        )}

        {isAdjusting && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Adjusting priorities based on context...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### 6. Visual Diff Component
```typescript
// app/priorities/components/TaskDiff.tsx

export function TaskDiff({ task, baselineRank, currentRank }: TaskDiffProps) {
  if (baselineRank === currentRank) {
    return <Badge variant="outline">—</Badge>;
  }

  const direction = currentRank < baselineRank ? 'up' : 'down';
  const movement = Math.abs(currentRank - baselineRank);

  return (
    <div className="flex items-center gap-2">
      <Badge variant={direction === 'up' ? 'success' : 'secondary'}>
        {direction === 'up' ? '↑' : '↓'} {movement}
      </Badge>
      {task.adjustment_reason && (
        <span className="text-xs text-muted-foreground">
          {task.adjustment_reason}
        </span>
      )}
    </div>
  );
}
```

---

## Success Metrics

### Performance
| Metric | Target |
|--------|---------|
| Context adjustment time (p50) | < 200ms |
| Context adjustment time (p95) | < 500ms |
| Semantic matching accuracy | ≥ 80% |
| Toggle responsiveness | < 100ms UI update |

### User Satisfaction
| Metric | Target |
|--------|---------|
| Reflection usage rate | ≥ 40% of prioritization sessions |
| "Tone-deaf priority" complaints | -50% reduction |
| User reports "priorities make sense" | ≥ 80% |
| Repeat prioritization sessions | +30% increase |

### Technical Health
| Metric | Target |
|--------|---------|
| Baseline plan cache hit rate | ≥ 95% |
| Adjustment API success rate | ≥ 99% |
| Toggle state persistence | 100% |
| Semantic matching coverage | 100% of tasks |

---

## Risks

### Technical Risks
1. **Semantic matching accuracy** — Reflection text may not map clearly to task keywords
   - **Mitigation:** Use hybrid matching (keyword + embedding similarity)
   - **Fallback:** Manual confidence override in future iteration

2. **Baseline plan staleness** — Tasks may change between baseline and adjustment
   - **Mitigation:** Store baseline timestamp, warn if >24 hours old
   - **Fallback:** Force full re-run if baseline too old

3. **Performance degradation** — Adjustment may exceed 500ms with large task sets
   - **Mitigation:** Limit adjustment to top 50 tasks only
   - **Fallback:** Show loading state, allow user to cancel

### UX Risks
1. **User confusion** — Toggle semantics may not be clear ("What does OFF mean?")
   - **Mitigation:** Clear labels: "Active for prioritization" vs "Paused"
   - **Education:** Tooltip explaining toggle behavior

2. **Reflection clutter** — 5 reflections may feel overwhelming
   - **Mitigation:** Collapse card after first use, show count badge
   - **Future:** Allow collapsing individual reflections

3. **Over-adjustment** — Users may toggle too frequently, creating instability
   - **Mitigation:** Debounce toggle changes (300ms)
   - **Guidance:** Show "Adjusting..." state to discourage rapid toggling

---

## Out of Scope (No-Gos)

### Reflection Integrity (Hard Constraints)
1. **❌ Editing reflections** — Append-only forever. No text changes after creation.
2. **❌ Deleting reflections** — Soft toggle only. Database rows never removed.
3. **❌ Categorizing reflections** — No tags, folders, or labels allowed.
4. **❌ Reflection templates** — No "Choose: Burnt out | Energized" dropdowns.

### Intelligence & Automation (P1+)
5. **❌ Sentiment analysis** — No automatic mood detection or emotion parsing.
6. **❌ Reflection reminders** — No "Time to reflect!" notifications or prompts.
7. **❌ AI-generated suggestions** — No "You seem stressed" prompts or recommendations.
8. **❌ Reflection digests** — No weekly summary emails or rollup reports.

### Search & Organization (P1+)
9. **❌ Reflection search** — Just show 5 most recent, no filtering or search bar.
10. **❌ Reflection history view** — Don't show all past reflections, only recent 5.
11. **❌ Rich text formatting** — Plain text only, no bold/markdown/links.

### Social & Sharing (Never)
12. **❌ Sharing reflections** — Private only, single-user. No collaboration.
13. **❌ Reflection streaks/gamification** — No "5 days in a row!" badges.

### Advanced Features (Phase 2+)
14. **❌ Multi-agent coordination** — Single agent only for prioritization.
15. **❌ Reinforcement learning** — No learning from past toggle patterns (yet).
16. **❌ Predictive toggling** — No auto-suggestion of which reflections to enable.

---

## Deliverable

A **context-aware prioritization system** that:
1. Surfaces reflections at decision point (before prioritization)
2. Enables instant priority adjustments via toggle switches (<500ms)
3. Shows visual diff of task movements with explanations
4. Preserves append-only reflection integrity (no editing/deletion)
5. Displays context influence in reasoning trace panel

**Technical artifacts:**
- Context card component with toggle UI (`app/priorities/components/ContextCard.tsx`)
- Lightweight re-ranking service (`lib/services/reflectionBasedRanking.ts`)
- Adjustment API endpoint (`app/api/agent/adjust-priorities/route.ts`)
- Visual diff component (`app/priorities/components/TaskDiff.tsx`)
- Database migration for `is_active_for_prioritization` column
- Unit tests for semantic matching and adjustment logic
- Integration tests for full toggle → adjustment → UI update flow

**User experience:**
- User visits `/priorities` → sees 5 recent reflections with toggles
- User adds "Still in design phase" → toggle auto-enabled, tasks adjust instantly
- User sees "↓ #1 → #4 [A/B test app icons] — Moved down: requires app"
- User toggles reflection OFF → priorities revert to baseline
- User opens reasoning trace → sees "Context Used: 3 reflections" with details

**Success criteria:**
- Context adjustment completes in <500ms (95th percentile)
- Reflection usage rate ≥40% of prioritization sessions
- "Tone-deaf priority" complaints reduced by 50%
- Toggle state persists 100% reliably across sessions
