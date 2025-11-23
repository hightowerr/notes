import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReasoningChain } from '../ReasoningChain';

describe('ReasoningChain', () => {
  const chain = [
    {
      iteration: 1,
      confidence: 0.65,
      corrections: 'Initially included refactoring task.',
      evaluator_feedback: 'Refactoring does not advance the revenue metric.',
      timestamp: '2024-05-01T10:00:00Z',
    },
    {
      iteration: 2,
      confidence: 0.78,
      corrections: 'Removed refactoring and elevated payment tasks.',
      evaluator_feedback: 'Much closer; ensure docs stay excluded.',
      timestamp: '2024-05-01T10:15:00Z',
    },
    {
      iteration: 3,
      confidence: 0.82,
      corrections: 'Moved refactoring to excluded list and tightened ordering.',
      timestamp: '2024-05-01T10:30:00Z',
    },
  ];

  it('renders reasoning steps in order with confidence badges and evaluator feedback', () => {
    render(<ReasoningChain chain={chain} iterations={3} evaluationTriggered />);

    expect(screen.getByText('Reasoning Chain')).toBeInTheDocument();
    expect(screen.getAllByText(/Iteration \d/)).toHaveLength(3);
    expect(screen.getByText('Confidence 65%')).toBeInTheDocument();
    expect(screen.getByText('Confidence 78%')).toBeInTheDocument();
    expect(screen.getByText('Confidence 82%')).toBeInTheDocument();

    expect(
      screen.getByText('Refactoring does not advance the revenue metric.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Much closer; ensure docs stay excluded.')
    ).toBeInTheDocument();

    expect(
      screen.getByText('Moved refactoring to excluded list and tightened ordering.')
    ).toBeInTheDocument();
  });

  it('toggles visibility when clicking expand/collapse button', () => {
    render(<ReasoningChain chain={chain} iterations={3} evaluationTriggered />);

    const toggleButton = screen.getByRole('button', { name: /collapse reasoning chain/i });
    fireEvent.click(toggleButton);

    expect(screen.queryByText(/Iteration 1/)).not.toBeInTheDocument();

    const expandButton = screen.getByRole('button', { name: /expand reasoning chain/i });
    fireEvent.click(expandButton);

    expect(screen.getByText(/Iteration 1/)).toBeInTheDocument();
  });

  it('shows placeholder when no chain is available', () => {
    render(<ReasoningChain chain={null} iterations={2} evaluationTriggered={false} />);

    expect(
      screen.getByText(/Awaiting reasoning chain \(expected 2 iterations\)/i)
    ).toBeInTheDocument();
  });
});
