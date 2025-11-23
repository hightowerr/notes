import { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TaskList } from '@/app/priorities/components/TaskList';
import { SortingStrategySelector } from '@/app/priorities/components/SortingStrategySelector';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';
import type { StrategicScoresMap } from '@/lib/schemas/strategicScore';
import type { SortingStrategy } from '@/lib/schemas/sortingStrategy';

const originalFetch = global.fetch;

const mockPlan: PrioritizedTaskPlan = {
  ordered_task_ids: ['task-core', 'task-quick', 'task-bet', 'task-urgent'],
  execution_waves: [],
  dependencies: [],
  confidence_scores: {
    'task-core': 0.62,
    'task-quick': 0.87,
    'task-bet': 0.73,
    'task-urgent': 0.69,
  },
  synthesis_summary: 'Focus on activation health.',
  created_at: new Date().toISOString(),
};

const strategicScores: StrategicScoresMap = {
  'task-core': {
    impact: 6.3,
    effort: 32,
    confidence: 0.62,
    priority: 58,
    reasoning: { impact_keywords: ['billing'], effort_source: 'heuristic' },
    scored_at: new Date().toISOString(),
  },
  'task-quick': {
    impact: 8,
    effort: 6,
    confidence: 0.88,
    priority: 72,
    reasoning: { impact_keywords: ['activation'], effort_source: 'extracted' },
    scored_at: new Date().toISOString(),
  },
  'task-bet': {
    impact: 9.1,
    effort: 64,
    confidence: 0.67,
    priority: 64,
    reasoning: { impact_keywords: ['analytics'], effort_source: 'heuristic' },
    scored_at: new Date().toISOString(),
  },
  'task-urgent': {
    impact: 7.2,
    effort: 18,
    confidence: 0.74,
    priority: 60,
    reasoning: { impact_keywords: ['incident'], effort_source: 'extracted' },
    scored_at: new Date().toISOString(),
  },
};

function StrategyHarness({ scores = strategicScores }: { scores?: StrategicScoresMap }) {
  const [strategy, setStrategy] = useState<SortingStrategy>('balanced');

  return (
    <div>
      <SortingStrategySelector value={strategy} onChange={setStrategy} />
      <TaskList
        plan={mockPlan}
        executionMetadata={undefined}
        planVersion={1}
        outcomeId="outcome-123"
        outcomeStatement="Increase activation rate"
        strategicScores={scores}
        sortingStrategy={strategy}
      />
    </div>
  );
}

describe('Sorting strategies', () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [
          { task_id: 'task-core', title: 'Stabilize billing adapters' },
          { task_id: 'task-quick', title: 'Optimize onboarding copy' },
          { task_id: 'task-bet', title: 'Rebuild analytics pipeline' },
          { task_id: 'task-urgent', title: 'Fix urgent payment blocker' },
        ],
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  it('filters tasks down to Quick Wins (≤8h effort)', async () => {
    const user = userEvent.setup();
    render(<StrategyHarness />);

    await waitFor(() => {
      expect(screen.getByText('Optimize onboarding copy')).toBeInTheDocument();
    });

    const trigger = screen.getByLabelText('Sort Strategy');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /Quick Wins/i }));

    expect(screen.getByText('Optimize onboarding copy')).toBeInTheDocument();
    expect(screen.queryByText('Stabilize billing adapters')).not.toBeInTheDocument();
    expect(screen.queryByText('Rebuild analytics pipeline')).not.toBeInTheDocument();
  });

  it('shows only Strategic Bets when selected', async () => {
    const user = userEvent.setup();
    render(<StrategyHarness />);

    await waitFor(() => {
      expect(screen.getByText('Rebuild analytics pipeline')).toBeInTheDocument();
    });

    const trigger = screen.getByLabelText('Sort Strategy');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /Strategic Bets/i }));

    expect(screen.getByText('Rebuild analytics pipeline')).toBeInTheDocument();
    expect(screen.getByText('Stabilize billing adapters')).toBeInTheDocument();
    expect(screen.queryByText('Optimize onboarding copy')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-task-id]').length).toBe(3);
  });

  it('keeps strategic bets populated when only moderate-effort bets exist', async () => {
    const user = userEvent.setup();
    const moderateBetScores: StrategicScoresMap = {
      ...strategicScores,
      'task-bet': {
        ...strategicScores['task-bet'],
        effort: 16,
      },
    };

    render(<StrategyHarness scores={moderateBetScores} />);

    await waitFor(() => {
      expect(screen.getByText('Rebuild analytics pipeline')).toBeInTheDocument();
    });

    const trigger = screen.getByLabelText('Sort Strategy');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /Strategic Bets/i }));

    expect(screen.getByText('Rebuild analytics pipeline')).toBeInTheDocument();
    expect(screen.queryByText('Optimize onboarding copy')).not.toBeInTheDocument();
  });

  it('promotes urgent work above other tasks', async () => {
    const user = userEvent.setup();
    render(<StrategyHarness />);

    await waitFor(() => {
      expect(screen.getByText('Fix urgent payment blocker')).toBeInTheDocument();
    });

    const trigger = screen.getByLabelText('Sort Strategy');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /Urgent/i }));

    await waitFor(() => {
      const rows = Array.from(document.querySelectorAll('[data-task-id]'));
      const order = rows.map(row => row.getAttribute('data-task-id'));
      const urgentIndex = order.indexOf('task-urgent');

      expect(urgentIndex).toBeGreaterThanOrEqual(0);
      expect(urgentIndex).toBeLessThan(2);
    });
  });

  it('locks a task without crashing when prior lock storage is corrupted', async () => {
    window.localStorage.setItem('locked-tasks', 'null');
    const user = userEvent.setup();
    const { unmount } = render(<StrategyHarness />);

    await waitFor(() => {
      expect(screen.getByText('Stabilize billing adapters')).toBeInTheDocument();
    });

    const [firstLockButton] = screen.getAllByLabelText(/Lock task in place/i);
    await user.click(firstLockButton);

    expect(screen.queryByText(/Unable to render task list/i)).not.toBeInTheDocument();

    unmount();
    render(<StrategyHarness />);
    await waitFor(() => {
      expect(screen.getByText('Stabilize billing adapters')).toBeInTheDocument();
    });
    expect(screen.getAllByLabelText(/Unlock task/i).length).toBeGreaterThan(0);
  });
});
