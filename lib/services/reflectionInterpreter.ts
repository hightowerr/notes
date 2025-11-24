import { performance } from 'node:perf_hooks';

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

import {
  reflectionIntentCoreSchema,
  type ReflectionIntent,
  type ReflectionIntentType,
} from '@/lib/schemas/reflectionIntent';

const MODEL_NAME = 'gpt-4o-mini';
const MAX_TOKENS = 256;
const DEFAULT_STRENGTH: ReflectionIntent['strength'] = 'soft';
const DEFAULT_TYPE: ReflectionIntentType = 'information';
const DEFAULT_SUBTYPE: ReflectionIntent['subtype'] = 'context-only';

const RETRY_DELAY_MS = 1000;

type InterpreterResult = {
  intent: ReflectionIntent;
  latencyMs: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPrompt(text: string): string {
  return `Classify this reflection into one of the following categories and return structured JSON.

Reflection: "${text}"

Categories:
1. constraint/blocker - Hard block (e.g., "Legal blocked outreach")
2. constraint/soft-block - Soft limitation (e.g., "Prefer to avoid meetings")
3. opportunity/boost - Focus area (e.g., "Priority is analytics")
4. capacity/energy-level - Energy/time signal (e.g., "Low energy today")
5. sequencing/dependency - Order constraint (e.g., "Do X before Y")
6. information/context-only - FYI only (e.g., "FYI: project updated")

Return JSON matching this schema:
{
  "type": "constraint|opportunity|capacity|sequencing|information",
  "subtype": "blocker|soft-block|boost|energy-level|dependency|context-only",
  "keywords": ["relevant", "task", "keywords"],
  "strength": "hard|soft",
  "duration": { "until": "ISO date if mentioned", "from": "ISO date", "days": number } | null,
  "summary": "Plain language interpretation (<=500 chars)"
}

If unsure, choose "information/context-only". Keep keywords grounded in the reflection text.`;
}

function buildFallbackIntent(text: string): ReflectionIntent {
  const summarySource = text.trim();
  const summary =
    summarySource.length > 0
      ? summarySource.slice(0, 500)
      : 'Context only. No actionable intent detected.';

  return {
    type: DEFAULT_TYPE,
    subtype: DEFAULT_SUBTYPE,
    keywords: [],
    strength: DEFAULT_STRENGTH,
    duration: undefined,
    summary,
  };
}

function normalizeIntent(raw: unknown, text: string): ReflectionIntent {
  const parsed = reflectionIntentCoreSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[ReflectionInterpreter] Structured output failed validation', parsed.error.flatten());
    return buildFallbackIntent(text);
  }

  const intent = parsed.data;

  return {
    ...intent,
    keywords: (intent.keywords ?? []).filter((keyword) => keyword.trim().length > 0),
    strength: intent.strength ?? DEFAULT_STRENGTH,
  };
}

async function generateIntent(text: string, options?: { retry?: boolean }) {
  const temperature = options?.retry ? 0.2 : 0;

  const { object } = await generateObject({
    model: openai(MODEL_NAME),
    schema: reflectionIntentCoreSchema,
    prompt: buildPrompt(text),
    temperature,
    maxTokens: MAX_TOKENS,
  });

  return object;
}

export async function interpretReflection(text: string): Promise<InterpreterResult> {
  const sanitized = text.trim();
  const start = performance.now();

  // If there's no model key, fall back immediately
  if (!process.env.OPENAI_API_KEY) {
    const fallback = buildFallbackIntent(sanitized);
    return {
      intent: fallback,
      latencyMs: Math.max(0, Math.round(performance.now() - start)),
    };
  }

  try {
    const rawIntent = await generateIntent(sanitized);
    const intent = normalizeIntent(rawIntent, sanitized);
    return { intent, latencyMs: Math.max(0, Math.round(performance.now() - start)) };
  } catch (error) {
    console.error('[ReflectionInterpreter] First attempt failed, retrying once...', {
      error: error instanceof Error ? error.message : String(error),
    });

    try {
      await sleep(RETRY_DELAY_MS);
      const rawIntent = await generateIntent(sanitized, { retry: true });
      const intent = normalizeIntent(rawIntent, sanitized);
      return { intent, latencyMs: Math.max(0, Math.round(performance.now() - start)) };
    } catch (retryError) {
      console.error('[ReflectionInterpreter] Retry failed, returning fallback intent', {
        error: retryError instanceof Error ? retryError.message : String(retryError),
      });
      const intent = buildFallbackIntent(sanitized);
      return { intent, latencyMs: Math.max(0, Math.round(performance.now() - start)) };
    }
  }
}
