const EXCLUSION_LOG_PREFIX = '[DocumentExclusion]';

export function logExclusionChange(params: {
  outcomeId: string | null;
  documentId: string;
  action: 'exclude' | 'include' | 'clear';
}) {
  const { outcomeId, documentId, action } = params;
  console.info(
    `${EXCLUSION_LOG_PREFIX} ${action === 'clear' ? 'Cleared exclusions' : `Document ${documentId} ${action}d`} for outcome ${outcomeId ?? 'unknown'}`,
  );
}

export function normalizeExcludedIds(ids: string[]): string[] {
  const unique = new Set(ids.filter(Boolean));
  return Array.from(unique);
}

export function filterDeletedIds(excludedIds: string[], validIds: string[]): string[] {
  const validSet = new Set(validIds);
  return excludedIds.filter(id => validSet.has(id));
}
