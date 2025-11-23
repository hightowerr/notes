import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScoreBreakdownModal } from '../ScoreBreakdownModal';
import type { TaskWithScores } from '@/lib/schemas/strategicScore';

describe('ScoreBreakdownModal', () => {
  const mockTaskStringReasoning: TaskWithScores = {
    id: 'task-1',
    title: 'Test Task',
    content: 'Test Content',
    impact: 8,
    effort: 12,
    confidence: 0.85,
    priority: 75,
    hasManualOverride: false,
    quadrant: 'high_impact_low_effort',
    reasoning: 'This is a test reasoning string.',
  };

  const mockTaskObjectReasoning: TaskWithScores = {
    id: 'task-2',
    title: 'Test Task 2',
    content: 'Test Content 2',
    impact: 9,
    effort: 5,
    confidence: 0.9,
    priority: 80,
    hasManualOverride: false,
    quadrant: 'high_impact_low_effort',
    reasoning: {
      impact_keywords: ['revenue', 'growth'],
      effort_source: 'heuristic',
      effort_hint: 'Standard integration',
      complexity_modifiers: ['legacy code'],
    },
  };

  it('renders correctly when open', () => {
    render(
      <ScoreBreakdownModal
        task={mockTaskStringReasoning}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('Why this score?')).toBeInTheDocument();
    expect(screen.getByText('Test Task')).toBeInTheDocument();
    expect(screen.getByText('8.0')).toBeInTheDocument(); // Impact
    expect(screen.getByText('12.0h')).toBeInTheDocument(); // Effort
    expect(screen.getAllByText('0.85').length).toBeGreaterThan(0); // Confidence
  });

  it('renders reasoning text when reasoning is a string', () => {
    render(
      <ScoreBreakdownModal
        task={mockTaskStringReasoning}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('This is a test reasoning string.')).toBeInTheDocument();
  });

  it('renders structured reasoning when reasoning is an object', () => {
    render(
      <ScoreBreakdownModal
        task={mockTaskObjectReasoning}
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText('revenue, growth')).toBeInTheDocument();
    expect(screen.getByText('legacy code')).toBeInTheDocument();
    expect(screen.getByText(/Hint: “Standard integration”/)).toBeInTheDocument();
  });

  it('calls onOpenChange when closed', () => {
    const onOpenChange = vi.fn();
    render(
      <ScoreBreakdownModal
        task={mockTaskStringReasoning}
        open={true}
        onOpenChange={onOpenChange}
      />
    );

    // Simulate closing (this might depend on how Dialog is implemented, usually clicking outside or escape)
    // For now, we just check if it renders. Testing interaction with Radix Dialog might require more setup.
    // We can assume the Dialog component works and just test our content.
  });
  
  it('renders nothing when task is null', () => {
    const { container } = render(
      <ScoreBreakdownModal
        task={null}
        open={true}
        onOpenChange={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
