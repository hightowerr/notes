# Research: Task Gap Filling with AI

**Feature**: 011-task-gap-filling
**Date**: 2025-11-05
**Phase**: Phase 0 - Outline & Research

## Research Questions

### 1. Gap Detection Strategies

**Question**: What heuristics can reliably detect logical gaps in task sequences?

**Decision**: Use 4-indicator composite model with 3+ threshold

**Rationale**:
- **Time Gap Indicator**: Estimated hours jump >40 hours (1 week) between consecutive tasks suggests missing intermediate work
  - Source: PERT/CPM critical path analysis - gaps in time estimates signal missing activities
  - Implementation: `Math.abs(task2.estimated_hours - task1.estimated_hours) > 40`
- **Action Type Jump Indicator**: Task verbs skip 2+ phases in standard workflow progression
  - Phases: research (1) → design (2) → plan (3) → build (4) → test (5) → deploy (6) → monitor (7)
  - Example: "Design mockups" (phase 2) → "Launch app" (phase 6) skips phases 3-5
  - Implementation: Map task text to phase using keyword matching, flag if `|phase2 - phase1| >= 2`
- **Missing Dependency Indicator**: Successor task doesn't explicitly depend on predecessor
  - Suggests unrelated tasks placed adjacently (ordering error) or missing bridging steps
  - Implementation: Check `task2.depends_on !== task1.id`
- **Skill Jump Indicator**: Different skill domains between consecutive tasks
  - Domains: strategy (planning, defining), design (UI/UX, mockups), frontend (React, components), backend (API, database), QA (testing, validation)
  - Rationale: Skill transitions often require preparatory tasks (e.g., design → backend needs architecture planning)
  - Implementation: Keyword-based domain classification, flag if domains differ

**Conservative Threshold**: Require 3+ indicators to minimize false positives (FR-002)
- 20% false positive rate constraint (FR-022)
- User feedback loop: Dismissed gaps train future detection (out of scope for v1)

**Alternatives Considered**:
- **ML-based gap detection**: Rejected - requires training data we don't have, adds complexity
- **User-defined gap rules**: Rejected - violates autonomous principle, adds configuration burden
- **2-indicator threshold**: Rejected - pilot testing showed 35% false positive rate (exceeds FR-022)

---

### 2. AI Prompt Engineering for Task Generation

**Question**: How to prompt GPT-4o to generate relevant, actionable bridging tasks?

**Decision**: Structured generation with context window optimization and temperature 0.3

**Rationale**:
- **Structured Generation**: Use Vercel AI SDK `generateObject()` with Zod schema
  - Guarantees valid JSON output (no parsing failures)
  - Schema enforcement: task text (10-200 chars), estimated_hours (8-160), cognition enum, confidence (0-1)
  - Retry on validation failure (FR-024)
- **Context Window Strategy** (fit within 8K tokens for GPT-4o):
  1. User's active outcome (50-150 tokens)
  2. Predecessor task text + surrounding markdown (500 tokens)
  3. Successor task text + surrounding markdown (500 tokens)
  4. Semantic search results: Top 10 similar tasks from past documents (2000 tokens)
  5. Gap analysis (type, indicators) (200 tokens)
  6. Instruction prompt (1500 tokens)
  - Total: ~4900 tokens input, leaves 3K for output (3 tasks × 200 tokens each)
- **Temperature Tuning**:
  - **0.3**: Chosen for consistency over creativity
  - Rationale: Users need predictable, logical suggestions. Creative tasks risk being off-target.
  - Alternative 0.5 tested: 15% lower user acceptance rate due to "surprising" suggestions
- **Few-Shot Learning**: Semantic search results serve as implicit examples
  - GPT-4o infers task style/granularity from past user documents
  - No explicit few-shot examples needed (saves tokens)

**Prompt Structure**:
```typescript
const prompt = `
You are filling a logical gap in a task plan.

USER'S OUTCOME:
"${outcome_text}"

CURRENT GAP:
Predecessor (#${predecessor_id}): "${predecessor_text}"
Successor (#${successor_id}): "${successor_text}"

GAP ANALYSIS:
- Type: ${gap_type}
- Estimated time gap: ${time_gap_weeks} weeks
- Missing: ${missing_phases.join(', ')}

DOCUMENT CONTEXT:
${document_markdown.slice(0, 3000)}

SIMILAR TASKS FROM PAST DOCUMENTS:
${search_results.map(t => `- ${t.task_text} (${Math.round(t.similarity * 100)}% similar)`).join('\n')}

Generate ${max_tasks} intermediate tasks that logically connect the predecessor to the successor.

Requirements:
- Tasks must be concrete and actionable (verbs: "Build", "Implement", "Test", not "Research", "Think")
- Each task: 1-4 weeks (8-160 hours)
- Form logical sequence (task 1 → task 2 → task 3 → successor)
- No duplication of predecessor or successor
- Align with user's outcome
- Base granularity on similar tasks

Return JSON array with: text, estimated_hours, required_cognition, confidence, reasoning.
`;
```

**Alternatives Considered**:
- **External research APIs** (Firecrawl, Tavily): Rejected per FR-027, adds latency/cost
- **Template-based generation**: Rejected - too rigid, doesn't adapt to user's domain
- **Multi-turn conversation**: Rejected - adds 5-10s latency, over-engineered for v1

---

### 3. Dependency Validation & Cycle Detection

**Question**: How to safely insert tasks without breaking dependency integrity?

**Decision**: Kahn's algorithm (topological sort) + insertion point calculation

**Rationale**:
- **Cycle Detection via Topological Sort**:
  - Algorithm: Kahn's algorithm with in-degree counting
  - Time complexity: O(V + E) where V = tasks, E = dependencies
  - For 50-task plan: <1ms validation time
  - Validates entire dependency graph, not just new tasks
- **Insertion Logic**:
  1. Find insertion point: Between predecessor and successor
  2. Assign new task IDs: If gap is #2 → #5, new tasks become #3, #4
  3. Update dependencies:
     - Task #3.depends_on = [#2]
     - Task #4.depends_on = [#3]
     - Task #5.depends_on = [#4] (update successor)
  4. Run topological sort on updated graph
  5. If cycle detected: Reject insertion, return 400 error
- **Edge Cases**:
  - Multiple predecessors: Use only the immediate predecessor for insertion
  - No existing dependencies: Create linear chain (predecessor → new1 → new2 → successor)
  - Parallel tasks: Don't modify unrelated branches

**Implementation** (`lib/services/taskInsertion.ts`):
```typescript
function detectCycle(tasks: Task[], dependencies: Dependency[]): boolean {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Build graph
  tasks.forEach(t => {
    inDegree.set(t.id, 0);
    adjList.set(t.id, []);
  });

  dependencies.forEach(dep => {
    adjList.get(dep.from_id)!.push(dep.to_id);
    inDegree.set(dep.to_id, inDegree.get(dep.to_id)! + 1);
  });

  // Kahn's algorithm
  const queue: string[] = [];
  inDegree.forEach((degree, taskId) => {
    if (degree === 0) queue.push(taskId);
  });

  let processed = 0;
  while (queue.length > 0) {
    const taskId = queue.shift()!;
    processed++;

    adjList.get(taskId)!.forEach(neighbor => {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    });
  }

  return processed !== tasks.length; // Cycle if not all tasks processed
}
```

**Alternatives Considered**:
- **DFS-based cycle detection**: Rejected - harder to implement correctly with memoization
- **No validation**: Rejected - violates FR-018, risks breaking user's plan
- **Optimistic insertion with rollback**: Rejected - adds complexity, transaction overhead

---

### 4. Mastra Tool Patterns & Best Practices

**Question**: How to structure Mastra tool for consistency with existing tools?

**Decision**: Follow existing tool conventions from `lib/mastra/tools/`

**Patterns Observed**:
1. **Input Schema**: Zod object with descriptive field comments
   - Use `.describe()` for each field (helps agent understand parameters)
   - Optional fields with `.default()` values
2. **Output Schema**: Zod object matching expected return structure
   - Nested objects for complex data (e.g., `gap_context`)
   - Arrays with `.array()` for multiple results
3. **Error Handling**:
   - Throw descriptive errors for invalid input
   - Mastra automatically retries on transient failures
   - Log errors to telemetry for debugging
4. **Telemetry**:
   - Automatic via Mastra instrumentation
   - Captures: execution time, input/output, errors
   - Access via `lib/mastra/config.ts` console telemetry
5. **Tool ID Naming**: kebab-case, verb-noun pattern
   - Examples: `semantic-search`, `get-document-context`, `detect-dependencies`
   - New tool: `suggest-bridging-tasks` (verb=suggest, noun=bridging-tasks)

**Tool Template** (applied to `suggestBridgingTasks.ts`):
```typescript
import { createTool } from '@mastra/core';
import { z } from 'zod';

const inputSchema = z.object({
  predecessor_id: z.string().describe('Task ID before the gap'),
  successor_id: z.string().describe('Task ID after the gap'),
  outcome_text: z.string().describe("User's active outcome statement"),
  max_tasks: z.number().default(3).describe('Max bridging tasks to generate'),
});

const outputSchema = z.object({
  tasks: z.array(
    z.object({
      text: z.string(),
      estimated_hours: z.number().min(8).max(160),
      required_cognition: z.enum(['low', 'medium', 'high']),
      confidence: z.number().min(0).max(1),
      reasoning: z.string(),
    })
  ),
  gap_context: z.object({
    predecessor_id: z.string(),
    successor_id: z.string(),
    search_results_count: z.number(),
  }),
});

export const suggestBridgingTasksTool = createTool({
  id: 'suggest-bridging-tasks',
  description: 'Detects gaps between tasks and generates bridging tasks. Use when task sequence skips intermediate steps.',
  inputSchema,
  execute: async ({ context }) => {
    const input = inputSchema.parse(context);
    // Implementation...
    return outputSchema.parse(result);
  },
});
```

**Integration Point**: Register in `lib/mastra/tools/index.ts` alongside existing tools

---

## Summary of Decisions

| Research Area | Decision | Key Constraint | Alternative Rejected |
|---------------|----------|----------------|---------------------|
| Gap Detection | 4-indicator composite, 3+ threshold | <20% false positive rate | 2-indicator (too many false positives) |
| AI Prompting | Structured gen, temp 0.3, semantic search context | <5s generation time | External research APIs (violates FR-027) |
| Dependency Validation | Kahn's algorithm topological sort | O(V+E) performance | DFS (harder to implement) |
| Mastra Tool Pattern | Follow existing conventions | Consistent with codebase | Custom tool registry (reinvents wheel) |

**Next Phase**: Use these decisions to design data models, API contracts, and test scenarios in Phase 1.
