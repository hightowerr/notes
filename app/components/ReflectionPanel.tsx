'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ReflectionInput } from './ReflectionInput';
import { ReflectionList } from './ReflectionList';
import type { ReflectionWithWeight } from '@/lib/schemas/reflectionSchema';

interface ReflectionPanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReflectionPanel({ isOpen, onOpenChange }: ReflectionPanelProps) {
  const [reflections, setReflections] = useState<ReflectionWithWeight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
        <ReflectionList reflections={reflections} isLoading={isLoading} />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Collapsible sidebar */}
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
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
          <DialogContent className="w-full h-full max-w-none p-6 overflow-y-auto">
            <PanelContent />
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
