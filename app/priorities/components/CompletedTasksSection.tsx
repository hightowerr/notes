/**
 * CompletedTasksSection Component (T021)
 *
 * Purpose: Display completed tasks with pagination
 *
 * Features:
 * - Shows last 10 completed tasks by default
 * - "Show more" button loads next 10 older tasks
 * - Button hidden when ≤10 completed tasks
 * - Empty state: "No completed tasks yet"
 * - Loading state with disabled button
 * - Accessible with proper ARIA labels
 */

'use client';

import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/**
 * Task type matching the test interface
 */
export type CompletedTask = {
  id: string;
  title: string;
  checked: boolean;
  completed_at?: string;
  impact?: number;
  effort?: number;
  priority?: number;
};

export interface CompletedTasksSectionProps {
  /**
   * Array of completed tasks to display
   * Component will display ALL tasks passed
   * Parent component is responsible for:
   * - Filtering tasks where checked === true
   * - Sorting by completion timestamp (newest first)
   * - Managing pagination state (which tasks to show)
   */
  completedTasks: CompletedTask[];

  /**
   * Callback when "Show more" button is clicked
   * Parent should load next page of tasks
   */
  onShowMore: () => void;

  /**
   * Whether there are more tasks to load
   * Controls visibility of "Show more" button
   * If not provided, button is hidden
   */
  hasMore?: boolean;

  /**
   * Loading state during pagination
   * Disables "Show more" button and shows loading indicator
   */
  isExpanding?: boolean;
}

/**
 * CompletedTasksSection Component
 *
 * Displays completed tasks with pagination support.
 * Tasks are displayed in a list with proper semantic HTML and ARIA labels.
 */
export function CompletedTasksSection({
  completedTasks,
  onShowMore,
  hasMore = false,
  isExpanding = false,
}: CompletedTasksSectionProps) {
  // Empty state: no completed tasks
  if (completedTasks.length === 0) {
    return (
      <section
        className="mt-8 rounded-lg border border-border/40 bg-layer-2 p-6 text-center"
        role="region"
        aria-label="Completed tasks"
      >
        <p className="text-sm text-muted-foreground">No completed tasks yet</p>
      </section>
    );
  }

  return (
    <section
      className="mt-8 rounded-lg border border-border/40 bg-layer-2 p-6"
      role="region"
      aria-label="Completed tasks"
    >
      {/* Section Header */}
      <h2 className="mb-4 text-lg font-semibold">
        Completed Tasks ({completedTasks.length})
      </h2>

      {/* Task List */}
      <ul className="space-y-2" role="list">
        {completedTasks.map((task) => (
          <li
            key={task.id}
            className="flex items-center gap-3 rounded-md border border-border/30 bg-layer-3 px-4 py-3 transition-colors hover:bg-layer-4"
            role="listitem"
          >
            {/* Checkmark indicator */}
            <span className="text-green-600 dark:text-green-500" aria-hidden="true">
              ✓
            </span>

            {/* Task title */}
            <span className="flex-1 text-sm text-muted-foreground line-through">
              {task.title}
            </span>

            {/* Completion timestamp (if available) */}
            {task.completed_at && (
              <span className="text-xs text-muted-foreground/60">
                {formatCompletionTime(task.completed_at)}
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* "Show more" button */}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={onShowMore}
            disabled={isExpanding}
            variant="outline"
            size="sm"
            aria-label="Show more completed tasks"
          >
            {isExpanding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Show more'
            )}
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * Format completion timestamp for display
 * Shows relative time (e.g., "2 hours ago", "3 days ago")
 */
function formatCompletionTime(isoString: string): string {
  try {
    const completedAt = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - completedAt.getTime();

    // Less than 1 minute
    if (diffMs < 60_000) {
      return 'Just now';
    }

    // Less than 1 hour
    if (diffMs < 3600_000) {
      const minutes = Math.floor(diffMs / 60_000);
      return `${minutes}m ago`;
    }

    // Less than 1 day
    if (diffMs < 86400_000) {
      const hours = Math.floor(diffMs / 3600_000);
      return `${hours}h ago`;
    }

    // Less than 1 week
    if (diffMs < 604800_000) {
      const days = Math.floor(diffMs / 86400_000);
      return `${days}d ago`;
    }

    // More than 1 week
    const weeks = Math.floor(diffMs / 604800_000);
    return `${weeks}w ago`;
  } catch {
    return '';
  }
}

/**
 * Export for testing
 */
export { formatCompletionTime };
