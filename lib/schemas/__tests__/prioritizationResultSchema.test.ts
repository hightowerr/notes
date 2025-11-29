import { describe, expect, it } from 'vitest';
import { prioritizationResultSchema } from '../prioritizationResultSchema';

const TASK_ID = '123e4567-e89b-12d3-a456-426614174000';

const createValidPayload = () => ({
  thoughts: {
    outcome_analysis:
      'Outcome is to increase payment conversions by tackling blockers within the checkout service.',
    filtering_rationale:
      'Removed documentation themed tasks because they do not accelerate the target outcome.',
    prioritization_strategy:
      'Ranked by impact to payment conversion, secondarily by estimated effort to keep throughput steady.',
    self_check_notes:
      'Compared against prior plan and ensured coverage for analytics fix plus feedback loop tasks.',
  },
  included_tasks: [
    {
      task_id: TASK_ID,
      inclusion_reason:
        'Directly advances the conversion rate outcome by repairing checkout flows.',
      alignment_score: 9.2,
    },
  ],
  excluded_tasks: [
    {
      task_id: '223e4567-e89b-12d3-a456-426614174001',
      task_text: 'Update API documentation to match new interface.',
      exclusion_reason:
        'Documentation updates can wait until payment funnel issues stabilize.',
      alignment_score: 2.1,
    },
  ],
  ordered_task_ids: [TASK_ID],
  per_task_scores: {
    [TASK_ID]: {
      task_id: TASK_ID,
      impact: 8.5,
      effort: 12,
      confidence: 0.86,
      reasoning:
        'Fixing checkout feedback loops dramatically impacts payment throughput with manageable effort.',
      brief_reasoning: 'Unblocks checkout fix to raise conversion',
      dependencies: ['323e4567-e89b-12d3-a456-426614174002'],
    },
  },
  confidence: 0.82,
  critical_path_reasoning:
    'Checkout telemetry repair must precede payment retries to ensure accurate data.',
  corrections_made: 'Moved documentation cleanup to excluded after self-check review.',
});

describe('prioritizationResultSchema', () => {
  it('accepts a valid prioritization result payload', () => {
    const payload = createValidPayload();
    expect(() => prioritizationResultSchema.parse(payload)).not.toThrow();
  });

  it('fails when a required thought entry is missing', () => {
    const payload = createValidPayload();
    // @ts-expect-error validating runtime schema
    delete payload.thoughts.outcome_analysis;

    const result = prioritizationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0].path).toEqual([
      'thoughts',
      'outcome_analysis',
    ]);
  });

  it('fails when confidence exceeds 1.0', () => {
    const payload = createValidPayload();
    payload.confidence = 1.5;

    const result = prioritizationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(
      /confidence/i
    );
  });

  it('fails when included tasks array is empty', () => {
    const payload = createValidPayload();
    payload.included_tasks = [];

    const result = prioritizationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(
      /At least one task must be included/
    );
  });

  it('fails when an included task has an invalid alignment score', () => {
    const payload = createValidPayload();
    payload.included_tasks[0].alignment_score = 11;

    const result = prioritizationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(
      /Alignment score/
    );
  });

  it('fails when per-task score effort drops below 0.5h', () => {
    const payload = createValidPayload();
    payload.per_task_scores[TASK_ID].effort = 0.3;

    const result = prioritizationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(
      /Effort must be at least 0\.5/
    );
  });

  it('fails when a score entry is missing for an included task', () => {
    const payload = createValidPayload();
    delete payload.per_task_scores[TASK_ID];

    const result = prioritizationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0].path).toEqual([
      'per_task_scores',
      TASK_ID,
    ]);
  });

  it('fails when per_task_scores references a non-included task', () => {
    const payload = createValidPayload();
    payload.per_task_scores['999e4567-e89b-12d3-a456-426614174999'] = {
      ...payload.per_task_scores[TASK_ID],
    };

    const result = prioritizationResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0].path).toEqual([
      'per_task_scores',
      '999e4567-e89b-12d3-a456-426614174999',
    ]);
  });

  it('accepts boundary confidence values (0 and 1)', () => {
    const payload = createValidPayload();
    payload.confidence = 0;
    expect(() => prioritizationResultSchema.parse(payload)).not.toThrow();

    payload.confidence = 1;
    expect(() => prioritizationResultSchema.parse(payload)).not.toThrow();
  });
});
