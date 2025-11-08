import 'dotenv/config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

const supabase = getSupabaseAdminClient();

async function checkDatabaseTasks() {
  console.log('🔍 Checking database for tasks...\n');

  // Check task_embeddings
  const { data: embeddings, error: embeddingsError, count: embeddingsCount } = await supabase
    .from('task_embeddings')
    .select('*', { count: 'exact', head: false })
    .limit(5);

  console.log('📊 task_embeddings table:');
  if (embeddingsError) {
    console.error('  ❌ Error:', embeddingsError.message);
  } else {
    console.log(`  ✅ Total count: ${embeddingsCount ?? 0}`);
    console.log(`  ✅ Sample rows: ${embeddings?.length ?? 0}`);
    if (embeddings && embeddings.length > 0) {
      console.log('\n  Sample task IDs:');
      embeddings.slice(0, 3).forEach((row, i) => {
        console.log(`    ${i + 1}. ${row.task_id?.slice(0, 50)}...`);
        console.log(`       Text: ${row.task_text?.slice(0, 60)}...`);
      });
    }
  }

  // Check processed_documents
  const { data: docs, error: docsError, count: docsCount } = await supabase
    .from('processed_documents')
    .select('id, structured_output', { count: 'exact', head: false })
    .limit(5);

  console.log('\n📊 processed_documents table:');
  if (docsError) {
    console.error('  ❌ Error:', docsError.message);
  } else {
    console.log(`  ✅ Total count: ${docsCount ?? 0}`);
    console.log(`  ✅ Sample rows: ${docs?.length ?? 0}`);
    if (docs && docs.length > 0) {
      console.log('\n  Sample documents:');
      docs.slice(0, 3).forEach((doc, i) => {
        const lnoTasks = doc.structured_output?.lno_tasks;
        const leverageCount = Array.isArray(lnoTasks?.leverage) ? lnoTasks.leverage.length : 0;
        const neutralCount = Array.isArray(lnoTasks?.neutral) ? lnoTasks.neutral.length : 0;
        const overheadCount = Array.isArray(lnoTasks?.overhead) ? lnoTasks.overhead.length : 0;
        console.log(`    ${i + 1}. ${doc.id}`);
        console.log(`       LNO tasks: ${leverageCount + neutralCount + overheadCount} (L:${leverageCount}, N:${neutralCount}, O:${overheadCount})`);
      });
    }
  }

  // Check agent_sessions
  const { data: sessions, error: sessionsError } = await supabase
    .from('agent_sessions')
    .select('id, status, prioritized_plan, baseline_plan, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('\n📊 agent_sessions table (latest):');
  if (sessionsError) {
    console.error('  ❌ Error:', sessionsError.message);
  } else {
    console.log(`  ✅ Found ${sessions?.length ?? 0} recent sessions`);
    if (sessions && sessions.length > 0) {
      sessions.forEach((session, i) => {
        const plan = session.prioritized_plan || session.baseline_plan;
        const taskIds = Array.isArray(plan?.ordered_task_ids) ? plan.ordered_task_ids : [];
        console.log(`\n    ${i + 1}. Session: ${session.id?.slice(0, 8)}...`);
        console.log(`       Status: ${session.status}`);
        console.log(`       Tasks in plan: ${taskIds.length}`);
        if (taskIds.length > 0) {
          console.log(`       Sample task IDs:`);
          taskIds.slice(0, 3).forEach((id, j) => {
            console.log(`         ${j + 1}. ${id?.slice(0, 50)}...`);
          });
        }
      });
    }
  }
}

checkDatabaseTasks()
  .then(() => {
    console.log('\n✅ Database check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Database check failed:', error);
    process.exit(1);
  });
