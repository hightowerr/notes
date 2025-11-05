# Data Model: Reflection Capture

**Feature**: 004-reflection-capture-quick
**Date**: 2025-10-16
**Phase**: Phase 1 - Data Model Design

## Overview

This document defines the database schema, relationships, and data flow for the Reflection Capture feature. The model extends the existing Supabase PostgreSQL schema with a new `reflections` table that stores user context inputs and supports recency-weighted retrieval.

---

## Entity: Reflection

### Schema

```sql
CREATE TABLE reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,  -- Foreign key to auth.users (implicit)
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 10 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite index for efficient sorted queries
CREATE INDEX idx_reflections_user_recent
ON reflections(user_id, created_at DESC);

-- Row Level Security policies
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own reflections"
ON reflections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reflections"
ON reflections FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policies (append-only enforced)
```

### Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, auto-generated | Unique reflection identifier |
| `user_id` | UUID | NOT NULL | References auth.users (Supabase managed) |
| `text` | TEXT | NOT NULL, 10-500 chars | Plain text reflection content |
| `created_at` | TIMESTAMPTZ | NOT NULL, default NOW() | Precise timestamp for weight calculation |

### Validation Rules

**Client-side (TypeScript/Zod)**:
```typescript
import { z } from 'zod';

export const reflectionSchema = z.object({
  text: z.string()
    .min(10, 'Reflection must be at least 10 characters')
    .max(500, 'Reflection must be at most 500 characters')
    .trim()
});

export type ReflectionInput = z.infer<typeof reflectionSchema>;
```

**Server-side (PostgreSQL CHECK)**:
- Character length: 10-500 (enforced by `CHECK (char_length(text) BETWEEN 10 AND 500)`)
- Text trimming: Application layer responsibility (not database constraint)
- No null text: `NOT NULL` constraint

### State Transitions

Reflections are **immutable after creation** (append-only model). No state transitions exist—reflections never change or delete.

**Lifecycle**:
1. **Created**: User submits via POST /api/reflections
2. **Active**: Reflection influences prioritization (weight > 0.10)
3. **Aged**: Reflection still stored but weight approaches zero (30+ days)
4. **(Future) Manual Cleanup**: Operations team may delete via SQL if storage costs become concern

---

## Relationships

### Reflection → User (N:1)

- **Cardinality**: Many reflections belong to one user
- **Foreign Key**: `user_id` references `auth.users.id` (implicit via RLS)
- **Cascade**: On user deletion, reflections should cascade delete (configure via Supabase RLS)
- **Access Pattern**: Fetch user's recent reflections ordered by `created_at DESC LIMIT 5`

### Reflection + Outcome → Priority Scoring (N:1)

- **Conceptual Relationship**: Both reflections (short-term context) and outcomes (long-term goals) influence AI prioritization
- **No Foreign Key**: Loose coupling—reflections and outcomes don't directly reference each other
- **Integration Point**: `lib/services/aiSummarizer.ts` fetches both and combines in AI prompt

```
User (1)
  ├─ Outcomes (N) → Long-term strategic goals
  └─ Reflections (N) → Short-term daily context
       Both feed into → AI Priority Scoring
```

---

## Derived Data: Recency Weight

**Not stored in database**—calculated on-demand during queries.

```typescript
export interface ReflectionWithWeight {
  id: string;
  user_id: string;
  text: string;
  created_at: string; // ISO timestamp
  weight: number;     // Calculated: 0.5^(age_in_days/7)
  relative_time: string; // Calculated: "Just now", "3h ago", "2 days ago"
}
```

**Calculation Formula** (from research.md):
```typescript
function calculateRecencyWeight(createdAt: Date): number {
  const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const weight = Math.pow(0.5, ageInDays / 7);
  return weight < 0.06 ? 0 : weight; // Floor at 30 days
}
```

**Why not store weights?**
- Weights change continuously as time passes (every query has different "now")
- Storing would require background job to update all rows daily
- Calculation is cheap (~10μs per reflection)
- Fits "Observable by Design" principle—no hidden state changes

---

## Query Patterns

### 1. Fetch Recent 5 Reflections (with weights)

**Use Case**: Display in ReflectionList component

```typescript
// lib/services/reflectionService.ts
export async function fetchRecentReflections(userId: string, limit: number = 5) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('reflections')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString()) // Filter aged reflections
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return data.map(r => ({
    ...r,
    weight: calculateRecencyWeight(new Date(r.created_at)),
    relative_time: formatRelativeTime(new Date(r.created_at))
  }));
}
```

**Index Used**: `idx_reflections_user_recent` (user_id, created_at DESC)
**Performance**: O(log N) index scan + O(5) result set

### 2. Insert New Reflection

**Use Case**: POST /api/reflections endpoint

```typescript
// app/api/reflections/route.ts
export async function POST(request: Request) {
  const { text } = reflectionSchema.parse(await request.json());
  const user = await getUser(); // Supabase auth

  const { data, error } = await supabase
    .from('reflections')
    .insert({
      user_id: user.id,
      text: text.trim(),
      created_at: new Date().toISOString() // Explicit for precision
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

**Concurrency**: Append-only model supports simultaneous inserts without conflict (no UPDATE/DELETE operations)

### 3. Fetch for AI Prompt Injection

**Use Case**: Inject reflection context into AI summarization

```typescript
// lib/services/aiSummarizer.ts (modified)
const reflections = await fetchRecentReflections(userId, 5);
const reflectionContext = reflections
  .filter(r => r.weight >= 0.10) // Exclude aged reflections
  .map((r, i) =>
    `${i+1}. "${r.text}" (weight: ${r.weight.toFixed(2)}, ${r.relative_time})`
  )
  .join('\n');

const prompt = `
USER'S OUTCOME: "${outcome.assembled_text}"

RECENT REFLECTIONS (weighted by recency):
${reflectionContext}

Extract actions from this document...
`;
```

---

## Data Volume Projections

**Assumptions** (from spec.md NFR-010):
- 2-5 reflections per active user per week
- Average 30-150 characters per reflection (90 chars avg)
- Single-user P0, 100 users P1 estimate

**Storage Calculations**:
- Per reflection: ~90 bytes text + 36 bytes UUID + 16 bytes user_id + 8 bytes timestamp = ~150 bytes
- Per user per month: 4 reflections/week × 4.3 weeks = 17 reflections × 150 bytes = 2.6 KB
- 100 users over 6 months: 100 × 17 × 6 = 10,200 reflections × 150 bytes = **1.5 MB total**

**Conclusion**: Negligible storage cost. Indefinite retention is viable without cleanup for P0/P1 scale.

---

## Migration Script

**File**: `supabase/migrations/006_create_reflections.sql`

```sql
-- Create reflections table
CREATE TABLE IF NOT EXISTS reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 10 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create composite index for efficient sorted queries
CREATE INDEX IF NOT EXISTS idx_reflections_user_recent
ON reflections(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read own reflections
CREATE POLICY "Users can read own reflections"
ON reflections FOR SELECT
USING (auth.uid() = user_id);

-- RLS Policy: Users can insert own reflections
CREATE POLICY "Users can insert own reflections"
ON reflections FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policies (append-only enforced)

-- Add helpful comment
COMMENT ON TABLE reflections IS
'Stores user context reflections (energy, constraints, blockers) for dynamic priority adjustment. Append-only model - no editing or deleting after creation.';
```

---

## Testing Considerations

### Contract Tests (to be written in Phase 1):
1. **Insert reflection**: Verify 201 status, returned data matches input
2. **Character length validation**: Reject <10 chars, reject >500 chars
3. **Fetch recent reflections**: Verify sorted by created_at DESC, limit 5
4. **Weight calculation**: Verify today=1.0, 7 days=0.5, 30 days=~0
5. **RLS enforcement**: User A cannot read User B's reflections

### Integration Tests:
1. Add reflection → verify appears in list with correct weight
2. Add 3 reflections rapidly → verify debounced recompute
3. Concurrent inserts from multiple devices → verify both succeed

---

## Summary

- ✅ **Table Created**: `reflections` with 4 fields (id, user_id, text, created_at)
- ✅ **Index Optimized**: Composite index (user_id, created_at DESC) for sorted queries
- ✅ **RLS Configured**: Read/insert policies enforced, no update/delete
- ✅ **Append-Only Model**: Immutable reflections, no state transitions
- ✅ **Derived Data**: Recency weights calculated on-demand, not stored
- ✅ **Storage Projection**: 1.5 MB for 100 users over 6 months (negligible cost)

**Phase 1 Data Model Complete**: 2025-10-16
