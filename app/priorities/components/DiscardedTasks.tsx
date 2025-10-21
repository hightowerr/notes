'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type DiscardedTask = {
  id: string;
  title: string;
  reason?: string;
  lastKnownRank?: number | null;
  isHighlighted?: boolean;
};

type DiscardedTasksProps = {
  tasks: DiscardedTask[];
  onReturnToActive: (taskId: string) => void;
  onSelect: (taskId: string) => void;
};

export function DiscardedTasks({ tasks, onReturnToActive, onSelect }: DiscardedTasksProps) {
  const [isOpen, setIsOpen] = useState(false);
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const rankA = a.lastKnownRank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.lastKnownRank ?? Number.MAX_SAFE_INTEGER;
        if (rankA === rankB) {
          return a.title.localeCompare(b.title);
        }
        return rankA - rankB;
      }),
    [tasks]
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Discarded</h2>
          <p className="text-sm text-muted-foreground">Hidden priorities from the last run.</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => setIsOpen(value => !value)}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Show Discarded ({tasks.length})
            </>
          )}
        </button>
      </div>

      {isOpen && (
        <div className="divide-y divide-border/60 border-y border-border/60">
          {tasks.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">Nothing has been discarded.</div>
          ) : (
            sortedTasks.map(task => (
              <div
                key={`discarded-${task.id}`}
                className={cn(
                  'flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/30',
                  task.isHighlighted && 'bg-amber-100/40 dark:bg-amber-500/10'
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => onSelect(task.id)}
                >
                  <X className="h-4 w-4" />
                  <span className="truncate text-foreground">{task.title}</span>
                  {typeof task.lastKnownRank === 'number' && (
                    <span className="text-xs text-muted-foreground">(prev. #{task.lastKnownRank})</span>
                  )}
                </button>

                <span
                  className="text-xs text-muted-foreground"
                  title={task.reason ?? undefined}
                  aria-label={task.reason ?? undefined}
                >
                  {task.reason ? 'why?' : ''}
                </span>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onReturnToActive(task.id)}
                  className="flex items-center gap-1"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
