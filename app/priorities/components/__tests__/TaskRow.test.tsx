import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TaskRow } from '../TaskRow';
import { TaskWithScores } from '@/lib/schemas/strategicScore';

// Mock dependencies
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: () => <input type="checkbox" />,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/app/priorities/components/MovementBadge', () => ({
  MovementBadge: () => <div>MovementBadge</div>,
}));
vi.mock('@/app/priorities/components/ScoreBreakdownModal', () => ({
  ScoreBreakdownModal: () => <div>ScoreBreakdownModal</div>,
}));
vi.mock('@/app/priorities/components/ManualOverrideControls', () => ({
  ManualOverrideControls: () => <div>ManualOverrideControls</div>,
}));
vi.mock('@/app/priorities/components/ManualTaskBadge', () => ({
  ManualTaskBadge: () => <div>ManualTaskBadge</div>,
}));

describe('TaskRow', () => {
  const mockTask: TaskWithScores = {
    task_id: 'task-1',
    task_text: 'Test Task',
    source: 'embedding',
    document_id: 'doc-1',
    impact: 8,
    effort: 2,
    confidence: 0.9,
    priority: 80,
    hasManualOverride: false,
    quadrant: 'high_impact_low_effort',
    reasoning: 'Test reasoning',
    reflection_influence: 'Reflection influence text',
  } as any;

  const defaultProps = {
    taskId: 'task-1',
    order: 1,
    title: 'Test Task',
    isLocked: false,
    dependencyLinks: [],
    movement: undefined,
    checked: false,
    isAiGenerated: true,
    isSelected: false,
    isHighlighted: false,
    onSelect: vi.fn(),
    onToggleCompleted: vi.fn(),
    onToggleLock: vi.fn(),
    isEditingDisabled: false,
    strategicDetails: mockTask,
    impact: mockTask.impact,
    effort: mockTask.effort,
    confidence: mockTask.confidence,
    priority: mockTask.priority,
  };

  it('renders reflection influence when present', () => {
    render(<TaskRow {...defaultProps} />);
    expect(screen.getByText('Reflection: Reflection influence text')).toBeInTheDocument();
  });

  it('does not render reflection influence when absent', () => {
    const propsWithoutReflection = {
      ...defaultProps,
      strategicDetails: { ...mockTask, reflection_influence: undefined },
    };
    render(<TaskRow {...propsWithoutReflection} />);
    expect(screen.queryByText(/Reflection:/)).not.toBeInTheDocument();
  });

  it('does not render reflection influence when empty string', () => {
    const propsWithEmptyReflection = {
      ...defaultProps,
      strategicDetails: { ...mockTask, reflection_influence: '' },
    };
    render(<TaskRow {...propsWithEmptyReflection} />);
    expect(screen.queryByText(/Reflection:/)).not.toBeInTheDocument();
  });

  it('renders very long reflection text without breaking layout', () => {
    const longReflectionText =
      'This is a very long reflection influence text that spans multiple lines and should be handled gracefully by the component without breaking the layout or causing overflow issues in the UI';
    const propsWithLongReflection = {
      ...defaultProps,
      strategicDetails: { ...mockTask, reflection_influence: longReflectionText },
    };
    render(<TaskRow {...propsWithLongReflection} />);
    expect(screen.getByText(`Reflection: ${longReflectionText}`)).toBeInTheDocument();
  });

  it('has correct ARIA attributes for accessibility', () => {
    render(<TaskRow {...defaultProps} />);
    const reflectionElement = screen.getByRole('status');
    expect(reflectionElement).toHaveAttribute(
      'aria-label',
      'Reflection influence: Reflection influence text'
    );
  });

  it('does not render status role when reflection influence is absent', () => {
    const propsWithoutReflection = {
      ...defaultProps,
      strategicDetails: { ...mockTask, reflection_influence: undefined },
    };
    render(<TaskRow {...propsWithoutReflection} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('renders inclusion reason badge when present', () => {
    const propsWithInclusionReason = {
      ...defaultProps,
      inclusionReason: 'This task is critical for the MVP.',
    };
    render(<TaskRow {...propsWithInclusionReason} />);
    // The text appears twice: once in the badge and once in the tooltip content (due to our mock)
    const elements = screen.getAllByText('This task is critical for the MVP.');
    expect(elements.length).toBeGreaterThan(0);
    expect(elements[0]).toBeInTheDocument();
  });

  it('does not render inclusion reason badge when absent', () => {
    render(<TaskRow {...defaultProps} />);
    expect(screen.queryByText('This task is critical for the MVP.')).not.toBeInTheDocument();
  });

  it('renders manual edit and mark done buttons when manual', () => {
    const onEditManual = vi.fn();
    const onMarkManualDone = vi.fn();
    const onDeleteManual = vi.fn();
    render(
      <TaskRow
        {...defaultProps}
        isManual
        onEditManual={onEditManual}
        onMarkManualDone={onMarkManualDone}
        onDeleteManual={onDeleteManual}
      />
    );
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Mark done')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });
});
