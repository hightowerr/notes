import 'dotenv/config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const supabase = getSupabaseAdminClient();

async function verifyMismatch() {
  console.log('🔍 Checking for task ID mismatch...\n');

  // Get the latest agent session
  const { data: sessions, error: sessionsError } = await supabase
    .from('agent_sessions')
    .select('id, prioritized_plan, baseline_plan')
    .order('created_at', { ascending: false })
    .limit(1);

  if (sessionsError || !sessions || sessions.length === 0) {
    console.error('❌ No agent sessions found');
    return;
  }

  const session = sessions[0];
  const plan = session.prioritized_plan || session.baseline_plan;
  const taskIds = Array.isArray(plan?.ordered_task_ids) ? plan.ordered_task_ids : [];

  console.log(`📊 Latest session: ${session.id?.slice(0, 8)}...`);
  console.log(`   Task IDs in plan: ${taskIds.length}\n`);

  if (taskIds.length === 0) {
    console.error('❌ No task IDs found in plan');
    return;
  }

  // Check which task IDs exist in task_embeddings
  const { data: matchingTasks, error: embeddingsError } = await supabase
    .from('task_embeddings')
    .select('task_id')
    .in('task_id', taskIds);

  if (embeddingsError) {
    console.error('❌ Error querying task_embeddings:', embeddingsError.message);
    return;
  }

  const matchingIds = new Set(matchingTasks?.map(t => t.task_id) || []);

  console.log('🔍 Task ID matching results:');
  console.log(`   ✅ Found in database: ${matchingIds.size}/${taskIds.length}`);
  console.log(`   ❌ Missing from database: ${taskIds.length - matchingIds.size}/${taskIds.length}\n`);

  if (matchingIds.size < taskIds.length) {
    console.log('❌ PROBLEM IDENTIFIED:');
    console.log('   The agent session contains task IDs that don\'t exist in task_embeddings!');
    console.log('\n   Missing task IDs:');
    taskIds.forEach((id, i) => {
      if (!matchingIds.has(id)) {
        console.log(`     ${i + 1}. ${id?.slice(0, 50)}...`);
      }
    });
  } else {
    console.log('✅ All task IDs exist in database');
  }

  // Show sample of actual task IDs that DO exist
  console.log('\n📋 Sample of VALID task IDs in database:');
  const { data: validTasks } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text')
    .limit(5);

  validTasks?.forEach((task, i) => {
    console.log(`   ${i + 1}. ${task.task_id?.slice(0, 50)}...`);
    console.log(`      "${task.task_text?.slice(0, 60)}..."`);
  });
}

verifyMismatch()
  .then(() => {
    console.log('\n✅ Verification complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });
