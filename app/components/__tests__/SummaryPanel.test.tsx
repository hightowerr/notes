/**
 * SummaryPanel Component Tests
 * Tests rendering of AI-generated summary data
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SummaryPanel from '../SummaryPanel';
import type { DocumentOutput } from '@/lib/schemas';

const mockSummary: DocumentOutput = {
  topics: ['Budget Planning', 'Team Restructure', 'Q4 Goals'],
  decisions: [
    'Approved 15% budget increase',
    'Hired 2 new developers',
    'Sunset legacy API v1 by March 2026',
  ],
  actions: [
    'Schedule follow-up meeting',
    'Review hiring pipeline',
    'Send migration guide to API v1 customers',
  ],
  lno_tasks: {
    leverage: [
      'Complete competitive analysis',
      'Define metrics for success',
      'Create technical architecture proposal',
    ],
    neutral: [
      'Update project documentation',
      'Schedule team onboarding sessions',
      'Review pending pull requests',
    ],
    overhead: [
      'File expense reports',
      'Update Slack channel descriptions',
      'Organize team drive folders',
    ],
  },
};

describe('SummaryPanel', () => {
  it('renders summary panel with filename', () => {
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="meeting-notes.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.getByText(/meeting-notes.pdf/i)).toBeInTheDocument();
  });

  it('displays all topics as badges', () => {
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.getByText('Budget Planning')).toBeInTheDocument();
    expect(screen.getByText('Team Restructure')).toBeInTheDocument();
    expect(screen.getByText('Q4 Goals')).toBeInTheDocument();
  });

  it('displays all decisions with checkmarks', () => {
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.getByText(/Approved 15% budget increase/i)).toBeInTheDocument();
    expect(screen.getByText(/Hired 2 new developers/i)).toBeInTheDocument();
    expect(screen.getByText(/Sunset legacy API v1 by March 2026/i)).toBeInTheDocument();
  });

  it('displays all actions with icons', () => {
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.getByText(/Schedule follow-up meeting/i)).toBeInTheDocument();
    expect(screen.getByText(/Review hiring pipeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Send migration guide to API v1 customers/i)).toBeInTheDocument();
  });

  it('displays LNO tasks in three columns', () => {
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    // Leverage tasks
    expect(screen.getByText(/Leverage/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete competitive analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/Define metrics for success/i)).toBeInTheDocument();

    // Neutral tasks
    expect(screen.getByText(/Neutral/i)).toBeInTheDocument();
    expect(screen.getByText(/Update project documentation/i)).toBeInTheDocument();

    // Overhead tasks
    expect(screen.getByText(/Overhead/i)).toBeInTheDocument();
    expect(screen.getByText(/File expense reports/i)).toBeInTheDocument();
  });

  it('shows "Review Required" badge when confidence < 0.8', () => {
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.75}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.getByText(/Review Required/i)).toBeInTheDocument();
  });

  it('does not show "Review Required" badge when confidence >= 0.8', () => {
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.85}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.queryByText(/Review Required/i)).not.toBeInTheDocument();
  });

  it('displays confidence percentage', () => {
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.92}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.getByText(/92%/i)).toBeInTheDocument();
  });

  it('displays processing duration', () => {
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5432}
      />
    );

    expect(screen.getByText(/5.4s/i)).toBeInTheDocument();
  });

  it('handles empty topics array gracefully', () => {
    const emptyTopicsSummary = { ...mockSummary, topics: [] };

    render(
      <SummaryPanel
        summary={emptyTopicsSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.getByText(/No topics identified/i)).toBeInTheDocument();
  });

  it('handles empty decisions array gracefully', () => {
    const emptyDecisionsSummary = { ...mockSummary, decisions: [] };

    render(
      <SummaryPanel
        summary={emptyDecisionsSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.getByText(/No decisions identified/i)).toBeInTheDocument();
  });

  it('handles empty actions array gracefully', () => {
    const emptyActionsSummary = { ...mockSummary, actions: [] };

    render(
      <SummaryPanel
        summary={emptyActionsSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    expect(screen.getByText(/No actions identified/i)).toBeInTheDocument();
  });

  it('handles empty LNO tasks gracefully', () => {
    const emptyLNOSummary = {
      ...mockSummary,
      lno_tasks: {
        leverage: [],
        neutral: [],
        overhead: [],
      },
    };

    render(
      <SummaryPanel
        summary={emptyLNOSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    const leverageColumn = screen.getByText(/Leverage/i).closest('div.rounded-lg');
    const neutralColumn = screen.getByText(/Neutral/i).closest('div.rounded-lg');
    const overheadColumn = screen.getByText(/Overhead/i).closest('div.rounded-lg');

    expect(within(leverageColumn).getByText(/No tasks identified/i)).toBeInTheDocument();
    expect(within(neutralColumn).getByText(/No tasks identified/i)).toBeInTheDocument();
    expect(within(overheadColumn).getByText(/No tasks identified/i)).toBeInTheDocument();
  });

  it('has proper heading hierarchy for accessibility', () => {
    const { container } = render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    const headings = container.querySelectorAll('h2, h3, h4');
    expect(headings.length).toBeGreaterThan(0);
  });

  it('has aria-labels for icon-only elements', () => {
    const { container } = render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    // Check that icons have accessible labels
    const iconsWithLabels = container.querySelectorAll('[aria-label]');
    expect(iconsWithLabels.length).toBeGreaterThan(0);
  });
});
