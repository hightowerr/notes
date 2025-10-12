import { useState, useEffect } from 'react';
import type { OutcomeInput } from '@/lib/schemas/outcomeSchema';

interface OutcomeDraft extends OutcomeInput {
  expiresAt: number;
}

const DRAFT_STORAGE_KEY = 'outcome_draft_v1';
const EXPIRY_HOURS = 24;

/**
 * useOutcomeDraft - Custom hook for managing outcome drafts in localStorage
 *
 * Features:
 * - Saves draft to localStorage with 24-hour expiry
 * - Loads draft on mount and checks expiry
 * - Clears draft after successful save or expiry
 * - Lazy expiry check (no background process)
 *
 * @returns Object with draft state and operations
 */
export function useOutcomeDraft() {
  const [draft, setDraft] = useState<OutcomeDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!stored) {
        setIsLoading(false);
        return;
      }

      const parsed: OutcomeDraft = JSON.parse(stored);

      // Check if draft has expired
      if (parsed.expiresAt < Date.now()) {
        console.log('[Draft] Draft expired, removing from localStorage');
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        setDraft(null);
        setIsLoading(false);
        return;
      }

      // Draft is valid
      console.log('[Draft] Loaded valid draft from localStorage');
      setDraft(parsed);
      setIsLoading(false);
    } catch (error) {
      console.error('[Draft] Failed to parse draft from localStorage:', error);
      // Clear corrupted data
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setDraft(null);
      setIsLoading(false);
    }
  }, []);

  /**
   * Save draft to localStorage with expiry timestamp
   * @param data - Outcome input data to save
   */
  const saveDraft = (data: OutcomeInput) => {
    try {
      // Only save if there's actual content (not all empty)
      const hasContent = data.object || data.metric || data.clarifier;
      console.log('[Draft] saveDraft called - hasContent:', !!hasContent, 'data:', data);
      if (!hasContent) {
        console.log('[Draft] No content to save, skipping');
        return;
      }

      const draftWithExpiry: OutcomeDraft = {
        ...data,
        expiresAt: Date.now() + (EXPIRY_HOURS * 60 * 60 * 1000)
      };

      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftWithExpiry));
      setDraft(draftWithExpiry);
      console.log('[Draft] Draft saved to localStorage', {
        expiresAt: new Date(draftWithExpiry.expiresAt).toISOString()
      });
    } catch (error) {
      console.error('[Draft] Failed to save draft to localStorage:', error);
    }
  };

  /**
   * Clear draft from localStorage and state
   */
  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setDraft(null);
      console.log('[Draft] Draft cleared from localStorage');
    } catch (error) {
      console.error('[Draft] Failed to clear draft from localStorage:', error);
    }
  };

  /**
   * Check if draft exists and is not expired
   */
  const hasDraft = !!draft && draft.expiresAt > Date.now();

  return {
    draft,
    hasDraft,
    isLoading,
    saveDraft,
    clearDraft
  };
}
