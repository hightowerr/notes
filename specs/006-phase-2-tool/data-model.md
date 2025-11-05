# Data Model: Phase 2 - Tool Registry & Execution

**Feature Branch**: `006-phase-2-tool`
**Created**: 2025-10-18
**Status**: Design Complete

## Overview

This document defines all data entities required for the Mastra-based tool registry and execution system. The system enables AI agents to dynamically query tasks using 5 specialized tools: semantic search, document context retrieval, dependency detection, task graph queries, and similarity-based clustering.

**Key Design Principles:**
- **Stateless Tools**: Tool definitions contain no state, only input/output schemas and execution logic
- **Ephemeral Clustering**: Clusters computed on-demand, never persisted
- **Persistent Relationships**: Task dependencies stored in database for reuse
- **Automatic Telemetry**: Mastra handles execution logging automatically

---

## Primary Entities

### 1. Tool Definition (Mastra-Managed, Code-Only)

**Description**: Represents a specialized query capability registered with Mastra's tool registry. Defined in code using `createTool()` API, not stored in database.

**Attributes:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | string | Required, unique, kebab-case | Tool identifier (e.g., "semantic-search") |
| `description` | string | Required, 50-500 chars | LLM-optimized description for agent selection |
| `inputSchema` | ZodSchema | Required | Zod schema defining input parameters |
| `execute` | async function | Required | Async function implementing tool logic |

**Relationships:**
- None (stateless, no dependencies between tools)

**Validation Rules:**
```typescript
// Input schemas defined in contracts/*.json, implemented as Zod schemas
const semanticSearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().min(1).max(100).default(20),
  threshold: z.number().min(0).max(1).default(0.7),
});
```

**State Transitions:**
- N/A (stateless)

**Lifecycle:**
1. **Definition**: Created at code level in `lib/mastra/tools/*.ts`
2. **Registration**: Automatically registered by Mastra on application startup
3. **Execution**: Invoked by agents via Mastra runtime
4. **Updates**: Code changes only (no dynamic updates)

**Storage:**
- Code-only (no database table)
- Exported from `lib/mastra/tools/index.ts`

**TypeScript Type:**
```typescript
import { createTool } from '@mastra/mcp';
import { z } from 'zod';

type MastraToolDefinition = {
  id: string;
  description: string;
  inputSchema: z.ZodSchema;
  execute: (input: z.infer<typeof inputSchema>) => Promise<unknown>;
};
```

---

### 2. Tool Execution Trace (Mastra Telemetry)

**Description**: Represents a single tool invocation by an agent. Automatically logged by Mastra's built-in telemetry system.

**Attributes:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `tool_name` | string | Required | Tool ID that was executed |
| `input_params` | JSON | Required | Input parameters passed to tool |
| `output_data` | JSON | Nullable | Output data returned by tool (null if failed) |
| `duration_ms` | number | Required, >= 0 | Execution time in milliseconds |
| `status` | enum | Required | 'success' \| 'error' \| 'timeout' |
| `timestamp` | timestamptz | Required, auto | UTC timestamp of execution start |
| `error_message` | string | Nullable | Error message if status = 'error' |
| `error_stack` | string | Nullable | Stack trace for debugging |
| `performance_warning` | boolean | Required, default false | True if execution exceeded 5s target |
| `retry_count` | number | Required, default 0 | Number of retry attempts (0-2) |
| `agent_session_id` | string | Nullable | Phase 3 dependency - agent session identifier |

**Relationships:**
- Belongs to agent session (Phase 3 dependency, nullable for P0)

**Validation Rules:**
- `duration_ms` must be non-negative
- `status` must be one of: 'success', 'error', 'timeout'
- `retry_count` must be between 0-2 (max 2 retries)
- `performance_warning` set to true automatically if `duration_ms` > 5000

**State Transitions:**
```
pending → running → success
                  ↘ error (retry) → running → success
                                            ↘ error (permanent)
```

**Lifecycle:**
1. **Creation**: Automatically created when tool execution begins
2. **Updates**: Status and duration updated during execution
3. **Completion**: Final status, output, and performance warning set
4. **Retention**: Queryable via Mastra telemetry API indefinitely

**Storage:**
- Mastra-managed (telemetry backend)
- Queryable via Mastra API (not direct database access)

**TypeScript Type:**
```typescript
export type ToolExecutionTrace = {
  tool_name: string;
  input_params: Record<string, unknown>;
  output_data: unknown | null;
  duration_ms: number;
  status: 'success' | 'error' | 'timeout';
  timestamp: Date;
  error_message?: string;
  error_stack?: string;
  performance_warning: boolean;
  retry_count: number;
  agent_session_id?: string;
};
```

---

### 3. Task Relationship (NEW Database Table)

**Description**: Represents a dependency between two tasks (prerequisite, blocking, or related). Created by detect-dependencies tool or manual input. Queried by query-task-graph tool.

**Attributes:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | uuid | Primary key, auto | Unique relationship identifier |
| `source_task_id` | text | Required, references task_embeddings.task_id | Task that initiates relationship |
| `target_task_id` | text | Required, references task_embeddings.task_id | Task affected by relationship |
| `relationship_type` | enum | Required | 'prerequisite' \| 'blocks' \| 'related' |
| `confidence_score` | numeric | Required, range 0.0-1.0 | Confidence in relationship (1.0 for manual, <1.0 for AI) |
| `detection_method` | enum | Required | 'manual' \| 'ai' |
| `reasoning` | text | Nullable | AI explanation for detected relationship (debugging) |
| `created_at` | timestamptz | Required, auto | Timestamp of relationship creation |
| `updated_at` | timestamptz | Required, auto | Timestamp of last update |

**Relationships:**
- References `task_embeddings.task_id` (foreign key) for both source and target
- Cascade delete: If task is deleted, all relationships involving that task are deleted

**Validation Rules:**
```typescript
const taskRelationshipSchema = z.object({
  source_task_id: z.string().min(1),
  target_task_id: z.string().min(1),
  relationship_type: z.enum(['prerequisite', 'blocks', 'related']),
  confidence_score: z.number().min(0).max(1),
  detection_method: z.enum(['manual', 'ai']),
  reasoning: z.string().optional(),
});
```

**State Transitions:**
- Immutable after creation (no state transitions)
- Updates allowed only for confidence_score and reasoning fields

**Lifecycle:**
1. **Creation**: Created by detect-dependencies tool or manual API endpoint (Phase 3)
2. **Query**: Retrieved by query-task-graph tool
3. **Deletion**: Cascade deleted when parent task is deleted

**Storage:**
- Supabase PostgreSQL table: `task_relationships`
- Migration: `010_create_task_relationships.sql`

**Database Migration SQL:**
```sql
-- Migration 010: Create task_relationships table
-- Created: 2025-10-18
-- Feature: Phase 2 - Tool Registry & Execution
-- Dependencies: 008_create_task_embeddings.sql

-- Create enum types for relationship attributes
CREATE TYPE relationship_type_enum AS ENUM ('prerequisite', 'blocks', 'related');
CREATE TYPE detection_method_enum AS ENUM ('manual', 'ai');

-- Create task_relationships table
CREATE TABLE task_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_task_id TEXT NOT NULL REFERENCES task_embeddings(task_id) ON DELETE CASCADE,
  target_task_id TEXT NOT NULL REFERENCES task_embeddings(task_id) ON DELETE CASCADE,
  relationship_type relationship_type_enum NOT NULL,
  confidence_score NUMERIC(3, 2) NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  detection_method detection_method_enum NOT NULL,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate relationships (same source, target, type)
  CONSTRAINT unique_task_relationship UNIQUE (source_task_id, target_task_id, relationship_type),

  -- Prevent self-referencing relationships
  CONSTRAINT no_self_reference CHECK (source_task_id != target_task_id)
);

-- Create indexes for query performance

-- Query all relationships for a specific task (as source or target)
CREATE INDEX idx_task_relationships_source ON task_relationships(source_task_id);
CREATE INDEX idx_task_relationships_target ON task_relationships(target_task_id);

-- Filter by relationship type
CREATE INDEX idx_task_relationships_type ON task_relationships(relationship_type);

-- Composite index for common query pattern (task + type)
CREATE INDEX idx_task_relationships_source_type ON task_relationships(source_task_id, relationship_type);
CREATE INDEX idx_task_relationships_target_type ON task_relationships(target_task_id, relationship_type);

-- Filter by detection method (manual vs AI)
CREATE INDEX idx_task_relationships_detection ON task_relationships(detection_method);

-- Partial index for low-confidence AI relationships (confidence < 0.7)
CREATE INDEX idx_task_relationships_low_confidence
  ON task_relationships(confidence_score)
  WHERE detection_method = 'ai' AND confidence_score < 0.7;

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_task_relationships_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_relationships_updated_at
  BEFORE UPDATE ON task_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_task_relationships_updated_at();

-- Verify table structure
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'task_relationships'
ORDER BY ordinal_position;

-- Sample test data (optional - remove in production)
COMMENT ON TABLE task_relationships IS 'Stores dependencies between tasks detected by AI or manual input';
COMMENT ON COLUMN task_relationships.confidence_score IS 'Range 0.0-1.0. Manual relationships default to 1.0, AI relationships vary based on detection confidence';
COMMENT ON COLUMN task_relationships.reasoning IS 'Optional AI explanation for why this relationship was detected (useful for debugging)';
```

**TypeScript Type:**
```typescript
export type TaskRelationship = {
  id: string; // uuid
  source_task_id: string;
  target_task_id: string;
  relationship_type: 'prerequisite' | 'blocks' | 'related';
  confidence_score: number; // 0.0-1.0
  detection_method: 'manual' | 'ai';
  reasoning?: string;
  created_at: Date;
  updated_at: Date;
};

// Insert type (excludes auto-generated fields)
export type TaskRelationshipInsert = Omit<TaskRelationship, 'id' | 'created_at' | 'updated_at'>;
```

---

### 4. Task Cluster (Ephemeral, Not Persisted)

**Description**: Represents a group of semantically similar tasks. Computed on-demand by cluster-by-similarity tool, returned to agent, and discarded. Never stored in database.

**Attributes:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `cluster_id` | number | Required, >= 0 | Unique cluster identifier (0-indexed) |
| `task_ids` | string[] | Required, min 1 | Array of task IDs belonging to cluster |
| `centroid` | number[] | Required, length 1536 | Average embedding vector for cluster |
| `average_similarity` | number | Required, range 0.0-1.0 | Average pairwise similarity within cluster |

**Relationships:**
- Contains multiple tasks (via task_ids array)
- No foreign key constraints (ephemeral data)

**Validation Rules:**
```typescript
const taskClusterSchema = z.object({
  cluster_id: z.number().int().min(0),
  task_ids: z.array(z.string()).min(1).max(100),
  centroid: z.array(z.number()).length(1536),
  average_similarity: z.number().min(0).max(1),
});
```

**State Transitions:**
- N/A (ephemeral, no persistence)

**Lifecycle:**
1. **Computation**: Generated by cluster-by-similarity tool via agglomerative clustering algorithm
2. **Return**: Sent to agent as JSON response
3. **Discard**: Immediately discarded (not stored)

**Storage:**
- In-memory only (never persisted)
- No database table

**TypeScript Type:**
```typescript
export type TaskCluster = {
  cluster_id: number;
  task_ids: string[];
  centroid: number[]; // Length 1536
  average_similarity: number; // 0.0-1.0
};

export type ClusteringResult = {
  clusters: TaskCluster[];
  task_count: number;
  cluster_count: number;
  threshold_used: number;
};
```

**Clustering Algorithm:**
- **Method**: Agglomerative hierarchical clustering
- **Linkage**: Average linkage
- **Distance Metric**: Cosine distance (1 - cosine similarity)
- **Complexity**: O(n² log n) for n tasks

---

### 5. Document Context (Derived, Not Persisted)

**Description**: Represents full markdown content and all tasks from a document. Derived by joining existing tables (uploaded_files, processed_documents, task_embeddings). Returned by get-document-context tool, never stored separately.

**Attributes:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `document_id` | uuid | Required | Unique document identifier |
| `filename` | string | Required | Original uploaded filename |
| `markdown_content` | string | Required | Full markdown content (or paginated chunk) |
| `tasks_in_document` | Task[] | Required, min 0 | All tasks extracted from document |
| `pagination_metadata` | PaginationMetadata \| null | Nullable | Pagination info if document was chunked |

**Nested Type: Task:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `task_id` | string | Required | SHA-256 task identifier |
| `task_text` | string | Required | Full task description |

**Nested Type: PaginationMetadata:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `current_chunk` | number | Required, >= 1 | Current chunk number (1-indexed) |
| `total_chunks` | number | Required, >= 1 | Total number of chunks for document |
| `chunk_size` | number | Required, > 0 | Approximate characters per chunk |
| `overlap_size` | number | Required, default 200 | Character overlap between chunks |

**Relationships:**
- Derived from `uploaded_files`, `processed_documents`, `task_embeddings` tables
- No foreign key constraints (ephemeral query result)

**Validation Rules:**
```typescript
const paginationMetadataSchema = z.object({
  current_chunk: z.number().int().min(1),
  total_chunks: z.number().int().min(1),
  chunk_size: z.number().int().positive(),
  overlap_size: z.number().int().min(0).default(200),
});

const documentContextSchema = z.object({
  document_id: z.string().uuid(),
  filename: z.string().min(1),
  markdown_content: z.string(),
  tasks_in_document: z.array(z.object({
    task_id: z.string(),
    task_text: z.string(),
  })),
  pagination_metadata: paginationMetadataSchema.nullable(),
});
```

**State Transitions:**
- N/A (query result, no persistence)

**Lifecycle:**
1. **Query**: Generated on-demand by get-document-context tool
2. **Pagination**: Large documents (>50,000 chars) automatically split into chunks
3. **Return**: Sent to agent as JSON response
4. **Discard**: Immediately discarded (not cached)

**Storage:**
- Derived from database query (no separate table)
- Pagination handled in-memory

**TypeScript Type:**
```typescript
export type PaginationMetadata = {
  current_chunk: number; // 1-indexed
  total_chunks: number;
  chunk_size: number;
  overlap_size: number;
};

export type DocumentContext = {
  document_id: string; // uuid
  filename: string;
  markdown_content: string;
  tasks_in_document: Array<{
    task_id: string;
    task_text: string;
  }>;
  pagination_metadata: PaginationMetadata | null;
};
```

**Pagination Strategy:**
- **Chunk Size**: 50,000 characters per chunk
- **Overlap**: 200 characters between adjacent chunks
- **Algorithm**: Split on paragraph boundaries when possible, fallback to hard split if no paragraph found near boundary
- **Metadata**: Included in response when document exceeds 50,000 chars

---

## Supporting Entities

### 6. Embedding Vector (Existing from Phase 1)

**Description**: 1536-dimension vector representation of a task, generated by OpenAI text-embedding-3-small model. Stored in `task_embeddings` table (existing).

**Attributes:**
- See existing schema in `supabase/migrations/008_create_task_embeddings.sql`
- No changes required for Phase 2

**Usage in Phase 2:**
- **semantic-search tool**: Queries embeddings via cosine similarity search
- **cluster-by-similarity tool**: Fetches embeddings for clustering algorithm
- **detect-dependencies tool**: Optionally uses embeddings for context-aware analysis

---

## Entity Relationships Diagram

```
┌─────────────────────┐
│  Tool Definition    │ (Code-only, Mastra-managed)
│  (5 tools)          │
└─────────────────────┘
         │
         │ executes
         ↓
┌─────────────────────┐
│ Tool Execution Trace│ (Mastra telemetry)
│                     │
└─────────────────────┘

┌─────────────────────┐
│  task_embeddings    │ (Existing Phase 1 table)
│  - task_id (PK)     │
│  - embedding        │
│  - document_id (FK) │
└─────────────────────┘
         ↑
         │ references (source/target)
         │
┌─────────────────────┐
│ task_relationships  │ (NEW table, Migration 010)
│  - source_task_id   │───┐
│  - target_task_id   │───┘
│  - relationship_type│
│  - confidence_score │
└─────────────────────┘

┌─────────────────────┐
│  Task Cluster       │ (Ephemeral, in-memory)
│  - cluster_id       │
│  - task_ids[]       │
│  - centroid         │
└─────────────────────┘

┌─────────────────────┐
│ Document Context    │ (Derived from query)
│  - document_id      │
│  - markdown_content │
│  - tasks[]          │
└─────────────────────┘
         ↑
         │ derived from
         │
┌─────────────────────┐       ┌─────────────────────┐
│  uploaded_files     │←──────│ processed_documents │ (Existing tables)
└─────────────────────┘       └─────────────────────┘
```

---

## Database Schema Summary

**New Tables (Phase 2):**
1. `task_relationships` - Stores task dependencies (Migration 010)

**Existing Tables (No Changes):**
1. `task_embeddings` - Phase 1 table, used for semantic search and clustering
2. `uploaded_files` - Original file metadata
3. `processed_documents` - Markdown content and AI outputs

**New Enums:**
1. `relationship_type_enum` - 'prerequisite' | 'blocks' | 'related'
2. `detection_method_enum` - 'manual' | 'ai'

---

## Cross-References

**Related Documents:**
- [API Contracts](./contracts/) - Tool input/output schemas for all 5 tools
- [Quickstart Guide](./quickstart.md) - Manual testing scenarios for tools
- [Feature Specification](./spec.md) - Functional requirements and acceptance criteria
- [Implementation Plan](./plan.md) - Phase breakdown and task generation strategy

**Database Migrations:**
- `008_create_task_embeddings.sql` - Phase 1 table (prerequisite)
- `010_create_task_relationships.sql` - Phase 2 table (new, defined above)

**Code Files (To Be Implemented):**
- `lib/mastra/tools/*.ts` - Tool definitions using `createTool()` API
- `lib/services/documentService.ts` - Document context retrieval logic
- `lib/services/dependencyService.ts` - AI-powered dependency detection
- `lib/services/clusteringService.ts` - Hierarchical clustering algorithm
- `lib/types/mastra.ts` - TypeScript type definitions for tool results

---

## Validation Checklist

- [x] All primary entities documented with complete attribute lists
- [x] Relationships between entities clearly defined
- [x] Zod validation schemas provided for all entities
- [x] State transitions documented where applicable
- [x] Lifecycle descriptions complete
- [x] Storage locations specified (database vs in-memory vs Mastra-managed)
- [x] TypeScript type definitions included
- [x] SQL migration provided for task_relationships table
- [x] Cross-references to contracts and quickstart included
- [x] Entity relationship diagram visualizes connections

---

**Last Updated**: 2025-10-18
**Next Steps**: Implement tool definitions in `lib/mastra/tools/` following contracts
