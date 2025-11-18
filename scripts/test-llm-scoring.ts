import 'dotenv/config';
import { scoreAllTasks } from '@/lib/services/strategicScoring';
import type { TaskSummary } from '@/lib/types/agent';
import { randomUUID } from 'crypto';

const testTasks: TaskSummary[] = [
  {
    task_id: randomUUID(),
    task_text: 'Conduct spike to assess Apple Pay V6 integration for improved payment conversion',
    document_id: null,
    manual_override: false,
  },
  {
    task_id: randomUUID(),
    task_text: 'Implement CPRM response handling logic to display credit options in the UI for faster checkout',
    document_id: null,
    manual_override: false,
  },
  {
    task_id: randomUUID(),
    task_text: 'Update developer documentation for API authentication patterns',
    document_id: null,
    manual_override: false,
  },
];

const outcome = 'Increase credit payment conversion through checkout flow by 20% through better UI integration';

async function main() {
  console.log('🧪 Testing Unified LLM-based Strategic Scoring\n');
  console.log(`Outcome: ${outcome}\n`);

  const sessionId = randomUUID();

  try {
    const scores = await scoreAllTasks(testTasks, outcome, { sessionId });

    console.log('📊 Results:\n');
    testTasks.forEach((task) => {
      const score = scores[task.task_id];
      if (!score) {
        console.log(`❌ ${task.task_text.slice(0, 60)}... - FAILED TO SCORE`);
        return;
      }

      const quadrant =
        score.impact >= 5 && score.effort <= 8
          ? '🌟 Quick Win (LEVERAGE)'
          : score.impact >= 5
            ? '🚀 Strategic Bet'
            : score.effort <= 8
              ? '⚡ Incremental (NEUTRAL)'
              : '⏸ Avoid';

      console.log(`\n${quadrant}`);
      console.log(`Task: ${task.task_text.slice(0, 80)}...`);
      console.log(`Impact: ${score.impact}/10 | Effort: ${score.effort}h | Confidence: ${score.confidence}`);
      console.log(`Priority: ${score.priority.toFixed(1)}`);
      console.log(`Source: ${score.reasoning.effort_source}`);
      if (score.reasoning.impact_keywords?.length) {
        console.log(`Keywords: ${score.reasoning.impact_keywords.join(', ')}`);
      }
      if (score.reasoning.complexity_modifiers?.length) {
        console.log(`Complexity: ${score.reasoning.complexity_modifiers.join(', ')}`);
      }
    });

    console.log('\n✅ Test complete!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
