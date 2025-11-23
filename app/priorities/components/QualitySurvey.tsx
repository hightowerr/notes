import { useMemo, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SurveyRating = 'up' | 'down';

export type SurveyState = {
  runCount: number;
  lastShownAt?: string | null;
  dontShowAgain?: boolean;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_STATE: SurveyState = { runCount: 0, lastShownAt: null, dontShowAgain: false };

export function shouldShowSurvey(state: SurveyState, now: number): boolean {
  if (state.dontShowAgain) {
    return false;
  }

  const lastShown = state.lastShownAt ? new Date(state.lastShownAt).getTime() : null;
  if (lastShown && Number.isFinite(lastShown) && now - lastShown >= WEEK_MS) {
    return true;
  }

  return state.runCount >= 20;
}

export function nextSurveyStateAfterRun(state: SurveyState, now: number): {
  state: SurveyState;
  show: boolean;
} {
  const nextState: SurveyState = {
    ...DEFAULT_STATE,
    ...state,
    runCount: (state.runCount ?? 0) + 1,
  };

  if (shouldShowSurvey(nextState, now)) {
    const stamped: SurveyState = {
      ...nextState,
      runCount: 0,
      lastShownAt: new Date(now).toISOString(),
    };
    return { state: stamped, show: true };
  }

  return { state: nextState, show: false };
}

type QualitySurveyProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: SurveyRating, options?: { dontShowAgain?: boolean }) => Promise<void> | void;
  onDontShowAgain: () => void;
  isSubmitting?: boolean;
};

export function QualitySurvey({
  open,
  onClose,
  onSubmit,
  onDontShowAgain,
  isSubmitting = false,
}: QualitySurveyProps) {
  const [selection, setSelection] = useState<SurveyRating | null>(null);

  const description = useMemo(() => {
    if (selection === 'up') {
      return 'Great! Your feedback helps keep reflection alignment strong.';
    }
    if (selection === 'down') {
      return 'Thanks. We’ll use this to improve reflection handling.';
    }
    return 'Did reflections work as expected?';
  }, [selection]);

  const handleSubmit = (rating: SurveyRating) => {
    setSelection(rating);
    void onSubmit(rating);
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span role="img" aria-label="sparkles">
              ✨
            </span>
            Reflection Quality
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant={selection === 'up' ? 'default' : 'outline'}
              className={cn('h-12 justify-center gap-2', selection === 'up' && 'ring-1 ring-primary')}
              onClick={() => handleSubmit('up')}
              disabled={isSubmitting}
            >
              <ThumbsUp className="h-4 w-4" />
              Yes
            </Button>

            <Button
              type="button"
              variant={selection === 'down' ? 'default' : 'outline'}
              className={cn('h-12 justify-center gap-2', selection === 'down' && 'ring-1 ring-primary')}
              onClick={() => handleSubmit('down')}
              disabled={isSubmitting}
            >
              <ThumbsDown className="h-4 w-4" />
              No
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
              onClick={onDontShowAgain}
            >
              Don&rsquo;t show again
            </button>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
              Later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
