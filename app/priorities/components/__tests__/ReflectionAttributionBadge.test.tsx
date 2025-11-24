import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ReflectionAttributionBadge } from '../ReflectionAttributionBadge';

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...rest }: { children: React.ReactNode }) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ReflectionAttributionBadge', () => {
  const baseProps = {
    effect: 'blocked' as const,
    reason: 'Legal hold prevents outreach',
    reflectionId: '00000000-0000-4000-8000-000000000123',
  };

  it('renders blocked badge with icon and label', () => {
    render(<ReflectionAttributionBadge {...baseProps} />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('🚫')).toBeInTheDocument();
  });

  it('shows reason text (tooltip content)', () => {
    render(<ReflectionAttributionBadge {...baseProps} />);
    expect(screen.getByText(baseProps.reason)).toBeInTheDocument();
  });

  it('dispatches highlight event on click', () => {
    const listener = vi.fn();
    window.addEventListener('highlight-reflection', listener as EventListener);

    render(<ReflectionAttributionBadge {...baseProps} />);
    fireEvent.click(screen.getByText('Blocked'));

    expect(listener).toHaveBeenCalled();
    window.removeEventListener('highlight-reflection', listener as EventListener);
  });
});
