import { CheckCircle, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type PrioritizationSummaryProps = {
  durationMs: number | null;
  evaluationTriggered: boolean;
  className?: string;
};

export function PrioritizationSummary({
  durationMs,
  evaluationTriggered,
  className,
}: PrioritizationSummaryProps) {
  if (durationMs === null || Number.isNaN(durationMs)) {
    return null;
  }

  const seconds = Math.max(0, durationMs) / 1000;
  const formattedDuration = `${seconds.toFixed(1)}s`;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg bg-layer-2 px-4 py-3 shadow-2layer-sm',
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span>Completed in</span>
        <span className="font-semibold tabular-nums">{formattedDuration}</span>
      </div>
      <Badge variant={evaluationTriggered ? 'default' : 'secondary'} className="flex items-center gap-1">
        {evaluationTriggered ? (
          <>
            <CheckCircle className="h-3.5 w-3.5" />
            <span>Quality checked</span>
          </>
        ) : (
          <>
            <Zap className="h-3.5 w-3.5" />
            <span>Fast path</span>
          </>
        )}
      </Badge>
    </div>
  );
}
