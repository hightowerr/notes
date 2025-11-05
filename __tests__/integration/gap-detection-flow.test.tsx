import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/components/ReasoningTracePanel', () => ({
  ReasoningTracePanel: () => null,
}));

vi.mock('@/app/priorities/components/TaskList', () => ({
  TaskList: () => <div data-testid="task-list" />,
}));

const taskLookup = new Map<string, { task_text: string; document_id: string }>([
  ['task-1', { task_text: 'Design app mockups', document_id: 'doc-1' }],
  ['task-2', { task_text: 'Launch on app store', document_id: 'doc-1' }],
  ['bridge-1', { task_text: 'Build app frontend based on the approved mockups', document_id: 'doc-1' }],
]);

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockImplementation(async (_field: string, taskIds: string[]) => ({
        data: taskIds.map(id => {
          const entry = taskLookup.get(id);
          return {
            task_id: id,
            task_text: entry?.task_text ?? id,
            document_id: entry?.document_id ?? 'doc-1',
          };
        }),
        error: null,
      })),
    })),
  },
}));

type DeferredResponse = {
  promise: Promise<Response>;
  resolve: (value: Response) => void;
};

function createDeferredResponse(): DeferredResponse {
  let resolve: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return {
    promise,
    resolve: (value: Response) => resolve(value),
  };
}

let TaskPrioritiesPage: typeof import('@/app/priorities/page')['default'];

beforeAll(async () => {
  TaskPrioritiesPage = (await import('@/app/priorities/page')).default;
});

const sessionResponse = {
  session: {
    id: 'session-001',
    status: 'completed',
    execution_metadata: {
      steps_taken: 0,
      tool_call_count: {},
      thinking_time_ms: 0,
      tool_execution_time_ms: 0,
      total_time_ms: 0,
      error_count: 0,
      success_rate: 1,
      status_note: null,
      failed_tools: [],
    },
    prioritized_plan: {
      ordered_task_ids: ['task-1', 'task-2'],
      execution_waves: [
        {
          wave_number: 1,
          task_ids: ['task-1', 'task-2'],
          parallel_execution: false,
          estimated_duration_hours: null,
        },
      ],
      dependencies: [],
      confidence_scores: {
        'task-1': 0.8,
        'task-2': 0.7,
      },
      synthesis_summary: 'Mock summary',
    },
  },
};

const gapResponse = {
  gaps: [
    {
      id: 'gap-1',
      predecessor_task_id: 'task-1',
      successor_task_id: 'task-2',
      indicators: {
        time_gap: true,
        action_type_jump: true,
        no_dependency: true,
        skill_jump: false,
      },
      confidence: 0.75,
      detected_at: '2025-10-28T00:00:00.000Z',
    },
  ],
  metadata: {
    total_pairs_analyzed: 1,
    gaps_detected: 1,
    analysis_duration_ms: 42,
  },
};

const generationResponse = {
  bridging_tasks: [
    {
      id: 'bridge-1',
      gap_id: 'gap-1',
      task_text: 'Build app frontend based on the approved mockups',
      estimated_hours: 80,
      cognition_level: 'high',
      confidence: 0.85,
      reasoning: 'Implements the UI to connect the design phase with launch readiness.',
      source: 'ai_generated',
      requires_review: true,
      created_at: '2025-10-28T14:35:00Z',
    },
  ],
  search_results_count: 2,
  generation_duration_ms: 512,
};

describe('Gap detection flow', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/api/outcomes')) {
        return new Response(
          JSON.stringify({
            outcome: {
              id: 'outcome-1',
              assembled_text: 'Increase monthly recurring revenue by 25%',
              state_preference: null,
              daily_capacity_hours: 6,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.includes('/api/agent/sessions/latest')) {
        return new Response(JSON.stringify(sessionResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/gaps/detect') && init?.method === 'POST') {
        return new Response(JSON.stringify(gapResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/gaps/generate') && init?.method === 'POST') {
        return new Response(JSON.stringify(generationResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(null, { status: 404 });
    });

    global.fetch = fetchMock;
  });

afterEach(() => {
  fetchMock.mockReset();
  taskLookup.clear();
  taskLookup.set('task-1', { task_text: 'Design app mockups', document_id: 'doc-1' });
  taskLookup.set('task-2', { task_text: 'Launch on app store', document_id: 'doc-1' });
  taskLookup.set('bridge-1', { task_text: 'Build app frontend based on the approved mockups', document_id: 'doc-1' });
});

  it('allows a user to trigger gap detection and view results', async () => {
    const user = userEvent.setup();

    render(<TaskPrioritiesPage />);

    const gapButton = await screen.findByRole('button', { name: /find missing tasks/i });
    expect(gapButton).toBeEnabled();

    await user.click(gapButton);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gaps/detect',
      expect.objectContaining({
        method: 'POST',
      })
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gaps/generate',
      expect.objectContaining({
        method: 'POST',
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/Gap suggestions ready: 1\/1/i)).toBeInTheDocument();
    });

    expect(
      screen.getByText((content) =>
        content.includes('Gap between "Design app mockups"') &&
        content.includes('Launch on app store')
      )
    ).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText(/Build app frontend based on the approved mockups/i)).toBeInTheDocument();
  });
  expect(screen.getByText(/Confidence: 85%/i)).toBeInTheDocument();
});

  it('shows progress updates while generating multiple gaps in parallel', async () => {
    taskLookup.set('task-3', { task_text: 'Write onboarding emails', document_id: 'doc-2' });
    taskLookup.set('task-4', { task_text: 'Measure activation metrics', document_id: 'doc-2' });
    taskLookup.set('bridge-2', { task_text: 'Draft onboarding experiment plan', document_id: 'doc-2' });
    taskLookup.set('bridge-3', { task_text: 'Instrument activation analytics dashboard', document_id: 'doc-2' });

    const multiSessionResponse = {
      session: {
        ...sessionResponse.session,
        prioritized_plan: {
          ...sessionResponse.session.prioritized_plan,
          ordered_task_ids: ['task-1', 'task-2', 'task-3', 'task-4'],
        },
      },
    };

    const multiGapResponse = {
      gaps: [
        {
          id: 'gap-1',
          predecessor_task_id: 'task-1',
          successor_task_id: 'task-2',
          indicators: {
            time_gap: true,
            action_type_jump: true,
            no_dependency: true,
            skill_jump: false,
          },
          confidence: 0.76,
          detected_at: '2025-10-28T00:00:00.000Z',
        },
        {
          id: 'gap-2',
          predecessor_task_id: 'task-2',
          successor_task_id: 'task-3',
          indicators: {
            time_gap: true,
            action_type_jump: false,
            no_dependency: true,
            skill_jump: true,
          },
          confidence: 0.8,
          detected_at: '2025-10-28T00:00:00.000Z',
        },
        {
          id: 'gap-3',
          predecessor_task_id: 'task-3',
          successor_task_id: 'task-4',
          indicators: {
            time_gap: false,
            action_type_jump: true,
            no_dependency: true,
            skill_jump: true,
          },
          confidence: 0.82,
          detected_at: '2025-10-28T00:00:00.000Z',
        },
      ],
      metadata: {
        total_pairs_analyzed: 3,
        gaps_detected: 3,
        analysis_duration_ms: 58,
      },
    };

    const generationResponses = [
      {
        bridging_tasks: [
          {
            id: 'bridge-1',
            gap_id: 'gap-1',
            task_text: 'Build app frontend based on the approved mockups',
            estimated_hours: 68,
            cognition_level: 'medium',
            confidence: 0.86,
            reasoning: 'Connects design outputs to launch readiness.',
            source: 'ai_generated',
            requires_review: true,
            created_at: '2025-10-28T14:35:00Z',
          },
        ],
        search_results_count: 3,
        generation_duration_ms: 4100,
      },
      {
        bridging_tasks: [
          {
            id: 'bridge-2',
            gap_id: 'gap-2',
            task_text: 'Draft onboarding experiment plan',
            estimated_hours: 52,
            cognition_level: 'medium',
            confidence: 0.8,
            reasoning: 'Ensures onboarding experiments lead to activation insights.',
            source: 'ai_generated',
            requires_review: true,
            created_at: '2025-10-28T14:36:00Z',
          },
        ],
        search_results_count: 2,
        generation_duration_ms: 2900,
      },
      {
        bridging_tasks: [
          {
            id: 'bridge-3',
            gap_id: 'gap-3',
            task_text: 'Instrument activation analytics dashboard',
            estimated_hours: 40,
            cognition_level: 'low',
            confidence: 0.83,
            reasoning: 'Enables visibility into activation metrics before measurement.',
            source: 'ai_generated',
            requires_review: true,
            created_at: '2025-10-28T14:37:00Z',
          },
        ],
        search_results_count: 4,
        generation_duration_ms: 3200,
      },
    ];

    const deferredResponses = generationResponses.map(() => createDeferredResponse());
    let generateCallIndex = 0;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith('/api/outcomes')) {
        return new Response(
          JSON.stringify({
            outcome: {
              id: 'outcome-1',
              assembled_text: 'Increase monthly recurring revenue by 25%',
              state_preference: null,
              daily_capacity_hours: 6,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.includes('/api/agent/sessions/latest')) {
        return new Response(JSON.stringify(multiSessionResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/gaps/detect') && init?.method === 'POST') {
        return new Response(JSON.stringify(multiGapResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/gaps/generate') && init?.method === 'POST') {
        const deferred = deferredResponses[generateCallIndex];
        generateCallIndex += 1;
        return deferred?.promise ?? Promise.resolve(new Response(null, { status: 500 }));
      }

      return new Response(null, { status: 404 });
    });

    const user = userEvent.setup();
    render(<TaskPrioritiesPage />);

    const gapButton = await screen.findByRole('button', { name: /find missing tasks/i });
    await user.click(gapButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/gaps/detect',
        expect.objectContaining({ method: 'POST' })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Generating 0\/3 gaps/i)).toBeInTheDocument();
    });

    deferredResponses[0].resolve(
      new Response(JSON.stringify(generationResponses[0]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/Generating 1\/3 gaps/i)).toBeInTheDocument();
    });

    deferredResponses[1].resolve(
      new Response(JSON.stringify(generationResponses[1]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/Generating 2\/3 gaps/i)).toBeInTheDocument();
    });

    deferredResponses[2].resolve(
      new Response(JSON.stringify(generationResponses[2]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/Gap suggestions ready: 3\/3/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Completed in/i)).toBeInTheDocument();
    });
  });
});
