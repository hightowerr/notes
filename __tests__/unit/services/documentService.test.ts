import { getDocumentsByTaskIds } from '@/lib/services/documentService';
import { supabase } from '@/lib/supabase';

// Mock the Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    in: vi.fn(),
  },
}));

describe('documentService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should retrieve document context for given task IDs', async () => {
    const mockTasks = [
      { task_id: 'task1', task_text: 'Task 1', document_id: 'doc1' },
      { task_id: 'task2', task_text: 'Task 2', document_id: 'doc1' },
    ];
    const mockDocuments = [
      {
        id: 'doc1',
        markdown_content: 'This is a test document.',
        uploaded_files: { name: 'test.txt' },
      },
    ];

    (supabase.in as any)
      .mockResolvedValueOnce({ data: mockTasks, error: null })
      .mockResolvedValueOnce({ data: mockDocuments, error: null });

    const result = await getDocumentsByTaskIds(['task1', 'task2']);

    expect(result).toHaveLength(1);
    expect(result[0].document_id).toBe('doc1');
    expect(result[0].filename).toBe('test.txt');
    expect(result[0].markdown_content).toBe('This is a test document.');
    expect(result[0].tasks_in_document).toHaveLength(2);
    expect(result[0].pagination_metadata).toBeNull();
  });

  it('should handle pagination for large documents', async () => {
    const largeContent = 'a'.repeat(60000);
    const mockTasks = [
      { task_id: 'task1', task_text: 'Task 1', document_id: 'doc1' },
    ];
    const mockDocuments = [
      {
        id: 'doc1',
        markdown_content: largeContent,
        uploaded_files: { name: 'large.txt' },
      },
    ];

    (supabase.in as any)
      .mockResolvedValueOnce({ data: mockTasks, error: null })
      .mockResolvedValueOnce({ data: mockDocuments, error: null });

    const result = await getDocumentsByTaskIds(['task1']);

    expect(result).toHaveLength(1);
    expect(result[0].pagination_metadata).not.toBeNull();
    expect(result[0].pagination_metadata?.total_chunks).toBe(2);
  });

  it('should handle chunk overlap correctly', async () => {
    const largeContent = 'a'.repeat(60000);
    const mockTasks = [
      { task_id: 'task1', task_text: 'Task 1', document_id: 'doc1' },
    ];
    const mockDocuments = [
      {
        id: 'doc1',
        markdown_content: largeContent,
        uploaded_files: { name: 'large.txt' },
      },
    ];

    (supabase.in as any)
      .mockResolvedValueOnce({ data: mockTasks, error: null })
      .mockResolvedValueOnce({ data: mockDocuments, error: null });

    const result = await getDocumentsByTaskIds(['task1'], 2);

    expect(result[0].markdown_content.length).toBe(10200);
  });

  it('should throw an error if a document is deleted', async () => {
    const mockTasks = [
      { task_id: 'task1', task_text: 'Task 1', document_id: 'doc1' },
    ];

    (supabase.in as any)
      .mockResolvedValueOnce({ data: mockTasks, error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(getDocumentsByTaskIds(['task1'])).rejects.toThrow(
      'Document(s) removed during retrieval: doc1'
    );
  });

  it('should throw when requesting an out-of-range chunk for small documents', async () => {
    const mockTasks = [
      { task_id: 'task1', task_text: 'Task 1', document_id: 'doc1' },
    ];
    const mockDocuments = [
      {
        id: 'doc1',
        markdown_content: 'Short content',
        uploaded_files: { name: 'short.txt' },
      },
    ];

    (supabase.in as any)
      .mockResolvedValueOnce({ data: mockTasks, error: null })
      .mockResolvedValueOnce({ data: mockDocuments, error: null });

    await expect(getDocumentsByTaskIds(['task1'], 2)).rejects.toThrow(
      'Chunk number out of range for document size'
    );
  });
});
