import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChainOfThoughtStep } from '@/lib/schemas/hybridLoopMetadataSchema';

type ReasoningChainProps = {
  chain?: ChainOfThoughtStep[] | null;
  iterations?: number | null;
  evaluationTriggered?: boolean;
};

function formatConfidence(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '–';
  }
  return `${Math.round(value * 100)}%`;
}

function getConfidenceBadgeClass(confidence?: number): string {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return 'bg-muted text-muted-foreground';
  }
  if (confidence >= 0.85) {
    return 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/30';
  }
  if (confidence >= 0.7) {
    return 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/30';
  }
  return 'bg-rose-500/10 text-rose-700 ring-1 ring-inset ring-rose-500/30';
}

export function ReasoningChain({ chain, iterations, evaluationTriggered }: ReasoningChainProps) {
  const [expanded, setExpanded] = useState(true);
  const orderedChain = useMemo(() => {
    if (!Array.isArray(chain)) {
      return [];
    }
    return [...chain].sort((a, b) => a.iteration - b.iteration);
  }, [chain]);

  const hasChain = orderedChain.length > 0;

  return (
    <Card className="border-border/70 bg-card/95">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Reasoning Chain</CardTitle>
          <CardDescription>
            {evaluationTriggered ? 'Quality loop triggered; tap to inspect iterations.' : 'Fast path completed; confidence history shown.'}
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setExpanded(prev => !prev)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse reasoning chain' : 'Expand reasoning chain'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-2">
          {hasChain ? (
            <ol className="space-y-4">
              {orderedChain.map(step => (
                <li key={step.iteration} className="relative rounded-md border border-border/80 bg-background p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">Iteration {step.iteration}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', getConfidenceBadgeClass(step.confidence))}>
                      Confidence {formatConfidence(step.confidence)}
                    </span>
                    {step.timestamp && (
                      <span className="text-xs text-muted-foreground">{new Date(step.timestamp).toLocaleString()}</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-foreground">
                    {step.corrections || 'No corrections recorded for this iteration.'}
                  </p>
                  {step.evaluator_feedback && (
                    <p className="mt-2 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span className="font-medium">Evaluator:</span> {step.evaluator_feedback}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              {iterations ? `Awaiting reasoning chain (expected ${iterations} iteration${iterations === 1 ? '' : 's'}).` : 'Reasoning chain unavailable for this session.'}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default ReasoningChain;
