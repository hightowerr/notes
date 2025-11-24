# Shape Up Pitches: Agentic RAG Implementation (Mastra)

This directory contains Shape Up pitch documents for implementing Agentic RAG in the AI Note Synthesiser **using the Mastra AI framework**.

## What is a Shape Up Pitch?

A Shape Up pitch is a structured problem definition that:
- **Problem:** Clearly states what's broken or missing
- **Solution:** Proposes a concrete, scoped fix
- **Rabbit Holes:** Identifies time sinks to avoid
- **No-Gos:** Explicitly lists what's out of scope

Each pitch has a **fixed appetite** (time budget). We shape the solution to fit the appetite, not the other way around.

---

## The 4 Phases (Mastra-Powered)

### Phase 1: Vector Storage Foundation
**Appetite:** 1 week

**Problem:** Embeddings regenerated on every query → 40s delay, expensive

**Solution:** pgvector + pre-computed embeddings

**Key unlock:** Fast semantic search (<500ms)

**Implementation:** Custom (no Mastra dependency)

[Read Full Pitch →](./phase-1-vector-storage.md)

---

### Phase 2: Tool Registry & Execution (Mastra)
**Appetite:** 1 week

**Problem:** Agent has no way to query data dynamically

**Solution:** 5 specialized tools using Mastra's `createTool()`
- semantic-search
- get-document-context
- detect-dependencies
- query-task-graph
- cluster-by-similarity

**Key unlock:** Agent can explore and analyze

**What Mastra Provides:**
- ✅ Automatic tool registration
- ✅ Built-in Zod validation
- ✅ Execution logging
- ✅ Error handling with retry

**Time Saved:** 40-50% (2 days vs 4 days)

[Read Full Pitch →](./phase-2-tool-registry.md)

---

### Phase 3: Agent Runtime & Reasoning Loop (Mastra)
**Appetite:** 1 week

**Problem:** Agent has tools but no brain—can't decide which to use

**Solution:** Agentic reasoning loop using Mastra's `createAgent()`

**Key unlock:** Multi-step reasoning with automatic tool calling

**What Mastra Provides:**
- ✅ Automatic tool selection (GPT-4o decides)
- ✅ Built-in reasoning loop
- ✅ Memory management
- ✅ Execution tracing
- ✅ Streaming support

**Time Saved:** 50-60% (2 days vs 5 days)

[Read Full Pitch →](./phase-3-agent-runtime.md)

---

### Phase 4: Integration & UI (Mastra)
**Appetite:** 1 week

**Problem:** Agent works but users can't see reasoning

**Solution:** Integrate with recompute service + UI using Mastra telemetry

**Components:**
- ReasoningTracePanel (fetches from Mastra API)
- DependencyGraphVisualization (D3.js graph)
- ExecutionWavesTimeline (task sequence)

**Key unlock:** User trust via transparency

**What Mastra Provides:**
- ✅ Built-in telemetry storage
- ✅ `getExecutionTrace()` API
- ✅ Automatic trace persistence
- ✅ No custom session management

**Time Saved:** 40-50% (2-3 days vs 5 days)

[Read Full Pitch →](./phase-4-integration-ui.md)

---

### Phase 5: Cloud Service Provider Sync
**Appetite:** 1.5 weeks

**Problem:** Users must manually upload files instead of auto-syncing from cloud storage

**Solution:** Google Drive integration + direct text input field

**Components:**
- OAuth connection to Google Drive
- Webhook monitoring for file changes
- Auto-download and process new/updated files
- Quick capture modal for raw text/markdown input

**Key unlock:** Autonomous sync - "write once, sync everywhere"

**Features:**
- ✅ Read-only Drive integration (no write permissions)
- ✅ Folder selection and monitoring
- ✅ Automatic deduplication via content hash
- ✅ Direct markdown input without file upload
- ✅ Draft auto-save to localStorage

**Time Saved:** Manual upload friction eliminated

[Read Full Pitch →](./phase-5-cloud-sync.md)

---

## Total Timeline: 4.5-5.5 Weeks (vs 6+ weeks custom)
### Phase 5: Context-Aware Dynamic Re-Prioritization
**Appetite:** 2 weeks

**Problem:** Agent prioritizes without knowing current reality (stage, time, energy, blockers)

**Solution:** Surface reflections at decision point + instant adjustment via toggles

**Components:**
- Pre-prioritization context card (5 recent reflections)
- Lightweight re-ranking engine (<500ms)
- Toggle switches for reflection filtering
- Visual diff showing task movements
- Context visibility in reasoning trace

**Key unlock:** Users can adapt priorities to current situation without 30s re-runs

**What's New:**
- ✅ Reflection discoverability (shown before "Analyze Tasks")
- ✅ Instant adjustment (<500ms vs 30s full agent re-run)
- ✅ Visual feedback (task moved up/down with reasons)
- ✅ Context influence transparency (trace shows which reflections used)

**Time Saved:** N/A (New feature, not a replacement)

[Read Full Pitch →](./phase-5-context-aware-reprioritization.md)

---

### Phase 6: Document-Level Reprocessing
**Appetite:** 1-2 days (small batch)

**Problem:** Cannot re-analyze documents after OCR/AI improvements without manual deletion

**Solution:** "Reprocess" button on each document card

**Components:**
- API endpoint: `POST /api/documents/[id]/reprocess`
- Google Drive files: Download latest version from Drive
- Manual uploads: Reprocess existing file with new OCR
- Cascade delete old data (embeddings/relationships)
- Trigger complete pipeline (convert → AI → embeddings)

**Key unlock:** Users apply system improvements to existing documents

**Features:**
- ✅ Single-click reprocessing per document
- ✅ Google Drive re-download (latest version)
- ✅ Automatic cascade cleanup
- ✅ Loading states + error handling
- ❌ No batch operations (Phase 2 if needed)
- ❌ No diff view (just updated result)

**Time Saved:** 50 hours manual work → 15 seconds per document

[Read Full Pitch →](./phase-6-document-reprocessing.md)

---

### Phase 7: Reflection-Driven Task Coherence
**Appetite:** 2 weeks

**Problem:** Tasks extracted from isolated documents lack coherence with user's workflow

**Solution:** Reflection-based context system + pre-prioritization context

**Key unlock:** AI understands user's current reality when prioritizing

[Read Full Pitch →](./phase-7-reflection-driven-task-coherence.md)

---

### Phase 8: Mobile-First Transformation
**Appetite:** 1.5 weeks

**Problem:** Mobile users face critical usability issues (header overflow, small touch targets, horizontal scrolling)

**Solution:** Mobile-first responsive design with 44px touch targets, optimized grids, and enhanced modals

**Components:**
- Fix header overflow on 320-375px screens
- Universal 44px touch targets on mobile
- Responsive grid breakpoints (md: → lg:)
- Mobile-optimized modals and forms
- Touch feedback and enhanced shadows

**Key unlock:** Confident mobile deployment without compromising desktop experience

**Features:**
- ✅ No horizontal scrolling on any viewport (320px+)
- ✅ WCAG 2.1 touch target compliance (44x44px)
- ✅ Mobile-first CSS with progressive enhancement
- ✅ Tailwind xs: breakpoint (475px) for fine-grained control
- ✅ Tap highlights and visual feedback
- ❌ No native mobile apps (web-responsive only)
- ❌ No PWA features (future phase if needed)

**Time Investment:** Pure CSS changes, no logic modifications, low risk

[Read Full Pitch →](./phase-8-mobile-first-transformation.md)

---

### Phase 9: Manual Task Control & Discard Approval
**Appetite:** 2 weeks

**Problem:** Users cannot add tasks, edit descriptions, or control which tasks get discarded during re-prioritization

**Solution:** Manual task creation + inline editing + discard approval workflow

**Components:**
- "Add Task" button → quick-capture modal
- Inline editing with debounced save
- Discard review modal (approve/reject)
- Auto re-prioritization after changes
- Visual indicators ([MANUAL] badges, edit states)

**Key unlock:** Users become collaborators instead of spectators

**Features:**
- ✅ Manual task creation with duplicate detection
- ✅ Inline task text & hours editing
- ✅ User approval required before discarding tasks
- ✅ Automatic re-prioritization integration
- ✅ Edit locking during prioritization
- ❌ No batch operations (future phase if needed)
- ❌ No task templates or dependencies UI

**Time Investment:** 2 weeks (tightly coupled UX features)

[Read Full Pitch →](./phase-9-manual-task-control.md)

---

## Total Timeline: 9-10 Weeks (vs 10+ weeks custom)

Each phase is:
- **Independently shippable** (can ship Phase 1 without Phase 2)
- **Fixed scope** (rabbit holes explicitly cut)
- **Time-boxed** (1-2 week appetite, no extensions)

**Overall Time Savings with Mastra:** 25-40% reduction (1-2 weeks saved)
**Phase 5 adds:** Autonomous cloud sync capability
**Phase 6 adds:** Document reprocessing capability (1-2 days)
**Phase 7 adds:** Reflection-driven context awareness (2 weeks)
**Phase 8 adds:** Mobile-first responsive design (1.5 weeks)
**Phase 9 adds:** Manual task control & discard approval (2 weeks)

---

## Mastra Integration Strategy

### Why Mastra?

**What is Mastra?**
- TypeScript-first AI agent framework (from Gatsby team, YC-backed)
- Built-in tool calling, agent runtime, workflows, observability
- Native Next.js integration
- Supports GPT-4, Claude, Gemini, Llama

**Key Benefits:**
1. **Faster Development** - No need to build tool registry, agent runtime, or state management
2. **Better Observability** - Built-in tracing means reasoning traces come for free
3. **Production-Ready** - Battle-tested framework with active community
4. **Flexibility** - Easy to switch LLM providers, extensible architecture

### Hybrid Approach

**Keep Custom:**
- Phase 1: Vector storage (pgvector + embedding generation)
- Existing services (filteringService, recomputeService structure)

**Replace with Mastra:**
- Phase 2: Tool registry → Mastra `createTool()`
- Phase 3: Agent runtime → Mastra `createAgent()`
- Phase 4: Observability → Mastra telemetry

**Why Hybrid?**
- Control over vector storage (critical for performance)
- Leverage Mastra for agent orchestration (80% of complexity)
- Reduce development time without sacrificing control

---

## How to Use These Pitches

1. **Read the Problem section** - Understand what's broken
2. **Review the Solution** - See the Mastra-powered fix
3. **Check Rabbit Holes** - Know what to avoid
4. **Scan No-Gos** - Understand what's explicitly excluded
5. **Review Success Metrics** - Know when you're done

---

## Architecture Overview

```
Phase 1: Vector Storage (Custom)
  ↓
Phase 2: Tool Registry (Mastra createTool)
  ↓
Phase 3: Agent Runtime (Mastra createAgent)
  ↓
Phase 4: UI Integration (Mastra Telemetry)
  ↓
Phase 5: Cloud Sync (Google Drive + Text Input)
  ↓
Result: Full Agentic RAG System with Autonomous Sync
Phase 5: Context-Aware Re-Prioritization (Custom)
  ↓
Result: Full Agentic RAG System with Context Adaptation
```

Each phase builds on the previous, but can be deployed independently.

**Note:** Phase 5 is parallel to Phases 1-4. It enhances input sources but doesn't depend on agent features.
**Phase 5 Note:** Unlike Phases 2-4, Phase 5 does not use Mastra. It's a lightweight custom service that complements the agent runtime with instant context-based adjustments.

---

## Key Mastra Code Patterns

### Phase 2: Tool Definition
```typescript
import { createTool } from '@mastra/core';
import { z } from 'zod';

export const semanticSearchTool = createTool({
  id: 'semantic-search',
  description: 'Search tasks by semantic similarity',
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().optional().default(20),
  }),
  execute: async ({ context }) => {
    return await vectorSearch(context.query);
  },
});
```

### Phase 3: Agent Definition
```typescript
import { createAgent, openai } from '@mastra/core';

export const taskOrchestratorAgent = createAgent({
  name: 'Task Orchestrator',
  instructions: 'Prioritize tasks for user outcome...',
  model: openai('gpt-4o'),
  tools: [semanticSearchTool, ...],
  maxSteps: 10,
});
```

### Phase 4: Telemetry Retrieval
```typescript
const trace = await taskOrchestratorAgent.getExecutionTrace(executionId);

// trace.steps contains:
// - step.content (agent's thought)
// - step.toolName (tool called)
// - step.toolInput (parameters)
// - step.toolOutput (result)
// - step.durationMs
```

---

## Next Steps

1. **Install Mastra:** `npm install @mastra/core`
2. **Review all 5 pitches**
3. **Approve/reject/modify based on priorities**
4. **If approved, start with Phase 1** (vector storage)
5. **Ship each phase independently** as a vertical slice
6. **Phase 5 can be developed in parallel** with Phases 1-4 (no Mastra dependency)

---

## Questions?

- **Why Mastra?** Production-ready framework saves 1-2 weeks of development time
- **Can we skip phases?** No. Each phase depends on the previous.
- **Can we extend timelines?** No. If a phase doesn't fit in 1 week, we cut scope or defer features.
- **What if Phase 3 runs over?** Ship Phases 1-2 first. Phase 4 becomes Phase 5.
- **Can we switch from Mastra later?** Yes. Mastra is open-source and well-architected. You own the code.

---

---

### Phase 10: Task Intelligence (Gap & Quality Detection)
**Appetite:** 6 weeks

**Problem:** Agent accepts whatever tasks exist without questioning if they're well-defined or comprehensive

**Solution:** AI-powered gap detection + task quality evaluation + auto-generated draft tasks

**Components:**
- Goal-task coverage analyzer (semantic distance detection)
- Task quality evaluator (clarity, specificity, granularity)
- Gap-filling draft generator (suggest missing tasks)
- Self-questioning protocol (agent validates plan quality)
- Quality badges + gap detection modal UI

**Key unlock:** System proactively identifies missing steps and vague tasks before work begins

**Features:**
- ✅ Goal coverage score (detect missing conceptual areas)
- ✅ Task quality scoring (clarity, measurability, verb strength)
- ✅ Auto-generated draft tasks to fill gaps
- ✅ Quality suggestions ("Split 'Improve UX' into 2 measurable tasks")
- ✅ Pre-flight check in agent reasoning
- ❌ No automatic task editing (suggestions only)

**Time Investment:** 6 weeks (foundational agentic reasoning)

[Read Full Pitch →](./phase-10-task-intelligence.md)

---

### Phase 11: Strategic Prioritization (Impact-Effort Model)
**Appetite:** 6 weeks

**Problem:** Tasks ranked by semantic similarity, ignoring business impact, effort, and risk

**Solution:** Multi-dimensional scoring (Impact × Effort × Confidence) + strategic sorting + 2×2 quadrant visualization

**Components:**
- Strategic scoring service (Impact 0-10, Effort hours, Confidence 0-1)
- Priority calculation: `Priority = E[Impact] / E[Effort] × Confidence`
- Multiple sorting strategies (Balanced, Quick Wins, Strategic Bets, Urgent)
- Impact/Effort 2×2 quadrant visualization
- Score transparency ("Why this score?" modal)
- Manual override system

**Key unlock:** Business-aware prioritization that trades off impact, effort, and risk

**Features:**
- ✅ Impact/Effort/Confidence scoring for every task
- ✅ Quick wins filter (high impact, low effort)
- ✅ Strategic bets view (high impact, high effort)
- ✅ Interactive quadrant visualization
- ✅ Transparent score breakdowns
- ❌ No historical outcome tracking (Phase 13)

**Time Investment:** 6 weeks (strategic reasoning layer)

[Read Full Pitch →](./phase-11-strategic-prioritization.md)

---

### Phase 12: Goal Harmony (Conflict Detection & Resolution)
**Appetite:** 6 weeks

**Problem:** Multiple goals work at cross-purposes without user awareness

**Solution:** Multi-goal conflict detection + resource overlap analysis + trade-off visualization + resolution workflows

**Components:**
- Conflict detector (semantic + heuristic rules)
- Resource overlap analyzer (capacity conflicts)
- Trade-off analysis engine (impact simulation)
- Goal relationship graph (D3.js)
- 4 resolution workflows (Prioritize, Merge, Defer, Adjust)
- Combined priority plan (cross-goal balancing)

**Key unlock:** Users understand how goals interact and avoid wasting effort on conflicting work

**Features:**
- ✅ Detect conflicting goals ("Increase conversions" vs. "Reduce CAC")
- ✅ Resource overlap warnings (designer needs 90h, only 40h available)
- ✅ Trade-off analysis (what you gain/lose by choosing Goal A over B)
- ✅ Visual goal relationship graph
- ✅ Synergy detection (tasks that help multiple goals)
- ❌ No multi-user collaboration features

**Time Investment:** 6 weeks (multi-goal reasoning)

[Read Full Pitch →](./phase-12-goal-harmony.md)

---

### Phase 13: Path Explorer (Alternative Strategy Simulation)
**Appetite:** 6 weeks

**Problem:** Users see one plan and can't explore alternative approaches or risk profiles

**Solution:** Multi-path strategy generation (Safe/Balanced/Aggressive) + Monte Carlo simulation + what-if mode + scenario comparison

**Components:**
- Path generation engine (3 alternative strategies)
- Monte Carlo simulator (10k iterations, Bayesian risk modeling)
- Path comparison dashboard (timeline, risk, impact, cost)
- Decision tree visualization
- Interactive what-if mode (adjust risk/timeline/budget)
- Scenario customization + export (PDF, CSV)

**Key unlock:** Strategic planning with multiple options, clear trade-offs, and risk transparency

**Features:**
- ✅ 3 generated paths: Safe Bet (15% risk), Balanced (35% risk), Moonshot (60% risk)
- ✅ Monte Carlo simulation (success probability, expected value)
- ✅ Interactive comparison (radar charts, decision trees)
- ✅ What-if sliders (regenerate paths with new constraints)
- ✅ Custom path creation (fork and modify)
- ✅ Shareable scenario URLs + PDF export
- ❌ No real-time collaboration
- ❌ No historical outcome tracking (future phase)

**Time Investment:** 6 weeks (advanced scenario planning)

[Read Full Pitch →](./phase-13-path-explorer.md)

---

## Total Timeline: 33-34 Weeks (Phases 1-13)

Each phase is:
- **Independently shippable** (can ship Phase 10 without Phase 11)
- **Fixed scope** (rabbit holes explicitly cut)
- **Time-boxed** (6 week appetite, no extensions)

**Phases 1-9:** Foundation + Core Features (21-22 weeks)
**Phases 10-13:** Agentic Intelligence (24 weeks)

**Overall Capability Progression:**
1. **Phases 1-4:** Basic agent runtime + tools
2. **Phases 5-9:** Cloud sync + context awareness + user control
3. **Phases 10-11:** Task intelligence + strategic prioritization
4. **Phases 12-13:** Multi-goal harmony + alternative path exploration

---

### Phase 14: Outcome-Driven Prioritization
**Appetite:** 4 weeks

**Problem:** Prioritization happens without considering user's stated outcome

**Solution:** Deep integration of user outcomes into strategic scoring

[Read Full Pitch →](./phase-14-outcome-driven-prioritization.md)

---

### Phase 15: Reflection Intelligence
**Appetite:** 4 weeks

**Problem:** Reflections are captured but have no immediate effect on priorities

**Solution:** Reflection interpreter + instant adjustment engine + attribution badges

**Key unlock:** Reflections immediately affect task rankings with visible explanations

[Read Full Pitch →](./phase-15-reflection-intelligence.md)

---

### Phase 16: Document-Aware Prioritization
**Appetite:** 2 weeks

**Problem:** Users can't see which documents are in prioritization or control what gets included

**Solution:** Document visibility + pending count badge + outcome prominence + include/exclude toggles

**Components:**
- Document status API showing included/excluded/pending counts
- "(3 new)" badge on recalculate button
- Enhanced outcome display (prominent styling)
- Source documents list with checkbox toggles
- localStorage-based document exclusions

**Key unlock:** Users know exactly what will change before clicking recalculate

**Features:**
- ✅ Pending document count on CTA
- ✅ Visually prominent outcome display
- ✅ Source document list with task counts
- ✅ Quick toggles to exclude documents
- ❌ No per-task exclusion (document-level only)
- ❌ No persistent exclusions (localStorage only for v1)

**Time Investment:** 2 weeks (visibility + control)

[Read Full Pitch →](./phase-16-document-aware-prioritization.md)

---

## Total Timeline: 39-40 Weeks (Phases 1-16)

Each phase is:
- **Independently shippable** (can ship Phase 10 without Phase 11)
- **Fixed scope** (rabbit holes explicitly cut)
- **Time-boxed** (appetite fixed, no extensions)

**Phases 1-9:** Foundation + Core Features (21-22 weeks)
**Phases 10-13:** Agentic Intelligence (24 weeks)
**Phases 14-16:** Context Enhancement (10 weeks)

**Overall Capability Progression:**
1. **Phases 1-4:** Basic agent runtime + tools
2. **Phases 5-9:** Cloud sync + context awareness + user control
3. **Phases 10-11:** Task intelligence + strategic prioritization
4. **Phases 12-13:** Multi-goal harmony + alternative path exploration
5. **Phases 14-16:** Outcome integration + reflection intelligence + document awareness

---

**Last Updated:** 2025-11-24
**Status:** Updated with Phase 14-16 (Context Enhancement Suite)
**Framework:** Mastra AI (TypeScript-first, YC-backed)
