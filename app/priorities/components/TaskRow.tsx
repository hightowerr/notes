'use client';

import { Lock, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { MovementBadge, type MovementInfo } from '@/app/priorities/components/MovementBadge';

type DependencyLink = {
  taskId: string;
  rank: number | null;
  label: string;
};

type TaskRowProps = {
  taskId: string;
  order: number;
  title: string;
  category?: 'leverage' | 'neutral' | 'overhead' | null;
  isLocked: boolean;
  dependencyLinks: DependencyLink[];
  movement: MovementInfo | undefined;
  checked: boolean;
  isAiGenerated: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: (taskId: string) => void;
  onToggleCompleted: (taskId: string, nextChecked: boolean) => void;
  onToggleLock: (taskId: string) => void;
};

function MobileFieldLabel({ children }: { children: string }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:hidden">
      {children}
    </span>
  );
}

export function TaskRow({
  taskId,
  order,
  title,
  category,
  isLocked,
  dependencyLinks,
  movement,
  checked,
  isAiGenerated,
  isSelected,
  isHighlighted,
  onSelect,
  onToggleCompleted,
  onToggleLock,
}: TaskRowProps) {
  const categoryLabel = category
    ? category === 'leverage'
      ? 'Leverage'
      : category === 'neutral'
        ? 'Neutral'
        : 'Overhead'
    : null;
  const dependencyBadges = dependencyLinks.length ? (
    <div className="flex flex-wrap gap-1">
      {dependencyLinks.map(link => (
        <span
          key={`${taskId}-dep-${link.taskId}`}
          className="inline-flex items-center gap-1 rounded-full bg-bg-layer-2 px-2 py-1 text-xs text-muted-foreground"
        >
          <span className="font-semibold">{link.rank ? `#${link.rank}` : '—'}</span>
          <span className="text-muted-foreground/70">•</span>
          <span className="max-w-[160px] truncate">{link.label}</span>
        </span>
      ))}
    </div>
  ) : (
    <span className="text-sm text-muted-foreground">None</span>
  );

  return (
    <div
      data-task-id={taskId}
      role="button"
      tabIndex={0}
      className={cn(
        'grid w-full grid-cols-1 gap-3 rounded-lg border border-border/60 px-3 py-3 text-sm transition-colors',
        'lg:grid-cols-[48px_minmax(0,1fr)_120px_96px_48px] lg:items-center lg:gap-2 lg:rounded-none lg:border-0 lg:border-b lg:border-border/60 lg:px-3 lg:py-2 lg:last:border-b-0',
        isSelected && 'bg-primary/5',
        isHighlighted &&
          (isAiGenerated
            ? 'bg-emerald-100/60 dark:bg-emerald-500/10'
            : 'bg-amber-100/40 dark:bg-amber-500/10'),
        isLocked && 'border-emerald-500/40 ring-1 ring-emerald-500/30',
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
      <div className="flex items-center justify-between lg:block">
        <MobileFieldLabel>Rank</MobileFieldLabel>
        <span className="text-sm font-medium text-muted-foreground">{order}</span>
      </div>

      <div className="flex flex-col gap-1 text-left">
        <MobileFieldLabel>Task</MobileFieldLabel>
        <div className="flex items-center gap-2 truncate">
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              onToggleLock(taskId);
            }}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-full border',
              isLocked
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700'
                : 'border-border/70 text-muted-foreground hover:bg-muted/40'
            )}
            aria-label={isLocked ? 'Unlock task' : 'Lock task in place'}
          >
            {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          {category && categoryLabel && (
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 text-[11px] font-semibold uppercase tracking-wide',
                category === 'leverage' && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700',
                category === 'neutral' && 'border-sky-500/50 bg-sky-500/10 text-sky-700',
                category === 'overhead' && 'border-amber-500/50 bg-amber-500/10 text-amber-700'
              )}
            >
              {categoryLabel}
            </Badge>
          )}
          {isAiGenerated && (
            <Badge
              variant="outline"
              className="shrink-0 border-emerald-500/40 bg-emerald-500/10 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200"
            >
              AI Generated
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <MobileFieldLabel>Depends</MobileFieldLabel>
        {dependencyBadges}
      </div>

      <div className="flex items-center justify-between lg:flex-col lg:items-end lg:gap-1">
        <MobileFieldLabel>Movement</MobileFieldLabel>
        <span className="flex justify-end text-xs text-muted-foreground">
          <MovementBadge movement={movement} />
        </span>
      </div>

      <div
        className="flex items-center justify-between lg:justify-end"
        onClick={event => {
          event.stopPropagation();
        }}
        onKeyDown={event => {
          event.stopPropagation();
        }}
      >
        <MobileFieldLabel>Done</MobileFieldLabel>
        <Checkbox
          id={`task-complete-${taskId}`}
          checked={checked}
          onCheckedChange={value => onToggleCompleted(taskId, value === true)}
          aria-label="Mark as done"
        />
      </div>
    </div>
  );
}
