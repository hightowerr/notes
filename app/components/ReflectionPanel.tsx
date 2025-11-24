'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReflectionInput } from './ReflectionInput';
import { ReflectionList } from './ReflectionList';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import type { ReflectionIntent } from '@/lib/schemas/reflectionIntent';
import type { ReflectionEffect } from '@/lib/services/reflectionAdjuster';
import { toggleReflection } from '@/lib/api/toggleReflection';
import { toast } from 'sonner';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReflectionAddedResult = {
  reflection: ReflectionWithWeight;
  intent?: ReflectionIntent | null;
  effects?: ReflectionEffect[];
  tasksAffected?: number;
  message?: string;
};

interface ReflectionPanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onReflectionAdded?: (result: ReflectionAddedResult) => void;  // Callback to notify parent when a reflection is added
  outcomeId?: string | null;
}

type PanelContentProps = {
  onClose: () => void;
  reflections: ReflectionWithWeight[];
  isLoading: boolean;
  canCaptureReflections: boolean;
  isOutcomeChecking: boolean;
  onReflectionAdded: (
    reflection: ReflectionWithWeight,
    tempId?: string,
    remove?: boolean,
    meta?: Partial<Omit<ReflectionAddedResult, 'reflection'>>
  ) => void;
  onMobileClose: () => void;
  onMobileReopen: () => void;
  onToggleReflection: (reflectionId: string, isActive: boolean) => Promise<void> | void;
  onDeleteReflection: (reflectionId: string) => Promise<void> | void;
  pendingToggleIds: Set<string>;
  deletingIds: Set<string>;
};

function PanelContent({
  onClose,
  reflections,
  isLoading,
  canCaptureReflections,
  isOutcomeChecking,
  onReflectionAdded,
  onMobileClose,
  onMobileReopen,
  onToggleReflection,
  onDeleteReflection,
  pendingToggleIds,
  deletingIds,
}: PanelContentProps) {
  return (
    <div
      className="h-full flex flex-col"
      onClick={event => {
        event.stopPropagation();
      }}
    >
      <div className="mb-6 flex items-center justify-between pb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-heading">Reflections</h2>
          <p className="mt-1 text-xs text-text-muted">Quick context capture</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 transition-all hover:bg-bg-layer-4"
          aria-label="Close panel"
        >
          <X className="h-5 w-5 text-text-muted" />
        </button>
      </div>

      {isOutcomeChecking ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking outcome…
          </div>
        </div>
      ) : canCaptureReflections ? (
        <>
          <div className="mb-6">
            <ReflectionInput
              onReflectionAdded={onReflectionAdded}
              onMobileClose={onMobileClose}
              onMobileReopen={onMobileReopen}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            <ReflectionList
              reflections={reflections}
              isLoading={isLoading}
              onToggle={onToggleReflection}
              onDelete={onDeleteReflection}
              pendingIds={pendingToggleIds}
              deletingIds={deletingIds}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg bg-muted/30 px-4 py-10 text-center">
          <p className="text-lg font-semibold text-text-heading">Set an outcome to capture reflections</p>
          <p className="mt-2 max-w-sm text-sm text-text-muted">
            Reflections are tied to your active outcome. Once you set one, you can log blockers, energy, and focus here.
          </p>
        </div>
      )}
    </div>
  );
}

export function ReflectionPanel({
  isOpen,
  onOpenChange,
  onReflectionAdded,
  outcomeId,
}: ReflectionPanelProps) {
  const [reflections, setReflections] = useState<ReflectionWithWeight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.innerWidth < 768;
  });
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [hasOutcome, setHasOutcome] = useState<boolean | null>(() => {
    if (typeof outcomeId === 'string' && outcomeId.length > 0) {
      return true;
    }
    if (outcomeId === null) {
      return false;
    }
    return null;
  });
  const [isOutcomeChecking, setIsOutcomeChecking] = useState(false);

  const setTogglePending = useCallback((reflectionId: string, pending: boolean) => {
    setPendingToggleIds((prev) => {
      const next = new Set(prev);
      if (pending) {
        next.add(reflectionId);
      } else {
        next.delete(reflectionId);
      }
      return next;
    });
  }, []);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetchReflections = useCallback(async () => {
    if (!hasOutcome) {
      setReflections([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/reflections?limit=5');
      if (response.ok) {
        const data = await response.json();
        setReflections(data.reflections || []);
      } else {
        setReflections([]);
      }
    } catch (error) {
      console.error('Failed to fetch reflections:', error);
      setReflections([]);
    } finally {
      setIsLoading(false);
    }
  }, [hasOutcome]);

  const checkOutcomePresence = useCallback(async () => {
    if (typeof outcomeId === 'string' && outcomeId.length > 0) {
      setHasOutcome(true);
      return;
    }
    if (outcomeId === null) {
      setHasOutcome(false);
      return;
    }

    setIsOutcomeChecking(true);
    try {
      const response = await fetch('/api/outcomes');
      if (!response.ok) {
        setHasOutcome(false);
        return;
      }
      const data = await response.json();
      setHasOutcome(Boolean(data?.outcome));
    } catch (error) {
      console.error('Failed to verify active outcome before loading reflections', error);
      setHasOutcome(false);
    } finally {
      setIsOutcomeChecking(false);
    }
  }, [outcomeId]);

  useEffect(() => {
    if (typeof outcomeId === 'string' && outcomeId.length > 0) {
      setHasOutcome(true);
    } else if (outcomeId === null) {
      setHasOutcome(false);
    }
  }, [outcomeId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    void checkOutcomePresence();
  }, [isOpen, checkOutcomePresence]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (hasOutcome) {
      void fetchReflections();
    } else if (hasOutcome === false) {
      setReflections([]);
    }
  }, [isOpen, hasOutcome, fetchReflections]);

  const handleReflectionAdded = (
    reflection: ReflectionWithWeight,
    tempId?: string,
    remove?: boolean,
    meta?: Partial<Omit<ReflectionAddedResult, 'reflection'>>
  ) => {
    if (remove && tempId) {
      // Rollback: remove temp reflection
      setReflections((prev) => prev.filter((r) => r.id !== tempId));
    } else if (tempId) {
      // Replace temp with real data
      setReflections((prev) =>
        prev.map((r) => (r.id === tempId ? reflection : r))
      );
    } else {
      // Add new reflection (optimistic)
      setReflections((prev) => [reflection, ...prev].slice(0, 5)); // Keep max 5
      // Notify parent that a reflection was added to trigger priority recompute
      onReflectionAdded?.({
        reflection,
        intent: meta?.intent ?? null,
        effects: meta?.effects,
        tasksAffected: meta?.tasksAffected,
        message: meta?.message,
      });
    }
  };

  const handleReflectionToggle = useCallback(
    async (reflectionId: string, isActive: boolean) => {
      if (!hasOutcome) {
        toast.info('Set an outcome to manage reflections.');
        return;
      }
      if (pendingToggleIds.has(reflectionId) || !UUID_PATTERN.test(reflectionId)) {
        return;
      }

      let previousState = isActive;

      setReflections((prev) =>
        prev.map((reflection) => {
          if (reflection.id === reflectionId) {
            previousState =
              typeof reflection.is_active_for_prioritization === 'boolean'
                ? reflection.is_active_for_prioritization
                : true;
            return { ...reflection, is_active_for_prioritization: isActive };
          }
          return reflection;
        })
      );

      setTogglePending(reflectionId, true);

      try {
        const updatedReflection = await toggleReflection(reflectionId, isActive);

        setReflections((prev) =>
          prev.map((reflection) =>
            reflection.id === reflectionId
              ? {
                  ...reflection,
                  ...updatedReflection,
                  is_active_for_prioritization:
                    typeof updatedReflection.is_active_for_prioritization === 'boolean'
                      ? updatedReflection.is_active_for_prioritization
                      : isActive,
                }
              : reflection
          )
        );
      } catch (error) {
        setReflections((prev) =>
          prev.map((reflection) =>
            reflection.id === reflectionId
              ? {
                  ...reflection,
                  is_active_for_prioritization: previousState,
                }
              : reflection
          )
        );
        const message =
          error instanceof Error ? error.message : 'Failed to update reflection';
        toast.error(message);
      } finally {
        setTogglePending(reflectionId, false);
      }
    },
    [pendingToggleIds, setTogglePending, hasOutcome]
  );

  const handleMobileClose = () => {
    // Mobile-specific: close modal after reflection added
    if (isMobile) {
      onOpenChange(false);
    }
  };

  const handleMobileReopen = () => {
    // Mobile-specific: reopen modal from "Add Another" button
    if (isMobile) {
      onOpenChange(true);
    }
  };

  const handleReflectionDelete = useCallback(
    async (reflectionId: string) => {
      if (!hasOutcome) {
        toast.info('Set an outcome to manage reflections.');
        return;
      }
      if (deletingIds.has(reflectionId) || !UUID_PATTERN.test(reflectionId)) {
        return;
      }

      // Optimistic UI update
      setReflections((prev) => prev.filter((r) => r.id !== reflectionId));
      setDeletingIds((prev) => new Set(prev).add(reflectionId));

      try {
        const response = await fetch(`/api/reflections/${reflectionId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('Failed to delete reflection');
        }

        toast.success('Reflection deleted');
      } catch (error) {
        // Rollback on error - re-fetch to restore
        await fetchReflections();
        const message =
          error instanceof Error ? error.message : 'Failed to delete reflection';
        toast.error(message);
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(reflectionId);
          return next;
        });
      }
    },
    [deletingIds, hasOutcome, fetchReflections]
  );

  const panelContentProps = useMemo(
    () => ({
      onClose: () => onOpenChange(false),
      reflections,
      isLoading,
      canCaptureReflections: hasOutcome === true,
      isOutcomeChecking,
      onReflectionAdded: handleReflectionAdded,
      onMobileClose: handleMobileClose,
      onMobileReopen: handleMobileReopen,
      onToggleReflection: handleReflectionToggle,
      onDeleteReflection: handleReflectionDelete,
      pendingToggleIds,
      deletingIds,
    }),
    [
      reflections,
      isLoading,
      hasOutcome,
      isOutcomeChecking,
      handleReflectionAdded,
      handleMobileClose,
      handleMobileReopen,
      handleReflectionToggle,
      handleReflectionDelete,
      pendingToggleIds,
      deletingIds,
      onOpenChange,
    ]
  );

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleClickOutside = (event: MouseEvent) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isMobile, onOpenChange]);

  return (
    <>
      {/* Desktop: Collapsible sidebar (outside Dialog) */}
      {!isMobile && isOpen && (
        <>
          <div
            className="fixed inset-0 hidden bg-black/20 transition-opacity duration-300 md:block"
            style={{ zIndex: 999 }}
            onClick={() => {
              onOpenChange(false);
            }}
          />
          <div
            ref={panelRef}
            className="fixed right-0 top-0 hidden h-full w-80 translate-x-0 transform bg-bg-layer-2 shadow-2layer-lg transition-transform duration-300 ease-in-out md:block"
            style={{ zIndex: 1000 }}
            onClick={event => {
              event.stopPropagation();
            }}
          >
            <div className="h-full overflow-hidden p-6">
              <PanelContent {...panelContentProps} />
            </div>
          </div>
        </>
      )}

      {/* Mobile: Full-screen modal */}
      {isMobile && (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
          <DialogContent className="h-full w-full max-w-none overflow-y-auto p-6 md:hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>Reflections</DialogTitle>
              <DialogDescription>Capture current context reflections.</DialogDescription>
            </DialogHeader>
            <PanelContent {...panelContentProps} />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
