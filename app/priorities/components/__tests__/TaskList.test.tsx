import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, afterEach, describe, expect, it } from 'vitest';

import { TaskList } from '../TaskList';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/app/priorities/components/TaskRow', () => ({
  TaskRow: ({ title }: { title: string }) => <div data-testid="task-row">{title}</div>,
}));

vi.mock('@/app/priorities/components/BlockedTasksSection', () => ({
  BlockedTasksSection: () => <div data-testid="blocked-tasks" />,
}));

vi.mock('@/app/priorities/components/CompletedTasks', () => ({
  CompletedTasks: () => <div data-testid="completed-tasks" />,
}));

vi.mock('@/app/priorities/components/DiscardedTasks', () => ({
  DiscardedTasks: () => <div data-testid="discarded-tasks" />,
}));

vi.mock('@/app/priorities/components/TaskDetailsDrawer', () => ({
  TaskDetailsDrawer: () => null,
}));

vi.mock('@/app/components/ManualTaskModal', () => ({
  ManualTaskModal: () => null,
}));

vi.mock('@/app/components/DiscardReviewModal', () => ({
  DiscardReviewModal: () => null,
}));

vi.mock('@/app/priorities/components/useTaskDiff', () => ({
  useTaskDiff: () => ({
    movementMap: {},
    highlightedIds: new Set<string>(),
    flashTask: vi.fn(),
  }),
}));

vi.mock('@/app/priorities/components/useScrollToTask', () => ({
  useScrollToTask: () => vi.fn(),
}));

const buildPlan = (taskIds: string[]): PrioritizedTaskPlan => ({
  ordered_task_ids: taskIds,
  execution_waves: [],
  dependencies: [],
  confidence_scores: {},
  synthesis_summary: 'Plan summary',
  task_annotations: [],
  removed_tasks: [],
});

const mockFetchResponse = () => {
  vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      tasks: [],
    }),
  } as unknown as Response);
};

describe('TaskList header', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the header with title, task count, and sorting control aligned to the right', () => {
    mockFetchResponse();
    const plan = buildPlan(['task-1', 'task-2']);

    render(
      <TaskList
        plan={plan}
        planVersion={1}
        outcomeId="outcome-1"
        sortingStrategy="balanced"
        onStrategyChange={vi.fn()}
      />
    );

    const header = screen.getByTestId('task-list-header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('justify-between');
    expect(screen.getByText('Your Prioritized Tasks')).toBeInTheDocument();
    expect(screen.getByText('2 tasks')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort Strategy')).toBeInTheDocument();
  });

  it('disables sorting when there are no tasks and shows the tooltip', async () => {
    mockFetchResponse();
    const plan = buildPlan([]);
    const user = userEvent.setup();

    render(
      <TaskList
        plan={plan}
        planVersion={1}
        outcomeId="outcome-1"
        sortingStrategy="balanced"
        onStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText(/0 tasks/i)).toBeInTheDocument();
    const sortButton = screen.getByRole('combobox', { name: /sort strategy/i });
    expect(sortButton).toHaveAttribute('aria-disabled', 'true');

    await user.hover(sortButton);
    expect(screen.getByLabelText(/no tasks to sort/i)).toBeInTheDocument();
  });
});
