# Data Model: Manual Task Control & Discard Approval

**Feature**: 013-docs-shape-pitches
**Date**: 2025-01-08

## Entity Overview

This feature extends the existing `task_embeddings` table and introduces two new runtime entities for UI state management.

## Database Entities

### Extended: task_embeddings

**Purpose**: Stores both AI-extracted and manually created tasks with embeddings

**New Columns**:
```
is_manual: BOOLEAN DEFAULT FALSE
  - Distinguishes manually created tasks from AI-extracted ones
  - Indexed for efficient filtering
  - Used to display [MANUAL] badge in UI

created_by: TEXT DEFAULT 'default-user'
  - Tracks task creator for ownership and permissions
  - Future multi-user support
  - Used in permissions check (manual tasks: creator-only edit; AI tasks: anyone)
```

**Existing Columns** (unchanged):
```
id: UUID PRIMARY KEY
task_id: TEXT NOT NULL UNIQUE
task_text: TEXT NOT NULL
document_id: UUID NOT NULL REFERENCES processed_documents(id)
embedding: vector(1536) NOT NULL
status: TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('completed', 'pending', 'failed'))
error_message: TEXT
created_at: TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at: TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Key Relationships**:
- `document_id` → `processed_documents.id` (ON DELETE CASCADE)
  - Manual tasks reference special document: `manual-tasks-{userId}`
  - AI tasks reference original uploaded document

**Indexes**:
- Existing: `idx_task_embeddings_vector` (IVFFlat for similarity search)
- Existing: `idx_task_embeddings_document_id`
- **NEW**: `idx_task_embeddings_manual (is_manual, created_by WHERE is_manual = TRUE)`
  - Partial index for efficient manual task queries
  - Covers: "Show all my manual tasks" query

### Extended: processed_documents

**Purpose**: Stores document metadata (including special manual task documents)

**Relevant Columns**:
```
id: UUID PRIMARY KEY
file_name: TEXT NOT NULL
  - For manual tasks: 'manual-tasks-{userId}'
  - For uploads: original filename
  - For Drive: Drive filename

source: TEXT CHECK (source IN ('upload', 'drive', 'text_input', 'manual'))
  - NEW value: 'manual' for user-created task containers

created_at: TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

**Manual Task Document Pattern**:
```
{
  id: UUID,
  file_name: 'manual-tasks-default-user',
  source: 'manual',
  created_at: [timestamp when first manual task created]
}
```

## Runtime Entities (UI State)

### ManualTask (Client-side)

**Purpose**: Represents user input for creating a manual task

**Type Definition**:
```typescript
type ManualTaskInput = {
  task_text: string;        // 10-500 chars (required)
  estimated_hours?: number; // 8-160 range (optional, default 40)
  outcome_id?: string;      // If provided, triggers re-prioritization
};
```

**Validation Rules**:
- `task_text`: Min 10 chars, max 500 chars, trimmed
- `estimated_hours`: Integer between 8-160 if provided, defaults to 40
- `outcome_id`: Valid UUID if provided, optional

**Lifecycle**:
1. User enters text in ManualTaskModal
2. Draft auto-saved to localStorage every 500ms
3. On submit: Validated → sent to `/api/tasks/manual`
4. On success: Draft cleared, modal closed, task appears in list

### DiscardCandidate (Client-side)

**Purpose**: Represents a task proposed for removal during re-prioritization

**Type Definition**:
```typescript
type DiscardCandidate = {
  taskId: string;           // Unique task identifier
  title: string;            // Display name
  reason: string;           // Why agent suggests removal
  previousRank: number;     // Position before re-prioritization
  isManual: boolean;        // Was this user-created?
  approved: boolean;        // User's approval decision (default: true)
};
```

**State Management**:
```typescript
// Component state in TaskList.tsx
const [discardCandidates, setDiscardCandidates] = useState<DiscardCandidate[]>([]);
const [showDiscardReview, setShowDiscardReview] = useState(false);
```

**Lifecycle**:
1. Re-prioritization completes with new task plan
2. Detect tasks missing from new plan (no longer in `ordered_task_ids`)
3. Map each to DiscardCandidate with reason from `removed_tasks` array
4. Show DiscardReviewModal
5. User approves/rejects each
6. Only approved tasks get `status: 'discarded'`

### TaskEditState (Client-side)

**Purpose**: Manages inline editing state for a single task

**Type Definition**:
```typescript
type EditMode = 'idle' | 'editing' | 'saving' | 'error';

type TaskEditState = {
  mode: EditMode;
  originalText: string;     // For revert on error
  draftText: string;        // Current edited value
  errorMessage?: string;    // If save failed
};
```

**State Transitions**:
```
idle → editing:  User clicks pencil icon
editing → saving: Blur or Enter pressed (after 500ms debounce)
saving → idle:   Save succeeds
saving → error:  Save fails
error → idle:    User dismisses error or tries again
```

## Data Flow Diagrams

### Manual Task Creation Flow

```
User Input (ManualTaskModal)
  ↓ [task_text, estimated_hours]
POST /api/tasks/manual
  ↓ Validate input (Zod)
  ↓ Generate embedding (OpenAI)
  ↓ Check duplicates (semantic search >0.9)
  ↓ Get/create manual document
  ↓ Insert task_embeddings row (is_manual=true)
  ↓ Return task_id
UI Update
  ↓ Add task to local state (optimistic)
  ↓ Trigger re-prioritization if outcome_id exists
  ↓ Poll for prioritization completion
  ↓ Update task position when complete
```

### Task Edit Flow

```
User Action (TaskRow click pencil)
  ↓ Enter edit mode
  ↓ User types new text
  ↓ Blur or Enter (debounced 500ms)
PATCH /api/tasks/{id}
  ↓ Load existing task
  ↓ Verify permission (manual: creator only; AI: anyone)
  ↓ If text changed >10%: regenerate embedding
  ↓ Update task_embeddings row
  ↓ Return updated task
UI Update
  ↓ Exit edit mode
  ↓ Show success indicator (1s)
  ↓ Trigger re-prioritization if outcome_id exists
```

### Discard Approval Flow

```
Re-prioritization Complete
  ↓ New plan: ordered_task_ids = [A, B, C]
  ↓ Previous plan: [A, B, D, E]
  ↓ Detect removals: [D, E]
Map to DiscardCandidates
  ↓ Load task metadata (titles)
  ↓ Load removal reasons from agent result
  ↓ Set approved = true (default)
Show DiscardReviewModal
  ↓ User toggles approved for each task
  ↓ Click "Apply Changes"
Process Approvals
  ↓ approved=[D] → status='discarded'
  ↓ rejected=[E] → keep status='active'
Update UI
  ↓ Close modal
  ↓ Move discarded tasks to Discarded section
  ↓ Keep rejected tasks in Active Priorities
```

## Validation Rules

### Manual Task Input

**Server-side (Zod)**:
```typescript
const manualTaskSchema = z.object({
  task_text: z.string().min(10).max(500).trim(),
  estimated_hours: z.number().int().min(8).max(160).optional().default(40),
  outcome_id: z.string().uuid().optional(),
});
```

**Client-side (React Hook Form)**:
```typescript
const form = useForm<ManualTaskInput>({
  resolver: zodResolver(manualTaskSchema),
  defaultValues: {
    task_text: '',
    estimated_hours: 40,
  },
});
```

### Task Edit Input

**Server-side**:
```typescript
const taskEditSchema = z.object({
  task_text: z.string().min(10).max(500).trim().optional(),
  estimated_hours: z.number().int().min(8).max(160).optional(),
}).refine(
  (data) => data.task_text !== undefined || data.estimated_hours !== undefined,
  { message: 'At least one field must be provided' }
);
```

## Performance Considerations

### Query Patterns

**Fetch manual tasks**:
```sql
SELECT * FROM task_embeddings
WHERE is_manual = TRUE AND created_by = 'default-user'
ORDER BY created_at DESC;
```
- Uses partial index `idx_task_embeddings_manual`
- Expected rows: 10-50 per user
- Latency: <50ms

**Semantic duplicate check**:
```sql
SELECT task_id, task_text, embedding <=> $1::vector AS similarity
FROM task_embeddings
WHERE status = 'completed'
ORDER BY embedding <=> $1::vector
LIMIT 3;
```
- Uses IVFFlat index `idx_task_embeddings_vector`
- Cosine distance operator `<=>`
- Expected latency: <500ms for 1000+ tasks

### Embedding Cache Strategy

**Cache Key**: `{task_id}:{text_hash}`
**TTL**: 5 minutes
**Implementation**:
```typescript
const embeddingCache = new Map<string, { embedding: number[]; expires: number }>();

function getCachedEmbedding(taskId: string, text: string): number[] | null {
  const key = `${taskId}:${hashText(text)}`;
  const cached = embeddingCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.embedding;
  }
  return null;
}
```

## Migration Strategy

### Database Migration (024)

```sql
-- Step 1: Add columns with defaults
ALTER TABLE task_embeddings
  ADD COLUMN is_manual BOOLEAN DEFAULT FALSE,
  ADD COLUMN created_by TEXT DEFAULT 'default-user';

-- Step 2: Backfill existing rows (all AI-generated)
UPDATE task_embeddings SET is_manual = FALSE WHERE is_manual IS NULL;

-- Step 3: Create partial index
CREATE INDEX CONCURRENTLY idx_task_embeddings_manual
  ON task_embeddings(is_manual, created_by)
  WHERE is_manual = TRUE;

-- Step 4: Add NOT NULL constraints after backfill
ALTER TABLE task_embeddings ALTER COLUMN is_manual SET NOT NULL;
ALTER TABLE task_embeddings ALTER COLUMN created_by SET NOT NULL;
```

**Rollback**:
```sql
DROP INDEX IF EXISTS idx_task_embeddings_manual;
ALTER TABLE task_embeddings DROP COLUMN IF EXISTS is_manual;
ALTER TABLE task_embeddings DROP COLUMN IF EXISTS created_by;
```

## State Management Patterns

### Optimistic UI Updates

**Manual Task Creation**:
```typescript
// 1. Add task to local state immediately
setTasks(prev => [...prev, { id: tempId, text, status: 'prioritizing' }]);

// 2. Call API
const { task_id } = await createManualTask({ task_text: text });

// 3. Replace temp with real
setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: task_id } : t));

// 4. On error: Remove temp task
setTasks(prev => prev.filter(t => t.id !== tempId));
```

### Error Recovery

**Edit Failure**:
```typescript
const [editState, setEditState] = useState<TaskEditState>({
  mode: 'idle',
  originalText: task.text,
  draftText: task.text,
});

async function handleSave() {
  setEditState(prev => ({ ...prev, mode: 'saving' }));
  try {
    await updateTask(task.id, { task_text: editState.draftText });
    setEditState(prev => ({ ...prev, mode: 'idle', originalText: prev.draftText }));
  } catch (error) {
    setEditState(prev => ({
      ...prev,
      mode: 'error',
      draftText: prev.originalText, // Revert
      errorMessage: error.message,
    }));
  }
}
```

## Related Entities

**Existing tables/entities this feature integrates with**:

1. **`processed_documents`**: Manual task container documents
2. **`task_relationships`**: Manual tasks participate in dependency graph
3. **`agent_sessions`**: Re-prioritization includes manual tasks
4. **`task_embeddings`**: Core storage, extended with new columns
5. **`user_outcomes`**: Determines if re-prioritization should trigger

**No changes required** to existing entities - manual tasks integrate seamlessly through foreign keys and shared interfaces.
