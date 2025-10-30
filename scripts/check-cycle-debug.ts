import { supabase } from '../lib/supabase';

async function checkCycleDebug() {
  const taskId1 = 'a5d1df83';
  const taskId2 = '26c3ae6e';

  console.log('\n=== Checking Task Relationships ===\n');

  // Get all relationships
  const { data: allRelationships, error } = await supabase
    .from('task_relationships')
    .select('source_task_id, target_task_id')
    .or(`source_task_id.like.${taskId1}%,target_task_id.like.${taskId1}%,source_task_id.like.${taskId2}%,target_task_id.like.${taskId2}%`);

  if (error) {
    console.error('Error fetching relationships:', error);
    return;
  }

  console.log('Relationships involving these tasks:');
  console.log(JSON.stringify(allRelationships, null, 2));

  // Get full task IDs
  const { data: tasks } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text')
    .or(`task_id.like.${taskId1}%,task_id.like.${taskId2}%`);

  console.log('\n=== Full Task IDs ===\n');
  console.log(JSON.stringify(tasks, null, 2));

  // Check for reverse edge specifically
  if (allRelationships && allRelationships.length > 0) {
    console.log('\n=== Checking for Reverse Edge ===\n');

    const fullTaskIds = tasks?.map(t => t.task_id) || [];

    for (const fullId1 of fullTaskIds) {
      for (const fullId2 of fullTaskIds) {
        if (fullId1 === fullId2) continue;

        const forwardEdge = allRelationships.find(
          rel => rel.source_task_id === fullId1 && rel.target_task_id === fullId2
        );

        const reverseEdge = allRelationships.find(
          rel => rel.source_task_id === fullId2 && rel.target_task_id === fullId1
        );

        if (forwardEdge || reverseEdge) {
          console.log(`Between ${fullId1.substring(0, 8)} and ${fullId2.substring(0, 8)}:`);
          console.log(`  Forward (${fullId1.substring(0, 8)} → ${fullId2.substring(0, 8)}):`, !!forwardEdge);
          console.log(`  Reverse (${fullId2.substring(0, 8)} → ${fullId1.substring(0, 8)}):`, !!reverseEdge);
        }
      }
    }
  }
}

checkCycleDebug().then(() => {
  console.log('\n=== Done ===\n');
  process.exit(0);
}).catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
