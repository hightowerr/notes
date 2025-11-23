import { performance } from 'node:perf_hooks';

// Migration note: This file remains for legacy reflection re-ranking only.
// New runs should rely on the unified prioritization loop in
// lib/services/prioritizationLoop.ts guarded by USE_UNIFIED_PRIORITIZATION.

import { supabase } from '@/lib/supabase';
import { calculateCosineSimilarity } from '@/lib/services/aiSummarizer';
import { calculateRecencyWeight } from '@/lib/services/reflectionService';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';
import type { AdjustedPlan } from '@/lib/types/adjustment';

type ReflectionRow = {
  id: string;
  text: string;
  created_at: string;
  is_active_for_prioritization: boolean | null;
};

type TaskScore = {
  taskId: string;
  baseConfidence: number;
  adjustedConfidence: number;
  boostReason?: string;
  penaltyReason?: string;
};

type ReflectionVector = {
  id: string;
  text: string;
  createdAt: string;
  weight: number;
  vector: number[];
};

const FALLBACK_CONFIDENCE = 0.5;
const BOOST_THRESHOLD = 0.7;
const PENALTY_THRESHOLD = 0.3;
const CONFIDENCE_DELTA = 0.3;
const MAX_REASON_LENGTH = 200;

function normaliseReason(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 'Context adjustment applied';
  }
  if (trimmed.length <= MAX_REASON_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_REASON_LENGTH - 1)}…`;
}

function createContextReason(reflectionText: string, direction: 'boosted' | 'demoted'): string {
  const compact = reflectionText.replace(/\s+/g, ' ').trim();
  const stripped = compact.replace(/["']/g, '');
  const snippet = stripped.length > 0 ? stripped : 'active reflection';
  const truncated = snippet.length > 96 ? `${snippet.slice(0, 95)}…` : snippet;
  const contextLabel = stripped.length > 0 ? `'${truncated}' context` : 'active reflection context';
  const verb = direction === 'boosted' ? 'Matches' : 'Contradicts';
  return normaliseReason(`${verb} ${contextLabel}`);
}

function buildNormalizedVector(source: string): number[] {
  const vector = new Array<number>(26).fill(0);
  const lower = source.toLowerCase();

  for (const char of lower) {
    const code = char.charCodeAt(0);
    const index = code - 97;
    if (index >= 0 && index < 26) {
      vector[index] += 1;
    }
  }

  let magnitude = 0;
  for (const value of vector) {
    magnitude += value * value;
  }

  if (magnitude === 0) {
    return vector;
  }

  const normaliser = Math.sqrt(magnitude);
  return vector.map(value => value / normaliser);
}

type ReflectionMetadata = {
  id: string;
  text: string;
  recency_weight: number;
  created_at: string;
};

function buildAdjustedPlan(
  orderedTaskIds: string[],
  confidenceScores: Record<string, number>,
  tasks: TaskScore[],
  durationMs: number,
  reflections: ReflectionMetadata[]
): AdjustedPlan {
  const baselinePositions = new Map<string, number>();
  orderedTaskIds.forEach((taskId, index) => baselinePositions.set(taskId, index + 1));

  const sortedTasks = [...tasks].sort((a, b) => {
    if (b.adjustedConfidence === a.adjustedConfidence) {
      const baselineA = baselinePositions.get(a.taskId) ?? Number.MAX_SAFE_INTEGER;
      const baselineB = baselinePositions.get(b.taskId) ?? Number.MAX_SAFE_INTEGER;
      return baselineA - baselineB;
    }
    return b.adjustedConfidence - a.adjustedConfidence;
  });

  const newOrder = sortedTasks.map(task => task.taskId);

  const moved = [];
  for (let index = 0; index < newOrder.length; index++) {
    const taskId = newOrder[index];
    const previousRank = baselinePositions.get(taskId);
    if (!previousRank) {
      continue;
    }

    const currentRank = index + 1;
    if (currentRank === previousRank) {
      continue;
    }

    const direction = currentRank < previousRank ? 'boosted' : 'demoted';
    const source = direction === 'boosted'
      ? tasks.find(task => task.taskId === taskId)?.boostReason
      : tasks.find(task => task.taskId === taskId)?.penaltyReason;

    const reason = source ? normaliseReason(source) : createContextReason('active reflection', direction);

    moved.push({
      task_id: taskId,
      from: previousRank,
      to: currentRank,
      reason,
    });
  }

  return {
    ordered_task_ids: newOrder,
    confidence_scores: sortedTasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.taskId] = Number.isFinite(task.adjustedConfidence)
        ? Number(Math.max(0, Math.min(1, task.adjustedConfidence)).toFixed(3))
        : Math.max(0, Math.min(1, confidenceScores[task.taskId] ?? FALLBACK_CONFIDENCE));
      return acc;
    }, { ...confidenceScores }),
    diff: {
      moved,
      filtered: [],
    },
    adjustment_metadata: {
      reflections,
      tasks_moved: moved.length,
      tasks_filtered: 0,
      duration_ms: Math.max(0, Math.round(durationMs)),
    },
  };
}

/**
 * @deprecated Use the unified prioritization flow (prioritizationLoop + hybrid evaluator)
 * for reflection handling. This legacy character-frequency re-ranking is retained only
 * for rollback paths and the manual adjustment endpoint while the rollout completes.
 */
export async function buildAdjustedPlanFromReflections(options: {
  userId: string;
  baselinePlan: PrioritizedTaskPlan;
  activeReflectionIds: string[];
}): Promise<{ adjustedPlan: AdjustedPlan; rankingMs: number }> {
  const rankingStart = performance.now();
  const { userId, baselinePlan, activeReflectionIds } = options;

  const uniqueReflectionIds = Array.from(new Set(activeReflectionIds)).filter(id => typeof id === 'string' && id.length > 0);
  const orderedTaskIds = Array.isArray(baselinePlan.ordered_task_ids)
    ? baselinePlan.ordered_task_ids.filter(id => typeof id === 'string' && id.length > 0)
    : [];

  if (orderedTaskIds.length === 0) {
    throw new Error('Baseline plan is missing ordered_task_ids');
  }

  if (uniqueReflectionIds.length === 0) {
    const durationMs = performance.now() - rankingStart;
    return {
      adjustedPlan: buildAdjustedPlan(
        orderedTaskIds,
        baselinePlan.confidence_scores ?? {},
        orderedTaskIds.map(taskId => ({
          taskId,
          baseConfidence: baselinePlan.confidence_scores?.[taskId] ?? FALLBACK_CONFIDENCE,
          adjustedConfidence: baselinePlan.confidence_scores?.[taskId] ?? FALLBACK_CONFIDENCE,
        })),
        durationMs,
        [] // No reflections
      ),
      rankingMs: durationMs,
    };
  }

  const [{ data: reflectionsData, error: reflectionsError }, { data: tasksData, error: tasksError }] =
    await Promise.all([
      supabase
        .from('reflections')
        .select('id, text, created_at, is_active_for_prioritization')
        .eq('user_id', userId)
        .in('id', uniqueReflectionIds),
      supabase
        .from('task_embeddings')
        .select('task_id, task_text')
        .in('task_id', orderedTaskIds),
    ]);

  if (reflectionsError) {
    throw new Error(`Failed to load active reflections: ${reflectionsError.message}`);
  }

  if (tasksError) {
    throw new Error(`Failed to load task metadata: ${tasksError.message}`);
  }

  const reflections = (reflectionsData ?? []).filter(
    (row): row is ReflectionRow =>
      row !== null &&
      typeof row.id === 'string' &&
      typeof row.text === 'string' &&
      typeof row.created_at === 'string' &&
      (row.is_active_for_prioritization === null || typeof row.is_active_for_prioritization === 'boolean')
  );

  const usableReflections = reflections.filter(
    (reflection) => reflection.is_active_for_prioritization !== false && reflection.text.trim().length > 0
  );

  if (usableReflections.length === 0) {
    const durationMs = performance.now() - rankingStart;
    return {
      adjustedPlan: buildAdjustedPlan(
        orderedTaskIds,
        baselinePlan.confidence_scores ?? {},
        orderedTaskIds.map(taskId => ({
          taskId,
          baseConfidence: baselinePlan.confidence_scores?.[taskId] ?? FALLBACK_CONFIDENCE,
          adjustedConfidence: baselinePlan.confidence_scores?.[taskId] ?? FALLBACK_CONFIDENCE,
        })),
        durationMs,
        [] // No usable reflections
      ),
      rankingMs: durationMs,
    };
  }

  const taskTextMap = new Map<string, string>();
  for (const row of tasksData ?? []) {
    if (row && typeof row.task_id === 'string') {
      const text =
        typeof row.task_text === 'string' && row.task_text.trim().length > 0
          ? row.task_text
          : row.task_id;
      taskTextMap.set(row.task_id, text);
    }
  }

  const reflectionVectors: ReflectionVector[] = usableReflections.map((reflection) => {
    const weight = calculateRecencyWeight(new Date(reflection.created_at));
    return {
      id: reflection.id,
      text: reflection.text,
      createdAt: reflection.created_at,
      weight,
      vector: buildNormalizedVector(reflection.text),
    };
  });

  const taskScores: TaskScore[] = orderedTaskIds.map((taskId) => ({
    taskId,
    baseConfidence: baselinePlan.confidence_scores?.[taskId] ?? FALLBACK_CONFIDENCE,
    adjustedConfidence: baselinePlan.confidence_scores?.[taskId] ?? FALLBACK_CONFIDENCE,
  }));

  for (const task of taskScores) {
    const taskText = taskTextMap.get(task.taskId) ?? task.taskId;
    const taskVector = buildNormalizedVector(taskText);

    for (const reflection of reflectionVectors) {
      if (reflection.vector.length !== taskVector.length) {
        continue;
      }

      const similarity = calculateCosineSimilarity(taskVector, reflection.vector);
      if (!Number.isFinite(similarity)) {
        continue;
      }

      const weightedSimilarity = similarity * reflection.weight;

      if (weightedSimilarity > BOOST_THRESHOLD) {
        const delta = (Math.min(1, weightedSimilarity) - BOOST_THRESHOLD) * CONFIDENCE_DELTA;
        task.adjustedConfidence += delta;
        if (!task.boostReason || delta > 0) {
          task.boostReason = createContextReason(reflection.text, 'boosted');
        }
      } else if (weightedSimilarity < PENALTY_THRESHOLD) {
        const delta = (PENALTY_THRESHOLD - Math.max(0, weightedSimilarity)) * CONFIDENCE_DELTA;
        task.adjustedConfidence -= delta;
        if (!task.penaltyReason || delta > 0) {
          task.penaltyReason = createContextReason(reflection.text, 'demoted');
        }
      }
    }
  }

  const durationMs = performance.now() - rankingStart;

  // Map reflection vectors to metadata format for T009
  const reflectionMetadata: ReflectionMetadata[] = reflectionVectors.map(rv => ({
    id: rv.id,
    text: rv.text,
    recency_weight: Number(Math.max(0, Math.min(1, rv.weight)).toFixed(3)),
    created_at: rv.createdAt,
  }));

  const adjustedPlan = buildAdjustedPlan(
    orderedTaskIds,
    baselinePlan.confidence_scores ?? {},
    taskScores,
    durationMs,
    reflectionMetadata
  );

  return {
    adjustedPlan,
    rankingMs: durationMs,
  };
}
