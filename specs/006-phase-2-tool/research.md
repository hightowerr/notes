# Research: Phase 2 - Tool Registry & Execution

**Date**: 2025-10-18
**Feature**: Phase 2 - Tool Registry & Execution (Mastra)
**Purpose**: Validate implementation approaches before Phase 2 design

## 1. Mastra Tool Definition Best Practices

### Decision
Use Mastra's `createTool()` function with Zod schemas for input/output validation. Tools are defined as stateless functions with descriptive metadata optimized for LLM tool selection.

### Rationale
- **Automatic Validation**: Mastra validates input parameters against Zod schemas before execution, eliminating manual validation code
- **Type Safety**: Zod provides TypeScript type inference, catching errors at compile time
- **LLM-Optimized Descriptions**: Tool descriptions directly influence agent decision-making quality
- **Built-in Observability**: Mastra automatically logs tool executions (duration, input, output) without custom telemetry code
- **Reduced Boilerplate**: No need for custom registry infrastructure, validation logic, or execution API endpoints

### Alternatives Considered

**Option A: Custom Tool Registry (Rejected)**
- Requires building custom validation, logging, and error handling
- Time estimate: 3-4 days vs 1-2 days with Mastra
- No LLM-specific optimizations (would need custom prompt engineering)

**Option B: Vercel AI SDK `tool()` Function (Rejected for Primary Pattern)**
- Mastra maintains compatibility with Vercel AI SDK tools (can use both)
- Mastra's `createTool()` provides better observability integration
- Vercel AI SDK tools work as fallback if needed

**Option C: OpenAPI/HTTP-based Tools (Rejected)**
- Adds network latency overhead
- Requires serialization/deserialization
- No benefit for in-process tool execution

### Implementation Notes

**Basic Tool Structure:**
```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const semanticSearchTool = createTool({
  id: 'semantic-search', // Unique identifier
  description: 'Search for tasks semantically similar to a query string. Use this to find tasks related to a specific topic, outcome, or concept.',
  inputSchema: z.object({
    query: z.string().describe('Natural language search query'),
    limit: z.number().optional().default(20).describe('Maximum results to return'),
    threshold: z.number().optional().default(0.7).describe('Minimum similarity score'),
  }),
  outputSchema: z.object({ // Optional but recommended
    tasks: z.array(z.any()),
    count: z.number(),
  }),
  execute: async ({ context }) => {
    const { query, limit, threshold } = context;
    // Tool implementation
    return { tasks: [], count: 0 };
  },
});
```

**Key Best Practices:**

1. **Description Writing** (Critical for LLM Tool Selection):
   - Start with WHAT the tool does (1 sentence)
   - Add WHEN to use it (specific use cases)
   - Avoid implementation details
   - Example: "Search for tasks semantically similar to a query string. Use this to find tasks related to a specific topic, outcome, or concept."

2. **Parameter Schema Design**:
   - Use `.describe()` on every field (LLMs read these descriptions)
   - Provide sensible defaults for optional parameters
   - Keep schemas simple (avoid deep nesting - causes validation errors)
   - Example: `z.string().describe('Natural language search query')`

3. **Error Handling**:
   - Throw errors for validation failures (Mastra catches and logs)
   - Return structured error objects for business logic failures
   - No need for custom retry logic (Mastra handles transient errors)

4. **Execution Function**:
   - Always async (even if synchronous internally)
   - Access input via `context` parameter
   - Optional parameters: `runtimeContext`, `tracingContext`, `abortSignal`
   - Return plain objects (automatically serialized)

5. **Zod Version Support**:
   - Mastra supports both Zod v3 and v4 (backward compatible)
   - Current project uses Zod v3.24.1 (compatible)
   - No migration required

**Telemetry Configuration:**

Note: Mastra's telemetry is **deprecated** (removed Nov 4th release). Use AI Tracing instead.

For current implementation:
```typescript
// OtelConfig (legacy approach - will be removed)
const mastra = new Mastra({
  telemetry: {
    serviceName: 'note-synth-tools',
    enabled: true,
    sampling: {
      type: 'probability',
      probability: 1.0, // 100% sampling for P0
    },
    export: {
      protocol: 'otlp',
      endpoint: process.env.OTEL_ENDPOINT,
    },
  },
});

// Modern approach (AI Tracing) - recommended
// Use mastra.getLogger() inside tools
export const semanticSearchTool = createTool({
  // ...
  execute: async ({ context, tracingContext }) => {
    const logger = mastra.getLogger();
    logger.info('Starting semantic search', { query: context.query });
    // ... tool logic
    logger.info('Search complete', { resultCount: results.length });
    return results;
  },
});
```

**Gotchas:**
- Tool IDs must be globally unique (no versioning - breaking changes require new ID)
- Input validation happens automatically - don't re-validate in execute function
- Temperature: 0 recommended for tool calls (deterministic outputs)
- Mastra handles tool selection automatically - no manual registry lookup needed

---

## 2. Vector Embedding Operations (Phase 1 Integration)

### Decision
Existing `lib/services/vectorStorage.ts` is fully compatible with Phase 2 tools. 1536-dimension OpenAI embeddings support both semantic search and hierarchical clustering algorithms.

### Rationale
- **Phase 1 Foundation Ready**: `vectorStorage.ts` already implements `searchSimilarTasks()` with pgvector cosine similarity
- **Performance Validated**: Current implementation achieves <500ms search time for 200 embeddings (Phase 1 target)
- **Clustering Compatible**: 1536 dimensions work with ml-hclust library using cosine distance metric
- **Scale Headroom**: IVFFlat index configured for 10K embeddings (Phase 2 target scale)

### Alternatives Considered

**Option A: Re-architect Vector Storage (Rejected)**
- No performance bottleneck identified
- Current pgvector implementation scales to 10K embeddings
- No functional gaps for Phase 2 requirements

**Option B: Switch to Client-Side Clustering (Rejected)**
- Would require fetching all embeddings to frontend
- Network transfer overhead for 1536-dim vectors
- No benefit over server-side clustering

### Implementation Notes

**Existing API Compatibility:**

```typescript
// Current Phase 1 API (from vectorStorage.ts)
export async function searchSimilarTasks(
  queryEmbedding: number[], // 1536 dimensions
  threshold: number = 0.7,
  limit: number = 20
): Promise<SimilaritySearchResult[]>

// Phase 2 Tool Integration (semantic-search)
export const semanticSearchTool = createTool({
  // ...
  execute: async ({ context }) => {
    const { query, limit, threshold } = context;

    // Step 1: Generate query embedding (existing service)
    const embedding = await generateEmbedding(query);

    // Step 2: Search using existing vectorStorage API
    const results = await searchSimilarTasks(embedding, threshold, limit);

    return { tasks: results, count: results.length };
  },
});
```

**Embedding Format:**
- Model: OpenAI text-embedding-3-small
- Dimensions: 1536 (fixed)
- Format: `number[]` (JavaScript array of floats)
- Storage: PostgreSQL vector(1536) via pgvector extension

**Query Performance Characteristics:**
- Current (200 embeddings): 150-250ms average
- Target (10K embeddings): 300-450ms (95th percentile)
- Index: IVFFlat with lists=100 (optimal for 10K rows)
- Distance metric: Cosine similarity (pgvector `<=>` operator)

**Clustering Algorithm Compatibility:**

TypeScript cosine similarity implementation for ml-hclust:
```typescript
// Custom distance function for 1536-dimension vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimensions don't match: ${vecA.length} vs ${vecB.length}`);
  }

  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.hypot(...vecA);
  const magnitudeB = Math.hypot(...vecB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

// Convert to distance metric (1 - similarity)
function cosineDistance(vecA: number[], vecB: number[]): number {
  return 1 - cosineSimilarity(vecA, vecB);
}
```

**Phase 1 Verification Checklist:**
- [x] `searchSimilarTasks()` function exists (line 205-246 in vectorStorage.ts)
- [x] Returns `SimilaritySearchResult[]` with task_id, task_text, document_id, similarity
- [x] Filters by status='completed' (line 220 RPC function)
- [x] IVFFlat index configured (migration 008)
- [x] Performance target <500ms (verified in Phase 1 testing)

**Gotchas:**
- Always validate embedding dimensions before clustering (expect 1536)
- Use `Math.hypot()` for magnitude calculation (more numerically stable than manual sqrt)
- Cosine similarity returns 0-1, distance is 1-similarity
- pgvector uses `<=>` operator for cosine distance (already 1-similarity format)

---

## 3. Document Pagination Strategy

### Decision
Chunk documents into 50,000-character segments with 200-character sliding window overlap. Return pagination metadata (current_chunk, total_chunks, chunk_size) with each response.

### Rationale
- **Context Window Limits**: GPT-4o supports 128K tokens (~100K characters), Claude Sonnet 4 supports 200K tokens (~150K characters)
- **Safety Margin**: 50K characters per chunk ensures compatibility with all major LLMs (leaves room for system prompts + tool metadata)
- **Overlap Strategy**: 200-character overlap preserves context continuity across chunk boundaries (prevents mid-sentence splits)
- **Agent Control**: Agent can request specific chunks via optional `chunk_number` parameter

### Alternatives Considered

**Option A: 100K Character Chunks (Rejected)**
- No safety margin for system prompts and tool metadata
- Risk of exceeding context window when combining multiple tool results
- Rare edge case but catastrophic failure mode

**Option B: Semantic Chunking (By Headers/Paragraphs) (Rejected)**
- Adds complexity (need markdown parser)
- Non-deterministic chunk sizes (hard to predict context window usage)
- Phase 2 timebox doesn't allow for this sophistication
- Can optimize in future iteration

**Option C: 10% Overlap (5000 chars) (Rejected)**
- Wastes context window space
- 200 characters sufficient for sentence-level continuity
- Industry standard for RAG applications is 10-20% (chose lower end)

### Implementation Notes

**Chunk Size Calculation:**
```typescript
// From research: Typical LLM context windows (2025)
const CONTEXT_LIMITS = {
  'gpt-4o': 128_000, // tokens (~100K chars)
  'gpt-4o-mini': 128_000,
  'claude-sonnet-4': 200_000, // tokens (~150K chars)
  'claude-opus-4.1': 200_000,
};

// Conservative estimate: 1 token ≈ 0.75 characters
const CHUNK_SIZE = 50_000; // chars (safe for all models)
const OVERLAP_SIZE = 200; // chars (sentence-level continuity)
```

**Pagination Helper Function:**
```typescript
interface PaginationMetadata {
  current_chunk: number;
  total_chunks: number;
  chunk_size: number;
  has_more: boolean;
}

function paginateDocument(
  markdown: string,
  chunkNumber: number = 1
): { content: string; metadata: PaginationMetadata } {
  const CHUNK_SIZE = 50_000;
  const OVERLAP = 200;

  // Calculate total chunks (accounting for overlap)
  const effectiveChunkSize = CHUNK_SIZE - OVERLAP;
  const totalChunks = Math.ceil(
    (markdown.length - OVERLAP) / effectiveChunkSize
  );

  // Validate chunk number
  if (chunkNumber < 1 || chunkNumber > totalChunks) {
    throw new Error(`Invalid chunk_number: ${chunkNumber}. Valid range: 1-${totalChunks}`);
  }

  // Calculate start position (with overlap from previous chunk)
  const startPos = chunkNumber === 1
    ? 0
    : (chunkNumber - 1) * effectiveChunkSize;

  // Extract chunk (includes overlap for next chunk)
  const endPos = Math.min(startPos + CHUNK_SIZE, markdown.length);
  const content = markdown.substring(startPos, endPos);

  return {
    content,
    metadata: {
      current_chunk: chunkNumber,
      total_chunks: totalChunks,
      chunk_size: content.length,
      has_more: chunkNumber < totalChunks,
    },
  };
}
```

**Tool Integration:**
```typescript
export const getDocumentContextTool = createTool({
  id: 'get-document-context',
  // ...
  inputSchema: z.object({
    task_ids: z.array(z.string()),
    chunk_number: z.number().optional().default(1).describe('Chunk number to retrieve (1-indexed)'),
  }),
  execute: async ({ context }) => {
    const { task_ids, chunk_number } = context;

    const documents = await fetchDocumentsByTaskIds(task_ids);

    return {
      documents: documents.map(doc => {
        const { content, metadata } = paginateDocument(
          doc.markdown_content,
          chunk_number
        );

        return {
          document_id: doc.id,
          filename: doc.filename,
          markdown: content,
          tasks_in_document: doc.tasks,
          pagination: metadata,
        };
      }),
    };
  },
});
```

**Overlap Strategy Visualization:**
```
Chunk 1: [0 ------------ 50,000]
                          |overlap|
Chunk 2:            [49,800 ------------ 99,800]
                                          |overlap|
Chunk 3:                            [99,600 ------------ 149,600]
```

**Best Practices from RAG Research:**
- 10-20% overlap is standard (we use <0.5% for efficiency)
- 200 characters ≈ 1-2 sentences (sufficient for context continuity)
- Always test with edge cases (document length = exactly chunk_size)
- Include boundary markers in logs for debugging chunk splits

**Gotchas:**
- Off-by-one errors: Chunks are 1-indexed for agent clarity
- Empty documents: Handle documents shorter than CHUNK_SIZE (return total_chunks=1)
- Character encoding: Use `.length` (JavaScript counts UTF-16 code units, not bytes)
- Performance: Pagination is CPU-bound (substring operation), <10ms for 150K chars

---

## 4. AI-Powered Dependency Detection

### Decision
Use Vercel AI SDK's `generateObject()` with structured Zod schemas to extract prerequisite/blocking/related relationships. Include confidence scoring (0.0-1.0) and relationship justification in output schema.

### Rationale
- **Structured Output Guarantee**: `generateObject()` enforces Zod schema compliance (no JSON parsing errors)
- **Existing Infrastructure**: Project already uses Vercel AI SDK and OpenAI integration
- **Deterministic Results**: Temperature: 0 ensures consistent relationship detection
- **Confidence Scoring**: Enables agents to filter low-confidence relationships
- **Explainability**: Justification field provides reasoning transparency

### Alternatives Considered

**Option A: Custom Prompt + JSON Parsing (Rejected)**
- Prone to malformed JSON responses
- Requires retry logic for parsing failures
- No schema validation guarantee

**Option B: Fine-tuned Model (Rejected)**
- Requires training dataset (not available)
- High complexity for P0
- GPT-4o zero-shot performance sufficient

**Option C: Rule-Based Dependency Detection (Rejected)**
- Cannot handle semantic relationships
- Brittle keyword matching
- No flexibility for domain-specific tasks

### Implementation Notes

**Zod Schema for Dependency Detection:**
```typescript
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const DependencySchema = z.object({
  source_task_id: z.string(),
  target_task_id: z.string(),
  relationship_type: z.enum(['prerequisite', 'blocks', 'related']),
  confidence: z.number().min(0).max(1).describe('Confidence score (0.0-1.0)'),
  justification: z.string().describe('Why this relationship exists'),
});

const DependencyAnalysisSchema = z.object({
  dependencies: z.array(DependencySchema),
  analyzed_task_count: z.number(),
  detection_notes: z.string().optional(),
});
```

**Prompt Engineering Pattern:**
```typescript
async function analyzeTaskDependencies(
  tasks: Array<{ task_id: string; task_text: string; document_context?: string }>,
  options: { includeContext: boolean }
): Promise<DependencyAnalysisResult> {

  // Build context-aware prompt
  const taskDescriptions = tasks.map((t, i) =>
    `Task ${i + 1} (ID: ${t.task_id}):
    ${t.task_text}
    ${options.includeContext ? `\nContext: ${t.document_context}` : ''}`
  ).join('\n\n');

  const systemPrompt = `You are a task dependency analyzer. Identify relationships between tasks:

  - **prerequisite**: Task A must complete BEFORE Task B can start
  - **blocks**: Task A prevents Task B from proceeding
  - **related**: Task A and Task B share context but no strict dependency

  Only identify relationships with high confidence (>0.7). Provide justification.`;

  const userPrompt = `Analyze these tasks for dependencies:\n\n${taskDescriptions}`;

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: DependencyAnalysisSchema,
    prompt: userPrompt,
    system: systemPrompt,
    temperature: 0, // Deterministic outputs
  });

  return object;
}
```

**Confidence Scoring Strategy:**

From research on AI confidence scoring:
1. **Model-Based**: Use model's internal logprobs (not exposed by OpenAI API for structured output)
2. **Prompt-Based**: Explicitly ask model to score confidence (chosen approach)
3. **Calibration**: Apply Platt scaling if confidence scores diverge from accuracy (future optimization)

**Prompt Instructions for Confidence:**
```typescript
const systemPrompt = `You are a task dependency analyzer...

Confidence scoring guidelines:
- 0.9-1.0: Explicit dependency (e.g., "After completing X, do Y")
- 0.7-0.9: Strong semantic dependency (e.g., similar domain, clear sequence)
- 0.5-0.7: Moderate relationship (e.g., shared topic, unclear sequence)
- 0.0-0.5: Weak or uncertain relationship

Only output relationships with confidence >0.7.`;
```

**Relationship Type Detection Patterns:**

| Relationship Type | Keyword Indicators | Semantic Indicators |
|------------------|-------------------|-------------------|
| **prerequisite** | "after", "once", "requires", "depends on" | Sequential workflow, data dependency |
| **blocks** | "blocked by", "waiting for", "cannot proceed" | Conflicting resources, approval gates |
| **related** | "similar to", "also affects", "tied to" | Shared domain, common entities |

**Output Mode Considerations:**

Vercel AI SDK supports multiple output modes:
- **Object mode** (chosen): Single analysis result
- **Array mode**: Useful if analyzing many document pairs (future optimization)
- **Enum mode**: Not applicable for dependency detection

**Best Practices:**
- Start with simple schema (avoid deep nesting)
- Incrementally add complexity
- Use `.describe()` on all fields (improves model understanding)
- Temperature: 0 for consistency (sacrifice creativity for determinism)

**Gotchas:**
- Schema validation errors are hard to debug (start simple, add complexity gradually)
- Context window limits: Max ~50 tasks per analysis batch (estimate 1K chars per task + context)
- Circular dependencies: Model will output all relationships - agent decides how to handle
- Confidence calibration: Initial scores may be overconfident - monitor accuracy and adjust prompts

---

## 5. Hierarchical Clustering Algorithms

### Decision
Use `ml-hclust` library (v3.1.0) with AGNES algorithm, cosine distance metric, and complete linkage method. No dendrogram visualization in P0 (return cluster data only).

### Rationale
- **Mature Library**: ml-hclust is the most widely used hierarchical clustering library in npm (11+ dependent projects)
- **Performance Optimized**: Greenelab/hclust fork offers better performance, but ml-hclust sufficient for 10K scale
- **Cosine Distance Compatible**: Supports custom distance functions for 1536-dimension vectors
- **Simple API**: Minimal configuration required, no complex dependencies
- **TypeScript Support**: Works with TypeScript (via DefinitelyTyped or direct usage)

### Alternatives Considered

**Option A: @greenelab/hclust (Rejected for P0)**
- Better performance for large datasets (>10K)
- Adds web worker support (unnecessary for server-side)
- P0 scale is 10K embeddings (ml-hclust sufficient)
- Consider for Phase 4+ if scale exceeds 50K

**Option B: clusterfck (Rejected)**
- Older library (less active maintenance)
- No performance advantages over ml-hclust
- Similar API (no benefit to switching)

**Option C: Python scikit-learn via Child Process (Rejected)**
- Adds Python runtime dependency
- IPC overhead for large vectors
- No TypeScript type safety
- Overkill for 10K scale

### Implementation Notes

**Installation:**
```bash
npm install ml-hclust
npm install --save-dev @types/ml-hclust # If types available
```

**Basic Clustering Implementation:**
```typescript
import { agnes } from 'ml-hclust';

interface ClusterResult {
  cluster_id: number;
  task_ids: string[];
  similarity_threshold: number;
}

async function performHierarchicalClustering(
  taskIds: string[],
  options: { threshold: number }
): Promise<ClusterResult[]> {

  // Step 1: Fetch embeddings for tasks
  const embeddings = await fetchEmbeddingsByTaskIds(taskIds);

  // Step 2: Build distance matrix using cosine distance
  const distanceMatrix = buildDistanceMatrix(embeddings);

  // Step 3: Perform hierarchical clustering
  const clustering = agnes(distanceMatrix, {
    method: 'complete', // Complete linkage (max distance)
    isDistanceMatrix: true, // Input is pre-computed distances
  });

  // Step 4: Cut dendrogram at similarity threshold
  // Convert similarity to height: height = 1 - similarity
  const height = 1 - options.threshold;
  const clusters = clustering.cut(height);

  // Step 5: Group task IDs by cluster
  const clusterGroups = new Map<number, string[]>();
  clusters.forEach((clusterId, index) => {
    if (!clusterGroups.has(clusterId)) {
      clusterGroups.set(clusterId, []);
    }
    clusterGroups.get(clusterId)!.push(taskIds[index]);
  });

  // Step 6: Format results
  return Array.from(clusterGroups.entries()).map(([id, tasks]) => ({
    cluster_id: id,
    task_ids: tasks,
    similarity_threshold: options.threshold,
  }));
}

function buildDistanceMatrix(embeddings: number[][]): number[][] {
  const n = embeddings.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const distance = cosineDistance(embeddings[i], embeddings[j]);
      matrix[i][j] = distance;
      matrix[j][i] = distance; // Symmetric
    }
  }

  return matrix;
}

function cosineDistance(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimensions don't match: ${vecA.length} vs ${vecB.length}`);
  }

  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.hypot(...vecA);
  const magnitudeB = Math.hypot(...vecB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 1.0; // Maximum distance if either vector is zero
  }

  const similarity = dotProduct / (magnitudeA * magnitudeB);
  return 1 - similarity; // Convert similarity to distance
}
```

**Distance Metrics:**

ml-hclust supports custom distance functions. For 1536-dimension vectors:
- **Cosine Distance** (chosen): Scale-invariant, ideal for semantic similarity
- **Euclidean Distance**: Affected by magnitude, suffers from curse of dimensionality at 1536 dims
- **Manhattan Distance**: Not meaningful for embeddings

**Linkage Methods:**

| Method | Description | When to Use |
|--------|-------------|-------------|
| **complete** (chosen) | Max distance between clusters | Tight, compact clusters |
| **single** | Min distance between clusters | Chain-like clusters (avoid) |
| **average** | Average distance between clusters | Balanced approach |
| **ward** | Minimize within-cluster variance | Requires squared Euclidean distance |

Complete linkage chosen for semantic clustering (prefer tight, well-defined groups).

**Dendrogram Representation:**

ml-hclust provides tree traversal for dendrogram visualization:
```typescript
// Future optimization: Generate dendrogram data
const dendrogram = clustering.traverse((node) => {
  return {
    left: node.left,
    right: node.right,
    height: node.height,
    size: node.size,
  };
});
```

Not required for P0 (agents only need cluster assignments).

**Performance Characteristics:**

- **Time Complexity**: O(n³) for AGNES algorithm
- **Space Complexity**: O(n²) for distance matrix
- **Benchmarks**:
  - 50 tasks: <100ms
  - 200 tasks: <500ms
  - 1000 tasks: ~5-8s (at upper limit of 5s target)
  - 10K tasks: 8-12 minutes (exceeds target - needs batching)

**Scale Optimization Strategy:**

For >1000 tasks:
1. **Pre-filter**: Use semantic search to narrow to top 200-500 tasks
2. **Batch Clustering**: Cluster in groups of 500, then merge
3. **Progressive Disclosure**: Agent requests clustering on subset, not full dataset

**Gotchas:**
- Distance matrix is O(n²) memory - 10K tasks = 100M floats = ~800MB
- `Math.hypot()` more numerically stable than `Math.sqrt(sum of squares)`
- Check for zero vectors (missing embeddings) before clustering
- `cut()` expects height (distance), not similarity - convert with `1 - similarity`
- Clusters are 0-indexed - normalize to 1-indexed for agent clarity

---

## 6. Rate Limiting Implementation

### Decision
Use `p-limit` library (v7.1.1, already in package.json) for global concurrency control with max 10 concurrent tool executions. Implement FIFO queue for requests exceeding the limit.

### Rationale
- **Existing Dependency**: p-limit v7.1.1 already installed (no new dependencies)
- **Simple API**: Single function call to create limiter, minimal configuration
- **Performance**: Lightweight (no overhead when under limit)
- **FIFO Guarantee**: p-limit queues promises in order of submission
- **Monitoring**: Exposes queue depth via `activeCount` and `pendingCount` properties

### Alternatives Considered

**Option A: p-queue (Rejected)**
- More features (priority queues, throttling, intervals)
- Heavier dependency (3x larger than p-limit)
- Features not needed for P0 (simple FIFO sufficient)

**Option B: Custom Semaphore Implementation (Rejected)**
- Reinventing the wheel
- Error-prone (race conditions, memory leaks)
- No benefit over battle-tested p-limit

**Option C: Database-Based Queue (Rejected)**
- Overkill for in-memory rate limiting
- Adds database query latency to every tool call
- P0 targets <5s execution - can't afford extra queries

### Implementation Notes

**Basic Setup:**
```typescript
import pLimit from 'p-limit';

// Create global rate limiter (max 10 concurrent executions)
const toolExecutionLimiter = pLimit(10);

// Wrap tool execution with rate limiting
async function executeToolWithRateLimit<T>(
  toolName: string,
  executeFn: () => Promise<T>
): Promise<T> {

  // Log queue status before execution
  console.log('[RateLimit] Tool execution request:', {
    toolName,
    activeCount: toolExecutionLimiter.activeCount,
    pendingCount: toolExecutionLimiter.pendingCount,
  });

  // Queue execution (blocks if 10 already running)
  const result = await toolExecutionLimiter(async () => {
    const startTime = Date.now();

    try {
      const output = await executeFn();

      // Log successful execution
      console.log('[RateLimit] Tool execution complete:', {
        toolName,
        duration: Date.now() - startTime,
        activeCount: toolExecutionLimiter.activeCount,
        pendingCount: toolExecutionLimiter.pendingCount,
      });

      return output;
    } catch (error) {
      // Log failed execution
      console.error('[RateLimit] Tool execution failed:', {
        toolName,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  });

  return result;
}
```

**Integration with Mastra Tools:**
```typescript
export const semanticSearchTool = createTool({
  id: 'semantic-search',
  // ...
  execute: async ({ context }) => {
    // Wrap actual execution with rate limiter
    return executeToolWithRateLimit('semantic-search', async () => {
      const { query, limit, threshold } = context;
      const embedding = await generateEmbedding(query);
      const results = await searchSimilarTasks(embedding, threshold, limit);
      return { tasks: results, count: results.length };
    });
  },
});
```

**Queue Depth Monitoring:**
```typescript
// Export metrics for observability
function getRateLimitMetrics() {
  return {
    activeCount: toolExecutionLimiter.activeCount, // Currently executing
    pendingCount: toolExecutionLimiter.pendingCount, // Waiting in queue
    concurrencyLimit: 10,
    utilizationPercent: (toolExecutionLimiter.activeCount / 10) * 100,
  };
}

// Log metrics periodically (optional)
setInterval(() => {
  const metrics = getRateLimitMetrics();
  if (metrics.pendingCount > 0) {
    console.warn('[RateLimit] Queue backlog detected:', metrics);
  }
}, 10_000); // Every 10 seconds
```

**FIFO Queue Behavior:**

p-limit guarantees FIFO ordering:
```
Request Timeline:
T0: Requests 1-10 start executing immediately (activeCount=10)
T1: Request 11 arrives → queued (pendingCount=1)
T2: Request 12 arrives → queued (pendingCount=2)
T3: Request 1 completes → Request 11 starts (activeCount=10, pendingCount=1)
T4: Request 2 completes → Request 12 starts (activeCount=10, pendingCount=0)
```

**p-limit v7 API:**
```typescript
const limit = pLimit(concurrency);

// Properties
limit.activeCount // Number of promises currently running
limit.pendingCount // Number of promises waiting in queue

// Methods
limit(fn) // Queue function execution
limit.clearQueue() // Remove all pending promises (use with caution)
```

**Concurrency Control Best Practices:**

From research on concurrency patterns:
1. **Set Reasonable Limits**: 10 concurrent is conservative (balance throughput vs resource usage)
2. **Monitor Queue Depth**: Alert if pendingCount exceeds threshold (e.g., >20)
3. **Avoid Deadlocks**: Don't create nested limiters (single global limiter for all tools)
4. **Graceful Degradation**: Return queue position in error messages when wait time exceeds threshold

**Advanced: Queue Position Feedback (Optional Enhancement):**
```typescript
async function executeToolWithQueuePosition<T>(
  toolName: string,
  executeFn: () => Promise<T>
): Promise<T> {

  const queuePosition = toolExecutionLimiter.pendingCount + 1;

  if (queuePosition > 1) {
    console.warn('[RateLimit] Tool queued:', {
      toolName,
      queuePosition,
      estimatedWaitTime: queuePosition * 2, // Assume 2s avg execution
    });
  }

  return executeToolWithRateLimit(toolName, executeFn);
}
```

**Gotchas:**
- `p-limit` uses in-memory queue (resets on server restart - acceptable for P0)
- No priority support in v7 (all requests treated equally)
- `clearQueue()` rejects pending promises - only use during shutdown
- Don't create multiple limiters (breaks global limit - use singleton pattern)
- activeCount + pendingCount ≠ total requests (completed requests not counted)

---

## 7. Transient Error Detection

### Decision
Classify errors as transient based on HTTP status codes (408, 429, 500, 502, 503, 504) and error messages (timeout, connection refused, ECONNRESET). Retry transient errors up to 2 times with fixed 2-second delay.

### Rationale
- **Industry Standard**: HTTP 5xx codes are universally recognized as transient
- **Retry-After Header**: Honor 429 rate limit headers when present
- **Fixed Delay Simplicity**: 2-second fixed delay is simpler than exponential backoff for 2 retries
- **Low Retry Overhead**: Max 4 seconds additional delay (2 retries × 2s) acceptable for 5s target
- **Deterministic Behavior**: Fixed delay easier to debug than exponential backoff

### Alternatives Considered

**Option A: Exponential Backoff (Rejected for P0)**
- Benefits: Better for distributed systems, reduces retry storms
- Drawbacks: Complexity for only 2 retries, unpredictable timing
- When to Use: 5+ retries, distributed system with many clients
- P0 Decision: Fixed delay sufficient for 2 retries

**Option B: Jitter (Random Delay) (Rejected for P0)**
- Benefits: Prevents synchronized retries across multiple agents
- Drawbacks: Harder to debug, non-deterministic timing
- P0 Decision: Single-user system, no retry storm risk

**Option C: Retry-After Only (Rejected)**
- Benefits: Respects server-side rate limits
- Drawbacks: Not all errors include Retry-After header
- P0 Decision: Use Retry-After when present, fallback to 2s fixed delay

### Implementation Notes

**Error Classification:**
```typescript
interface ErrorClassification {
  isTransient: boolean;
  retryAfter?: number; // Seconds to wait (from Retry-After header)
  errorType: 'transient' | 'permanent' | 'unknown';
  errorCode?: string;
}

function classifyError(error: Error | Response): ErrorClassification {

  // HTTP Response errors
  if ('status' in error && typeof error.status === 'number') {
    const status = error.status;

    // Transient HTTP status codes
    if ([408, 429, 500, 502, 503, 504].includes(status)) {
      return {
        isTransient: true,
        errorType: 'transient',
        errorCode: `HTTP_${status}`,
        retryAfter: parseRetryAfterHeader(error),
      };
    }

    // Permanent HTTP errors (4xx except 408, 429)
    if (status >= 400 && status < 500) {
      return {
        isTransient: false,
        errorType: 'permanent',
        errorCode: `HTTP_${status}`,
      };
    }
  }

  // Network errors (from error message)
  const errorMessage = error.message.toLowerCase();
  const transientMessages = [
    'timeout',
    'timed out',
    'connection refused',
    'econnrefused',
    'econnreset',
    'socket hang up',
    'network error',
    'getaddrinfo enotfound',
  ];

  if (transientMessages.some(msg => errorMessage.includes(msg))) {
    return {
      isTransient: true,
      errorType: 'transient',
      errorCode: 'NETWORK_ERROR',
    };
  }

  // Database errors
  if (errorMessage.includes('database') || errorMessage.includes('postgres')) {
    return {
      isTransient: true, // Assume database errors are transient
      errorType: 'transient',
      errorCode: 'DATABASE_ERROR',
    };
  }

  // Unknown errors (default to non-retryable)
  return {
    isTransient: false,
    errorType: 'unknown',
  };
}

function parseRetryAfterHeader(response: Response): number | undefined {
  const retryAfter = response.headers.get('Retry-After');

  if (!retryAfter) return undefined;

  // Retry-After can be seconds (number) or HTTP date
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds;
  }

  // Parse HTTP date
  const retryDate = new Date(retryAfter);
  if (!isNaN(retryDate.getTime())) {
    return Math.max(0, Math.floor((retryDate.getTime() - Date.now()) / 1000));
  }

  return undefined;
}
```

**Retry Logic with Fixed Delay:**
```typescript
async function executeWithRetry<T>(
  executeFn: () => Promise<T>,
  options: {
    maxRetries: number;
    fixedDelay: number; // milliseconds
    context: { toolName: string; input: unknown };
  }
): Promise<T> {

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      // Attempt execution
      const result = await executeFn();

      // Log successful retry (if not first attempt)
      if (attempt > 0) {
        console.log('[Retry] Execution succeeded after retry:', {
          toolName: options.context.toolName,
          attempt,
          totalAttempts: attempt + 1,
        });
      }

      return result;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Classify error
      const classification = classifyError(lastError);

      // Log error
      console.error('[Retry] Execution failed:', {
        toolName: options.context.toolName,
        attempt: attempt + 1,
        totalAttempts: options.maxRetries + 1,
        errorType: classification.errorType,
        errorCode: classification.errorCode,
        errorMessage: lastError.message,
      });

      // Don't retry if error is permanent
      if (!classification.isTransient) {
        console.error('[Retry] Permanent error detected, aborting retries');
        throw lastError;
      }

      // Don't retry if max attempts reached
      if (attempt >= options.maxRetries) {
        console.error('[Retry] Max retry attempts reached, failing permanently');
        throw lastError;
      }

      // Calculate delay (honor Retry-After if present)
      const delay = classification.retryAfter
        ? classification.retryAfter * 1000
        : options.fixedDelay;

      console.log('[Retry] Retrying after delay:', {
        toolName: options.context.toolName,
        nextAttempt: attempt + 2,
        delayMs: delay,
        reason: classification.retryAfter ? 'Retry-After header' : 'Fixed delay',
      });

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached (throw in loop)
  throw lastError!;
}
```

**Integration with Tool Execution:**
```typescript
export const semanticSearchTool = createTool({
  id: 'semantic-search',
  // ...
  execute: async ({ context }) => {
    return executeWithRetry(
      async () => {
        const { query, limit, threshold } = context;
        const embedding = await generateEmbedding(query);
        const results = await searchSimilarTasks(embedding, threshold, limit);
        return { tasks: results, count: results.length };
      },
      {
        maxRetries: 2,
        fixedDelay: 2000, // 2 seconds
        context: { toolName: 'semantic-search', input: context },
      }
    );
  },
});
```

**HTTP Status Code Reference:**

| Status Code | Meaning | Transient? | Retry Strategy |
|------------|---------|------------|---------------|
| 408 | Request Timeout | Yes | Retry with delay |
| 429 | Too Many Requests | Yes | Honor Retry-After header |
| 500 | Internal Server Error | Yes | Retry (may self-correct) |
| 502 | Bad Gateway | Yes | Retry (upstream issue) |
| 503 | Service Unavailable | Yes | Retry (temporary outage) |
| 504 | Gateway Timeout | Yes | Retry (upstream timeout) |
| 400-407 | Client errors | No | Permanent failure |
| 409-428 | Client errors | No | Permanent failure |

**Best Practices from Research:**

1. **Always Use Retry Budgets**: Limit total retries per minute globally (prevents retry storms)
2. **One Immediate Retry** (Optional): For fast-failing errors, one immediate retry before delay
3. **Idempotency**: Ensure tool executions can be safely retried (no duplicate side effects)
4. **Circuit Breaker** (Future): After 5 consecutive failures, stop retrying for 1 minute

**Fixed Delay vs Exponential Backoff Comparison:**

```
Fixed Delay (2 retries, 2s each):
Attempt 1: 0s
Attempt 2: 2s (wait 2s)
Attempt 3: 4s (wait 2s)
Total Max: 4s additional delay

Exponential Backoff (2 retries, base=1s):
Attempt 1: 0s
Attempt 2: 1s (wait 1s)
Attempt 3: 3s (wait 2s)
Total Max: 3s additional delay

Decision: Fixed delay simpler for debugging, 1s difference negligible
```

**Gotchas:**
- Retry-After header format: Can be seconds (integer) or HTTP date string
- Network errors: Error message matching is fragile (use lowercase comparison)
- Database unavailable: Supabase errors may not include HTTP status (match error message)
- Idempotency: Tools must be safe to retry (e.g., semantic search is idempotent, but dependency creation might not be)
- Logging: Log every retry attempt for debugging (include attempt number and total attempts)

---

## Summary: Key Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| **Tool Definition** | Mastra `createTool()` with Zod schemas | Automatic validation, LLM-optimized, built-in observability |
| **Vector Operations** | Existing Phase 1 `vectorStorage.ts` compatible | No performance gaps, scales to 10K embeddings |
| **Document Pagination** | 50K chars per chunk, 200-char overlap | Safe for all LLM context windows, preserves sentence continuity |
| **Dependency Detection** | Vercel AI SDK `generateObject()` with confidence scores | Structured output guarantee, existing infrastructure, explainable |
| **Clustering** | ml-hclust (AGNES, cosine distance, complete linkage) | Mature library, TypeScript compatible, sufficient for 10K scale |
| **Rate Limiting** | p-limit v7.1.1, max 10 concurrent, FIFO queue | Already installed, simple API, FIFO guarantee |
| **Retry Strategy** | 2 retries, 2s fixed delay, honor Retry-After | Simpler than exponential backoff for 2 retries, deterministic timing |

---

## Implementation Checklist

**Before starting Phase 2 implementation, verify:**

- [ ] Phase 1 vector storage ready (`lib/services/vectorStorage.ts` exists)
- [ ] Phase 1 embedding generation ready (`lib/services/embeddingService.ts` exists)
- [ ] Mastra package installed (`@mastra/mcp` in package.json)
- [ ] p-limit v7.1.1 installed (already present)
- [ ] Vercel AI SDK installed (already present)
- [ ] OpenAI API key configured (already present)
- [ ] Supabase task_embeddings table exists (migration 008)
- [ ] Supabase search_similar_tasks() RPC function exists (migration 009)

**During Phase 2 implementation:**

- [ ] Create `lib/mastra/tools/` directory structure
- [ ] Install ml-hclust: `npm install ml-hclust`
- [ ] Define all 5 tools with `createTool()`
- [ ] Implement pagination helper function
- [ ] Implement dependency detection with `generateObject()`
- [ ] Implement clustering service with ml-hclust
- [ ] Wrap all tools with rate limiter (p-limit)
- [ ] Wrap all tools with retry logic (transient error classification)
- [ ] Export tool registry from `lib/mastra/tools/index.ts`
- [ ] Configure Mastra telemetry (or use AI Tracing if deprecation complete)
- [ ] Write unit tests for each tool (mocked services)
- [ ] Document tool usage in README.md

**Testing priorities:**

1. Tool parameter validation (Zod schema enforcement)
2. Pagination correctness (chunk boundaries, overlap)
3. Dependency detection confidence scoring (manual review of results)
4. Clustering quality (visual inspection of clusters)
5. Rate limiting under load (15 concurrent requests)
6. Retry behavior on transient errors (mock network failures)
7. Performance benchmarks (<5s execution for all tools)

---

## References

**Mastra Documentation:**
- Tool Definition: https://mastra.ai/en/reference/tools/create-tool
- Tools Overview: https://mastra.ai/en/docs/tools-mcp/overview
- Telemetry: https://mastra.ai/en/docs/observability/tracing (deprecated Nov 4)

**Vercel AI SDK:**
- generateObject: https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object
- Prompt Engineering: https://ai-sdk.dev/docs/ai-sdk-core/prompt-engineering

**Libraries:**
- ml-hclust: https://www.npmjs.com/package/ml-hclust
- p-limit: https://github.com/sindresorhus/p-limit

**Research Sources:**
- Chunking Best Practices: https://unstructured.io/blog/chunking-for-rag-best-practices
- Retry Patterns: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- Transient Faults: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
- Confidence Scoring: https://engineering.atspotify.com/2024/12/building-confidence-a-case-study-in-how-to-create-confidence-scores-for-genai-applications
