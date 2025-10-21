'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DependencyTag } from '@/app/priorities/components/DependencyTag';
import { MovementBadge, type MovementInfo } from '@/app/priorities/components/MovementBadge';
import { cn } from '@/lib/utils';

type DependencyLink = {
  taskId: string;
  rank: number | null;
  label: string;
};

type CompletedTask = {
  id: string;
  title: string;
  dependencyLinks: DependencyLink[];
  movement: MovementInfo;
  isHighlighted: boolean;
  lastKnownRank?: number | null;
};

type CompletedTasksProps = {
  tasks: CompletedTask[];
  onMoveToActive: (taskId: string) => void;
  onSelect: (taskId: string) => void;
  onDependencyClick: (taskId: string) => void;
};

export function CompletedTasks({ tasks, onMoveToActive, onSelect, onDependencyClick }: CompletedTasksProps) {
  const [isOpen, setIsOpen] = useState(false);
  const count = tasks.length;
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
          <h2 className="text-base font-semibold text-foreground">Completed</h2>
          <p className="text-sm text-muted-foreground">
            Items you have marked as done. Move them back if priorities shift.
          </p>
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
              Show ({count})
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
                  'flex items-center gap-4 px-2 py-3 text-sm transition-colors hover:bg-muted/40',
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

                <div className="flex flex-1 flex-col gap-1">
                  <span className="truncate text-sm text-muted-foreground line-through">{task.title}</span>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {task.dependencyLinks.length === 0 ? (
                      <span>· No dependencies</span>
                    ) : (
                      task.dependencyLinks.map(link => (
                        <DependencyTag
                          key={`${task.id}-completed-${link.taskId}`}
                          label={`Depends on #${link.rank ?? '?'}`}
                          onClick={
                            link.rank !== null
                              ? () => {
                                  onDependencyClick(link.taskId);
                                }
                              : undefined
                          }
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 pl-2">
                  <MovementBadge movement={task.movement} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={event => {
                      event.stopPropagation();
                      onMoveToActive(task.id);
                    }}
                  >
                    Move to active
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
