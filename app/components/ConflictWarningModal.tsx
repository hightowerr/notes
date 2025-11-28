'use client';

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ConflictWarningModalProps = {
  open: boolean;
  onClose: () => void;
  existingTaskText: string;
  similarity: number;
  onEditDescription: () => void;
  onForceCreate: () => void;
};

export function ConflictWarningModal({
  open,
  onClose,
  existingTaskText,
  similarity,
  onEditDescription,
  onForceCreate,
}: ConflictWarningModalProps) {
  const similarityPct = Math.round(similarity * 100);

  return (
    <Dialog open={open} onOpenChange={next => (!next ? onClose() : null)}>
      <DialogContent className="max-w-lg space-y-4">
        <DialogHeader>
          <DialogTitle>Similar task found</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            This task looks {similarityPct}% similar to an existing one. You can edit the description,
            create it anyway, or cancel.
          </p>
          <div className="rounded-md border border-border/70 bg-bg-layer-2/70 p-3">
            <p className="text-xs font-semibold text-muted-foreground">Existing task</p>
            <p className="text-sm text-foreground">{existingTaskText}</p>
          </div>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onEditDescription}>
            Edit description
          </Button>
          <Button onClick={onForceCreate}>Create anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
