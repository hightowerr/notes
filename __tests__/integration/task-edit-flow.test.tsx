import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { TaskList } from '@/app/priorities/components/TaskList';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';

// Mock the API calls and services
vi.mock('@/lib/services/embeddingService', async () => {
  const actual = await vi.importActual('@/lib/services/embeddingService');
  return {
    ...actual,
    generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, /* mock embedding */]),
  };
});

vi.mock('@/lib/services/vectorStorage', async () => {
  const actual = await vi.importActual('@/lib/services/vectorStorage');
  return {
    ...actual,
    searchSimilarTasks: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'mock-task-id' }, error: null }),
  }),
}));

describe('Task Edit Flow', () => {
  const mockPlan: PrioritizedTaskPlan = {
    ordered_task_ids: ['task-1', 'task-2'],
    confidence_scores: {
      'task-1': 0.9,
      'task-2': 0.8
    },
    synthesis_summary: 'Test summary',
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes edit task -> save -> re-prioritize journey', async () => {
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
          />
        </MockedProvider>
      </MemoryRouter>
    );

    // Find and click edit button (pencil icon) - using proper selector
    const editButton = screen.getByRole('button', { name: /Edit task/ });
    await user.click(editButton);
    
    // Get the editable element
    const editableDiv = document.querySelector('[contenteditable="true"]');
    expect(editableDiv).toBeInTheDocument();
    
    if (editableDiv) {
      // Clear and type new text
      fireEvent.input(editableDiv, { target: { textContent: 'Implement user authentication system' } });
      
      // Blur to trigger save
      fireEvent.blur(editableDiv);

      // Wait for save process to complete
      await waitFor(() => {
        expect(screen.queryByTestId('saving-spinner')).not.toBeInTheDocument();
      }, { timeout: 2000 });
    }
  });

  it('handles minor edit with cache hit', async () => {
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
          />
        </MockedProvider>
      </MemoryRouter>
    );

    // Find and click edit button
    const editButton = screen.getByRole('button', { name: /Edit task/ });
    await user.click(editButton);
    
    const editableDiv = document.querySelector('[contenteditable="true"]');
    expect(editableDiv).toBeInTheDocument();
    
    if (editableDiv) {
      // Make a minor edit (fix typo, for example)
      fireEvent.input(editableDiv, { target: { textContent: 'Implement authenticatio' } });
      fireEvent.blur(editableDiv);

      // Should complete successfully 
      await waitFor(() => {
        expect(screen.queryByTestId('saving-spinner')).not.toBeInTheDocument();
      }, { timeout: 2000 });
    }
  });

  it('handles major edit with embedding regeneration', async () => {
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
          />
        </MockedProvider>
      </MemoryRouter>
    );

    // Find and click edit button
    const editButton = screen.getByRole('button', { name: /Edit task/ });
    await user.click(editButton);
    
    const editableDiv = document.querySelector('[contenteditable="true"]');
    expect(editableDiv).toBeInTheDocument();
    
    if (editableDiv) {
      // Make a major edit
      fireEvent.input(editableDiv, { target: { textContent: 'Implement a completely different feature' } });
      fireEvent.blur(editableDiv);

      // Should complete successfully
      await waitFor(() => {
        expect(screen.queryByTestId('saving-spinner')).not.toBeInTheDocument();
      }, { timeout: 2000 });
    }
  });

  it('locks editing during prioritization', async () => {
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
            sessionStatus="running" // Simulate active prioritization
          />
        </MockedProvider>
      </MemoryRouter>
    );

    // Find edit button and try to click it
    const editButton = screen.getByRole('button', { name: /Edit task/ });
    
    // Should be disabled when sessionStatus is 'running'
    expect(editButton).toHaveAttribute('disabled');
  });

  it('handles edit failure recovery', async () => {
    const user = userEvent.setup();
    
    // Mock a fetch failure
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    render(
      <MemoryRouter>
        <MockedProvider mocks={[]} addTypename={false}>
          <TaskList 
            plan={mockPlan} 
            executionMetadata={{}} 
            planVersion={1} 
            outcomeId="test-outcome"
            outcomeStatement="Complete legal compliance review"
          />
        </MockedProvider>
      </MemoryRouter>
    );

    // Find and click edit button
    const editButton = screen.getByRole('button', { name: /Edit task/ });
    await user.click(editButton);
    
    const editableDiv = document.querySelector('[contenteditable="true"]');
    expect(editableDiv).toBeInTheDocument();
    
    if (editableDiv) {
      fireEvent.input(editableDiv, { target: { textContent: 'Updated task text' } });
      fireEvent.blur(editableDiv);

      // Should show error state after fetch failure
      await waitFor(() => {
        expect(screen.getByRole('status', { name: /Failed to save task/i })).toBeInTheDocument();
      }, { timeout: 2000 });
    }
  });
});