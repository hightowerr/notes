# Research: Manual Task Control & Discard Approval

**Feature**: 013-docs-shape-pitches
**Date**: 2025-01-08

## Technical Decisions

### 1. Database Schema Approach

**Decision**: Extend `task_embeddings` table with `is_manual` and `created_by` columns

**Rationale**:
- Minimal schema changes (2 columns vs new table)
- Preserves existing task embeddings architecture
- Manual tasks integrate seamlessly into existing prioritization flow
- No migration complexity for existing task relationships

**Alternatives Considered**:
- **Separate `manual_tasks` table**: Rejected because it would require duplicating the entire task prioritization logic and relationship management. Would introduce complexity in queries joining AI and manual tasks.
- **JSONB metadata column**: Rejected because schema-based columns provide better query performance and simpler indexing for filtering manual tasks.

### 2. Manual Task Document Reference

**Decision**: Create special document per user: `manual-tasks-{userId}`

**Rationale**:
- Prevents orphaned manual tasks (document reference always valid)
- Atomic creation with first manual task ensures reference exists
- Follows existing document-centric architecture
- Simple to query and filter tasks by source

**Alternatives Considered**:
- **NULL document_id for manual tasks**: Rejected because existing foreign key constraints require valid document references, and changing this would impact all existing queries.
- **Single shared "manual-tasks" document**: Rejected for future multi-user support - each user needs isolated task space.

### 3. Duplicate Detection Strategy

**Decision**: Semantic similarity using existing embedding infrastructure (>0.9 threshold)

**Rationale**:
- Reuses existing `searchSimilarTasks()` from `lib/services/vectorStorage.ts`
- Catches semantic duplicates ("Email legal" vs "Send email to legal department")
- No new infrastructure required
- Threshold 0.9 balances precision (few false positives) with recall (catches obvious duplicates)

**Alternatives Considered**:
- **Exact text matching**: Rejected because users often rephrase similar tasks slightly differently
- **Fuzzy string matching (Levenshtein)**: Rejected because it misses semantic similarity (e.g., "Call John" vs "Phone John Smith")

### 4. Re-Prioritization Trigger Mechanism

**Decision**: Debounced client-side trigger with 500ms delay

**Rationale**:
- Prevents re-prioritization loops from rapid edits
- Matches existing reflection toggle debounce pattern (500ms)
- Client-side control gives user immediate feedback
- Existing `/api/agent/prioritize` endpoint handles the actual work

**Alternatives Considered**:
- **Server-side automatic trigger**: Rejected because it removes user control and could cause unexpected re-prioritization during active editing
- **Manual "Re-prioritize" button**: Rejected because it violates "Autonomous by Default" principle - system should integrate changes automatically

### 5. Discard Approval UI Pattern

**Decision**: Blocking modal with opt-out default (all tasks checked for discard)

**Rationale**:
- Prevents accidental data loss (user must explicitly approve)
- Opt-out model reduces friction (users can quickly approve all)
- Blocking modal ensures decision is made before proceeding
- Matches existing modal patterns (GapDetectionModal, TextInputModal)

**Alternatives Considered**:
- **Toast notifications with undo**: Rejected because tasks could be permanently lost if user misses notification
- **Opt-in model (uncheck all by default)**: Rejected because it creates fatigue - users would need to check many boxes for routine discards

### 6. Edit State Management

**Decision**: Local component state with debounced save (500ms)

**Rationale**:
- Immediate UI feedback (optimistic update)
- Debounce prevents API spam during typing
- Matches TextInputModal draft save pattern
- Simple error recovery (revert on API failure)

**Alternatives Considered**:
- **Controlled form with react-hook-form**: Rejected as overkill for single-field inline editing
- **Immediate API call on blur**: Rejected because rapid focus changes would cause excessive API calls

### 7. Embedding Regeneration Optimization

**Decision**: Cache embeddings for 5 minutes, regenerate only if text differs >10%

**Rationale**:
- Reduces OpenAI API costs for minor edits (typo fixes)
- 10% threshold catches significant content changes
- 5-minute cache balances freshness with cost savings
- Levenshtein distance calculation is fast client-side

**Alternatives Considered**:
- **Always regenerate**: Rejected due to high API costs ($0.0001 per request adds up with frequent edits)
- **Never regenerate**: Rejected because substantial edits need new embeddings for accurate duplicate detection

## Best Practices Research

### Next.js 15 Patterns

**API Routes**:
- Use `NextRequest` and `NextResponse` types
- Zod schema validation at route entry
- Error handling with structured responses
- Service role Supabase client for admin operations

**Server Components**:
- Keep data fetching in server components
- Pass serializable data to client components
- Use `'use client'` directive for interactive features

**Reference**: Existing patterns in `app/api/tasks/metadata/route.ts`, `app/api/gaps/accept/route.ts`

### Supabase @supabase/ssr Pattern

**Client Architecture** (migrated 2025-11-07):
```typescript
// Browser: lib/supabase/client.ts
// Server: lib/supabase/server.ts (RLS-respecting)
// Admin: lib/supabase/admin.ts (service_role for webhooks/admin ops)
```

**Key Principles**:
- Use `server.ts` for API routes requiring RLS
- Use `admin.ts` only for system operations (webhooks, cleanup)
- Never expose service role key to client

**Reference**: `lib/supabase/` directory, `CLAUDE.md` lines 122-127

### React Hook Form + Zod

**Integration Pattern**:
```typescript
const form = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: {...}
});
```

**Common Pitfall**: `getValues()` timing - defer with `setTimeout(() => { const values = form.getValues(); }, 0);`

**Reference**: `CLAUDE.md` lines 917-943, existing modals

### Inline Editing UX

**Best Practice**: contentEditable with controlled fallback

**Implementation**:
1. Display mode: Show text with pencil icon on hover
2. Edit mode: Switch to controlled input, auto-focus, select all
3. Save: Debounce blur/Enter, show spinner
4. Error: Revert to original, show toast

**Reference**: Common pattern in task management UIs, Notion-style editing

## Performance Considerations

### Embedding Generation

**Current Service**: OpenAI text-embedding-3-small (1536 dimensions)
**Cost**: $0.00002 per 1K tokens
**Latency**: ~200-500ms per call

**Optimization Strategy**:
- Generate embedding on manual task creation (required for duplicate detection)
- Cache for 5 minutes on edits
- Batch if multiple tasks created rapidly

### Re-Prioritization Performance

**Current Target**: <10 seconds (P95) from manual task creation to prioritized position
**Breakdown**:
- Task creation API: <500ms
- Embedding generation: <500ms
- Trigger prioritization: <100ms
- Agent prioritization: 5-8 seconds
- UI update: <200ms

**Bottleneck**: Agent runtime (Mastra + GPT-4o)
**Acceptable**: Fits within 10-second budget

### Discard Modal Rendering

**Scale Consideration**: Support up to 50 tasks efficiently
**Implementation**:
- Virtual scrolling NOT needed (50 items renders fast)
- Simple array map with key prop
- Checkbox state in Map for O(1) lookup

## Integration Points

### Existing Services to Reuse

1. **`lib/services/embeddingService.ts`**:
   - `generateEmbedding(text: string): Promise<number[]>`
   - Reuse for manual task embedding generation

2. **`lib/services/vectorStorage.ts`**:
   - `searchSimilarTasks(embedding, threshold, limit)`
   - Reuse for duplicate detection

3. **`lib/services/taskInsertionService.ts`**:
   - Update to handle manual task document references
   - Extend `ensureTasksExist()` to accept manual task document IDs

4. **`app/api/agent/prioritize/route.ts`**:
   - No changes needed
   - Already handles re-prioritization trigger

### New Services to Create

1. **`lib/services/manualTaskService.ts`**:
   - `createManualTask(params)` - Create + embed + duplicate check
   - `updateTask(params)` - Update + conditional re-embed
   - `getOrCreateManualDocument(userId)` - Ensure document exists

2. **API Routes**:
   - `app/api/tasks/manual/route.ts` - POST handler
   - `app/api/tasks/[id]/route.ts` - PATCH handler

## Dependencies Confirmed

**Required from previous phases**:
- ✅ Phase 1: Vector storage (`lib/services/embeddingService.ts`, `lib/services/vectorStorage.ts`)
- ✅ Phase 3: Mastra agent runtime (`lib/mastra/`)
- ✅ Phase 4: Task list UI (`app/priorities/components/TaskList.tsx`)
- ✅ Phase 7: Reflection-driven prioritization (active reflections in prioritization)

**Existing infrastructure**:
- ✅ `task_embeddings` table with pgvector
- ✅ `/api/agent/prioritize` endpoint
- ✅ Modal component patterns (Dialog from shadcn/ui)

## Risk Mitigation Strategies

### 1. Re-Prioritization Loops

**Risk**: Edit triggers re-priority → plan changes → discard modal → user edits another task → loop

**Mitigation**:
- 500ms debounce on re-prioritization trigger
- Lock all editing when `sessionStatus === 'running'`
- Clear indication in UI: "Prioritization in progress..."
- Discard modal only appears AFTER prioritization completes

### 2. Orphaned Manual Tasks

**Risk**: Manual task document deleted → foreign key violation

**Mitigation**:
- Create document atomically with first manual task
- ON DELETE CASCADE constraint (if document deleted, tasks go too)
- Prevent deletion of manual-tasks documents in cleanup logic

### 3. Embedding Cost Explosion

**Risk**: Every character typed triggers $0.0001 API call

**Mitigation**:
- 500ms debounce on edit save
- 5-minute embedding cache
- 10% text difference threshold before regeneration
- Estimated cost: <$0.10/month for active user

### 4. Discard Modal Fatigue

**Risk**: Users annoyed by constant approval prompts

**Mitigation**:
- Default all tasks to "approve discard" (opt-out)
- "Approve All" button for quick confirmation
- "Cancel All" to skip discarding entirely
- Future enhancement: "Auto-approve for 24h" preference

## Schema Changes Required

### Migration 024

```sql
-- Add manual task tracking
ALTER TABLE task_embeddings
  ADD COLUMN is_manual BOOLEAN DEFAULT FALSE,
  ADD COLUMN created_by TEXT DEFAULT 'default-user';

-- Index for manual task queries
CREATE INDEX idx_task_embeddings_manual
  ON task_embeddings(is_manual, created_by)
  WHERE is_manual = TRUE;

-- Ensure existing tasks are marked as AI-generated
UPDATE task_embeddings SET is_manual = FALSE WHERE is_manual IS NULL;
```

## Unknowns Resolved

All NEEDS CLARIFICATION items from Technical Context are now resolved:
- ✅ Language/Version: TypeScript 5, Next.js 15.5.4, React 19
- ✅ Dependencies: Existing stack (Supabase, OpenAI, Zod, Mastra)
- ✅ Storage: PostgreSQL (Supabase) with existing schema extensions
- ✅ Testing: Vitest (existing test infrastructure)
- ✅ Performance: <10s manual task → prioritized (feasible)
- ✅ Scale: 10-50 manual tasks per user (existing infra supports)

## Next Steps

Proceed to Phase 1:
1. Generate data model for manual tasks and discard candidates
2. Create API contracts for `/api/tasks/manual` and `/api/tasks/[id]`
3. Write failing contract tests
4. Extract quickstart test scenarios from spec
5. Update CLAUDE.md with new service context
