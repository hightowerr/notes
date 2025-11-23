import { describe, it, expect } from 'vitest';

import { prioritizationGenerator } from '@/lib/mastra/agents/prioritizationGenerator';

describe('Prioritization Generator Prompt Structure Test', () => {
  it('verifies that the agent prompt contains proper negation handling instructions', async () => {
    // Ensure the agent prompt contains the required negation handling instructions
    const prompt = await prioritizationGenerator.getInstructions();

    expect(prompt).toContain('REFLECTION INTERPRETATION RULES');
    expect(prompt).toContain('NEGATION HANDLING');
    expect(prompt).toContain('ignore X');
    expect(prompt).toContain('EXCLUDE X tasks');
    expect(prompt).toContain('Do NOT misinterpret negations');
    expect(prompt).toContain('refer to REFLECTION INTERPRETATION RULES');
  });

  it('verifies that the agent prompt contains few-shot examples for reflection handling', async () => {
    const prompt = await prioritizationGenerator.getInstructions();

    expect(prompt).toContain('FEW-SHOT EXAMPLES');
    expect(prompt).toContain('Reflection: "ignore documentation tasks"');
    expect(prompt).toContain('→ Decision: EXCLUDE');
    expect(prompt).toContain('Reflection: "focus on mobile users"');
    expect(prompt).toContain('→ Decision: INCLUDE (if outcome-aligned)');
    expect(prompt).toContain('Reflection: "ignore wishlist items"');
    expect(prompt).toContain('→ Decision: No reflection influence');
  });

  it('verifies that the agent prompt includes all required reflection patterns', async () => {
    const prompt = await prioritizationGenerator.getInstructions();

    // Check for negation pattern instructions
    expect(prompt).toContain('ignore X');
    expect(prompt).toContain('don\'t focus on X');
    expect(prompt).toContain('avoid X');

    // Check for positive directive instructions
    expect(prompt).toContain('focus on X');
    expect(prompt).toContain('prioritize X');
    expect(prompt).toContain('emphasize X');
  });
});