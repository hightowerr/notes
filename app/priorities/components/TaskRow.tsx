'use client';

import { ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DependencyTag } from '@/app/priorities/components/DependencyTag';
import { MovementBadge, type MovementInfo } from '@/app/priorities/components/MovementBadge';

type TaskStatus = 'active' | 'completed' | 'discarded';

type DependencyLink = {
  taskId: string;
  rank: number | null;
  label: string;
};

type TaskRowProps = {
  taskId: string;
  order: number;
  title: string;
  dependencyLinks: DependencyLink[];
  movement: MovementInfo;
  status: TaskStatus;
  isManual: boolean;
  previousRank?: number | null;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: (taskId: string) => void;
  onToggleCompleted: (taskId: string, nextChecked: boolean) => void;
  onDependencyClick: (taskId: string) => void;
};

export function TaskRow({
  taskId,
  order,
  title,
  dependencyLinks,
  movement,
  status,
  isManual,
  previousRank,
  isSelected,
  isHighlighted,
  onSelect,
  onToggleCompleted,
  onDependencyClick,
}: TaskRowProps) {
  const isCompleted = status === 'completed';

  return (
    <div
      data-task-id={taskId}
      className={cn(
        'group relative flex items-center gap-4 px-2 py-3 transition-colors',
        'border-b border-border/60 last:border-b-0',
        isSelected && 'bg-primary/5',
        isHighlighted && 'bg-amber-100/40 dark:bg-amber-500/10'
      )}
      onClick={() => onSelect(taskId)}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(taskId);
        }
      }}
    >
      <span className="sticky left-0 w-10 shrink-0 text-sm font-semibold text-muted-foreground">{order}</span>

      <div
        className="flex shrink-0 items-center"
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
        role="presentation"
      >
        <Checkbox
          id={`task-complete-${taskId}`}
          checked={isCompleted}
          onCheckedChange={value => onToggleCompleted(taskId, value === true)}
          aria-label={isCompleted ? 'Move to active' : 'Mark as done'}
        />
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={cn('truncate text-sm font-medium', isCompleted && 'text-muted-foreground line-through')}>
            {title}
          </span>
          {isManual && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              Restored
            </Badge>
          )}
          {typeof previousRank === 'number' && previousRank !== order && (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              Prev. #{previousRank}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {dependencyLinks.length === 0 ? (
            <span>· No dependencies</span>
          ) : (
            dependencyLinks.map(link => (
              <DependencyTag
                key={`${taskId}-depends-${link.taskId}`}
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
        <MovementBadge movement={movement} />

        <button
          type="button"
          className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={event => {
            event.stopPropagation();
            onSelect(taskId);
          }}
          aria-label={`Open details for ${title}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
