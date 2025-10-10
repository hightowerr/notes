'use client';

/**
 * Dashboard Page - View all uploaded documents with filtering and sorting
 * Implements T003: User views dashboard with all processed notes
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Package } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { toast } from 'sonner';
import JSZip from 'jszip';

type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'review_required' | 'all';
type SortField = 'date' | 'name' | 'confidence' | 'size';
type SortOrder = 'asc' | 'desc';

interface DocumentSummary {
  topics: string[];
  decisions: string[];
  actions: string[];
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
  status: DocumentStatus;
  confidence?: number;
  processingDuration?: number;
  summary?: DocumentSummary;
}

export default function DashboardPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DocumentStatus>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Fetch documents from API
  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('sort', sortField);
      params.append('order', sortOrder);

      const response = await fetch(`/api/documents?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch documents');
      }

      setDocuments(data.documents);
    } catch (err) {
      console.error('[Dashboard] Error fetching documents:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      toast.success(`${successCount} document${successCount !== 1 ? 's' : ''} exported successfully${failCount > 0 ? ` (${failCount} failed)` : ''}`);

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
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Document Dashboard</h1>
        <ThemeToggle />
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
              disabled={exporting}
              className="flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export JSON'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkExport('markdown')}
              disabled={exporting}
              className="flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export Markdown'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={deselectAll}
              disabled={exporting}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Filters and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Status Filter Tabs */}
        <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as DocumentStatus)}>
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
            onChange={(e) => setSortField(e.target.value as SortField)}
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
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
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

            return (
              <Card key={doc.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start gap-3">
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
                      </CardDescription>
                      <div className="flex gap-2 mt-2">
                        <Badge variant={getStatusBadgeVariant(doc.status)}>{doc.status.replace('_', ' ')}</Badge>
                        {doc.confidence !== undefined && (
                          <Badge variant={getConfidenceBadgeVariant(doc.confidence)}>
                            {Math.round(doc.confidence * 100)}% confidence
                          </Badge>
                        )}
                      </div>
                    </div>
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
                            {doc.summary.actions.map((action, idx) => (
                              <li key={idx} className="text-muted-foreground">
                                {action}
                              </li>
                            ))}
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
                      {doc.status === 'processing' ? 'Processing in progress...' : 'No summary available'}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
