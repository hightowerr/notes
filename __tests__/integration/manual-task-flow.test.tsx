import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { TaskList } from '@/app/priorities/components/TaskList';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';

// Mock the API calls and services
vi.mock('@/lib/services/embeddingService', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, /* mock embedding */]),
}));

vi.mock('@/lib/services/vectorStorage', () => ({
  searchSimilarTasks: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'mock-doc-id' }, error: null }),
  }),
}));

describe('Manual Task Flow', () => {
  const mockPlan: PrioritizedTaskPlan = {
    ordered_task_ids: [],
    confidence_scores: {},
    synthesis_summary: 'Test summary',
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes full manual task creation journey', async () => {
    const user = userEvent.setup();
    
    render(
      <MemoryRouter>
        <MockedProvider mocks={[]} addTypename={false}>
          <TaskList 
            plan={mockPlan} 
            executionMetadata={{}} 
            planVersion={1} 
            outcomeId="test-outcome"
            outcomeStatement="Complete legal compliance review"
            sortingStrategy="balanced"
            onStrategyChange={vi.fn()}
          />
        </MockedProvider>
      </MemoryRouter>
    );

    // Setup: Active outcome exists
    expect(screen.getByText(/Complete legal compliance review/)).toBeInTheDocument();

    // User adds manual task
    await user.click(screen.getByText('+ Add Task'));
    expect(screen.getByText('Add Task')).toBeInTheDocument();

    const taskTextInput = screen.getByLabelText('Task description');
    await user.type(taskTextInput, 'Email legal department about contract review');
    
    const estimatedHoursInput = screen.getByLabelText('Estimated hours');
    await user.clear(estimatedHoursInput);
    await user.type(estimatedHoursInput, '16');
    
    await user.click(screen.getByText('Add Task'));

    // Verify task appears
    await waitFor(() => {
      expect(screen.getByText('Email legal department about contract review')).toBeInTheDocument();
    });
    
    // Verify [MANUAL] badge appears
    expect(screen.getByText('Manual')).toBeInTheDocument();

    // Verify prioritization triggered (should show "Prioritizing...")
    expect(screen.getByText('Prioritizing…')).toBeInTheDocument();

    // Wait for prioritization to complete
    await waitFor(() => {
      expect(screen.queryByText('Prioritizing…')).not.toBeInTheDocument();
    }, { timeout: 10000 });

    // Verify task has rank
    expect(screen.getByText(/#/)).toBeInTheDocument();
  });

  it('shows duplicate detection blocking', async () => {
    const user = userEvent.setup();
    
    // Mock duplicate detection
    const searchSimilarTasks = vi.fn().mockResolvedValue([
      { 
        task_id: 'existing-task-id', 
        task_text: 'Email legal department about contract review', 
        similarity: 0.95 
      }
    ]);
    
    vi.doMock('@/lib/services/vectorStorage', () => ({
      searchSimilarTasks,
    }));

    render(
      <MemoryRouter>
        <MockedProvider mocks={[]} addTypename={false}>
          <TaskList 
            plan={mockPlan} 
            executionMetadata={{}} 
            planVersion={1} 
            outcomeId="test-outcome"
            outcomeStatement="Complete legal compliance review"
            sortingStrategy="balanced"
            onStrategyChange={vi.fn()}
          />
        </MockedProvider>
      </MemoryRouter>
    );

    // User attempts to add duplicate task
    await user.click(screen.getByText('+ Add Task'));
    
    const taskTextInput = screen.getByLabelText('Task description');
    await user.type(taskTextInput, 'Email legal department about contract review');
    
    await user.click(screen.getByText('Add Task'));

    // Verify duplicate error message appears
    await waitFor(() => {
      expect(screen.getByText(/Similar task already exists/i)).toBeInTheDocument();
    });
  });

  it('works without active outcome (no re-prioritization)', async () => {
    const user = userEvent.setup();
    
    render(
      <MemoryRouter>
        <MockedProvider mocks={[]} addTypename={false}>
          <TaskList 
            plan={mockPlan} 
            executionMetadata={{}} 
            planVersion={1} 
            outcomeId={null}
            outcomeStatement={null}
            sortingStrategy="balanced"
            onStrategyChange={vi.fn()}
          />
        </MockedProvider>
      </MemoryRouter>
    );

    // User adds manual task
    await user.click(screen.getByText('+ Add Task'));
    
    const taskTextInput = screen.getByLabelText('Task description');
    await user.type(taskTextInput, 'Test task without outcome');
    
    await user.click(screen.getByText('Add Task'));

    // Verify task appears
    await waitFor(() => {
      expect(screen.getByText('Test task without outcome')).toBeInTheDocument();
    });
    
    // Verify [MANUAL] badge appears
    expect(screen.getByText('Manual')).toBeInTheDocument();

    // Should NOT show prioritizing indicator when no outcome
    expect(screen.queryByText('Prioritizing…')).not.toBeInTheDocument();
  });
});
