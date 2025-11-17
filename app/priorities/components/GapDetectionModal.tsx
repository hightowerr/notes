'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DraftTask } from '@/lib/schemas/taskIntelligence';
import ErrorBanner from '@/app/components/ErrorBanner';
import { DraftTaskCard } from './DraftTaskCard';

const MAX_DRAFT_RETRY_ATTEMPTS = 3;
const DRAFT_ERROR_MESSAGE = 'AI analysis unavailable. Showing heuristic draft suggestions. [Retry]';
const DRAFT_EXHAUSTED_MESSAGE =
  'AI service temporarily unavailable. Draft suggestions rely on heuristic templates.';
const LOADING_STEPS = [
  { key: 'analysis', label: 'Analyzing gaps... 🔄' },
  { key: 'generation', label: 'Generating draft tasks... 🤖' },
];

interface GapDetectionModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (nextOpen: boolean) => void;
  missingAreas?: string[] | null;
  onAcceptSelected: (draftIds: string[]) => void;
  sessionId: string;
  outcomeText: string;
  existingTaskIds: string[];
  existingTaskTexts?: string[];
  detectionStatus?: string;
  detectionError?: string | null;
  detectionResult?: unknown;
  suggestions?: unknown;
  isGenerating?: boolean;
}

export const GapDetectionModal: React.FC<GapDetectionModalProps> = ({
  isOpen,
  open,
  onClose,
  onOpenChange,
  missingAreas = [],
  onAcceptSelected,
  sessionId,
  outcomeText,
  existingTaskIds,
  existingTaskTexts = [],
}) => {
  const resolvedIsOpen = typeof open === 'boolean' ? open : Boolean(isOpen);
  const handleClose = useCallback(() => {
    onClose?.();
    onOpenChange?.(false);
  }, [onClose, onOpenChange]);

  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [p5Triggered, setP5Triggered] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftFailureCount, setDraftFailureCount] = useState(0);
  const [loadingStageIndex, setLoadingStageIndex] = useState<number | null>(null);

  const emptyStateInitializedRef = useRef(false);

  const generateDraftTasks = useCallback(async () => {
    const normalizedMissingAreas = Array.isArray(missingAreas)
      ? missingAreas.filter(area => typeof area === 'string' && area.trim().length > 0)
      : [];

    if (normalizedMissingAreas.length === 0) {
      if (!emptyStateInitializedRef.current) {
        setDrafts([]);
        setP5Triggered(false);
        setDraftError(null);
        setLoadingStageIndex(null);
        emptyStateInitializedRef.current = true;
      }
      return;
    }

    emptyStateInitializedRef.current = false;

    setLoading(true);
    setLoadingStageIndex(0);
    try {
      const response = await fetch('/api/agent/generate-draft-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outcome_text: outcomeText,
          missing_areas: normalizedMissingAreas,
          existing_task_ids: existingTaskIds,
          existing_task_texts: existingTaskTexts,
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setDrafts(data.drafts);
      setP5Triggered(data.phase5_triggered);
      setDraftError(null);
      setDraftFailureCount(0);
    } catch (error) {
      console.error('Error generating draft tasks:', error);
      setDraftError(DRAFT_ERROR_MESSAGE);
      setDraftFailureCount(prev => Math.min(prev + 1, MAX_DRAFT_RETRY_ATTEMPTS));
    } finally {
      setLoading(false);
      setLoadingStageIndex(null);
    }
  }, [existingTaskIds, existingTaskTexts, missingAreas, outcomeText, sessionId]);

  const wasOpenRef = useRef(false);

  // Fetch or generate drafts when modal opens, reset state once after closing
  useEffect(() => {
    if (resolvedIsOpen) {
      wasOpenRef.current = true;
      void generateDraftTasks();
      return;
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      setDraftError(null);
      setDraftFailureCount(0);
      setSelectedDraftIds([]);
      setLoadingStageIndex(null);
    }
  }, [generateDraftTasks, resolvedIsOpen]);

  useEffect(() => {
    if (!loading || loadingStageIndex === null) {
      return;
    }
    if (loadingStageIndex >= LOADING_STEPS.length - 1) {
      return;
    }

    const timer = setTimeout(() => {
      setLoadingStageIndex(current => {
        if (current === null) {
          return null;
        }
        return Math.min(current + 1, LOADING_STEPS.length - 1);
      });
    }, 1800);

    return () => {
      clearTimeout(timer);
    };
  }, [loading, loadingStageIndex]);

  const handleEditDraft = (id: string, newText: string) => {
    setDrafts(prevDrafts =>
      prevDrafts.map(draft => 
        draft.id === id ? { ...draft, task_text: newText } : draft
      )
    );
  };

  const handleAcceptDraft = (id: string) => {
    if (!selectedDraftIds.includes(id)) {
      setSelectedDraftIds(prev => [...prev, id]);
    }
  };

  const handleRetryDraftGeneration = useCallback(() => {
    if (draftFailureCount >= MAX_DRAFT_RETRY_ATTEMPTS || loading) {
      return;
    }
    void generateDraftTasks();
  }, [draftFailureCount, generateDraftTasks, loading]);

  const handleDismissDraft = (id: string) => {
    setDrafts(prevDrafts => prevDrafts.filter(draft => draft.id !== id));
    setSelectedDraftIds(prev => prev.filter(draftId => draftId !== id));
  };

  const handleAcceptSelected = async () => {
    if (selectedDraftIds.length === 0) return;

    // Show loading state
    setLoading(true);

    try {
      // Prepare edited drafts
      const editedDrafts = drafts
        .filter(draft => selectedDraftIds.includes(draft.id) && draft.task_text !== drafts.find(d => d.id === draft.id)?.task_text)
        .map(draft => ({
          id: draft.id,
          task_text: draft.task_text
        }));

      // Call the accept API
      const response = await fetch('/api/agent/accept-draft-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          accepted_draft_ids: selectedDraftIds,
          edited_drafts: editedDrafts,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.cycle_detected) {
          // Handle cycle error - keep modal open to allow user to adjust
          console.error('Cycle detected:', result);
          alert(`Cycle detected in tasks. Please adjust your selections.\nDetails: ${result.error || 'Unknown cycle error'}`);
        } else {
          throw new Error(result.error || 'Failed to accept draft tasks');
        }
      } else {
        // Success: show feedback, close modal, refresh task list
        const oldCoverage = 0; // In a real implementation, you'd have access to the previous coverage
        alert(`✅ ${result.inserted_task_ids.length} tasks added. Coverage: ${oldCoverage}% → ${result.new_coverage_percentage}%`);
        onAcceptSelected(selectedDraftIds);
        onClose();
      }
    } catch (error) {
      console.error('Error accepting selected drafts:', error);
      alert('Error accepting draft tasks. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!resolvedIsOpen) return null;

  // Group drafts by source
  const p10Drafts = drafts.filter(draft => draft.source === 'phase10_semantic');
  const p5Drafts = drafts.filter(draft => draft.source === 'phase5_dependency');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">🎯 Suggested Tasks to Fill Gaps</h2>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          {draftError && (
            <div className="mb-4">
              <ErrorBanner
                message={DRAFT_ERROR_MESSAGE}
                exhaustedMessage={DRAFT_EXHAUSTED_MESSAGE}
                retryCount={draftFailureCount}
                maxRetries={MAX_DRAFT_RETRY_ATTEMPTS}
                onRetry={draftFailureCount >= MAX_DRAFT_RETRY_ATTEMPTS ? undefined : handleRetryDraftGeneration}
                retryLabel="Retry generation"
              />
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-lg bg-bg-layer-2 p-4 shadow-2layer-sm">
                <p className="text-sm font-semibold text-muted-foreground">System response</p>
                <ol className="space-y-2 text-sm text-foreground">
                  <li>1. Phase 10 Semantic Drafts: up to 3 drafts per missing area.</li>
                  <li>2. Phase 5 fallback check: trigger dependency gaps if coverage &lt;80%.</li>
                  <li>3. Deduplication: suppress P5 drafts when similarity &gt;0.85.</li>
                </ol>
              </div>
              <div className="rounded-lg bg-bg-layer-3 p-4 shadow-2layer-sm">
                <p className="text-sm font-semibold text-muted-foreground mb-3">What you should see</p>
                <div className="space-y-2">
                  {LOADING_STEPS.map((step, index) => (
                    <div
                      key={step.key}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                        index === loadingStageIndex ? 'bg-primary/10 text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {index === loadingStageIndex ? (
                        <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-primary" />
                      ) : (
                        <span className="inline-flex h-3 w-3 rounded-full bg-muted-foreground/30" />
                      )}
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-gray-600">
                  {missingAreas.length > 0
                    ? `Missing conceptual areas: ${missingAreas.join(', ')}`
                    : 'No specific gaps detected, but dependency tasks suggested.'}
                </p>
              </div>

              {p10Drafts.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-blue-700 mb-2">🎯 Semantic Gaps (Phase 10)</h3>
                  {p10Drafts.map(draft => (
                    <DraftTaskCard
                      key={draft.id}
                      draft={draft}
                      onEdit={handleEditDraft}
                      onAccept={handleAcceptDraft}
                      onDismiss={handleDismissDraft}
                    />
                  ))}
                </div>
              )}

              {p5Triggered && p5Drafts.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-purple-700 mb-2">🔗 Dependency Gaps (Phase 5)</h3>
                  {p5Drafts.map(draft => (
                    <DraftTaskCard
                      key={draft.id}
                      draft={draft}
                      onEdit={handleEditDraft}
                      onAccept={handleAcceptDraft}
                      onDismiss={handleDismissDraft}
                    />
                  ))}
                </div>
              )}

              {drafts.length === 0 && !loading && (
                <div className="text-center py-8 text-gray-500">
                  No draft tasks generated. Try adjusting your outcome or task plan.
                </div>
              )}

              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                  disabled={loading}
                >
                  Dismiss All
                </button>
                <div>
                  <span className="mr-4 text-gray-600">
                    Selected: {selectedDraftIds.length}
                  </span>
                  <button
                    onClick={handleAcceptSelected}
                    disabled={selectedDraftIds.length === 0 || loading}
                    className={`px-4 py-2 rounded-md ${
                      selectedDraftIds.length > 0 && !loading
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {loading ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      `Accept Selected (${selectedDraftIds.length})`
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
