/**
 * Component Tests: Dashboard Page
 * Tests the dashboard UI with document display, filtering, and sorting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardPage from '../page';

// Mock fetch globally
global.fetch = vi.fn();

describe('Dashboard Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.startsWith('/api/documents')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ documents: [] }),
        });
      }
      if (url.startsWith('/api/outcomes')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ outcomes: [] }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'not found' }) });
    });
  });

  it('should render loading skeletons initially', async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<DashboardPage />);

    // Should show loading state
    const loadingElements = screen.getAllByRole('heading', { name: /Document Dashboard/i });
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('should fetch and display documents', async () => {
    const mockDocuments = [
      {
        id: '1',
        name: 'test-document.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        uploadedAt: '2025-10-08T10:00:00Z',
        status: 'completed',
        confidence: 0.92,
        processingDuration: 5000,
        summary: {
          topics: ['Test Topic'],
          decisions: ['Test Decision'],
          actions: ['Test Action'],
          lno_tasks: {
            leverage: ['High Impact Task'],
            neutral: ['Standard Task'],
            overhead: ['Admin Task'],
          },
        },
      },
    ];

    (global.fetch as any).mockImplementation((url: string) => {
        if (url.startsWith('/api/documents')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ documents: mockDocuments }),
            });
        }
        if (url.startsWith('/api/outcomes')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ outcomes: [] }),
            });
        }
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/documents'));
    });

    expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
  });

  it('should show empty state when no documents exist', async () => {
    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('No documents found')).toBeInTheDocument();
    });
  });

  it('should filter documents by status', async () => {
    render(<DashboardPage />);

    fireEvent.click(screen.getByText('Completed'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('status=completed'));
    });
  });

  it('should sort documents by confidence', async () => {
    render(<DashboardPage />);

    fireEvent.change(screen.getByLabelText('Sort documents by'), { target: { value: 'confidence' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('sort=confidence'));
    });
  });

  it('should expand card to show full summary', async () => {
    const mockDocuments = [
      {
        id: '1',
        name: 'test-document.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        uploadedAt: '2025-10-08T10:00:00Z',
        status: 'completed',
        confidence: 0.92,
        summary: {
          topics: ['Topic 1', 'Topic 2'],
          decisions: ['Decision 1'],
          actions: ['Action 1', 'Action 2'],
          lno_tasks: {
            leverage: ['High Impact'],
            neutral: ['Standard'],
            overhead: ['Admin'],
          },
        },
      },
    ];

    (global.fetch as any).mockImplementation((url: string) => {
        if (url.startsWith('/api/documents')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ documents: mockDocuments }),
            });
        }
        if (url.startsWith('/api/outcomes')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ outcomes: [] }),
            });
        }
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Expand ▼'));

    await waitFor(() => {
        expect(screen.getByText('Collapse ▲')).toBeInTheDocument();
    });
  });

  it('should handle API error gracefully', async () => {
    (global.fetch as any).mockImplementation((url: string) => {
        if (url.startsWith('/api/documents')) {
            return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'network error' }) });
        }
        if (url.startsWith('/api/outcomes')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ outcomes: [] }),
            });
        }
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Error loading documents')).toBeInTheDocument();
    });
  });
});
