'use client';

/**
 * Dashboard Page - View all uploaded documents with filtering and sorting
 * Implements T003: User views dashboard with all processed notes
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MoreVertical,
  Package,
  RefreshCw,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { MainNav } from '@/components/main-nav';
import { OutcomeDisplay } from '@/app/components/OutcomeDisplay';
import { OutcomeBuilder } from '@/app/components/OutcomeBuilder';
import { toast } from 'sonner';
import JSZip from 'jszip';
import type { Action } from '@/lib/schemas';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'review_required' | 'all';
type SortField = 'date' | 'name' | 'confidence' | 'size';
type SortOrder = 'asc' | 'desc';

interface DocumentSummary {
  topics: string[];
  decisions: string[];
  actions: (string | Action)[]; // Support both old string format and new Action objects
  lno_tasks: {
    leverage: string[];
    neutral: string[];
    overhead: string[];
  };
}

interface Document {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
  updatedAt?: string | null;
  status: DocumentStatus;
  source?: 'manual_upload' | 'google_drive' | 'text_input';
  syncEnabled?: boolean;
  externalId?: string | null;
  confidence?: number;
  processingDuration?: number;
  summary?: DocumentSummary;
}

const SOURCE_LABELS: Record<NonNullable<Document['source']>, string> = {
  manual_upload: 'Uploaded',
  google_drive: 'Google Drive',
  text_input: 'Text Input',
};

function GoogleDriveGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-hidden="true" {...props}>
      <path fill="#0F9D58" d="M20.79 7.04h7.52l12.9 21.96-3.76 6.5z" />
      <path fill="#4285F4" d="M12.55 40.96h21.54l3.86-6.54H16.41z" />
      <path fill="#F4B400" d="M7.79 29l8.62-14.9 3.91 6.6-8.7 14.9z" />
    </svg>
  );
}

function SourceBadge({
  source,
  syncEnabled,
  status,
}: {
  source?: Document['source'];
  syncEnabled?: boolean;
  status?: DocumentStatus;
}) {
  if (!source) {
    return null;
  }

  const baseClasses = 'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-xs font-medium';

  if (source === 'google_drive') {
    const isSynced = syncEnabled && status === 'completed';
    const isSyncing = syncEnabled && status && status !== 'completed';

    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${baseClasses} border-emerald-200 bg-emerald-50 text-emerald-700`}>
          <GoogleDriveGlyph className="h-3.5 w-3.5" />
          {SOURCE_LABELS.google_drive}
        </span>
        {syncEnabled ? (
          <span
            className={[
              'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide',
              isSynced
                ? 'border-emerald-300 bg-emerald-600/10 text-emerald-700'
                : 'border-amber-300 bg-amber-100/80 text-amber-800',
            ].join(' ')}
          >
            {isSynced ? (
              <CheckCircle2 className="h-3 w-3" aria-hidden />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            )}
            {isSynced ? 'Synced' : 'Syncing'}
          </span>
        ) : null}
      </div>
    );
  }

  const icon = source === 'text_input' ? <FileText className="h-3 w-3" aria-hidden /> : <Upload className="h-3 w-3" aria-hidden />;

  return (
    <span className={`${baseClasses} border-muted-foreground/20 bg-muted/60 text-muted-foreground`}>
      {icon}
      {SOURCE_LABELS[source]}
    </span>
  );
}

const POLL_INTERVAL_MS = 8000;

export default function DashboardPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DocumentStatus>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);
  const [editingOutcome, setEditingOutcome] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch documents from API
  const fetchDocuments = useCallback(
    async ({
      showLoading = true,
      status = statusFilter,
      sort = sortField,
      order = sortOrder,
    }: {
      showLoading?: boolean;
      status?: DocumentStatus;
      sort?: SortField;
      order?: SortOrder;
    } = {}) => {
      if (showLoading) {
        setLoading(true);
        setError(null);
      } else {
        setRefreshing(true);
      }

      try {
        const params = new URLSearchParams();
        if (status !== 'all') {
          params.append('status', status);
        }
        params.append('sort', sort);
        params.append('order', order);

        const response = await fetch(`/api/documents?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch documents');
        }

        setDocuments(data.documents);
        setError(null);
      } catch (err) {
        console.error('[Dashboard] Error fetching documents:', err);
        const message = err instanceof Error ? err.message : 'An error occurred';

        if (showLoading) {
          setError(message);
        } else {
          toast.error(`Unable to refresh documents: ${message}`);
        }
      } finally {
        if (showLoading) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [sortField, sortOrder, statusFilter]
  );

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background polling to keep list in sync
  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchDocuments({ showLoading: false });
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchDocuments]);

  const handleStatusChange = (value: DocumentStatus) => {
    setStatusFilter(value);
    fetchDocuments({ status: value });
  };

  const handleSortFieldChange = (value: SortField) => {
    setSortField(value);
    fetchDocuments({ sort: value });
  };

  const handleSortOrderToggle = () => {
    const nextOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(nextOrder);
    fetchDocuments({ order: nextOrder });
  };

  const removeDocumentsFromState = (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }

    const idSet = new Set(ids);

    setDocuments(prev => prev.filter(doc => !idSet.has(doc.id)));

    setSelectedDocuments(prev => {
      if (prev.size === 0) {
        return prev;
      }
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });

    setExpandedCards(prev => {
      if (prev.size === 0) {
        return prev;
      }
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });

    setReprocessingIds(prev => {
      if (prev.size === 0) {
        return prev;
      }
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  };

  const handleDeleteDocuments = async (ids: string[]) => {
    if (ids.length === 0) {
      toast.error('Please select at least one document to delete');
      return;
    }

    const docsToDelete = documents.filter(doc => ids.includes(doc.id));
    const nameLookup = new Map(docsToDelete.map(doc => [doc.id, doc.name]));

    const label =
      docsToDelete.length === 1
        ? `"${docsToDelete[0]?.name ?? 'this document'}"`
        : `${docsToDelete.length} documents`;

    const confirmed = window.confirm(`Delete ${label}? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeleting(true);

    try {
      const results = await Promise.allSettled(
        ids.map(async (docId) => {
          const response = await fetch(`/api/documents/${docId}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            if (response.status === 404) {
              return docId;
            }

            let message = 'Failed to delete document';
            try {
              const data = await response.json();
              if (data?.error) {
                message = data.error;
              }
            } catch {
              // Ignore JSON parsing errors
            }

            throw new Error(message);
          }

          return docId;
        })
      );

      const deletedIds: string[] = [];
      const failedMessages: string[] = [];

      results.forEach((result, index) => {
        const docId = ids[index];
        const docName = nameLookup.get(docId) ?? 'Document';

        if (result.status === 'fulfilled') {
          deletedIds.push(result.value ?? docId);
        } else {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          failedMessages.push(`${docName}: ${reason}`);
        }
      });

      if (deletedIds.length > 0) {
        removeDocumentsFromState(deletedIds);
        toast.success(
          deletedIds.length === 1
            ? 'Document deleted successfully'
            : `${deletedIds.length} documents deleted successfully`
        );
        await fetchDocuments({ showLoading: false });
      }

      if (failedMessages.length > 0) {
        toast.error(failedMessages.join(' '));
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleReprocessDocument = async (doc: Document) => {
    if (!doc) {
      return;
    }

    if (doc.source === 'text_input') {
      toast.error('Text input documents cannot be reprocessed');
      return;
    }

    if (reprocessingIds.has(doc.id)) {
      toast.error('Document is already being processed. Please wait for the current operation to finish.');
      return;
    }

    if (doc.status === 'processing') {
      toast.error('Document is already being processed. Please wait for the current operation to finish.');
      return;
    }

    if (doc.status === 'pending') {
      toast.error('Document is already queued for processing. Please wait for the current operation to finish.');
      return;
    }

    const previousStatus = doc.status;

    setReprocessingIds(prev => {
      const next = new Set(prev);
      next.add(doc.id);
      return next;
    });

    setDocuments(prev =>
      prev.map(existing =>
        existing.id === doc.id
          ? { ...existing, status: 'processing' }
          : existing
      )
    );

    try {
      const response = await fetch(`/api/documents/${doc.id}/reprocess`, {
        method: 'POST',
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok || data?.success !== true) {
        const message = typeof data?.error === 'string' ? data.error : 'Failed to reprocess document';
        toast.error(message);

        setDocuments(prev =>
          prev.map(existing =>
            existing.id === doc.id
              ? { ...existing, status: previousStatus }
              : existing
          )
        );
        return;
      }

      const successMessage =
        typeof data?.message === 'string' && data.message.length > 0
          ? data.message
          : 'Document reprocessed successfully';
      toast.success(successMessage);
      await fetchDocuments({ showLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reprocess document';
      toast.error(message);
      setDocuments(prev =>
        prev.map(existing =>
          existing.id === doc.id
            ? { ...existing, status: previousStatus }
            : existing
        )
      );
    } finally {
      setReprocessingIds(prev => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  };

  // Clear selection when filters change (prevents selecting documents that are no longer visible)
  useEffect(() => {
    setSelectedDocuments(new Set());
  }, [statusFilter, sortField, sortOrder]);

  // Toggle card expansion
  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCards(newExpanded);
  };

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeUpdated = (dateString: string): string => {
    const updated = new Date(dateString);
    const timestamp = updated.getTime();
    if (!Number.isFinite(timestamp)) {
      return 'recently';
    }

    const diffMs = Date.now() - timestamp;
    if (diffMs < 0) {
      return 'just now';
    }

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) {
      return 'just now';
    }

    if (diffMs < hour) {
      const minutes = Math.round(diffMs / minute);
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }

    if (diffMs < day) {
      const hours = Math.round(diffMs / hour);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }

    const days = Math.round(diffMs / day);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  // Get status badge variant
  const getStatusBadgeVariant = (status: DocumentStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'review_required':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  // Get confidence badge variant
  const getConfidenceBadgeVariant = (confidence: number): 'default' | 'secondary' | 'destructive' => {
    if (confidence >= 0.8) return 'default';
    if (confidence >= 0.5) return 'secondary';
    return 'destructive';
  };

  // Toggle document selection
  const toggleDocumentSelection = (docId: string) => {
    const newSelection = new Set(selectedDocuments);
    if (newSelection.has(docId)) {
      newSelection.delete(docId);
    } else {
      newSelection.add(docId);
    }
    setSelectedDocuments(newSelection);
  };

  // Select all visible documents
  const selectAll = () => {
    const completedDocs = documents.filter(d => d.status === 'completed' || d.status === 'review_required');
    setSelectedDocuments(new Set(completedDocs.map(d => d.id)));
  };

  // Deselect all documents
  const deselectAll = () => {
    setSelectedDocuments(new Set());
  };

  // Bulk export documents
  const handleBulkExport = async (format: 'json' | 'markdown') => {
    if (selectedDocuments.size === 0) {
      toast.error('Please select at least one document to export');
      return;
    }

    setExporting(true);

    try {
      const zip = new JSZip();
      let successCount = 0;
      let failCount = 0;

      // Fetch each selected document's export
      for (const docId of selectedDocuments) {
        try {
          const doc = documents.find(d => d.id === docId);
          if (!doc) continue;

          // Validate document is ready for export
          if (doc.status !== 'completed' && doc.status !== 'review_required') {
            console.warn(`[Dashboard] Skipping ${doc.name}: status=${doc.status}`);
            failCount++;
            continue;
          }

          if (!doc.summary) {
            console.warn(`[Dashboard] Skipping ${doc.name}: no summary available`);
            failCount++;
            continue;
          }

          const response = await fetch(`/api/export/${docId}?format=${format}`);

          if (!response.ok) {
            console.error(`[Dashboard] Failed to export ${doc.name}:`, await response.text());
            failCount++;
            continue;
          }

          const content = await response.text();
          const sanitizedFilename = doc.name.replace(/\.[^/.]+$/, '');
          const extension = format === 'json' ? 'json' : 'md';
          zip.file(`${sanitizedFilename}-summary.${extension}`, content);
          successCount++;
        } catch (error) {
          console.error('[Dashboard] Error exporting document:', error);
          failCount++;
        }
      }

      if (successCount === 0) {
        throw new Error('Failed to export any documents');
      }

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `summaries-export-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // Show appropriate success message based on results
      if (failCount > 0) {
        toast.success(`${successCount} document${successCount !== 1 ? 's' : ''} exported successfully (${failCount} skipped - not ready for export)`);
      } else {
        toast.success(`${successCount} document${successCount !== 1 ? 's' : ''} exported successfully`);
      }

      // Clear selection after successful export
      deselectAll();
    } catch (error) {
      console.error('[Dashboard] Bulk export error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to export documents');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-layer-1">
      <MainNav
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOutcomeModalOpen(true)}
              className="gap-2"
            >
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Set Outcome</span>
            </Button>
            <ThemeToggle />
          </>
        }
      />

      <div className="container mx-auto px-4 py-8">
      {/* Outcome Display Banner */}
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
          console.log('[Dashboard] Outcome saved successfully');
          setEditingOutcome(null);
        }}
      />

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Document Dashboard</h1>
      </div>

      {/* Bulk Export Controls */}
      {selectedDocuments.size > 0 && (
        <div className="mb-4 p-4 bg-muted rounded-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-primary" />
            <span className="font-medium">{selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkExport('json')}
              disabled={exporting || deleting}
              className="flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export JSON'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkExport('markdown')}
              disabled={exporting || deleting}
              className="flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export Markdown'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDeleteDocuments(Array.from(selectedDocuments))}
              disabled={deleting || exporting}
              className="flex items-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={deselectAll}
              disabled={exporting || deleting}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Filters and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Status Filter Tabs */}
        <Tabs value={statusFilter} onValueChange={(value) => handleStatusChange(value as DocumentStatus)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="processing">Processing</TabsTrigger>
            <TabsTrigger value="review_required">Review Required</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Sort Controls */}
        <div className="flex gap-2">
          <select
            value={sortField}
            onChange={(e) => handleSortFieldChange(e.target.value as SortField)}
            className="px-3 py-2 border rounded-md bg-background"
            aria-label="Sort documents by"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="confidence">Sort by Confidence</option>
            <option value="size">Sort by Size</option>
          </select>

          <Button
            variant="outline"
            size="icon"
            onClick={handleSortOrderToggle}
            aria-label={`Sort order: ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>

        {/* Select All Button */}
        {documents.filter(d => d.status === 'completed' || d.status === 'review_required').length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={selectedDocuments.size === 0 ? selectAll : deselectAll}
            className="ml-auto"
          >
            {selectedDocuments.size === 0 ? 'Select All' : 'Deselect All'}
          </Button>
        )}
      </div>

      {/* Document Count */}
      <p className="text-sm text-muted-foreground mb-4" aria-live="polite">
        Showing {documents.length} document{documents.length !== 1 ? 's' : ''}
        {refreshing && (
          <span className="ml-2 text-xs text-muted-foreground">Updating...</span>
        )}
      </p>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full mt-2" />
                <Skeleton className="h-4 w-2/3 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Alert variant="destructive">
          <p className="font-semibold">Error loading documents</p>
          <p className="text-sm mt-1">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchDocuments} className="mt-2">
            Retry
          </Button>
        </Alert>
      )}

      {/* Empty State */}
      {!loading && !error && documents.length === 0 && (
        <Alert>
          <p className="font-semibold">No documents found</p>
          <p className="text-sm mt-1">
            {statusFilter === 'all'
              ? 'Upload your first document to get started'
              : `No documents with status: ${statusFilter}`}
          </p>
          <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')} className="mt-2">
            Upload Document
          </Button>
        </Alert>
      )}

      {/* Document Grid */}
      {!loading && !error && documents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const isExpanded = expandedCards.has(doc.id);
            const updatedDisplay = (() => {
              if (!doc.updatedAt) {
                return null;
              }
              const updatedMs = new Date(doc.updatedAt).getTime();
              const uploadedMs = new Date(doc.uploadedAt).getTime();

              if (!Number.isFinite(updatedMs) || !Number.isFinite(uploadedMs)) {
                return null;
              }

              if (Math.abs(updatedMs - uploadedMs) <= 60_000) {
                return null;
              }

              return formatRelativeUpdated(doc.updatedAt);
            })();

            const isProcessingState = doc.status === 'processing' || doc.status === 'pending';
            const isReprocessing = reprocessingIds.has(doc.id);
            const showProcessingOverlay = isProcessingState || isReprocessing;
            const overlayLabel = isReprocessing
              ? doc.source === 'google_drive'
                ? 'Downloading latest from Drive...'
                : 'Reprocessing...'
              : doc.status === 'pending'
              ? 'Waiting to process...'
              : 'Processing...';
            const disableReprocess =
              doc.source === 'text_input' || isProcessingState || isReprocessing;

            return (
              <div key={doc.id} className="relative">
                <Card className="flex flex-col">
                  <CardHeader>
                    <div className="flex w-full items-start gap-3">
                      {/* Checkbox for bulk export (only for completed documents) */}
                      {(doc.status === 'completed' || doc.status === 'review_required') && doc.summary && (
                        <Checkbox
                          checked={selectedDocuments.has(doc.id)}
                          onCheckedChange={() => toggleDocumentSelection(doc.id)}
                          aria-label={`Select ${doc.name} for export`}
                          className="mt-1"
                        />
                      )}
                      <div className="flex-1">
                        <CardTitle className="text-lg truncate" title={doc.name}>
                          {doc.name}
                        </CardTitle>
                        <CardDescription>
                          {formatSize(doc.size)} • {formatDate(doc.uploadedAt)}
                          {updatedDisplay ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              Updated {updatedDisplay}
                            </span>
                          ) : null}
                        </CardDescription>
                        {doc.source ? (
                          <div className="mt-2">
                            <SourceBadge source={doc.source} syncEnabled={doc.syncEnabled} status={doc.status} />
                          </div>
                        ) : null}
                        <div className="flex gap-2 mt-2">
                          <Badge variant={getStatusBadgeVariant(doc.status)}>{doc.status.replace('_', ' ')}</Badge>
                          {doc.confidence !== undefined && (
                            <Badge variant={getConfidenceBadgeVariant(doc.confidence)}>
                              {Math.round(doc.confidence * 100)}% confidence
                            </Badge>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={deleting}
                            aria-label={`Actions for ${doc.name}`}
                            className="ml-auto text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => handleReprocessDocument(doc)}
                            disabled={disableReprocess}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Reprocess
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => handleDeleteDocuments([doc.id])}
                            disabled={deleting}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1">
                  {/* Quick Preview (first 3 topics) */}
                  {doc.summary && !isExpanded && (
                    <div className="mb-2">
                      <p className="text-sm font-semibold mb-1">Topics:</p>
                      <div className="flex flex-wrap gap-1">
                        {doc.summary.topics.slice(0, 3).map((topic, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {topic}
                          </Badge>
                        ))}
                        {doc.summary.topics.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{doc.summary.topics.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Full Summary (when expanded) */}
                  {doc.summary && isExpanded && (
                    <div className="space-y-3">
                      {/* Topics */}
                      <div>
                        <p className="text-sm font-semibold mb-1">Topics ({doc.summary.topics.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {doc.summary.topics.map((topic, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      {/* Decisions */}
                      <div>
                        <p className="text-sm font-semibold mb-1">Decisions ({doc.summary.decisions.length})</p>
                        {doc.summary.decisions.length > 0 ? (
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {doc.summary.decisions.map((decision, idx) => (
                              <li key={idx} className="text-muted-foreground">
                                {decision}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">None identified</p>
                        )}
                      </div>

                      <Separator />

                      {/* Actions */}
                      <div>
                        <p className="text-sm font-semibold mb-1">Actions ({doc.summary.actions.length})</p>
                        {doc.summary.actions.length > 0 ? (
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {doc.summary.actions.map((action, idx) => {
                              // Handle both old string format and new Action object format
                              const actionText = typeof action === 'string' ? action : action?.text || '';
                              return (
                                <li key={idx} className="text-muted-foreground">
                                  {actionText}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">None identified</p>
                        )}
                      </div>

                      <Separator />

                      {/* LNO Tasks */}
                      <div>
                        <p className="text-sm font-semibold mb-2">LNO Task Classification</p>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs font-medium text-green-600 dark:text-green-400">
                              Leverage ({doc.summary.lno_tasks.leverage.length})
                            </p>
                            {doc.summary.lno_tasks.leverage.length > 0 ? (
                              <ul className="list-disc list-inside text-xs space-y-0.5 ml-2">
                                {doc.summary.lno_tasks.leverage.map((task, idx) => (
                                  <li key={idx} className="text-muted-foreground">
                                    {task}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground ml-2">None</p>
                            )}
                          </div>

                          <div>
                            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                              Neutral ({doc.summary.lno_tasks.neutral.length})
                            </p>
                            {doc.summary.lno_tasks.neutral.length > 0 ? (
                              <ul className="list-disc list-inside text-xs space-y-0.5 ml-2">
                                {doc.summary.lno_tasks.neutral.map((task, idx) => (
                                  <li key={idx} className="text-muted-foreground">
                                    {task}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground ml-2">None</p>
                            )}
                          </div>

                          <div>
                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
                              Overhead ({doc.summary.lno_tasks.overhead.length})
                            </p>
                            {doc.summary.lno_tasks.overhead.length > 0 ? (
                              <ul className="list-disc list-inside text-xs space-y-0.5 ml-2">
                                {doc.summary.lno_tasks.overhead.map((task, idx) => (
                                  <li key={idx} className="text-muted-foreground">
                                    {task}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground ml-2">None</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {doc.processingDuration !== undefined && (
                        <>
                          <Separator />
                          <p className="text-xs text-muted-foreground">
                            Processing time: {(doc.processingDuration / 1000).toFixed(2)}s
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* No Summary (still processing or failed) */}
                  {!doc.summary && (
                    <p className="text-sm text-muted-foreground">
                      {doc.status === 'processing'
                        ? 'Processing in progress...'
                        : doc.status === 'pending'
                        ? 'Waiting to process...'
                        : 'No summary available'}
                    </p>
                  )}

                  {/* Expand/Collapse Button */}
                  {doc.summary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(doc.id)}
                      className="w-full mt-4"
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} document details for ${doc.name}`}
                    >
                      {isExpanded ? 'Collapse ▲' : 'Expand ▼'}
                    </Button>
                  )}
                  </CardContent>
                </Card>
                {showProcessingOverlay ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/75 backdrop-blur pointer-events-auto">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{overlayLabel}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
  );
}
