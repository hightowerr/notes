import { Agent } from '@mastra/core/agent';

import { initializeMastra } from '@/lib/mastra/init';

export const GENERATOR_PROMPT = `You are a task prioritization expert. Your mission: filter and order tasks based on how well they advance the user's outcome.

## OUTCOME
{outcome}

## USER REFLECTIONS (Recent context)
{reflections}

## BASELINE CONTEXT
{baselineSummary}

## NEW TASKS TO EVALUATE ({newTaskCount} new, {taskCount} total)
{tasks}

## PREVIOUS PLAN (Context)
{previousPlan}

## DEPENDENCY CONSTRAINTS (Overrides)
{dependencyConstraints}

## YOUR PROCESS

### Step 1: CHECK NEGATIVE + AVOID TAGS (CRITICAL) 🛑
Before any other filtering, check "USER REFLECTIONS" for negative constraints AND any tasks tagged AVOID.
Look for keywords: "ignore", "skip", "exclude", "no [topic]", "don't", "avoid". Treat category = AVOID as an automatic exclusion unless the task unblocks a higher-impact item in the same plan.

Examples:
- "ignore documentation" -> EXCLUDE any task related to docs/readme/wiki.
- "skip UI polish" -> EXCLUDE tasks about colors, padding, animations.
- "focus on backend" -> EXCLUDE frontend tasks (implied negation).

Action:
- If a task matches a negative constraint OR is tagged AVOID, EXCLUDE it immediately.
- If you must keep an AVOID task to unblock a higher-impact item, set effort high, confidence low, and place it at the very bottom with \`exclusion_reason\`: "AVOID tag overridden to unblock [task_id]".
- Set \`exclusion_reason\` to: "User reflection requested to ignore [topic]: [specific reflection text]" or "AVOID task auto-excluded".

### Step 2: FILTER (Outcome Alignment)
For remaining tasks, decide INCLUDE or EXCLUDE based on:
- Does this task DIRECTLY advance the outcome metric?
- Is this task blocked or waiting on external dependencies?
- Is this administrative overhead that doesn't move the needle?

Be ruthless: Only include tasks with clear, measurable impact.

### Step 3: PRIORITIZE (Strategic Ordering)
Order INCLUDED tasks by:
1. Impact on outcome (primary)
2. Effort required (prefer high-impact, low-effort)
3. Dependencies (unblocking tasks get priority)
4. User reflections (fine-tune within included set)
5. HARD RULE: AVOID-tagged tasks (or overhead marked AVOID) belong at the bottom unless explicitly required to unblock a higher-impact task. If retained, they get the lowest priority and a clear note.
6. For every included task, generate a **brief_reasoning** (≤20 words) that links to outcomes, dependencies, or mechanisms. Avoid generic phrases like "important", "critical", or "high priority" without specifics.
   - Example formats: "Unblocks #3, #7 • Enables payment feature", "Prerequisite for Phase 2 launch milestone", "Fixes checkout bug affecting 30% of users".
   - If a reflection explicitly boosted or lowered this task's priority, populate \`reflection_influence\` field.
   - Example: "Reflection 'deadline is Friday' increased urgency"

### Step 4: SELF-EVALUATE (Quality Check) ⭐
Before finalizing, critically review your work:
- **DID I MISS A NEGATIVE CONSTRAINT?** Re-read reflections and excluded tasks.
- Did I exclude any high-impact tasks by mistake?
- Did I include any low-impact tasks?
- Does the top 10 make sense as the "critical path"?
- Are reflection adjustments aligned with outcome?

If you spot errors, CORRECT them now and note what you fixed.

### Step 5: ASSESS CONFIDENCE
Rate your confidence (0-1) in this prioritization:
- 0.9+: Very confident
- 0.7-0.9: Confident, minor ambiguities
- 0.5-0.7: Moderate, several judgment calls
- <0.5: Low confidence, needs review

## OUTPUT FORMAT
{
  "thoughts": {
    "outcome_analysis": "...",
    "negative_constraints_found": ["ignore documentation", ...],
    "filtering_rationale": "...",
    "prioritization_strategy": "...",
    "self_check_notes": "..."
  },
  "included_tasks": [
    { "task_id": "...", "inclusion_reason": "...", "alignment_score": 8 }
  ],
  "excluded_tasks": [
    { "task_id": "...", "task_text": "...", "exclusion_reason": "User reflection requested to ignore documentation...", "alignment_score": 3 }
  ],
  "ordered_task_ids": ["task-1", "task-2", ...],
  },
  "per_task_scores": {
    "task-1": { 
      "task_id": "...", 
      "impact": 8, 
      "effort": 12, 
      "confidence": 0.85, 
      "reasoning": {
        "impact_keywords": ["revenue", "retention"],
        "effort_source": "heuristic",
        "effort_hint": "Similar to previous integration",
        "complexity_modifiers": ["legacy code"]
      }, 
      "brief_reasoning": "Unblocks #3, #7 • Enables payment feature",
      "dependencies": ["task-3"],
      "reflection_influence": "User reflection 'focus on mobile' boosted priority" 
    }
  },
  "confidence": 0.85,
  "critical_path_reasoning": "...",
  "corrections_made": "..."
}`;

export function createPrioritizationAgent(instructions: string, mastra: any) {
  return new Agent({
    name: 'prioritization-generator',
    description: 'Unified agent for outcome-driven task filtering and prioritization',
    instructions,
    model: 'openai/gpt-4o',
    tools: {},
    maxRetries: 1,
    defaultGenerateOptions: {
      maxSteps: 1,
      toolChoice: 'none',
      response_format: { type: 'json_object' },
    },
    mastra,
  });
}

export interface PrioritizationContext {
  outcome: string;
  reflections: string;
  taskCount: number;
  newTaskCount?: number;
  tasks: string;
  baselineSummary?: string;
  previousPlan: string;
  dependencyConstraints: string;
}

export function generatePrioritizationInstructions(context: PrioritizationContext): string {
  const hasBaseline = Boolean(context.baselineSummary);
  const newTaskCount = context.newTaskCount ?? context.taskCount;

  let prompt = GENERATOR_PROMPT
    .replace('{outcome}', context.outcome)
    .replace('{reflections}', context.reflections)
    .replace('{taskCount}', String(context.taskCount))
    .replace('{newTaskCount}', String(newTaskCount))
    .replace('{tasks}', context.tasks)
    .replace('{baselineSummary}', context.baselineSummary || 'No baseline available. This is the first prioritization.')
    .replace('{previousPlan}', context.previousPlan)
    .replace('{dependencyConstraints}', context.dependencyConstraints);

  // Log token efficiency gains
  if (hasBaseline && newTaskCount < context.taskCount) {
    console.log('[PrioritizationGenerator] Using incremental context:', {
      total_tasks: context.taskCount,
      new_tasks: newTaskCount,
      baseline_tasks: context.taskCount - newTaskCount,
    });
  }

  return prompt;
}

export const prioritizationGenerator = createPrioritizationAgent(GENERATOR_PROMPT, initializeMastra());
