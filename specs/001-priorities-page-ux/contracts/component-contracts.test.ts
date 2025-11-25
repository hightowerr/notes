/**
 * Component Contracts: Priorities Page UX Refinement
 *
 * These tests define the contracts for component prop interfaces and behavior.
 * They should be implemented as part of the TDD workflow during implementation.
 *
 * Feature: Priorities Page UX Refinement
 * Branch: 001-priorities-page-ux
 * Date: 2025-11-25
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Component imports (to be implemented)
import { TaskList } from '@/app/priorities/components/TaskList';
import { ContextCard } from '@/app/priorities/components/ContextCard';
import { SortingStrategySelector } from '@/app/priorities/components/SortingStrategySelector';
import { ReasoningChain } from '@/app/priorities/components/ReasoningChain';

// Mock data
const mockTasks = [
  {
    task_id: '1',
    task_text: 'High impact task',
    document_id: 'doc1',
    strategic_score: 95,
    display_rank: 1,
  },
  {
    task_id: '2',
    task_text: 'Medium impact task',
    document_id: 'doc2',
    strategic_score: 70,
    display_rank: 2,
  },
  {
    task_id: '3',
    task_text: 'Quick win task',
    document_id: 'doc3',
    strategic_score: 60,
    effort_estimate_hours: 2,
    display_rank: 3,
  },
];

const mockOutcome = {
  id: 'outcome1',
  user_id: 'user1',
  assembled_text: 'Launch beta product by Q1 with 10 paying customers',
  state_preference: 'energized',
  daily_capacity_hours: 6,
  created_at: new Date().toISOString(),
};

describe('TaskList Component Contract', () => {
  describe('Header Integration', () => {
    it('renders header with sorting dropdown when tasks exist', () => {
      const mockOnStrategyChange = vi.fn();

      render(
        <TaskList
          tasks={mockTasks}
          sortingStrategy="strategic-impact"
          onStrategyChange={mockOnStrategyChange}
        />
      );

      // Verify header elements exist
      expect(screen.getByRole('heading', { name: /your prioritized tasks/i })).toBeInTheDocument();
      expect(screen.getByText(/3 tasks/i)).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('disables sorting dropdown when no tasks', () => {
      const mockOnStrategyChange = vi.fn();

      render(
        <TaskList
          tasks={[]}
          sortingStrategy="strategic-impact"
          onStrategyChange={mockOnStrategyChange}
        />
      );

      const dropdown = screen.getByRole('combobox');
      expect(dropdown).toBeDisabled();
      expect(screen.getByText(/0 tasks/i)).toBeInTheDocument();
    });

    it('displays correct task count', () => {
      render(
        <TaskList
          tasks={mockTasks}
          sortingStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
        />
      );

      expect(screen.getByText('3 tasks')).toBeInTheDocument();
    });

    it('positions sorting dropdown to the right of header', () => {
      render(
        <TaskList
          tasks={mockTasks}
          sortingStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
        />
      );

      const header = screen.getByRole('heading').parentElement;
      expect(header).toHaveClass(expect.stringContaining('justify-between'));
    });
  });

  describe('Sorting Strategy Changes', () => {
    it('triggers onStrategyChange when strategy selected', async () => {
      const user = userEvent.setup();
      const mockOnStrategyChange = vi.fn();

      render(
        <TaskList
          tasks={mockTasks}
          sortingStrategy="strategic-impact"
          onStrategyChange={mockOnStrategyChange}
        />
      );

      const dropdown = screen.getByRole('combobox');
      await user.click(dropdown);

      const effortWeightedOption = screen.getByRole('option', { name: /effort weighted/i });
      await user.click(effortWeightedOption);

      expect(mockOnStrategyChange).toHaveBeenCalledWith('effort-weighted');
    });

    it('re-renders with new sorting strategy prop', () => {
      const { rerender } = render(
        <TaskList
          tasks={mockTasks}
          sortingStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
        />
      );

      expect(screen.getByDisplayValue(/strategic impact/i)).toBeInTheDocument();

      rerender(
        <TaskList
          tasks={mockTasks}
          sortingStrategy="effort-weighted"
          onStrategyChange={vi.fn()}
        />
      );

      expect(screen.getByDisplayValue(/effort weighted/i)).toBeInTheDocument();
    });
  });

  describe('Task Display', () => {
    it('renders all tasks in order', () => {
      render(
        <TaskList
          tasks={mockTasks}
          sortingStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
        />
      );

      expect(screen.getByText('High impact task')).toBeInTheDocument();
      expect(screen.getByText('Medium impact task')).toBeInTheDocument();
      expect(screen.getByText('Quick win task')).toBeInTheDocument();
    });

    it('renders tasks immediately below header', () => {
      render(
        <TaskList
          tasks={mockTasks}
          sortingStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
        />
      );

      const header = screen.getByRole('heading', { name: /your prioritized tasks/i }).parentElement;
      const taskList = header?.nextElementSibling;
      expect(taskList).toHaveClass(expect.stringContaining('divide-y'));
    });
  });
});

describe('ContextCard Component Contract', () => {
  describe('Metadata Display', () => {
    it('displays completion time when provided', () => {
      const completionTime = new Date(Date.now() - 120000); // 2 min ago

      render(
        <ContextCard
          outcome={mockOutcome}
          reflectionsCount={5}
          completionTime={completionTime}
          onRecalculate={vi.fn()}
        />
      );

      expect(screen.getByText(/completed.*2.*min.*ago/i)).toBeInTheDocument();
    });

    it('displays quality check badge when passed is true', () => {
      render(
        <ContextCard
          outcome={mockOutcome}
          reflectionsCount={5}
          qualityCheckPassed={true}
          onRecalculate={vi.fn()}
        />
      );

      expect(screen.getByText(/quality check.*passed/i)).toBeInTheDocument();
      const badge = screen.getByText(/passed/i).parentElement;
      expect(badge).toHaveClass(expect.stringContaining('badge'));
    });

    it('displays quality check warning badge when passed is false', () => {
      render(
        <ContextCard
          outcome={mockOutcome}
          reflectionsCount={5}
          qualityCheckPassed={false}
          onRecalculate={vi.fn()}
        />
      );

      expect(screen.getByText(/quality check.*review/i)).toBeInTheDocument();
      const badge = screen.getByText(/review/i).parentElement;
      expect(badge).toHaveClass(expect.stringContaining('badge'));
    });

    it('gracefully handles missing completion time', () => {
      render(
        <ContextCard
          outcome={mockOutcome}
          reflectionsCount={5}
          qualityCheckPassed={true}
          onRecalculate={vi.fn()}
        />
      );

      expect(screen.queryByText(/completed.*ago/i)).not.toBeInTheDocument();
      expect(screen.getByText(/quality check.*passed/i)).toBeInTheDocument();
    });

    it('gracefully handles missing quality check', () => {
      const completionTime = new Date(Date.now() - 120000);

      render(
        <ContextCard
          outcome={mockOutcome}
          reflectionsCount={5}
          completionTime={completionTime}
          onRecalculate={vi.fn()}
        />
      );

      expect(screen.getByText(/completed.*2.*min.*ago/i)).toBeInTheDocument();
      expect(screen.queryByText(/quality check/i)).not.toBeInTheDocument();
    });

    it('gracefully handles both metadata fields missing', () => {
      render(
        <ContextCard
          outcome={mockOutcome}
          reflectionsCount={5}
          onRecalculate={vi.fn()}
        />
      );

      expect(screen.queryByText(/completed.*ago/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/quality check/i)).not.toBeInTheDocument();
      // Component should still render outcome and reflections
      expect(screen.getByText(mockOutcome.assembled_text)).toBeInTheDocument();
    });
  });

  describe('Existing Functionality Preserved', () => {
    it('displays outcome statement', () => {
      render(
        <ContextCard
          outcome={mockOutcome}
          reflectionsCount={5}
          onRecalculate={vi.fn()}
        />
      );

      expect(screen.getByText(mockOutcome.assembled_text)).toBeInTheDocument();
    });

    it('displays reflections count', () => {
      render(
        <ContextCard
          outcome={mockOutcome}
          reflectionsCount={5}
          onRecalculate={vi.fn()}
        />
      );

      expect(screen.getByText(/5 reflections/i)).toBeInTheDocument();
    });

    it('triggers onRecalculate when button clicked', async () => {
      const user = userEvent.setup();
      const mockOnRecalculate = vi.fn();

      render(
        <ContextCard
          outcome={mockOutcome}
          reflectionsCount={5}
          onRecalculate={mockOnRecalculate}
        />
      );

      const button = screen.getByRole('button', { name: /recalculate/i });
      await user.click(button);

      expect(mockOnRecalculate).toHaveBeenCalledTimes(1);
    });
  });
});

describe('SortingStrategySelector Component Contract', () => {
  describe('Compact Variant', () => {
    it('applies compact styles when compact prop is true', () => {
      render(
        <SortingStrategySelector
          selectedStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
          compact={true}
        />
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveClass(expect.stringContaining('h-9'));
      expect(trigger).toHaveClass(expect.stringContaining('text-sm'));
    });

    it('applies default styles when compact prop is false', () => {
      render(
        <SortingStrategySelector
          selectedStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
          compact={false}
        />
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveClass(expect.stringContaining('h-11'));
      expect(trigger).toHaveClass(expect.stringContaining('text-base'));
    });

    it('uses default styles when compact prop omitted', () => {
      render(
        <SortingStrategySelector
          selectedStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
        />
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveClass(expect.stringContaining('h-11'));
    });
  });

  describe('Disabled State', () => {
    it('disables select when disabled prop is true', () => {
      render(
        <SortingStrategySelector
          selectedStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
          disabled={true}
        />
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeDisabled();
    });

    it('enables select when disabled prop is false', () => {
      render(
        <SortingStrategySelector
          selectedStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
          disabled={false}
        />
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).not.toBeDisabled();
    });

    it('shows tooltip when disabled', async () => {
      const user = userEvent.setup();

      render(
        <SortingStrategySelector
          selectedStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
          disabled={true}
        />
      );

      const trigger = screen.getByRole('combobox');
      await user.hover(trigger);

      expect(await screen.findByText(/no tasks to sort/i)).toBeInTheDocument();
    });
  });

  describe('Strategy Selection', () => {
    it('displays current strategy', () => {
      render(
        <SortingStrategySelector
          selectedStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
        />
      );

      expect(screen.getByDisplayValue(/strategic impact/i)).toBeInTheDocument();
    });

    it('calls onStrategyChange with selected strategy', async () => {
      const user = userEvent.setup();
      const mockOnStrategyChange = vi.fn();

      render(
        <SortingStrategySelector
          selectedStrategy="strategic-impact"
          onStrategyChange={mockOnStrategyChange}
        />
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: /effort weighted/i }));

      expect(mockOnStrategyChange).toHaveBeenCalledWith('effort-weighted');
    });

    it('renders all strategy options', async () => {
      const user = userEvent.setup();

      render(
        <SortingStrategySelector
          selectedStrategy="strategic-impact"
          onStrategyChange={vi.fn()}
        />
      );

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByRole('option', { name: /strategic impact/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /effort weighted/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /deadline focused/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /lno first/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /manual override/i })).toBeInTheDocument();
    });
  });
});

describe('ReasoningChain Component Contract', () => {
  const mockChainOfThought = [
    'Step 1: Analyzed task priorities',
    'Step 2: Evaluated dependencies',
    'Step 3: Optimized for strategic impact',
  ];

  describe('Debug Mode Visibility', () => {
    it('renders when debugMode is true', () => {
      render(
        <ReasoningChain
          chainOfThought={mockChainOfThought}
          totalIterations={3}
          debugMode={true}
        />
      );

      expect(screen.getByText(/reasoning chain/i)).toBeInTheDocument();
    });

    it('returns null when debugMode is false', () => {
      const { container } = render(
        <ReasoningChain
          chainOfThought={mockChainOfThought}
          totalIterations={3}
          debugMode={false}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('returns null when debugMode is undefined', () => {
      const { container } = render(
        <ReasoningChain
          chainOfThought={mockChainOfThought}
          totalIterations={3}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Content Display', () => {
    it('displays chain-of-thought steps when present', () => {
      render(
        <ReasoningChain
          chainOfThought={mockChainOfThought}
          totalIterations={3}
          debugMode={true}
        />
      );

      expect(screen.getByText(/step 1.*analyzed task priorities/i)).toBeInTheDocument();
      expect(screen.getByText(/step 2.*evaluated dependencies/i)).toBeInTheDocument();
      expect(screen.getByText(/step 3.*optimized for strategic impact/i)).toBeInTheDocument();
    });

    it('displays message when no iterations', () => {
      render(
        <ReasoningChain
          chainOfThought={[]}
          totalIterations={0}
          debugMode={true}
        />
      );

      expect(screen.getByText(/no iterations.*fast path/i)).toBeInTheDocument();
    });

    it('displays iteration count', () => {
      render(
        <ReasoningChain
          chainOfThought={mockChainOfThought}
          totalIterations={3}
          debugMode={true}
        />
      );

      expect(screen.getByText(/3 iterations/i)).toBeInTheDocument();
    });
  });

  describe('Collapsible Behavior', () => {
    it('renders as collapsed by default', () => {
      render(
        <ReasoningChain
          chainOfThought={mockChainOfThought}
          totalIterations={3}
          debugMode={true}
        />
      );

      const content = screen.getByText(/step 1/i).parentElement;
      expect(content).toHaveAttribute('data-state', 'closed');
    });

    it('expands when clicked', async () => {
      const user = userEvent.setup();

      render(
        <ReasoningChain
          chainOfThought={mockChainOfThought}
          totalIterations={3}
          debugMode={true}
        />
      );

      const trigger = screen.getByRole('button', { name: /reasoning chain/i });
      await user.click(trigger);

      const content = screen.getByText(/step 1/i).parentElement;
      expect(content).toHaveAttribute('data-state', 'open');
    });
  });
});

describe('Integration: Sorting Feedback Loop', () => {
  it('user sees tasks re-order without scrolling', async () => {
    const user = userEvent.setup();

    // Mock window.scrollY
    let scrollY = 0;
    Object.defineProperty(window, 'scrollY', {
      value: scrollY,
      writable: true,
    });

    const mockOnStrategyChange = vi.fn((newStrategy) => {
      // In real implementation, this would trigger state update
      // and tasks would re-order based on new strategy
    });

    render(
      <TaskList
        tasks={mockTasks}
        sortingStrategy="strategic-impact"
        onStrategyChange={mockOnStrategyChange}
      />
    );

    // Verify initial order (strategic-impact sorting)
    const taskRows = screen.getAllByRole('article'); // Assuming TaskRow has role="article"
    expect(taskRows[0]).toHaveTextContent('High impact task'); // score: 95

    // Change sorting strategy
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /effort weighted/i }));

    // Verify scroll position unchanged
    expect(window.scrollY).toBe(0);

    // Verify onStrategyChange called
    expect(mockOnStrategyChange).toHaveBeenCalledWith('effort-weighted');
  });
});
