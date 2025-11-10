'use client';

import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export type DiscardCandidate = {
  taskId: string;
  title: string;
  reason: string;
  previousRank: number | null;
  isManual: boolean;
  approved: boolean;
};

type DiscardReviewModalProps = {
  open: boolean;
  candidates: DiscardCandidate[];
  onOpenChange: (open: boolean) => void;
  onToggleCandidate: (taskId: string, approved: boolean) => void;
  onApplyChanges: () => void;
  onCancelAll: () => void;
};

export function DiscardReviewModal({
  open,
  candidates,
  onOpenChange,
  onToggleCandidate,
  onApplyChanges,
  onCancelAll,
}: DiscardReviewModalProps) {
  const total = candidates.length;
  const approvedCount = useMemo(
    () => candidates.reduce((count, candidate) => (candidate.approved ? count + 1 : count), 0),
    [candidates]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl space-y-6 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Review Proposed Removals ({total} {total === 1 ? 'task' : 'tasks'})
          </DialogTitle>
          <DialogDescription>
            The agent suggested removing these tasks. Uncheck anything you want to keep before applying changes.
          </DialogDescription>
        </DialogHeader>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks are waiting for discard approval.</p>
        ) : (
          <ScrollArea className="max-h-[420px] pr-4">
            <div className="space-y-3">
              {candidates.map(candidate => (
                <div
                  key={candidate.taskId}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <Checkbox
                    id={`discard-${candidate.taskId}`}
                    checked={candidate.approved}
                    onCheckedChange={value => onToggleCandidate(candidate.taskId, Boolean(value))}
                    className="mt-1"
                    aria-label={`Approve discard for ${candidate.title}`}
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <label
                        htmlFor={`discard-${candidate.taskId}`}
                        className="cursor-pointer text-base font-semibold text-foreground"
                      >
                        {candidate.title}
                      </label>
                      {candidate.isManual && <Badge variant="secondary">MANUAL</Badge>}
                      {typeof candidate.previousRank === 'number' && (
                        <span className="text-xs text-muted-foreground">Prev. #{candidate.previousRank}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{candidate.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {total > 0 && (
          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={onCancelAll}>
              Cancel All
            </Button>
            <Button type="button" onClick={onApplyChanges} disabled={approvedCount === 0}>
              Apply Changes (Discard {approvedCount})
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
