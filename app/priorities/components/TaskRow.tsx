'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { MovementBadge, type MovementInfo } from '@/app/priorities/components/MovementBadge';

type DependencyLink = {
  taskId: string;
  rank: number | null;
};

type TaskRowProps = {
  taskId: string;
  order: number;
  title: string;
  dependencyLinks: DependencyLink[];
  movement: MovementInfo;
  checked: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: (taskId: string) => void;
  onToggleCompleted: (taskId: string, nextChecked: boolean) => void;
};

export function TaskRow({
  taskId,
  order,
  title,
  dependencyLinks,
  movement,
  checked,
  isSelected,
  isHighlighted,
  onSelect,
  onToggleCompleted,
}: TaskRowProps) {
  const dependencyLabel = dependencyLinks.length
    ? dependencyLinks
        .map(link => (typeof link.rank === 'number' ? `#${link.rank}` : '—'))
        .join(', ')
    : '—';
  const dependencyTooltip = dependencyLinks.length
    ? dependencyLinks.map(link => link.label).join(', ')
    : undefined;

  return (
    <div
      data-task-id={taskId}
      role="button"
      tabIndex={0}
      className={cn(
        'grid w-full grid-cols-[48px_minmax(0,1fr)_120px_96px_48px] items-center gap-2 px-3 py-2 text-sm transition-colors',
        'border-b border-border/60 last:border-b-0',
        isSelected && 'bg-primary/5',
        isHighlighted && 'bg-amber-100/40 dark:bg-amber-500/10',
        'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
      onClick={() => onSelect(taskId)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(taskId);
        }
      }}
    >
      <span className="text-sm font-medium text-muted-foreground">{order}</span>

      <span className="truncate text-left text-sm font-medium text-foreground">{title}</span>

      <span
        className="truncate text-sm text-muted-foreground"
        title={dependencyTooltip}
      >
        {dependencyLabel}
      </span>

      <span className="flex justify-end text-xs text-muted-foreground">
        <MovementBadge movement={movement} />
      </span>

      <span
        className="flex justify-end"
        onClick={event => {
          event.stopPropagation();
        }}
        onKeyDown={event => {
          event.stopPropagation();
        }}
      >
        <Checkbox
          id={`task-complete-${taskId}`}
          checked={checked}
          onCheckedChange={value => onToggleCompleted(taskId, value === true)}
          aria-label="Mark as done"
        />
      </span>
    </div>
  );
}
