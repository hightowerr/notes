# Data Model: Reflection Intelligence

**Feature Branch**: `015-reflection-intelligence`
**Last Updated**: 2025-11-23

## Overview

This document defines the data model changes required to support reflection intelligence - the ability to interpret, act on, and explain reflection effects on task prioritization.

## New Tables

### `reflection_intents`

Stores the interpreted intent of each reflection. Created when a reflection is added, recomputed only when reflection text changes.

```sql
CREATE TABLE reflection_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id UUID NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('constraint', 'opportunity', 'capacity', 'sequencing', 'information')),
  subtype TEXT NOT NULL CHECK (subtype IN ('blocker', 'soft-block', 'boost', 'energy-level', 'dependency', 'context-only')),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  strength TEXT NOT NULL CHECK (strength IN ('hard', 'soft')) DEFAULT 'soft',
  duration JSONB,  -- { until?: string, from?: string, days?: number }
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_reflection_intent UNIQUE (reflection_id)
);

-- Index for quick lookup by reflection
CREATE INDEX idx_reflection_intents_reflection_id ON reflection_intents(reflection_id);

-- RLS Policy
ALTER TABLE reflection_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own reflection intents"
ON reflection_intents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM reflections
    WHERE reflections.id = reflection_intents.reflection_id
    AND (auth.uid()::text = reflections.user_id OR reflections.user_id = 'anonymous-user-p0')
  )
);
```

### Schema Types

```typescript
// lib/schemas/reflectionIntent.ts

import { z } from 'zod';

export const reflectionIntentTypeSchema = z.enum([
  'constraint',    // Blocks or limits tasks
  'opportunity',   // Boosts focus area tasks
  'capacity',      // Affects effort thresholds
  'sequencing',    // Defines task ordering
  'information'    // Context only, no direct action
]);

export const reflectionIntentSubtypeSchema = z.enum([
  'blocker',       // Hard constraint - tasks cannot proceed
  'soft-block',    // Soft constraint - tasks deprioritized
  'boost',         // Opportunity - tasks prioritized
  'energy-level',  // Capacity - affects effort tolerance
  'dependency',    // Sequencing - affects task order
  'context-only'   // Information - no action
]);

export const reflectionIntentStrengthSchema = z.enum(['hard', 'soft']);

export const reflectionIntentDurationSchema = z.object({
  until: z.string().datetime().optional(),
  from: z.string().datetime().optional(),
  days: z.number().positive().optional()
}).optional();

export const reflectionIntentSchema = z.object({
  id: z.string().uuid(),
  reflection_id: z.string().uuid(),
  type: reflectionIntentTypeSchema,
  subtype: reflectionIntentSubtypeSchema,
  keywords: z.array(z.string()),
  strength: reflectionIntentStrengthSchema,
  duration: reflectionIntentDurationSchema,
  summary: z.string().min(1).max(500),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type ReflectionIntentType = z.infer<typeof reflectionIntentTypeSchema>;
export type ReflectionIntentSubtype = z.infer<typeof reflectionIntentSubtypeSchema>;
export type ReflectionIntentStrength = z.infer<typeof reflectionIntentStrengthSchema>;
export type ReflectionIntentDuration = z.infer<typeof reflectionIntentDurationSchema>;
export type ReflectionIntent = z.infer<typeof reflectionIntentSchema>;
```

## Modified Tables

### `reflections` (Existing)

No schema changes required. Existing columns sufficient:
- `id`: UUID primary key
- `user_id`: TEXT (user identifier)
- `text`: TEXT (10-500 chars)
- `created_at`: TIMESTAMPTZ
- `is_active_for_prioritization`: BOOLEAN (default true)

### `task_embeddings` (Existing)

Add optional reflection effect tracking:

```sql
ALTER TABLE task_embeddings
  ADD COLUMN IF NOT EXISTS reflection_effects JSONB;
```

**`reflection_effects` structure**:
```typescript
type ReflectionEffect = {
  reflection_id: string;
  effect: 'blocked' | 'demoted' | 'boosted' | 'unchanged';
  magnitude: number;  // Position change or score adjustment
  reason: string;     // Plain language explanation
};

// Column stores array: ReflectionEffect[]
```

## Data Flow

### Intent Classification Flow

```
User adds reflection
    ↓
POST /api/reflections
    ↓
reflectionService.createReflection()
    ↓
reflectionInterpreter.interpretReflection()  [NEW]
    ↓
Store in reflection_intents table
    ↓
reflectionAdjuster.applyReflectionEffect()  [NEW]
    ↓
Update task_embeddings.reflection_effects
    ↓
Return to UI with intent preview
```

### Toggle Flow (Fast Path)

```
User toggles reflection
    ↓
PATCH /api/reflections/[id]
    ↓
Read cached intent from reflection_intents
    ↓
reflectionAdjuster.toggleReflectionEffect()  [NEW]
    ↓
Update task_embeddings.reflection_effects
    ↓
Return within 500ms
```

## Entity Relationships

```
┌─────────────────┐     ┌─────────────────────┐
│   reflections   │───<│  reflection_intents │
│                 │  1:1│                     │
│ id              │     │ reflection_id (FK)  │
│ user_id         │     │ type                │
│ text            │     │ subtype             │
│ created_at      │     │ keywords[]          │
│ is_active_...   │     │ strength            │
└─────────────────┘     │ duration            │
                        │ summary             │
                        └─────────────────────┘
                               │
                               │ affects
                               ↓
                    ┌─────────────────────┐
                    │   task_embeddings   │
                    │                     │
                    │ task_id             │
                    │ task_text           │
                    │ reflection_effects  │←── NEW
                    │   (JSONB array)     │
                    └─────────────────────┘
```

## Intent Classification Schema (GPT-4o-mini)

Input prompt template:
```
Classify this reflection into one of the following categories:

Reflection: "{reflection_text}"

Categories:
1. constraint/blocker - Hard block (e.g., "Legal blocked outreach")
2. constraint/soft-block - Soft limitation (e.g., "Prefer to avoid meetings")
3. opportunity/boost - Focus area (e.g., "Priority is analytics")
4. capacity/energy-level - Energy/time signal (e.g., "Low energy today")
5. sequencing/dependency - Order constraint (e.g., "Do X before Y")
6. information/context-only - FYI only (e.g., "FYI: project updated")

Return JSON:
{
  "type": "constraint|opportunity|capacity|sequencing|information",
  "subtype": "blocker|soft-block|boost|energy-level|dependency|context-only",
  "keywords": ["relevant", "task", "keywords"],
  "strength": "hard|soft",
  "duration": { "until": "ISO date if mentioned" } | null,
  "summary": "Plain language interpretation"
}
```

## Migration Script

```sql
-- Migration: 027_add_reflection_intents.sql

-- Create reflection_intents table
CREATE TABLE IF NOT EXISTS reflection_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id UUID NOT NULL REFERENCES reflections(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('constraint', 'opportunity', 'capacity', 'sequencing', 'information')),
  subtype TEXT NOT NULL CHECK (subtype IN ('blocker', 'soft-block', 'boost', 'energy-level', 'dependency', 'context-only')),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  strength TEXT NOT NULL CHECK (strength IN ('hard', 'soft')) DEFAULT 'soft',
  duration JSONB,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_reflection_intent UNIQUE (reflection_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reflection_intents_reflection_id
  ON reflection_intents(reflection_id);

-- RLS
ALTER TABLE reflection_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own reflection intents" ON reflection_intents;
CREATE POLICY "Users can read own reflection intents"
ON reflection_intents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM reflections
    WHERE reflections.id = reflection_intents.reflection_id
    AND (auth.uid()::text = reflections.user_id OR reflections.user_id = 'anonymous-user-p0')
  )
);

DROP POLICY IF EXISTS "Users can insert own reflection intents" ON reflection_intents;
CREATE POLICY "Users can insert own reflection intents"
ON reflection_intents FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM reflections
    WHERE reflections.id = reflection_intents.reflection_id
    AND (auth.uid()::text = reflections.user_id OR reflections.user_id = 'anonymous-user-p0')
  )
);

-- Add reflection_effects to task_embeddings
ALTER TABLE task_embeddings
  ADD COLUMN IF NOT EXISTS reflection_effects JSONB;

-- Comment
COMMENT ON TABLE reflection_intents IS
'Stores AI-interpreted intent for each reflection. Used for fast adjustment without re-running LLM.';
```

## Validation Rules

### ReflectionIntent

| Field | Rule |
|-------|------|
| reflection_id | Must reference existing reflection |
| type | Must be valid enum value |
| subtype | Must match type (constraint→blocker/soft-block, etc.) |
| keywords | Array of 0-10 strings, each max 50 chars |
| strength | Default 'soft', 'hard' for blockers |
| duration | Optional, valid ISO dates if present |
| summary | 1-500 characters |

### ReflectionEffect

| Field | Rule |
|-------|------|
| reflection_id | Must reference active reflection |
| effect | One of: blocked, demoted, boosted, unchanged |
| magnitude | -10 to +10 (position change) |
| reason | 1-200 characters |

## Performance Considerations

1. **Intent Caching**: Store intent in `reflection_intents` to avoid re-classification
2. **Effect Indexing**: `reflection_effects` JSONB indexed with GIN if needed
3. **Batch Updates**: Update multiple task effects in single transaction
4. **Lazy Computation**: Only compute effects for visible tasks initially
