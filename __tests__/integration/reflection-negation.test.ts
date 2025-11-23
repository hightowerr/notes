import { describe, it, expect } from 'vitest';
import { GENERATOR_PROMPT, createPrioritizationAgent, generatePrioritizationInstructions } from '@/lib/mastra/agents/prioritizationGenerator';
import { initializeMastra } from '@/lib/mastra/init';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';

// --- Schemas ---

const excludedTaskSchema = z.object({
  task_id: z.string(),
  task_text: z.string().optional(),
  exclusion_reason: z.string(),
  alignment_score: z.number().optional(),
});

const prioritizationResultSchema = z.object({
  excluded_tasks: z.array(excludedTaskSchema),
});

// --- Types & Helpers ---

interface Task {
  task_id: string;
  task_text: string;
  document_id: string;
}

interface TestCase {
  id: string;
  reflection: string;
  tasks: {
    text: string;
    shouldExclude: boolean;
  }[];
}

function createAgentContext(outcome: string, reflection: string, tasks: Task[]) {
  return {
    outcome: { assembled_text: outcome },
    reflections: [{ text: reflection, created_at: new Date().toISOString() }],
    tasks: tasks,
    taskCount: tasks.length,
    previousPlan: "No previous plan available.",
    dependencyConstraints: "No manual dependency overrides."
  };
}

// --- Test Data ---

const TEST_SCENARIOS: TestCase[] = [
  // 1. Direct Negation
  {
    id: "simple-ignore",
    reflection: "ignore documentation tasks",
    tasks: [
      { text: "Update API documentation", shouldExclude: true },
      { text: "Fix login bug", shouldExclude: false }
    ]
  },
  {
    id: "simple-skip",
    reflection: "skip UI polish tasks",
    tasks: [
      { text: "Change button color to blue", shouldExclude: true },
      { text: "Optimize database query", shouldExclude: false }
    ]
  },
  {
    id: "simple-exclude",
    reflection: "exclude marketing emails",
    tasks: [
      { text: "Draft newsletter for Q3", shouldExclude: true },
      { text: "Implement user registration", shouldExclude: false }
    ]
  },
  
  // 2. Compound Negation
  {
    id: "compound-and",
    reflection: "ignore meetings and administrative work",
    tasks: [
      { text: "Schedule team sync", shouldExclude: true },
      { text: "Fill out expense report", shouldExclude: true },
      { text: "Code new feature", shouldExclude: false }
    ]
  },
  {
    id: "compound-comma",
    reflection: "no research, no interviews",
    tasks: [
      { text: "Conduct user interviews", shouldExclude: true },
      { text: "Research competitor pricing", shouldExclude: true },
      { text: "Build prototype", shouldExclude: false }
    ]
  },

  // 3. Contextual/Nuanced
  {
    id: "focus-negation",
    reflection: "focus on backend, ignore frontend",
    tasks: [
      { text: "Update React components", shouldExclude: true },
      { text: "Optimize SQL queries", shouldExclude: false }
    ]
  },
  {
    id: "temporal-negation",
    reflection: "don't worry about long-term strategy for now",
    tasks: [
      { text: "Write 5-year vision doc", shouldExclude: true },
      { text: "Fix critical crash", shouldExclude: false }
    ]
  },

  // 4. False Positive Checks (Keywords in text shouldn't trigger exclusion unless requested)
  {
    id: "false-positive-keyword",
    reflection: "prioritize urgent bugs",
    tasks: [
      { text: "Fix bug in 'ignore' list logic", shouldExclude: false }, // Contains "ignore"
      { text: "Fix critical bug in exclude feature", shouldExclude: false } // Contains "exclude"
    ]
  },
  
  // 5. Specific Topic Negation
  {
    id: "topic-social-media",
    reflection: "ignore social media tasks",
    tasks: [
      { text: "Post to Twitter", shouldExclude: true },
      { text: "Update LinkedIn profile", shouldExclude: true },
      { text: "Fix auth flow", shouldExclude: false }
    ]
  },
  {
    id: "topic-hiring",
    reflection: "skip hiring related tasks",
    tasks: [
      { text: "Review resumes", shouldExclude: true },
      { text: "Interview candidate", shouldExclude: true },
      { text: "Deploy to prod", shouldExclude: false }
    ]
  },
  {
    id: "topic-finance",
    reflection: "exclude financial planning",
    tasks: [
      { text: "Create Q4 budget", shouldExclude: true },
      { text: "Update landing page", shouldExclude: false }
    ]
  },
  {
    id: "topic-legal",
    reflection: "no legal reviews today",
    tasks: [
      { text: "Review privacy policy", shouldExclude: true },
      { text: "Update terms of service", shouldExclude: true },
      { text: "Refactor sidebar", shouldExclude: false }
    ]
  },
  {
    id: "topic-maintenance",
    reflection: "ignore routine maintenance",
    tasks: [
      { text: "Update dependencies", shouldExclude: true },
      { text: "Rotate logs", shouldExclude: true },
      { text: "New feature spec", shouldExclude: false }
    ]
  },
  {
    id: "topic-analytics",
    reflection: "skip analytics integration",
    tasks: [
      { text: "Add Google Analytics events", shouldExclude: true },
      { text: "Design new logo", shouldExclude: false }
    ]
  },
  {
    id: "topic-translation",
    reflection: "exclude translation work",
    tasks: [
      { text: "Translate app to Spanish", shouldExclude: true },
      { text: "Fix typo in English", shouldExclude: false }
    ]
  },
  
  // 6. "Not" phrasing
  {
    id: "not-phrasing",
    reflection: "do not include design tasks",
    tasks: [
      { text: "Create Figma mockups", shouldExclude: true },
      { text: "Setup CI/CD pipeline", shouldExclude: false }
    ]
  },
  {
    id: "avoid-phrasing",
    reflection: "avoid testing tasks for this sprint",
    tasks: [
      { text: "Write unit tests", shouldExclude: true },
      { text: "Implement feature X", shouldExclude: false }
    ]
  },
  
  // 7. Ambiguous/Soft Negation
  {
    id: "soft-low-priority",
    reflection: "treat documentation as low priority (or ignore if busy)",
    tasks: [
      { text: "Update readme", shouldExclude: true }, // Should likely be excluded based on "ignore if busy" hint or just prioritized low. 
      // For this test, we'll assume strict exclusion if "ignore" is mentioned as an option.
      { text: "Critical hotfix", shouldExclude: false }
    ]
  },
  
  // 8. Specific Entity Negation
  {
    id: "entity-competitor",
    reflection: "ignore CompetitorX analysis",
    tasks: [
      { text: "Analyze CompetitorX pricing", shouldExclude: true },
      { text: "Analyze CompetitorY pricing", shouldExclude: false }
    ]
  },
  {
    id: "entity-feature",
    reflection: "skip Dark Mode implementation",
    tasks: [
      { text: "Implement Dark Mode toggle", shouldExclude: true },
      { text: "Implement Light Mode fixes", shouldExclude: false }
    ]
  }
];

// --- Test Suite ---

describe('Reflection Negation Accuracy Benchmark', () => {
  const mastra = initializeMastra();

  // Helper to run a single scenario
  async function runScenario(scenario: TestCase) {
    const tasks = scenario.tasks.map(t => ({
      task_id: uuid(),
      task_text: t.text,
      document_id: "doc-1",
      shouldExclude: t.shouldExclude
    }));

    const context = createAgentContext(
      "Maximize productivity and deliver core features", // Generic outcome
      scenario.reflection,
      tasks
    );

    const reflectionsText = context.reflections.map(r => `- ${r.text}`).join('\n');
    const tasksText = context.tasks.map(t => 
      JSON.stringify({ id: t.task_id, text: t.task_text })
    ).join('\n');

    const filledInstructions = generatePrioritizationInstructions({
      outcome: context.outcome.assembled_text,
      reflections: reflectionsText,
      taskCount: context.tasks.length,
      tasks: tasksText,
      previousPlan: context.previousPlan,
      dependencyConstraints: context.dependencyConstraints,
    });

    const agent = createPrioritizationAgent(filledInstructions, mastra);

    try {
      const result = await agent.generate([], {
        maxSteps: 1,
        toolChoice: 'none',
        response_format: { type: 'json_object' },
      });

      let rawOutput = result.text;
      rawOutput = rawOutput.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = prioritizationResultSchema.parse(JSON.parse(rawOutput));
      
      return { parsed, tasks };
    } catch (error) {
      console.error(`Failed scenario ${scenario.id}:`, error);
      return null;
    }
  }

  it('should achieve >= 95% accuracy in negation handling', async () => {
    let correctDecisions = 0;
    let totalDecisions = 0;
    const failures: string[] = [];

    console.log(`\nRunning ${TEST_SCENARIOS.length} scenarios...`);

    // Run in batches to speed up execution while avoiding rate limits
    const BATCH_SIZE = 5;
    for (let i = 0; i < TEST_SCENARIOS.length; i += BATCH_SIZE) {
      const batch = TEST_SCENARIOS.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(TEST_SCENARIOS.length / BATCH_SIZE)}...`);
      
      const results = await Promise.all(batch.map(scenario => runScenario(scenario)));

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const scenario = batch[j];

        if (!result) {
          failures.push(`${scenario.id}: Agent failed to generate valid JSON`);
          totalDecisions += scenario.tasks.length;
          continue;
        }

        const { parsed, tasks } = result;

        for (const task of tasks) {
          const isExcluded = parsed.excluded_tasks.some(t => t.task_id === task.task_id);
          
          // Check if decision matches expectation
          if (isExcluded === task.shouldExclude) {
            correctDecisions++;
          } else {
            failures.push(
              `[${scenario.id}] Task "${task.task_text}" - Expected Exclude: ${task.shouldExclude}, Got: ${isExcluded}` +
              (isExcluded ? ` (Reason: ${parsed.excluded_tasks.find(t => t.task_id === task.task_id)?.exclusion_reason})` : "")
            );
          }
          totalDecisions++;
        }
      }
    }

    const accuracy = (correctDecisions / totalDecisions) * 100;
    console.log(`\nResults: ${correctDecisions}/${totalDecisions} correct (${accuracy.toFixed(1)}%)`);
    
    if (failures.length > 0) {
      console.log("\nFailures:");
      failures.forEach(f => console.log(`- ${f}`));
    }

    // The Requirement: 95% Accuracy
    expect(accuracy).toBeGreaterThanOrEqual(95);
  }, 300000); // 5 minute timeout for all scenarios
});
