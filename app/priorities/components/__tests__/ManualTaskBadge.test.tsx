import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ManualTaskBadge } from '../ManualTaskBadge';

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...rest }: { children: React.ReactNode }) => (
    <div {...rest}>{children}</div>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ManualTaskBadge', () => {
  it('renders analyzing state with icon and label', () => {
    render(<ManualTaskBadge status="analyzing" />);
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    expect(screen.getByText('⏳')).toBeInTheDocument();
  });

  it('renders manual state', () => {
    render(<ManualTaskBadge status="manual" />);
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('renders conflict state', () => {
    render(<ManualTaskBadge status="conflict" />);
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });

  it('renders detail inside tooltip trigger', () => {
    render(<ManualTaskBadge status="error" detail="Unable to reach agent" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Unable to reach agent')).toBeInTheDocument();
  });
});
