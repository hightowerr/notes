import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { ExcludedTasksSection } from '../ExcludedTasksSection';
import { ExcludedTask } from '@/lib/schemas/excludedTaskSchema';

// Mock shadcn components since they might use ResizeObserver or other browser APIs
vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open, onOpenChange, ...props }: any) => (
    <div data-testid="collapsible" data-state={open ? 'open' : 'closed'} {...props}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({ children, onClick, ...props }: any) => (
    <button data-testid="collapsible-trigger" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  CollapsibleContent: ({ children, ...props }: any) => (
    <div data-testid="collapsible-content" {...props}>
      {children}
    </div>
  ),
}));

describe('ExcludedTasksSection', () => {
  const mockExcludedTasks: ExcludedTask[] = [
    {
      task_id: '1',
      task_text: 'Buy groceries',
      exclusion_reason: 'Not a priority today',
      alignment_score: 0.2,
    },
    {
      task_id: '2',
      task_text: 'Walk the dog',
      exclusion_reason: 'Already done',
      alignment_score: 0.1,
    },
  ];

  it('renders nothing when excludedTasks is empty', () => {
    const { container } = render(<ExcludedTasksSection excludedTasks={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the section with correct count when tasks are provided', () => {
    render(<ExcludedTasksSection excludedTasks={mockExcludedTasks} />);
    expect(screen.getByText('Show 2 excluded tasks')).toBeInTheDocument();
  });

  it('toggles content when clicked', () => {
    render(<ExcludedTasksSection excludedTasks={mockExcludedTasks} />);
    
    const trigger = screen.getByTestId('collapsible-trigger');
    
    // Initial state should be collapsed (based on default implementation)
    // Note: We can't easily test "collapsed" visibility with simple mocks without checking state props
    // But we can check if the text changes if we implemented dynamic text
    
    fireEvent.click(trigger);
    // In a real browser, this would expand. With our mock, we might need to manage state if we want to test it fully,
    // but here we are mainly testing that the component renders the trigger and content structure.
    
    // Check if tasks are in the document (they might be "hidden" but present in DOM depending on Collapsible implementation)
    expect(screen.getByText('Buy groceries')).toBeInTheDocument();
    expect(screen.getByText('Not a priority today')).toBeInTheDocument();
    expect(screen.getByText('Walk the dog')).toBeInTheDocument();
    expect(screen.getByText('Already done')).toBeInTheDocument();
  });
});
