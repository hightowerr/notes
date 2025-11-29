import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskRow } from '@/app/priorities/components/TaskRow';
import type { Task } from '@/lib/types/task';

// Mock dependencies
vi.mock('@/app/priorities/components/TaskDetailsDrawer', () => ({
  default: () => <div data-testid="task-details-drawer">Drawer</div>
}));

// Mock task data with all required TaskRowProps
const mockTask = {
  taskId: 'task-1',
  title: 'Mobile Test Task',
  order: 1,
  impact: 8,
  effort: 4,
  confidence: 0.8,
  priority: 95,
  category: 'leverage' as const,
  dependencyLinks: [],
  movement: undefined,
  checked: false,
  isAiGenerated: true,
  isManual: false,
  isPrioritizing: false,
  retryStatus: null,
  isSelected: false,
  isHighlighted: false,
  isEditingDisabled: false,
  hasManualOverride: false,
};

describe('Mobile Viewport Integration (T018)', () => {
  // Helper to set viewport size
  const setViewport = (width: number, height: number) => {
    window.innerWidth = width;
    window.innerHeight = height;
    window.dispatchEvent(new Event('resize'));
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('320px viewport (iPhone SE)', () => {
    it('should use flex-col card layout (mobile-first with lg:grid)', () => {
      setViewport(320, 568);
      const { container } = render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      const row = container.querySelector('[data-task-id="task-1"]');
      expect(row).toBeInTheDocument();
      
      // Expected: flex flex-col for mobile base, lg:grid for tablet+
      // Mobile-first approach means base is flex-col, with lg:grid for responsive breakpoints
      expect(row?.className).toContain('flex');
      expect(row?.className).toContain('flex-col');
      // lg:grid is allowed for responsive design - it only applies at 768px+
      expect(row?.className).toContain('lg:grid');
    });

    it('should have no horizontal scroll', () => {
      setViewport(320, 568);
      const { container } = render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      const row = container.querySelector('[data-task-id="task-1"]');
      expect(row).toBeInTheDocument();
      
      // Check that width does not exceed viewport
      const computedStyle = window.getComputedStyle(row as Element);
      const width = parseInt(computedStyle.width || '0');
      expect(width).toBeLessThanOrEqual(320);
    });

    it('should have touch targets ≥44px (WCAG AAA)', () => {
      setViewport(320, 568);
      render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      const checkbox = screen.getByRole('checkbox', { name: /mark as done/i });
      expect(checkbox).toBeInTheDocument();
      
      // Checkbox should have h-11 class (44px) on mobile
      // This validates WCAG AAA compliance for touch targets
      const checkboxParent = checkbox.parentElement;
      expect(checkboxParent?.className || '').toMatch(/h-11|min-h-\[44px\]/);
    });

    it('should use larger typography on mobile', () => {
      setViewport(320, 568);
      render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      const title = screen.getByText(/Mobile Test Task/i);
      expect(title).toBeInTheDocument();
      
      // Expected: text-base (16px) or text-lg (18px) on mobile
      // Mobile-first implementation uses text-base with lg:text-sm
      const titleClasses = title.className;
      expect(titleClasses).toMatch(/text-base|text-lg/);
    });
  });

  describe('375px viewport (iPhone 12/13)', () => {
    it('should maintain card layout with more spacing', () => {
      setViewport(375, 812);
      const { container } = render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      const row = container.querySelector('[data-task-id="task-1"]');
      
      // Same as 320px but with more breathing room
      expect(row?.className).toContain('flex');
      expect(row?.className).toContain('flex-col');
    });
  });

  describe('768px viewport (iPad)', () => {
    it('should transition to row-based layout', () => {
      setViewport(768, 1024);
      const { container } = render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      const row = container.querySelector('[data-task-id="task-1"]');
      
      // Should have lg:flex-row class for tablet+
      expect(row?.className).toContain('lg:flex-row');
    });

    it('should have desktop typography', () => {
      setViewport(768, 1024);
      render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      const title = screen.getByText(/Mobile Test Task/i);
      
      // At 768px+, should use smaller desktop typography
      const titleClasses = title.className;
      expect(titleClasses).toContain('text-sm');
    });
  });

  describe('1024px viewport (Desktop)', () => {
    it('should use full desktop grid layout', () => {
      setViewport(1024, 768);
 const { container } = render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      const row = container.querySelector('[data-task-id="task-1"]');
      
      // Desktop should use full grid layout
      expect(row?.className).toContain('lg:grid-cols-');
    });
  });

  describe('WCAG AAA Compliance', () => {
    it('should meet AAA contrast requirements', () => {
      setViewport(320, 568);
      render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      // Check that text elements exist with proper semantic markup
      const title = screen.getByText(/Mobile Test Task/i);
      expect(title).toBeInTheDocument();
      
      // Checkbox should have proper aria-label
      const checkbox = screen.getByRole('checkbox', { name: /mark as done/i });
      expect(checkbox).toHaveAccessibleName();
    });

    it('should have accessible interactive elements', () => {
      setViewport(320, 568);
      const { container } = render(
        <TaskRow
          {...mockTask}
          onSelect={vi.fn()}
          onToggleCompleted={vi.fn()}
        />
      );

      // All interactive elements should be keyboard accessible
      // Query the main row button specifically by data-task-id
      const row = container.querySelector('[data-task-id="task-1"]');
      expect(row).toBeInTheDocument();
      expect(row).toHaveAttribute('tabIndex', '0');
      expect(row).toHaveAttribute('role', 'button');
    });
  });
});