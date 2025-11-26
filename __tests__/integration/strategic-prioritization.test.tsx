import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { TaskList } from '@/app/priorities/components/TaskList';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';
import type { StrategicScoresMap } from '@/lib/schemas/strategicScore';

const originalFetch: typeof fetch | undefined = global.fetch;

const mockPlan: PrioritizedTaskPlan = {
  ordered_task_ids: ['task-low-priority', 'task-high-priority'],
  execution_waves: [],
  dependencies: [],
  confidence_scores: {
    'task-low-priority': 0.5,
    'task-high-priority': 0.82,
  },
  synthesis_summary: 'Focus on revenue acceleration',
  created_at: new Date().toISOString(),
};

const mockScores: StrategicScoresMap = {
  'task-low-priority': {
    impact: 5.2,
    effort: 36,
    confidence: 0.64,
    priority: 44,
    reasoning: {
      impact_keywords: ['maintenance', 'ops'],
      effort_source: 'heuristic',
    },
    scored_at: new Date().toISOString(),
  },
  'task-high-priority': {
    impact: 8.5,
    effort: 16,
    confidence: 0.78,
    priority: 66,
    reasoning: {
      impact_keywords: ['activation', 'growth'],
      effort_source: 'extracted',
      effort_hint: 'Requires analytics + onboarding tweaks',
    },
    scored_at: new Date().toISOString(),
  },
};

describe('Strategic prioritization display', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tasks: [
          { task_id: 'task-low-priority', title: 'Stabilize billing adapters' },
          { task_id: 'task-high-priority', title: 'Launch activation growth loop' },
        ],
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  it('shows strategic scores per task and sorts balanced view by priority', async () => {
    render(
      <TaskList
        plan={mockPlan}
        planVersion={1}
        outcomeId="outcome-123"
        outcomeStatement="Increase activation rate"
        strategicScores={mockScores}
        sortingStrategy="balanced"
        onStrategyChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Impact: 8\.5/)).toBeInTheDocument();
    });

    const header = screen.getByTestId('task-list-header');
    expect(within(header).getAllByLabelText('Sort Strategy').length).toBe(1);

    const rows = Array.from(document.querySelectorAll('[data-task-id]'));
    expect(rows[0]).toHaveAttribute('data-task-id', 'task-high-priority');
  });
});
