import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutcomeDisplay } from '../OutcomeDisplay';
import type { OutcomeResponse } from '@/lib/schemas/outcomeSchema';

const originalFetch = globalThis.fetch;

const createFetchResponse = (data: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => data,
  }) as Response;

const mockOutcome: OutcomeResponse = {
  id: '00000000-0000-0000-0000-000000000002',
  user_id: 'default-user',
  direction: 'increase',
  object_text: 'monthly recurring revenue',
  metric_text: '25% within 6 months',
  clarifier: 'enterprise customer acquisition',
  assembled_text: 'Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition',
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('OutcomeDisplay', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    vi.clearAllMocks();
    delete (window as any).refreshOutcomeDisplay;
  });

  afterEach(() => {
    delete (window as any).refreshOutcomeDisplay;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders the active outcome text when available', async () => {
    fetchMock.mockResolvedValueOnce(createFetchResponse({ outcome: mockOutcome }));

    render(<OutcomeDisplay />);

    expect(await screen.findByText(mockOutcome.assembled_text)).toBeInTheDocument();
  });

  it('invokes onEdit callback when the edit button is clicked', async () => {
    fetchMock.mockResolvedValueOnce(createFetchResponse({ outcome: mockOutcome }));
    const onEdit = vi.fn();
    const user = userEvent.setup();

    render(<OutcomeDisplay onEdit={onEdit} />);

    await screen.findByText(mockOutcome.assembled_text);

    await user.click(screen.getByRole('button', { name: /edit outcome/i }));

    expect(onEdit).toHaveBeenCalledWith(mockOutcome);
  });

  it('exposes a refresh function that triggers a refetch', async () => {
    const updatedOutcome = {
      ...mockOutcome,
      assembled_text: 'Increase the revenue by 40% through enterprise expansion',
    };

    fetchMock
      .mockResolvedValueOnce(createFetchResponse({ outcome: mockOutcome }))
      .mockResolvedValueOnce(createFetchResponse({ outcome: updatedOutcome }));

    render(<OutcomeDisplay />);

    await screen.findByText(mockOutcome.assembled_text);

    expect(typeof (window as any).refreshOutcomeDisplay).toBe('function');

    act(() => {
      (window as any).refreshOutcomeDisplay();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText(updatedOutcome.assembled_text)).toBeInTheDocument();
  });

  it('renders nothing when no outcome is active', async () => {
    fetchMock.mockResolvedValueOnce(createFetchResponse({ outcome: null }, true, 404));

    const { container } = render(<OutcomeDisplay />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(container.firstChild).toBeNull();
  });
});

