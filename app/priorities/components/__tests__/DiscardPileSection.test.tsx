import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

import { DiscardPileSection } from '../DiscardPileSection';

const mockFetch = vi.fn<typeof fetch>();

describe('DiscardPileSection', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('renders empty state when no tasks', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ tasks: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<DiscardPileSection />);

    fireEvent.click(screen.getByRole('button', { name: /show discarded/i }));

    await waitFor(() => {
      expect(screen.getByText(/No tasks in the discard pile/i)).toBeInTheDocument();
    });
  });

  it('displays tasks and triggers override/confirm callbacks', async () => {
    const onOverride = vi.fn();
    const onConfirmDiscard = vi.fn();
    mockFetch
      .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tasks: [
            {
              task_id: 'task-1',
              task_text: 'Cleanup backlog',
              exclusion_reason: 'Not aligned',
              created_at: '2025-01-26T10:30:00Z',
              is_manual: true,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'analyzing' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    render(
      <DiscardPileSection onOverride={onOverride} onConfirmDiscard={onConfirmDiscard} />
    );

    fireEvent.click(screen.getByRole('button', { name: /show discarded/i }));

    await waitFor(() => {
      expect(screen.getByText('Cleanup backlog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /override/i }));
    expect(onOverride).toHaveBeenCalledWith('task-1');

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /confirm discard/i }));
    expect(onConfirmDiscard).toHaveBeenCalledWith('task-1');
  });
});
