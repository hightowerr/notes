'use client';

import { AlertTriangle, ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MovementInfo =
  | { type: 'up'; delta: number }
  | { type: 'down'; delta: number }
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

  if (movement.type === 'new') {
    return (
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        NEW
      </span>
    );
  }

  if (movement.type === 'reintroduced') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
        <RotateCcw className="h-3 w-3" />
        RETURNED
      </span>
    );
  }

  if (movement.type === 'manual') {
    return (
      <span className="rounded-full bg-slate-600/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
        MANUAL
      </span>
    );
  }

  if (movement.type === 'confidence-drop') {
    const delta = Math.abs(movement.delta ?? 0);
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
        <AlertTriangle className="h-3 w-3" />
        Δ-{delta.toFixed(2)}
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
