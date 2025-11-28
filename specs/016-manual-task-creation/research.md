# Research: Manual Task Creation

**Feature**: 016-manual-task-creation
**Date**: 2025-01-26

## Existing Infrastructure Analysis

### Phase 9 Foundation (013-docs-shape-pitches)

Phase 9 delivered the foundational manual task infrastructure that Phase 18 builds upon:

**Database Layer**:
- Migration 024 added `is_manual` and `created_by` columns to `task_embeddings`
- Partial index `idx_task_embeddings_manual` for efficient manual task queries
- Manual tasks stored in same table as AI-extracted tasks for unified prioritization

**Service Layer**:
- `lib/services/manualTaskService.ts`: Core CRUD operations
  - `createManualTask()`: Creates manual task with duplicate detection
  - `updateTask()`: Edits task description with permission checks
  - `ensureManualDocument()`: Auto-creates special container document per user
  - Duplicate detection using embedding similarity (>0.9 threshold)
  - Embedding cache (5min TTL) to reduce API costs on edits

**API Layer**:
- `app/api/tasks/manual/route.ts`: POST endpoint for manual task creation
- `app/api/tasks/[id]/route.ts`: PATCH endpoint for task editing
- Zod validation via `manualTaskSchemas.ts`
- Duplicate detection returns structured error with existing task details

**UI Components**:
- `app/components/ManualTaskModal.tsx`: Modal for manual task input
- `app/priorities/components/DiscardReviewModal.tsx`: Approval flow for task removals
- Draft auto-save to localStorage (500ms debounce)

### What Phase 18 Needs to Add

Phase 18 (this feature) focuses on **agent-driven placement and discard pile management** - the missing pieces from Phase 9:

1. **Agent Integration**: Send manual tasks to prioritization agent for placement analysis
2. **Discard Pile UI**: Collapsible section showing "not relevant" tasks
3. **Override Capability**: Re-analyze discarded tasks if user disagrees
4. **Goal Change Handler**: Auto-invalidate manual tasks when outcome changes
5. **Reprioritization Integration**: 1.2x priority boost for manual tasks
6. **Visual Badges**: "⏳ Analyzing..." → "✋ Manual" state indicators

### Architecture Patterns

**Mastra Agent Integration**:
```typescript
// lib/mastra/agents/prioritizationGenerator.ts
// Existing agent already handles task filtering and ordering
// Phase 18 extends to support manual task placement decisions
```

**Optimistic UI Pattern**:
```typescript
// Phase 9 pattern for manual task creation:
// 1. Add task to UI with temp ID immediately
// 2. Call API in background
// 3. Replace temp ID with real ID on success
// 4. Roll back on error
```

**Supabase Client Strategy**:
- `lib/supabase/client.ts`: Browser (Client Components)
- `lib/supabase/server.ts`: Server with cookies (API routes)
- `lib/supabase/admin.ts`: Admin with service_role (webhooks only)

## Technical Constraints

**Performance Targets** (from spec):
- Manual task analysis: <10s at P95
- Duplicate detection: <1s
- Embedding generation: Depends on OpenAI API (<3s typical)

**Scale Assumptions**:
- 10-50 manual tasks per user (reasonable)
- 1000+ total tasks in system (existing capability)
- Manual tasks represent 5-10% of total task volume

**Dependencies**:
- OpenAI text-embedding-3-small (1536-dim vectors)
- Supabase pgvector with IVFFlat index
- Mastra agent runtime (operational)
- `/api/agent/prioritize` endpoint (Phase 11)

## Data Flow Patterns

### Manual Task Creation (Phase 9 - Already Built)
```
User Input → POST /api/tasks/manual
  ↓ Validate (Zod)
  ↓ Generate embedding (OpenAI)
  ↓ Check duplicates (cosine similarity >0.9)
  ↓ Create manual document if needed
  ↓ Insert task_embeddings row (is_manual=true)
  ↓ Return task_id
```

### Agent Placement (Phase 18 - NEW)
```
Manual Task Created → Check for active outcome
  ↓ If outcome exists:
  ↓   Send task to prioritization agent
  ↓   Agent analyzes: relevant vs not_relevant
  ↓   If relevant: Assign rank, placement reason
  ↓   If not relevant: Exclusion reason, move to discard pile
  ↓ If no outcome: Skip analysis, hold in "pending" state
```

### Discard Pile UI (Phase 18 - NEW)
```
Not Relevant Task → Add to Discard Pile
  ↓ Display in collapsible section (default collapsed)
  ↓ Show exclusion reason
  ↓ Actions:
  ↓   [Override] → Re-analyze with agent
  ↓   [Confirm Discard] → Soft delete (30-day recovery)
```

## Risk Analysis

### Identified Risks from Spec

1. **Agent always rejects manual tasks** (>50% rejection rate)
   - Phase 18 mitigation: 1.2x priority boost
   - Monitor rejection rate via telemetry
   - Adjust agent prompt if needed

2. **Duplicate task proliferation**
   - Phase 9 mitigation: Duplicate detection at >0.9 similarity
   - Phase 18 enhancement: Show conflict warning with similar task
   - User can force-create if false positive

3. **Goal change wipes critical tasks**
   - Phase 18 mitigation: Toast warning before invalidation
   - Bulk override capability in discard pile
   - 30-day soft delete recovery window

4. **Embedding service unavailability**
   - Phase 9 mitigation: Error message "Service unavailable"
   - Phase 18 enhancement: Queue tasks for retry when service returns
   - Graceful degradation: Show task without analysis

## UI/UX Patterns

**Existing Patterns to Follow**:
- Collapsible sections: `app/priorities/components/BlockedTasksSection.tsx`
- Badge components: `app/components/QualityBadge.tsx`
- Modal workflows: `app/components/ManualTaskModal.tsx`
- Toast notifications: Existing toast system in `app/priorities/page.tsx`

**Design System** (from `.claude/standards.md`):
- No borders: Use `--bg-layer-1` through `--bg-layer-4`
- Two-layer shadows: `.shadow-2layer-sm/md/lg`
- Accent color for manual badge: `--primary-3`
- WCAG AA compliance: 4.5:1 minimum contrast

## Implementation Strategy

### Vertical Slice Approach

Each task MUST deliver SEE → DO → VERIFY:

**Example Slice**: Agent Placement for Manual Tasks
- **SEE**: User submits manual task, sees "⏳ Analyzing..." badge
- **DO**: Agent analyzes task, determines placement
- **VERIFY**: Badge updates to "✋ Manual", task appears at correct rank

### Testing Strategy

**Contract Tests** (API validation):
- POST /api/tasks/manual/[id]/analyze
- GET /api/tasks/discard-pile
- POST /api/tasks/[id]/override

**Integration Tests** (Multi-service flows):
- Manual task creation → agent placement → UI update
- Discard pile → override → re-analysis
- Goal change → invalidation → discard pile

**Manual Tests** (Complex UI flows):
- Optimistic UI updates during analysis
- Error recovery when agent fails
- Concurrent edits in multiple tabs

## Related Features

**Dependencies** (Must be operational):
- Phase 3: Mastra agent runtime ✅
- Phase 11: Strategic prioritization ✅
- Phase 14: Outcome-driven filtering ✅
- Phase 9: Manual task CRUD ✅

**Integration Points**:
- Task Intelligence (Phase 14): Gap detection, bridging tasks
- Reflection Intelligence (Phase 15): Reflection-driven adjustments
- Document-Aware Prioritization (Phase 16): Baseline context tracking

## Next Steps

1. Design data model for discard pile state
2. Define API contracts for agent placement
3. Create quickstart guide for development
4. Generate vertical slice tasks in dependency order
