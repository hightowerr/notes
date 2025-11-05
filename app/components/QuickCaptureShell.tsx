'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextInputModal } from '@/app/components/TextInputModal';
import { PenSquare } from 'lucide-react';

interface QuickCaptureShellProps {
  children: React.ReactNode;
}

export function QuickCaptureShell({ children }: QuickCaptureShellProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      {children}

      <TextInputModal open={modalOpen} onOpenChange={setModalOpen} />

      <div className="fixed bottom-6 right-6 z-50">
        <Button
          type="button"
          size="lg"
          className="rounded-full shadow-2xl"
          onClick={() => setModalOpen(true)}
        >
          <PenSquare className="mr-2 h-4 w-4" aria-hidden="true" />
          Quick Capture
        </Button>
      </div>
    </>
  );
}
