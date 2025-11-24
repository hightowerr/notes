import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { ReflectionEffect } from '@/lib/services/reflectionAdjuster';

type ReflectionInput = {
  id: string;
  text: string;
  is_active_for_prioritization?: boolean | null;
};

type TaskInput = {
  task_id: string;
  task_text?: string | null;
  title?: string | null;
};

const MODEL_NAME = 'gpt-4o-mini';
const MAX_TOKENS = 400;
const MODEL_TIMEOUT_MS = 4500;

const effectSchema = z.object({
  reflection_id: z.string().min(1),
  task_id: z.string().min(1),
  effect: z.enum(['blocked', 'demoted', 'boosted', 'unchanged']),
  reason: z.string().min(3).max(200).optional(),
  magnitude: z.number().optional(),
});

const responseSchema = z.object({
  effects: z.array(effectSchema).max(200),
});

function buildPrompt(reflections: ReflectionInput[], tasks: TaskInput[]) {
  const reflectionList = reflections
    .map(ref => `- ${ref.id}: ${ref.text}`)
    .join('\n');
  const taskList = tasks
    .map(task => `- ${task.task_id}: ${task.title ?? ''} || ${task.task_text ?? ''}`)
    .join('\n');

  return `You are classifying how reflections should affect tasks. 

Return an array of effects for reflection-task pairs when the reflection clearly blocks/demotes/boosts the task. 
- blocked: reflection says to ignore/skip/stop/not needed. Hide the task.
- demoted: deprioritize or avoid for now.
- boosted: prioritize/focus.
- unchanged: only when nothing applies.

Keep the list small: only emit effects when the reflection text directly implies an action on the task.

Reflections:
${reflectionList}

Tasks:
${taskList}

Respond with JSON matching the schema.`;
}

/**
 * Model-backed classifier. Returns null when no model key or on failure so callers can fall back.
 */
export async function classifyReflectionEffectsWithModel(
  reflections: ReflectionInput[],
  tasks: TaskInput[]
): Promise<ReflectionEffect[] | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  // Avoid excessive payloads
  const trimmedReflections = reflections.slice(0, 20);
  const trimmedTasks = tasks.slice(0, 50);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const { object } = await generateObject({
      model: openai(MODEL_NAME),
      schema: responseSchema,
      prompt: buildPrompt(trimmedReflections, trimmedTasks),
      temperature: 0,
      maxTokens: MAX_TOKENS,
      abortSignal: controller.signal,
    });

    const effects = object.effects ?? [];
    const normalized: ReflectionEffect[] = effects.map(effect => ({
      reflection_id: effect.reflection_id,
      task_id: effect.task_id,
      effect: effect.effect,
      magnitude:
        typeof effect.magnitude === 'number' && Number.isFinite(effect.magnitude)
          ? effect.magnitude
          : effect.effect === 'blocked'
            ? -10
            : effect.effect === 'demoted'
              ? -2
              : 2,
      reason: effect.reason ?? 'Model-assigned reflection effect',
    }));

    console.log('[ReflectionEffectModel] Model effects received', {
      reflectionsSent: trimmedReflections.length,
      tasksSent: trimmedTasks.length,
      effectsReturned: normalized.length,
      sample: normalized.slice(0, 5),
    });

    return normalized;
  } catch (error) {
    console.warn('[ReflectionEffectModel] Model request error', { error: String(error) });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
