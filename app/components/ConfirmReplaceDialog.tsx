'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmReplaceDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ConfirmReplaceDialog - Confirmation dialog for replacing existing outcome
 *
 * Features:
 * - Warns user about replacing current outcome
 * - Clarifies that previous outcome will be deleted (not archived)
 * - Two actions: Cancel (safe) or Yes, Replace (destructive)
 *
 * @param open - Whether dialog is open
 * @param onConfirm - Callback when user confirms replacement
 * @param onCancel - Callback when user cancels
 */
export function ConfirmReplaceDialog({ open, onConfirm, onCancel }: ConfirmReplaceDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace existing outcome?</AlertDialogTitle>
          <AlertDialogDescription>
            This will replace your current outcome statement. The previous outcome will be
            deactivated (not archived). This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Yes, Replace
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
