/**
 * Integration Test: Discard Pile UI
 * Tests T016-T017: DiscardPileSection component rendering and interactions
 *
 * User journey:
 * 1. Component loads and fetches discard pile data
 * 2. User expands section to view discarded tasks
 * 3. User clicks Override to re-analyze a task
 * 4. User clicks Confirm Discard to permanently remove a task
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiscardPileSection } from '@/app/priorities/components/DiscardPileSection';

type DiscardPileTask = {
  task_id: string;
  task_text: string;
  exclusion_reason: string | null;
  created_at: string | null;
  is_manual: boolean;
  outcome_id?: string | null;
};

const mockTasks: DiscardPileTask[] = [
  {
    task_id: 'task-1',
    task_text: 'Reorganize Notion workspace',
    exclusion_reason: 'No impact on payment conversion metric',
    created_at: '2025-01-26T10:00:00Z',
    is_manual: true,
    outcome_id: 'outcome-123',
  },
  {
    task_id: 'task-2',
    task_text: 'Update team wiki documentation',
    exclusion_reason: 'Not aligned with current outcome',
    created_at: '2025-01-26T09:00:00Z',
    is_manual: true,
    outcome_id: 'outcome-123',
  },
];

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('DiscardPileSection UI Integration (T016-T017)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('loads and displays discard pile tasks on mount', async () => {
    // Mock GET /api/tasks/discard-pile
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    render(<DiscardPileSection outcomeId="outcome-123" />);

    // Verify API called with correct URL
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks/discard-pile?outcome_id=outcome-123')
      );
    });

    // Initially collapsed - should show count
    const toggleButton = screen.getByRole('button', { name: /show discarded/i });
    expect(toggleButton).toHaveTextContent('Show discarded (2)');
  });

  it('expands to show discarded tasks when clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    const user = userEvent.setup();
    render(<DiscardPileSection outcomeId="outcome-123" />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Click to expand
    const toggleButton = screen.getByRole('button', { name: /show discarded/i });
    await user.click(toggleButton);

    // Verify tasks are displayed
    expect(screen.getByText('Reorganize Notion workspace')).toBeInTheDocument();
    expect(screen.getByText('Update team wiki documentation')).toBeInTheDocument();
    expect(screen.getByText('No impact on payment conversion metric')).toBeInTheDocument();
    expect(screen.getByText('Not aligned with current outcome')).toBeInTheDocument();

    // Verify toggle button text changed
    expect(toggleButton).toHaveTextContent('Hide');
  });

  it('collapses when toggle button clicked while expanded', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    const user = userEvent.setup();
    render(<DiscardPileSection outcomeId="outcome-123" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Expand
    const toggleButton = screen.getByRole('button', { name: /show discarded/i });
    await user.click(toggleButton);

    expect(screen.getByText('Reorganize Notion workspace')).toBeInTheDocument();

    // Collapse
    await user.click(toggleButton);

    // Tasks should be hidden
    expect(screen.queryByText('Reorganize Notion workspace')).not.toBeInTheDocument();
    expect(toggleButton).toHaveTextContent('Show discarded (2)');
  });

  it('displays empty state when no discarded tasks', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: [] }),
    });

    const user = userEvent.setup();
    render(<DiscardPileSection outcomeId="outcome-123" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const toggleButton = screen.getByRole('button', { name: /show discarded/i });
    expect(toggleButton).toHaveTextContent('Show discarded (0)');

    // Expand to see empty state
    await user.click(toggleButton);

    expect(screen.getByText('No tasks in the discard pile.')).toBeInTheDocument();
  });

  it('handles override action successfully', async () => {
    const { toast } = await import('sonner');

    // Initial load
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    // Override request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'analyzing', message: 'Task sent back for re-analysis' }),
    });

    const user = userEvent.setup();
    const onOverride = vi.fn();
    render(<DiscardPileSection outcomeId="outcome-123" onOverride={onOverride} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Expand
    await user.click(screen.getByRole('button', { name: /show discarded/i }));

    // Click Override on first task
    const overrideButtons = screen.getAllByRole('button', { name: /override/i });
    await user.click(overrideButtons[0]);

    // Verify API called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks/manual/task-1/override'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    // Verify task removed from UI
    expect(screen.queryByText('Reorganize Notion workspace')).not.toBeInTheDocument();

    // Verify callback and toast
    expect(onOverride).toHaveBeenCalledWith('task-1');
    expect(toast.success).toHaveBeenCalledWith('Task sent back for re-analysis');
  });

  it('handles override failure with error message', async () => {
    const { toast } = await import('sonner');

    // Initial load
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    // Override fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Task is not in discard pile' }),
    });

    const user = userEvent.setup();
    render(<DiscardPileSection outcomeId="outcome-123" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: /show discarded/i }));

    const overrideButtons = screen.getAllByRole('button', { name: /override/i });
    await user.click(overrideButtons[0]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Task is not in discard pile');
    });

    // Task should still be visible (operation failed)
    expect(screen.getByText('Reorganize Notion workspace')).toBeInTheDocument();
  });

  it('handles confirm discard action with confirmation dialog', async () => {
    const { toast } = await import('sonner');

    // Mock window.confirm
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    // Initial load
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    // Confirm discard request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'Task discarded' }),
    });

    const user = userEvent.setup();
    const onConfirmDiscard = vi.fn();
    render(<DiscardPileSection outcomeId="outcome-123" onConfirmDiscard={onConfirmDiscard} />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: /show discarded/i }));

    // Click Confirm discard on first task
    const confirmButtons = screen.getAllByRole('button', { name: /confirm discard/i });
    await user.click(confirmButtons[0]);

    // Verify confirmation dialog shown
    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure? This task will be recoverable for 30 days.'
    );

    // Verify API called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks/manual/task-1/confirm-discard'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    // Verify task removed from UI
    expect(screen.queryByText('Reorganize Notion workspace')).not.toBeInTheDocument();

    // Verify callback and toast
    expect(onConfirmDiscard).toHaveBeenCalledWith('task-1');
    expect(toast.info).toHaveBeenCalledWith('Task discarded (recoverable for 30 days)');

    // Restore original confirm
    window.confirm = originalConfirm;
  });

  it('cancels confirm discard when user rejects confirmation', async () => {
    // Mock window.confirm to return false
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => false);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    const user = userEvent.setup();
    render(<DiscardPileSection outcomeId="outcome-123" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: /show discarded/i }));

    const confirmButtons = screen.getAllByRole('button', { name: /confirm discard/i });
    await user.click(confirmButtons[0]);

    // Verify confirmation shown
    expect(window.confirm).toHaveBeenCalled();

    // Verify API NOT called (user cancelled)
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only initial load

    // Task should still be visible
    expect(screen.getByText('Reorganize Notion workspace')).toBeInTheDocument();

    // Restore original confirm
    window.confirm = originalConfirm;
  });

  it('filters tasks by outcome_id when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    render(<DiscardPileSection outcomeId="outcome-456" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tasks/discard-pile?outcome_id=outcome-456')
      );
    });
  });

  it('fetches all tasks when outcome_id not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    render(<DiscardPileSection />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^http.*\/api\/tasks\/discard-pile(?!\?)/)
      );
    });
  });

  it('shows loading state while fetching tasks', async () => {
    // Mock slow response
    let resolveLoad: (value: any) => void;
    const loadPromise = new Promise(resolve => {
      resolveLoad = resolve;
    });

    mockFetch.mockReturnValueOnce(loadPromise as any);

    const user = userEvent.setup();
    render(<DiscardPileSection outcomeId="outcome-123" />);

    // Expand while loading
    await user.click(screen.getByRole('button', { name: /show discarded/i }));

    // Should show loading state
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    // Resolve load
    resolveLoad!({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    // Wait for tasks to appear
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    const { toast } = await import('sonner');

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const user = userEvent.setup();
    render(<DiscardPileSection outcomeId="outcome-123" />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Unable to load discard pile');
    });

    // Expand to verify empty state shown on error
    await user.click(screen.getByRole('button', { name: /show discarded/i }));

    // Should show empty state (no tasks loaded)
    expect(screen.getByText('No tasks in the discard pile.')).toBeInTheDocument();
  });

  it('displays task metadata correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    const user = userEvent.setup();
    render(<DiscardPileSection outcomeId="outcome-123" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /show discarded/i }));

    // Verify task text displayed
    expect(screen.getByText('Reorganize Notion workspace')).toBeInTheDocument();

    // Verify exclusion reason displayed
    expect(screen.getByText('No impact on payment conversion metric')).toBeInTheDocument();

    // Verify created dates displayed (multiple matches expected)
    const dateElements = screen.getAllByText(/Added 1\/26\/2025/);
    expect(dateElements.length).toBeGreaterThan(0);
  });

  it('renders both action buttons for each task', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: mockTasks }),
    });

    const user = userEvent.setup();
    render(<DiscardPileSection outcomeId="outcome-123" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /show discarded/i }));

    // Each task should have Override and Confirm discard buttons
    const overrideButtons = screen.getAllByRole('button', { name: /override/i });
    const confirmButtons = screen.getAllByRole('button', { name: /confirm discard/i });

    expect(overrideButtons).toHaveLength(2);
    expect(confirmButtons).toHaveLength(2);
  });
});
