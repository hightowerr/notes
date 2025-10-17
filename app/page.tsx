'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Upload, FileText, AlertCircle, Loader2, CheckCircle2, Clock, Target, MessageSquare } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import SummaryPanel from '@/app/components/SummaryPanel';
import { OutcomeDisplay } from '@/app/components/OutcomeDisplay';
import { OutcomeBuilder } from '@/app/components/OutcomeBuilder';
import { ReflectionPanel } from '@/app/components/ReflectionPanel';
import { useReflectionShortcut } from '@/lib/hooks/useReflectionShortcut';
import { toast, Toaster } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import type { DocumentOutput, StatusResponse, FileStatusType } from '@/lib/schemas';

// Type definitions - extend backend statuses with frontend-only states
type FileUploadStatus = 'idle' | 'uploading' | FileStatusType;

interface UploadedFileInfo {
  id: string;
  name: string;
  size: number;
  uploadedAt: number;
  status: FileUploadStatus;
  queuePosition?: number;
  error?: string;
  summary?: DocumentOutput;
  confidence?: number;
  processingDuration?: number;
  filteringDecisions?: any; // T018: Filtering metadata from backend
  allActions?: any[]; // T019: Unfiltered action list
  filteringApplied?: boolean; // T019: Whether filtering was applied
  exclusionReasons?: Array<{ action_text: string; reason: string }>; // T019: Exclusion reasons
}

// Client-side file validation (T004)
const validateFileBeforeUpload = (file: File): { valid: boolean; error?: string } => {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ];

  // Check file size
  if (file.size > MAX_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File too large: ${file.name} (${sizeMB}MB). Maximum size: 10MB`,
    };
  }

  // Check MIME type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.name}. Please use PDF, DOCX, or TXT files.`,
    };
  }

  return { valid: true };
};

export default function Home() {
  const [files, setFiles] = useState<UploadedFileInfo[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);
  const [editingOutcome, setEditingOutcome] = useState<any>(null);
  const [reflectionPanelOpen, setReflectionPanelOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Reflection panel keyboard shortcut (Cmd+R / Ctrl+R)
  useReflectionShortcut(() => setReflectionPanelOpen(prev => !prev));

  // Status polling effect
  useEffect(() => {
    // Copy ref to local variable for cleanup
    const intervals = pollingIntervalsRef.current;

    // Clean up all intervals on unmount
    return () => {
      intervals.forEach((interval) => clearInterval(interval));
      intervals.clear();
    };
  }, []);

  // Status polling function
  const startPolling = (fileId: string, filename: string) => {
    // Avoid duplicate polling
    if (pollingIntervalsRef.current.has(fileId)) {
      return;
    }

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/status/${fileId}`);
        const statusData: StatusResponse = await response.json();

        console.log('[POLL SUCCESS]', {
          fileId,
          status: statusData.status,
          hasSummary: !!statusData.summary,
          confidence: statusData.confidence,
        });

        // Update file status
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? {
                  ...f,
                  status: statusData.status,
                  summary: statusData.summary,
                  confidence: statusData.confidence,
                  processingDuration: statusData.processingDuration,
                  error: statusData.error,
                  filteringDecisions: (statusData as any).filteringDecisions || undefined, // T018
                  allActions: (statusData as any).allActions || undefined, // T019: Unfiltered actions
                  filteringApplied: (statusData as any).filteringApplied || false, // T019
                  exclusionReasons: (statusData as any).exclusionReasons || [], // T019
                }
              : f
          )
        );

        // Show toast notification when complete
        if (statusData.status === 'completed' || statusData.status === 'review_required') {
          console.log('[SUMMARY READY]', { fileId, filename, summary: statusData.summary });
          toast.success(`Summary ready for ${filename}`);
          stopPolling(fileId);
        } else if (statusData.status === 'failed') {
          toast.error(`Processing failed for ${filename}`);
          stopPolling(fileId);
        }
      } catch (error) {
        console.error('[POLLING ERROR]', { fileId, error });
        // Continue polling on network errors
      }
    };

    // Start polling every 2 seconds
    const interval = setInterval(pollStatus, 2000);
    pollingIntervalsRef.current.set(fileId, interval);

    // Also poll immediately
    pollStatus();
  };

  const stopPolling = (fileId: string) => {
    const interval = pollingIntervalsRef.current.get(fileId);
    if (interval) {
      clearInterval(interval);
      pollingIntervalsRef.current.delete(fileId);
    }
  };

  // File upload handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      handleFilesAdded(droppedFiles);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      handleFilesAdded(selectedFiles);
    }
  };

  const handleFilesAdded = async (files: File[]) => {
    let errorCount = 0; // Track validation errors for staggered display

    for (const file of files) {
      // Client-side validation FIRST (T004)
      const validation = validateFileBeforeUpload(file);
      if (!validation.valid) {
        // Stagger toast display for multiple errors (better UX)
        const delay = errorCount * 100; // 100ms between toasts
        setTimeout(() => {
          toast.error(validation.error!);
        }, delay);

        errorCount++;

        // Log to console immediately (no delay)
        console.error('[CLIENT VALIDATION]', {
          filename: file.name,
          size: file.size,
          type: file.type,
          error: validation.error,
          timestamp: new Date().toISOString(),
        });

        continue; // Skip this file, don't upload
      }

      const tempId = `temp-${Date.now()}-${Math.random()}`;

      // Add file to UI immediately with 'uploading' status
      const fileInfo: UploadedFileInfo = {
        id: tempId,
        name: file.name,
        size: file.size,
        uploadedAt: Date.now(),
        status: 'uploading',
      };

      setFiles((prev) => [...prev, fileInfo]);

      // Upload file to backend
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (response.ok && result.success) {
          // Update file status to processing or pending (queued)
          setFiles((prev) =>
            prev.map((f) =>
              f.id === tempId
                ? {
                    ...f,
                    id: result.fileId,
                    status: result.status, // 'processing' or 'pending'
                    queuePosition: result.queuePosition ?? undefined,
                  }
                : f
            )
          );

          // Show appropriate toast based on queue status
          const sizeInMB = (file.size / (1024 * 1024)).toFixed(1);
          if (result.queuePosition !== null && result.queuePosition !== undefined) {
            toast.info(`${file.name} (${sizeInMB}MB) uploaded - Queued at position ${result.queuePosition}`);
          } else {
            toast.success(`${file.name} (${sizeInMB}MB) uploaded - Processing...`);
          }

          // Start status polling
          startPolling(result.fileId, file.name);

          // Log to console (FR-006: Observable by design)
          console.log('[UPLOAD SUCCESS]', {
            fileId: result.fileId,
            filename: file.name,
            size: file.size,
            status: result.status,
            timestamp: new Date().toISOString(),
          });
        } else {
          // Upload failed - update status
          setFiles((prev) =>
            prev.map((f) =>
              f.id === tempId
                ? { ...f, status: 'failed', error: result.error || 'Upload failed' }
                : f
            )
          );

          // Show error toast
          toast.error(`Failed to upload ${file.name}: ${result.error}`);

          // Log error to console
          console.error('[UPLOAD ERROR]', {
            filename: file.name,
            error: result.error,
            code: result.code,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        // Network or unexpected error
        setFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? {
                  ...f,
                  status: 'failed',
                  error: error instanceof Error ? error.message : 'Network error',
                }
              : f
          )
        );

        toast.error(`Failed to upload ${file.name}`);

        console.error('[UPLOAD NETWORK ERROR]', {
          filename: file.name,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    }
  };

  // Helper functions
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: FileUploadStatus, queuePosition?: number) => {
    switch (status) {
      case 'uploading':
        return (
          <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-info-bg text-info-text border-0">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Uploading" />
            <span className="font-medium">Uploading</span>
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
            <Clock className="h-3.5 w-3.5" aria-label="Queued" />
            <span className="font-medium">
              {queuePosition ? `Queued - Position ${queuePosition}` : 'Queued'}
            </span>
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-2 text-text-on-primary border-0">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Processing" />
            <span className="font-medium">Processing</span>
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-success-bg text-success-text border-0">
            <CheckCircle2 className="h-3.5 w-3.5" aria-label="Complete" />
            <span className="font-medium">Complete</span>
          </Badge>
        );
      case 'review_required':
        return (
          <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-warning-bg text-warning-text border-0">
            <AlertCircle className="h-3.5 w-3.5" aria-label="Review required" />
            <span className="font-medium">Review Required</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive-bg text-destructive-text border-0">
            <AlertCircle className="h-3.5 w-3.5" aria-label="Failed" />
            <span className="font-medium">Failed</span>
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="px-3 py-1.5">Unknown</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-bg-layer-1">
      {/* Toast Notifications */}
      <Toaster position="top-right" richColors />

      {/* Outcome Display Banner (shown when active outcome exists) */}
      <OutcomeDisplay onEdit={(outcome) => {
        setEditingOutcome({
          direction: outcome.direction,
          object: outcome.object_text,
          metric: outcome.metric_text,
          clarifier: outcome.clarifier
        });
        setOutcomeModalOpen(true);
      }} />

      {/* Outcome Builder Modal */}
      <OutcomeBuilder
        open={outcomeModalOpen}
        onOpenChange={(open) => {
          setOutcomeModalOpen(open);
          if (!open) {
            setEditingOutcome(null);
          }
        }}
        initialValues={editingOutcome}
        isEditMode={!!editingOutcome}
        onSuccess={() => {
          console.log('[Home] Outcome saved successfully');
          setEditingOutcome(null);
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-10 border-b-0 bg-bg-layer-2 shadow-2layer-md">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary-2" />
              <div>
                <h1 className="text-2xl font-bold text-text-heading">AI Note Synthesiser</h1>
                <p className="text-sm text-text-muted">
                  Autonomous document analysis and structured insights
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReflectionPanelOpen(true)}
                className="gap-2"
                title="Reflections (Cmd+Shift+R / Ctrl+Shift+R)"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Reflections</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOutcomeModalOpen(true)}
                className="gap-2"
              >
                <Target className="h-4 w-4" />
                <span className="hidden sm:inline">Set Outcome</span>
              </Button>
              <Badge variant="secondary" className="px-4 py-2">
                {files.length} {files.length === 1 ? 'Document' : 'Documents'}
              </Badge>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* File Upload Section */}
        <section>
          <div className="mb-4 flex items-center gap-3">
            <Upload className="h-6 w-6 text-primary-2" />
            <h2 className="text-xl font-semibold text-text-heading">Upload Documents</h2>
          </div>

          <Card
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative overflow-hidden cursor-pointer border-2 border-dashed transition-all duration-300 hover-lift ${
              isDragging
                ? 'border-primary-2 bg-primary-2/10 scale-[1.02]'
                : 'border-border-subtle hover:border-primary-2/50'
            }`}
          >
            <div className={`absolute inset-0 gradient-primary-subtle opacity-0 transition-opacity duration-300 ${
              isDragging ? 'opacity-100' : 'group-hover:opacity-50'
            }`} />
            <CardContent className="relative flex flex-col items-center gap-4 py-16 text-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileSelect}
                className="hidden"
                aria-label="File input"
              />
              <div className={`rounded-full bg-primary-2/10 p-6 transition-transform duration-300 ${
                isDragging ? 'scale-110' : 'scale-100'
              }`}>
                <Upload className={`h-12 w-12 transition-colors duration-300 ${
                  isDragging ? 'text-primary-2' : 'text-primary-2/60'
                }`} />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-semibold text-text-heading">
                  {isDragging ? 'Drop files here' : 'Upload your documents'}
                </p>
                <p className="text-sm text-text-muted">
                  Drag & drop or click to browse
                </p>
                <p className="text-xs text-text-muted">
                  Accepts: PDF, DOCX, TXT, MD • Maximum: 10MB
                </p>
              </div>
            </CardContent>
          </Card>

          {files.length === 0 ? (
            <Card className="mt-6 border-dashed overflow-hidden relative">
              <div className="absolute inset-0 gradient-primary-subtle opacity-20" />
              <CardContent className="relative flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-primary-2/10 p-8 mb-6">
                  <FileText className="h-16 w-16 text-primary-2/60" />
                </div>
                <p className="text-xl font-semibold mb-2 text-text-heading">No documents uploaded yet</p>
                <p className="text-sm text-text-muted max-w-md">
                  Upload a file above to get started with AI-powered analysis.
                  We&apos;ll extract topics, decisions, actions, and categorize tasks automatically.
                </p>
              </CardContent>
            </Card>
          ) : (
            <motion.div
              className="mt-6 space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {/* Queue Status Summary */}
              {files.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="px-3 py-1.5">
                    Processing: {files.filter(f => f.status === 'processing').length}
                  </Badge>
                  <Badge variant="secondary" className="px-3 py-1.5">
                    Queued: {files.filter(f => f.status === 'pending').length}
                  </Badge>
                  <Badge variant="outline" className="px-3 py-1.5">
                    Complete: {files.filter(f => f.status === 'completed' || f.status === 'review_required').length}
                  </Badge>
                </div>
              )}

              <AnimatePresence>
                {files.map((file, index) => (
                  <motion.div
                    key={file.id}
                    className="space-y-3"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <Card className="overflow-hidden">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 15 }}
                            className="rounded-full bg-primary-2/10 p-2"
                          >
                            <FileText className="h-5 w-5 text-primary-2" />
                          </motion.div>
                          <div>
                            <p className="font-medium text-text-body">{file.name}</p>
                            <p className="text-sm text-text-muted">
                              {formatFileSize(file.size)} • {formatDate(file.uploadedAt)}
                            </p>
                            {file.error && (
                              <motion.p
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="text-sm text-destructive mt-1"
                              >
                                {file.error}
                              </motion.p>
                            )}
                          </div>
                        </div>
                        {getStatusBadge(file.status, file.queuePosition)}
                      </CardContent>
                    </Card>

                    {/* Show SummaryPanel when processing is complete */}
                    <AnimatePresence>
                      {(file.status === 'completed' || file.status === 'review_required') &&
                        file.summary && (
                          <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                          >
                            <SummaryPanel
                              summary={file.summary}
                              confidence={file.confidence || 0}
                              filename={file.name}
                              processingDuration={file.processingDuration || 0}
                              fileId={file.id}
                              filteringDecisions={file.filteringDecisions}
                              allActions={file.allActions}
                              filteringApplied={file.filteringApplied}
                              exclusionReasons={file.exclusionReasons}
                            />
                          </motion.div>
                        )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t-0 bg-bg-layer-2 shadow-2layer-sm">
        <div className="mx-auto max-w-7xl px-6 py-6 text-center text-sm text-text-muted">
          <p>AI Note Synthesiser - Powered by Next.js 15, React 19, and TypeScript</p>
        </div>
      </footer>

      {/* Reflection Panel (keyboard shortcut: Cmd+Shift+R / Ctrl+Shift+R) */}
      <ReflectionPanel
        isOpen={reflectionPanelOpen}
        onOpenChange={setReflectionPanelOpen}
      />
    </div>
  );
}
