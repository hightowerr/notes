'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { DocumentStatusResponse } from '@/lib/schemas/documentStatus';

type SourceDocumentsProps = {
  status: DocumentStatusResponse | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  excludedIds: string[];
  onExcludedChange: (next: string[]) => void;
  disabled?: boolean;
  total?: number;
  onShowMore?: () => void;
};

const STATUS_LABELS: Record<'included' | 'excluded' | 'pending', string> = {
  included: 'Included',
  excluded: 'Excluded',
  pending: 'Pending',
};

const STATUS_CLASSNAMES: Record<'included' | 'excluded' | 'pending', string> = {
  included: 'border-primary/40 text-primary',
  excluded: 'border-border/70 text-muted-foreground bg-muted/40',
  pending: 'border-amber-200 text-amber-900 bg-amber-50',
};

export function SourceDocuments({
  status,
  isLoading = false,
  error,
  onRetry,
  excludedIds,
  onExcludedChange,
  disabled = false,
  total,
  onShowMore,
}: SourceDocumentsProps) {
  const documents = status?.documents ?? [];
  const summary = status?.summary ?? {
    included_count: 0,
    excluded_count: 0,
    pending_count: 0,
    total_task_count: 0,
  };
  const documentIds = useMemo(() => documents.map(doc => doc.id), [documents]);

  const [collapsed, setCollapsed] = useState(() => documents.length > 3);

  useEffect(() => {
    if (documents.length <= 3) {
      setCollapsed(false);
    }
  }, [documents.length]);

  const visibleDocuments = useMemo(() => {
    return collapsed ? documents.slice(0, 3) : documents;
  }, [collapsed, documents]);

  const toggleDocument = (id: string, exclude: boolean) => {
    if (disabled) {
      return;
    }
    const next = exclude ? [...excludedIds, id] : excludedIds.filter(item => item !== id);
    onExcludedChange(next);
  };

  const handleSelectAll = () => {
    if (disabled || documents.length === 0) {
      return;
    }
    onExcludedChange([]);
  };

  const handleClearAll = () => {
    if (disabled || documents.length === 0) {
      return;
    }
    onExcludedChange(documentIds);
  };

  return (
    <Card className="border-border/70 shadow-1layer-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg font-semibold">Source Documents</CardTitle>
          <CardDescription>Documents contributing tasks to your priorities.</CardDescription>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {summary.included_count} included
            </Badge>
            <Badge variant="outline" className="border-border/50 text-muted-foreground">
              {summary.pending_count} pending
            </Badge>
            <Badge variant="outline" className="border-border/50 text-muted-foreground">
              {summary.excluded_count} excluded
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-3"
              onClick={handleSelectAll}
              disabled={disabled || documents.length === 0}
            >
              Select all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-3"
              onClick={handleClearAll}
              disabled={disabled || documents.length === 0}
            >
              Clear all
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-start justify-between gap-2">
              <span>{error}</span>
              {onRetry && (
                <Button size="sm" variant="ghost" onClick={onRetry} className="h-7 px-2">
                  Retry
                </Button>
              )}
            </div>
          </div>
        )}

        {isLoading && !error && documents.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>No documents have contributed tasks yet.</span>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {visibleDocuments.map(doc => (
                <div
                  key={doc.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3',
                    'transition-opacity',
                    doc.status === 'pending' ? 'border-amber-200 bg-amber-50/80' : 'border-border/70',
                    excludedIds.includes(doc.id) ? 'opacity-60' : ''
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={!excludedIds.includes(doc.id)}
                      onCheckedChange={(checked) => toggleDocument(doc.id, checked === false)}
                      aria-label={excludedIds.includes(doc.id) ? 'Include document' : 'Exclude document'}
                      disabled={disabled}
                    />
                    <div className="min-w-0 space-y-1">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="truncate text-sm font-semibold text-foreground" title={doc.name}>
                              {doc.name}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span className="text-sm">{doc.name}</span>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <p className="text-xs text-muted-foreground">{doc.task_count} tasks</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'rounded-full px-3 py-1 text-xs capitalize',
                      STATUS_CLASSNAMES[excludedIds.includes(doc.id) ? 'excluded' : doc.status]
                    )}
                  >
                    {STATUS_LABELS[excludedIds.includes(doc.id) ? 'excluded' : doc.status]}
                  </Badge>
                </div>
              ))}
          </div>

            {documents.length > 3 && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setCollapsed(prev => !prev)}
                >
                  {collapsed ? (
                    <>
                      Show all {documents.length} <ChevronDown className="ml-2 h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Collapse <ChevronUp className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            )}

            {onShowMore && typeof total === 'number' && total > documents.length && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2"
                  onClick={onShowMore}
                  disabled={disabled || isLoading}
                >
                  {isLoading ? (
                    <>
                      Loading more
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    </>
                  ) : (
                    <>
                      Show more ({total - documents.length} remaining)
                    </>
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
