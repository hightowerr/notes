import { performance } from 'node:perf_hooks';

import { supabase } from '@/lib/supabase';
import { calculateRecencyWeight } from '@/lib/services/reflectionService';
import type { PrioritizedTaskPlan } from '@/lib/types/agent';
import type { AdjustedPlan } from '@/lib/types/adjustment';

type ReflectionRow = {
  id: string;
  text: string;
  created_at: string;
  is_active_for_prioritization: boolean | null;
};

type ReflectionMetadata = {
  id: string;
  text: string;
  recency_weight: number;
  created_at: string;
};

type TaskScore = {
  taskId: string;
  baseConfidence: number;
  adjustedConfidence: number;
  boostReason?: string;
};

const FALLBACK_CONFIDENCE = 0.5;
const BOOST_SCALE = 0.25;
const MIN_MATCH_THRESHOLD = 0.1;
const MAX_REASON_LENGTH = 200;
const WORD_REGEX = /[A-Za-z0-9]+/g;

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(WORD_REGEX) ?? []).filter(Boolean);
}

function computeSimilarity(taskTokens: string[], reflectionTokens: string[]): number {
  if (taskTokens.length === 0 || reflectionTokens.length === 0) {
    return 0;
  }

  const taskSet = new Set(taskTokens);
  let matches = 0;

  for (const token of reflectionTokens) {
    if (taskSet.has(token)) {
      matches += 1;
    }
  }

  return matches / reflectionTokens.length;
}

function clampConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function buildReason(reflectionText: string): string {
  const compact = reflectionText.replace(/\s+/g, ' ').trim().replace(/["']/g, '');
  if (compact.length === 0) {
    return 'Adjusted by active reflection context';
  }

  const truncated = compact.length > MAX_REASON_LENGTH
    ? `${compact.slice(0, MAX_REASON_LENGTH - 1)}…`
    : compact;

  return `Matches '${truncated}' context`;
}

function buildAdjustedPlan(
  orderedTaskIds: string[],
  confidenceScores: Record<string, number>,
  tasks: TaskScore[],
  durationMs: number,
  reflections: ReflectionMetadata[]
): AdjustedPlan {
  const baselinePositions = new Map<string, number>();
  orderedTaskIds.forEach((taskId, index) => baselinePositions.set(taskId, index + 1));

  const sortedTasks = [...tasks].sort((left, right) => {
    if (right.adjustedConfidence === left.adjustedConfidence) {
      const baselineLeft = baselinePositions.get(left.taskId) ?? Number.MAX_SAFE_INTEGER;
      const baselineRight = baselinePositions.get(right.taskId) ?? Number.MAX_SAFE_INTEGER;
      return baselineLeft - baselineRight;
    }

    return right.adjustedConfidence - left.adjustedConfidence;
  });

  const newOrder = sortedTasks.map(task => task.taskId);
  const moved = [];

  for (let index = 0; index < newOrder.length; index += 1) {
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
    const task = sortedTasks.find(candidate => candidate.taskId === taskId);
    const reason = task?.boostReason ? task.boostReason : buildReason('active reflection');

    moved.push({
      task_id: taskId,
      from: previousRank,
      to: currentRank,
      reason: direction === 'boosted' ? reason : buildReason('active reflection'),
    });
  }

  return {
    ordered_task_ids: newOrder,
    confidence_scores: sortedTasks.reduce<Record<string, number>>((accumulator, task) => {
      accumulator[task.taskId] = clampConfidence(task.adjustedConfidence);
      return accumulator;
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

export async function buildAdjustedPlanFromReflections(options: {
  userId: string;
  baselinePlan: PrioritizedTaskPlan;
  activeReflectionIds: string[];
}): Promise<{ adjustedPlan: AdjustedPlan; rankingMs: number }> {
  const rankingStart = performance.now();
  const { userId, baselinePlan, activeReflectionIds } = options;

  const uniqueReflectionIds = Array.from(new Set(activeReflectionIds)).filter(
    (id) => typeof id === 'string' && id.length > 0
  );

  const orderedTaskIds = Array.isArray(baselinePlan.ordered_task_ids)
    ? baselinePlan.ordered_task_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : [];

  if (orderedTaskIds.length === 0) {
    throw new Error('Baseline plan is missing ordered_task_ids');
  }

  if (uniqueReflectionIds.length === 0) {
    const durationMs = performance.now() - rankingStart;
    const tasks = orderedTaskIds.map((taskId) => {
      const baseConfidence = baselinePlan.confidence_scores?.[taskId] ?? FALLBACK_CONFIDENCE;
      return {
        taskId,
        baseConfidence,
        adjustedConfidence: baseConfidence,
      };
    });

    return {
      adjustedPlan: buildAdjustedPlan(
        orderedTaskIds,
        baselinePlan.confidence_scores ?? {},
        tasks,
        durationMs,
        []
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

  const reflectionMetadata: ReflectionMetadata[] = usableReflections.map((reflection) => ({
    id: reflection.id,
    text: reflection.text,
    recency_weight: clampConfidence(calculateRecencyWeight(new Date(reflection.created_at))),
    created_at: reflection.created_at,
  }));

  if (reflectionMetadata.length === 0) {
    const durationMs = performance.now() - rankingStart;
    const tasks = orderedTaskIds.map((taskId) => {
      const baseConfidence = baselinePlan.confidence_scores?.[taskId] ?? FALLBACK_CONFIDENCE;
      return {
        taskId,
        baseConfidence,
        adjustedConfidence: baseConfidence,
      };
    });

    return {
      adjustedPlan: buildAdjustedPlan(
        orderedTaskIds,
        baselinePlan.confidence_scores ?? {},
        tasks,
        durationMs,
        []
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

  const tasksWithTokens = orderedTaskIds.map((taskId) => {
    const text = (taskTextMap.get(taskId) ?? taskId).trim();
    const baseConfidence = baselinePlan.confidence_scores?.[taskId] ?? FALLBACK_CONFIDENCE;
    return {
      taskId,
      baseConfidence,
      adjustedConfidence: baseConfidence,
      boostReason: undefined,
      tokens: tokenize(text),
    };
  });

  for (const reflection of reflectionMetadata) {
    const reflectionTokens = tokenize(reflection.text);
    if (reflectionTokens.length === 0) {
      continue;
    }

    for (const task of tasksWithTokens) {
      const similarity = computeSimilarity(task.tokens, reflectionTokens);
      if (similarity <= 0) {
        continue;
      }

      const weightedSimilarity = similarity * reflection.recency_weight;
      if (weightedSimilarity < MIN_MATCH_THRESHOLD) {
        continue;
      }

      const delta = Math.min(BOOST_SCALE, weightedSimilarity * BOOST_SCALE);
      task.adjustedConfidence = clampConfidence(task.adjustedConfidence + delta);
      if (!task.boostReason || delta > BOOST_SCALE / 2) {
        task.boostReason = buildReason(reflection.text);
      }
    }
  }

  const scoredTasks: TaskScore[] = tasksWithTokens.map(({ tokens, ...rest }) => rest);
  const durationMs = performance.now() - rankingStart;

  const adjustedPlan = buildAdjustedPlan(
    orderedTaskIds,
    baselinePlan.confidence_scores ?? {},
    scoredTasks,
    durationMs,
    reflectionMetadata
  );

  return {
    adjustedPlan,
    rankingMs: durationMs,
  };
}
