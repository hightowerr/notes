import { supabase } from '@/lib/supabase';
import { getDocumentsByTaskIds } from '@/lib/services/documentService';
import { getTaskRecordsByIds } from '@/lib/services/taskRepository';
import { DependencyAnalysisResult } from '@/lib/types/mastra';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const dependencySchema = z.object({
  dependencies: z.array(
    z.object({
      source_task_id: z.string(),
      target_task_id: z.string(),
      relationship_type: z.enum(['prerequisite', 'blocks', 'related']),
      confidence_score: z.number().min(0).max(1),
      reasoning: z.string(),
    })
  ),
});

export async function analyzeTaskDependencies(
  task_ids: string[],
  options: { includeContext: boolean }
): Promise<DependencyAnalysisResult> {
  const { tasks, missingIds } = await getTaskRecordsByIds(task_ids, {
    recoverMissing: true,
  });

  if (tasks.length === 0) {
    throw new Error('No tasks found for provided task IDs');
  }

  if (tasks.length !== task_ids.length || missingIds.length > 0) {
    throw new Error(`Missing task embeddings for IDs: ${missingIds.join(', ')}`);
  }

  let context = '';
  if (options.includeContext) {
    const documents = await getDocumentsByTaskIds(task_ids);
    context = documents
      .map((doc) => `Document: ${doc.filename}
${doc.markdown_content}`)
      .join('\n\n');
  }

  const taskDescriptions = tasks
    .map((t) => `Task ID: ${t.task_id}
Task: ${t.task_text}`)
    .join('\n\n');

  const prompt = `Analyze the following tasks and identify any dependencies between them. The available relationship types are: prerequisite, blocks, related.

Context:
${context}

Tasks:
${taskDescriptions}`;

  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: dependencySchema,
    prompt,
  });

  const result = await object;

  const validDependencies = result.dependencies.filter(
    (dep) => dep.source_task_id !== dep.target_task_id
  );

  if (validDependencies.length > 0) {
    const { error: insertError } = await supabase
      .from('task_relationships')
      .upsert(
        validDependencies.map((dep) => ({
          ...dep,
          detection_method: 'ai',
        })),
        {
          onConflict: 'source_task_id,target_task_id,relationship_type',
        }
      );

    if (insertError) {
      console.error('Failed to upsert dependencies:', insertError);
    }
  }

  return {
    dependencies: validDependencies,
    analyzed_count: tasks.length,
    context_included: options.includeContext,
  };
}
