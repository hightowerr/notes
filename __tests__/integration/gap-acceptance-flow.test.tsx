import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/app/components/ReasoningTracePanel', () => ({
  ReasoningTracePanel: () => null,
}));

vi.mock('@/app/priorities/components/TaskList', () => ({
  TaskList: () => <div data-testid="task-list" />,
}));

const taskMap = new Map<string, { task_text: string; document_id: string }>([
  ['task-1', { task_text: 'Design app mockups', document_id: 'doc-1' }],
  ['task-2', { task_text: 'Launch on app store', document_id: 'doc-1' }],
  ['bridge-1', { task_text: 'Build app frontend based on the approved mockups', document_id: 'doc-1' }],
]);

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockImplementation(async (_field: string, taskIds: string[]) => ({
        data: taskIds.map(id => ({
          task_id: id,
          task_text: taskMap.get(id)?.task_text ?? id,
          document_id: taskMap.get(id)?.document_id ?? 'doc-1',
        })),
        error: null,
      })),
    })),
  },
}));

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
      task_annotations: [],
      removed_tasks: [],
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
  suggestions: [],
  analysis_session_id: 'gap-session-001',
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

describe('Gap acceptance flow', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const acceptedPayloads: unknown[] = [];

  beforeEach(() => {
    acceptedPayloads.length = 0;

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

      if (url.endsWith('/api/gaps/accept') && init?.method === 'POST') {
        const parsedBody = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        acceptedPayloads.push(parsedBody);
        const updatedPlan = {
          ...sessionResponse.session.prioritized_plan,
          ordered_task_ids: ['task-1', 'bridge-1', 'task-2'],
          dependencies: [
            ...sessionResponse.session.prioritized_plan.dependencies,
            {
              source_task_id: 'task-1',
              target_task_id: 'bridge-1',
              relationship_type: 'prerequisite',
              confidence: 0.85,
              detection_method: 'stored_relationship',
            },
            {
              source_task_id: 'bridge-1',
              target_task_id: 'task-2',
              relationship_type: 'prerequisite',
              confidence: 0.85,
              detection_method: 'stored_relationship',
            },
          ],
          confidence_scores: {
            ...sessionResponse.session.prioritized_plan.confidence_scores,
            'bridge-1': 0.85,
          },
          task_annotations: [
            ...(sessionResponse.session.prioritized_plan.task_annotations ?? []),
            {
              task_id: 'bridge-1',
              state: 'manual_override',
              reasoning: generationResponse.bridging_tasks[0].reasoning,
              dependency_notes: 'Estimated effort: 96 hours',
              manual_override: true,
            },
          ],
        };
        return new Response(
          JSON.stringify({
            inserted_count: 1,
            task_ids: ['bridge-1'],
            relationships_created: 2,
            updated_plan: updatedPlan,
            gap_analysis_session_id: 'gap-session-001',
          }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(null, { status: 404 });
    });

    global.fetch = fetchMock;
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it('allows a user to edit and accept bridging tasks', async () => {
    const user = userEvent.setup();

    render(<TaskPrioritiesPage />);

    const triggerButton = await screen.findByRole('button', { name: /find missing tasks/i });
    await user.click(triggerButton);

    await waitFor(() => {
      expect(screen.getByText(/Gap between “Design app mockups” → “Launch on app store”/i)).toBeInTheDocument();
    });

    const descriptionField = await screen.findByLabelText(/task description/i);
    await user.clear(descriptionField);
    await user.type(descriptionField, 'Build mobile app frontend with authentication');

    const hoursField = await screen.findByLabelText(/estimated hours/i);
    await user.type(hoursField, '{Control>}a{/Control}96');

    const acceptButton = await screen.findByRole('button', { name: /accept selected/i });
    await user.click(acceptButton);

    await waitFor(() => {
      expect(acceptedPayloads).toHaveLength(1);
    });

    expect(acceptedPayloads[0]).toMatchObject({
      analysis_session_id: 'gap-session-001',
      agent_session_id: 'session-001',
      accepted_tasks: [
        {
          predecessor_id: 'task-1',
          successor_id: 'task-2',
          task: expect.objectContaining({
            id: 'bridge-1',
            edited_task_text: 'Build mobile app frontend with authentication',
            edited_estimated_hours: 96,
          }),
        },
      ],
    });

    await waitFor(() => {
      expect(screen.queryByLabelText(/task description/i)).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/AI Generated/i)).toBeInTheDocument();
    });
  });
});
