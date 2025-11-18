import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import {
  agentMockTables,
  resetAgentMockTables,
} from '../mocks/agentSupabaseMock';

const DEFAULT_USER_ID = 'default-user';

type OrchestrateOptions = {
  sessionId: string;
  userId: string;
  outcomeId: string;
  activeReflectionIds?: string[];
};

const orchestrateTaskPrioritiesImpl = async ({ sessionId }: OrchestrateOptions) => {
  const session = agentMockTables.agent_sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, 0));

  const prioritizedPlan = {
    ordered_task_ids: ['task-001', 'task-002', 'task-003'],
    execution_waves: [
      { wave_number: 1, task_ids: ['task-001'], parallel_execution: false },
      {
        wave_number: 2,
        task_ids: ['task-002', 'task-003'],
        parallel_execution: true,
      },
    ],
    dependencies: [
      {
        source_task_id: 'task-003',
        target_task_id: 'task-002',
        relationship_type: 'prerequisite',
        confidence: 0.88,
        detection_method: 'ai_inference',
      },
    ],
    confidence_scores: {
      'task-001': 0.94,
      'task-002': 0.89,
      'task-003': 0.86,
    },
    synthesis_summary:
      'Complete kickoff task first, then progress to documentation and communication in parallel.',
  };

  Object.assign(session, {
    status: 'completed' as const,
    prioritized_plan: prioritizedPlan,
    baseline_plan: {
      ...prioritizedPlan,
      created_at: new Date().toISOString(),
    },
    execution_metadata: {
      steps_taken: 3,
      tool_call_count: {
        'semantic-search': 1,
        'detect-dependencies': 1,
        'cluster-by-similarity': 1,
      },
      thinking_time_ms: 1600,
      tool_execution_time_ms: 2400,
      total_time_ms: 4000,
      error_count: 0,
      success_rate: 1,
      status_note: null,
    },
    updated_at: new Date().toISOString(),
  });

  agentMockTables.reasoning_traces.push({
    id: randomUUID(),
    session_id: sessionId,
    steps: [
      {
        step_number: 1,
        timestamp: new Date().toISOString(),
        thought: 'Identify high-impact tasks aligned with the outcome.',
        tool_name: 'semantic-search',
        tool_input: { query: 'increase revenue outcome context', limit: 10, threshold: 0.7 },
        tool_output: {
          tasks: [
            { task_id: 'task-001', task_text: 'Conduct kickoff workshop', similarity: 0.91 },
          ],
        },
        duration_ms: 1200,
        status: 'success',
      },
      {
        step_number: 2,
        timestamp: new Date().toISOString(),
        thought: 'Check dependencies between shortlisted tasks.',
        tool_name: 'detect-dependencies',
        tool_input: { task_ids: ['task-001', 'task-002', 'task-003'] },
        tool_output: {
          dependencies: [
            {
              source_task_id: 'task-003',
              target_task_id: 'task-002',
              relationship_type: 'prerequisite',
              confidence: 0.88,
            },
          ],
        },
        duration_ms: 1500,
        status: 'success',
      },
      {
        step_number: 3,
        timestamp: new Date().toISOString(),
        thought: 'Cluster related work to recommend parallel execution.',
        tool_name: 'cluster-by-similarity',
        tool_input: { task_ids: ['task-002', 'task-003'], similarity_threshold: 0.75 },
        tool_output: {
          clusters: [
            {
              cluster_id: 1,
              task_ids: ['task-002', 'task-003'],
              average_similarity: 0.82,
            },
          ],
        },
        duration_ms: 1300,
        status: 'success',
      },
    ],
    total_duration_ms: 4000,
    total_steps: 3,
    tools_used_count: {
      'semantic-search': 1,
      'detect-dependencies': 1,
      'cluster-by-similarity': 1,
    },
    created_at: new Date().toISOString(),
  });
};

const orchestrateTaskPriorities = vi.fn(orchestrateTaskPrioritiesImpl);

vi.mock('@/lib/mastra/services/agentOrchestration', () => ({
  orchestrateTaskPriorities,
}));

type SupabaseClient = Awaited<ReturnType<typeof import('@supabase/supabase-js')['createClient']>>;
type AgentPostRoute = typeof import('@/app/api/agent/prioritize/route')['POST'];
type SessionGetRoute = typeof import('@/app/api/agent/sessions/[sessionId]/route')['GET'];
type TraceGetRoute = typeof import('@/app/api/agent/sessions/[sessionId]/trace/route')['GET'];

describe('Agent Orchestration Integration (T012)', () => {
  const originalFetch = global.fetch;
  let supabaseClient: SupabaseClient;
  let agentPrioritizePOST: AgentPostRoute;
  let agentSessionGET: SessionGetRoute;
  let agentTraceGET: TraceGetRoute;
  let fetchMock: ReturnType<typeof vi.fn>;
  let activeOutcomeId: string;

  const pollSessionUntilCompleted = async (sessionId: string) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`http://localhost/api/agent/sessions/${sessionId}`);
      const payload = await response.json();

      if (payload.session?.status === 'completed') {
        return payload.session;
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw new Error('Agent session did not reach completed status in time');
  };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-key';

    const supabaseModule = await import('@supabase/supabase-js');
    supabaseClient = supabaseModule.createClient('http://localhost:54321', 'test-key');

    ({ POST: agentPrioritizePOST } = await import('@/app/api/agent/prioritize/route'));
    ({ GET: agentSessionGET } = await import('@/app/api/agent/sessions/[sessionId]/route'));
    ({ GET: agentTraceGET } = await import('@/app/api/agent/sessions/[sessionId]/trace/route'));
  });

  beforeEach(async () => {
    resetAgentMockTables();
    vi.clearAllMocks();
    orchestrateTaskPriorities.mockImplementation(orchestrateTaskPrioritiesImpl);

    const now = new Date().toISOString();
    const outcomeInsert = await supabaseClient
      .from('user_outcomes')
      .insert({
        user_id: DEFAULT_USER_ID,
        direction: 'increase',
        object_text: 'monthly recurring revenue',
        metric_text: '25% within 6 months',
        clarifier: 'enterprise account expansion',
        assembled_text:
          'Increase the monthly recurring revenue by 25% within 6 months through enterprise account expansion',
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    activeOutcomeId = outcomeInsert.data?.id ?? randomUUID();

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request =
        input instanceof Request
          ? input
          : new Request(typeof input === 'string' ? input : input.toString(), init);

      const url = new URL(request.url, 'http://localhost');
      const method = request.method.toUpperCase();

      if (url.pathname === '/api/agent/prioritize' && method === 'POST') {
        return agentPrioritizePOST(request);
      }

      const sessionMatch = url.pathname.match(/^\/api\/agent\/sessions\/([^/]+)(\/trace)?$/);
      if (sessionMatch) {
        const [, sessionId, traceSuffix] = sessionMatch;
        if (traceSuffix) {
          return agentTraceGET(request, { params: Promise.resolve({ sessionId }) });
        }
        return agentSessionGET(request, { params: Promise.resolve({ sessionId }) });
      }

      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('completes the prioritization flow and exposes reasoning trace details', async () => {
    const triggerResponse = await fetch('http://localhost/api/agent/prioritize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        outcome_id: activeOutcomeId,
        user_id: DEFAULT_USER_ID,
      }),
    });

    expect(triggerResponse.status).toBe(200);
    const triggerPayload = await triggerResponse.json();
    expect(triggerPayload.status).toBe('running');
    expect(triggerPayload.session_id).toBeDefined();
    expect(triggerPayload.prioritized_plan).toBeNull();

    const sessionId: string = triggerPayload.session_id;

    const session = await pollSessionUntilCompleted(sessionId);

    expect(session.status).toBe('completed');
    expect(session.execution_metadata.total_time_ms).toBeLessThan(30000);
    expect(session.execution_metadata.steps_taken).toBeGreaterThan(0);
    expect(session.prioritized_plan).toMatchObject({
      ordered_task_ids: ['task-001', 'task-002', 'task-003'],
      execution_waves: expect.arrayContaining([
        expect.objectContaining({ wave_number: 1, task_ids: ['task-001'] }),
        expect.objectContaining({
          wave_number: 2,
          task_ids: expect.arrayContaining(['task-002', 'task-003']),
          parallel_execution: true,
        }),
      ]),
      dependencies: expect.arrayContaining([
        expect.objectContaining({
          source_task_id: 'task-003',
          target_task_id: 'task-002',
          relationship_type: 'prerequisite',
        }),
      ]),
    });
    expect(session.baseline_plan).toMatchObject({
      ordered_task_ids: ['task-001', 'task-002', 'task-003'],
      created_at: expect.any(String),
    });

    const traceResponse = await fetch(
      `http://localhost/api/agent/sessions/${sessionId}/trace`,
    );
    expect(traceResponse.status).toBe(200);

    const tracePayload = await traceResponse.json();
    expect(tracePayload.trace).toBeDefined();
    expect(tracePayload.trace.steps).toHaveLength(3);

    const toolNames = tracePayload.trace.steps
      .map((step: Record<string, unknown>) => step.tool_name)
      .filter(Boolean);

    expect(toolNames).toEqual(
      expect.arrayContaining(['semantic-search', 'detect-dependencies', 'cluster-by-similarity']),
    );

    expect(tracePayload.trace.total_duration_ms).toBeGreaterThan(0);
    expect(tracePayload.trace.tools_used_count).toMatchObject({
      'semantic-search': 1,
      'detect-dependencies': 1,
      'cluster-by-similarity': 1,
    });

    expect(orchestrateTaskPriorities).toHaveBeenCalledWith({
      sessionId,
      userId: DEFAULT_USER_ID,
      outcomeId: activeOutcomeId,
      activeReflectionIds: [],
    });
  });
});
