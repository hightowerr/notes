import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuadrantViz, type QuadrantVizTask } from '@/app/priorities/components/QuadrantViz';

const TEST_TASKS: QuadrantVizTask[] = [
  { id: 'task-quick', title: 'Optimize onboarding copy', impact: 8, effort: 4, confidence: 0.8 },
  { id: 'task-risk', title: 'Rebuild infrastructure', impact: 3, effort: 48, confidence: 0.6 },
];

describe('QuadrantViz', () => {
  it('renders bubbles in matching quadrants with colors', async () => {
    render(
      <div style={{ width: 800, height: 400 }}>
        <QuadrantViz tasks={TEST_TASKS} />
      </div>
    );

    const quickBubble = await screen.findByTestId('quadrant-bubble-task-quick');
    const quickCircle = quickBubble.querySelector('[data-role="bubble-core"]');
    expect(quickCircle).toHaveAttribute('stroke', '#10b981');

    const riskBubble = await screen.findByTestId('quadrant-bubble-task-risk');
    const riskCircle = riskBubble.querySelector('[data-role="bubble-core"]');
    expect(riskCircle).toHaveAttribute('stroke', '#ef4444');
  });

  it('emits task click events when bubbles are clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <div style={{ width: 800, height: 400 }}>
        <QuadrantViz tasks={TEST_TASKS} onTaskClick={handleClick} />
      </div>
    );

    const quickBubble = await screen.findByTestId('quadrant-bubble-task-quick');
    await user.click(quickBubble);
    expect(handleClick).toHaveBeenCalledWith('task-quick');
  });
});

