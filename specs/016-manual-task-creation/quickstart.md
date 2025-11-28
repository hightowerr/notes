# Quickstart: Manual Task Creation (Phase 18)

**Feature**: 016-manual-task-creation
**Branch**: `016-manual-task-creation`
**Prerequisites**: Node 20+, pnpm, Supabase running locally or remote

## Quick Setup (5 minutes)

### 1. Apply Database Migration

```bash
# From repo root
supabase db push

# Verify migration applied
supabase db diff
# Should show: "No schema changes detected"
```

**What this does**: Creates `manual_tasks` table with indexes and triggers.

### 2. Verify Environment Variables

```bash
# Check .env.local has required keys
grep -E "SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY" .env.local
```

**Required**:
- `SUPABASE_SERVICE_ROLE_KEY`: For admin operations
- `OPENAI_API_KEY`: For embedding generation and agent analysis

### 3. Install Dependencies (if new)

```bash
pnpm install
```

### 4. Start Development Server

```bash
pnpm dev
# → http://localhost:3000
```

## Testing the Feature

### Manual Test Flow

**Test 1: Create Manual Task with Agent Placement**

1. Navigate to `/priorities`
2. Click "+ Add Task" button
3. Enter: "Explore AI SDK or OpenAI Agents SDK for building AI agents"
4. Click Submit
5. **Verify**:
   - Modal closes immediately ✅
   - Task appears with "⏳ Analyzing..." badge ✅
   - After 3-10s, badge updates to "✋ Manual" ✅
   - Task moves to agent-assigned rank ✅

**Test 2: Discard Pile Interaction**

1. Create task: "Create a README file with proper documentation for the capstone project"
2. Wait for analysis
3. **Verify**:
   - Task appears in collapsed Discard Pile section ✅
   - Expand section shows exclusion reason ✅
   - Click "Override" triggers re-analysis ✅

**Test 3: Duplicate Detection**

1. Create task: "Research existing solutions for capstone project"
2. Create similar task: "Research existing tools for capstone project"
3. **Verify**:
   - Second task shows conflict warning ✅
   - Displays similarity score and existing task text ✅

### Automated Tests

```bash
# Contract tests (API validation)
pnpm test:run __tests__/contract/manual-task-placement.test.ts

# Integration tests (Multi-service flows)
pnpm test:run __tests__/integration/manual-task-placement-flow.test.ts

# Unit tests (Service layer)
pnpm test:run lib/services/__tests__/manualTaskPlacement.test.ts
```

## Key Implementation Files

```
app/
├── api/
│   ├── tasks/
│   │   ├── manual/
│   │   │   └── [id]/
│   │   │       ├── status/
│   │   │       │   └── route.ts          # GET analysis status
│   │   │       ├── override/
│   │   │       │   └── route.ts          # POST re-analyze
│   │   │       └── confirm-discard/
│   │   │           └── route.ts          # POST soft delete
│   │   └── discard-pile/
│   │       └── route.ts                  # GET discarded tasks
│   └── outcomes/
│       └── [id]/
│           └── invalidate-manual-tasks/
│               └── route.ts              # POST goal change handler
├── priorities/
│   └── components/
│       ├── DiscardPileSection.tsx        # Collapsible discard UI
│       ├── ManualTaskBadge.tsx           # Status indicator
│       └── TaskRow.tsx                   # Enhanced with badges
└── components/
    └── ManualTaskModal.tsx               # Existing from Phase 9

lib/
├── services/
│   ├── manualTaskPlacement.ts            # Agent placement logic
│   └── manualTaskService.ts              # Existing from Phase 9
├── schemas/
│   └── manualTaskPlacementSchemas.ts     # Zod validation
└── mastra/
    └── agents/
        └── prioritizationGenerator.ts    # Extended for manual tasks
```

## Development Workflow (TDD)

### Example: Implement Agent Placement

**Step 1: Write Failing Test**
```typescript
// __tests__/contract/manual-task-placement.test.ts
describe('POST /api/tasks/manual/:id/status', () => {
  it('returns analyzing status immediately after creation', async () => {
    const task = await createManualTask({ task_text: 'Test task' });

    const response = await fetch(`/api/tasks/manual/${task.task_id}/status`);
    const data = await response.json();

    expect(data.status).toBe('analyzing');
  });
});
```

**Step 2: Implement Route**
```typescript
// app/api/tasks/manual/[id]/status/route.ts
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('manual_tasks')
    .select('status, agent_rank, placement_reason, exclusion_reason')
    .eq('task_id', params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
```

**Step 3: Run Tests**
```bash
pnpm test:run __tests__/contract/manual-task-placement.test.ts
```

**Step 4: Code Review**
```bash
# Automatically triggered by slice-orchestrator after tests pass
```

## Common Issues & Fixes

### Issue: "Manual tasks not getting analyzed"

**Symptom**: Tasks stuck in "analyzing" state indefinitely

**Diagnosis**:
```bash
# Check agent_sessions table
npx tsx scripts/check-agent-sessions.ts

# Check manual_tasks status distribution
npx tsx -e "
import { getSupabaseAdminClient } from './lib/supabase/admin.js';
const supabase = getSupabaseAdminClient();
const { data } = await supabase.from('manual_tasks').select('status');
console.log('Status counts:', data.reduce((acc, {status}) => {
  acc[status] = (acc[status] || 0) + 1; return acc;
}, {}));
"
```

**Fix**:
- Check `OPENAI_API_KEY` is set and valid
- Verify outcome exists: `SELECT * FROM user_outcomes WHERE completed_at IS NULL`
- Restart dev server to clear stale connections

### Issue: "Duplicate detection too sensitive"

**Symptom**: False positives blocking legitimate tasks

**Fix**:
```typescript
// Adjust threshold in lib/services/manualTaskService.ts
const DUPLICATE_THRESHOLD = 0.9; // Lower from 0.92 to allow more variance
```

### Issue: "Discard pile showing deleted tasks"

**Symptom**: Soft-deleted tasks still visible in UI

**Fix**:
```typescript
// Ensure WHERE deleted_at IS NULL in query
// app/api/tasks/discard-pile/route.ts
const { data } = await supabase
  .from('manual_tasks')
  .select('*')
  .eq('status', 'not_relevant')
  .is('deleted_at', null)  // ← Critical filter
  .order('created_at', { ascending: false });
```

## Performance Verification

### Check Analysis Latency

```bash
# Monitor agent execution times
npx tsx scripts/analyze-agent-performance.ts

# Expected output:
# P50: 4.2s
# P95: 8.7s ← Must be <10s (SC-012)
# P99: 12.1s
```

### Check Database Query Performance

```sql
-- Analyze manual_tasks queries
EXPLAIN ANALYZE
SELECT * FROM manual_tasks
WHERE status = 'not_relevant' AND deleted_at IS NULL;

-- Should use idx_manual_tasks_status
-- Execution time: <50ms for 100+ rows
```

## Debugging Tools

### View Manual Task State

```bash
# Interactive REPL
npx tsx

> import { getSupabaseAdminClient } from './lib/supabase/admin.js';
> const supabase = getSupabaseAdminClient();
> const { data } = await supabase.from('manual_tasks').select('*');
> console.table(data);
```

### Trigger Manual Re-analysis

```bash
# Force re-analyze a specific task
curl -X POST http://localhost:3000/api/tasks/manual/TASK_ID/override \
  -H "Content-Type: application/json" \
  -d '{"user_justification": "Testing re-analysis"}'
```

## Next Steps

1. **Run all tests**: `pnpm test:run`
2. **Check coverage**: `pnpm test:run --coverage`
3. **Review implementation**: Use `code-reviewer` agent
4. **Manual QA**: Follow test flow above
5. **Deploy**: Merge to main after PR approval

## Resources

- **Spec**: `specs/016-manual-task-creation/spec.md`
- **Plan**: `specs/016-manual-task-creation/plan.md`
- **Tasks**: `specs/016-manual-task-creation/tasks.md` (generate with `/tasks`)
- **API Docs**: `specs/016-manual-task-creation/contracts/manual-task-placement-api.yaml`
- **Constitution**: `.specify/memory/constitution.md` (Vertical slice principles)
