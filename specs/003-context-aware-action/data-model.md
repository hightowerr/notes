# Data Model: Context-Aware Action Extraction

## Entity: user_outcomes (Extended)

**Existing Fields** (from T008-T011):
- `id`: UUID (PK)
- `user_id`: UUID (FK, future auth)
- `direction`: ENUM('increase', 'decrease', 'maintain', 'launch', 'ship')
- `object_text`: VARCHAR(100)
- `metric_text`: VARCHAR(100)
- `clarifier`: VARCHAR(150)
- `assembled_text`: TEXT
- `is_active`: BOOLEAN
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

**New Fields** (T016):
- `state_preference`: TEXT | NULL
  - **Constraint**: `CHECK (state_preference IN ('Energized', 'Low energy'))`
  - **Purpose**: User's energy/motivation state for effort-based filtering
  - **Nullable**: Yes (backward compat)

- `daily_capacity_hours`: NUMERIC(4,2) | NULL
  - **Constraint**: `CHECK (daily_capacity_hours > 0 AND daily_capacity_hours <= 24)`
  - **Purpose**: User's available time budget per day (in hours)
  - **Range**: 0.25 (15 min) to 24.00 (max)
  - **Nullable**: Yes (backward compat)

**Relationships**:
- One active outcome per user (enforced by `UNIQUE INDEX WHERE is_active = true`)
- Referenced by processing pipeline when extracting/filtering actions

**Indexes**:
- Existing: `idx_user_outcomes_active` on `(user_id, is_active)`
- New: None (state/capacity only filtered when outcome active)

---

## Entity: processed_documents (Extended)

**Existing Fields**:
- `id`: UUID (PK)
- `file_id`: UUID (FK → uploaded_files)
- `structured_output`: JSONB (topics, decisions, actions, lno_tasks)
- `markdown_content`: TEXT
- `confidence_score`: NUMERIC(3,2)
- `created_at`: TIMESTAMP
- `expires_at`: TIMESTAMP

**New Fields** (T018, T020):
- `filtering_decisions`: JSONB | NULL
  - **Structure**: `{ context: {...}, included: [...], excluded: [...] }`
  - **Purpose**: Auditability, "show all" functionality, debugging
  - **Nullable**: Yes (NULL when no outcome or no filtering applied)

**filtering_decisions Schema**:
```json
{
  "context": {
    "goal": "Increase monthly revenue by 20%",
    "state": "Low energy",
    "capacity_hours": 3.0,
    "threshold": 0.90
  },
  "included": [
    {
      "text": "Follow up with enterprise leads",
      "relevance_score": 0.95,
      "estimated_hours": 1.5,
      "effort_level": "low",
      "category": "leverage"
    }
  ],
  "excluded": [
    {
      "text": "Plan team lunch",
      "relevance_score": 0.42,
      "reason": "Below 90% relevance threshold"
    },
    {
      "text": "Redesign marketing site",
      "relevance_score": 0.91,
      "estimated_hours": 6.0,
      "reason": "Exceeds daily capacity (3h)"
    }
  ],
  "total_actions_extracted": 15,
  "filtering_duration_ms": 234
}
```

**Indexes**:
- New: `CREATE INDEX idx_filtering_decisions ON processed_documents USING GIN (filtering_decisions);`
  - **Purpose**: Fast JSON queries for analytics/debugging

---

## Entity: Action (Embedded in structured_output)

**Extended Schema** (in `structured_output.actions` array):

**Existing Fields**:
- `text`: string (action description)
- `category`: 'leverage' | 'neutral' | 'overhead' (LNO framework)

**New Fields** (T017):
- `estimated_hours`: number
  - **Range**: 0.25 to 8.0 (15 min to full day)
  - **Source**: AI estimation during extraction
  - **Format**: Decimal (0.5 = 30 min, 1.5 = 90 min)

- `effort_level`: 'high' | 'low'
  - **Purpose**: State-based prioritization
  - **High**: Requires deep focus, complex problem-solving
  - **Low**: Routine, straightforward, low cognitive load

- `relevance_score`: number
  - **Range**: 0.00 to 1.00 (percentage as decimal)
  - **Source**: Cosine similarity (action embedding vs outcome embedding)
  - **Threshold**: ≥0.90 for inclusion (hard cutoff)

**Example Action Object**:
```json
{
  "text": "Draft Q4 sales forecast with regional breakdowns",
  "category": "leverage",
  "estimated_hours": 2.5,
  "effort_level": "high",
  "relevance_score": 0.93
}
```

---

## State Transitions

### Outcome Lifecycle (Extended)
```
NULL (no outcome)
  ↓ [User creates outcome]
is_active=true, state=NULL, capacity=NULL
  ↓ [User adds state/capacity]
is_active=true, state='Low energy', capacity=2.0
  ↓ [User updates outcome]
Old outcome: is_active=false (deactivated)
New outcome: is_active=true (with new state/capacity)
```

### Document Processing Flow (Extended)
```
1. Upload file → uploaded_files.status='processing'
2. Extract text → noteProcessor.ts
3. Call AI → aiSummarizer.ts
   ├─ Check for active outcome
   ├─ If outcome exists:
   │  ├─ Compute action embeddings
   │  ├─ Score relevance vs outcome
   │  ├─ Estimate time/effort
   │  └─ Apply filtering (FilteringService)
   └─ If no outcome: skip filtering
4. Store results → processed_documents
   ├─ structured_output (actions with scores)
   └─ filtering_decisions (if filtered)
5. Display → SummaryPanel.tsx
   ├─ Show filtered actions (if filtering applied)
   └─ "Show all" button (if filtered)
```

---

## Validation Rules

### user_outcomes.state_preference
- **Required**: No (nullable)
- **Allowed Values**: 'Energized' | 'Low energy'
- **Error**: 400 "Invalid state_preference. Must be 'Energized' or 'Low energy'"

### user_outcomes.daily_capacity_hours
- **Required**: No (nullable)
- **Min**: 0.25 (15 minutes)
- **Max**: 24.00 (full day)
- **Error**: 400 "Capacity must be between 0.25 and 24 hours"

### Action.relevance_score
- **Required**: Yes (when outcome exists)
- **Range**: 0.00 to 1.00
- **Computed**: Cosine similarity of embeddings
- **Never user-editable**

### Action.estimated_hours
- **Required**: Yes (when outcome exists)
- **Range**: 0.25 to 8.0
- **Source**: AI estimation (GPT-4o structured output)
- **Fallback**: 1.0 if AI fails to estimate

### Action.effort_level
- **Required**: Yes (when outcome exists)
- **Allowed Values**: 'high' | 'low'
- **Source**: AI classification based on action complexity
- **Fallback**: 'high' (conservative default)

---

## Database Migration

**File**: `supabase/migrations/005_add_context_fields.sql`

```sql
-- Add state and capacity to user_outcomes
ALTER TABLE user_outcomes
ADD COLUMN state_preference TEXT CHECK (state_preference IN ('Energized', 'Low energy')),
ADD COLUMN daily_capacity_hours NUMERIC(4,2) CHECK (daily_capacity_hours > 0 AND daily_capacity_hours <= 24);

-- Add filtering decisions to processed_documents
ALTER TABLE processed_documents
ADD COLUMN filtering_decisions JSONB;

-- Index for JSON queries
CREATE INDEX idx_filtering_decisions ON processed_documents USING GIN (filtering_decisions);

-- Comments for documentation
COMMENT ON COLUMN user_outcomes.state_preference IS 'User energy state: Energized (prefer high-effort) or Low energy (prefer low-effort)';
COMMENT ON COLUMN user_outcomes.daily_capacity_hours IS 'User daily time budget in hours (0.25-24)';
COMMENT ON COLUMN processed_documents.filtering_decisions IS 'Audit trail of context-aware filtering (NULL if no filtering applied)';
```

**Rollback**:
```sql
DROP INDEX IF EXISTS idx_filtering_decisions;
ALTER TABLE processed_documents DROP COLUMN IF EXISTS filtering_decisions;
ALTER TABLE user_outcomes DROP COLUMN IF EXISTS daily_capacity_hours;
ALTER TABLE user_outcomes DROP COLUMN IF EXISTS state_preference;
```

---

## Performance Considerations

- **Embedding Computation**: O(n) where n = number of actions (typically 10-30)
  - Cache outcome embedding in user_outcomes to avoid recomputation
  - Action embeddings computed once during extraction (not cached)

- **Filtering Algorithm**: O(n log n) for sorting
  - Relevance filter: O(n) scan
  - Sort by (effort, relevance): O(n log n)
  - Capacity constraint: O(n) cumulative sum

- **JSON Storage**: filtering_decisions typically <5KB per document
  - GIN index enables fast `WHERE filtering_decisions @> {...}` queries
  - Minimal storage overhead vs separate table approach

- **Total Overhead**: <2s additional processing time (target)
  - Embedding API calls: ~500ms
  - Cosine similarity: <100ms
  - Filtering algorithm: <50ms
  - Database writes: ~200ms
