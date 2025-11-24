'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type EffectVariant = 'blocked' | 'demoted' | 'boosted';

type ReflectionAttributionBadgeProps = {
  effect: EffectVariant;
  reason: string;
  reflectionId: string;
  onHighlight?: (reflectionId: string) => void;
};

const variantClasses: Record<EffectVariant, string> = {
  blocked: 'bg-destructive/15 text-destructive border-destructive/40',
  demoted: 'bg-amber-500/15 text-amber-700 border-amber-500/40',
  boosted: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40',
};

const variantIcon: Record<EffectVariant, string> = {
  blocked: '🚫',
  demoted: '⬇️',
  boosted: '⬆️',
};

export function ReflectionAttributionBadge({
  effect,
  reason,
  reflectionId,
  onHighlight,
}: ReflectionAttributionBadgeProps) {
  const icon = variantIcon[effect];
  const label =
    effect === 'blocked'
      ? 'Blocked'
      : effect === 'demoted'
        ? 'Demoted'
        : 'Boosted';

  const handleClick = () => {
    if (onHighlight) {
      onHighlight(reflectionId);
    } else if (typeof window !== 'undefined') {
      // Fire a lightweight event so ContextCard can listen and highlight the source reflection.
      window.dispatchEvent(
        new CustomEvent('highlight-reflection', {
          detail: { reflectionId },
        })
      );
    }
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        'cursor-pointer gap-1 border text-xs font-medium shadow-sm hover:shadow',
        variantClasses[effect]
      )}
      onClick={handleClick}
      data-reflection-id={reflectionId}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </Badge>
  );

  if (!reason) {
    return badge;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" align="center" className="max-w-xs">
          <p className="text-xs leading-relaxed">{reason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
