import { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TaskList } from '@/app/priorities/components/TaskList';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';
import type { SortingStrategy } from '@/lib/schemas/sortingStrategy';
import type { StrategicScoresMap } from '@/lib/schemas/strategicScore';

const mockPlan: PrioritizedTaskPlan = {
  ordered_task_ids: ['task-balanced', 'task-quick'],
  execution_waves: [],
  dependencies: [],
  confidence_scores: {
    'task-balanced': 0.82,
    'task-quick': 0.9,
  },
  synthesis_summary: 'Plan summary',
  task_annotations: [],
  removed_tasks: [],
};

const strategicScores: StrategicScoresMap = {
  'task-balanced': {
    impact: 10,
    effort: 12,
    confidence: 0.95,
    priority: 72,
    reasoning: {},
    scored_at: new Date().toISOString(),
  },
  'task-quick': {
    impact: 6,
    effort: 6,
    confidence: 0.65,
    priority: 52,
    reasoning: {},
    scored_at: new Date().toISOString(),
  },
};

function PageHarness() {
  const [strategy, setStrategy] = useState<SortingStrategy>('balanced');

  return (
    <TaskList
      plan={mockPlan}
      planVersion={1}
      outcomeId="outcome-123"
      outcomeStatement="Increase activation rate"
      strategicScores={strategicScores}
      sortingStrategy={strategy}
      onStrategyChange={setStrategy}
    />
  );
}

describe('Priorities UX feedback loop', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [
          { task_id: 'task-balanced', title: 'Refactor core billing flow' },
          { task_id: 'task-quick', title: 'Polish onboarding tooltip' },
        ],
      }),
    } as unknown as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('keeps scroll at 0 and reorders tasks when sorting changes', async () => {
    const user = userEvent.setup();

    render(<PageHarness />);

    await waitFor(() => {
      expect(screen.getByText('Refactor core billing flow')).toBeInTheDocument();
    });

    const orderedIdsBefore = Array.from(document.querySelectorAll('[data-task-id]')).map(node =>
      node.getAttribute('data-task-id')
    );
    const initialFirst = orderedIdsBefore[0];
    expect(window.scrollY).toBe(0);

    const trigger = screen.getByLabelText('Sort Strategy');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /Quick Wins/i }));

    await waitFor(() => {
      const orderedIdsAfter = Array.from(document.querySelectorAll('[data-task-id]')).map(node =>
        node.getAttribute('data-task-id')
      );
      expect(orderedIdsAfter[0]).toBe('task-quick');
      expect(orderedIdsAfter[0]).not.toBe(initialFirst);
    });

    expect(window.scrollY).toBe(0);
  });
});
