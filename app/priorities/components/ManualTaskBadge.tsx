'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type ManualTaskBadgeStatus = 'analyzing' | 'manual' | 'conflict' | 'error';

type ManualTaskBadgeProps = {
  status: ManualTaskBadgeStatus;
  detail?: string;
  className?: string;
};

const statusCopy: Record<ManualTaskBadgeStatus, { label: string; icon: string; className: string }> =
  {
    analyzing: {
      label: 'Analyzing...',
      icon: '⏳',
      className: 'bg-muted/30 text-muted-foreground',
    },
    manual: {
      label: 'Manual',
      icon: '✋',
      className: 'bg-primary/10 text-primary',
    },
    conflict: {
      label: 'Duplicate',
      icon: '⚠️',
      className: 'bg-amber-500/15 text-amber-700',
    },
    error: {
      label: 'Error',
      icon: '❌',
      className: 'bg-destructive/15 text-destructive',
    },
  };

export function ManualTaskBadge({ status, detail, className }: ManualTaskBadgeProps) {
  const copy = statusCopy[status];
  const badge = (
    <Badge
      variant="secondary"
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium shadow-2layer-sm',
        copy.className,
        className
      )}
      aria-label={`${copy.label} manual task status`}
      aria-live="polite"
      aria-atomic="true"
    >
      <span aria-hidden="true">{copy.icon}</span>
      <span>{copy.label}</span>
    </Badge>
  );

  if (!detail) {
    return badge;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" align="center" className="max-w-xs">
          <p className="text-xs leading-relaxed">{detail}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
