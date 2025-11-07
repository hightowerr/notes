import type { TaskDependency } from '@/lib/types/agent';

export const DEPENDENCY_OVERRIDE_STORAGE_KEY = 'dependency-overrides';

export type DependencyOverrideEntry = {
  dependencies?: TaskDependency[];
  dependents?: TaskDependency[];
};

export type DependencyOverrideMap = Record<string, DependencyOverrideEntry>;

export type DependencyOverrideStore = Record<string, DependencyOverrideMap>;

export type DependencyOverrideEdge = {
  source_task_id: string;
  target_task_id: string;
  relationship_type: TaskDependency['relationship_type'];
};

export function readDependencyOverrideStore(): DependencyOverrideStore {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(DEPENDENCY_OVERRIDE_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as DependencyOverrideStore;
  } catch {
    return {};
  }
}

export function getOutcomeDependencyOverrides(outcomeId: string | null): DependencyOverrideMap {
  const store = readDependencyOverrideStore();
  const key = outcomeId ?? 'global';
  const entry = store[key];
  if (!entry || typeof entry !== 'object') {
    return {};
  }
  return entry;
}

export function buildDependencyOverrideEdges(
  overrides: DependencyOverrideMap
): DependencyOverrideEdge[] {
  const edges: DependencyOverrideEdge[] = [];
  const seen = new Set<string>();

  Object.entries(overrides).forEach(([targetTaskId, entry]) => {
    const dependencies = entry.dependencies ?? [];
    dependencies.forEach(dependency => {
      const key = `${dependency.source_task_id}->${targetTaskId}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      edges.push({
        source_task_id: dependency.source_task_id,
        target_task_id: targetTaskId,
        relationship_type: dependency.relationship_type,
      });
    });
  });

  return edges;
}
