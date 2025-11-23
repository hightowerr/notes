import { describe, expect, it } from 'vitest';
import { excludedTaskSchema } from '../excludedTaskSchema';

const createValidTask = () => ({
  task_id: '123e4567-e89b-12d3-a456-426614174000',
  task_text: 'Rewrite payment retries to respect new gateway timeouts.',
  exclusion_reason:
    'Payment retries currently conflict with scope; defer until checkout telemetry is stable.',
  alignment_score: 2.5,
});

describe('excludedTaskSchema', () => {
  it('validates a properly structured excluded task payload', () => {
    const payload = createValidTask();
    expect(() => excludedTaskSchema.parse(payload)).not.toThrow();
  });

  it('rejects alignment scores outside 0-10', () => {
    const payload = createValidTask();
    payload.alignment_score = 15;
    const result = excludedTaskSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(/Alignment score/);
  });
});
