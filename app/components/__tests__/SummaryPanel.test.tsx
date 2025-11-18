/**
 * SummaryPanel Component Tests
 * Tests rendering of AI-generated summary data
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('displays all actions with icons', async () => {
    const user = userEvent.setup();
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    // Switch to Actions tab first
    const actionsTab = screen.getByRole('tab', { name: /Actions/i });
    await user.click(actionsTab);

    // Wait for tab content to be rendered
    await waitFor(() => {
      expect(screen.getByText(/Schedule follow-up meeting/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Review hiring pipeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Send migration guide to API v1 customers/i)).toBeInTheDocument();
  });

  it('displays LNO tasks in three columns', async () => {
    const user = userEvent.setup();
    render(
      <SummaryPanel
        summary={mockSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    // Switch to Tasks tab first
    const tasksTab = screen.getByRole('tab', { name: /Tasks \(LNO\)/i });
    await user.click(tasksTab);

    // Wait for tab content to be rendered - target the specific "Leverage" text in the card title
    await waitFor(() => {
      // Look for the "Leverage" text inside an element with data-slot="card-title"
      const leverageElements = screen.getAllByText(/Leverage/i);
      const leverageCardTitle = leverageElements.find(el =>
        el.closest('[data-slot="card-title"]') !== null
      );
      expect(leverageCardTitle).toBeInTheDocument();
    });

    // Leverage tasks
    expect(screen.getByText(/Complete competitive analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/Define metrics for success/i)).toBeInTheDocument();

    // Neutral tasks - find the element with data-slot="card-title" containing "Neutral"
    const neutralElements = screen.getAllByText(/Neutral/i);
    const neutralCardTitle = neutralElements.find(el =>
      el.closest('[data-slot="card-title"]') !== null
    );
    expect(neutralCardTitle).toBeInTheDocument();
    expect(screen.getByText(/Update project documentation/i)).toBeInTheDocument();

    // Overhead tasks - find the element with data-slot="card-title" containing "Overhead"
    const overheadElements = screen.getAllByText(/Overhead/i);
    const overheadCardTitle = overheadElements.find(el =>
      el.closest('[data-slot="card-title"]') !== null
    );
    expect(overheadCardTitle).toBeInTheDocument();
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

  it('handles empty actions array gracefully', async () => {
    const user = userEvent.setup();
    const emptyActionsSummary = { ...mockSummary, actions: [] };

    render(
      <SummaryPanel
        summary={emptyActionsSummary}
        confidence={0.95}
        filename="test.pdf"
        processingDuration={5000}
      />
    );

    // Switch to Actions tab first
    const actionsTab = screen.getByRole('tab', { name: /Actions/i });
    await user.click(actionsTab);

    // Wait for tab content to be rendered
    await waitFor(() => {
      expect(screen.getByText(/No actions identified/i)).toBeInTheDocument();
    });
  });

  it('handles empty LNO tasks gracefully', async () => {
    const user = userEvent.setup();
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

    // Switch to Tasks tab first
    const tasksTab = screen.getByRole('tab', { name: /Tasks \(LNO\)/i });
    await user.click(tasksTab);

    // Wait for tab content to be rendered - target the specific "Leverage" text in the card title
    await waitFor(() => {
      // Look for the "Leverage" text inside an element with data-slot="card-title"
      const leverageElements = screen.getAllByText(/Leverage/i);
      const leverageCardTitle = leverageElements.find(el =>
        el.closest('[data-slot="card-title"]') !== null
      );
      expect(leverageCardTitle).toBeInTheDocument();
    });

    // All the LNO cards are inside the tasks tab panel
    const tasksTabPanel = screen.getByRole('tabpanel', { name: /Tasks \(LNO\)/i });

    // Find each card by looking for the specific card title within data-slot="card" elements
    const allLNOCards = tasksTabPanel.querySelectorAll('[data-slot="card"]');

    // Find the specific cards containing each category
    const leverageCard = Array.from(allLNOCards).find(card =>
      card.querySelector('[data-slot="card-title"]')?.textContent?.includes('Leverage')
    );
    const neutralCard = Array.from(allLNOCards).find(card =>
      card.querySelector('[data-slot="card-title"]')?.textContent?.includes('Neutral')
    );
    const overheadCard = Array.from(allLNOCards).find(card =>
      card.querySelector('[data-slot="card-title"]')?.textContent?.includes('Overhead')
    );

    expect(within(leverageCard).getByText(/No tasks identified/i)).toBeInTheDocument();
    expect(within(neutralCard).getByText(/No tasks identified/i)).toBeInTheDocument();
    expect(within(overheadCard).getByText(/No tasks identified/i)).toBeInTheDocument();
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
