import 'dotenv/config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveOutcomeAlignedTasks } from '@/lib/services/lnoTaskService';

const supabase = getSupabaseAdminClient();

async function testMetadataAPI() {
  console.log('🔍 Testing metadata API...\n');

  // Get the latest agent session
  const { data: sessions } = await supabase
    .from('agent_sessions')
    .select('id, prioritized_plan, baseline_plan, outcome_id')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!sessions || sessions.length === 0) {
    console.error('❌ No agent sessions found');
    return;
  }

  const session = sessions[0];
  const plan = session.prioritized_plan || session.baseline_plan;
  const taskIds = Array.isArray(plan?.ordered_task_ids) ? plan.ordered_task_ids : [];

  console.log(`📊 Testing with session: ${session.id?.slice(0, 8)}...`);
  console.log(`   Task IDs: ${taskIds.length}\n`);

  if (taskIds.length === 0) {
    console.error('❌ No task IDs in plan');
    return;
  }

  // Get outcome statement
  let outcomeStatement: string | null = null;
  if (session.outcome_id) {
    const { data: outcome } = await supabase
      .from('user_outcomes')
      .select('assembled_text')
      .eq('id', session.outcome_id)
      .single();
    outcomeStatement = outcome?.assembled_text || null;
  }

  console.log(`📋 Outcome: ${outcomeStatement?.slice(0, 60) || 'None'}...\n`);

  // Call the same function the API uses
  console.log('🔄 Calling resolveOutcomeAlignedTasks...\n');
  try {
    const result = await resolveOutcomeAlignedTasks(taskIds, { outcome: outcomeStatement });

    console.log('✅ Results:');
    console.log(`   Tasks returned: ${Object.keys(result).length}/${taskIds.length}\n`);

    if (Object.keys(result).length > 0) {
      console.log('📝 Sample task data:');
      Object.entries(result).slice(0, 3).forEach(([id, task], i) => {
        console.log(`\n   ${i + 1}. Task ID: ${id.slice(0, 30)}...`);
        console.log(`      Title: ${task.title}`);
        console.log(`      Category: ${task.category || 'null'}`);
        console.log(`      Has rationale: ${!!task.rationale}`);
      });
    } else {
      console.error('\n❌ PROBLEM: No task metadata returned!');
      console.error('   This is why the UI shows empty task cards.');

      // Check if tasks exist in task_embeddings
      const { data: embeddingsCheck } = await supabase
        .from('task_embeddings')
        .select('task_id, task_text, document_id')
        .in('task_id', taskIds);

      console.log(`\n   Tasks in task_embeddings: ${embeddingsCheck?.length || 0}/${taskIds.length}`);

      if (embeddingsCheck && embeddingsCheck.length > 0) {
        console.log('\n   Task embeddings data:');
        embeddingsCheck.forEach((row, i) => {
          console.log(`     ${i + 1}. ID: ${row.task_id.slice(0, 30)}...`);
          console.log(`        Text: ${row.task_text?.slice(0, 50) || 'NULL'}...`);
          console.log(`        Doc ID: ${row.document_id || 'NULL'}`);
        });
      }
    }
  } catch (error) {
    console.error('❌ Error calling resolveOutcomeAlignedTasks:');
    console.error(error);
  }
}

testMetadataAPI()
  .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
