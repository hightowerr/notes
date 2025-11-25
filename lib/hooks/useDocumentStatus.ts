import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  documentStatusResponseSchema,
  type DocumentStatusResponse,
} from '@/lib/schemas/documentStatus';

type UseDocumentStatusOptions = {
  outcomeId: string | null;
  excludedIds?: string[];
  limit?: number;
  offset?: number;
  enabled?: boolean;
  refreshIntervalMs?: number;
};

type UseDocumentStatusResult = {
  data: DocumentStatusResponse | null;
  pendingCount: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useDocumentStatus({
  outcomeId,
  excludedIds = [],
  limit = 50,
  offset = 0,
  enabled = true,
  refreshIntervalMs = 0,
}: UseDocumentStatusOptions): UseDocumentStatusResult {
  const [data, setData] = useState<DocumentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fetchIdRef = useRef(0);

  const normalizedExcludedIds = useMemo(
    () => excludedIds.filter(Boolean),
    [excludedIds]
  );

  const fetchStatus = useCallback(async () => {
    if (!outcomeId || !enabled) {
      fetchIdRef.current += 1;
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const params = new URLSearchParams({ outcome_id: outcomeId });
    if (normalizedExcludedIds.length > 0) {
      params.set('excluded_ids', normalizedExcludedIds.join(','));
    }
    if (limit) {
      params.set('limit', String(limit));
    }
    if (offset) {
      params.set('offset', String(offset));
    }

    setIsLoading(true);
    const fetchId = ++fetchIdRef.current;
    try {
      const response = await fetch(`/api/documents/prioritization-status?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch document status: ${response.statusText}`);
      }

      const payload = await response.json();
      const parsed = documentStatusResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error('Invalid response from document status API');
      }

      if (fetchId !== fetchIdRef.current) {
        return;
      }

      setData(parsed.data);
      setError(null);
    } catch (fetchError) {
      console.error('[useDocumentStatus] Failed to load status', fetchError);
      if (fetchId !== fetchIdRef.current) {
        return;
      }
      setError('Unable to load document status.');
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [outcomeId, enabled, normalizedExcludedIds, limit, offset]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!refreshIntervalMs || refreshIntervalMs < 1000 || !enabled || !outcomeId) {
      return undefined;
    }

    const interval = setInterval(() => {
      void fetchStatus();
    }, refreshIntervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [fetchStatus, refreshIntervalMs, enabled, outcomeId]);

  return {
    data,
    pendingCount: data?.summary.pending_count ?? 0,
    isLoading,
    error,
    refresh: fetchStatus,
  };
}
