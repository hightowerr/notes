# Shape Up Pitch: Phase 3 - Agent Runtime & Reasoning Loop (Mastra)

## Problem

**The agent has tools but no brain—no way to decide WHICH tool to use WHEN.**

Imagine giving a human a toolbox (hammer, screwdriver, saw) but no ability to think about which tool solves which problem. They'd just randomly grab tools.

**Current gap:** We have:
- ✅ Tools that can be executed (Phase 2)
- ✅ Data that can be queried
- ❌ No decision-making logic
- ❌ No reasoning trace
- ❌ No multi-step planning

**What we need:** An agent that can:
1. Analyze the goal ("Prioritize tasks for this outcome")
2. Decide what information is missing
3. Choose the right tool to get that information
4. Reason about the tool output
5. Repeat until goal is achieved
6. Synthesize final result

---

## Solution

**Use Mastra's `createAgent()` to build an agentic reasoning loop with automatic tool selection.**

### Appetite: 1 week (5 working days)

### Breadboard Sketch

```
┌─────────────────────────────────────────────────────────────┐
│              MASTRA AGENT RUNTIME                           │
│  lib/mastra/agents/taskOrchestrator.ts                      │
│                                                             │
│  Input: goal = "Prioritize tasks for outcome X"            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  MASTRA AUTO-LOOP (max 10 steps):                    │ │
│  │                                                       │ │
│  │  Step 1: GPT-4o thinks                               │ │
│  │    ↓                                                  │ │
│  │    "I need to find revenue tasks"                    │ │
│  │    Mastra selects tool: semantic-search              │ │
│  │    ↓                                                  │ │
│  │  Step 2: Mastra executes tool                        │ │
│  │    ↓                                                  │ │
│  │    Result: [10 revenue tasks]                        │ │
│  │    Mastra logs to telemetry                          │ │
│  │    ↓                                                  │ │
│  │  Step 3: GPT-4o reasons                              │ │
│  │    ↓                                                  │ │
│  │    "Now I'll check dependencies"                     │ │
│  │    Mastra selects tool: detect-dependencies          │ │
│  │    ↓                                                  │ │
│  │  Step 4: Mastra executes tool                        │ │
│  │    ↓                                                  │ │
│  │    Result: [Task A blocks Task B]                    │ │
│  │    ↓                                                  │ │
│  │  Step 5: GPT-4o synthesizes                          │ │
│  │    ↓                                                  │ │
│  │    "I have enough info. Here's the plan..."          │ │
│  │    Action: FINISH (Mastra completes)                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  Output: {                                                  │
│    text: "Final prioritized plan..."                       │
│    toolResults: [...]                                      │
│    executionId: "uuid"                                     │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

### Core Implementation

**Agent Definition with Mastra:**
```typescript
// lib/mastra/agents/taskOrchestrator.ts
import { createAgent } from '@mastra/core';
import { openai } from '@mastra/core';
import { agentTools } from '../tools';

export const taskOrchestratorAgent = createAgent({
  name: 'Task Orchestrator',
  instructions: `You are a Task Orchestration Agent. Your goal is to analyze user outcomes and prioritize tasks across multiple documents.

TASK:
- Analyze the user's outcome statement
- Use tools to explore tasks, detect dependencies, and cluster related work
- Generate a prioritized task list with execution sequence

AVAILABLE CONTEXT:
- User outcome: Direction, object, metric, clarifier
- Recent reflections: User's recent thoughts and priorities
- All tasks: Extracted from uploaded documents
- Existing relationships: Previously detected dependencies

REASONING APPROACH:
1. Start with semantic search to find relevant tasks
2. Fetch document context to understand relationships
3. Detect dependencies between tasks
4. Query existing graph for known relationships
5. Cluster similar tasks for batch execution
6. Synthesize final prioritized sequence

OUTPUT STRUCTURE:
- Prioritized task list with execution order
- Dependency graph (which tasks block which)
- Execution waves (parallel vs sequential batches)
- Confidence score for each prioritization decision`,

  model: openai('gpt-4o', {
    temperature: 0.2, // Low temp for consistent reasoning
    maxTokens: 4000,
  }),

  tools: agentTools, // All 5 tools from Phase 2

  enableMemory: true, // Mastra memory for session state

  maxSteps: 10, // Max reasoning steps
});
```

**Execution Function:**
```typescript
// lib/mastra/services/agentOrchestration.ts
import { taskOrchestratorAgent } from '../agents/taskOrchestrator';
import type { OrchestrationContext } from '@/lib/types';

export async function orchestrateTaskPriorities(
  context: OrchestrationContext
): Promise<OrchestrationResult> {

  const goal = `Prioritize tasks for user outcome: "${context.outcome.assembled_text}"

CONTEXT:
- User State: ${context.outcome.state_preference}
- Daily Capacity: ${context.outcome.daily_capacity_hours}h
- Recent Reflections: ${context.reflections.length} items
- Total Tasks: ${context.tasks.length}

Generate a prioritized execution plan.`;

  // Mastra agent handles everything
  const response = await taskOrchestratorAgent.generate({
    messages: [
      {
        role: 'user',
        content: goal,
      },
    ],
    context: {
      // Make context available to tools
      outcome: context.outcome,
      reflections: context.reflections,
      tasks: context.tasks,
      metadata: context.metadata,
    },
  });

  // Extract reasoning trace from Mastra
  const trace = await taskOrchestratorAgent.getExecutionTrace(response.executionId);

  return {
    status: 'completed',
    session_id: response.executionId,
    goal,
    prioritized_tasks: parseTasksFromResponse(response.text),
    dependencies: extractDependenciesFromTrace(trace),
    clusters: extractClustersFromTrace(trace),
    reasoning_trace: trace.steps,
    metadata: {
      steps_taken: trace.steps.length,
      tools_used: trace.steps.filter(s => s.toolName).length,
      execution_time_ms: trace.durationMs,
    },
  };
}
```

**Result Parsing:**
```typescript
// lib/mastra/services/resultParser.ts
import type { MastraExecutionTrace } from '@mastra/core';

export function extractDependenciesFromTrace(trace: MastraExecutionTrace) {
  // Find all detect-dependencies tool calls
  const dependencySteps = trace.steps.filter(
    step => step.toolName === 'detect-dependencies'
  );

  const allDependencies = [];
  for (const step of dependencySteps) {
    if (step.toolOutput?.dependencies) {
      allDependencies.push(...step.toolOutput.dependencies);
    }
  }

  return allDependencies;
}

export function extractClustersFromTrace(trace: MastraExecutionTrace) {
  // Find cluster-by-similarity tool calls
  const clusterSteps = trace.steps.filter(
    step => step.toolName === 'cluster-by-similarity'
  );

  const allClusters = [];
  for (const step of clusterSteps) {
    if (step.toolOutput?.clusters) {
      allClusters.push(...step.toolOutput.clusters);
    }
  }

  return allClusters;
}

export function parseTasksFromResponse(responseText: string) {
  // Parse final agent response into structured task list
  // Agent will output structured JSON in response
  // Example: { prioritized_tasks: [...], execution_waves: [...] }

  try {
    const parsed = JSON.parse(responseText);
    return parsed.prioritized_tasks || [];
  } catch (error) {
    console.error('[Parser] Failed to parse agent response:', error);
    return [];
  }
}
```

### What Mastra Gives You For Free

**1. Automatic Tool Selection**
- GPT-4o decides which tools to call
- No manual decision logic needed

**2. Built-in Reasoning Loop**
- Mastra handles loop execution
- Automatic stopping when goal achieved

**3. Memory Management**
- Session state persisted automatically
- Conversation history tracked

**4. Execution Tracing**
- Every step logged with:
  - Thought process
  - Tool called
  - Tool input
  - Tool output
  - Duration

**5. Error Handling**
- Automatic retry on tool failure
- Graceful degradation

**6. Streaming Support**
- Real-time updates (optional for Phase 4)
- Progress tracking

---

## Rabbit Holes

**1. Building custom agent memory**
- **Risk:** Implementing vector memory or RAG over past sessions
- **Timebox:** Use Mastra's built-in memory only.
- **Why:** Mastra handles session state automatically. Long-term learning is Phase 6.

**2. Multi-agent coordination**
- **Risk:** Building hierarchical agents or agent-to-agent communication
- **Timebox:** Single agent only.
- **Why:** One agent is enough for task orchestration.

**3. Custom reasoning loop logic**
- **Risk:** Overriding Mastra's loop with custom logic
- **Timebox:** Trust Mastra's loop. Only customize via instructions.
- **Why:** Mastra's loop is battle-tested. Don't reinvent the wheel.

**4. Prompt optimization**
- **Risk:** Spending weeks tuning agent instructions
- **Timebox:** 1 day for initial instructions. Iterate based on usage.
- **Why:** Instructions will evolve with user feedback.

---

## No-Gos

**❌ Custom reasoning loop implementation**
- Use Mastra's `agent.generate()`. Don't build from scratch.

**❌ Manual tool execution logic**
- Mastra handles tool calling automatically.

**❌ Custom agent state management**
- Mastra persists state. Don't build custom session handling.

**❌ Agent learning from past sessions**
- No reinforcement learning or prompt tuning (Phase 6+).

**❌ Human-in-the-loop approval**
- Agent executes autonomously. No approval gates mid-reasoning.

**❌ Multi-modal reasoning**
- Text-only. Documents already converted to markdown.

---

## Success Metrics

**Correctness:**
- Agent achieves goal in ≤10 steps for 90% of sessions
- Reasoning trace is logically coherent (manual review)

**Performance:**
- Reasoning loop completes in <30s (including tool execution)
- Tool selection accuracy >80% (agent picks relevant tools)

**Observability:**
- All agent decisions logged via Mastra telemetry
- Reasoning trace retrievable via `getExecutionTrace()`

**Deliverables:**
- ✅ `taskOrchestratorAgent` defined with Mastra
- ✅ Agent instructions tuned for tool selection
- ✅ `orchestrateTaskPriorities()` service function
- ✅ Result parsing logic (extract tasks, dependencies, clusters)
- ✅ Unit tests for result parsing (mocked Mastra responses)
- ✅ Integration test: End-to-end agent session

---

## What Changed from Custom Implementation

| Feature | Custom (Original) | Mastra (New) |
|---------|------------------|--------------|
| Agent Loop | Custom `while` loop | `agent.generate()` |
| Tool Selection | Manual GPT-4o prompt | Automatic by Mastra |
| State Management | Custom `AgentState` object | Built-in memory |
| Reasoning Trace | Custom logging | `getExecutionTrace()` |
| Error Handling | Manual try/catch | Automatic retry |
| Memory | Custom session storage | PostgreSQL/LibSQL |
| Time to Build | 4-5 days | 1-2 days |

**Time Saved:** 50-60% (2 days vs 5 days)

**Key Benefit:** Focus on agent instructions and result parsing instead of infrastructure.
