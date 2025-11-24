import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { BlockedTasksSection, type BlockedTask } from '../BlockedTasksSection';

// Mock UI components
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

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="collapsible" data-open={open}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode }) => <div {...rest}>{children}</div>,
  CardContent: ({ children, ...rest }: { children: React.ReactNode }) => (
    <div {...rest}>{children}</div>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...rest }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

describe('BlockedTasksSection', () => {
  const mockBlockedTasks: BlockedTask[] = [
    {
      task_id: 'task-1',
      task_text: 'Email campaign preparation',
      blocking_effect: {
        reflection_id: 'reflection-1',
        task_id: 'task-1',
        effect: 'blocked',
        magnitude: -10,
        reason: 'Legal hold on outreach',
      },
    },
    {
      task_id: 'task-2',
      task_text: 'Cold outreach follow-up',
      blocking_effect: {
        reflection_id: 'reflection-1',
        task_id: 'task-2',
        effect: 'blocked',
        magnitude: -10,
        reason: 'Legal hold on outreach',
      },
      reflection_text: 'Legal blocked all customer outreach',
    },
  ];

  it('renders nothing when blockedTasks is empty', () => {
    const { container } = render(<BlockedTasksSection blockedTasks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when blockedTasks is undefined', () => {
    const { container } = render(
      <BlockedTasksSection blockedTasks={undefined as unknown as BlockedTask[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays count of blocked tasks', () => {
    render(<BlockedTasksSection blockedTasks={mockBlockedTasks} />);
    expect(screen.getByText('2 tasks blocked by reflections')).toBeInTheDocument();
  });

  it('shows singular form for single blocked task', () => {
    render(<BlockedTasksSection blockedTasks={[mockBlockedTasks[0]]} />);
    expect(screen.getByText('1 task blocked by reflections')).toBeInTheDocument();
  });

  it('renders blocked task text with strikethrough', () => {
    render(<BlockedTasksSection blockedTasks={mockBlockedTasks} />);
    expect(screen.getByText('Email campaign preparation')).toBeInTheDocument();
    expect(screen.getByText('Cold outreach follow-up')).toBeInTheDocument();
  });

  it('renders the Blocked badge for each task', () => {
    render(<BlockedTasksSection blockedTasks={mockBlockedTasks} />);
    const blockedBadges = screen.getAllByText('Blocked');
    expect(blockedBadges.length).toBe(2);
  });

  it('shows reflection text when provided', () => {
    render(<BlockedTasksSection blockedTasks={mockBlockedTasks} />);
    expect(screen.getByText(/Legal blocked all customer outreach/)).toBeInTheDocument();
  });

  it('renders Unblock button when onUnblockReflection is provided', () => {
    const handleUnblock = vi.fn();
    render(
      <BlockedTasksSection blockedTasks={mockBlockedTasks} onUnblockReflection={handleUnblock} />
    );
    const unblockButtons = screen.getAllByText('Unblock');
    expect(unblockButtons.length).toBe(2);
  });

  it('calls onUnblockReflection with reflection ID when Unblock is clicked', () => {
    const handleUnblock = vi.fn();
    render(
      <BlockedTasksSection blockedTasks={mockBlockedTasks} onUnblockReflection={handleUnblock} />
    );
    const unblockButtons = screen.getAllByText('Unblock');
    fireEvent.click(unblockButtons[0]);
    expect(handleUnblock).toHaveBeenCalledWith('reflection-1');
  });

  it('has correct test ids for blocked tasks', () => {
    render(<BlockedTasksSection blockedTasks={mockBlockedTasks} />);
    expect(screen.getByTestId('blocked-task-task-1')).toBeInTheDocument();
    expect(screen.getByTestId('blocked-task-task-2')).toBeInTheDocument();
  });

  it('has accessible region role and label', () => {
    render(<BlockedTasksSection blockedTasks={mockBlockedTasks} />);
    expect(screen.getByRole('region', { name: 'Blocked tasks' })).toBeInTheDocument();
  });
});
