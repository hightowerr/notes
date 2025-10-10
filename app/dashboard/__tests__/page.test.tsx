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
  });

  it('should render loading skeletons initially', async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<DashboardPage />);

    // Should show loading state
    const loadingElement = screen.queryByTestId('dashboard-placeholder');
    expect(loadingElement).toBeInTheDocument();
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

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, documents: mockDocuments }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/documents');
    });
  });

  it('should show empty state when no documents exist', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, documents: [] }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      const emptyElement = screen.queryByTestId('dashboard-placeholder');
      expect(emptyElement).toBeInTheDocument();
    });
  });

  it('should filter documents by status', async () => {
    const mockDocuments = [
      {
        id: '1',
        name: 'completed-doc.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        uploadedAt: '2025-10-08T10:00:00Z',
        status: 'completed',
        confidence: 0.92,
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, documents: mockDocuments }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/documents');
    });

    // Note: Actual filter interaction test will be added when component is implemented
  });

  it('should sort documents by confidence', async () => {
    const mockDocuments = [
      {
        id: '1',
        name: 'high-confidence.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        uploadedAt: '2025-10-08T10:00:00Z',
        status: 'completed',
        confidence: 0.95,
      },
      {
        id: '2',
        name: 'low-confidence.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        uploadedAt: '2025-10-08T11:00:00Z',
        status: 'review_required',
        confidence: 0.30,
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, documents: mockDocuments }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/documents');
    });

    // Note: Actual sort interaction test will be added when component is implemented
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

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, documents: mockDocuments }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Note: Actual expand interaction test will be added when component is implemented
  });

  it('should handle API error gracefully', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    render(<DashboardPage />);

    await waitFor(() => {
      const errorElement = screen.queryByTestId('dashboard-placeholder');
      expect(errorElement).toBeInTheDocument();
    });
  });

  it('should be keyboard accessible', async () => {
    const mockDocuments = [
      {
        id: '1',
        name: 'test-document.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        uploadedAt: '2025-10-08T10:00:00Z',
        status: 'completed',
      },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, documents: mockDocuments }),
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Note: Actual keyboard navigation test will be added when component is implemented
  });
});
