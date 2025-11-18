import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { TaskRow } from '@/app/priorities/components/TaskRow';
import type { ManualOverrideState } from '@/lib/schemas/manualOverride';
import type { StrategicScore } from '@/lib/schemas/strategicScore';
import { calculatePriority } from '@/lib/utils/strategicPriority';

describe('manual override controls', () => {
  const baselineScore: StrategicScore = {
    impact: 8.5,
    effort: 8,
    confidence: 0.6,
    priority: calculatePriority(8.5, 8, 0.6),
    reasoning: {
      impact_keywords: ['payments'],
      effort_source: 'heuristic',
    },
    scored_at: new Date().toISOString(),
  };

  const renderTaskRow = () => {
    const Wrapper = () => {
      const [override, setOverride] = useState<ManualOverrideState | null>(null);
      const impact = override?.impact ?? baselineScore.impact;
      const effort = override?.effort ?? baselineScore.effort;
      const priority = calculatePriority(impact, effort, baselineScore.confidence);

      return (
        <TaskRow
          taskId="task-1"
          order={1}
          impact={impact}
          effort={effort}
          confidence={baselineScore.confidence}
          priority={priority}
          strategicDetails={null}
          title="Refactor billing webhooks"
          category="leverage"
          isLocked={false}
          dependencyLinks={[]}
          movement={undefined}
          checked={false}
          isAiGenerated={false}
          isManual={false}
          isPrioritizing={false}
          retryStatus={null}
          isSelected={false}
          isHighlighted={false}
          onSelect={() => {}}
          onToggleCompleted={() => {}}
          onToggleLock={() => {}}
          isEditingDisabled={false}
          onTaskTitleChange={() => {}}
          outcomeId="outcome-1"
          onEditSuccess={() => {}}
          hasManualOverride={Boolean(override)}
          manualOverride={override}
          baselineScore={baselineScore}
          onManualOverrideChange={setOverride}
        />
      );
    };

    return render(<Wrapper />);
  };

  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        override: {
          impact: 9,
          effort: 8,
          reason: undefined,
          session_id: 'session-1',
          timestamp: new Date().toISOString(),
        },
      }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates priority optimistically when impact slider changes', async () => {
    renderTaskRow();
    const user = userEvent.setup({ delay: null });

    const editButtons = screen.getAllByRole('button', { name: /Edit scores/i });
    await user.click(editButtons[editButtons.length - 1]);

    const dialog = await screen.findByRole('dialog');
    const slider = within(dialog).getAllByRole('slider')[0];
    slider.focus();
    await act(async () => {
      fireEvent.keyDown(slider, { key: 'ArrowUp' });
    });

    await waitFor(() => {
      expect(screen.getByText(/Priority: 54/i)).toBeInTheDocument();
    });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, requestInit] = (global.fetch as vi.Mock).mock.calls[0];
    expect(requestInit).toBeDefined();
    if (requestInit && typeof requestInit === 'object') {
      const body = requestInit.body as string;
      expect(body).toContain('"impact":9');
    }
  });
});
