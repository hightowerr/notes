'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { ReasoningTraceRecord, ReasoningStep } from '@/lib/types/agent';

type ExportButtonProps = {
  sessionId: string;
  traceData: ReasoningTraceRecord;
  executionMetadata: unknown; // Added
  disabled: boolean;
};

type ExportPayload = {
  session_id: string;
  exported_at: string;
  execution_metadata: unknown;
  steps: ReasoningStep[];
};

export function ExportButton({ sessionId, traceData, executionMetadata, disabled }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    const payload: ExportPayload = {
      session_id: sessionId,
      exported_at: new Date().toISOString(),
      execution_metadata: executionMetadata, // Used from props
      steps: traceData.steps,
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const filename = `reasoning-trace-${sessionId}-${new Date().toISOString().replace(/:/g, '-')}.json`;

    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Trace exported successfully.');
    } catch (error) {
      console.error('Export failed, falling back to clipboard', error);
      try {
        await navigator.clipboard.writeText(json);
        toast.info('Export failed, trace copied to clipboard.');
      } catch (clipboardError) {
        console.error('Failed to copy trace to clipboard', clipboardError);
        toast.error('Failed to export or copy trace.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || isExporting}
      aria-label="Export reasoning trace"
    >
      <Download className="mr-2 h-4 w-4" />
      <span>Export</span>
    </Button>
  );
}