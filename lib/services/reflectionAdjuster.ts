import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { classifyReflectionEffectsWithModel } from '@/lib/services/reflectionEffectModel';

type ReflectionRow = {
  id: string;
  text: string;
  is_active_for_prioritization: boolean | null;
};

type TaskEmbeddingRow = {
  task_id: string;
  task_text: string | null;
  reflection_effects: unknown;
};

export type ReflectionEffect = {
  reflection_id: string;
  task_id: string;
  effect: 'blocked' | 'demoted' | 'boosted' | 'unchanged';
  magnitude: number;
  reason: string;
};

const BLOCK_KEYWORDS = [
  'block',
  'blocked',
  'cannot',
  'ban',
  'hold',
  'stop',
  'wait',
  'pending',
  'legal',
  'approval',
  'ignore',
  'ignored',
  "don't need",
  'dont need',
  'do not need',
  'no need',
  'unneeded',
  'unnecessary',
  'not necessary',
  'not needed',
  'skip',
];
const DEMOTE_KEYWORDS = [
  'avoid',
  'later',
  'defer',
  'delay',
  'not now',
  'low energy',
  'tired',
  'busy',
  'no time',
  'minimize',
  'worry less',
  'not urgent',
];
const BOOST_KEYWORDS = [
  'focus',
  'priority',
  'prioritize',
  'boost',
  'important',
  'urgent',
  'need',
  'must',
];

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 2);
}

function detectEffect(reflectionText: string, taskText: string): ReflectionEffect['effect'] {
  const lower = reflectionText.toLowerCase();
  if (BLOCK_KEYWORDS.some((token) => lower.includes(token))) {
    return 'blocked';
  }
  if (DEMOTE_KEYWORDS.some((token) => lower.includes(token))) {
    return 'demoted';
  }
  if (BOOST_KEYWORDS.some((token) => lower.includes(token))) {
    return 'boosted';
  }
  const reflectionTokens = new Set(tokenize(reflectionText));
  const taskTokens = tokenize(taskText);
  const overlap = taskTokens.some((token) => reflectionTokens.has(token));
  return overlap ? 'boosted' : 'unchanged';
}

function buildReason(effect: ReflectionEffect['effect'], reflectionText: string): string {
  if (effect === 'blocked') {
    return 'Blocked by reflection context';
  }
  if (effect === 'demoted') {
    return 'Deprioritized by reflection context';
  }
  if (effect === 'boosted') {
    return 'Matches reflection focus';
  }
  const trimmed = reflectionText.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : 'No change';
}

export async function applyReflectionEffects(
  reflectionIds: string[],
  taskIds?: string[]
): Promise<{ effects: ReflectionEffect[]; tasksAffected: number; message?: string }> {
  const supabase = getSupabaseAdminClient();

  if (reflectionIds.length === 0) {
    return { effects: [], tasksAffected: 0, message: 'No reflections provided' };
  }

  const reflectionsPromise = supabase
    .from('reflections')
    .select('id, text, is_active_for_prioritization')
    .in('id', reflectionIds);

  let taskQuery = supabase.from('task_embeddings').select('task_id, task_text, reflection_effects');
  const shouldFilterTasks = Array.isArray(taskIds) && taskIds.length > 0;
  if (shouldFilterTasks) {
    taskQuery = taskQuery.in('task_id', taskIds as string[]);
  }

  const [{ data: reflections, error: reflectionError }, { data: tasks, error: tasksError }] =
    await Promise.all([reflectionsPromise, taskQuery]);

  if (reflectionError) {
    throw new Error(`Failed to load reflections: ${reflectionError.message}`);
  }

  if (tasksError) {
    throw new Error(`Failed to load task embeddings: ${tasksError.message}`);
  }

  const usableReflections = (reflections ?? []).filter(
    (row): row is ReflectionRow =>
      row !== null &&
      typeof row.id === 'string' &&
      typeof row.text === 'string' &&
      row.text.trim().length > 0 &&
      row.is_active_for_prioritization !== false
  );

  const usableTasks = (tasks ?? []).filter(
    (row): row is TaskEmbeddingRow =>
      row !== null && typeof row.task_id === 'string' && row.task_id.length > 0
  );

  const effects: ReflectionEffect[] = [];
  const reflectionEffectSummary: Record<string, { applied: number; text: string }> = {};

  const modelEffects = await classifyReflectionEffectsWithModel(usableReflections, usableTasks);
  const effectsToApply: ReflectionEffect[] = Array.isArray(modelEffects) && modelEffects.length > 0
    ? modelEffects
    : buildHeuristicEffects(usableReflections, usableTasks);

  for (const effect of effectsToApply) {
    const reflection = usableReflections.find(r => r.id === effect.reflection_id);
    if (!reflection) {
      continue;
    }

    effects.push(effect);
    reflectionEffectSummary[reflection.id] = {
      applied: (reflectionEffectSummary[reflection.id]?.applied ?? 0) + 1,
      text: reflection.text.slice(0, 80),
    };

    const task = usableTasks.find(t => t.task_id === effect.task_id);
    const existingEffects = Array.isArray(task?.reflection_effects)
      ? (task?.reflection_effects as ReflectionEffect[])
      : [];
    const updated = existingEffects.filter((e) => e.reflection_id !== effect.reflection_id);
    updated.push(effect);

    const { error: updateError } = await supabase
      .from('task_embeddings')
      .update({ reflection_effects: updated })
      .eq('task_id', effect.task_id);

    if (updateError) {
      console.error('[ReflectionAdjuster] Failed to update task effects', {
        task_id: effect.task_id,
        error: updateError.message,
      });
    }
  }

  const tasksAffected = new Set(effects.map((entry) => entry.task_id)).size;
  const remainingTasks = Math.max(0, usableTasks.length - tasksAffected);
  const message =
    tasksAffected > 0 && remainingTasks < 5
      ? `Warning: Only ${remainingTasks} tasks remain active. Consider reviewing reflection constraints.`
      : effects.length === 0
        ? 'No tasks matched this reflection'
        : undefined;

  console.log('[ReflectionAdjuster] Effects summary', {
    reflectionsRequested: reflectionIds.length,
    reflectionsLoaded: usableReflections.length,
    tasksLoaded: usableTasks.length,
    effectsCount: effects.length,
    tasksAffected,
    summaryByReflection: Object.entries(reflectionEffectSummary)
      .slice(0, 5)
      .map(([id, entry]) => ({
        id,
        applied: entry.applied,
        textPreview: entry.text,
      })),
  });

  return { effects, tasksAffected, message };
}

function buildHeuristicEffects(
  reflections: ReflectionRow[],
  tasks: TaskEmbeddingRow[]
): ReflectionEffect[] {
  const effects: ReflectionEffect[] = [];
  for (const reflection of reflections) {
    for (const task of tasks) {
      const effect = detectEffect(reflection.text, task.task_text ?? task.task_id);
      if (effect === 'unchanged') {
        continue;
      }
      effects.push({
        reflection_id: reflection.id,
        task_id: task.task_id,
        effect,
        magnitude: effect === 'blocked' ? -10 : 2,
        reason: buildReason(effect, reflection.text),
      });
    }
  }
  return effects;
}

export async function toggleReflectionEffect(
  reflectionId: string,
  isActive: boolean
): Promise<{
  effectsApplied: ReflectionEffect[];
  effectsRemoved: ReflectionEffect[];
  tasksAffected: number;
}> {
  if (isActive) {
    const { effects, tasksAffected } = await applyReflectionEffects([reflectionId]);
    return { effectsApplied: effects, effectsRemoved: [], tasksAffected };
  }

  const supabase = getSupabaseAdminClient();
  const { data: tasks, error } = await supabase
    .from('task_embeddings')
    .select('task_id, reflection_effects');

  if (error) {
    throw new Error(`Failed to load task embeddings for toggle: ${error.message}`);
  }

  const effectsRemoved: ReflectionEffect[] = [];
  let tasksAffected = 0;

  for (const row of tasks ?? []) {
    if (!row || !row.reflection_effects || !Array.isArray(row.reflection_effects)) {
      continue;
    }
    const filtered = (row.reflection_effects as ReflectionEffect[]).filter(
      (effect) => effect?.reflection_id !== reflectionId
    );
    if (filtered.length === row.reflection_effects.length) {
      continue;
    }
    const removed = (row.reflection_effects as ReflectionEffect[]).filter(
      (effect) => effect?.reflection_id === reflectionId
    );
    effectsRemoved.push(...removed);
    tasksAffected += 1;

    const { error: updateError } = await supabase
      .from('task_embeddings')
      .update({ reflection_effects: filtered })
      .eq('task_id', row.task_id);

    if (updateError) {
      console.error('[ReflectionAdjuster] Failed to remove reflection effects on toggle', {
        task_id: row.task_id,
        reflection_id: reflectionId,
        error: updateError.message,
      });
    }
  }

  return { effectsApplied: [], effectsRemoved, tasksAffected };
}
