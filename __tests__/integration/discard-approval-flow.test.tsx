import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PrioritizedTaskPlan, TaskRemoval } from '@/lib/types/agent';
import type { ExecutionMetadata } from '@/lib/types/agent';
import { TaskList } from '@/app/priorities/components/TaskList';

const mockedDiscardedRender = vi.fn();

vi.mock('@/app/priorities/components/TaskRow', () => ({
  TaskRow: ({
    taskId,
    title,
  }: {
    taskId: string;
    title: string;
    impact?: number | null;
    effort?: number | null;
    confidence?: number | null;
    priority?: number | null;
  }) => <div data-testid={`task-row-${taskId}`}>{title}</div>,
}));

vi.mock('@/app/priorities/components/CompletedTasks', () => ({
  CompletedTasks: () => null,
}));

vi.mock('@/app/priorities/components/DiscardedTasks', () => ({
  DiscardedTasks: (props: { tasks: Array<{ id: string; title: string }> }) => {
    mockedDiscardedRender(props);
    return (
      <div data-testid="discarded-section">
        {props.tasks.map(task => (
          <div key={`discarded-${task.id}`} data-testid={`discarded-task-${task.id}`}>
            {task.title}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('@/app/priorities/components/TaskDetailsDrawer', () => ({
  TaskDetailsDrawer: () => null,
}));

vi.mock('@/app/components/ManualTaskModal', () => ({
  ManualTaskModal: () => null,
}));

vi.mock('@/app/priorities/components/useTaskDiff', () => ({
  useTaskDiff: () => ({
    movementMap: {},
    highlightedIds: new Set<string>(),
    flashTask: vi.fn(),
  }),
}));

vi.mock('@/app/priorities/components/useScrollToTask', () => ({
  useScrollToTask: () => ({
    scrollToTask: vi.fn(),
  }),
}));

const toastSpies = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSpies.success,
    info: toastSpies.info,
  },
}));
const toastSuccess = toastSpies.success;
const toastInfo = toastSpies.info;

type MetadataRecord = {
  task_id: string;
  title: string;
  document_id: string;
  is_manual?: boolean;
};

const metadataByTask: Record<string, MetadataRecord> = {
  'task-1': {
    task_id: 'task-1',
    title: 'Prioritize new onboarding experience',
    document_id: 'doc-1',
  },
  'task-2': {
    task_id: 'task-2',
    title: 'Draft launch comms for stakeholders',
    document_id: 'doc-1',
    is_manual: true,
  },
  'task-3': {
    task_id: 'task-3',
    title: 'Archive deprecated SOPs',
    document_id: 'doc-2',
  },
};

const buildPlan = (ids: string[], removed: TaskRemoval[] = []): PrioritizedTaskPlan => ({
  ordered_task_ids: ids,
  execution_waves: [
    {
      wave_number: 1,
      task_ids: ids,
      parallel_execution: false,
      estimated_duration_hours: null,
    },
  ],
  dependencies: [],
  confidence_scores: ids.reduce<Record<string, number>>((acc, id, index) => {
    acc[id] = 0.8 - index * 0.05;
    return acc;
  }, {}),
  synthesis_summary: 'Mock synthesis summary',
  task_annotations: [],
  removed_tasks: removed,
});

const executionMetadata: ExecutionMetadata = {
  steps_taken: 0,
  tool_call_count: {},
  thinking_time_ms: 0,
  tool_execution_time_ms: 0,
  total_time_ms: 0,
  error_count: 0,
  success_rate: 1,
  status_note: null,
  failed_tools: [],
};

describe('Discard approval flow (T009)', () => {
  const user = userEvent.setup();
  const defaultProps = {
    executionMetadata,
    outcomeId: 'outcome-1',
    outcomeStatement: 'Protect runway by finishing adoption blockers',
    adjustedPlan: null,
    onDiffSummary: vi.fn(),
    sessionStatus: 'completed' as const,
    canTriggerPrioritization: false,
    onRequestPrioritization: vi.fn(),
    sortingStrategy: 'balanced' as const,
    onStrategyChange: vi.fn(),
  };
  const initialPlan = buildPlan(['task-1', 'task-2', 'task-3']);
  const removalDetails: TaskRemoval[] = [
    {
      task_id: 'task-2',
      removal_reason: 'Superseded by higher priority goal',
      previous_rank: 2,
    },
    {
      task_id: 'task-3',
      removal_reason: 'No longer relevant after pivot',
      previous_rank: 3,
    },
  ];
  const updatedPlan = buildPlan(['task-1'], removalDetails);
  const mockFetch = vi.fn<typeof fetch>();
  let consoleLogSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    localStorage.clear();
    sessionStorage.clear();
    mockedDiscardedRender.mockClear();
    toastSuccess.mockClear();
    toastInfo.mockClear();
    mockFetch.mockImplementation(async (_input, init) => {
      if (typeof _input === 'string' && _input.includes('/api/tasks/metadata')) {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : { taskIds: [] };
        const tasks = (body.taskIds as string[]).map(taskId => metadataByTask[taskId]).filter(Boolean);
        return new Response(JSON.stringify({ tasks }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    global.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    consoleLogSpy?.mockRestore();
    consoleLogSpy = null;
    vi.clearAllMocks();
  });

  const renderWithPlan = (plan: PrioritizedTaskPlan, planVersion: number) =>
    render(
      <TaskList
        {...defaultProps}
        plan={plan}
        planVersion={planVersion}
      />
    );

  it('allows users to approve or reject each removal before applying changes', async () => {
    const { rerender } = renderWithPlan(initialPlan, 1);

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    rerender(
      <TaskList
        {...defaultProps}
        plan={updatedPlan}
        planVersion={2}
      />
    );

    const modalTitle = await screen.findByText(/Review Proposed Removals/);
    expect(modalTitle).toBeInTheDocument();
    expect(screen.getByText('Apply Changes (Discard 2)')).toBeInTheDocument();

    const manualCheckbox = screen.getByRole('checkbox', {
      name: `Approve discard for ${metadataByTask['task-2'].title}`,
    });
    expect(manualCheckbox).toBeChecked();
    const nonManualCheckbox = screen.getByRole('checkbox', {
      name: `Approve discard for ${metadataByTask['task-3'].title}`,
    });
    expect(nonManualCheckbox).toBeChecked();

    await user.click(manualCheckbox);
    expect(screen.getByText('Apply Changes (Discard 1)')).toBeInTheDocument();

    await user.click(screen.getByText('Apply Changes (Discard 1)'));

    await waitFor(() =>
      expect(screen.queryByText(/Review Proposed Removals/)).not.toBeInTheDocument()
    );

    expect(toastSuccess).toHaveBeenCalledWith('1 task discarded, 1 kept active');
    expect(screen.queryByTestId('discarded-task-task-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('discarded-task-task-3')).toHaveTextContent(metadataByTask['task-3'].title);
    expect(screen.getByTestId('task-row-task-2')).toHaveTextContent(metadataByTask['task-2'].title);
    expect(screen.queryByTestId('task-row-task-3')).not.toBeInTheDocument();
  });

  it('keeps all tasks active when user cancels the discard review', async () => {
    const { rerender } = renderWithPlan(initialPlan, 1);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    rerender(
      <TaskList
        {...defaultProps}
        plan={updatedPlan}
        planVersion={2}
      />
    );

    await screen.findByText(/Review Proposed Removals/);
    await user.click(screen.getByText('Cancel All'));

    await waitFor(() =>
      expect(screen.queryByText(/Review Proposed Removals/)).not.toBeInTheDocument()
    );

    expect(toastInfo).toHaveBeenCalledWith('Discard cancelled. All tasks kept active.');
    expect(screen.queryByTestId('discarded-task-task-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('discarded-task-task-3')).not.toBeInTheDocument();
    expect(screen.getByTestId('task-row-task-2')).toHaveTextContent(metadataByTask['task-2'].title);
    expect(screen.getByTestId('task-row-task-3')).toHaveTextContent(metadataByTask['task-3'].title);
  });
});
