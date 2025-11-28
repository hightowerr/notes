'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConflictWarningModal } from './ConflictWarningModal';

const DRAFT_STORAGE_KEY = 'manual-task-draft';
const AUTOSAVE_DELAY_MS = 500;
const MIN_CHAR_COUNT = 10;
const MAX_CHAR_COUNT = 500;
const MIN_HOURS = 8;
const MAX_HOURS = 160;
const DEFAULT_HOURS = 40;

type ManualTaskCreatedPayload = {
  taskId: string;
  taskText: string;
  estimatedHours: number;
  prioritizationTriggered: boolean;
};

type DuplicateTaskInfo = {
  taskId: string;
  taskText: string;
  similarity: number;
};

export type ManualTaskModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outcomeId?: string | null;
  onTaskCreated?: (task: ManualTaskCreatedPayload) => void;
  onDuplicateTaskFound?: (taskId: string) => void; // Added for T010
  initialTaskId?: string;
  initialTaskText?: string;
  onTaskUpdated?: (task: ManualTaskCreatedPayload) => void;
};

export function ManualTaskModal({
  open,
  onOpenChange,
  outcomeId,
  onTaskCreated,
  onDuplicateTaskFound,
  initialTaskId,
  initialTaskText,
  onTaskUpdated,
}: ManualTaskModalProps) {
  const [taskText, setTaskText] = useState('');
  const [estimatedHours, setEstimatedHours] = useState<number>(DEFAULT_HOURS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateTaskInfo, setDuplicateTaskInfo] = useState<DuplicateTaskInfo | null>(null); // Added for T010
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);

  const trimmedText = taskText.trim();
  const characterCount = trimmedText.length;
  const isTextValid = characterCount >= MIN_CHAR_COUNT && characterCount <= MAX_CHAR_COUNT;
  const isHoursValid = estimatedHours >= MIN_HOURS && estimatedHours <= MAX_HOURS;
  const isSubmitDisabled = !isTextValid || !isHoursValid || isSubmitting;

  const characterHint = useMemo(
    () => `${characterCount}/${MAX_CHAR_COUNT} characters`,
    [characterCount]
  );

  const clearDraft = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  const resetForm = useCallback(() => {
    setTaskText('');
    setEstimatedHours(DEFAULT_HOURS);
    setErrorMessage(null);
  }, []);

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setIsSubmitting(false);
      setErrorMessage(null);
    }
    onOpenChange(nextOpen);
  },
  [onOpenChange]
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmitDisabled) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const isEditing = Boolean(initialTaskId);
      const url = isEditing ? `/api/tasks/${initialTaskId}` : '/api/tasks/manual';
      const method = isEditing ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task_text: trimmedText,
          estimated_hours: estimatedHours,
          outcome_id: outcomeId ?? undefined,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.code === 'DUPLICATE_TASK' && payload?.existing_task) {
          const existingTitle =
            payload.existing_task.task_text ?? payload.existing_task.task_id ?? 'that task';
          setDuplicateTaskInfo({
            taskId: payload.existing_task.task_id,
            taskText: existingTitle,
            similarity: payload.existing_task.similarity || 0,
          });
          setShowConflictModal(true);
          setIsSubmitting(false);
          return;
        }
        if (payload?.error) {
          setErrorMessage(payload.error);
        } else {
          setErrorMessage('Unable to add task. Please try again.');
        }
        setIsSubmitting(false);
        return;
      }

      const prioritizationTriggered = Boolean(payload?.prioritization_triggered);
      if (isEditing) {
        toast.success('Task updated');
        onTaskUpdated?.({
          taskId: initialTaskId!,
          taskText: trimmedText,
          estimatedHours,
          prioritizationTriggered,
        });
      } else {
        toast.success('Task added successfully');
        clearDraft();
        onTaskCreated?.({
          taskId: payload.task_id,
          taskText: trimmedText,
          estimatedHours,
          prioritizationTriggered,
        });
      }
      resetForm();
      handleClose(false);
    } catch (error) {
      console.error('[ManualTaskModal] Failed to create manual task', error);
      toast.error('Failed to create task. Please try again.');
      setIsSubmitting(false);
    }
  }, [
    clearDraft,
    estimatedHours,
    handleClose,
    isSubmitDisabled,
    onTaskCreated,
    outcomeId,
    resetForm,
    trimmedText,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const hasContent = trimmedText.length > 0 || estimatedHours !== DEFAULT_HOURS;
      if (hasContent && !initialTaskId) {
        const snapshot = {
          taskText,
          estimatedHours,
          timestamp: Date.now(),
        };
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
      } else if (!initialTaskId) {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [estimatedHours, initialTaskId, taskText, trimmedText]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    if (initialTaskId && initialTaskText) {
      setTaskText(initialTaskText);
      return;
    }

    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        taskText?: string;
        estimatedHours?: number;
      } | null;

      if (parsed?.taskText) {
        setTaskText(parsed.taskText);
      }
      if (typeof parsed?.estimatedHours === 'number') {
        setEstimatedHours(parsed.estimatedHours);
      }
    } catch (error) {
      console.warn('[ManualTaskModal] Failed to restore draft', error);
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [initialTaskId, initialTaskText, open]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg space-y-6 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initialTaskId ? 'Edit Task' : 'Add Task'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-task-text">Task description</Label>
            <Textarea
              id="manual-task-text"
              placeholder="Describe the task you want to add..."
              value={taskText}
              onChange={event => {
                setTaskText(event.target.value);
                setErrorMessage(null);
                setDuplicateTaskInfo(null); // Clear duplicate info when user types
              }}
              rows={6}
              maxLength={MAX_CHAR_COUNT}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>10-500 characters</span>
              <span>{characterHint}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="manual-task-hours">Estimated hours</Label>
            <Input
              id="manual-task-hours"
              type="number"
              min={MIN_HOURS}
              max={MAX_HOURS}
              step={1}
              value={estimatedHours}
              onChange={event => {
                const nextValue = Number(event.target.value);
                setEstimatedHours(Number.isNaN(nextValue) ? DEFAULT_HOURS : nextValue);
                setErrorMessage(null);
                setDuplicateTaskInfo(null); // Clear duplicate info when user types
              }}
            />
            <span className="text-xs text-muted-foreground">
              Range: {MIN_HOURS}-{MAX_HOURS} hours (default {DEFAULT_HOURS})
            </span>
          </div>

          {errorMessage && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-destructive">{errorMessage}</p>
              {duplicateTaskInfo && (
                <button
                  type="button"
                  className="ml-0 text-sm text-blue-600 hover:underline self-start"
                  onClick={() => onDuplicateTaskFound?.(duplicateTaskInfo.taskId)}
                >
                  View Existing Task
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitDisabled}>
            {isSubmitting ? 'Adding…' : 'Add Task'}
          </Button>
        </div>
      </DialogContent>

      <ConflictWarningModal
        open={showConflictModal}
        onClose={() => {
          setShowConflictModal(false);
          setErrorMessage(null);
        }}
        existingTaskText={duplicateTaskInfo?.taskText ?? 'Existing task'}
        similarity={duplicateTaskInfo?.similarity ?? 0.85}
        onEditDescription={() => {
          setShowConflictModal(false);
        }}
        onForceCreate={async () => {
          try {
            setIsSubmitting(true);
            setShowConflictModal(false);
            const url = new URL('/api/tasks/manual', window.location.origin);
            url.searchParams.set('force_create', 'true');
            const response = await fetch(url.toString(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task_text: taskText.trim(),
                estimated_hours: estimatedHours,
                outcome_id: outcomeId ?? undefined,
              }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(payload?.error || 'Failed to create task');
            }
            toast.success('Task added successfully');
            const prioritizationTriggered = Boolean(payload?.prioritization_triggered);
            onTaskCreated?.({
              taskId: payload.task_id,
              taskText: taskText.trim(),
              estimatedHours,
              prioritizationTriggered,
            });
            resetForm();
            handleClose(false);
          } catch (error) {
            console.error('[ManualTaskModal] Force create failed', error);
            toast.error(error instanceof Error ? error.message : 'Failed to create task');
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
    </Dialog>
  );
}
