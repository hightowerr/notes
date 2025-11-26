import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PrioritizationSummary } from '@/app/priorities/components/PrioritizationSummary';

// Deprecated component: tests remain to catch regressions until removal.

describe('PrioritizationSummary', () => {
  it('shows fast path badge with formatted duration', () => {
    render(<PrioritizationSummary durationMs={17634} evaluationTriggered={false} />);

    expect(screen.getByText(/Completed in/i)).toBeInTheDocument();
    expect(screen.getByText('17.6s')).toBeInTheDocument();
    expect(screen.getByText(/Fast path/i)).toBeInTheDocument();
  });

  it('shows quality badge when evaluation is triggered', () => {
    render(<PrioritizationSummary durationMs={24550} evaluationTriggered />);

    expect(screen.getByText('24.6s')).toBeInTheDocument();
    expect(screen.getByText(/Quality checked/i)).toBeInTheDocument();
  });
});
