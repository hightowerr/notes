'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ReasoningStep } from '@/lib/types/agent';

type ErrorSummaryBannerProps = {
  failedSteps: ReasoningStep[];
  onJumpToFirstFailure: () => void;
};

export function ErrorSummaryBanner({ failedSteps, onJumpToFirstFailure }: ErrorSummaryBannerProps) {
  if (failedSteps.length === 0) {
    return null;
  }

  const failedToolNames = [...new Set(failedSteps.map(step => step.tool_name).filter(Boolean))];
  const count = failedSteps.length;
  const stepPlural = count === 1 ? 'step' : 'steps';
  const toolNames = failedToolNames.join(', ');

  return (
    <Alert variant="destructive">
      <AlertTitle>
        {count} {stepPlural} failed{failedToolNames.length > 0 ? `: ${toolNames}`: ''}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>Review the failed steps to diagnose the issue.</span>
        <Button variant="link" onClick={onJumpToFirstFailure} className="p-0 h-auto text-destructive-foreground">
          Jump to first failure →
        </Button>
      </AlertDescription>
    </Alert>
  );
}