# Implementation Plan: Manual Task Creation (Phase 18)

**Branch**: `016-manual-task-creation` | **Date**: 2025-01-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-manual-task-creation/spec.md`

## Summary

**Primary Requirement**: Enable users to create manual tasks that don't exist in documents, with AI agent automatically determining placement in priority list or discard pile.

**Technical Approach**: Extend Phase 9's manual task infrastructure by adding `manual_tasks` table for agent placement analysis, implementing polling-based status updates for optimistic UI, and creating discard pile UI for "not relevant" tasks with override capability.

**Key Innovation**: Agent-driven placement eliminates manual priority ranking burden while maintaining user control through override mechanism.

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js 15, React 19
**Primary Dependencies**:
- Mastra (agent runtime)
- OpenAI GPT-4o (prioritization agent)
- OpenAI text-embedding-3-small (duplicate detection)
- Supabase (PostgreSQL + pgvector)
- Zod (schema validation)

**Storage**:
- PostgreSQL 15+ (Supabase)
- pgvector extension (IVFFlat index for similarity search)
- New table: `manual_tasks` (agent placement metadata)
- Existing table: `task_embeddings` (core task storage from Phase 9)

**Testing**:
- Vitest (unit + integration tests)
- Contract tests (API endpoint validation)
- Manual QA guides (complex UI flows)

**Target Platform**: Web (Next.js 15 on Vercel)

**Project Type**: Web application (Next.js full-stack)

**Performance Goals**:
- Manual task analysis: <10s at P95 (SC-012)
- Duplicate detection: <1s (SC-013)
- API response times: <200ms p95 (standard)

**Constraints**:
- OpenAI API rate limits (3500 RPM for GPT-4o)
- pgvector similarity search: <500ms p95
- Optimistic UI: <100ms perceived latency

**Scale/Scope**:
- 10-50 manual tasks per user (reasonable)
- 1000+ total tasks in system (existing capability)
- 100-500 concurrent users (current deployment)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with `.specify/memory/constitution.md`:

- [x] **Vertical Slice**: Feature delivers SEE → DO → VERIFY for users (Principle I)
  - SEE: User clicks "+ Add Task", modal opens
  - DO: User enters task, submits, sees "Analyzing..." badge
  - VERIFY: Badge updates to "Manual", task appears at agent-assigned rank

- [x] **Test-First**: Tests written before implementation, coverage target ≥80% (Principle II)
  - Contract tests: All API endpoints validated
  - Integration tests: End-to-end flows (creation → analysis → placement)
  - Unit tests: Service layer functions

- [x] **Autonomous Architecture**: Fits Sense → Reason → Act → Learn pattern if agent-related (Principle III)
  - Sense: Manual task creation event
  - Reason: Agent evaluates relevance to outcome
  - Act: Place in priority list OR discard pile
  - Learn: Track rejection rate, adjust prompt if >50%

- [x] **Modular Services**: New services decoupled, single-purpose, clear interfaces (Principle IV)
  - `manualTaskPlacement.ts`: Agent placement logic (new)
  - `manualTaskService.ts`: CRUD operations (existing from Phase 9)
  - Clear separation: placement ≠ creation

- [x] **Observable**: Telemetry planned for new operations (Principle V)
  - Agent execution traces in `agent_sessions` table
  - Analysis latency metrics (P50/P95/P99)
  - Rejection rate tracking for quality monitoring

- [x] **Quality Standards**: TypeScript strict mode, Zod validation, security review
  - Zod schemas for all API inputs
  - TypeScript strict mode enabled
  - Row-level security for `manual_tasks` table

- [x] **Completion Criteria**: All 6 checkpoints (UI, backend, feedback, tests, review, demo-ready)
  - UI: Modal + discard pile + badges ✅
  - Backend: API routes + agent integration ✅
  - Feedback: Status polling + toast notifications ✅
  - Tests: Contract + integration + unit ✅
  - Review: Code reviewer agent ✅
  - Demo: Non-technical person can test end-to-end ✅

## Project Structure

### Documentation (this feature)

```text
specs/016-manual-task-creation/
├── plan.md                                   # This file
├── research.md                               # Phase 0: Codebase analysis
├── data-model.md                             # Phase 1: Database schema
├── quickstart.md                             # Phase 1: Dev setup guide
├── contracts/
│   ├── manual-task-placement-api.yaml        # OpenAPI spec
│   └── database-migration.sql                # Migration 029
└── tasks.md                                  # Phase 2: Vertical slice tasks (via /tasks command)
```

### Source Code (Next.js full-stack)

```text
app/
├── api/
│   ├── tasks/
│   │   ├── manual/
│   │   │   └── [id]/
│   │   │       ├── status/
│   │   │       │   └── route.ts          # GET: Poll analysis status
│   │   │       ├── override/
│   │   │       │   └── route.ts          # POST: Re-analyze discarded task
│   │   │       └── confirm-discard/
│   │   │           └── route.ts          # POST: Soft delete
│   │   └── discard-pile/
│   │       └── route.ts                  # GET: Fetch all discarded tasks
│   └── outcomes/
│       └── [id]/
│           └── invalidate-manual-tasks/
│               └── route.ts              # POST: Goal change handler
├── priorities/
│   ├── page.tsx                          # Main priorities view (existing)
│   └── components/
│       ├── DiscardPileSection.tsx        # NEW: Collapsible discard UI
│       ├── ManualTaskBadge.tsx           # NEW: Status indicator component
│       └── TaskRow.tsx                   # EXTEND: Add badge support
└── components/
    └── ManualTaskModal.tsx               # EXISTING: From Phase 9

lib/
├── services/
│   ├── manualTaskPlacement.ts            # NEW: Agent placement logic
│   ├── manualTaskService.ts              # EXISTING: Phase 9 CRUD ops
│   └── embeddingService.ts               # EXISTING: OpenAI embeddings
├── schemas/
│   ├── manualTaskPlacementSchemas.ts     # NEW: Zod validation
│   └── manualTaskSchemas.ts              # EXISTING: Phase 9 schemas
├── mastra/
│   └── agents/
│       └── prioritizationGenerator.ts    # EXTEND: Support manual tasks
└── supabase/
    ├── client.ts                         # Browser client
    ├── server.ts                         # Server client (cookies)
    └── admin.ts                          # Admin client (service_role)

__tests__/
├── contract/
│   └── manual-task-placement.test.ts     # NEW: API endpoint tests
├── integration/
│   ├── manual-task-placement-flow.test.ts # NEW: End-to-end flow
│   └── goal-change-invalidation.test.ts  # NEW: Outcome change test
└── unit/
    └── manualTaskPlacement.test.ts       # NEW: Service layer tests

supabase/
└── migrations/
    └── 029_create_manual_tasks.sql       # NEW: Database schema
```

**Structure Decision**: Next.js full-stack monorepo (standard for this project). API routes colocated with UI components. Services in `lib/` for shared logic. Tests organized by type (contract/integration/unit) for clarity.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No violations** - All constitutional principles satisfied. Feature follows established patterns from Phase 9 and Phase 11.

## Technical Architecture

### Database Layer

**New Table**: `manual_tasks`
- Purpose: Store agent placement analysis separate from core task data
- Foreign key to `task_embeddings` (ON DELETE CASCADE)
- Status state machine: `analyzing → prioritized | not_relevant | conflict`
- Indexes: Status (partial), outcome, created_at, deleted_at

**Migration Strategy**: Non-blocking (new table, no existing data)

### Service Layer

**New Services**:
```typescript
// lib/services/manualTaskPlacement.ts
export async function analyzeManualTask(params: {
  taskId: string;
  taskText: string;
  outcomeId: string;
}): Promise<ManualTaskAnalysisResult>;

export async function overrideDiscardDecision(params: {
  taskId: string;
  userJustification?: string;
}): Promise<void>;

export async function invalidateManualTasks(params: {
  outcomeId: string;
}): Promise<{ invalidatedCount: number }>;
```

**Extended Services**:
```typescript
// lib/mastra/agents/prioritizationGenerator.ts
// Extend to handle manual tasks in candidate set
// Apply 1.2x priority boost per spec requirement
```

### API Layer

**New Endpoints**:
- `GET /api/tasks/manual/[id]/status` - Poll analysis status
- `POST /api/tasks/manual/[id]/override` - Re-analyze discarded task
- `POST /api/tasks/manual/[id]/confirm-discard` - Soft delete
- `GET /api/tasks/discard-pile` - Fetch all discarded tasks
- `POST /api/outcomes/[id]/invalidate-manual-tasks` - Goal change handler

**Validation**: Zod schemas for all request bodies, strict TypeScript types.

### UI Layer

**New Components**:
```typescript
// app/priorities/components/DiscardPileSection.tsx
// Collapsible section (default collapsed)
// Shows count badge when collapsed
// Displays tasks with exclusion reasons when expanded
// Actions: Override, Confirm Discard

// app/priorities/components/ManualTaskBadge.tsx
// Dynamic badge based on status:
// - "⏳ Analyzing..." (gray)
// - "✋ Manual" (accent color)
// - "⚠️ Duplicate" (warning color)
// - "❌ Error" (error color)
```

**Extended Components**:
```typescript
// app/priorities/components/TaskRow.tsx
// Add: Badge rendering for manual tasks
// Add: Actions menu for manual tasks (Edit, Delete, Mark Done)
```

### Agent Integration

**Placement Logic**:
1. User submits manual task → `POST /api/tasks/manual`
2. Background job checks for active outcome
3. If outcome exists:
   - Fetch all tasks (document + manual)
   - Include new manual task in candidate set
   - Send to prioritization agent
   - Agent returns binary decision: include (with rank) OR exclude (with reason)
4. Update `manual_tasks` status accordingly
5. Client polls `/api/tasks/manual/[id]/status` until complete

**Priority Boost** (per spec requirement FR-015):
```typescript
// In agent prompt or post-processing:
if (task.is_manual) {
  task.impact_score *= 1.2; // 20% boost
}
```

## Data Flow Diagrams

### Manual Task Creation → Placement

```
[User] clicks "+ Add Task"
  ↓
[ManualTaskModal] opens
  ↓
[User] enters "Email legal about contract"
  ↓
[User] clicks Submit
  ↓
POST /api/tasks/manual
  ↓ [1] Validate input (Zod)
  ↓ [2] Generate embedding (OpenAI)
  ↓ [3] Check duplicates (>0.85 similarity)
  ↓     ├─→ Duplicate → Return 400 conflict
  ↓     └─→ No duplicate → Continue
  ↓ [4] Insert task_embeddings (is_manual=true)
  ↓ [5] Insert manual_tasks (status='analyzing')
  ↓ [6] Return task_id
  ↓
[UI] Optimistic update
  ↓ Add task to list with "⏳ Analyzing..." badge
  ↓
[Background] Agent analysis
  ↓ Check for active outcome
  ↓ If outcome → Send to agent
  ↓ Agent evaluates task
  ↓   ├─→ Relevant → status='prioritized', agent_rank=2
  ↓   └─→ Not relevant → status='not_relevant', exclusion_reason=...
  ↓ Update manual_tasks row
  ↓
[Polling] Client polls every 1s
  ↓ GET /api/tasks/manual/[id]/status
  ↓ Status changes: 'analyzing' → 'prioritized'
  ↓
[UI] Update
  ↓ Badge: "⏳ Analyzing..." → "✋ Manual"
  ↓ Task moves to rank 2 in list
```

### Discard Pile Override

```
[User] views discard pile (collapsed)
  ↓ Clicks "▼ Show 3 discarded tasks"
  ↓
[DiscardPileSection] expands
  ↓ Shows: "Reorganize Notion" - "No impact on outcome"
  ↓
[User] clicks "Override"
  ↓
POST /api/tasks/manual/[id]/override
  ↓ [1] Load manual_tasks row
  ↓ [2] Verify status='not_relevant'
  ↓ [3] Set status='analyzing'
  ↓ [4] Return success
  ↓
[Background] Re-analysis (same as creation flow)
  ↓ Send to agent with optional user_justification
  ↓ Agent re-evaluates
  ↓   ├─→ Now relevant → status='prioritized'
  ↓   └─→ Still not relevant → status='not_relevant' (with note)
  ↓
[UI] Update
  ↓ If prioritized: Remove from discard pile, add to active list
  ↓ If still excluded: Toast "Agent still recommends excluding"
```

## Vertical Slice Breakdown (High-Level)

**Phase 18 will be decomposed into vertical slices via `/tasks` command. Preliminary slice ideas:**

### Slice 1: Database Schema (Foundation)
- **SEE**: Migration applied successfully in Supabase dashboard
- **DO**: Developer runs `supabase db push`
- **VERIFY**: `manual_tasks` table exists with correct columns/indexes

### Slice 2: Agent Placement Service
- **SEE**: Manual task appears with "⏳ Analyzing..." badge
- **DO**: User creates manual task
- **VERIFY**: After 10s, badge updates to "✋ Manual" and task moves to rank

### Slice 3: Discard Pile UI
- **SEE**: Discarded task appears in collapsible section at bottom
- **DO**: User creates task that agent marks "not relevant"
- **VERIFY**: Expand section shows task with exclusion reason

### Slice 4: Override Capability
- **SEE**: Override button in discard pile
- **DO**: User clicks Override on discarded task
- **VERIFY**: Task re-analyzed and moves to active list if re-accepted

### Slice 5: Goal Change Invalidation
- **SEE**: Toast notification "3 manual tasks moved to discard pile"
- **DO**: User changes outcome goal
- **VERIFY**: All manual tasks appear in discard pile for review

### Slice 6: Duplicate Detection UI
- **SEE**: Conflict warning modal with similar task
- **DO**: User creates task >85% similar to existing
- **VERIFY**: Modal shows similarity score and existing task text

**Note**: Actual task breakdown will be generated by `/tasks` command using vertical slice principles.

## Testing Strategy

### Contract Tests (API Validation)
```typescript
// __tests__/contract/manual-task-placement.test.ts
describe('POST /api/tasks/manual/:id/status', () => {
  it('returns analyzing status immediately after creation', async () => { ... });
  it('returns prioritized status after agent analysis', async () => { ... });
  it('returns not_relevant status if agent excludes', async () => { ... });
  it('returns 404 for non-existent task', async () => { ... });
});
```

### Integration Tests (End-to-End Flows)
```typescript
// __tests__/integration/manual-task-placement-flow.test.ts
it('creates manual task → analyzes → places at correct rank', async () => {
  // 1. Create outcome
  // 2. Create manual task
  // 3. Wait for analysis
  // 4. Verify task appears at expected rank
});

it('discard pile → override → re-analysis → placement', async () => {
  // 1. Create task that gets discarded
  // 2. Override discard decision
  // 3. Verify re-analysis completes
  // 4. Check task status
});
```

### Unit Tests (Service Layer)
```typescript
// lib/services/__tests__/manualTaskPlacement.test.ts
describe('analyzeManualTask', () => {
  it('returns prioritized for relevant task', async () => { ... });
  it('returns not_relevant for irrelevant task', async () => { ... });
  it('applies 1.2x priority boost to manual tasks', async () => { ... });
});
```

### Manual QA Checklist
- [ ] Create manual task → See "Analyzing..." badge
- [ ] Wait 10s → Badge updates to "Manual"
- [ ] Create task agent excludes → Appears in discard pile
- [ ] Click Override → Task re-analyzed
- [ ] Change outcome → Manual tasks invalidated with toast
- [ ] Create duplicate task → Conflict warning shown

## Performance Targets

**From Success Criteria (spec.md)**:
- SC-012: Task analysis <10s at P95 ✅
- SC-013: Duplicate detection <1s ✅
- SC-014: No re-prioritization loops (<1% error rate) ✅

**Implementation Strategy**:
- Embedding cache (5min TTL) reduces API calls
- Background job for agent analysis (non-blocking)
- Polling interval: 1s (balance between UX and server load)
- Indexes on `manual_tasks.status` for fast filtering

## Security Considerations

**Row-Level Security**:
```sql
-- Only show user's own manual tasks
CREATE POLICY manual_tasks_select_policy ON manual_tasks
  FOR SELECT USING (created_by = auth.uid());

-- Only user can update their manual tasks
CREATE POLICY manual_tasks_update_policy ON manual_tasks
  FOR UPDATE USING (created_by = auth.uid());
```

**API Validation**:
- All endpoints use Zod schemas
- Task ownership verified before edit/delete
- Rate limiting on manual task creation (future enhancement)

**Data Privacy**:
- Manual task text stored encrypted at rest (Supabase default)
- Embeddings do not leak sensitive information (vector representation)
- 30-day soft delete recovery window

## Deployment Checklist

- [ ] Run migration 029 in production
- [ ] Verify `OPENAI_API_KEY` has sufficient quota
- [ ] Monitor agent execution latency (P95 <10s)
- [ ] Set up alerts for high rejection rate (>50%)
- [ ] Document rollback procedure
- [ ] Schedule daily cleanup job for soft-deleted tasks

## Rollback Strategy

**Database Rollback**:
```sql
-- Rollback migration 029
DROP TRIGGER IF EXISTS trigger_manual_tasks_updated_at ON manual_tasks;
DROP FUNCTION IF EXISTS update_manual_tasks_updated_at();
DROP FUNCTION IF EXISTS cleanup_manual_tasks();
DROP TABLE IF EXISTS manual_tasks CASCADE;
```

**Feature Flag** (future enhancement):
```typescript
// lib/config/featureFlags.ts
export const FEATURE_FLAGS = {
  manualTaskPlacement: process.env.NEXT_PUBLIC_ENABLE_MANUAL_TASK_PLACEMENT === 'true',
};
```

## Progress Tracking

- [x] Phase 0: Research existing codebase patterns (research.md)
- [x] Phase 1: Design data model and contracts (data-model.md, contracts/)
- [x] Phase 1: Create quickstart guide (quickstart.md)
- [ ] Phase 2: Generate vertical slice tasks (via `/tasks` command)
- [ ] Implementation: Execute tasks via `/implement` command

## Next Steps

1. Run `/tasks` to generate vertical slice task breakdown
2. Run `/implement` to execute tasks in TDD workflow
3. Monitor agent analysis latency during development
4. Conduct manual QA using quickstart guide
5. Deploy to staging for user acceptance testing

---

**Plan Status**: ✅ Complete - Ready for `/tasks` phase
**Last Updated**: 2025-01-26
