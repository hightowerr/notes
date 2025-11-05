# API Contracts: Context-Aware Action Extraction

## Overview

This directory contains API contract specifications for context-aware filtering.

## Contracts

### 1. PATCH /api/outcomes
**Purpose**: Extend existing outcome API to accept state and capacity

**Changes to existing endpoint**:
- **Request Body** (new optional fields):
  - `state_preference`: "Energized" | "Low energy"
  - `daily_capacity_hours`: number (0.5-24)

- **Response** (includes new fields):
  - Returns updated outcome with `state_preference` and `daily_capacity_hours`

- **Validation**:
  - State must be one of two allowed values (400 if invalid)
  - Capacity must be 0.25-24 (400 if out of range)

**Example Request**:
```json
{
  "direction": "increase",
  "object_text": "monthly revenue",
  "metric_text": "25% in 6 months",
  "clarifier": "enterprise acquisition",
  "state_preference": "Low energy",
  "daily_capacity_hours": 2.0
}
```

**Example Response (200)**:
```json
{
  "id": "uuid",
  "assembled_text": "Increase the monthly revenue by 25% in 6 months through enterprise acquisition",
  "state_preference": "Low energy",
  "daily_capacity_hours": 2.0,
  "is_active": true,
  "created_at": "2025-10-16T..."
}
```

---

### 2. POST /api/process (Behavioral Change)
**Purpose**: Process documents with outcome-aware filtering

**No API signature changes** (internal behavior modification):
- Fetches active outcome (if exists) before AI processing
- Passes outcome context to AI summarizer
- Applies filtering to actions before storage

**Response changes** (extended structured_output):
- Actions array includes new fields per action:
  - `estimated_hours`: number
  - `effort_level`: "high" | "low"
  - `relevance_score`: number (0-1)

- New response field:
  - `filtering_applied`: boolean
  - `actions_filtered_count`: number

**Example Response**:
```json
{
  "structured_output": {
    "topics": ["Sales", "Revenue"],
    "decisions": [...],
    "actions": [
      {
        "text": "Follow up with enterprise leads",
        "category": "leverage",
        "estimated_hours": 1.5,
        "effort_level": "low",
        "relevance_score": 0.95
      }
    ]
  },
  "filtering_applied": true,
  "actions_filtered_count": 12
}
```

---

### 3. FilteringService API (Internal Module)
**Purpose**: Multi-criteria filtering algorithm

**Function Signature**:
```typescript
filterActions(
  actions: Action[],
  context: {
    goal: string,
    state: "Energized" | "Low energy" | null,
    capacity_hours: number | null
  }
): {
  included: Action[],
  excluded: Array<Action & { exclusion_reason: string }>,
  decision: FilteringDecision
}
```

**Logic**:
1. Compute relevance scores (cosine similarity vs goal)
2. Filter actions where `relevance_score < 0.90`
3. Sort by (state preference, relevance DESC)
4. Apply capacity constraint (cumulative hours ≤ capacity)
5. Return included (3-5 actions) + excluded (with reasons)

**FilteringDecision Schema** (stored in DB):
```typescript
{
  context: {
    goal: string,
    state: string | null,
    capacity_hours: number | null,
    threshold: 0.90
  },
  included: Action[],
  excluded: Array<Action & { reason: string }>,
  total_actions_extracted: number,
  filtering_duration_ms: number
}
```

---

## Testing Requirements

Each contract must have:
1. **Contract test** (validates schema, not implementation)
2. **Integration test** (validates end-to-end behavior)
3. **Edge case tests** (invalid inputs, boundary conditions)

See `plan.md` Phase 1 section for complete test specifications.

---

## Implementation Notes

- All endpoints maintain backward compatibility (new fields nullable)
- Filtering only applies when outcome exists (outcome.is_active = true)
- If no outcome: behavior identical to existing system
- Zod schemas enforce validation at API boundaries
