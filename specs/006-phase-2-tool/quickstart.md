# Quickstart Guide: Phase 2 - Tool Registry & Execution

**Feature Branch**: `006-phase-2-tool`
**Created**: 2025-10-18
**Status**: Ready for Manual Testing

## Overview

This guide provides step-by-step manual testing scenarios for all 5 Mastra-based tools. Each scenario includes setup, execution, expected output, validation steps, and cleanup procedures.

**Testing Objective**: Verify that all tools execute correctly, return valid data matching contract schemas, and complete within performance targets (<5s at P95).

---

## Mastra Setup Instructions

### Fresh Installation (If Not Already Installed)

**1. Install Mastra Package:**
```bash
# Navigate to project root
cd /home/yunix/learning-agentic/ideas/Note-synth/notes

# Install Mastra MCP package
npm install @mastra/mcp@0.13.5

# Verify installation
npm list @mastra/mcp
# Expected: @mastra/mcp@0.13.5
```

**2. Create Mastra Configuration File:**

Create `lib/mastra/config.ts`:
```typescript
import { Mastra } from '@mastra/core';

export const mastra = new Mastra({
  // Enable telemetry for tool execution logging
  telemetry: {
    enabled: true,
    provider: 'console', // P0: Log to console; P1: Switch to persistent storage
  },

  // Tool execution settings
  tools: {
    maxConcurrentExecutions: 10, // Global rate limit (FR-012)
    defaultTimeout: 10000, // 10s timeout (soft - allows completion)
    retryPolicy: {
      maxAttempts: 2, // 2 retries (FR-011)
      retryDelay: 2000, // 2s fixed delay (FR-011a)
      retryableErrors: ['NETWORK_TIMEOUT', 'DATABASE_UNAVAILABLE', 'RATE_LIMIT'],
    },
  },

  // Performance monitoring
  monitoring: {
    logSlowExecutions: true,
    slowExecutionThresholdMs: 5000, // P95 target (FR-009c)
  },
});
```

**3. Create Tool Registry File:**

Create `lib/mastra/tools/index.ts` (initially empty - tools added during implementation):
```typescript
// Tool registry - will be populated during Phase 2 implementation
// Import all tools and export as array for Mastra agent

// TODO: Import tools after implementation
// import { semanticSearchTool } from './semanticSearch';
// import { getDocumentContextTool } from './getDocumentContext';
// import { detectDependenciesTool } from './detectDependencies';
// import { queryTaskGraphTool } from './queryTaskGraph';
// import { clusterBySimilarityTool } from './clusterBySimilarity';

export const agentTools = [
  // TODO: Add tools here after implementation
];

export {};
```

**4. Initialize Mastra in Application:**

Update `app/layout.tsx` or create `lib/mastra/init.ts`:
```typescript
// lib/mastra/init.ts
import { mastra } from './config';
import { agentTools } from './tools';

// Register all tools with Mastra
export function initializeMastra() {
  agentTools.forEach(tool => {
    mastra.registerTool(tool);
  });

  console.log(`[Mastra] Initialized with ${agentTools.length} tools`);
  return mastra;
}

// Auto-initialize on import (server-side only)
if (typeof window === 'undefined') {
  initializeMastra();
}
```

**5. Verify Mastra Setup:**

Create a test script `scripts/test-mastra.ts`:
```typescript
import { mastra } from '@/lib/mastra/config';

async function testMastraSetup() {
  console.log('Testing Mastra configuration...');

  // Test 1: Verify Mastra instance
  console.log('✓ Mastra instance created');

  // Test 2: Check telemetry config
  const config = mastra.getConfig();
  console.log('✓ Telemetry enabled:', config.telemetry?.enabled);

  // Test 3: Check tool registry (will be empty initially)
  const registeredTools = mastra.getTools();
  console.log('✓ Registered tools:', registeredTools.length);

  console.log('\n[Mastra Setup] All checks passed!');
}

testMastraSetup().catch(console.error);
```

Run the test:
```bash
npx tsx scripts/test-mastra.ts
# Expected output:
# Testing Mastra configuration...
# ✓ Mastra instance created
# ✓ Telemetry enabled: true
# ✓ Registered tools: 0
# [Mastra Setup] All checks passed!
```

**6. Install Additional Dependencies (If Needed):**

For Phase 2 implementation, you'll also need:
```bash
# ml-hclust for clustering (from research.md)
npm install ml-hclust@3.1.0

# Verify all dependencies
npm list @mastra/mcp zod @ai-sdk/openai ai ml-hclust
```

### Existing Installation (Verify Only)

If Mastra is already in `package.json`, verify the setup:

```bash
# Check Mastra version
npm list @mastra/mcp
# Expected: @mastra/mcp@0.13.5

# Verify configuration file exists
ls lib/mastra/config.ts
# Expected: File found

# Verify tool registry exists
ls lib/mastra/tools/index.ts
# Expected: File found
```

---

## Prerequisites

### 1. Environment Setup

**Required Dependencies:**
```bash
# Verify Node.js version (20+ required)
node --version  # Should be v20.x.x or higher

# Verify package installations
npm list @mastra/mcp  # Should show v0.13.5
npm list zod          # Should show v3.24.1
npm list @supabase/supabase-js  # Should show v2.58.0
npm list ml-hclust    # Should show v3.1.0 (for clustering)
```

**Environment Variables:**
```bash
# Required in .env.local
NEXT_PUBLIC_SUPABASE_URL=https://emgvqqqqdbfpjwbouybj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_key_here
OPENAI_API_KEY=sk-proj-...
```

**Verify Environment:**
```bash
# Start development server
npm run dev

# In separate terminal, verify Supabase connection
curl http://localhost:3000/api/test-supabase
# Expected: {"status":"ok","message":"Supabase connection successful"}
```

### 2. Database State

**Required Tables:**
```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('task_embeddings', 'task_relationships', 'uploaded_files', 'processed_documents')
ORDER BY table_name;

-- Expected output: 4 rows (all tables present)
```

**Required Migrations:**
- `007_enable_pgvector.sql` - pgvector extension
- `008_create_task_embeddings.sql` - task_embeddings table with IVFFlat index
- `010_create_task_relationships.sql` - task_relationships table (NEW for Phase 2)

**Apply Missing Migrations:**
```bash
# If migration 010 not applied yet:
# 1. Go to Supabase Dashboard → SQL Editor
# 2. Copy contents of supabase/migrations/010_create_task_relationships.sql
# 3. Execute SQL
# 4. Verify: SELECT count(*) FROM task_relationships; (should return 0)
```

### 3. Test Data Requirements

**Minimum Data:**
- At least 20 documents with completed embeddings (status = 'completed')
- At least 200 task embeddings in total
- At least 5 task relationships in task_relationships table (for query-task-graph tests)

**Generate Test Data (if needed):**
```bash
# Upload 20 sample documents via UI at http://localhost:3000
# Wait for processing to complete (check status = 'completed')
# Verify embeddings generated:
SELECT
  COUNT(*) as total_embeddings,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_embeddings
FROM task_embeddings;

# Expected: total_embeddings >= 200, completed_embeddings >= 200
```

---

## Test Scenarios

### Scenario 1: Agent Searches for Revenue Tasks

**Objective**: Verify semantic-search tool returns relevant tasks matching natural language query.

#### Setup

1. **Verify test data exists:**
```sql
-- Check that embeddings are available
SELECT COUNT(*) FROM task_embeddings WHERE status = 'completed';
-- Expected: >= 200

-- Sample some task texts to confirm semantic variety
SELECT task_text FROM task_embeddings LIMIT 10;
```

2. **Start development server:**
```bash
npm run dev
```

3. **Prepare test query:**
```typescript
const testInput = {
  query: "increase monthly revenue",
  limit: 20,
  threshold: 0.7
};
```

#### Execution

**Via Mastra Tool (Code-based test):**
```typescript
// In lib/mastra/tools/__tests__/semanticSearch.test.ts
import { semanticSearchTool } from '../semanticSearch';

const result = await semanticSearchTool.execute({
  query: "increase monthly revenue",
  limit: 20,
  threshold: 0.7
});
```

**Via API Endpoint (if exposed):**
```bash
# If you've created a test endpoint for manual testing
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool_id": "semantic-search",
    "input": {
      "query": "increase monthly revenue",
      "limit": 20,
      "threshold": 0.7
    }
  }'
```

**Via Node REPL (Quick Test):**
```bash
# In project root
node

# Then in REPL:
const { semanticSearchTool } = require('./lib/mastra/tools/semanticSearch.ts');
await semanticSearchTool.execute({
  query: "increase monthly revenue",
  limit: 20,
  threshold: 0.7
}).then(console.log);
```

#### Expected Output

```json
{
  "tasks": [
    {
      "task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
      "task_text": "Implement revenue tracking dashboard with real-time metrics",
      "document_id": "550e8400-e29b-41d4-a716-446655440000",
      "similarity": 0.89
    },
    {
      "task_id": "b4d6g0h2c3e5f7g9h1i3j5k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7a9b1c3d5e7",
      "task_text": "Optimize pricing strategy to increase ARPU",
      "document_id": "660f9511-f39c-52e5-b827-557766551111",
      "similarity": 0.87
    }
    // ... up to 20 tasks total
  ],
  "count": 15,
  "query": "increase monthly revenue"
}
```

#### Validation

**Schema Validation:**
```typescript
// Verify output matches contract schema
import { z } from 'zod';

const outputSchema = z.object({
  tasks: z.array(z.object({
    task_id: z.string(),
    task_text: z.string(),
    document_id: z.string().uuid(),
    similarity: z.number().min(0).max(1),
  })),
  count: z.number(),
  query: z.string(),
});

outputSchema.parse(result); // Throws if invalid
```

**Data Quality Checks:**
1. All similarity scores >= 0.7 (matches threshold)
2. Tasks sorted by similarity descending (first task has highest score)
3. Count matches actual array length
4. Query echoed back correctly
5. All task_ids are valid SHA-256 hashes (64 hex characters)
6. All document_ids are valid UUIDs

**Performance Validation:**
```typescript
const startTime = Date.now();
const result = await semanticSearchTool.execute(testInput);
const duration = Date.now() - startTime;

console.log(`Execution time: ${duration}ms`);
// Expected: < 5000ms (P95 target)
// Typical: 300-800ms
```

**Cross-Reference Validation:**
```sql
-- Verify returned task IDs exist in database
SELECT task_id, task_text FROM task_embeddings
WHERE task_id IN ('a3c5f891...', 'b4d6g0h2...', ...);
-- Expected: All task IDs found
```

#### Cleanup

No cleanup needed (read-only operation).

---

### Scenario 2: Agent Retrieves Document Context

**Objective**: Verify get-document-context tool returns full markdown and all tasks for parent documents.

#### Setup

1. **Get task IDs from previous search:**
```typescript
const previousSearchResult = { /* result from Scenario 1 */ };
const taskIds = previousSearchResult.tasks.slice(0, 3).map(t => t.task_id);
// Use first 3 task IDs for testing
```

2. **Verify documents exist:**
```sql
SELECT d.id, u.filename, LENGTH(d.markdown_content) as markdown_length
FROM processed_documents d
JOIN uploaded_files u ON u.id = d.file_id
WHERE d.id IN (
  SELECT DISTINCT document_id FROM task_embeddings
  WHERE task_id IN ('task_id_1', 'task_id_2', 'task_id_3')
);
```

#### Execution

```typescript
const result = await getDocumentContextTool.execute({
  task_ids: [
    "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
    "b4d6g0h2c3e5f7g9h1i3j5k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7a9b1c3d5e7"
  ]
});
```

#### Expected Output

**For Small Documents (<50,000 chars):**
```json
{
  "documents": [
    {
      "document_id": "550e8400-e29b-41d4-a716-446655440000",
      "filename": "q3-revenue-strategy.pdf",
      "markdown": "# Q3 Revenue Strategy\n\n## Executive Summary\n...\n\n[Full document content]",
      "tasks_in_document": [
        {
          "task_id": "a3c5f891...",
          "task_text": "Implement revenue tracking dashboard"
        },
        {
          "task_id": "b4d6g0h2...",
          "task_text": "Optimize pricing strategy"
        },
        {
          "task_id": "z9x8c7v6...",
          "task_text": "Deploy automated reporting"
        }
      ],
      "pagination_metadata": null
    }
  ]
}
```

**For Large Documents (>50,000 chars):**
```json
{
  "documents": [
    {
      "document_id": "770g0622-g40d-63f6-c938-668877662222",
      "filename": "enterprise-sales-playbook.pdf",
      "markdown": "[First 50,000 characters with 200-char overlap at end...]",
      "tasks_in_document": [
        {
          "task_id": "c5e7h1i3...",
          "task_text": "Launch enterprise sales program"
        }
      ],
      "pagination_metadata": {
        "current_chunk": 1,
        "total_chunks": 3,
        "chunk_size": 50000,
        "overlap_size": 200
      }
    }
  ]
}
```

#### Validation

**Schema Validation:**
```typescript
const outputSchema = z.object({
  documents: z.array(z.object({
    document_id: z.string().uuid(),
    filename: z.string(),
    markdown: z.string(),
    tasks_in_document: z.array(z.object({
      task_id: z.string(),
      task_text: z.string(),
    })),
    pagination_metadata: z.object({
      current_chunk: z.number().min(1),
      total_chunks: z.number().min(1),
      chunk_size: z.number().positive(),
      overlap_size: z.number().min(0),
    }).nullable(),
  })),
});

outputSchema.parse(result);
```

**Data Quality Checks:**
1. All requested task IDs appear in at least one document's tasks_in_document array
2. Markdown content is non-empty for all documents
3. tasks_in_document includes ALL tasks (not just requested ones)
4. Filenames match database records
5. Pagination metadata present if markdown length > 50,000 chars

**Pagination Test (if applicable):**
```typescript
// If pagination_metadata.total_chunks > 1, request next chunk
const chunk2Result = await getDocumentContextTool.execute({
  task_ids: [taskIds[0]], // Same task
  chunk_number: 2
});

// Verify:
// - chunk2Result.documents[0].pagination_metadata.current_chunk === 2
// - First 200 chars of chunk 2 overlap with last 200 chars of chunk 1
```

**Cross-Reference Validation:**
```sql
-- Verify document markdown matches database
SELECT markdown_content FROM processed_documents
WHERE id = '550e8400-e29b-41d4-a716-446655440000';
-- Expected: Matches result.documents[0].markdown (or first chunk)

-- Verify all tasks returned
SELECT task_id, task_text FROM task_embeddings
WHERE document_id = '550e8400-e29b-41d4-a716-446655440000';
-- Expected: All tasks appear in tasks_in_document array
```

#### Cleanup

No cleanup needed (read-only operation).

---

### Scenario 3: Agent Detects Dependencies

**Objective**: Verify detect-dependencies tool analyzes tasks and returns AI-detected relationships.

#### Setup

1. **Select test tasks:**
```sql
-- Find 5 tasks from same document (likely related)
SELECT task_id, task_text FROM task_embeddings
WHERE document_id = '550e8400-e29b-41d4-a716-446655440000'
LIMIT 5;
```

2. **Verify OpenAI API key configured:**
```bash
echo $OPENAI_API_KEY  # Should print sk-proj-...
```

3. **Clear previous AI relationships (optional):**
```sql
-- Only if you want clean test
DELETE FROM task_relationships WHERE detection_method = 'ai';
```

#### Execution

```typescript
const result = await detectDependenciesTool.execute({
  task_ids: [
    "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
    "b4d6g0h2c3e5f7g9h1i3j5k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7a9b1c3d5e7",
    "c5e7h1i3d4f6g8h0i2j4k6l8m0n2o4p6q8r0s2t4u6v8w0x2y4z6a8b0c2d4e6f8"
  ],
  use_document_context: true
});
```

#### Expected Output

```json
{
  "dependencies": [
    {
      "source_task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
      "target_task_id": "b4d6g0h2c3e5f7g9h1i3j5k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7a9b1c3d5e7",
      "relationship_type": "prerequisite",
      "confidence_score": 0.92,
      "detection_method": "ai",
      "reasoning": "Revenue tracking dashboard must be implemented before pricing optimization can be data-driven."
    },
    {
      "source_task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
      "target_task_id": "c5e7h1i3d4f6g8h0i2j4k6l8m0n2o4p6q8r0s2t4u6v8w0x2y4z6a8b0c2d4e6f8",
      "relationship_type": "related",
      "confidence_score": 0.78,
      "detection_method": "ai",
      "reasoning": "Both tasks contribute to revenue growth initiative."
    }
  ],
  "analyzed_count": 3,
  "context_included": true
}
```

#### Validation

**Schema Validation:**
```typescript
const outputSchema = z.object({
  dependencies: z.array(z.object({
    source_task_id: z.string(),
    target_task_id: z.string(),
    relationship_type: z.enum(['prerequisite', 'blocks', 'related']),
    confidence_score: z.number().min(0).max(1),
    detection_method: z.literal('ai'),
    reasoning: z.string().optional(),
  })),
  analyzed_count: z.number(),
  context_included: z.boolean(),
});

outputSchema.parse(result);
```

**Data Quality Checks:**
1. analyzed_count matches input task_ids length (3)
2. context_included matches input parameter (true)
3. All dependencies sorted by confidence_score descending
4. All source/target task IDs exist in input task_ids array
5. No self-referencing relationships (source != target)
6. All confidence scores between 0.0-1.0
7. All detection_method === 'ai'
8. Reasoning provided for each relationship (optional but expected)

**AI Quality Checks:**
```typescript
// Manually review reasoning fields for semantic accuracy
result.dependencies.forEach(dep => {
  console.log(`${dep.relationship_type} (${dep.confidence_score}): ${dep.reasoning}`);
});

// Expected: Reasoning should make logical sense based on task texts
```

**Database Storage Test:**
```typescript
// Tool should store relationships to database
// (This is part of execute() implementation)

// Verify storage:
const { data: storedRelationships } = await supabase
  .from('task_relationships')
  .select('*')
  .in('source_task_id', result.dependencies.map(d => d.source_task_id));

console.log(`Stored ${storedRelationships.length} relationships to database`);
// Expected: Length matches result.dependencies.length
```

**Performance Validation:**
```typescript
const startTime = Date.now();
const result = await detectDependenciesTool.execute({ /* ... */ });
const duration = Date.now() - startTime;

console.log(`Execution time: ${duration}ms`);
// Expected: < 5000ms (P95 target)
// Typical: 2000-3000ms (includes AI API call)
```

#### Cleanup

```sql
-- Remove test relationships
DELETE FROM task_relationships
WHERE source_task_id IN ('a3c5f891...', 'b4d6g0h2...', 'c5e7h1i3...')
  AND detection_method = 'ai';
```

---

### Scenario 4: Agent Queries Existing Relationships

**Objective**: Verify query-task-graph tool retrieves stored relationships from database.

#### Setup

1. **Ensure test relationships exist:**
```sql
-- Insert test relationships (if not present from Scenario 3)
INSERT INTO task_relationships (
  source_task_id, target_task_id, relationship_type,
  confidence_score, detection_method, reasoning
) VALUES
  ('a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3',
   'b4d6g0h2c3e5f7g9h1i3j5k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7a9b1c3d5e7',
   'prerequisite', 0.92, 'ai', 'Test relationship'),
  ('a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3',
   'c5e7h1i3d4f6g8h0i2j4k6l8m0n2o4p6q8r0s2t4u6v8w0x2y4z6a8b0c2d4e6f8',
   'related', 0.78, 'ai', 'Test relationship'),
  ('z9x8c7v6b5n4m3l2k1j0i9h8g7f6e5d4c3b2a1z0y9x8w7v6u5t4s3r2q1p0o9n8',
   'a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3',
   'prerequisite', 1.0, 'manual', 'Manual test relationship');

-- Verify insertion
SELECT * FROM task_relationships
WHERE source_task_id = 'a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3'
   OR target_task_id = 'a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3';
-- Expected: 3 rows
```

#### Execution

**Test 1: Query all relationships (no filter):**
```typescript
const result = await queryTaskGraphTool.execute({
  task_id: "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
  relationship_type: "all"
});
```

**Test 2: Filter by relationship type:**
```typescript
const result = await queryTaskGraphTool.execute({
  task_id: "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
  relationship_type: "prerequisite"
});
```

#### Expected Output

**Test 1 Output (all relationships):**
```json
{
  "relationships": [
    {
      "source_task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
      "target_task_id": "b4d6g0h2c3e5f7g9h1i3j5k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7a9b1c3d5e7",
      "relationship_type": "prerequisite",
      "confidence_score": 0.92,
      "detection_method": "ai"
    },
    {
      "source_task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
      "target_task_id": "c5e7h1i3d4f6g8h0i2j4k6l8m0n2o4p6q8r0s2t4u6v8w0x2y4z6a8b0c2d4e6f8",
      "relationship_type": "related",
      "confidence_score": 0.78,
      "detection_method": "ai"
    },
    {
      "source_task_id": "z9x8c7v6b5n4m3l2k1j0i9h8g7f6e5d4c3b2a1z0y9x8w7v6u5t4s3r2q1p0o9n8",
      "target_task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
      "relationship_type": "prerequisite",
      "confidence_score": 1.0,
      "detection_method": "manual"
    }
  ],
  "task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
  "filter_applied": "all"
}
```

**Test 2 Output (prerequisite only):**
```json
{
  "relationships": [
    {
      "source_task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
      "target_task_id": "b4d6g0h2c3e5f7g9h1i3j5k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7a9b1c3d5e7",
      "relationship_type": "prerequisite",
      "confidence_score": 0.92,
      "detection_method": "ai"
    },
    {
      "source_task_id": "z9x8c7v6b5n4m3l2k1j0i9h8g7f6e5d4c3b2a1z0y9x8w7v6u5t4s3r2q1p0o9n8",
      "target_task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
      "relationship_type": "prerequisite",
      "confidence_score": 1.0,
      "detection_method": "manual"
    }
  ],
  "task_id": "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
  "filter_applied": "prerequisite"
}
```

#### Validation

**Schema Validation:**
```typescript
const outputSchema = z.object({
  relationships: z.array(z.object({
    source_task_id: z.string(),
    target_task_id: z.string(),
    relationship_type: z.enum(['prerequisite', 'blocks', 'related']),
    confidence_score: z.number().min(0).max(1),
    detection_method: z.enum(['manual', 'ai']),
  })),
  task_id: z.string(),
  filter_applied: z.string(),
});

outputSchema.parse(result);
```

**Data Quality Checks:**
1. task_id matches input query
2. filter_applied matches input parameter
3. All relationships match filter (if not "all")
4. Includes both source and target relationships (bidirectional query)
5. Manual relationships have confidence_score === 1.0
6. AI relationships have confidence_score < 1.0

**Performance Validation:**
```typescript
const startTime = Date.now();
const result = await queryTaskGraphTool.execute({ /* ... */ });
const duration = Date.now() - startTime;

console.log(`Execution time: ${duration}ms`);
// Expected: < 2000ms (database query only, no AI)
// Typical: 100-300ms
```

**Cross-Reference Validation:**
```sql
-- Verify database matches tool output
SELECT * FROM task_relationships
WHERE (source_task_id = 'a3c5f891...' OR target_task_id = 'a3c5f891...')
  AND relationship_type = 'prerequisite';
-- Expected: Matches Test 2 output
```

#### Cleanup

```sql
-- Remove test relationships
DELETE FROM task_relationships
WHERE source_task_id IN ('a3c5f891...', 'z9x8c7v6...')
   OR target_task_id IN ('a3c5f891...', 'c5e7h1i3...');
```

---

### Scenario 5: Agent Clusters Similar Tasks

**Objective**: Verify cluster-by-similarity tool groups tasks into semantic clusters.

#### Setup

1. **Select 10 tasks with diverse topics:**
```sql
-- Get 10 tasks from different documents (more diversity)
WITH ranked_tasks AS (
  SELECT
    task_id,
    task_text,
    ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY random()) as rn
  FROM task_embeddings
  WHERE status = 'completed'
)
SELECT task_id, task_text FROM ranked_tasks WHERE rn = 1 LIMIT 10;
```

2. **Copy task IDs for testing:**
```typescript
const testTaskIds = [
  "task_id_1",
  "task_id_2",
  // ... 10 total task IDs
];
```

#### Execution

```typescript
const result = await clusterBySimilarityTool.execute({
  task_ids: testTaskIds,
  similarity_threshold: 0.75
});
```

#### Expected Output

```json
{
  "clusters": [
    {
      "cluster_id": 0,
      "task_ids": [
        "a3c5f891b2d4e6f8c9d1e2f3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3",
        "b4d6g0h2c3e5f7g9h1i3j5k7l9m1n3o5p7q9r1s3t5u7v9w1x3y5z7a9b1c3d5e7",
        "c5e7h1i3d4f6g8h0i2j4k6l8m0n2o4p6q8r0s2t4u6v8w0x2y4z6a8b0c2d4e6f8"
      ],
      "centroid": [0.023, -0.015, 0.048, -0.002],
      "average_similarity": 0.87
    },
    {
      "cluster_id": 1,
      "task_ids": [
        "d6f8i2j4e5g7h9i1j3k5l7m9n1o3p5q7r9s1t3u5v7w9x1y3z5a7b9c1d3e5f7g9",
        "e7g9j3k5f6h8i0j2k4l6m8n0o2p4q6r8s0t2u4v6w8x0y2z4a6b8c0d2e4f6g8h0"
      ],
      "centroid": [-0.012, 0.031, -0.006, 0.019],
      "average_similarity": 0.82
    },
    {
      "cluster_id": 2,
      "task_ids": [
        "f8h0k4l6g7i9j1k3l5m7n9o1p3q5r7s9t1u3v5w7x9y1z3a5b7c9d1e3f5g7h9i1"
      ],
      "centroid": [0.041, -0.023, 0.007, 0.015],
      "average_similarity": 1.0
    }
  ],
  "task_count": 10,
  "cluster_count": 3,
  "threshold_used": 0.75
}
```

#### Validation

**Schema Validation:**
```typescript
const outputSchema = z.object({
  clusters: z.array(z.object({
    cluster_id: z.number().int().min(0),
    task_ids: z.array(z.string()).min(1),
    centroid: z.array(z.number()).length(1536),
    average_similarity: z.number().min(0).max(1),
  })),
  task_count: z.number(),
  cluster_count: z.number(),
  threshold_used: z.number(),
});

outputSchema.parse(result);
```

**Data Quality Checks:**
1. task_count === input task_ids.length (10)
2. cluster_count === clusters.length
3. threshold_used === input threshold (0.75)
4. All input task IDs appear in exactly one cluster
5. Clusters sorted by size (descending)
6. Centroid vectors have exactly 1536 dimensions
7. average_similarity reflects cluster cohesion (higher = tighter cluster)
8. Singleton clusters (1 task) have average_similarity === 1.0

**Mathematical Validation:**
```typescript
// Verify all tasks accounted for
const allClusterTaskIds = result.clusters.flatMap(c => c.task_ids);
const uniqueTaskIds = new Set(allClusterTaskIds);

console.log(`Input: ${testTaskIds.length}, Output: ${uniqueTaskIds.size}`);
// Expected: Equal

// Verify no duplicates
console.log(`Duplicates: ${allClusterTaskIds.length - uniqueTaskIds.size}`);
// Expected: 0

// Verify cluster count
console.log(`Clusters: ${result.clusters.length}`);
// Expected: 2-5 clusters for 10 diverse tasks at threshold 0.75
```

**Performance Validation:**
```typescript
const startTime = Date.now();
const result = await clusterBySimilarityTool.execute({ /* ... */ });
const duration = Date.now() - startTime;

console.log(`Execution time: ${duration}ms`);
// Expected: < 5000ms (P95 target)
// Typical: 1000-2000ms for 10 tasks
```

**Clustering Quality Check:**
```typescript
// Manually review cluster compositions for semantic coherence
result.clusters.forEach((cluster, idx) => {
  console.log(`\nCluster ${idx} (${cluster.task_ids.length} tasks, avg similarity ${cluster.average_similarity}):`);

  // Fetch task texts from database to verify semantic grouping
  cluster.task_ids.forEach(async (taskId) => {
    const { data } = await supabase
      .from('task_embeddings')
      .select('task_text')
      .eq('task_id', taskId)
      .single();
    console.log(`  - ${data.task_text}`);
  });
});

// Expected: Tasks within each cluster should share semantic themes
```

#### Cleanup

No cleanup needed (ephemeral results, no database writes).

---

## Performance Validation

### Test All Tools Under Load

**Objective**: Verify all tools complete within <5s at P95 under concurrent execution.

#### Setup

1. **Prepare test data for all 5 tools:**
```typescript
const testCases = [
  { tool: 'semantic-search', input: { query: 'revenue', limit: 20, threshold: 0.7 } },
  { tool: 'get-document-context', input: { task_ids: ['task1', 'task2'] } },
  { tool: 'detect-dependencies', input: { task_ids: ['task1', 'task2', 'task3'] } },
  { tool: 'query-task-graph', input: { task_id: 'task1', relationship_type: 'all' } },
  { tool: 'cluster-by-similarity', input: { task_ids: ['task1', ..., 'task10'], threshold: 0.75 } },
];
```

2. **Run 100 iterations (20 per tool) to collect P95 data:**
```typescript
const durations = [];

for (let i = 0; i < 20; i++) {
  for (const testCase of testCases) {
    const startTime = Date.now();
    await tools[testCase.tool].execute(testCase.input);
    durations.push(Date.now() - startTime);
  }
}

// Calculate P95
durations.sort((a, b) => a - b);
const p95Index = Math.floor(durations.length * 0.95);
const p95Latency = durations[p95Index];

console.log(`P95 Latency: ${p95Latency}ms`);
// Expected: < 5000ms
```

#### Expected Results

| Tool | P50 (ms) | P95 (ms) | Pass |
|------|----------|----------|------|
| semantic-search | 300-500 | < 1000 | ✓ |
| get-document-context | 500-800 | < 2000 | ✓ |
| detect-dependencies | 2000-3000 | < 5000 | ✓ |
| query-task-graph | 100-200 | < 500 | ✓ |
| cluster-by-similarity | 1000-1500 | < 3000 | ✓ |

---

## Error Scenario Testing

### Test Invalid Inputs

**Scenario**: Verify tools reject invalid parameters with clear error messages.

#### Test Cases

**1. Invalid Threshold (semantic-search):**
```typescript
try {
  await semanticSearchTool.execute({
    query: "test",
    threshold: 1.5  // Invalid: > 1.0
  });
} catch (error) {
  console.log(error.message);
  // Expected: "Threshold must be between 0.0 and 1.0"
}
```

**2. Missing Required Field (detect-dependencies):**
```typescript
try {
  await detectDependenciesTool.execute({
    // Missing task_ids
    use_document_context: true
  });
} catch (error) {
  console.log(error.message);
  // Expected: Zod validation error for required field
}
```

**3. Task Not Found (query-task-graph):**
```typescript
try {
  await queryTaskGraphTool.execute({
    task_id: "nonexistent_task_id_12345",
    relationship_type: "all"
  });
} catch (error) {
  console.log(error.code);
  // Expected: "TASK_NOT_FOUND"
}
```

---

## Telemetry Verification

### Verify Mastra Logging

**Objective**: Confirm all tool executions are logged with complete telemetry data.

#### Execution

```typescript
// Execute a tool
await semanticSearchTool.execute({ query: "test", limit: 5 });

// Query Mastra telemetry API (example - actual API may differ)
const traces = await mastra.telemetry.query({
  tool_name: 'semantic-search',
  limit: 1
});

console.log(traces[0]);
```

#### Expected Output

```json
{
  "tool_name": "semantic-search",
  "input_params": {
    "query": "test",
    "limit": 5,
    "threshold": 0.7
  },
  "output_data": {
    "tasks": [ /* ... */ ],
    "count": 3,
    "query": "test"
  },
  "duration_ms": 450,
  "status": "success",
  "timestamp": "2025-10-18T14:32:15.123Z",
  "error_message": null,
  "performance_warning": false,
  "retry_count": 0
}
```

#### Validation

1. All fields present
2. input_params matches execution input
3. output_data matches return value
4. duration_ms is accurate
5. status reflects actual outcome
6. performance_warning true if duration > 5000ms

---

## Validation Checklist

Before marking Phase 2 complete, verify:

- [ ] All 5 contract files created in contracts/ directory
- [ ] All 5 tools execute without errors
- [ ] All tool outputs match contract schemas
- [ ] All tools complete within P95 < 5s target
- [ ] Schema validation passes for all outputs
- [ ] Database migration 010 applied successfully
- [ ] Task relationships stored correctly in database
- [ ] Clustering produces semantically coherent groups
- [ ] Dependency detection returns logical relationships
- [ ] Error scenarios handled gracefully
- [ ] Mastra telemetry logs all executions
- [ ] Performance degradation warnings logged for slow executions
- [ ] Retry logic tested (simulate transient errors)
- [ ] Document pagination works for >50K char documents
- [ ] All cross-references in data-model.md valid

---

**Last Updated**: 2025-10-18
**Next Steps**: Execute implementation tasks from tasks.md, run automated tests
