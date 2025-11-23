import { describe, it, expect } from 'vitest';
import { GENERATOR_PROMPT, generatePrioritizationInstructions, PrioritizationContext } from '@/lib/mastra/agents/prioritizationGenerator';

describe('Prioritization Prompt Structure', () => {
  it('should contain all required placeholders in the base prompt', () => {
    const requiredPlaceholders = [
      '{outcome}',
      '{reflections}',
      '{taskCount}',
      '{tasks}',
      '{previousPlan}',
      '{dependencyConstraints}'
    ];

    requiredPlaceholders.forEach(placeholder => {
      expect(GENERATOR_PROMPT).toContain(placeholder);
    });
  });

  it('should correctly replace placeholders with context values', () => {
    const context: PrioritizationContext = {
      outcome: 'Test Outcome',
      reflections: 'Test Reflections',
      taskCount: 5,
      tasks: 'Test Tasks',
      previousPlan: 'Test Previous Plan',
      dependencyConstraints: 'Test Constraints'
    };

    const instructions = generatePrioritizationInstructions(context);

    expect(instructions).toContain('Test Outcome');
    expect(instructions).toContain('Test Reflections');
    expect(instructions).toContain('(5)');
    expect(instructions).toContain('Test Tasks');
    expect(instructions).toContain('Test Previous Plan');
    expect(instructions).toContain('Test Constraints');

    // Ensure no placeholders remain
    expect(instructions).not.toContain('{outcome}');
    expect(instructions).not.toContain('{reflections}');
    expect(instructions).not.toContain('{taskCount}');
    expect(instructions).not.toContain('{tasks}');
    expect(instructions).not.toContain('{previousPlan}');
    expect(instructions).not.toContain('{dependencyConstraints}');
  });
});
