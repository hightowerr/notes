import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { embed, generateObject } from 'ai';
import { AgentSessionResult, CoverageAnalysis } from '../schemas/taskIntelligence';
import { calculateCosineSimilarity } from './aiSummarizer'; // Reuse existing function

/**
 * Calculates the centroid of task embeddings (average of all vectors)
 * @param embeddings Array of embedding vectors
 * @returns Centroid vector
 */
export function calculateCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    // Return zero vector if no embeddings
    return Array(1536).fill(0); // Assuming 1536-dim vectors as per data model
  }
  
  const dimensions = embeddings[0].length;
  const centroid = new Array(dimensions).fill(0);
  
  // Sum all embeddings
  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }
  
  // Calculate average
  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }
  
  return centroid;
}

/**
 * Analyzes coverage of tasks against an outcome goal
 * @param outcomeText The outcome/goal text
 * @param taskIds IDs of tasks to analyze
 * @param taskTexts Texts of the tasks (for LLM analysis)
 * @param taskEmbeddings Embeddings of the tasks
 * @returns Coverage analysis result
 */
export async function analyzeCoverage(
  outcomeText: string,
  taskIds: string[],
  taskTexts: string[],
  taskEmbeddings: number[][]
): Promise<CoverageAnalysis> {
  // Calculate task cluster centroid
  const taskCentroid = calculateCentroid(taskEmbeddings);
  
  // Generate embedding for outcome text
  const { embedding: outcomeEmbedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: outcomeText,
  });

  // Calculate cosine similarity between outcome and task centroid
  const similarity = calculateCosineSimilarity(outcomeEmbedding, taskCentroid);

  // Convert similarity to percentage (0-100)
  const coveragePercentage = Math.round(similarity * 100);

  // Extract missing concepts if coverage is below threshold
  let missingAreas: string[] = [];
  if (coveragePercentage < 70) {
    missingAreas = await extractMissingConcepts(outcomeText, taskTexts);
  }

  const now = new Date().toISOString();

  return {
    coverage_percentage: coveragePercentage,
    missing_areas: missingAreas,
    goal_embedding: outcomeEmbedding,
    task_cluster_centroid: taskCentroid,
    analysis_timestamp: now,
    task_count: taskIds.length,
    threshold_used: 0.7, // Fixed threshold for coverage analysis
  };
}

/**
 * Uses LLM to extract missing conceptual areas from tasks relative to the outcome
 * @param outcomeText The desired outcome
 * @param taskTexts The existing tasks
 * @returns List of missing conceptual areas
 */
async function extractMissingConcepts(outcomeText: string, taskTexts: string[]): Promise<string[]> {
  const prompt = `
    The desired outcome is: "${outcomeText}"

    The existing tasks are:
    ${taskTexts.map((task, i) => `${i + 1}. ${task}`).join('\n')}

    Identify 2-5 conceptual areas that are missing from the tasks but would help achieve the outcome.
  `;

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      system: 'You are an intelligent assistant that identifies gaps between desired outcomes and existing tasks. Return only the requested JSON format.',
      prompt: prompt,
      temperature: 0.3,
      schema: z.object({
        missing_areas: z.array(z.string()).min(0).max(5)
      })
    });

    return object.missing_areas;
  } catch (error) {
    console.error('[TaskIntelligence:extractMissingConcepts] Error extracting missing concepts:', error);
    return [];
  }
}