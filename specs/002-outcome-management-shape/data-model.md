# Data Model: Outcome Management

**Feature**: Outcome Management
**Date**: 2025-10-11
**Status**: Complete

## Overview

This document defines the data structures, validation rules, and state transitions for the Outcome Management feature.

---

## Entity: UserOutcome (Persistent - Supabase)

### Schema

```sql
CREATE TABLE user_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('increase', 'decrease', 'maintain', 'launch', 'ship')),
  object_text TEXT NOT NULL CHECK (LENGTH(object_text) BETWEEN 3 AND 100),
  metric_text TEXT NOT NULL CHECK (LENGTH(metric_text) BETWEEN 3 AND 100),
  clarifier TEXT NOT NULL CHECK (LENGTH(clarifier) BETWEEN 3 AND 150),
  assembled_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Enforce single active outcome per user
CREATE UNIQUE INDEX idx_active_outcome
ON user_outcomes(user_id)
WHERE is_active = true;

-- Index for fast lookups
CREATE INDEX idx_user_outcomes_user_id ON user_outcomes(user_id);
```

### TypeScript Interface

```typescript
export interface UserOutcome {
  id: string;                    // UUID
  user_id: string;                // FK to future users table (currently "default-user")
  direction: OutcomeDirection;    // Enum: 'increase' | 'decrease' | 'maintain' | 'launch' | 'ship'
  object_text: string;            // 3-100 characters
  metric_text: string;            // 3-100 characters
  clarifier: string;              // 3-150 characters
  assembled_text: string;         // Computed, stored for performance
  is_active: boolean;             // Default true, unique per user_id
  created_at: string;             // ISO 8601 timestamp
  updated_at: string;             // ISO 8601 timestamp
}

export type OutcomeDirection = 'increase' | 'decrease' | 'maintain' | 'launch' | 'ship';
```

### Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| `direction` | One of: increase, decrease, maintain, launch, ship | "Invalid direction. Must be one of: increase, decrease, maintain, launch, ship" |
| `object_text` | Length 3-100 chars, non-empty after trim | "Object must be between 3 and 100 characters" |
| `metric_text` | Length 3-100 chars, non-empty after trim | "Metric must be between 3 and 100 characters" |
| `clarifier` | Length 3-150 chars, non-empty after trim | "Clarifier must be between 3 and 150 characters" |
| `is_active` | Only one active outcome per user_id | Database enforces via unique partial index |

### Assembly Logic

The `assembled_text` field is computed using this deterministic formula:

```typescript
function assembleOutcome(outcome: Pick<UserOutcome, 'direction' | 'object_text' | 'metric_text' | 'clarifier'>): string {
  const { direction, object_text, metric_text, clarifier } = outcome;

  // For Launch/Ship: omit "the" article
  if (direction === 'launch' || direction === 'ship') {
    return `${capitalize(direction)} ${object_text} by ${metric_text} through ${clarifier}`.trim();
  }

  // For Increase/Decrease/Maintain: include "the" article
  return `${capitalize(direction)} the ${object_text} by ${metric_text} through ${clarifier}`.trim();
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
```

**Examples**:
- Input: `{ direction: 'increase', object_text: 'monthly recurring revenue', metric_text: '25% within 6 months', clarifier: 'enterprise customer acquisition' }`
- Output: `"Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition"`

- Input: `{ direction: 'launch', object_text: 'beta product to 50 users', metric_text: 'by Q2', clarifier: 'targeted outreach' }`
- Output: `"Launch beta product to 50 users by by Q2 through targeted outreach"` (Note: "by" included in both metric and formula - user responsibility)

### State Transitions

```
┌─────────────┐
│  NOT EXISTS │  (No outcome in DB)
└──────┬──────┘
       │ POST /api/outcomes (first time)
       ▼
┌──────────────┐
│ ACTIVE       │  (is_active = true, unique per user)
│ (Created)    │
└──────┬───────┘
       │
       ├─ Edit + Save → UPDATE (same record)
       │                └─> triggers recompute job
       │
       ├─ POST new outcome → Confirmation dialog
       │                      └─> if confirmed: DEACTIVATE current + CREATE new
       │                          └─> triggers recompute job
       │
       └─ [Future] Delete → DEACTIVATED (is_active = false)
                            └─> NOT IMPLEMENTED in P0
```

### Relationships

**Current (P0)**:
- `user_outcomes.user_id` → hardcoded "default-user" (single-user constraint)

**Future (deferred)**:
- `user_outcomes.user_id` → `users.id` (FK, when multi-user added)
- `processed_documents.outcome_id` → `user_outcomes.id` (optional FK for audit trail)

---

## Entity: OutcomeDraft (Ephemeral - localStorage)

### Schema

```typescript
export interface OutcomeDraft {
  direction: OutcomeDirection | null;  // Null if not selected yet
  object: string;                       // Partial input (0-100 chars)
  metric: string;                       // Partial input (0-100 chars)
  clarifier: string;                    // Partial input (0-150 chars)
  expiresAt: number;                    // Unix timestamp (milliseconds)
}
```

### Storage Key

```typescript
const DRAFT_STORAGE_KEY = 'outcome_draft_v1';
```

### Expiry Logic

```typescript
const EXPIRY_HOURS = 24;

function createDraft(data: Omit<OutcomeDraft, 'expiresAt'>): OutcomeDraft {
  return {
    ...data,
    expiresAt: Date.now() + (EXPIRY_HOURS * 60 * 60 * 1000)
  };
}

function isExpired(draft: OutcomeDraft): boolean {
  return draft.expiresAt < Date.now();
}
```

### Lifecycle

1. **Save**: When user closes modal without saving (if any field has >0 chars)
2. **Load**: When user reopens modal within 24 hours
3. **Clear**: After successful outcome save OR after 24-hour expiry
4. **Expire**: Lazy check on load (no background process)

### Validation

- **No validation on save**: Draft allows partial/invalid data
- **Validation on restore**: Check expiry timestamp, ignore corrupted JSON

---

## Entity: RecomputeJob (Ephemeral - in-memory queue)

### Schema

```typescript
export interface RecomputeJob {
  id: string;                      // UUID
  outcomeId: string;               // FK to user_outcomes.id
  userId: string;                  // User identifier
  actionCount: number;             // Number of actions to recompute
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;               // Unix timestamp
  startedAt?: number;              // Unix timestamp
  completedAt?: number;            // Unix timestamp
  error?: string;                  // Error message if failed
  retryCount: number;              // Current retry attempt (max 3)
}
```

### Queue Behavior

- **Capacity**: In-memory, limited by server RAM (~1000 jobs max)
- **Concurrency**: Max 3 parallel recompute jobs (reuse `processingQueue.ts` pattern)
- **Ordering**: FIFO (first in, first out)
- **Retry**: Exponential backoff (1s, 2s, 4s), max 3 attempts
- **Failure**: After 3 retries, mark as failed, show user toast warning (FR-045)

### State Transitions

```
┌─────────┐
│ PENDING │  (Queued, waiting for worker)
└────┬────┘
     │ Worker available
     ▼
┌─────────┐
│ RUNNING │  (Fetching documents, re-scoring actions)
└────┬────┘
     │
     ├─ Success → ┌───────────┐
     │            │ COMPLETED │
     │            └───────────┘
     │
     └─ Error → Retry (up to 3 times)
                └─ Final failure → ┌────────┐
                                    │ FAILED │ → Toast warning to user
                                    └────────┘
```

---

## Validation Schemas (Zod)

### Outcome Input Schema

```typescript
import { z } from 'zod';

export const outcomeInputSchema = z.object({
  direction: z.enum(['increase', 'decrease', 'maintain', 'launch', 'ship'], {
    errorMap: () => ({ message: 'Invalid direction' })
  }),
  object: z.string()
    .min(3, 'Object must be at least 3 characters')
    .max(100, 'Object must not exceed 100 characters')
    .trim(),
  metric: z.string()
    .min(3, 'Metric must be at least 3 characters')
    .max(100, 'Metric must not exceed 100 characters')
    .trim(),
  clarifier: z.string()
    .min(3, 'Clarifier must be at least 3 characters')
    .max(150, 'Clarifier must not exceed 150 characters')
    .trim()
});

export type OutcomeInput = z.infer<typeof outcomeInputSchema>;
```

### Outcome Response Schema

```typescript
export const outcomeResponseSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(['increase', 'decrease', 'maintain', 'launch', 'ship']),
  object: z.string(),
  metric: z.string(),
  clarifier: z.string(),
  assembled_text: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type OutcomeResponse = z.infer<typeof outcomeResponseSchema>;
```

---

## Database Migration Script

**File**: `supabase/migrations/004_create_user_outcomes.sql`

```sql
-- Create user_outcomes table
CREATE TABLE user_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('increase', 'decrease', 'maintain', 'launch', 'ship')),
  object_text TEXT NOT NULL CHECK (LENGTH(object_text) BETWEEN 3 AND 100),
  metric_text TEXT NOT NULL CHECK (LENGTH(metric_text) BETWEEN 3 AND 100),
  clarifier TEXT NOT NULL CHECK (LENGTH(clarifier) BETWEEN 3 AND 150),
  assembled_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Enforce single active outcome per user (unique partial index)
CREATE UNIQUE INDEX idx_active_outcome
ON user_outcomes(user_id)
WHERE is_active = true;

-- Index for fast lookups by user_id
CREATE INDEX idx_user_outcomes_user_id ON user_outcomes(user_id);

-- Index for created_at sorting
CREATE INDEX idx_user_outcomes_created_at ON user_outcomes(created_at DESC);

-- Enable Row Level Security (RLS) - for future multi-user support
ALTER TABLE user_outcomes ENABLE ROW LEVEL SECURITY;

-- Temporary policy for P0 (single-user, no authentication)
-- REPLACE THIS when adding authentication
CREATE POLICY "Allow all for single user" ON user_outcomes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on UPDATE
CREATE TRIGGER update_user_outcomes_updated_at
BEFORE UPDATE ON user_outcomes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

---

## Summary

**Entities**:
1. **UserOutcome**: Persistent Supabase table, single active per user, deterministic assembly
2. **OutcomeDraft**: Ephemeral localStorage, 24-hour expiry, no validation
3. **RecomputeJob**: Ephemeral queue, max 3 parallel, exponential backoff retry

**Key Constraints**:
- Single active outcome enforced by database unique partial index
- No archiving/versioning (old outcomes replaced, not saved)
- Preview assembly is pure function (no side effects)

**Next Steps**:
- Generate API contracts from these schemas
- Create contract tests based on validation rules
- Implement services using assembly logic
