'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CompletedTask = {
  id: string;
  title: string;
  isHighlighted: boolean;
};

type CompletedTasksProps = {
  tasks: CompletedTask[];
  onMoveToActive: (taskId: string) => void;
  onSelect: (taskId: string) => void;
};

export function CompletedTasks({ tasks, onMoveToActive, onSelect }: CompletedTasksProps) {
  const [isOpen, setIsOpen] = useState(false);
  const count = tasks.length;
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        return a.title.localeCompare(b.title);
      }),
    [tasks]
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Completed</h2>
          <p className="text-sm text-muted-foreground">Tasks you marked as done.</p>
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
              Show Completed ({count})
            </>
          )}
        </button>
      </div>

      {isOpen && (
        <div className="divide-y divide-border/60 border-y border-border/60">
          {count === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground">No completed tasks yet.</div>
          ) : (
            sortedTasks.map(task => (
              <div
                key={`completed-${task.id}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/30',
                  task.isHighlighted && 'bg-amber-100/40 dark:bg-amber-500/10'
                )}
                onClick={() => onSelect(task.id)}
                role="button"
                tabIndex={0}
                data-task-id={task.id}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(task.id);
                  }
                }}
              >
                <Check className="h-4 w-4 text-muted-foreground" />

                <span className="flex-1 truncate text-sm text-muted-foreground line-through">{task.title}</span>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={event => {
                    event.stopPropagation();
                    onMoveToActive(task.id);
                  }}
                >
                  Move to active
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
