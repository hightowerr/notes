import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OutcomeBuilder } from '../OutcomeBuilder';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const originalFetch = globalThis.fetch;

const createFetchResponse = (data: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => data,
  }) as Response;

describe('OutcomeBuilder', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    (window as any).refreshOutcomeDisplay = vi.fn();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    delete (window as any).refreshOutcomeDisplay;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders all form fields and initial preview message', async () => {
    fetchMock.mockResolvedValueOnce(createFetchResponse({ outcome: null }));

    render(
      <OutcomeBuilder
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );

    expect(await screen.findByText(/Set Your Outcome Statement/i)).toBeInTheDocument();
    expect(screen.getByText('Direction')).toBeInTheDocument();
    expect(screen.getByText('Object (what to affect)')).toBeInTheDocument();
    expect(screen.getByText('Metric (how much, by when)')).toBeInTheDocument();
    expect(screen.getByText('Clarifier (how to achieve it)')).toBeInTheDocument();
    expect(screen.getByText(/Preview will appear as you fill the form/i)).toBeInTheDocument();
  });

  it('updates preview text when fields change', async () => {
    fetchMock.mockResolvedValueOnce(createFetchResponse({ outcome: null }));
    const user = userEvent.setup();

    render(
      <OutcomeBuilder
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );

    await user.type(screen.getByPlaceholderText(/monthly recurring revenue/i), 'monthly recurring revenue');
    await user.type(screen.getByPlaceholderText(/25% within 6 months/i), '25% within 6 months');
    await user.type(screen.getByPlaceholderText(/enterprise customer acquisition/i), 'enterprise customer acquisition');

    await waitFor(() => {
      expect(
        screen.getByText('Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition')
      ).toBeInTheDocument();
    });
  });

  it('shows validation errors when submitting empty fields', async () => {
    fetchMock.mockResolvedValueOnce(createFetchResponse({ outcome: null }));
    const user = userEvent.setup();

    render(
      <OutcomeBuilder
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );

    await user.click(screen.getByRole('button', { name: /set outcome statement/i }));

    await waitFor(() => {
      expect(screen.getByText(/Object must be at least 3 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/Metric must be at least 3 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/Clarifier must be at least 3 characters/i)).toBeInTheDocument();
    });

    // Only the initial GET request should have been made
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('submits a valid outcome and triggers success callbacks', async () => {
    const successResponse = {
      id: '00000000-0000-0000-0000-000000000001',
      assembled_text: 'Increase the monthly recurring revenue by 25% within 6 months through enterprise customer acquisition',
      created_at: new Date().toISOString(),
      message: '✅ Outcome created successfully. Re-scoring 5 actions...',
    };

    fetchMock
      .mockResolvedValueOnce(createFetchResponse({ outcome: null })) // Initial GET
      .mockResolvedValueOnce(createFetchResponse(successResponse)); // POST save

    const user = userEvent.setup();

    render(
      <OutcomeBuilder
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );

    await user.type(screen.getByPlaceholderText(/monthly recurring revenue/i), 'monthly recurring revenue');
    await user.type(screen.getByPlaceholderText(/25% within 6 months/i), '25% within 6 months');
    await user.type(screen.getByPlaceholderText(/enterprise customer acquisition/i), 'enterprise customer acquisition');

    await user.click(screen.getByRole('button', { name: /set outcome statement/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [, postCall] = fetchMock.mock.calls;
    expect(postCall[0]).toBe('/api/outcomes');
    expect(postCall[1]).toMatchObject({
      method: 'POST',
    });

    expect(toast.success).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect((window as any).refreshOutcomeDisplay).toHaveBeenCalledTimes(1);
  });

  it('shows draft recovery prompt when a stored draft exists', async () => {
    const draft = {
      direction: 'launch',
      object: 'beta product to 50 users',
      metric: 'by Q2',
      clarifier: 'targeted outreach campaigns',
      expiresAt: Date.now() + 1_000_000,
    };

    localStorage.setItem('outcome_draft_v1', JSON.stringify(draft));
    fetchMock.mockResolvedValueOnce(createFetchResponse({ outcome: null }));
    const user = userEvent.setup();

    render(
      <OutcomeBuilder
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );

    expect(await screen.findByText(/You have an unsaved draft from earlier/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Yes$/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/monthly recurring revenue/i)).toHaveValue('beta product to 50 users');
    });
  });
});

