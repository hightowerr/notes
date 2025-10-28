'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReflectionInput } from './ReflectionInput';
import { ReflectionList } from './ReflectionList';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';
import { toggleReflection } from '@/lib/api/toggleReflection';
import { toast } from 'sonner';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ReflectionPanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReflectionPanel({ isOpen, onOpenChange }: ReflectionPanelProps) {
  const [reflections, setReflections] = useState<ReflectionWithWeight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingToggleIds, setPendingToggleIds] = useState<Set<string>>(new Set());

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

  // Fetch reflections when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchReflections();
    }
  }, [isOpen]);

  const fetchReflections = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/reflections?limit=5');
      if (response.ok) {
        const data = await response.json();
        setReflections(data.reflections || []);
      }
    } catch (error) {
      console.error('Failed to fetch reflections:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReflectionAdded = (
    reflection: ReflectionWithWeight,
    tempId?: string,
    remove?: boolean
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
    }
  };

  const handleReflectionToggle = useCallback(
    async (reflectionId: string, isActive: boolean) => {
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
    [pendingToggleIds, setTogglePending]
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

  const PanelContent = () => (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-text-muted/20">
        <div>
          <h2 className="text-lg font-semibold text-text-heading">Reflections</h2>
          <p className="text-xs text-text-muted mt-1">Quick context capture</p>
        </div>
        <button
          onClick={() => onOpenChange(false)}
          className="p-2 hover:bg-bg-layer-4 rounded-lg transition-all"
          aria-label="Close panel"
        >
          <X className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      {/* Input Form */}
      <div className="mb-6">
        <ReflectionInput
          onReflectionAdded={handleReflectionAdded}
          onMobileClose={handleMobileClose}
          onMobileReopen={handleMobileReopen}
        />
      </div>

      {/* Recent Reflections List */}
      <div className="flex-1 overflow-y-auto">
        <ReflectionList
          reflections={reflections}
          isLoading={isLoading}
          onToggle={handleReflectionToggle}
          pendingIds={pendingToggleIds}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Collapsible sidebar */}
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <div className="hidden md:block">
          <div
            className={`fixed right-0 top-0 h-full w-80 bg-bg-layer-2 shadow-2layer-lg z-50 transform transition-transform duration-300 ease-in-out ${
              isOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="h-full p-6 overflow-hidden">
              <PanelContent />
            </div>
          </div>

          {/* Overlay (click to close) */}
          {isOpen && (
            <div
              className="fixed inset-0 bg-black/20 z-40 transition-opacity duration-300"
              onClick={() => onOpenChange(false)}
            />
          )}
        </div>

        {/* Mobile: Full-screen modal */}
        <div className="md:hidden">
          <DialogContent className="w-full h-full max-w-none p-6 overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Reflections</DialogTitle>
              <DialogDescription>Capture current context reflections.</DialogDescription>
            </DialogHeader>
            <PanelContent />
          </DialogContent>
        </div>
      </Dialog>
    </>
  );
}
