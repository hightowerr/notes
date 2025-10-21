const createPostgrestBuilder = (result: { data: unknown; error: unknown }) => {
  const promise = Promise.resolve(result);
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnValue(promise),
    then: (resolve: unknown, reject?: unknown) =>
      promise.then(resolve as (value: typeof result) => unknown, reject as (reason: unknown) => unknown),
  };
  builder.or.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  return builder;
};

import { semanticSearchTool } from '@/lib/mastra/tools/semanticSearch';
import { getDocumentContextTool } from '@/lib/mastra/tools/getDocumentContext';
import { detectDependenciesTool } from '@/lib/mastra/tools/detectDependencies';
import { queryTaskGraphTool } from '@/lib/mastra/tools/queryTaskGraph';
import { clusterBySimilarityTool } from '@/lib/mastra/tools/clusterBySimilarity';
import * as embeddingService from '@/lib/services/embeddingService';
import * as vectorStorage from '@/lib/services/vectorStorage';
import * as documentService from '@/lib/services/documentService';
import * as dependencyService from '@/lib/services/dependencyService';
import * as clusteringService from '@/lib/services/clusteringService';
import { DocumentContext, DependencyAnalysisResult, TaskRelationship, ClusteringResult } from '@/lib/types/mastra';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('Mastra Tools', () => {
  describe('semantic-search', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('validates input schema and applies defaults', () => {
      const parsed = semanticSearchTool.inputSchema.parse({ query: '  revenue goals ' });
      expect(parsed).toEqual({ query: 'revenue goals', limit: 20, threshold: 0.7 });

      expect(() => semanticSearchTool.inputSchema.parse({ query: '' })).toThrow();

      const maxLengthQuery = 'a'.repeat(500);
      expect(
        semanticSearchTool.inputSchema.parse({ query: maxLengthQuery, limit: 100, threshold: 1 })
      ).toEqual({ query: maxLengthQuery, limit: 100, threshold: 1 });

      expect(() =>
        semanticSearchTool.inputSchema.parse({ query: `${maxLengthQuery}b` })
      ).toThrow();

      expect(
        semanticSearchTool.inputSchema.parse({ query: 'test', limit: 1, threshold: 0 })
      ).toEqual({ query: 'test', limit: 1, threshold: 0 });
    });

    it('executes search and returns sorted, filtered tasks', async () => {
      const embedding = Array(1536).fill(0.1);
      vi.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue(embedding);
      vi.spyOn(vectorStorage, 'searchSimilarTasks').mockResolvedValue([
        { task_id: 'b', task_text: 'Task B', document_id: 'doc-b', similarity: 0.72 },
        { task_id: 'a', task_text: 'Task A', document_id: 'doc-a', similarity: 0.91 },
        { task_id: 'c', task_text: 'Task C', document_id: 'doc-c', similarity: 0.65 }, // below threshold
      ]);

      const result = await semanticSearchTool.execute({
        query: 'increase monthly revenue',
        limit: 5,
        threshold: 0.7,
      });

      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('increase monthly revenue');
      expect(vectorStorage.searchSimilarTasks).toHaveBeenCalledWith(embedding, 0.7, 5);

      expect(result.count).toBe(2);
      expect(result.tasks.map((task) => task.task_id)).toEqual(['a', 'b']);
      expect(result.tasks[0].similarity).toBeGreaterThanOrEqual(result.tasks[1].similarity);
      expect(result.query).toBe('increase monthly revenue');
    });

    it('maps embedding failures to tool error codes', async () => {
      const error = new embeddingService.EmbeddingError('Embedding generation failed');
      vi.spyOn(embeddingService, 'generateEmbedding').mockRejectedValue(error);
      vi.spyOn(vectorStorage, 'searchSimilarTasks').mockResolvedValue([]);

      await expect(
        semanticSearchTool.execute({ query: 'test', limit: 5, threshold: 0.7 })
      ).rejects.toMatchObject({ code: 'EMBEDDING_GENERATION_FAILED' });
    });

    it('maps storage failures to database tool error', async () => {
      vi.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue(Array(1536).fill(0.1));
      const storageError = new vectorStorage.StorageError('Supabase RPC failed');
      vi.spyOn(vectorStorage, 'searchSimilarTasks').mockRejectedValue(storageError);

      await expect(
        semanticSearchTool.execute({ query: 'test', limit: 5, threshold: 0.7 })
      ).rejects.toMatchObject({ code: 'DATABASE_ERROR' });
    });

    it('rejects invalid threshold values', async () => {
      await expect(
        semanticSearchTool.execute({ query: 'test', limit: 5, threshold: 1.2 })
      ).rejects.toMatchObject({ code: 'INVALID_THRESHOLD' });
    });

    it('rejects invalid limit values', async () => {
      await expect(
        semanticSearchTool.execute({ query: 'test', limit: 0, threshold: 0.5 })
      ).rejects.toMatchObject({ code: 'INVALID_LIMIT' });
    });
  });

  describe('get-document-context', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('validates input schema and applies defaults', () => {
      const parsed = getDocumentContextTool.inputSchema.parse({ task_ids: ['task1'] });
      expect(parsed).toEqual({ task_ids: ['task1'] });

      const withChunk = getDocumentContextTool.inputSchema.parse({ task_ids: ['task1'], chunk_number: 2 });
      expect(withChunk).toEqual({ task_ids: ['task1'], chunk_number: 2 });

      expect(() => getDocumentContextTool.inputSchema.parse({ task_ids: [] })).toThrow();
      expect(() => getDocumentContextTool.inputSchema.parse({ task_ids: ['task1'], chunk_number: 0 })).toThrow();
    });

    it('executes and returns document contexts', async () => {
      const mockDocuments: DocumentContext[] = [
        {
          document_id: 'doc1',
          filename: 'doc1.txt',
          markdown_content: 'content1',
          tasks_in_document: [{ task_id: 'task1', task_text: 'text1' }],
          pagination_metadata: null,
        },
      ];
      vi.spyOn(documentService, 'getDocumentsByTaskIds').mockResolvedValue(mockDocuments);

      const result = await getDocumentContextTool.execute({ task_ids: ['task1'] });

      expect(documentService.getDocumentsByTaskIds).toHaveBeenCalledWith(['task1'], undefined);
      expect(result.documents).toEqual(mockDocuments);
    });

    it('maps document not found errors', async () => {
        const error = new Error('Document(s) removed during retrieval');
        vi.spyOn(documentService, 'getDocumentsByTaskIds').mockRejectedValue(error);

        await expect(
            getDocumentContextTool.execute({ task_ids: ['task1'] })
        ).rejects.toMatchObject({ code: 'DOCUMENT_DELETED' });
    });

    it('maps task not found errors', async () => {
        const error = new Error('Failed to fetch tasks');
        vi.spyOn(documentService, 'getDocumentsByTaskIds').mockRejectedValue(error);

        await expect(
            getDocumentContextTool.execute({ task_ids: ['task1'] })
        ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    });

    it('throws task not found when service returns empty documents array', async () => {
      vi.spyOn(documentService, 'getDocumentsByTaskIds').mockResolvedValue([]);

      await expect(
        getDocumentContextTool.execute({ task_ids: ['task1'] })
      ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    });
  });

  describe('detect-dependencies', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('validates input schema and applies defaults', () => {
      const parsed = detectDependenciesTool.inputSchema.parse({ task_ids: ['task1', 'task2'] });
      expect(parsed).toEqual({ task_ids: ['task1', 'task2'], use_document_context: true });

      const withContext = detectDependenciesTool.inputSchema.parse({
        task_ids: ['task1', 'task2'],
        use_document_context: false,
      });
      expect(withContext).toEqual({ task_ids: ['task1', 'task2'], use_document_context: false });

      expect(() => detectDependenciesTool.inputSchema.parse({ task_ids: [] })).toThrow();
      const singleTaskParsed = detectDependenciesTool.inputSchema.parse({ task_ids: ['only-one'] });
      expect(singleTaskParsed).toEqual({ task_ids: ['only-one'], use_document_context: true });
    });

    it('executes and returns dependency analysis', async () => {
      const mockAnalysis: DependencyAnalysisResult = {
        dependencies: [],
        analyzed_count: 1,
        context_included: true,
      };
      vi.spyOn(dependencyService, 'analyzeTaskDependencies').mockResolvedValue(mockAnalysis);

      const result = await detectDependenciesTool.execute({ task_ids: ['task1', 'task2'] });

      expect(dependencyService.analyzeTaskDependencies).toHaveBeenCalledWith(['task1', 'task2'], {
        includeContext: true,
      });
      expect(result).toEqual(mockAnalysis);
    });

    it('maps invalid task ID errors', async () => {
      const error = new Error('Missing task embeddings for IDs');
      vi.spyOn(dependencyService, 'analyzeTaskDependencies').mockRejectedValue(error);

      await expect(
        detectDependenciesTool.execute({ task_ids: ['task1', 'task2'] })
      ).rejects.toMatchObject({ code: 'INVALID_TASK_IDS' });
    });

    it('maps AI service errors', async () => {
      const error = new Error('AI service unavailable');
      vi.spyOn(dependencyService, 'analyzeTaskDependencies').mockRejectedValue(error);

      await expect(
        detectDependenciesTool.execute({ task_ids: ['task1', 'task2'] })
      ).rejects.toMatchObject({ code: 'AI_SERVICE_UNAVAILABLE' });
    });

    it('maps AI extraction failures', async () => {
      const error = new Error('Failed to parse AI response');
      vi.spyOn(dependencyService, 'analyzeTaskDependencies').mockRejectedValue(error);

      await expect(
        detectDependenciesTool.execute({ task_ids: ['task1', 'task2'] })
      ).rejects.toMatchObject({ code: 'AI_EXTRACTION_FAILED' });
    });

    it('rejects execution when fewer than two task IDs provided', async () => {
      await expect(
        detectDependenciesTool.execute({ task_ids: ['solo-task'] })
      ).rejects.toMatchObject({
        code: 'INSUFFICIENT_TASKS',
      });
    });
  });

  describe('query-task-graph', () => {
    afterEach(() => {
      vi.clearAllMocks();
    });

    it('validates input schema and applies defaults', () => {
      const parsed = queryTaskGraphTool.inputSchema.parse({ task_id: 'task1' });
      expect(parsed).toEqual({ task_id: 'task1', relationship_type: 'all' });

      const withType = queryTaskGraphTool.inputSchema.parse({ task_id: 'task1', relationship_type: 'prerequisite' });
      expect(withType).toEqual({ task_id: 'task1', relationship_type: 'prerequisite' });

      expect(() => queryTaskGraphTool.inputSchema.parse({})).toThrow();
    });

    it('executes and returns task relationships', async () => {
      const mockRelationships: TaskRelationship[] = [
        {
          id: 'rel1',
          source_task_id: 'task1',
          target_task_id: 'task2',
          relationship_type: 'prerequisite',
          confidence_score: 0.9,
          detection_method: 'ai',
          created_at: new Date(),
          updated_at: new Date(),
        }
      ];
      const relationshipsBuilder = createPostgrestBuilder({ data: mockRelationships, error: null });
      const taskLookupBuilder = createPostgrestBuilder({ data: { task_id: 'task1' }, error: null });

      const supabaseFromMock = supabase.from as ReturnType<typeof vi.fn>;
      supabaseFromMock.mockImplementation((table: string) => {
        if (table === 'task_relationships') {
          return relationshipsBuilder;
        }
        if (table === 'task_embeddings') {
          return taskLookupBuilder;
        }
        throw new Error(`Unexpected table ${table}`);
      });

      const result = await queryTaskGraphTool.execute({ task_id: 'task1', relationship_type: 'prerequisite' });

      expect(result.relationships).toEqual(mockRelationships);
      expect(result.task_id).toBe('task1');
      expect(result.filter_applied).toBe('prerequisite');
    });

    it('maps database errors', async () => {
      const error = { message: 'database error' };
      const relationshipsBuilder = createPostgrestBuilder({ data: null, error });

      const supabaseFromMock = supabase.from as ReturnType<typeof vi.fn>;
      supabaseFromMock.mockImplementation((table: string) => {
        if (table === 'task_relationships') {
          return relationshipsBuilder;
        }
        return createPostgrestBuilder({ data: { task_id: 'task1' }, error: null });
      });

        await expect(
            queryTaskGraphTool.execute({ task_id: 'task1' })
        ).rejects.toMatchObject({ code: 'DATABASE_ERROR' });
    });

    it('returns empty relationships when task exists with no links', async () => {
      const relationshipsBuilder = createPostgrestBuilder({ data: [], error: null });
      const taskLookupBuilder = createPostgrestBuilder({ data: { task_id: 'task1' }, error: null });

      const supabaseFromMock = supabase.from as ReturnType<typeof vi.fn>;
      supabaseFromMock.mockImplementation((table: string) => {
        if (table === 'task_relationships') {
          return relationshipsBuilder;
        }
        if (table === 'task_embeddings') {
          return taskLookupBuilder;
        }
        throw new Error(`Unexpected table ${table}`);
      });

      const result = await queryTaskGraphTool.execute({ task_id: 'task1', relationship_type: 'all' });

      expect(result.relationships).toEqual([]);
      expect(result.task_id).toBe('task1');
      expect(result.filter_applied).toBe('all');
    });

    it('throws task not found when task ID is missing', async () => {
      const relationshipsBuilder = createPostgrestBuilder({ data: [], error: null });
      const taskLookupBuilder = createPostgrestBuilder({ data: null, error: null });

      const supabaseFromMock = supabase.from as ReturnType<typeof vi.fn>;
      supabaseFromMock.mockImplementation((table: string) => {
        if (table === 'task_relationships') {
          return relationshipsBuilder;
        }
        if (table === 'task_embeddings') {
          return taskLookupBuilder;
        }
        throw new Error(`Unexpected table ${table}`);
      });

      await expect(
        queryTaskGraphTool.execute({ task_id: 'task1', relationship_type: 'all' })
      ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    });
  });

  describe('cluster-by-similarity', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('validates input schema and applies defaults', () => {
      const parsed = clusterBySimilarityTool.inputSchema.parse({ task_ids: ['task1', 'task2'] });
      expect(parsed).toEqual({ task_ids: ['task1', 'task2'], similarity_threshold: 0.75 });

      const singleTaskParsed = clusterBySimilarityTool.inputSchema.parse({ task_ids: ['task1'] });
      expect(singleTaskParsed).toEqual({ task_ids: ['task1'], similarity_threshold: 0.75 });

      const withThreshold = clusterBySimilarityTool.inputSchema.parse({
        task_ids: ['task1', 'task2'],
        similarity_threshold: 0.5,
      });
      expect(withThreshold).toEqual({ task_ids: ['task1', 'task2'], similarity_threshold: 0.5 });

      expect(() => clusterBySimilarityTool.inputSchema.parse({ task_ids: [] })).toThrow();
    });

    it('executes and returns clustering results', async () => {
      const mockResult: ClusteringResult = {
        clusters: [],
        task_count: 2,
        cluster_count: 0,
        threshold_used: 0.75,
        ungrouped_task_ids: ['task1', 'task2'],
      };
      vi.spyOn(clusteringService, 'performHierarchicalClustering').mockResolvedValue(mockResult);

      const result = await clusterBySimilarityTool.execute({ task_ids: ['task1', 'task2'] });

      expect(clusteringService.performHierarchicalClustering).toHaveBeenCalledWith(['task1', 'task2'], {
        threshold: 0.75,
      });
      expect(result).toEqual(mockResult);
    });

    it('maps insufficient embeddings errors', async () => {
      const error = new Error('Insufficient embeddings for clustering');
      vi.spyOn(clusteringService, 'performHierarchicalClustering').mockRejectedValue(error);

      await expect(
        clusterBySimilarityTool.execute({ task_ids: ['task1', 'task2'] })
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_EMBEDDINGS' });
    });

    it('maps invalid threshold errors', async () => {
      await expect(
        clusterBySimilarityTool.execute({ task_ids: ['task1', 'task2'], similarity_threshold: 1.1 })
      ).rejects.toMatchObject({ code: 'INVALID_THRESHOLD' });
    });

    it('maps missing embeddings errors to task not found', async () => {
      const error = new Error('Missing embeddings for one or more task IDs');
      vi.spyOn(clusteringService, 'performHierarchicalClustering').mockRejectedValue(error);

      await expect(
        clusterBySimilarityTool.execute({ task_ids: ['task1', 'task2'] })
      ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
    });
  });
});
