'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TaskWithScores } from '@/lib/schemas/strategicScore';

type ScoreBreakdownModalProps = {
  task: TaskWithScores | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ScoreBreakdownModal({ task, open, onOpenChange }: ScoreBreakdownModalProps) {
  if (!task) {
    return null;
  }

  const impactKeywords = task.reasoning?.impact_keywords ?? [];
  const effortModifiers = task.reasoning?.complexity_modifiers ?? [];
  const breakdownComponents = task.confidenceBreakdown
    ? [
        task.confidenceBreakdown.similarity,
        task.confidenceBreakdown.dependency,
        task.confidenceBreakdown.history,
      ]
    : null;
  const confidenceComponents = breakdownComponents
    ? breakdownComponents.map(component => ({
        label: component.label,
        weight: component.weight,
        value: component.value,
      }))
    : [
        {
          label: 'Composite confidence',
          weight: 1,
          value: task.confidence,
        },
      ];
  const hasDetailedConfidence = Boolean(breakdownComponents);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Why this score?</DialogTitle>
          <DialogDescription>{task.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 text-sm">
          <section>
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Impact
                </p>
                <p className="text-2xl font-bold text-foreground">{task.impact.toFixed(1)}</p>
              </div>
            </header>
            {impactKeywords.length > 0 && (
              <div className="mt-3 rounded-md border border-border/70 bg-bg-layer-2/60 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Impact keywords
                </p>
                <p className="mt-1 text-sm text-foreground">{impactKeywords.join(', ')}</p>
              </div>
            )}
            {task.reasoning?.impact_keywords && (
              <p className="mt-2 text-muted-foreground">
                The scoring agent emphasized these signals to estimate the expected outcome change.
              </p>
            )}
          </section>

          <section>
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Effort
                </p>
                <p className="text-2xl font-bold text-foreground">{task.effort.toFixed(1)}h</p>
              </div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Source: {task.reasoning?.effort_source ?? 'unknown'}
              </span>
            </header>
            {task.reasoning?.effort_hint && task.reasoning.effort_hint.length > 0 && (
              <p className="mt-2 text-muted-foreground">
                Hint: “{task.reasoning.effort_hint}”
              </p>
            )}
            {effortModifiers.length > 0 && (
              <p className="mt-2 text-muted-foreground">
                Complexity modifiers: <strong>{effortModifiers.join(', ')}</strong>
              </p>
            )}
          </section>

          <section>
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Confidence
                </p>
                <p className="text-2xl font-bold text-foreground">{task.confidence.toFixed(2)}</p>
              </div>
            </header>
            <div className="mt-3 space-y-2">
              {confidenceComponents.map(component => (
                <div
                  key={component.label}
                  className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground"
                >
                  <span>
                    {Math.round(component.weight * 100)}% × {component.label}
                  </span>
                  <span className="text-foreground">{component.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
            {hasDetailedConfidence ? (
              <p className="mt-2 text-muted-foreground">
                Weighted confidence:{' '}
                {confidenceComponents
                  .map(component => `${component.weight} × ${component.value.toFixed(2)}`)
                  .join(' + ')}{' '}
                = {task.confidence.toFixed(2)}
              </p>
            ) : (
              <p className="mt-2 text-muted-foreground">
                Confidence comes from a single heuristic estimate for this task. Current value:{' '}
                {task.confidence.toFixed(2)}
              </p>
            )}
          </section>

          <section>
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Priority
                </p>
                <p className="text-2xl font-bold text-foreground">{task.priority.toFixed(1)}</p>
              </div>
            </header>
            <p className="mt-2 text-muted-foreground">
              Calculation: (({task.impact.toFixed(1)} × 10) / ({task.effort.toFixed(1)} / 8)) ×{' '}
              {task.confidence.toFixed(2)} ≈ {task.priority.toFixed(1)}
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
