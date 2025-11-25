import { useCallback, useEffect, useState } from 'react';

import { logExclusionChange, normalizeExcludedIds } from '@/lib/services/documentExclusionService';

type ExclusionState = {
  excludedIds: string[];
  lastUpdated: number;
};

const STORAGE_PREFIX = 'document-exclusions';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type UseDocumentExclusionsOptions = {
  validDocumentIds?: string[];
};

function readStoredExclusions(outcomeId: string | null, validDocumentIds?: string[]) {
  if (!outcomeId || typeof window === 'undefined') {
    return { ids: [], expired: false };
  }
  const raw = window.localStorage.getItem(`${STORAGE_PREFIX}-${outcomeId}`);
  if (!raw) {
    return { ids: [], expired: false };
  }
  try {
    const parsed = JSON.parse(raw) as ExclusionState;
    const lastUpdated = typeof parsed?.lastUpdated === 'number' ? parsed.lastUpdated : 0;
    const now = Date.now();
    const isExpired = now - lastUpdated > THIRTY_DAYS_MS;
    if (isExpired) {
      window.localStorage.removeItem(`${STORAGE_PREFIX}-${outcomeId}`);
      return { ids: [], expired: true };
    }
    const ids = Array.isArray(parsed?.excludedIds) ? parsed.excludedIds : [];
    const filtered = normalizeExcludedIds(
      ids.filter(id => UUID_PATTERN.test(id)).filter(id =>
        validDocumentIds && validDocumentIds.length > 0 ? validDocumentIds.includes(id) : true
      )
    );
    return { ids: filtered, expired: false };
  } catch {
    return { ids: [], expired: false };
  }
}

export function useDocumentExclusions(
  outcomeId: string | null,
  options: UseDocumentExclusionsOptions = {}
) {
  const { validDocumentIds } = options;
  const [excludedIds, setExcludedIdsState] = useState<string[]>([]);

  const persist = useCallback(
    (next: string[]) => {
      const normalized = normalizeExcludedIds(
        next.filter(id => UUID_PATTERN.test(id)).filter(id =>
          validDocumentIds && validDocumentIds.length > 0 ? validDocumentIds.includes(id) : true
        )
      );
      setExcludedIdsState(normalized);
      if (!outcomeId || typeof window === 'undefined') {
        return;
      }
      const payload: ExclusionState = {
        excludedIds: normalized,
        lastUpdated: Date.now(),
      };
      window.localStorage.setItem(`${STORAGE_PREFIX}-${outcomeId}`, JSON.stringify(payload));
    },
    [outcomeId, validDocumentIds]
  );

  useEffect(() => {
    const { ids, expired } = readStoredExclusions(outcomeId, validDocumentIds);
    setExcludedIdsState(ids);
    if (!expired && outcomeId && typeof window !== 'undefined') {
      const payload: ExclusionState = { excludedIds: ids, lastUpdated: Date.now() };
      window.localStorage.setItem(`${STORAGE_PREFIX}-${outcomeId}`, JSON.stringify(payload));
    }
  }, [outcomeId, validDocumentIds]);

  useEffect(() => {
    if (!validDocumentIds || validDocumentIds.length === 0) {
      return;
    }
    const filtered = excludedIds.filter(id => validDocumentIds.includes(id));
    if (filtered.length !== excludedIds.length) {
      persist(filtered);
    }
  }, [excludedIds, validDocumentIds, persist]);

  const toggleExclusion = useCallback(
    (documentId: string, exclude: boolean) => {
      if (!UUID_PATTERN.test(documentId)) {
        return;
      }
      persist(
        exclude
          ? [...excludedIds, documentId]
          : excludedIds.filter(id => id !== documentId)
      );
      logExclusionChange({
        outcomeId,
        documentId,
        action: exclude ? 'exclude' : 'include',
      });
    },
    [excludedIds, outcomeId, persist]
  );

  const clearExclusions = useCallback(() => {
    persist([]);
    logExclusionChange({ outcomeId, documentId: 'all', action: 'clear' });
  }, [outcomeId, persist]);

  const setExcludedIds = useCallback(
    (ids: string[]) => {
      persist(ids);
    },
    [persist]
  );

  return {
    excludedIds,
    toggleExclusion,
    clearExclusions,
    setExcludedIds,
  };
}
