import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import ErrorBanner from '@/app/components/ErrorBanner';

describe('ErrorBanner', () => {
  it('renders custom message', () => {
    render(<ErrorBanner message="Prioritization failed" />);
    expect(screen.getByText('Prioritization failed')).toBeInTheDocument();
  });

  it('calls retry handler on click', () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Failed" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables retry when attempts are exhausted', () => {
    const onRetry = vi.fn();
    render(
      <ErrorBanner
        message="Failed"
        onRetry={onRetry}
        retryCount={3}
        maxRetries={3}
        retryLabel="Retry"
      />
    );

    const button = screen.getByRole('button', { name: /retry/i });
    expect(button).toBeDisabled();
  });

  it('has accessible alert semantics', () => {
    render(<ErrorBanner message="Alert message" />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Alert message');
  });
});
