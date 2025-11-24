'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { reflectionInputSchema } from '@/lib/schemas/reflectionSchema';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import type { ReflectionIntent } from '@/lib/schemas/reflectionIntent';
import type { ReflectionEffect } from '@/lib/services/reflectionAdjuster';

const MIN_CHAR_COUNT = 10;
const MAX_CHAR_COUNT = 500;
const MIN_WORD_COUNT = 3;

interface ReflectionInputProps {
  onReflectionAdded: (
    reflection: ReflectionWithWeight,
    tempId?: string,
    remove?: boolean,
    meta?: ReflectionAdditionMeta
  ) => void;
  onMobileClose?: () => void; // Mobile-specific: close modal after submit
  onMobileReopen?: () => void; // Mobile-specific: reopen modal from "Add Another" button
  disabled?: boolean;
}

type ReflectionAdditionMeta = {
  intent?: ReflectionIntent | null;
  effects?: ReflectionEffect[];
  tasksAffected?: number;
  message?: string;
};

export function ReflectionInput({
  onReflectionAdded,
  onMobileClose,
  onMobileReopen,
  disabled = false,
}: ReflectionInputProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [previewIntent, setPreviewIntent] = useState<ReflectionIntent | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [debounceHandle, setDebounceHandle] = useState<NodeJS.Timeout | null>(null);
  const [previewController, setPreviewController] = useState<AbortController | null>(null);

  const charCount = text.length;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceHandle) {
        clearTimeout(debounceHandle);
      }
      if (previewController) {
        previewController.abort();
      }
    };
  }, [debounceHandle, previewController]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (disabled) {
      return;
    }

    // Clear previous validation errors
    setValidationError(null);

    // Client-side validation with Zod
    const validation = reflectionInputSchema.safeParse({ text });
    if (!validation.success) {
      const error = validation.error.errors[0];
      setValidationError(error.message);
      return;
    }

    setIsSubmitting(true);

    // Optimistic UI update (immediate)
    const tempReflection: ReflectionWithWeight = {
      id: `temp-${Date.now()}`,
      user_id: 'temp',
      text: validation.data.text,
      created_at: new Date().toISOString(),
      weight: 1.0,
      relative_time: 'Just now'
    };

    onReflectionAdded(tempReflection); // Prepend to list immediately
    setText(''); // Clear textarea (<200ms)

    // Mobile-specific: Add "Add Another" button to toast
    if (isMobile && onMobileClose && onMobileReopen) {
      toast.success('✅ Reflection added', {
        action: {
          label: 'Add Another',
          onClick: () => {
            onMobileReopen(); // Reopen the modal
          }
        }
      });
      // Close modal after successful optimistic update
      onMobileClose();
    } else {
      toast.success('✅ Reflection added');
    }

    // Server request (async)
    try {
      const response = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: validation.data.text })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Surface specific outcome requirement error to user
        if (errorData?.error === 'OUTCOME_REQUIRED') {
          throw new Error(errorData.message || 'Create an outcome before adding reflections.');
        }
        throw new Error(errorData.message || 'Server error occurred');
      }

      const payload = await response.json();
      const saved: ReflectionWithWeight =
        (payload && typeof payload === 'object' && 'reflection' in payload
          ? (payload as { reflection?: ReflectionWithWeight }).reflection
          : undefined) ?? payload;

      const meta: ReflectionAdditionMeta | undefined =
        payload && typeof payload === 'object'
          ? {
              intent: 'intent' in payload ? (payload as { intent?: ReflectionIntent | null }).intent ?? null : undefined,
              effects: Array.isArray((payload as { effects?: unknown }).effects)
                ? ((payload as { effects?: ReflectionEffect[] }).effects ?? [])
                : undefined,
              tasksAffected:
                typeof (payload as { tasks_affected?: unknown }).tasks_affected === 'number'
                  ? (payload as { tasks_affected: number }).tasks_affected
                  : undefined,
              message:
                typeof (payload as { message?: unknown }).message === 'string'
                  ? (payload as { message: string }).message
                  : undefined,
            }
          : undefined;

      // Replace temp with real data
      onReflectionAdded(saved, tempReflection.id, false, meta);
    } catch (error) {
      // Rollback on error
      onReflectionAdded(tempReflection, tempReflection.id, true); // Remove temp

      // Check if network error (offline)
      if (!navigator.onLine || error instanceof TypeError) {
        setText(validation.data.text); // Restore text for retry
        toast.error('No connection. Please try again when online.');
      } else {
        setText(validation.data.text); // Restore text for retry
        toast.error('Could not save reflection. Your reflection was not saved.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Clear validation error on input change
    if (validationError) {
      setValidationError(null);
    }
    // Reset preview state on change
    setPreviewError(null);
    setPreviewIntent(null);

    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }

    const nextText = e.target.value;
    if (nextText.trim().split(/\s+/).filter(Boolean).length < MIN_WORD_COUNT) {
      setIsPreviewLoading(false);
      setDebounceHandle(null);
      return;
    }

    const handle = setTimeout(() => {
      const controller = new AbortController();
      setPreviewController(prev => {
        prev?.abort();
        return controller;
      });
      setIsPreviewLoading(true);
      setPreviewError(null);
      void fetch('/api/reflections/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: nextText }),
        signal: controller.signal,
      })
        .then(async response => {
          if (!response.ok) {
            throw new Error('Failed to detect intent');
          }
          const payload = await response.json();
          const intent = (payload as { intent?: ReflectionIntent }).intent;
          if (intent) {
            setPreviewIntent(intent);
          } else {
            setPreviewIntent(null);
          }
          setIsPreviewLoading(false);
        })
        .catch(error => {
          if (controller.signal.aborted) {
            return;
          }
          setIsPreviewLoading(false);
          setPreviewIntent(null);
          setPreviewError(
            error instanceof Error ? error.message : 'Unable to detect intent right now.'
          );
        });
    }, 500);

    setDebounceHandle(handle);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="relative">
        <Textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          maxLength={MAX_CHAR_COUNT} // Hard limit at 500
          placeholder="What's blocking you? What should we focus on?"
          className="min-h-[128px] resize-none bg-bg-layer-3 text-text-body text-base sm:text-sm focus-visible:ring-primary-3 focus-visible:border-primary-3 sm:min-h-[96px]"
          disabled={isSubmitting || disabled}
          autoFocus
        />

        {/* Character + guidance */}
        <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p
            className={`text-sm ${
              charCount < MIN_CHAR_COUNT ? 'text-warning-text' : 'text-muted-foreground'
            }`}
          >
            {charCount}/{MAX_CHAR_COUNT} characters (min {MIN_CHAR_COUNT})
          </p>
          <p
            className={`text-sm ${
              wordCount > 0 && wordCount < MIN_WORD_COUNT
                ? 'text-warning-text'
                : 'text-muted-foreground'
            }`}
          >
            {wordCount < MIN_WORD_COUNT
              ? `Add ${MIN_WORD_COUNT - wordCount} more word${MIN_WORD_COUNT - wordCount === 1 ? '' : 's'} so we can act on it`
              : '3+ words helps us act on your context'}
          </p>
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Try: "Legal blocked outreach" • "Focus on analytics" • "Low energy today"
        </p>

        {/* Validation error */}
        {validationError && (
          <p className="mt-2 text-sm text-destructive-text">{validationError}</p>
        )}
      </div>

      {isPreviewLoading && (
        <p className="text-xs text-muted-foreground">Detecting intent…</p>
      )}
      {!isPreviewLoading && previewIntent && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Detected:
          </span>
          <span className="text-base" aria-hidden="true">
            {previewIntent.type === 'constraint'
              ? '🚫'
              : previewIntent.type === 'opportunity'
                ? '🎯'
                : previewIntent.type === 'capacity'
                  ? '🔋'
                  : previewIntent.type === 'sequencing'
                    ? '🔗'
                    : 'ℹ️'}
          </span>
          <span className="text-sm text-text-body font-medium">
            {previewIntent.type.charAt(0).toUpperCase() + previewIntent.type.slice(1)}{' '}
            {previewIntent.subtype ? `• ${previewIntent.subtype}` : ''}
          </span>
          {previewIntent.summary && (
            <span className="text-xs text-muted-foreground">{previewIntent.summary}</span>
          )}
        </div>
      )}
      {previewError && (
        <p className="text-xs text-destructive-text">{previewError}</p>
      )}

      <button
        type="submit"
        disabled={
          isSubmitting ||
          disabled ||
          text.trim().length < MIN_CHAR_COUNT ||
          wordCount < MIN_WORD_COUNT
        }
        className="w-full px-4 py-2 bg-primary-2 text-text-on-primary rounded-lg hover:bg-primary-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-2layer-sm hover:shadow-2layer-md font-medium"
      >
        {isSubmitting ? 'Adding...' : 'Add Reflection'}
        <span className="ml-2 text-xs opacity-70">(Cmd+Enter)</span>
      </button>
    </form>
  );
}
