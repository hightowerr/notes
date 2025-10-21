'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MovementInfo =
  | { type: 'up'; delta: number }
  | { type: 'down'; delta: number }
  | { type: 'new' }
  | { type: 'none' }
  | undefined;

type MovementBadgeProps = {
  movement: MovementInfo;
};

export function MovementBadge({ movement }: MovementBadgeProps) {
  if (!movement || movement.type === 'none') {
    return null;
  }

  if (movement.type === 'new') {
    return (
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        NEW
      </span>
    );
  }

  const isUp = movement.type === 'up';
  const delta = movement.delta ?? 0;
  const Icon = isUp ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        isUp
          ? 'bg-emerald-500/10 text-emerald-600'
          : 'bg-rose-500/10 text-rose-600'
      )}
    >
      <Icon className="h-3 w-3" />
      {isUp ? `+${delta}` : `-${delta}`}
    </span>
  );
}
