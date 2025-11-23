import { describe, expect, it } from 'vitest';
import {
  hybridLoopMetadataSchema,
  chainOfThoughtStepSchema,
} from '../hybridLoopMetadataSchema';

const createValidStep = (iteration: number) =>
  chainOfThoughtStepSchema.parse({
    iteration,
    confidence: 0.75,
    corrections: 'Clarified why docs tasks should remain excluded.',
    evaluator_feedback: iteration === 2 ? 'Consider swapping final two tasks.' : undefined,
    timestamp: '2025-11-18T14:32:15Z',
  });

const createValidMetadata = () => ({
  iterations: 2,
  duration_ms: 15800,
  evaluation_triggered: true,
  chain_of_thought: [createValidStep(1), createValidStep(2)],
  converged: true,
  final_confidence: 0.81,
});

describe('hybridLoopMetadataSchema', () => {
  it('accepts valid metadata payloads', () => {
    const payload = createValidMetadata();
    expect(() => hybridLoopMetadataSchema.parse(payload)).not.toThrow();
  });

  it('rejects iteration counts over 3', () => {
    const payload = createValidMetadata();
    payload.iterations = 4;
    const result = hybridLoopMetadataSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path).toContain('iterations');
  });

  it('rejects chain-of-thought arrays longer than 3 entries', () => {
    const payload = createValidMetadata();
    payload.iterations = 3;
    payload.chain_of_thought = [
      createValidStep(1),
      createValidStep(2),
      createValidStep(3),
      createValidStep(3),
    ];
    const result = hybridLoopMetadataSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].path).toContain('chain_of_thought');
  });

  it('rejects when iterations count does not match chain-of-thought length', () => {
    const payload = createValidMetadata();
    payload.iterations = 3;
    payload.chain_of_thought = [createValidStep(1), createValidStep(2)];
    const result = hybridLoopMetadataSchema.safeParse(payload);
    expect(result.success).toBe(false);
    expect(result.success ? '' : result.error.issues[0].message).toMatch(/iterations must match/i);
  });

  it('accepts final confidence boundary values', () => {
    const payload = createValidMetadata();
    payload.final_confidence = 0;
    expect(() => hybridLoopMetadataSchema.parse(payload)).not.toThrow();

    payload.final_confidence = 1;
    payload.iterations = payload.chain_of_thought.length;
    expect(() => hybridLoopMetadataSchema.parse(payload)).not.toThrow();
  });
});
