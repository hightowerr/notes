import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ScoreBreakdownModal } from '@/app/priorities/components/ScoreBreakdownModal';
import type { TaskWithScores } from '@/lib/schemas/strategicScore';

const mockTask: TaskWithScores = {
  id: 'task-quick',
  title: 'Optimize onboarding copy',
  content: 'Optimize onboarding copy',
  impact: 8.5,
  effort: 16,
  confidence: 0.78,
  priority: 66.3,
  hasManualOverride: false,
  quadrant: 'high_impact_low_effort',
  reasoning: {
    impact_keywords: ['payment', 'revenue'],
    effort_source: 'extracted',
    effort_hint: 'Estimated from recent onboarding sprint',
    complexity_modifiers: ['copy review'],
  },
};

describe('ScoreBreakdownModal', () => {
  it('shows impact score and keywords when open', () => {
    render(<ScoreBreakdownModal task={mockTask} open onOpenChange={() => {}} />);

    expect(screen.getByText('Impact')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText(/payment, revenue/)).toBeInTheDocument();
  });
});

