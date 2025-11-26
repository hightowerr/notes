import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SortingStrategySelector } from '../SortingStrategySelector';

describe('SortingStrategySelector', () => {
  it('applies compact sizing when compact is true', () => {
    render(
      <SortingStrategySelector
        value="balanced"
        onChange={vi.fn()}
        compact
      />
    );

    const trigger = screen.getByTestId('sorting-strategy-trigger');
    expect(trigger.className).toContain('h-9');
    expect(trigger.className).toContain('text-sm');
    expect(trigger.className).toContain('px-2');
  });

  it('applies default sizing when compact is false', () => {
    render(
      <SortingStrategySelector
        value="balanced"
        onChange={vi.fn()}
      />
    );

    const trigger = screen.getByTestId('sorting-strategy-trigger');
    expect(trigger.className).toContain('h-11');
    expect(trigger.className).toContain('text-base');
    expect(trigger.className).toContain('px-4');
  });

  it('shows disabled tooltip copy', async () => {
    const user = userEvent.setup();
    render(
      <SortingStrategySelector
        value="balanced"
        onChange={vi.fn()}
        disabled
        compact
      />
    );

    const trigger = screen.getByTestId('sorting-strategy-trigger');
    await user.hover(trigger);

    const tooltips = await screen.findAllByText('No tasks to sort');
    expect(tooltips.length).toBeGreaterThan(0);
    expect(trigger).toHaveAttribute('data-disabled');
  });
});
