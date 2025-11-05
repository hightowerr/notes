# Shape Up Pitch: Phase 2 - Tool Registry & Execution (Mastra)

## Problem

**The agent has no way to dynamically execute specialized queries based on reasoning needs.**

Imagine the agent reasoning:
> "I found 10 tasks related to revenue. Now I need to check if any of them have dependencies on tasks from other documents."

**Current system:** Agent can't do this. It would need:
1. A way to query the dependency graph
2. A way to fetch document context for those tasks
3. A way to trigger dependency detection AI
4. A standard format to call these operations

**Without tools, the agent is blind.** It can only work with the initial context provided—no way to explore, query, or analyze dynamically.

---

## Solution

**Use Mastra's `createTool()` to define 5 specialized tools with automatic validation and execution.**

### Appetite: 1 week (5 working days)

### Breadboard Sketch

```
┌───────────────────────────────────────────────────────────────┐
│                   MASTRA TOOL REGISTRY                        │
│  lib/mastra/tools/                                            │
│                                                               │
│  Each tool defined with createTool():                         │
│  ├─ id: "semantic-search"                                     │
│  ├─ description: "Search tasks by semantic similarity"        │
│  ├─ inputSchema: Zod schema (auto-validated by Mastra)       │
│  └─ execute: async function(context) => result               │
│                                                               │
│  ✨ Mastra handles:                                           │
│     - Tool registration                                       │
│     - Parameter validation                                    │
│     - Execution logging                                       │
│     - Error handling                                          │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│                   TOOL EXECUTION FLOW                         │
│                                                               │
│  Agent → "I need to search for revenue tasks"                 │
│     ↓                                                          │
│  Mastra agent auto-selects tool: semantic-search             │
│     ↓                                                          │
│  Mastra validates parameters: { query: "revenue" }           │
│     ↓                                                          │
│  Execute tool → Call vector search service                    │
│     ↓                                                          │
│  Mastra logs execution + returns result                       │
│     ↓                                                          │
│  Agent: "Good, now I'll check dependencies..."                │
└───────────────────────────────────────────────────────────────┘
```

### The 5 Core Tools (Mastra Implementation)

**Tool 1: `semantic-search`**
```typescript
// lib/mastra/tools/semanticSearch.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { vectorSearch } from '@/lib/services/embeddingService';

export const semanticSearchTool = createTool({
  id: 'semantic-search',
  description: 'Search for tasks semantically similar to a query string. Use this to find tasks related to a specific topic, outcome, or concept.',
  inputSchema: z.object({
    query: z.string().describe('Natural language search query'),
    limit: z.number().optional().default(20).describe('Maximum results to return'),
    threshold: z.number().optional().default(0.7).describe('Minimum similarity score'),
  }),
  execute: async ({ context }) => {
    const { query, limit, threshold } = context;

    // Call your existing vector search service
    const results = await vectorSearch({
      query,
      limit,
      threshold,
    });

    return {
      tasks: results,
      count: results.length,
    };
  },
});
```

**Tool 2: `get-document-context`**
```typescript
// lib/mastra/tools/getDocumentContext.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { fetchDocumentsByTaskIds } from '@/lib/services/documentService';

export const getDocumentContextTool = createTool({
  id: 'get-document-context',
  description: 'Retrieve full markdown content for documents containing specific tasks. Use this when you need to understand the context around tasks to detect relationships.',
  inputSchema: z.object({
    task_ids: z.array(z.string()).describe('Task IDs to fetch context for'),
  }),
  execute: async ({ context }) => {
    const { task_ids } = context;

    const documents = await fetchDocumentsByTaskIds(task_ids);

    return {
      documents: documents.map(doc => ({
        document_id: doc.id,
        filename: doc.filename,
        markdown: doc.markdown_content,
        tasks_in_document: doc.tasks,
      })),
    };
  },
});
```

**Tool 3: `detect-dependencies`**
```typescript
// lib/mastra/tools/detectDependencies.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { analyzeTaskDependencies } from '@/lib/services/dependencyService';

export const detectDependenciesTool = createTool({
  id: 'detect-dependencies',
  description: 'Analyze a set of tasks to detect prerequisite, blocking, or related relationships. Uses AI to understand semantic dependencies.',
  inputSchema: z.object({
    task_ids: z.array(z.string()).describe('Task IDs to analyze for dependencies'),
    use_document_context: z.boolean().default(true).describe('Whether to include document context in analysis'),
  }),
  execute: async ({ context }) => {
    const { task_ids, use_document_context } = context;

    const dependencies = await analyzeTaskDependencies(task_ids, {
      includeContext: use_document_context,
    });

    return {
      dependencies,
      analyzed_count: task_ids.length,
    };
  },
});
```

**Tool 4: `query-task-graph`**
```typescript
// lib/mastra/tools/queryTaskGraph.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/client';

export const queryTaskGraphTool = createTool({
  id: 'query-task-graph',
  description: 'Query the task dependency graph to find prerequisites, blockers, or related tasks. Use this to explore existing relationships.',
  inputSchema: z.object({
    task_id: z.string().describe('Task ID to query relationships for'),
    relationship_type: z.enum(['prerequisite', 'blocks', 'related', 'all'])
      .optional()
      .describe('Filter by relationship type'),
  }),
  execute: async ({ context }) => {
    const { task_id, relationship_type } = context;

    let query = supabase
      .from('task_relationships')
      .select('*')
      .eq('source_task_id', task_id);

    if (relationship_type && relationship_type !== 'all') {
      query = query.eq('relationship_type', relationship_type);
    }

    const { data, error } = await query;

    if (error) throw error;

    return {
      relationships: data || [],
      task_id,
    };
  },
});
```

**Tool 5: `cluster-by-similarity`**
```typescript
// lib/mastra/tools/clusterBySimilarity.ts
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { performHierarchicalClustering } from '@/lib/services/clusteringService';

export const clusterBySimilarityTool = createTool({
  id: 'cluster-by-similarity',
  description: 'Group tasks into clusters based on semantic similarity. Use this to find tasks that are conceptually related even if not explicitly linked.',
  inputSchema: z.object({
    task_ids: z.array(z.string()).describe('Task IDs to cluster'),
    similarity_threshold: z.number().optional().default(0.75).describe('Minimum similarity for clustering'),
  }),
  execute: async ({ context }) => {
    const { task_ids, similarity_threshold } = context;

    const clusters = await performHierarchicalClustering(task_ids, {
      threshold: similarity_threshold,
    });

    return {
      clusters,
      task_count: task_ids.length,
      cluster_count: clusters.length,
    };
  },
});
```

### Mastra Tool Registry Setup

**Create tool registry: `lib/mastra/tools/index.ts`**
```typescript
import { semanticSearchTool } from './semanticSearch';
import { getDocumentContextTool } from './getDocumentContext';
import { detectDependenciesTool } from './detectDependencies';
import { queryTaskGraphTool } from './queryTaskGraph';
import { clusterBySimilarityTool } from './clusterBySimilarity';

export const agentTools = [
  semanticSearchTool,
  getDocumentContextTool,
  detectDependenciesTool,
  queryTaskGraphTool,
  clusterBySimilarityTool,
];

export {
  semanticSearchTool,
  getDocumentContextTool,
  detectDependenciesTool,
  queryTaskGraphTool,
  clusterBySimilarityTool,
};
```

### What Mastra Gives You For Free

**1. Automatic Tool Registration**
- No need to build custom registry
- Tools auto-discovered by agent

**2. Built-in Validation**
- Zod schemas validated automatically
- Type-safe parameters

**3. Execution Logging**
- Tool calls logged to Mastra telemetry
- Duration, input, output tracked

**4. Error Handling**
- Automatic retry on failure (configurable)
- Structured error logs

**5. Observability**
- Tool execution traces available via Mastra API
- No custom logging infrastructure needed

---

## Rabbit Holes

**1. Building complex tool orchestration**
- **Risk:** Over-engineering tool chaining or parallel execution
- **Timebox:** Let Mastra agent handle tool sequence. No custom orchestration.
- **Why:** Mastra's agent runtime (Phase 3) decides tool order automatically.

**2. Tool versioning**
- **Risk:** Spending time on version management
- **Timebox:** Not in scope. All tools are v1. Breaking changes = new tool ID.
- **Why:** No existing tools yet. Optimize for speed.

**3. Custom tool authorization**
- **Risk:** Building per-tool permission system
- **Timebox:** Skip for P0. Single-user system.
- **Why:** Add auth when multi-user (Phase 5+).

**4. Tool result caching**
- **Risk:** Building cache invalidation logic
- **Timebox:** Not in scope. Execute fresh every time.
- **Why:** Agent sessions are short (<1 min). Minimal gain, high complexity.

---

## No-Gos

**❌ Custom tool registry infrastructure**
- Use Mastra's built-in system. Don't build from scratch.

**❌ Manual tool validation logic**
- Mastra validates with Zod automatically.

**❌ Custom tool execution API**
- Mastra handles tool calling. No `/api/agent/tools/execute` needed.

**❌ Tool marketplace or plugins**
- Fixed set of 5 tools. No dynamic loading.

**❌ Tool UI builder**
- Tools defined in code only.

---

## Success Metrics

**Functionality:**
- All 5 tools callable by Mastra agent
- Parameter validation works (Zod + Mastra)
- Tool execution logged automatically

**Performance:**
- Tool execution <5s (95th percentile)
- No memory leaks

**Observability:**
- Mastra telemetry captures: tool name, duration, input, output
- Error logs include stack traces

**Deliverables:**
- ✅ 5 tools defined using `createTool()`
- ✅ Tool registry exported from `lib/mastra/tools/index.ts`
- ✅ Unit tests for each tool (mocked services)
- ✅ Mastra telemetry configured
- ✅ Tool execution traces visible via Mastra API

---

## What Changed from Custom Implementation

| Feature | Custom (Original) | Mastra (New) |
|---------|------------------|--------------|
| Tool Definition | Manual registry object | `createTool()` with Zod |
| Validation | Custom Zod parsing | Automatic validation |
| Execution API | Custom `/api/agent/tools/execute` | Mastra handles internally |
| Logging | Custom `logToolExecution()` | Built-in telemetry |
| Error Handling | Manual try/catch | Automatic retry + logs |
| Time to Build | 3-4 days | 1-2 days |

**Time Saved:** 40-50% (2 days vs 4 days)
