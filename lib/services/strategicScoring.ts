import { randomUUID } from 'node:crypto';

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

import type { StrategicScoresMap } from '@/lib/schemas/strategicScore';
import {
  EffortEstimateSchema,
  ImpactEstimateSchema,
  StrategicScoreSchema,
  UnifiedStrategicEstimateSchema,
  type ConfidenceBreakdown,
  type EffortEstimate,
  type ImpactEstimate,
  type StrategicScore,
  type UnifiedStrategicEstimate,
} from '@/lib/schemas/strategicScore';
import type { TaskSummary } from '@/lib/types/agent';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { QUADRANT_CONFIGS, getQuadrant } from '@/lib/schemas/quadrant';
import { enqueueRetryJob } from '@/lib/services/retryQueue';
import { calculatePriority } from '@/lib/utils/strategicPriority';

type ScoreSignals = {
  similarityScores?: Record<string, number>;
  dependencyScores?: Record<string, number>;
  historyScores?: Record<string, number>;
};

type ScoreTaskOptions = ScoreSignals & {
  outcome?: string | null;
  sessionId: string;
};

const KEYWORD_WEIGHTS: Array<{ regex: RegExp; weight: number }> = [
  { regex: /(revenue|conversion|payment)/i, weight: 3 },
  { regex: /(launch|test)/i, weight: 2 },
  { regex: /(document|refactor)/i, weight: -1 },
];

const EFFORT_REGEX = /\b(\d+(?:\.\d+)?)\s*(h|hour|hours|hr|hrs|day|days|d)\b/i;
const INTEGRATION_REGEX = /(integrate|integration|migrate|migration|redesign)/i;
const DEPENDENCY_REGEX = /(dependency|depends on|blocked|blocker|external team)/i;
const INVESTIGATE_REGEX = /(investigate|explore|spike)/i;

const BASE_IMPACT = 5;
const BASE_EFFORT = 8;
const CONCURRENCY_LIMIT = 10;
const LLM_RETRY_DELAYS_MS = [0, 1000, 2000];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export async function estimateImpact(
  task: TaskSummary,
  outcome?: string | null,
  options: { fallbackToHeuristic?: boolean; unifiedEstimate?: UnifiedStrategicEstimate | null } = {}
): Promise<ImpactEstimate | null> {
  // If we have a cached unified estimate, use it
  if (options.unifiedEstimate) {
    return {
      impact: options.unifiedEstimate.impact,
      reasoning: options.unifiedEstimate.impact_reasoning,
      keywords: options.unifiedEstimate.keywords,
      confidence: options.unifiedEstimate.confidence,
    };
  }

  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  const fallbackToHeuristic = options.fallbackToHeuristic ?? !hasOpenAIKey;

  if (hasOpenAIKey) {
    try {
      const llmEstimate = await estimateImpactWithLLM(task, outcome);
      if (llmEstimate) {
        return llmEstimate;
      }
    } catch (error) {
      console.warn('[StrategicScoring] Impact estimation failed', error);
    }
  }

  if (fallbackToHeuristic) {
    return buildHeuristicImpactEstimate(task, outcome);
  }

  return null;
}

function normalizeEffortFromMatch(match: RegExpMatchArray | null): { hours: number; hint?: string } | null {
  if (!match) {
    return null;
  }
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }
  const unit = match[2].toLowerCase();
  const hours = /d/.test(unit) ? value * 8 : value;
  return { hours, hint: match[0] };
}

export async function estimateEffort(
  task: TaskSummary,
  options: { unifiedEstimate?: UnifiedStrategicEstimate | null } = {}
): Promise<EffortEstimate> {
  // If we have a cached unified estimate, use it (LLM-based)
  if (options.unifiedEstimate) {
    return {
      effort: options.unifiedEstimate.effort,
      source: 'llm' as const,
      hint: options.unifiedEstimate.effort_reasoning,
      complexity_modifiers: options.unifiedEstimate.complexity_factors,
    };
  }

  const text = task.task_text ?? '';
  const complexityModifiers: string[] = [];
  const extracted = normalizeEffortFromMatch(text.match(EFFORT_REGEX));

  if (extracted) {
    const payload = {
      effort: clamp(extracted.hours, 0.5, 160),
      source: 'extracted' as const,
      hint: extracted.hint,
    } satisfies EffortEstimate;
    return EffortEstimateSchema.parse(payload);
  }

  let effort = BASE_EFFORT;
  if (text.length > 100) {
    effort += 4;
    complexityModifiers.push('long_spec');
  }
  if (INTEGRATION_REGEX.test(text)) {
    effort += 8;
    complexityModifiers.push('integration_work');
  }
  if (DEPENDENCY_REGEX.test(text)) {
    effort += 4;
    complexityModifiers.push('dependency_risk');
  }
  if (INVESTIGATE_REGEX.test(text)) {
    effort += 8;
    complexityModifiers.push('investigation_needed');
  }

  const payload = {
    effort: clamp(effort, 0.5, 160),
    source: 'heuristic' as const,
    complexity_modifiers: complexityModifiers.length ? complexityModifiers : undefined,
  } satisfies EffortEstimate;

  return EffortEstimateSchema.parse(payload);
}

export function calculateConfidence(
  task: TaskSummary,
  options: { similarityScore?: number; dependencyScore?: number; historyScore?: number } = {}
): { value: number; breakdown: ConfidenceBreakdown } {
  const similarity = clamp(
    options.similarityScore ?? (typeof task.previous_confidence === 'number' ? task.previous_confidence : 0.7),
    0,
    1
  );
  const dependencyScore = clamp(
    options.dependencyScore ?? (task.manual_override ? 0.6 : 0.75),
    0,
    1
  );
  const historyScore = clamp(
    options.historyScore ?? (task.previous_state === 'completed' ? 0.9 : task.previous_state === 'discarded' ? 0.4 : 0.6),
    0,
    1
  );

  const confidence = 0.6 * similarity + 0.3 * dependencyScore + 0.1 * historyScore;
  const normalizedConfidence = Number(confidence.toFixed(3));

  return {
    value: normalizedConfidence,
    breakdown: {
      similarity: {
        label: 'Semantic similarity',
        weight: 0.6,
        value: Number(similarity.toFixed(3)),
        source: 'similarity',
      },
      dependency: {
        label: 'Dependency certainty',
        weight: 0.3,
        value: Number(dependencyScore.toFixed(3)),
        source: 'dependency',
      },
      history: {
        label: 'Historical stability',
        weight: 0.1,
        value: Number(historyScore.toFixed(3)),
        source: 'history',
      },
    },
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function workerLoop() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        break;
      }
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => workerLoop());
  await Promise.all(workers);
  return results;
}

export async function scoreAllTasks(
  tasks: TaskSummary[],
  outcome: string | null,
  options: ScoreTaskOptions
): Promise<StrategicScoresMap> {
  const { sessionId, similarityScores = {}, dependencyScores = {}, historyScores = {} } = options;
  if (!sessionId) {
    throw new Error('sessionId is required to persist strategic scores');
  }

  const supabase = getSupabaseAdminClient();

  const processed = await runWithConcurrency(tasks, CONCURRENCY_LIMIT, async task => {
    // Try unified LLM approach first (one call for both impact + effort)
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
    let unifiedEstimate: UnifiedStrategicEstimate | null = null;

    if (hasOpenAIKey) {
      try {
        unifiedEstimate = await estimateWithUnifiedLLM(task, outcome ?? null);
      } catch (error) {
        console.warn('[StrategicScoring] Unified LLM failed, falling back', error);
      }
    }

    // Extract impact and effort (will use unified estimate if available, otherwise fallback)
    const [impactEstimate, effortEstimate] = await Promise.all([
      estimateImpact(task, outcome ?? undefined, { unifiedEstimate }),
      estimateEffort(task, { unifiedEstimate }),
    ]);
    const { value: confidence, breakdown: confidenceBreakdown } = calculateConfidence(task, {
      similarityScore: similarityScores[task.task_id],
      dependencyScore: dependencyScores[task.task_id],
      historyScore: historyScores[task.task_id],
    });

    if (!impactEstimate) {
      enqueueRetryJob({
        taskId: task.task_id,
        sessionId,
        estimateFn: () => estimateImpact(task, outcome ?? undefined),
        onSuccess: async nextImpact => {
          const score = buildStrategicScoreFromEstimates(
            nextImpact,
            effortEstimate,
            confidence,
            confidenceBreakdown
          );
          try {
            await mergeStrategicScores(supabase, sessionId, { [task.task_id]: score });
          } catch (error) {
            console.error('[StrategicScoring] Failed to persist retry score', error);
            throw error;
          }
        },
        onFailure: async (_error, attempts, lastError) => {
          await logRetryExhausted(supabase, task.task_id, sessionId, attempts, lastError, 3);
        },
        cacheKey: outcome ? `${task.task_id}:${outcome}` : task.task_id,
      });
      return null;
    }

    const score = buildStrategicScoreFromEstimates(
      impactEstimate,
      effortEstimate,
      confidence,
      confidenceBreakdown
    );
    const quadrant = getQuadrant(impactEstimate.impact, effortEstimate.effort);

    return {
      taskId: task.task_id,
      score,
      quadrant,
    };
  });

  const successful = processed.filter(
    (entry): entry is NonNullable<typeof entry> => Boolean(entry)
  );

  const scores: StrategicScoresMap = successful.reduce<StrategicScoresMap>((acc, entry) => {
    acc[entry.taskId] = entry.score;
    return acc;
  }, {});

  if (Object.keys(scores).length === 0) {
    return scores;
  }

  await mergeStrategicScores(supabase, sessionId, scores);

  return scores;
}

async function mergeStrategicScores(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  sessionId: string,
  scores: StrategicScoresMap
) {
  const { data: rows, error: fetchError } = await supabase
    .from('agent_sessions')
    .select('strategic_scores')
    .eq('id', sessionId)
    .limit(1);

  if (fetchError) {
    throw new Error(`Failed to load existing strategic scores: ${fetchError.message}`);
  }

  const existing = (rows?.[0]?.strategic_scores ?? {}) as Record<string, StrategicScore>;
  const updated = { ...existing, ...scores } satisfies Record<string, StrategicScore>;

  const { error: updateError } = await supabase
    .from('agent_sessions')
    .update({ strategic_scores: updated })
    .eq('id', sessionId);

  if (updateError) {
    throw new Error(`Failed to store strategic scores: ${updateError.message}`);
  }
}

async function logRetryExhausted(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  taskId: string,
  sessionId: string,
  attempts: number,
  lastError?: string,
  maxAttempts?: number
) {
  try {
    await supabase.from('processing_logs').insert({
      operation: 'strategic_score_retry',
      status: 'retry_exhausted',
      timestamp: new Date().toISOString(),
      metadata: {
        task_id: taskId,
        session_id: sessionId,
        attempts,
        last_error: lastError,
        max_attempts: maxAttempts,
      },
    });
  } catch (error) {
    console.error('[StrategicScoring] Failed to log retry exhaustion', error);
  }
}

function buildStrategicScoreFromEstimates(
  impactEstimate: ImpactEstimate,
  effortEstimate: EffortEstimate,
  confidence: number,
  confidenceBreakdown?: ConfidenceBreakdown
): StrategicScore {
  const priority = calculatePriority(impactEstimate.impact, effortEstimate.effort, confidence);

  return StrategicScoreSchema.parse({
    impact: impactEstimate.impact,
    effort: effortEstimate.effort,
    confidence,
    priority,
    reasoning: {
      impact_keywords: impactEstimate.keywords,
      effort_source: effortEstimate.source,
      effort_hint: effortEstimate.hint,
      complexity_modifiers: effortEstimate.complexity_modifiers,
    },
    scored_at: new Date().toISOString(),
    confidence_breakdown: confidenceBreakdown,
  });
}

export function buildTaskWithScores(score: StrategicScore, task: TaskSummary) {
  return {
    id: task.task_id,
    content: task.task_text,
    impact: score.impact,
    effort: score.effort,
    confidence: score.confidence,
    priority: score.priority,
    hasManualOverride: Boolean(task.manual_override),
    quadrant: getQuadrant(score.impact, score.effort),
    reasoning: score.reasoning,
    scored_at: score.scored_at,
    quadrantLabel: QUADRANT_CONFIGS[getQuadrant(score.impact, score.effort)].label,
    confidenceBreakdown: score.confidence_breakdown ?? null,
  };
}

export function buildScorePlaceholder(task: TaskSummary): StrategicScore {
  const fallback: StrategicScore = {
    impact: BASE_IMPACT,
    effort: BASE_EFFORT,
    confidence: 0.6,
    priority: calculatePriority(BASE_IMPACT, BASE_EFFORT, 0.6),
    reasoning: {
      impact_keywords: [],
      effort_source: 'heuristic',
    },
    scored_at: new Date().toISOString(),
  } as StrategicScore;

  return StrategicScoreSchema.parse({ ...fallback, scored_at: new Date().toISOString() });
}

export function generateScoreDebugId() {
  return `score-${randomUUID()}`;
}

async function estimateWithUnifiedLLM(task: TaskSummary, outcome?: string | null): Promise<UnifiedStrategicEstimate | null> {
  const prompt = [
    'You are an expert product strategist analyzing tasks for strategic prioritization.',
    '',
    '# Your Role',
    'Evaluate BOTH the strategic impact AND implementation effort of this task in the context of the stated outcome.',
    '',
    '# Outcome Context',
    outcome ?? 'General productivity and quality improvements',
    '',
    '# Task to Evaluate',
    task.task_text ?? 'No description provided',
    '',
    '# Scoring Guidelines',
    '',
    '## Impact (0-10)',
    '- 9-10: Directly creates revenue, unlocks major features, or removes critical blockers',
    '- 7-8: Significantly advances the outcome (e.g., payment integration, core feature launch)',
    '- 5-6: Moderately helpful (e.g., testing, coordination that enables high-value work)',
    '- 3-4: Tangentially related (e.g., documentation, minor improvements)',
    '- 0-2: No clear connection to the outcome',
    '',
    '## Effort (hours)',
    '- Consider: Technical complexity, unknowns, dependencies, integration scope',
    '- Spikes/investigations: Often 8-16 hours (exploring unknowns)',
    '- Integrations: Often 16-40 hours (multiple systems, testing, edge cases)',
    '- Simple implementations: 4-12 hours',
    '- Documentation/coordination: 2-6 hours',
    '',
    '## Reasoning',
    '- Impact reasoning: Explain how this task advances (or doesn\'t advance) the outcome',
    '- Effort reasoning: Explain what makes this task simple or complex',
    '',
    '## Keywords & Complexity Factors',
    '- Keywords: 2-5 strategic terms (e.g., "payment", "integration", "launch")',
    '- Complexity factors: 2-5 technical challenges (e.g., "external_api", "data_migration", "unknown_scope")',
    '',
    '## Confidence (0-1)',
    '- How certain are you about the impact-outcome alignment?',
    '- 0.9+: Clear, direct connection',
    '- 0.7-0.8: Likely helpful but indirect',
    '- 0.5-0.6: Unclear or speculative connection',
  ].join('\n');

  let lastError: unknown = null;

  for (let attempt = 0; attempt < LLM_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { object } = await generateObject({
        model: openai('gpt-4o'),
        schema: UnifiedStrategicEstimateSchema,
        temperature: 0.1,
        prompt,
      });
      return UnifiedStrategicEstimateSchema.parse(object);
    } catch (error) {
      lastError = error;
      const shouldRetry = isRetryableLlmError(error);
      if (!shouldRetry || attempt === LLM_RETRY_DELAYS_MS.length - 1) {
        break;
      }
      await delay(LLM_RETRY_DELAYS_MS[attempt + 1]);
    }
  }

  console.error('[StrategicScoring] Unified LLM estimation failed after retries', lastError);
  return null;
}

async function estimateImpactWithLLM(task: TaskSummary, outcome?: string | null): Promise<ImpactEstimate | null> {
  const prompt = [
    'You are an expert product strategist estimating strategic impact for tasks.',
    'Return JSON with impact (0-10), reasoning (short sentence), keywords (2-4 lowercase keywords), and confidence (0-1).',
    '',
    `Outcome context: ${outcome ?? 'General productivity improvements'}`,
    '',
    `Task: ${task.task_text ?? 'No description provided'}`,
    '',
    'Guidelines:',
    '- Impact reflects how much this task advances the stated outcome.',
    '- Confidence should consider clarity of the task and linkage to the outcome.',
    '- Keywords should highlight the most important nouns or verbs from the task description.',
  ].join('\n');

  let lastError: unknown = null;

  for (let attempt = 0; attempt < LLM_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: ImpactEstimateSchema,
        temperature: 0,
        prompt,
      });
      return ImpactEstimateSchema.parse(object);
    } catch (error) {
      lastError = error;
      const shouldRetry = isRetryableLlmError(error);
      if (!shouldRetry || attempt === LLM_RETRY_DELAYS_MS.length - 1) {
        break;
      }
      await delay(LLM_RETRY_DELAYS_MS[attempt + 1]);
    }
  }

  console.error('[StrategicScoring] LLM impact estimation failed after retries', lastError);
  return null;
}

function isRetryableLlmError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const message = (error as Error).message?.toLowerCase?.() ?? '';
  const status =
    typeof (error as { status?: number }).status === 'number'
      ? (error as { status?: number }).status
      : typeof (error as { response?: { status?: number } }).response?.status === 'number'
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
  const code = (error as { code?: string }).code?.toLowerCase?.();

  if (
    status === 401 ||
    status === 403 ||
    code === 'invalid_api_key' ||
    code === 'insufficient_quota' ||
    message.includes('invalid api key') ||
    message.includes('incorrect api key') ||
    message.includes('unauthorized') ||
    message.includes('permission denied')
  ) {
    return false;
  }

  return (
    message.includes('timeout') ||
    message.includes('etimedout') ||
    message.includes('abort') ||
    message.includes('network') ||
    message.includes('socket hang up') ||
    message.includes('temporarily unavailable') ||
    message.includes('server error') ||
    status === 429 ||
    status === 500
  );
}

async function delay(ms: number) {
  if (ms <= 0 || process.env.NODE_ENV === 'test') {
    return;
  }
  await new Promise(resolve => setTimeout(resolve, ms));
}

function buildHeuristicImpactEstimate(task: TaskSummary, outcome?: string | null): ImpactEstimate {
  const text = `${task.task_text ?? ''} ${outcome ?? ''}`.toLowerCase();
  let impact = BASE_IMPACT;
  const matchedKeywords = new Set<string>();

  KEYWORD_WEIGHTS.forEach(({ regex, weight }) => {
    const match = text.match(regex);
    if (match) {
      impact += weight;
      matchedKeywords.add(match[0].toLowerCase());
    }
  });

  impact = clamp(impact, 0, 10);

  const confidenceBoost = Math.max(0, matchedKeywords.size * 0.05 - (impact < BASE_IMPACT ? 0.05 : 0));
  const confidence = clamp(0.6 + confidenceBoost, 0.4, 0.95);
  const reasoning = matchedKeywords.size
    ? `Detected strategic keywords: ${Array.from(matchedKeywords).join(', ')}`
    : 'Default impact estimate based on task context.';

  const payload = {
    impact,
    reasoning,
    keywords: Array.from(matchedKeywords),
    confidence,
  } satisfies ImpactEstimate;

  return ImpactEstimateSchema.parse(payload);
}
