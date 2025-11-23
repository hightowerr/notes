import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ErrorBannerProps {
  message?: string;
  onRetry?: () => void;
  retryCount?: number;
  maxRetries?: number;
  exhaustedMessage?: string;
  retryLabel?: string;
}

export function ErrorBanner({
  message = 'AI analysis unavailable. Showing basic quality scores. [Retry]',
  onRetry,
  retryCount = 0,
  maxRetries = 3,
  exhaustedMessage = 'AI service temporarily unavailable. Quality scores based on basic heuristics.',
  retryLabel = 'Retry',
}: ErrorBannerProps) {
  const attemptsRemaining = Math.max(maxRetries - retryCount, 0);
  const isRetryDisabled = !onRetry || retryCount >= maxRetries;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-destructive/5 px-4 py-3 text-sm text-destructive shadow-2layer-sm"
    >
      <div className="flex flex-1 items-center gap-3">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium">{message}</p>
          <p className="text-xs text-destructive/80">
            {isRetryDisabled
              ? exhaustedMessage
              : `You can retry ${attemptsRemaining} more time${attemptsRemaining === 1 ? '' : 's'}.`}
          </p>
        </div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetryDisabled}
          className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${
            isRetryDisabled
              ? 'cursor-not-allowed bg-muted text-muted-foreground'
              : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
          }`}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export default ErrorBanner;
