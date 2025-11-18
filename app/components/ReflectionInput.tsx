'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { reflectionInputSchema } from '@/lib/schemas/reflectionSchema';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';

interface ReflectionInputProps {
  onReflectionAdded: (reflection: ReflectionWithWeight, tempId?: string, remove?: boolean) => void;
  onMobileClose?: () => void; // Mobile-specific: close modal after submit
  onMobileReopen?: () => void; // Mobile-specific: reopen modal from "Add Another" button
  disabled?: boolean;
}

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

  const charCount = text.length;

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
        throw new Error(errorData.message || 'Server error occurred');
      }

      const saved: ReflectionWithWeight = await response.json();

      // Replace temp with real data
      onReflectionAdded(saved, tempReflection.id);
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
          maxLength={500} // Hard limit at 500
          placeholder="What's your current context? (energy level, constraints, blockers, momentum...)"
          className="min-h-[128px] resize-none bg-bg-layer-3 text-text-body text-base sm:text-sm focus-visible:ring-primary-3 focus-visible:border-primary-3 sm:min-h-[96px]"
          disabled={isSubmitting || disabled}
          autoFocus
        />

        {/* Character counter (hidden until 450 chars) */}
        {charCount >= 450 && (
          <div className="mt-2 space-y-1">
            <p
              className={`text-sm ${
                charCount === 500 ? 'text-warning-text' : 'text-text-muted'
              }`}
            >
              {charCount}/500 characters
            </p>
            {charCount === 500 && (
              <p className="text-sm text-warning-text">
                Reflections work best when concise. Wrap up this thought.
              </p>
            )}
          </div>
        )}

        {/* Validation error */}
        {validationError && (
          <p className="mt-2 text-sm text-destructive-text">{validationError}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting || text.trim().length === 0 || disabled}
        className="w-full px-4 py-2 bg-primary-2 text-text-on-primary rounded-lg hover:bg-primary-3 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-2layer-sm hover:shadow-2layer-md font-medium"
      >
        {isSubmitting ? 'Adding...' : 'Add Reflection'}
        <span className="ml-2 text-xs opacity-70">(Cmd+Enter)</span>
      </button>
    </form>
  );
}
