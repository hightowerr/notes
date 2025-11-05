# Shape Up Pitch: Phase 7 – Reflection-Driven Task Coherence

## Problem

**Reflections don’t meaningfully influence gap-filling, task suggestions, or priority recalculations, so users see the same generic outcomes even after they share high-signal context.**

### Reality today
- Users capture reflections like “We postponed the pricing launch to January” or “Legal blocked any new customer outreach”.  
- The “Find Missing Tasks” feature still suggests irrelevant tasks that ignore those reflections.  
- Task re-prioritisation and recalculations recirculate stale ordering (e.g., promoting outreach items legal just blocked).  
- The “Manual review required / unreadable” fallback appears frequently because no coherent alternative is generated.

### User feedback
> “When I hit *Find Missing Tasks*, it’s as if the reflection never existed. The quality is garbage. Suggestions keep telling me to do tasks I explicitly ruled out.”  
> “Reflections feel like a dead end. They don’t impact prioritisation, gap detection, or recalculations.”

**Core issue:** The system treats reflections as optional flavour text instead of hard context that must shape task interpretation, gap detection, and follow-up suggestions. Users invest effort adding reflections but get no new value back.

---

## Appetite
- **6-week big batch** (full cycle).  
- We need end-to-end changes across Mastra tools, gap detection, priority calculation, and UI feedback loops. Anything smaller would result in half-measures.

---

## Solution – High Level

Deliver a reflection-aware pipeline that:
1. **Ingests reflections as first-class constraints and opportunities** before we run prioritisation or gap filling.  
2. **Re-shapes missing task suggestions** so they always reference the active reflections and, when appropriate, the counter-factual (e.g., “You paused the launch; here are internal prep tasks instead”).  
3. **Re-weights task priorities** using reflection semantics (short-term blockers, energy level, capacity).  
4. **Surfaces a transparent audit trail** showing which reflections touched which tasks and why a suggestion or priority moved.  
5. **Iterates quickly (sub-second)** for reflection toggles while keeping the heavy agent run for full re-shapes.

---

## Breadboard Sketch

```
┌──────────────────────────────────────────────────────────────┐
│  Dashboard Card – Reflection-aware Missing Tasks             │
│                                                              │
│  Reflections (5)                                             │
│  [✓] “Legal blocked outbound until 1 Dec”                    │
│  [✓] “Focus: tighten internal analytics”                     │
│  [ ] “Low energy this week”                                  │
│  [+] Add reflection                                          │
│                                                              │
│  Missing Tasks                                                │
│  ⚠ Gap between: “Prep outbound drip” → “Launch campaign”     │
│  • Suggested: “Run cold outreach” (Suppressed: violates legal reflection) 
│  • Suggested: “Internal analytics QA sprint” (Promoted)       │
│    Reason: Addresses ref #2 (“tighten analytics”)             │
│  [Accept] [Edit] [Dismiss]                                    │
│                                                              │
│  Priority diff                                                │
│  ↑ “Analytics QA sprint” (↑3)  – Trigger: Reflection #2       │
│  ↓ “Prep outbound drip”  (↓5) – Blocked by Reflection #1      │
│                                                              │
│  Trace link: “See how reflections changed tasks”              │
└──────────────────────────────────────────────────────────────┘
```

---

## What We’re Building

### 1. Reflection Semantics Engine (RSE)
- Build an embedding + rule layer that classifies reflections into constraint, opportunity, energy/capacity, sequencing cues.  
- Normalise reflections into machine-friendly tags (e.g., `BLOCK_OUTBOUND`, `FOCUS_INTERNAL_ANALYTICS`, `LOW_CAPACITY`).  
- Persist derived tags alongside raw reflections for reuse across tools (`reflections.derived_tags jsonb`).

### 2. Reflection-Aware Gap Detection
- Extend Mastra gap tool to require reflection tags when generating suggestions.  
- Hard constraint: suggestions must cite at least one active reflection tag or explicitly explain why the reflection is overridden.  
- Suppress suggestions that violate hard constraints (“Legal blocked outbound → do not suggest outreach”).  
- Promote suggestions that satisfy opportunity tags (“Focus internal analytics → propose instrumentation tasks”).

### 3. Priority Re-scoring Module
- Create a lightweight scoring layer that adjusts baseline task confidence using reflection tags (e.g., `cap_low_energy` reduces deep-work tasks).  
- Respect immediate blockers by demoting tasks until block reflection is cleared or expired.  
- Update `/api/priorities` to return both baseline and reflection-adjusted ordering with diff annotations.

### 4. Fast Reflection Toggle Loop
- Cache baseline task embeddings & scores from latest agent run.  
- On reflection toggle, recompute adjustment in <500 ms with embedding matrix multiplication.  
- UI instantly updates ordering + justifications (“Demoted because Reflection #1 blocks outbound work”).

### 5. Trust & Trace UI
- In priorities + missing tasks modals, add “Why this changed” accordions referencing specific reflections and tags.  
- Provide “View baseline plan” vs “View reflection-adjusted plan” toggles.  
- Tag each suggested task with badges (e.g., `Matches: Tighten analytics`, `Blocked: Legal hold`) so humans trust the result.

### 6. Safeguards & Telemetry
- Log anytime a reflection suppresses or promotes a task; store before/after orderings.  
- Dashboards for acceptance rate of reflection-driven suggestions and frequency of suppression to tune thresholds.  
- Fallback: if reflection score causes full suppression (no tasks left), show friendly message prompting user to relax constraints.

---

## Out of Scope (No-gos)
- Building new reflection capture UI (we reuse existing fields and toggles).  
- Rewriting the core prioritisation agent (we layer adjustments on top).  
- Bulk historical retraining; this is an inference layer.  
- External API calls to other planning systems.  
- Autonomously editing reflections; the system suggests, users confirm.

---

## Risks & Rabbit Holes

| Risk | Why it’s scary | Mitigation |
|------|----------------|------------|
| Over-suppression – reflections remove too many tasks | Users may end up with empty plans | Enforce minimum floor (cannot suppress below 5 tasks without explicit override) |
| Conflicting reflections (“Work on marketing” vs “Legal block outbound”) | Results may oscillate | Use priority hierarchy: hard constraints > blockers > opportunities > preferences |
| Performance regressions | Reflection toggles must stay <500 ms | Pre-compute embeddings; reuse caches; limit active reflections to 10 |
| Low trust if explanations feel vague | Users revert to ignoring reflections | Require every diff to cite specific reflection text + derived tag |
| Complex tagging maintenance | Hard to add new reflection types later | Store both raw text and derived tags; use config file to map patterns; allow incremental updates |

---

## Success Metrics
- **Reflection adoption**: ≥70 % of active users keep at least one reflection toggled on when running “Find Missing Tasks”.  
- **Suggestion acceptance**: Reflection-informed missing task suggestions accepted ≥60 % of the time (baseline today <25 %).  
- **Priority confidence**: Users downgrade “quality of priority list” complaints by 50 % (measured via in-app feedback).  
- **Latency**: Reflection toggle adjustments complete in <500 ms at P95.  
- **Suppression accuracy**: <10 % of suppressed tasks get manually re-enabled within 24 h (indicates we’re not over-blocking).  
- **Telemetry**: For each reflection tag we track promote/demote counts to ensure influence is visible.

---

## Deliverables
1. `reflectionSemanticsService` (classification + derived tags).  
2. Updated `suggest-bridging-tasks` Mastra tool that consumes reflection tags + emits reasoned suggestions.  
3. Priority adjustment service + API updates (`/api/priorities`, `/api/agent/suggest-gaps`).  
4. UI updates in priorities view & gap modal (badges, explanations, baseline vs adjusted toggle).  
5. Telemetry and Supabase schema updates (`reflections.derived_tags`, `priority_adjustments` table).  
6. Integration tests:  
   - Reflection blocks suggestion (legal hold scenario).  
   - Reflection promotes alternate tasks (focus analytics scenario).  
   - Priority order diff exposes reasons.  
   - Toggle loops remain <500 ms (benchmarked).  
7. Manual test script covering legal block, energy level, and opportunity reflections.

---

## Dependencies
- Phase 5 gap-filling & context-aware prioritisation groundwork.  
- Embedding service + vector storage (Phase 1).  
- Mastra tool registry (Phase 2) for plugging new reflection-aware tool.  
- Agent runtime & orchestration (Phase 3).  
- Integration UI frameworks (Phase 4).  
- Document reprocessing improvements (Phase 6) to ensure downstream summaries stay aligned.

---

## Ready When
- User adds or toggles reflections → Gap suggestions, missing tasks, and priorities update instantly with human-readable explanations referencing those reflections.  
- Irrelevant tasks (e.g., outbound campaign during legal hold) no longer appear in top suggestions.  
- Acceptance of suggested bridging tasks doubles vs current baseline.  
- Telemetry offers a clear audit of reflection influence for product tuning.  
- Users report that reflections finally “matter”—they see meaningful changes after providing context.
