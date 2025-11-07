'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const MAX_TEXT_BYTES = 102_400;
const DRAFT_STORAGE_KEY = 'text-input-draft';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 500;

export type TextInputModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function TextInputModal({ open, onOpenChange }: TextInputModalProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const textEncoder = useMemo(() => new TextEncoder(), []);
  const characterCount = content.length;
  const byteLength = useMemo(() => textEncoder.encode(content).byteLength, [content, textEncoder]);
  const isOverLimit = byteLength > MAX_TEXT_BYTES;
  const isEmpty = content.trim().length === 0;
  const isSubmitDisabled = isSubmitting || isEmpty || isOverLimit;

  const formattedCount = useMemo(() => characterCount.toLocaleString(), [characterCount]);
  const formattedKilobytes = useMemo(() => (byteLength / 1024).toFixed(1), [byteLength]);
  const formattedLimitKilobytes = useMemo(() => (MAX_TEXT_BYTES / 1024).toFixed(0), []);
  const validationMessage = useMemo(() => {
    if (isOverLimit) {
      return `Content exceeds 100KB limit (current: ${formattedKilobytes} KB)`;
    }
    if (isEmpty) {
      return 'Content cannot be empty';
    }
    return null;
  }, [formattedKilobytes, isEmpty, isOverLimit]);

  const resetState = () => {
    setTitle('');
    setContent('');
    setIsSubmitting(false);
  };

  const clearDraft = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setIsSubmitting(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    if (isSubmitDisabled) {
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch('/api/text-input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim() || null,
          content,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        const message = data?.error ?? 'Unable to process text input. Please try again.';
        toast.error(message);
        setIsSubmitting(false);
        return;
      }

      toast.success('Processing text input...');
      clearDraft();
      resetState();
      handleClose(false);

      if (data.fileId) {
        router.push(`/dashboard?highlight=${data.fileId}`);
      } else {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('[TextInputModal] Failed to submit text input:', error);
      toast.error('Unexpected error while processing text input.');
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const hasDraftContent = title.trim().length > 0 || content.trim().length > 0;
    const timeoutId = window.setTimeout(() => {
      if (hasDraftContent) {
        const draftPayload = {
          title,
          content,
          timestamp: Date.now(),
        };
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftPayload));
      } else {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [title, content]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    try {
      const rawDraft = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!rawDraft) {
        return;
      }

      const parsedDraft = JSON.parse(rawDraft) as {
        title?: string;
        content?: string;
        timestamp?: number;
      } | null;

      if (!parsedDraft || typeof parsedDraft !== 'object') {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        return;
      }

      const draftTimestamp = typeof parsedDraft.timestamp === 'number' ? parsedDraft.timestamp : 0;
      const isStale = Date.now() - draftTimestamp > DRAFT_MAX_AGE_MS;
      const hasRestorableContent =
        (parsedDraft.title ?? '').trim().length > 0 || (parsedDraft.content ?? '').trim().length > 0;

      if (isStale || !hasRestorableContent) {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        return;
      }

      setTitle(parsedDraft.title ?? '');
      setContent(parsedDraft.content ?? '');

      const formattedTimestamp = new Date(draftTimestamp).toLocaleString();
      toast.info(`Draft restored from ${formattedTimestamp}`);
    } catch (error) {
      console.warn('[TextInputModal] Failed to restore draft from localStorage:', error);
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[min(100vw-2rem,720px)] space-y-0 p-0 sm:max-w-3xl sm:p-0">
        <DialogHeader className="border-b border-border/70 px-5 py-4 sm:px-6 sm:py-5">
          <DialogTitle className="text-xl font-semibold">Quick Capture</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <Input
            placeholder="Title (optional)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={256}
          />

          <Textarea
            placeholder="Paste markdown or plain text here..."
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={12}
            className="min-h-[45vh] resize-none font-mono sm:min-h-[320px]"
          />

          {validationMessage ? (
            <p className="text-sm text-destructive">{validationMessage}</p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-sm ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
              {formattedCount} characters • {formattedKilobytes} / {formattedLimitKilobytes} KB
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
              >
                {isSubmitting ? 'Processing...' : 'Process'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
