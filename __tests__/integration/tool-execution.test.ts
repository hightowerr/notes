import { vi } from 'vitest';
import { mastra } from '@/lib/mastra/config';
import { findRegisteredTool, getRegisteredTools, initializeMastra } from '@/lib/mastra/init';
import * as embeddingService from '@/lib/services/embeddingService';
import * as vectorStorage from '@/lib/services/vectorStorage';

describe('Tool Execution Integration', () => {
  beforeAll(() => {
    initializeMastra();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers all 5 tools with Mastra', () => {
    const registeredTools = getRegisteredTools();
    expect(registeredTools).toHaveLength(5);
  });

  it('allows calling each tool through Mastra', async () => {
    for (const tool of getRegisteredTools()) {
      const mockExecute = vi.spyOn(tool, 'execute').mockResolvedValue({ success: true });
      await tool.execute({});
      expect(mockExecute).toHaveBeenCalled();
    }
  });

  it('logs tool execution to telemetry', async () => {
    const performanceSpy = vi
      .spyOn(globalThis.performance ?? { now: () => Date.now() }, 'now' as any)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(275);

    const loggerInfo = vi.fn();
    vi.spyOn(mastra, 'getLogger').mockReturnValue({ info: loggerInfo } as any);

    vi.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue(
      new Array(1536).fill(0.05)
    );
    vi.spyOn(vectorStorage, 'searchSimilarTasks').mockResolvedValue([
      {
        task_id: 'task-1',
        task_text: 'Example task',
        document_id: 'doc-1',
        similarity: 0.92,
      },
    ]);

    const semanticSearch = findRegisteredTool('semantic-search');
    expect(semanticSearch).toBeDefined();

    const result = await semanticSearch!.execute({
      query: 'increase revenue',
      limit: 1,
      threshold: 0.7,
    });

    expect(result).toMatchObject({
      query: 'increase revenue',
      count: 1,
      tasks: expect.arrayContaining([
        expect.objectContaining({
          task_id: 'task-1',
          similarity: 0.92,
        }),
      ]),
    });

    const [message, payload] = loggerInfo.mock.calls.at(-1) ?? [];
    expect(message).toBe('[Mastra][ToolExecution]');
    expect(payload).toMatchObject({
      toolId: 'semantic-search',
      status: 'success',
      durationMs: 275,
      performanceWarning: false,
      retryCount: 0,
    });

    performanceSpy.mockRestore();
  });

  it('sets performance_warning when execution exceeds threshold', async () => {
    const performanceSpy = vi
      .spyOn(globalThis.performance ?? { now: () => Date.now() }, 'now' as any)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(5105);

    const loggerInfo = vi.fn();
    vi.spyOn(mastra, 'getLogger').mockReturnValue({ info: loggerInfo } as any);

    vi.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue(
      new Array(1536).fill(0.1)
    );
    vi.spyOn(vectorStorage, 'searchSimilarTasks').mockResolvedValue([]);

    const semanticSearch = findRegisteredTool('semantic-search');
    expect(semanticSearch).toBeDefined();

    await semanticSearch!.execute({
      query: 'long running query',
      limit: 5,
      threshold: 0.7,
    });

    const [, payload] = loggerInfo.mock.calls.at(-1) ?? [];

    expect(payload).toMatchObject({
      toolId: 'semantic-search',
      performanceWarning: true,
      status: 'success',
      durationMs: 5105,
    });

    performanceSpy.mockRestore();
  });
});
