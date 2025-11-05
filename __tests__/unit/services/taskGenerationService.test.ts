import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

vi.mock('@ai-sdk/openai', () => ({
  openai: () => () => 'mock-model',
}));

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@/lib/services/embeddingService', () => ({
  generateEmbedding: vi.fn(),
  EmbeddingError: class extends Error {},
}));

vi.mock('@/lib/services/vectorStorage', () => ({
  searchSimilarTasks: vi.fn(),
}));

vi.mock('@/lib/services/taskRepository', () => ({
  getTaskRecordsByIds: vi.fn(),
}));

let generateBridgingTasks: typeof import('@/lib/services/taskGenerationService')['generateBridgingTasks'];
let generateBridgingTasksBatch: typeof import('@/lib/services/taskGenerationService')['generateBridgingTasksBatch'];
let TaskGenerationError: typeof import('@/lib/services/taskGenerationService')['TaskGenerationError'];
let generateEmbedding: typeof import('@/lib/services/embeddingService')['generateEmbedding'];
let searchSimilarTasks: typeof import('@/lib/services/vectorStorage')['searchSimilarTasks'];
let generateObject: typeof import('ai')['generateObject'];
let getTaskRecordsByIds: typeof import('@/lib/services/taskRepository')['getTaskRecordsByIds'];

describe('taskGenerationService.generateBridgingTasks', () => {
  beforeAll(async () => {
    const serviceModule = await import('@/lib/services/taskGenerationService');
    generateBridgingTasks = serviceModule.generateBridgingTasks;
    generateBridgingTasksBatch = serviceModule.generateBridgingTasksBatch;
    TaskGenerationError = serviceModule.TaskGenerationError;

    const embeddingModule = await import('@/lib/services/embeddingService');
    generateEmbedding = embeddingModule.generateEmbedding;

    const vectorModule = await import('@/lib/services/vectorStorage');
    searchSimilarTasks = vectorModule.searchSimilarTasks;

    const aiModule = await import('ai');
    generateObject = aiModule.generateObject;

    ({ getTaskRecordsByIds } = await import('@/lib/services/taskRepository'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (getTaskRecordsByIds as unknown as vi.Mock).mockReset();
  });

  it('returns bridging tasks with metadata when generation succeeds', async () => {
    const mockTasks = [
      {
        task_id: 'task-1',
        task_text: 'Design app mockups',
        created_at: '2025-01-01T00:00:00.000Z',
        document_id: 'doc-1',
        source: 'embedding',
      },
      {
        task_id: 'task-2',
        task_text: 'Launch on app store',
        created_at: '2025-01-05T00:00:00.000Z',
        document_id: 'doc-1',
        source: 'embedding',
      },
    ];

    (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
      tasks: mockTasks,
      missingIds: [],
      recoveredTaskIds: [],
    });

    (generateEmbedding as unknown as vi.Mock).mockResolvedValue([0.1, 0.2]);
    (searchSimilarTasks as unknown as vi.Mock).mockResolvedValue([
      { task_id: 'prev-1', task_text: 'Implement UI components', similarity: 0.8, document_id: 'doc-1' },
      { task_id: 'prev-2', task_text: 'Set up backend services', similarity: 0.78, document_id: 'doc-2' },
    ]);

    (generateObject as unknown as vi.Mock).mockResolvedValue({
      object: {
        bridging_tasks: [
          {
            task_text: 'Build application frontend based on mockups',
            estimated_hours: 80,
            cognition_level: 'high',
            confidence: 0.9,
            reasoning: 'Implements the UI between design and launch.',
          },
        ],
      },
    });

    const result = await generateBridgingTasks({
      gapId: 'gap-1',
      predecessorTaskId: 'task-1',
      successorTaskId: 'task-2',
      outcomeStatement: 'Launch the app by Q4',
    });

    expect(result.bridging_tasks).toHaveLength(1);
    const [task] = result.bridging_tasks;
    expect(typeof task.id).toBe('string');
    expect(task.id).toHaveLength(36);
    expect(task.gap_id).toBe('gap-1');
    expect(task.source).toBe('ai_generated');
    expect(result.search_results_count).toBe(2);
    expect(result.generation_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('throws TaskGenerationError when tasks are missing', async () => {
    (getTaskRecordsByIds as unknown as vi.Mock).mockResolvedValue({
      tasks: [
        {
          task_id: 'task-1',
          task_text: 'Design app mockups',
          created_at: '2025-01-01T00:00:00.000Z',
          document_id: 'doc-1',
          source: 'embedding',
        },
      ],
      missingIds: ['task-2'],
      recoveredTaskIds: [],
    });

    await expect(
      generateBridgingTasks({
        gapId: 'gap-1',
        predecessorTaskId: 'task-1',
        successorTaskId: 'task-2',
      })
    ).rejects.toThrow(TaskGenerationError);
  });

  it('generates multiple gaps in parallel and returns aggregate duration metadata', async () => {
    const taskMap: Record<string, string> = {
      'task-1': 'Design app mockups',
      'task-2': 'Launch on app store',
      'task-3': 'Write onboarding emails',
      'task-4': 'Measure activation metrics',
    };

    (getTaskRecordsByIds as unknown as vi.Mock).mockImplementation(async (ids: string[]) => ({
      tasks: ids.map(id => ({
        task_id: id,
        task_text: taskMap[id] ?? `Task ${id}`,
        created_at: '2025-01-01T00:00:00.000Z',
        document_id: 'doc-batch',
        source: 'embedding',
      })),
      missingIds: [],
      recoveredTaskIds: [],
    }));

    (generateEmbedding as unknown as vi.Mock).mockResolvedValue([0.1, 0.2]);
    (searchSimilarTasks as unknown as vi.Mock)
      .mockResolvedValueOnce([
        { task_id: 'historic-1', task_text: 'Prototype UI components', similarity: 0.82, document_id: 'doc-a' },
      ])
      .mockResolvedValueOnce([
        { task_id: 'historic-2', task_text: 'Collect beta feedback', similarity: 0.78, document_id: 'doc-b' },
      ]);

    (generateObject as unknown as vi.Mock)
      .mockResolvedValueOnce({
        object: {
          bridging_tasks: [
            {
              task_text: 'Build application frontend based on mockups',
              estimated_hours: 64,
              cognition_level: 'medium',
              confidence: 0.88,
              reasoning: 'Connects design to launch readiness.',
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        object: {
          bridging_tasks: [
            {
              task_text: 'Validate onboarding messaging with target users',
              estimated_hours: 48,
              cognition_level: 'medium',
              confidence: 0.81,
              reasoning: 'Ensures emails align with activation goals.',
            },
          ],
        },
      });

    const batchResult = await generateBridgingTasksBatch([
      {
        gapId: 'gap-1',
        predecessorTaskId: 'task-1',
        successorTaskId: 'task-2',
        outcomeStatement: 'Launch the app by Q4',
      },
      {
        gapId: 'gap-2',
        predecessorTaskId: 'task-3',
        successorTaskId: 'task-4',
        outcomeStatement: 'Improve activation rate by 15%',
      },
    ]);

    expect(batchResult.total_generation_duration_ms).toBeGreaterThanOrEqual(0);
    expect(batchResult.results).toHaveLength(2);

    const byGap = Object.fromEntries(
      batchResult.results.map(entry => [entry.gapId, entry])
    );

    expect(byGap['gap-1']?.status).toBe('fulfilled');
    expect(byGap['gap-1']?.result?.bridging_tasks[0]?.task_text).toContain('frontend');

    expect(byGap['gap-2']?.status).toBe('fulfilled');
    expect(byGap['gap-2']?.result?.bridging_tasks[0]?.task_text).toContain('onboarding');

    expect(generateObject).toHaveBeenCalledTimes(2);
  });
});
