'use client';

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
  if (movement.type === 'up') {
    return <span className={baseClass}>↑{delta}</span>;
  }
  return <span className={baseClass}>↓{delta}</span>;
}
