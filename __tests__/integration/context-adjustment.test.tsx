/**
 * Integration Test: Reflection Toggle → Adjustment → UI Flow (T011)
 *
 * Verifies that toggling reflections drives the instant adjustment endpoint,
 * reorders the task list with movement badges, debounces rapid interactions,
 * and rolls back on toggle failures.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';
import type { AdjustedPlan } from '@/lib/types/adjustment';
import TaskPrioritiesPage from '@/app/priorities/page';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/components/main-nav', () => ({
  MainNav: () => <nav data-testid="main-nav" />,
}));

vi.mock('@/app/components/ReasoningTracePanel', () => ({
  ReasoningTracePanel: () => null,
}));

vi.mock('@/app/components/ReflectionPanel', () => ({
  ReflectionPanel: () => null,
}));

const toastError = vi.fn();
vi.mock('sonner', () => {
  const toast = {
    success: vi.fn(),
    error: toastError,
    warning: vi.fn(),
    info: vi.fn(),
  };
  return { toast, Toaster: () => null };
});

const taskRecords = [
  {
    task_id: '11111111-1111-4111-8111-111111111111',
    task_text: 'Finalize design handoff',
    document_id: null,
  },
  {
    task_id: '22222222-2222-4222-8222-222222222222',
    task_text: 'Ship onboarding checklist',
    document_id: null,
  },
  {
    task_id: '33333333-3333-4333-8333-333333333333',
    task_text: 'Draft launch announcement',
    document_id: null,
  },
] as const;

const [
  TASK_PLAN,
  TASK_BUILD,
  TASK_MARKETING,
] = taskRecords.map(record => record.task_id);

const REF_FOCUS = '44444444-4444-4444-8444-444444444444';
const REF_RECOVERY = '55555555-5555-4555-8555-555555555555';

const baselinePlan: PrioritizedTaskPlan = {
  ordered_task_ids: [TASK_PLAN, TASK_BUILD, TASK_MARKETING],
  execution_waves: [
    {
      wave_number: 1,
      task_ids: [TASK_PLAN],
      parallel_execution: false,
      estimated_duration_hours: 4,
    },
    {
      wave_number: 2,
      task_ids: [TASK_BUILD],
      parallel_execution: false,
      estimated_duration_hours: 3,
    },
    {
      wave_number: 3,
      task_ids: [TASK_MARKETING],
      parallel_execution: false,
      estimated_duration_hours: 2,
    },
  ],
  dependencies: [],
  confidence_scores: {
    [TASK_PLAN]: 0.78,
    [TASK_BUILD]: 0.72,
    [TASK_MARKETING]: 0.65,
  },
  synthesis_summary: 'Focus on foundational delivery before launch amplification.',
  task_annotations: [
    { task_id: TASK_PLAN, state: 'active', confidence: 0.78 },
    { task_id: TASK_BUILD, state: 'active', confidence: 0.72 },
    { task_id: TASK_MARKETING, state: 'active', confidence: 0.65 },
  ],
  removed_tasks: [],
  created_at: '2025-01-10T12:00:00.000Z',
};

const executionMetadata = {
  steps_taken: 4,
  tool_call_count: {},
  thinking_time_ms: 1200,
  tool_execution_time_ms: 700,
  total_time_ms: 2100,
  error_count: 0,
  success_rate: 1,
  status_note: null,
  failed_tools: [],
};

type AdjustmentResponse = {
  plan: AdjustedPlan;
  totalMs: number;
  rankingMs: number;
  warnings?: string[];
};

const supabaseSelect = vi.fn(() => ({
  in: vi.fn(async (_column: string, ids: string[]) => ({
    data: taskRecords.filter(record => ids.includes(record.task_id)),
    error: null,
  })),
}));

const supabase = {
  from: vi.fn(() => ({
    select: supabaseSelect,
  })),
};

vi.mock('@/lib/supabase', () => ({ supabase }));

const baselineReflections: ReflectionWithWeight[] = [
  {
    id: REF_FOCUS,
    user_id: 'default-user',
    text: 'Still pre-launch. Prioritize shipping features.',
    created_at: '2025-01-09T09:00:00.000Z',
    is_active_for_prioritization: true,
    recency_weight: 1,
    weight: 1,
    relative_time: '2 hours ago',
  },
  {
    id: REF_RECOVERY,
    user_id: 'default-user',
    text: 'Team is tired — lighten workload where possible.',
    created_at: '2025-01-08T18:30:00.000Z',
    is_active_for_prioritization: true,
    recency_weight: 0.5,
    weight: 0.5,
    relative_time: '18 hours ago',
  },
];

let reflectionsStore: ReflectionWithWeight[];
let failNextToggle = false;
let adjustRequestLog: Array<{ ids: string[] }>;

const adjustmentByKey = new Map<string, AdjustmentResponse>();

function buildAdjustedPlan(
  orderedTaskIds: string[],
  moved: Array<{ task_id: string; from: number; to: number; reason: string }>,
  activeIds: string[],
): AdjustedPlan {
  const reflections = activeIds
    .map(id => reflectionsStore.find(reflection => reflection.id === id))
    .filter((reflection): reflection is ReflectionWithWeight => Boolean(reflection))
    .map(reflection => ({
      id: reflection.id,
      text: reflection.text,
      recency_weight: reflection.recency_weight ?? 1,
      created_at: reflection.created_at,
    }));

  return {
    ordered_task_ids: orderedTaskIds,
    confidence_scores: orderedTaskIds.reduce<Record<string, number>>((scores, taskId, index) => {
      const baseScore = baselinePlan.confidence_scores[taskId] ?? 0.6;
      const delta = Math.max(0, (orderedTaskIds.length - index) * 0.03);
      scores[taskId] = Number((baseScore + delta).toFixed(2));
      return scores;
    }, {}),
    diff: {
      moved,
      filtered: [],
    },
    adjustment_metadata: {
      reflections,
      tasks_moved: moved.length,
      tasks_filtered: 0,
      duration_ms: 140,
    },
  };
}

function setAdjustmentResponses() {
  adjustmentByKey.clear();

  const allActive = [REF_FOCUS, REF_RECOVERY].sort().join(',');
  adjustmentByKey.set(allActive, {
    plan: buildAdjustedPlan(
      baselinePlan.ordered_task_ids,
      [],
      [REF_FOCUS, REF_RECOVERY],
    ),
    totalMs: 180,
    rankingMs: 95,
  });

  const focusOnlyKey = [REF_FOCUS].join(',');
  adjustmentByKey.set(focusOnlyKey, {
    plan: buildAdjustedPlan(
      [TASK_BUILD, TASK_PLAN, TASK_MARKETING],
      [
        {
          task_id: TASK_BUILD,
          from: 2,
          to: 1,
          reason: 'Feature shipping urgency increased by active context.',
        },
        {
          task_id: TASK_PLAN,
          from: 1,
          to: 2,
          reason: 'Strategic planning deferred once build takes priority.',
        },
      ],
      [REF_FOCUS],
    ),
    totalMs: 210,
    rankingMs: 110,
  });

  const recoveryOnlyKey = [REF_RECOVERY].join(',');
  adjustmentByKey.set(recoveryOnlyKey, {
    plan: buildAdjustedPlan(
      [TASK_PLAN, TASK_MARKETING, TASK_BUILD],
      [
        {
          task_id: TASK_MARKETING,
          from: 3,
          to: 2,
          reason: 'Lighter promo work promoted while recovery context active.',
        },
      ],
      [REF_RECOVERY],
    ),
    totalMs: 205,
    rankingMs: 108,
  });

  adjustmentByKey.set('', {
    plan: buildAdjustedPlan(baselinePlan.ordered_task_ids, [], []),
    totalMs: 160,
    rankingMs: 80,
  });
}

function makeResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

const sessionPayload = {
  session: {
    id: 'session-abc',
    status: 'completed',
    user_id: 'default-user',
    baseline_plan: baselinePlan,
    prioritized_plan: baselinePlan,
    adjusted_plan: null,
    execution_metadata: executionMetadata,
    created_at: '2025-01-10T12:05:00.000Z',
    updated_at: '2025-01-10T12:05:00.000Z',
  },
};

let fetchSpy: ReturnType<typeof vi.fn>;

function normalizeUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') {
    return new URL(input, 'http://localhost');
  }
  if (input instanceof URL) {
    return input;
  }
  return new URL(input.url, 'http://localhost');
}

function setupFetchMock() {
  fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = normalizeUrl(input);
    const pathname = url.pathname;
    const method = init?.method ?? 'GET';

    if (pathname === '/api/outcomes' && method === 'GET') {
      return makeResponse({
        outcome: {
          id: 'outcome-123',
          assembled_text: 'Launch Note Synth with confident marketing.',
          state_preference: null,
          daily_capacity_hours: 6,
        },
      });
    }

    if (pathname === '/api/reflections' && method === 'GET') {
      return makeResponse({ reflections: reflectionsStore });
    }

    if (pathname === '/api/reflections/toggle' && method === 'POST') {
      if (failNextToggle) {
        failNextToggle = false;
        return makeResponse(
          { error: 'Server Error', message: 'Failed to update reflection' },
          { status: 500 },
        );
      }

      if (!init?.body) {
        return makeResponse({ error: 'Invalid request' }, { status: 400 });
      }

      const payload = JSON.parse(init.body.toString()) as {
        reflection_id: string;
        is_active: boolean;
      };

      const target = reflectionsStore.find(reflection => reflection.id === payload.reflection_id);
      if (!target) {
        return makeResponse({ error: 'Not Found' }, { status: 404 });
      }

      target.is_active_for_prioritization = payload.is_active;

      return makeResponse({
        success: true,
        reflection: target,
      });
    }

    if (pathname.startsWith('/api/agent/sessions/latest') && method === 'GET') {
      return makeResponse(sessionPayload);
    }

    if (pathname === '/api/agent/adjust-priorities' && method === 'POST') {
      if (!init?.body) {
        return makeResponse({ error: 'Invalid request' }, { status: 400 });
      }
      const payload = JSON.parse(init.body.toString()) as {
        session_id: string;
        active_reflection_ids: string[];
      };

      const uniqueIds = Array.from(new Set(payload.active_reflection_ids));
      const key = uniqueIds.sort().join(',');
      const entry = adjustmentByKey.get(key);
      adjustRequestLog.push({ ids: uniqueIds });

      if (!entry) {
        return makeResponse({ error: 'No adjustment path' }, { status: 500 });
      }

      return makeResponse({
        adjusted_plan: entry.plan,
        performance: {
          total_ms: entry.totalMs,
          ranking_ms: entry.rankingMs,
        },
        baseline_created_at: baselinePlan.created_at,
        warnings: entry.warnings ?? [],
      });
    }

    return makeResponse({ error: 'Unhandled request', path: pathname }, { status: 404 });
  });

  vi.stubGlobal('fetch', fetchSpy);
}

function getDisplayedTaskOrder(container: HTMLElement) {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-task-id]'));
  return nodes.map(node => node.getAttribute('data-task-id'));
}

describe('Context Adjustment Integration (T011)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'public-anon-key';

    reflectionsStore = structuredClone(baselineReflections);
    adjustRequestLog = [];
    failNextToggle = false;
    supabase.from.mockClear();
    supabaseSelect.mockClear();
    toastError.mockReset();
    setAdjustmentResponses();
    setupFetchMock();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('reorders tasks and surfaces movement when toggling reflection off then on', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(<TaskPrioritiesPage />);

    await waitFor(() => expect(screen.getByText('Task Priorities')).toBeInTheDocument());

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(expect.anything(), expect.anything()));

    fetchSpy.mockClear();

    const recoverySwitch = await screen.findByLabelText(
      /Team is tired — lighten workload where possible/i,
    );

    await user.click(recoverySwitch);
    expect(recoverySwitch).toHaveAttribute('data-state', 'unchecked');

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      const order = getDisplayedTaskOrder(container);
      expect(order).toEqual([TASK_BUILD, TASK_PLAN, TASK_MARKETING]);
    });

    expect(screen.getByText('↑1')).toBeInTheDocument();

    await user.click(recoverySwitch);
    expect(recoverySwitch).toHaveAttribute('data-state', 'checked');

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      const order = getDisplayedTaskOrder(container);
      expect(order).toEqual([TASK_PLAN, TASK_BUILD, TASK_MARKETING]);
    });

    expect(screen.getByText('↓1')).toBeInTheDocument();
  });

  it('debounces rapid toggles to a single adjustment call', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { container } = render(<TaskPrioritiesPage />);

    await waitFor(() => expect(screen.getByText('Task Priorities')).toBeInTheDocument());

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    fetchSpy.mockClear();
    adjustRequestLog = [];

    const focusSwitch = await screen.findByLabelText(/Prioritize shipping features/i);

    await user.click(focusSwitch);
    await user.click(focusSwitch);
    await user.click(focusSwitch);

    await act(async () => {
      vi.advanceTimersByTime(999);
    });

    expect(adjustRequestLog).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(2);
    });

    await waitFor(() => {
      expect(adjustRequestLog).toHaveLength(1);
    });

    const order = getDisplayedTaskOrder(container);
    expect(order).toEqual([TASK_BUILD, TASK_PLAN, TASK_MARKETING]);
  });

  it('rolls back toggle state and surfaces error when reflection toggle fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TaskPrioritiesPage />);

    await waitFor(() => expect(screen.getByText('Task Priorities')).toBeInTheDocument());

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    fetchSpy.mockClear();
    adjustRequestLog = [];

    failNextToggle = true;
    const focusSwitch = await screen.findByLabelText(/Prioritize shipping features/i);

    await user.click(focusSwitch);

    expect(focusSwitch).toHaveAttribute('data-state', 'checked');
    expect(toastError).toHaveBeenCalledWith('Failed to update reflection');

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(adjustRequestLog).toHaveLength(0);
  });
});

