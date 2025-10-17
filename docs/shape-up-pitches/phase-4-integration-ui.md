# Shape Up Pitch: Phase 4 - Integration & UI (Mastra)

## Problem

**The agent works but users can't see it working—no visibility into reasoning, no way to understand why tasks were prioritized.**

Current state:
- ✅ Agent can reason and execute tools (Phase 3)
- ✅ Agent produces prioritized task lists
- ❌ No UI to show reasoning trace
- ❌ No way to visualize dependencies
- ❌ No integration with existing recompute service
- ❌ Users see results but not HOW agent got there

**Trust issue:** Users won't trust AI-generated priorities if they can't see the reasoning. "Why is Task A before Task B?"

---

## Solution

**Integrate Mastra agent into recompute service and build UI using Mastra's telemetry API.**

### Appetite: 1 week (5 working days)

### Breadboard Sketch

```
┌─────────────────────────────────────────────────────────────┐
│              INTEGRATION FLOW (MASTRA)                      │
│                                                             │
│  User changes outcome                                       │
│    ↓                                                         │
│  recomputeService.ts triggers                               │
│    ↓                                                         │
│  ✨ Call Mastra: orchestrateTaskPriorities()                │
│    ↓                                                         │
│  Agent executes tools, builds plan                          │
│    ↓                                                         │
│  Mastra stores reasoning trace automatically                │
│    ↓                                                         │
│  Return execution ID to frontend                            │
│    ↓                                                         │
│  ✨ UI fetches trace via Mastra API                         │
│    ↓                                                         │
│  ✨ Visualize reasoning + dependency graph                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              UI COMPONENTS (NEW)                            │
│                                                             │
│  1. ReasoningTracePanel.tsx                                 │
│     - Fetch trace from Mastra API                           │
│     - Display: Thought → Tool → Result                      │
│     - Collapsible accordion (dev mode)                      │
│                                                             │
│  2. DependencyGraphVisualization.tsx                        │
│     - D3.js force-directed graph                            │
│     - Extract dependencies from tool outputs                │
│     - Color-coded edges: prerequisite/blocks/related        │
│                                                             │
│  3. ExecutionWavesTimeline.tsx                              │
│     - Topologically sorted task waves                       │
│     - Parallel vs sequential execution                      │
│     - Estimated duration per wave                           │
└─────────────────────────────────────────────────────────────┘
```

### Integration with Recompute Service

**Update `lib/services/recomputeService.ts`:**
```typescript
import { orchestrateTaskPriorities } from '@/lib/mastra/services/agentOrchestration';

export async function recomputeTaskPriorities(
  outcomeId: string,
  userId: string = 'anonymous-user-p0'
): Promise<{ executionId: string }> {
  console.log('[RecomputeService] Starting Mastra agent orchestration...');

  try {
    // Fetch initial context
    const context = await fetchTaskOrchestrationContext(userId);

    if (!context.outcome) {
      console.log('[RecomputeService] No active outcome, skipping');
      return { executionId: '' };
    }

    // ✨ Run Mastra agent
    const result = await orchestrateTaskPriorities(context);

    // Store results in your database
    await persistAgentResults(result);

    console.log('[RecomputeService] Orchestration complete:', {
      execution_id: result.session_id,
      steps_taken: result.metadata.steps_taken,
      tasks_prioritized: result.prioritized_tasks.length,
    });

    return { executionId: result.session_id };

  } catch (error) {
    console.error('[RecomputeService] Mastra agent failed:', error);
    throw error;
  }
}
```

### Mastra Telemetry API Endpoints

**Create Next.js API routes for Mastra telemetry:**

**Endpoint 1: Get Execution Trace**
```typescript
// app/api/agent/executions/[executionId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { taskOrchestratorAgent } from '@/lib/mastra/agents/taskOrchestrator';

export async function GET(
  request: NextRequest,
  { params }: { params: { executionId: string } }
) {
  try {
    // Fetch execution trace from Mastra
    const trace = await taskOrchestratorAgent.getExecutionTrace(params.executionId);

    return NextResponse.json({
      execution_id: trace.executionId,
      status: trace.status,
      duration_ms: trace.durationMs,
      steps: trace.steps.map(step => ({
        step_number: step.stepNumber,
        thought: step.content, // Agent's reasoning
        tool: step.toolName || null,
        tool_input: step.toolInput,
        tool_output: step.toolOutput,
        duration_ms: step.durationMs,
        timestamp: step.timestamp,
      })),
      metadata: {
        steps_taken: trace.steps.length,
        tools_used: trace.steps.filter(s => s.toolName).length,
      },
    });

  } catch (error) {
    console.error('[API] Failed to fetch execution trace:', error);
    return NextResponse.json(
      { error: 'Execution not found' },
      { status: 404 }
    );
  }
}
```

**Endpoint 2: Get All Executions (Optional)**
```typescript
// app/api/agent/executions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mastra } from '@/lib/mastra';

export async function GET(request: NextRequest) {
  try {
    // Fetch recent executions from Mastra
    const executions = await mastra.listExecutions({
      agentName: 'Task Orchestrator',
      limit: 20,
      orderBy: 'created_at',
    });

    return NextResponse.json({
      executions: executions.map(exec => ({
        execution_id: exec.executionId,
        status: exec.status,
        created_at: exec.createdAt,
        duration_ms: exec.durationMs,
        steps_count: exec.stepsCount,
      })),
    });

  } catch (error) {
    console.error('[API] Failed to list executions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch executions' },
      { status: 500 }
    );
  }
}
```

### UI Components

**Component 1: `ReasoningTracePanel.tsx`**
```typescript
// app/components/ReasoningTracePanel.tsx
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Code } from 'lucide-react';

interface ReasoningTracePanelProps {
  executionId: string;
}

export function ReasoningTracePanel({ executionId }: ReasoningTracePanelProps) {
  const [trace, setTrace] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrace() {
      try {
        const response = await fetch(`/api/agent/executions/${executionId}`);
        const data = await response.json();
        setTrace(data);
      } catch (error) {
        console.error('Failed to fetch reasoning trace:', error);
      } finally {
        setLoading(false);
      }
    }

    if (executionId) {
      fetchTrace();
    }
  }, [executionId]);

  if (loading) return <div>Loading reasoning trace...</div>;
  if (!trace) return null;

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="reasoning-trace">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4" />
            <span>Reasoning Trace ({trace.steps.length} steps)</span>
            <Badge variant="outline">Dev Mode</Badge>
            <Badge variant="secondary">{trace.duration_ms}ms</Badge>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            {trace.steps.map((step: any, i: number) => (
              <Card key={i} className="bg-bg-layer-3">
                <CardHeader>
                  <CardTitle className="text-sm">
                    Step {step.step_number}
                    {step.tool && (
                      <Badge className="ml-2" variant="outline">
                        {step.tool}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs text-text-muted">
                    {step.duration_ms}ms
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {/* Agent's thought process */}
                  <div>
                    <span className="font-semibold">Thought:</span>
                    <p className="text-text-muted mt-1">{step.thought}</p>
                  </div>

                  {/* Tool input/output if tool was used */}
                  {step.tool && (
                    <>
                      <div>
                        <span className="font-semibold">Input:</span>
                        <pre className="bg-bg-layer-1 p-2 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(step.tool_input, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <span className="font-semibold">Output:</span>
                        <pre className="bg-bg-layer-1 p-2 rounded mt-1 overflow-x-auto max-h-40">
                          {JSON.stringify(step.tool_output, null, 2).substring(0, 500)}
                          {JSON.stringify(step.tool_output).length > 500 && '...'}
                        </pre>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
```

**Component 2: `DependencyGraphVisualization.tsx`**
```typescript
// app/components/DependencyGraphVisualization.tsx
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface DependencyGraphProps {
  executionId: string;
}

export function DependencyGraphVisualization({ executionId }: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    async function fetchAndRender() {
      if (!svgRef.current) return;

      // Fetch execution trace
      const response = await fetch(`/api/agent/executions/${executionId}`);
      const data = await response.json();

      // Extract dependencies from detect-dependencies tool calls
      const dependencySteps = data.steps.filter(
        (s: any) => s.tool === 'detect-dependencies'
      );

      const allDependencies = [];
      const taskMap = new Map();

      for (const step of dependencySteps) {
        if (step.tool_output?.dependencies) {
          allDependencies.push(...step.tool_output.dependencies);
        }
      }

      // Build graph data
      const nodes = Array.from(
        new Set(
          allDependencies.flatMap((d: any) => [d.source_task_id, d.target_task_id])
        )
      ).map(id => ({ id, label: id.substring(0, 8) }));

      const links = allDependencies.map((d: any) => ({
        source: d.source_task_id,
        target: d.target_task_id,
        type: d.relationship_type,
      }));

      // Render D3 graph
      const width = 800;
      const height = 600;

      const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((d: any) => d.id))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2));

      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove(); // Clear previous

      const link = svg.append('g')
        .selectAll('line')
        .data(links)
        .enter().append('line')
        .attr('stroke', (d: any) => {
          if (d.type === 'prerequisite') return '#3b82f6'; // blue
          if (d.type === 'blocks') return '#ef4444'; // red
          return '#6b7280'; // gray
        })
        .attr('stroke-width', 2);

      const node = svg.append('g')
        .selectAll('circle')
        .data(nodes)
        .enter().append('circle')
        .attr('r', 10)
        .attr('fill', '#4f46e5');

      simulation.on('tick', () => {
        link
          .attr('x1', (d: any) => d.source.x)
          .attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x)
          .attr('y2', (d: any) => d.target.y);

        node
          .attr('cx', (d: any) => d.x)
          .attr('cy', (d: any) => d.y);
      });
    }

    if (executionId) {
      fetchAndRender();
    }
  }, [executionId]);

  return (
    <div className="border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-2">Task Dependencies</h3>
      <p className="text-xs text-text-muted mb-4">
        Blue = prerequisite, Red = blocks, Gray = related
      </p>
      <svg ref={svgRef} width={800} height={600} />
    </div>
  );
}
```

**Component 3: `ExecutionWavesTimeline.tsx`** (unchanged from original, reuses same logic)

---

## Rabbit Holes

**1. Building custom Mastra UI**
- **Risk:** Building visual workflow editor or agent playground
- **Timebox:** Use Mastra's built-in telemetry API only.
- **Why:** Mastra provides observability out-of-the-box. Custom UI is Phase 6+.

**2. Real-time streaming updates**
- **Risk:** Building WebSocket infrastructure for live progress
- **Timebox:** Show results after agent completes. No streaming for Phase 4.
- **Why:** Agent runs <30s. Users can wait for final result.

**3. Advanced graph layouts**
- **Risk:** Spending time on hierarchical or circular layouts
- **Timebox:** Use D3 force-directed layout only.
- **Why:** Good enough for <100 nodes. Optimize if needed later.

**4. Agent session history browser**
- **Risk:** Building UI to browse past executions
- **Timebox:** Show current execution only. History in Phase 6+.
- **Why:** Users care about current priorities, not past reasoning.

---

## No-Gos

**❌ Custom reasoning loop UI**
- Use Mastra's telemetry. Don't build custom trace storage.

**❌ Agent re-run from UI**
- Users can't trigger agent manually. Only via outcome changes.

**❌ Step-by-step agent execution (debugger)**
- Agent runs to completion. No pause/step/resume.

**❌ Agent performance profiling UI**
- No charts for token usage or tool execution times.

**❌ Export reasoning trace as PDF**
- Trace visible in UI only. No export feature.

---

## Success Metrics

**Integration:**
- Agent runs when user changes outcome (100% success rate)
- Recompute service completes in <45s

**UI Usability:**
- Reasoning trace comprehensible to non-technical users
- Dependency graph renders without lag (<2s)
- Execution waves show clear task ordering

**User Trust:**
- Manual review: 80% of dependency links make sense
- User survey: "I understand why tasks are prioritized" ≥4.0/5.0

**Deliverables:**
- ✅ `recomputeService.ts` integrated with Mastra agent
- ✅ `/api/agent/executions/[executionId]` endpoint functional
- ✅ `ReasoningTracePanel.tsx` fetches from Mastra API
- ✅ `DependencyGraphVisualization.tsx` renders D3 graph
- ✅ `ExecutionWavesTimeline.tsx` shows task sequence
- ✅ E2E test: User changes outcome → Agent runs → UI updates

---

## What Changed from Custom Implementation

| Feature | Custom (Original) | Mastra (New) |
|---------|------------------|--------------|
| Trace Storage | Custom database tables | Mastra telemetry DB |
| Trace Retrieval | Custom API endpoint | Mastra `getExecutionTrace()` |
| Agent Session Management | Custom `saveAgentSession()` | Built-in by Mastra |
| Reasoning Trace Format | Custom `ReasoningStep` | Mastra execution steps |
| Observability | Custom logging | Built-in telemetry |
| Time to Build | 4-5 days | 2-3 days |

**Time Saved:** 40-50% (2-3 days vs 5 days)

**Key Benefit:** No need to build custom trace storage or retrieval. Mastra handles everything.
