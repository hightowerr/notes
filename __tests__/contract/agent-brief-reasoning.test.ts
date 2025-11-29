import { describe, expect, it } from 'vitest';

import { BriefReasoningSchema } from '@/lib/schemas/prioritizationResultSchema';

const buildWordReasoning = (count: number) => Array.from({ length: count }, (_, idx) => `word${idx + 1}`).join(' ');

describe('BriefReasoningSchema', () => {
  it('accepts outcome-linked reasoning within limits', () => {
    const validReasoning = 'Unblocks #3, #7 • Enables payment feature';

    expect(() => BriefReasoningSchema.parse(validReasoning)).not.toThrow();
  });

  it('enforces a maximum of 20 words', () => {
    const withinLimit = buildWordReasoning(20);
    const overLimit = buildWordReasoning(21);

    expect(() => BriefReasoningSchema.parse(withinLimit)).not.toThrow();
    expect(BriefReasoningSchema.safeParse(overLimit).success).toBe(false);
  });

  it('requires 5-150 characters', () => {
    const tooShort = 'tiny';
    const tooLong = `${buildWordReasoning(35)} and still going to exceed the cap`;

    expect(BriefReasoningSchema.safeParse(tooShort).success).toBe(false);
    expect(BriefReasoningSchema.safeParse(tooLong).success).toBe(false);
  });

  it('rejects generic phrases without specifics', () => {
    const genericPhrases = ['Important', 'critical', 'High priority', 'This is urgent'];

    genericPhrases.forEach(phrase => {
      const result = BriefReasoningSchema.safeParse(phrase);
      expect(result.success).toBe(false);
    });
  });

  it('rejects empty or nullish values', () => {
    expect(BriefReasoningSchema.safeParse('').success).toBe(false);
    expect(BriefReasoningSchema.safeParse('   ').success).toBe(false);
    expect(() => BriefReasoningSchema.parse(null as unknown as string)).toThrow();
  });
});
