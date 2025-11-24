# Implementation Plan: Reflection Intelligence

**Branch**: `015-reflection-intelligence` | **Date**: 2025-11-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-reflection-intelligence/spec.md`

## Summary

Transform reflections from a "dead feature" into actionable intelligence by building a Reflection Intelligence Layer that interprets user intent using GPT-4o-mini (<200ms), immediately applies effects to task prioritization (<3s for new reflections, <500ms for toggles), and provides transparent attribution badges explaining every priority change.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20+
**Primary Dependencies**: Next.js 15, React 19, Vercel AI SDK (OpenAI GPT-4o-mini), Supabase, Mastra
**Storage**: PostgreSQL (Supabase) + pgvector for embeddings
**Testing**: Vitest with contract, integration, and unit test layers
**Target Platform**: Web (Desktop + Mobile responsive)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Intent classification <200ms, toggle adjustment <500ms, new reflection effect <3s
**Constraints**: Minimum 5 active tasks floor (cannot suppress below), single LLM retry with 1s delay
**Scale/Scope**: Single user, ~50 tasks typical, ~5 active reflections

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Vertical Slice**: Feature delivers SEE → DO → VERIFY for users (Principle I)
  - SEE: Attribution badges on tasks, intent preview in panel
  - DO: Add reflection, toggle reflection
  - VERIFY: Tasks move/update within specified time targets
- [x] **Test-First**: Tests written before implementation, coverage target ≥80% (Principle II)
  - Contract tests for new APIs
  - Integration tests for adjustment flow
  - Unit tests for interpreter/adjuster services
- [x] **Autonomous Architecture**: Fits Sense → Reason → Act → Learn pattern if agent-related (Principle III)
  - Sense: Reflection text input
  - Reason: GPT-4o-mini intent classification
  - Act: Apply task adjustments
  - Learn: User feedback via toggle behavior
- [x] **Modular Services**: New services decoupled, single-purpose, clear interfaces (Principle IV)
  - `reflectionInterpreter.ts` - Classification only
  - `reflectionAdjuster.ts` - Effect application only
- [x] **Observable**: Telemetry planned for new operations (Principle V)
  - Minimal: Error logging only per NFR-001
- [x] **Quality Standards**: TypeScript strict mode, Zod validation, security review
- [x] **Completion Criteria**: All 6 checkpoints (UI, backend, feedback, tests, review, demo-ready)

## Project Structure

### Documentation (this feature)

```text
specs/015-reflection-intelligence/
├── plan.md              # This file
├── research.md          # Phase 0 output - codebase analysis
├── data-model.md        # Phase 1 output - schema design
├── quickstart.md        # Phase 1 output - setup guide
├── contracts/           # Phase 1 output - API specifications
│   ├── reflection-interpret-api.yaml
│   ├── reflection-adjust-api.yaml
│   └── database-migration.sql
└── tasks.md             # Phase 2 output - vertical slice tasks
```

### Source Code (repository root)

```text
lib/
├── services/
│   ├── reflectionService.ts          # MODIFY: Export shared utilities
│   ├── reflectionInterpreter.ts      # CREATE: GPT-4o-mini classification
│   ├── reflectionAdjuster.ts         # CREATE: Fast adjustment engine
│   └── reflectionBasedRanking.ts     # DELETE: Deprecated service
├── schemas/
│   ├── reflectionSchema.ts           # MODIFY: Add intent types
│   └── reflectionIntent.ts           # CREATE: Intent schema

app/
├── api/
│   └── reflections/
│       ├── route.ts                  # MODIFY: Call interpreter on POST
│       ├── [id]/route.ts             # MODIFY: Fast toggle path
│       ├── interpret/route.ts        # CREATE: Intent preview endpoint
│       └── adjust/route.ts           # CREATE: Adjustment endpoint
├── priorities/
│   ├── page.tsx                      # MODIFY: Remove duplicates, add triggers
│   └── components/
│       ├── ContextCard.tsx           # MODIFY: Fix duplicate CTAs
│       ├── TaskRow.tsx               # MODIFY: Attribution badges
│       └── ReflectionAttributionBadge.tsx  # CREATE: Badge component
├── components/
│   ├── ReflectionInput.tsx           # MODIFY: Helpful prompts
│   └── ReflectionPanel.tsx           # MODIFY: Intent preview
└── page.tsx                          # MODIFY: Cross-page notification

supabase/
└── migrations/
    └── 027_add_reflection_intents.sql  # CREATE: New table

__tests__/
├── contract/
│   ├── reflection-interpret.test.ts    # CREATE
│   └── reflection-adjust.test.ts       # CREATE
├── integration/
│   └── reflection-intelligence.test.ts # CREATE
└── unit/
    ├── reflectionInterpreter.test.ts   # CREATE
    └── reflectionAdjuster.test.ts      # CREATE
```

**Structure Decision**: Web application structure (Option 2 variant). Frontend in `app/`, backend services in `lib/services/`, API routes in `app/api/`. Tests colocated in `__tests__/` following existing patterns.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Implementation Phases

### Phase 1: Cleanup (Week 1, Estimated 2-3 hours)

**Slice 1: Code Consolidation**
- Delete `lib/services/reflectionBasedRanking.ts` (340 lines, deprecated)
- Remove duplicate utilities from `app/priorities/page.tsx`:
  - `calculateFallbackWeight()` → use `reflectionService.calculateRecencyWeight()`
  - `formatFallbackRelativeTime()` → use `reflectionService.formatRelativeTime()`
  - `normalizeReflection()` → use `reflectionService.enrichReflection()`
- Update imports across codebase
- Run test suite to verify no regressions

**Slice 2: Fix Duplicate CTAs**
- Remove duplicate "Add Current Context" button from ContextCard empty state (line 271-274)
- Keep only the header button (line 205-208)
- Update empty state to use more engaging prompt text
- Visual verification on desktop and mobile

### Phase 2: Intelligence Layer (Week 2, Estimated 6-8 hours)

**Slice 3: Reflection Interpreter Service**
- Create `lib/schemas/reflectionIntent.ts` with Zod schemas
- Create `lib/services/reflectionInterpreter.ts`:
  - `interpretReflection(text: string): Promise<ReflectionIntent>`
  - GPT-4o-mini call with structured output
  - Single retry with 1s delay on failure
  - Fallback to "information/context-only" if all fails
- Create `POST /api/reflections/interpret` endpoint for preview
- Write contract test: `__tests__/contract/reflection-interpret.test.ts`

**Slice 4: Fast Adjustment Engine**
- Create `lib/services/reflectionAdjuster.ts`:
  - `applyReflectionEffects(reflectionIds: string[], taskIds?: string[]): Promise<ReflectionEffect[]>`
  - `toggleReflectionEffect(reflectionId: string, isActive: boolean): Promise<void>`
  - Batch task updates in single transaction
  - Minimum 5-task floor enforcement
- Create `POST /api/reflections/adjust` endpoint
- Update `PATCH /api/reflections/[id]/route.ts` for fast toggle
- Write integration test: `__tests__/integration/reflection-adjustment.test.ts`

### Phase 3: Integration (Week 3, Estimated 4-6 hours)

**Slice 5: Auto-Trigger on Add**
- Update `POST /api/reflections` to call interpreter
- Store intent in `reflection_intents` table
- Call `reflectionAdjuster.applyReflectionEffects()` after save
- Update `app/priorities/page.tsx`:
  - `onReflectionAdded()` callback triggers adjustment
  - Loading state: "Applying your context..."
- Write contract test: `__tests__/contract/reflection-auto-adjust.test.ts`

**Slice 6: Attribution UI**
- Create `app/priorities/components/ReflectionAttributionBadge.tsx`:
  - Badge variants: blocked (red), demoted (amber), boosted (emerald)
  - Tooltip with full explanation
  - Click to highlight source reflection
- Update `TaskRow.tsx` to display attribution badges
- Wire up `reflection_effects` from task data
- Visual verification with multiple reflection types

### Phase 4: Polish (Week 4, Estimated 3-4 hours)

**Slice 7: Helpful Prompts**
- Update `ReflectionInput.tsx`:
  - Placeholder: "What's blocking you? What should we focus on?"
  - Character counter
  - Minimum 3-word validation
- Update `ReflectionPanel.tsx`:
  - Intent preview before saving
  - Show detected type/subtype as badge
  - Allow cancel/edit before confirm
- Add guidance text with examples

**Slice 8: Unified Experience**
- Update `app/page.tsx`:
  - Better `onReflectionAdded()` handling
  - Show "Saved! View effect in Priorities →" toast with link
- Ensure reflection added on Home triggers effect on Priorities
- Cross-page state consistency verification
- End-to-end user journey test

## Dependencies

### External Dependencies
- OpenAI API (GPT-4o-mini) - Already configured via `OPENAI_API_KEY`
- Supabase - Already configured

### Internal Dependencies
- Phase 5 (Context-aware prioritization) - COMPLETE
- Phase 7 (Reflection-driven task coherence) - This implements it
- Embedding service - COMPLETE
- Agent orchestration - COMPLETE

### Task Dependencies
```
Slice 1 (Cleanup) ─────────────────┬──▶ Slice 3 (Interpreter)
                                   │
Slice 2 (Fix CTAs) ────────────────┤
                                   │
Slice 3 (Interpreter) ─────────────┼──▶ Slice 4 (Adjuster)
                                   │
Slice 4 (Adjuster) ────────────────┼──▶ Slice 5 (Auto-Trigger)
                                   │
Slice 5 (Auto-Trigger) ────────────┼──▶ Slice 6 (Attribution UI)
                                   │
Slice 6 (Attribution UI) ──────────┼──▶ Slice 7 (Prompts)
                                   │
Slice 7 (Prompts) ─────────────────┴──▶ Slice 8 (Unified Experience)
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM latency variance | Optimistic UI, background completion, show "Applying..." state |
| Classification errors | Intent preview before save, easy delete + retry |
| Over-blocking | Minimum 5-task floor with warning dialog |
| Conflicting reflections | Priority: hard blocks > soft blocks > boosts |
| Performance regression | Fast path for toggles (no LLM), full path only for new |
| Breaking existing flow | Keep deprecated service until Phase 1 Slice 1 tests pass |

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Reflection add → visible effect | ∞ (manual) | <3 seconds | Console timing logs |
| Toggle adjustment | N/A | <500ms | Network tab |
| Tasks with reflection attribution | 0% | 100% of moved tasks | Visual inspection |
| Duplicate CTA buttons | 2 | 1 | Visual inspection |
| Lines of duplicate code | ~90 | 0 | `grep` verification |
| Deprecated service files | 1 | 0 | File exists check |

## Progress Tracking

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| Phase 0: Research | COMPLETE | 2025-11-23 | 2025-11-23 |
| Phase 1: Data Model & Contracts | COMPLETE | 2025-11-23 | 2025-11-23 |
| Phase 2: Tasks Generation | PENDING | - | - |
| Implementation: Slice 1 | PENDING | - | - |
| Implementation: Slice 2 | PENDING | - | - |
| Implementation: Slice 3 | PENDING | - | - |
| Implementation: Slice 4 | PENDING | - | - |
| Implementation: Slice 5 | PENDING | - | - |
| Implementation: Slice 6 | PENDING | - | - |
| Implementation: Slice 7 | PENDING | - | - |
| Implementation: Slice 8 | PENDING | - | - |

## Artifacts Generated

- [x] `specs/015-reflection-intelligence/research.md` - Phase 0
- [x] `specs/015-reflection-intelligence/data-model.md` - Phase 1
- [x] `specs/015-reflection-intelligence/quickstart.md` - Phase 1
- [x] `specs/015-reflection-intelligence/contracts/reflection-interpret-api.yaml` - Phase 1
- [x] `specs/015-reflection-intelligence/contracts/reflection-adjust-api.yaml` - Phase 1
- [x] `specs/015-reflection-intelligence/contracts/database-migration.sql` - Phase 1
- [ ] `specs/015-reflection-intelligence/tasks.md` - Phase 2 (via `/tasks` command)
