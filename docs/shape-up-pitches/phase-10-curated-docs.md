# Phase 10: Task Intelligence - Curated Documentation

## Overview
This document provides implementation guidance for Task Intelligence, focusing on:
- Goal-task coverage analysis
- Task quality evaluation
- Gap-filling task generation
- Self-questioning protocol
- Intelligent UI components

## 1. Mastra Framework: Tool Creation and Async Workflows

### Creating a Custom Tool for Gap Detection

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const generateMissingTasksTool = createTool({
  id: "generate-missing-tasks",
  description: "Analyze task coverage and generate bridging tasks",
  inputSchema: z.object({
    current_tasks: z.array(z.object({
      id: z.string(),
      description: z.string(),
      embedding: z.array(z.number())
    })),
    goal_embedding: z.array(z.number()),
    coverage_threshold: z.number().min(0).max(1).default(0.7)
  }),
  outputSchema: z.object({
    missing_tasks: z.array(z.object({
      description: z.string(),
      suggested_actions: z.array(z.string()),
      estimated_complexity: z.number().min(1).max(5)
    }))
  }),
  execute: async ({ input }) => {
    // Implementation details for gap detection
    // 1. Calculate semantic similarity between tasks and goal
    // 2. Identify low-coverage areas
    // 3. Generate bridging task suggestions
  }
});
```

### Async Workflow for Gap Analysis

```typescript
const gapAnalysisWorkflow = createWorkflow({
  id: "task-gap-analysis"
})
.then(createStep(generateMissingTasksTool))
.parallel([
  createStep(evaluateTaskQualityTool),
  createStep(recommendPrioritizationTool)
])
.commit();

// Async execution
const { result } = await gapAnalysisWorkflow?.createRunAsync({
  inputData: {
    current_tasks: [...],
    goal_embedding: goalEmbedding
  }
});
```

## 2. Vector Embeddings with OpenAI (text-embedding-3-small)

### Generating Task Embeddings

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateTaskEmbedding(taskDescription: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: taskDescription,
    dimensions: 512  // More compact representation
  });

  return response.data[0].embedding;
}
```

### Similarity Calculation Methods

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, a_i, i) => sum + a_i * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, a_i) => sum + a_i * a_i, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, b_i) => sum + b_i * b_i, 0));

  return dotProduct / (magnitudeA * magnitudeB);
}

function calculateTaskCoverage(tasks: Task[], goalEmbedding: number[]) {
  return tasks.map(task => ({
    task,
    similarity: cosineSimilarity(task.embedding, goalEmbedding)
  })).filter(result => result.similarity > 0.7);
}
```

## 3. Supabase pgvector: Semantic Search and Storage

### Creating a Vector Index for Tasks

```typescript
// Supabase migration for task embeddings
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE task_embeddings (
  id UUID PRIMARY KEY,
  task_description TEXT,
  embedding vector(512),
  coverage_score FLOAT,
  quality_score FLOAT
);

// Create an IVFFlat index for faster similarity search
CREATE INDEX ON task_embeddings USING ivfflat (embedding vector_cosine_ops);
```

### Querying Similar Tasks

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function findSimilarTasks(embedding: number[], threshold = 0.7) {
  const { data, error } = await supabase.rpc('match_tasks', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: 10
  });

  if (error) throw error;
  return data;
}
```

## 4. Self-Questioning Protocol

### Implementing a Quality Scoring Tool

```typescript
const evaluateTaskQualityTool = createTool({
  id: "task-quality-evaluator",
  inputSchema: z.object({
    task_description: z.string(),
    goal_context: z.string()
  }),
  outputSchema: z.object({
    quality_score: z.number().min(0).max(1),
    improvement_suggestions: z.array(z.string())
  }),
  execute: async ({ input }) => {
    // Use GPT-4o to evaluate task clarity, specificity, and goal alignment
    const evaluation = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Evaluate the task's quality and potential for improvement"
        },
        {
          role: "user",
          content: `Evaluate this task in context of the goal:
            Task: ${input.task_description}
            Goal Context: ${input.goal_context}`
        }
      ]
    });

    // Parse and return structured quality assessment
  }
});
```

## 5. UI Components for Gap Detection

### React Component for Coverage Indicators

```typescript
function TaskCoverageIndicator({
  tasks,
  goalEmbedding,
  coverageThreshold = 0.7
}) {
  const coverage = calculateTaskCoverage(tasks, goalEmbedding);
  const coveragePercentage = (coverage.length / tasks.length) * 100;

  return (
    <div className="task-coverage-panel">
      <div
        className={`coverage-meter ${
          coveragePercentage > 80 ? 'high' :
          coveragePercentage > 50 ? 'medium' : 'low'
        }`}
      >
        {coveragePercentage.toFixed(0)}% Goal Coverage
      </div>
      {coverage.length < tasks.length && (
        <GapDetectionModal suggestedTasks={generateMissingTasksTool(/* params */)} />
      )}
    </div>
  );
}
```

## Performance Considerations

- Use `text-embedding-3-small` (512 dimensions) for faster computation
- Batch embed tasks to reduce API calls
- Cache embeddings in Supabase for repeated use
- Set reasonable similarity thresholds (0.7-0.8)

## Common Pitfalls to Avoid

1. Over-reliance on embeddings without human review
2. Generating too many low-quality bridging tasks
3. Not updating embeddings as task context changes
4. Ignoring task dependencies and skill requirements

## Recommended Next Steps

1. Implement incremental embedding updates
2. Add human-in-the-loop validation for generated tasks
3. Track embedding drift and model performance
4. Develop confidence scoring for gap detection

## References

- [Mastra Workflows Documentation](https://mastra.ai/docs/workflows)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Supabase pgvector Extension](https://supabase.com/docs/guides/database/extensions/pgvector)