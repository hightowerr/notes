import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ContextCard } from '../ContextCard';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';

vi.mock('@/lib/api/toggleReflection', () => ({
  toggleReflection: vi.fn().mockResolvedValue({
    is_active_for_prioritization: true,
  }),
}));

const baseReflection: ReflectionWithWeight = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: 'user-1',
  text: 'Focus on activation onboarding quality to improve adoption.',
  created_at: '2024-01-01T11:50:00.000Z',
  is_active_for_prioritization: true,
  weight: 0.5,
  relative_time: '10m ago',
};

describe('ContextCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders completion time and quality badge when provided', () => {
    render(
      <ContextCard
        reflections={[baseReflection]}
        isLoading={false}
        error={null}
        onAddContext={vi.fn()}
        completionTime={new Date('2024-01-01T11:55:00.000Z')}
        qualityCheckPassed
      />
    );

    expect(screen.getByText(/Completed (about )?5 minutes ago/i)).toBeInTheDocument();
    expect(screen.getByText(/Quality check: ✓ Passed/i)).toBeInTheDocument();
  });

  it('renders review badge when quality check failed', () => {
    render(
      <ContextCard
        reflections={[baseReflection]}
        isLoading={false}
        error={null}
        onAddContext={vi.fn()}
        qualityCheckPassed={false}
      />
    );

    expect(screen.getByText(/Quality check: ⚠ Review/i)).toBeInTheDocument();
  });

  it('hides metadata when no props are provided and keeps layout mobile-friendly', () => {
    render(
      <ContextCard
        reflections={[baseReflection]}
        isLoading={false}
        error={null}
        onAddContext={vi.fn()}
      />
    );

    expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Quality check/)).not.toBeInTheDocument();
    expect(screen.getByText(/Current Context/i)).toBeInTheDocument();
  });
});
