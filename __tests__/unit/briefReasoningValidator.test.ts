import { describe, expect, it } from 'vitest';

import { BriefReasoningSchema } from '@/lib/schemas/prioritizationResultSchema';

const buildWords = (count: number) => Array.from({ length: count }, (_, idx) => `w${idx + 1}`).join(' ');

describe('briefReasoningValidator', () => {
  it('accepts reasoning up to 20 words', () => {
    const valid = buildWords(20);
    expect(() => BriefReasoningSchema.parse(valid)).not.toThrow();
  });

  it('rejects reasoning over 20 words', () => {
    const invalid = buildWords(21);
    const result = BriefReasoningSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects generic phrases', () => {
    const generics = ['Important', 'critical', 'high priority', 'This is urgent'];
    generics.forEach(text => {
      expect(BriefReasoningSchema.safeParse(text).success).toBe(false);
    });
  });

  it('generates fallback format guidance example', () => {
    const fallbackExample = 'Priority: 1';
    expect(() => BriefReasoningSchema.parse(fallbackExample)).not.toThrow();
  });
});
