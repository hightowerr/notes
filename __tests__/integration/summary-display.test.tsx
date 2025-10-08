/**
 * Integration Tests - Summary Display Flow
 * Tests the complete user journey from upload to summary display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import type { StatusResponse } from '@/lib/schemas';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Summary Display Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('displays summary after successful processing', async () => {
    const user = userEvent.setup({ delay: null });

    // Mock upload response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        fileId: 'test-file-id',
        status: 'processing',
      }),
    });

    // Mock status polling responses
    let pollCount = 0;
    mockFetch.mockImplementation(() => {
      pollCount++;

      // First 2 polls: processing
      if (pollCount <= 2) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            fileId: 'test-file-id',
            status: 'processing',
          } as StatusResponse),
        });
      }

      // Third poll: completed with summary
      return Promise.resolve({
        ok: true,
        json: async () => ({
          fileId: 'test-file-id',
          status: 'completed',
          summary: {
            topics: ['Budget Planning', 'Team Strategy'],
            decisions: ['Approved budget increase'],
            actions: ['Schedule follow-up meeting'],
            lno_tasks: {
              leverage: ['Complete analysis'],
              neutral: ['Update documentation'],
              overhead: ['File expense reports'],
            },
          },
          confidence: 0.92,
          processingDuration: 5000,
        } as StatusResponse),
      });
    });

    render(<Home />);

    // Upload file
    const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/file input/i);

    await user.upload(input, file);

    // Wait for upload to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/upload',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // Verify "Processing" status appears
    await waitFor(() => {
      expect(screen.getByText(/Processing/i)).toBeInTheDocument();
    });

    // Advance timers to trigger status polling (2 seconds)
    vi.advanceTimersByTime(2000);

    // Wait for processing status poll
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/status/test-file-id',
        expect.anything()
      );
    });

    // Advance timers for second poll (2 more seconds)
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(pollCount).toBeGreaterThanOrEqual(2);
    });

    // Advance timers for third poll (completed)
    vi.advanceTimersByTime(2000);

    // Verify summary appears
    await waitFor(() => {
      expect(screen.getByText(/Budget Planning/i)).toBeInTheDocument();
      expect(screen.getByText(/Team Strategy/i)).toBeInTheDocument();
    }, { timeout: 5000 });

    // Verify "Complete" status badge
    expect(screen.getByText(/Complete/i)).toBeInTheDocument();

    // Verify summary sections are visible
    expect(screen.getByText(/Approved budget increase/i)).toBeInTheDocument();
    expect(screen.getByText(/Schedule follow-up meeting/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete analysis/i)).toBeInTheDocument();
  });

  it('shows "Review Required" badge for low confidence', async () => {
    const user = userEvent.setup({ delay: null });

    // Mock upload response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        fileId: 'low-confidence-file',
        status: 'processing',
      }),
    });

    // Mock status response with low confidence
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'low-confidence-file',
        status: 'review_required',
        summary: {
          topics: ['Topic 1'],
          decisions: [],
          actions: [],
          lno_tasks: {
            leverage: [],
            neutral: [],
            overhead: [],
          },
        },
        confidence: 0.75,
        processingDuration: 3000,
      } as StatusResponse),
    });

    render(<Home />);

    // Upload file
    const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/file input/i);

    await user.upload(input, file);

    // Wait for upload
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/upload', expect.anything());
    });

    // Advance time to trigger status poll
    vi.advanceTimersByTime(2000);

    // Verify "Review Required" badge appears
    await waitFor(() => {
      expect(screen.getByText(/Review Required/i)).toBeInTheDocument();
    });

    // Verify confidence is displayed
    expect(screen.getByText(/75%/i)).toBeInTheDocument();
  });

  it('handles failed processing with error message', async () => {
    const user = userEvent.setup({ delay: null });

    // Mock upload response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        fileId: 'failed-file',
        status: 'processing',
      }),
    });

    // Mock status response with failure
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'failed-file',
        status: 'failed',
        error: 'AI summarization failed',
      } as StatusResponse),
    });

    render(<Home />);

    // Upload file
    const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/file input/i);

    await user.upload(input, file);

    // Wait for upload
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/upload', expect.anything());
    });

    // Advance time to trigger status poll
    vi.advanceTimersByTime(2000);

    // Verify "Failed" status appears
    await waitFor(() => {
      expect(screen.getByText(/Failed/i)).toBeInTheDocument();
    });

    // Verify error message is displayed
    expect(screen.getByText(/AI summarization failed/i)).toBeInTheDocument();
  });

  it('stops polling after completion', async () => {
    const user = userEvent.setup({ delay: null });

    // Mock upload response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        fileId: 'complete-file',
        status: 'processing',
      }),
    });

    // Mock status response with immediate completion
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        fileId: 'complete-file',
        status: 'completed',
        summary: {
          topics: ['Test Topic'],
          decisions: [],
          actions: [],
          lno_tasks: {
            leverage: [],
            neutral: [],
            overhead: [],
          },
        },
        confidence: 0.90,
        processingDuration: 2000,
      } as StatusResponse),
    });

    render(<Home />);

    // Upload file
    const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/file input/i);

    await user.upload(input, file);

    // Wait for upload
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/upload', expect.anything());
    });

    const uploadCallCount = mockFetch.mock.calls.length;

    // Advance time to trigger first status poll
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(screen.getByText(/Complete/i)).toBeInTheDocument();
    });

    const firstPollCallCount = mockFetch.mock.calls.length;

    // Advance time further - should NOT trigger more polls
    vi.advanceTimersByTime(10000);

    // Verify no additional polls after completion
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBe(firstPollCallCount);
    });
  });

  it('shows toast notification when summary is ready', async () => {
    const user = userEvent.setup({ delay: null });

    // Mock upload response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        fileId: 'toast-test-file',
        status: 'processing',
      }),
    });

    // Mock status response with completion
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        fileId: 'toast-test-file',
        status: 'completed',
        summary: {
          topics: ['Test'],
          decisions: [],
          actions: [],
          lno_tasks: { leverage: [], neutral: [], overhead: [] },
        },
        confidence: 0.95,
        processingDuration: 3000,
      } as StatusResponse),
    });

    render(<Home />);

    // Upload file
    const file = new File(['test content'], 'meeting-notes.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/file input/i);

    await user.upload(input, file);

    // Wait for upload
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/upload', expect.anything());
    });

    // Advance time to trigger status poll
    vi.advanceTimersByTime(2000);

    // Verify toast notification appears
    await waitFor(() => {
      expect(screen.getByText(/Summary ready for meeting-notes.pdf/i)).toBeInTheDocument();
    });
  });
});
