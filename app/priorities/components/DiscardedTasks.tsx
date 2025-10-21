'use client';

import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DependencyTag } from '@/app/priorities/components/DependencyTag';
import { MovementBadge, type MovementInfo } from '@/app/priorities/components/MovementBadge';
import { cn } from '@/lib/utils';

type DependencyLink = {
  taskId: string;
  rank: number | null;
  label: string;
};

type DiscardedTask = {
  id: string;
  title: string;
  dependencyLinks: DependencyLink[];
  movement: MovementInfo;
  reason?: string;
  lastKnownRank?: number | null;
  isHighlighted?: boolean;
};

type DiscardedTasksProps = {
  tasks: DiscardedTask[];
  onReturnToActive: (taskId: string) => void;
  onSelect: (taskId: string) => void;
  onDependencyClick: (taskId: string) => void;
};

export function DiscardedTasks({ tasks, onReturnToActive, onSelect, onDependencyClick }: DiscardedTasksProps) {
  const hasTasks = tasks.length > 0;
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
          <p className="text-sm text-muted-foreground">
            Priorities dropped in the latest recalculation. Review the rationale and reinstate anything still relevant.
          </p>
        </div>
      </div>

      <div className="divide-y divide-border/60 border-y border-border/60">
        {!hasTasks ? (
          <div className="flex items-center gap-3 px-2 py-4 text-sm text-muted-foreground">
            <Trash2 className="h-4 w-4" />
            <span>No discarded priorities.</span>
          </div>
        ) : (
          sortedTasks.map(task => (
            <div
              key={`discarded-${task.id}`}
              className={cn(
                'flex flex-col gap-3 px-2 py-4 transition-colors hover:bg-muted/40',
                task.isHighlighted && 'bg-amber-100/40 dark:bg-amber-500/10'
              )}
            >
              <div
                className="flex items-center gap-3 text-sm font-medium text-foreground"
                role="button"
                tabIndex={0}
                onClick={() => onSelect(task.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(task.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{task.title}</span>
                {typeof task.lastKnownRank === 'number' && (
                  <span className="text-xs text-muted-foreground/80">Prev. #{task.lastKnownRank}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {task.dependencyLinks.length === 0 ? (
                  <span>· No dependencies recorded</span>
                ) : (
                  task.dependencyLinks.map(link => (
                    <DependencyTag
                      key={`${task.id}-discarded-${link.taskId}`}
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

              {task.reason && (
                <p className="rounded-md border border-dashed border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  {task.reason}
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                <MovementBadge movement={task.movement} />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onReturnToActive(task.id)}
                  className="ml-auto"
                >
                  Return to active
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
