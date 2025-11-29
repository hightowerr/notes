/**
 * Integration Test: Completed Tasks Pagination (T020)
 *
 * Purpose: Validate completed tasks section behavior with pagination
 *
 * Test Scenarios:
 * 1. Complete task → moves to "Completed" section
 * 2. Default shows last 10 completed tasks
 * 3. "Show more" loads next 10 older tasks
 * 4. Button hidden when ≤10 completed tasks
 * 5. 0 completed → Shows "No completed tasks yet"
 *
 * Expected Initial State: RED (test fails - CompletedTasksSection doesn't exist yet)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Type for mock task data
type MockTask = {
  id: string;
  title: string;
  checked: boolean;
  completed_at?: string;
  impact?: number;
  effort?: number;
  priority?: number;
};

describe('Completed Tasks Pagination (T020)', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('Scenario 1: Complete task → moves to "Completed" section', () => {
    it('should move task to completed section when checkbox is clicked', async () => {
      // This test will fail initially because CompletedTasksSection doesn't exist

      // Arrange: Import the CompletedTasksSection component (will fail)
      const { CompletedTasksSection } = await import('@/app/priorities/components/CompletedTasksSection');

      const mockActiveTasks: MockTask[] = [
        { id: 'task-1', title: 'Active Task 1', checked: false, priority: 10 },
        { id: 'task-2', title: 'Active Task 2', checked: false, priority: 9 },
      ];

      const mockCompletedTasks: MockTask[] = [];

      // Act: Render component with active tasks
      render(
        <CompletedTasksSection
          completedTasks={mockCompletedTasks}
          onShowMore={vi.fn()}
        />
      );

      // Initially no completed tasks shown
      expect(screen.queryByText('No completed tasks yet')).toBeInTheDocument();

      // Simulate completing a task (would trigger re-render with updated data)
      const updatedCompletedTasks: MockTask[] = [
        { id: 'task-1', title: 'Active Task 1', checked: true, completed_at: new Date().toISOString() },
      ];

      // Re-render with completed task
      const { rerender } = render(
        <CompletedTasksSection
          completedTasks={updatedCompletedTasks}
          onShowMore={vi.fn()}
        />
      );

      // Assert: Task appears in completed section
      await waitFor(() => {
        expect(screen.getByText('Active Task 1')).toBeInTheDocument();
      });
    });
  });

  describe('Scenario 2: Default shows last 10 completed tasks', () => {
    it('should display only last 10 completed tasks by default', async () => {
      // Arrange: Create 15 completed tasks total, but parent only shows first 10
      const allCompletedTasks: MockTask[] = Array.from({ length: 15 }, (_, i) => ({
        id: `task-${i + 1}`,
        title: `Completed Task ${i + 1}`,
        checked: true,
        completed_at: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(), // Stagger by hour
      }));

      // This will fail because component doesn't exist
      const { CompletedTasksSection } = await import('@/app/priorities/components/CompletedTasksSection');

      // Act: Render component with first 10 tasks (parent pagination)
      render(
        <CompletedTasksSection
          completedTasks={allCompletedTasks.slice(0, 10)}
          onShowMore={vi.fn()}
          hasMore={true}
        />
      );

      // Assert: Only 10 tasks visible
      const completedSection = screen.getByRole('region', { name: /completed/i });
      const visibleTasks = within(completedSection).getAllByRole('listitem');

      expect(visibleTasks).toHaveLength(10);

      // Verify newest tasks shown first (task-1 through task-10)
      expect(screen.getByText('Completed Task 1')).toBeInTheDocument();
      expect(screen.getByText('Completed Task 10')).toBeInTheDocument();
      expect(screen.queryByText('Completed Task 11')).not.toBeInTheDocument();
    });
  });

  describe('Scenario 3: "Show more" loads next 10 older tasks', () => {
    it('should load next 10 tasks when "Show more" is clicked', async () => {
      const user = userEvent.setup();

      // Arrange: Create 25 completed tasks
      const mockCompletedTasks: MockTask[] = Array.from({ length: 25 }, (_, i) => ({
        id: `task-${i + 1}`,
        title: `Completed Task ${i + 1}`,
        checked: true,
        completed_at: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
      }));

      const mockOnShowMore = vi.fn();

      // This will fail because component doesn't exist
      const { CompletedTasksSection } = await import('@/app/priorities/components/CompletedTasksSection');

      // Act: Render component with first 10 tasks
      const { rerender } = render(
        <CompletedTasksSection
          completedTasks={mockCompletedTasks.slice(0, 10)} // Initially 10
          onShowMore={mockOnShowMore}
          hasMore={true}
        />
      );

      // Click "Show more" button
      const showMoreButton = screen.getByRole('button', { name: /show more/i });
      await user.click(showMoreButton);

      // Assert: onShowMore callback was called
      expect(mockOnShowMore).toHaveBeenCalledTimes(1);

      // Simulate parent component providing next 10 tasks (total 20)
      rerender(
        <CompletedTasksSection
          completedTasks={mockCompletedTasks.slice(0, 20)} // Now 20
          onShowMore={mockOnShowMore}
          hasMore={true}
        />
      );

      // Verify 20 tasks now visible
      const visibleTasks = screen.getAllByRole('listitem');
      expect(visibleTasks).toHaveLength(20);

      // Verify task-11 through task-20 are now visible
      expect(screen.getByText('Completed Task 11')).toBeInTheDocument();
      expect(screen.getByText('Completed Task 20')).toBeInTheDocument();
    });
  });

  describe('Scenario 4: Button hidden when ≤10 completed tasks', () => {
    it('should hide "Show more" button when 10 or fewer tasks', async () => {
      // Arrange: Create exactly 10 completed tasks
      const mockCompletedTasks: MockTask[] = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i + 1}`,
        title: `Completed Task ${i + 1}`,
        checked: true,
        completed_at: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
      }));

      // This will fail because component doesn't exist
      const { CompletedTasksSection } = await import('@/app/priorities/components/CompletedTasksSection');

      // Act: Render component
      render(
        <CompletedTasksSection
          completedTasks={mockCompletedTasks}
          onShowMore={vi.fn()}
          hasMore={false}
        />
      );

      // Assert: "Show more" button not present
      expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
    });

    it('should hide "Show more" button when fewer than 10 tasks', async () => {
      // Arrange: Create 5 completed tasks
      const mockCompletedTasks: MockTask[] = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i + 1}`,
        title: `Completed Task ${i + 1}`,
        checked: true,
        completed_at: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
      }));

      // This will fail because component doesn't exist
      const { CompletedTasksSection } = await import('@/app/priorities/components/CompletedTasksSection');

      // Act: Render component
      render(
        <CompletedTasksSection
          completedTasks={mockCompletedTasks}
          onShowMore={vi.fn()}
          hasMore={false}
        />
      );

      // Assert: "Show more" button not present
      expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
    });
  });

  describe('Scenario 5: 0 completed → Shows "No completed tasks yet"', () => {
    it('should display empty state message when no completed tasks', async () => {
      // Arrange: Empty completed tasks array
      const mockCompletedTasks: MockTask[] = [];

      // This will fail because component doesn't exist
      const { CompletedTasksSection } = await import('@/app/priorities/components/CompletedTasksSection');

      // Act: Render component
      render(
        <CompletedTasksSection
          completedTasks={mockCompletedTasks}
          onShowMore={vi.fn()}
          hasMore={false}
        />
      );

      // Assert: Empty state message displayed
      expect(screen.getByText('No completed tasks yet')).toBeInTheDocument();

      // No task list items present
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });
  });

  describe('Pagination State Management', () => {
    it('should disable "Show more" button while loading', async () => {
      const user = userEvent.setup();

      // Arrange: Create tasks and loading state
      const mockCompletedTasks: MockTask[] = Array.from({ length: 15 }, (_, i) => ({
        id: `task-${i + 1}`,
        title: `Completed Task ${i + 1}`,
        checked: true,
        completed_at: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
      }));

      // This will fail because component doesn't exist
      const { CompletedTasksSection } = await import('@/app/priorities/components/CompletedTasksSection');

      // Act: Render with isExpanding state
      render(
        <CompletedTasksSection
          completedTasks={mockCompletedTasks.slice(0, 10)}
          onShowMore={vi.fn()}
          hasMore={true}
          isExpanding={true}
        />
      );

      // Assert: Button is disabled during load
      const showMoreButton = screen.getByRole('button', { name: /show more/i });
      expect(showMoreButton).toBeDisabled();
    });

    it('should show loading indicator while expanding', async () => {
      // Arrange
      const mockCompletedTasks: MockTask[] = Array.from({ length: 15 }, (_, i) => ({
        id: `task-${i + 1}`,
        title: `Completed Task ${i + 1}`,
        checked: true,
        completed_at: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
      }));

      // This will fail because component doesn't exist
      const { CompletedTasksSection } = await import('@/app/priorities/components/CompletedTasksSection');

      // Act: Render with isExpanding state
      render(
        <CompletedTasksSection
          completedTasks={mockCompletedTasks.slice(0, 10)}
          onShowMore={vi.fn()}
          hasMore={true}
          isExpanding={true}
        />
      );

      // Assert: Loading indicator visible
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      // Arrange
      const mockCompletedTasks: MockTask[] = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i + 1}`,
        title: `Completed Task ${i + 1}`,
        checked: true,
        completed_at: new Date(Date.now() - i * 1000 * 60 * 60).toISOString(),
      }));

      // This will fail because component doesn't exist
      const { CompletedTasksSection } = await import('@/app/priorities/components/CompletedTasksSection');

      // Act: Render component
      render(
        <CompletedTasksSection
          completedTasks={mockCompletedTasks}
          onShowMore={vi.fn()}
          hasMore={false}
        />
      );

      // Assert: Proper semantic structure
      expect(screen.getByRole('region', { name: /completed/i })).toBeInTheDocument();
      expect(screen.getByRole('list')).toBeInTheDocument();

      const listItems = screen.getAllByRole('listitem');
      expect(listItems).toHaveLength(5);
    });
  });
});
