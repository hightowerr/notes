'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type MovementInfo =
  | { type: 'up'; delta: number; reason?: string }
  | { type: 'down'; delta: number; reason?: string }
  | { type: 'new' }
  | { type: 'reintroduced' }
  | { type: 'confidence-drop'; delta: number }
  | { type: 'manual' }
  | { type: 'none' }
  | undefined;

type MovementBadgeProps = {
  movement: MovementInfo;
};

export function MovementBadge({ movement }: MovementBadgeProps) {
  if (!movement || movement.type === 'none') {
    return null;
  }

  const baseClass = 'text-xs font-medium text-muted-foreground';

  if (movement.type === 'new') {
    return <span className={`${baseClass}`}>new</span>;
  }

  if (movement.type === 'reintroduced') {
    return <span className={baseClass}>↺</span>;
  }

  if (movement.type === 'manual') {
    return <span className={baseClass}>manual</span>;
  }

  if (movement.type === 'confidence-drop') {
    const delta = Math.abs(movement.delta ?? 0);
    return <span className={baseClass}>Δ-{delta.toFixed(2)}</span>;
  }

  const delta = Math.abs(movement.delta ?? 0);
  const badgeContent = movement.type === 'up'
    ? <span className={baseClass}>↑{delta}</span>
    : <span className={baseClass}>↓{delta}</span>;

  // Show tooltip if reason exists (from context-based adjustment)
  const hasReason = (movement.type === 'up' || movement.type === 'down') &&
                    movement.reason &&
                    movement.reason.length > 0;

  if (hasReason) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            {badgeContent}
          </TooltipTrigger>
          <TooltipContent side="left" align="center" className="max-w-xs">
            <p className="text-xs">{movement.reason}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badgeContent;
}
