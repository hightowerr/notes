import { getDocumentContextTool } from '@/lib/mastra/tools/getDocumentContext';
import { supabase } from '@/lib/supabase';
import { DocumentContext } from '@/lib/types/mastra';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  },
}));

describe('get-document-context integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retrieves document context for given task IDs', async () => {
    const taskIds = ['task1', 'task2'];
    const documentId = 'doc1';

    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'task_embeddings') {
            return {
                select: vi.fn().mockReturnThis(),
                in: vi.fn().mockResolvedValue({ data: [{ task_id: 'task1', document_id: documentId }, { task_id: 'task2', document_id: documentId }], error: null }),
            }
        }
        if (table === 'processed_documents') {
            return {
                select: vi.fn().mockReturnThis(),
                in: vi.fn().mockResolvedValue({ data: [{ id: documentId, markdown_content: 'some markdown', uploaded_files: { name: 'test.pdf' } }], error: null })
            }
        }
    });

    const result = await getDocumentContextTool.execute({ task_ids: taskIds });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].document_id).toBe(documentId);
    expect(result.documents[0].filename).toBe('test.pdf');
    expect(result.documents[0].markdown_content).toBe('some markdown');
    expect(result.documents[0].tasks_in_document).toBeDefined();
    expect(result.documents[0].pagination_metadata).toBeNull();
  });

  it('handles pagination for large documents', async () => {
    const taskIds = ['task1'];
    const documentId = 'doc1';
    const largeContent = 'a'.repeat(60000);

    (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'task_embeddings') {
            return {
                select: vi.fn().mockReturnThis(),
                in: vi.fn().mockResolvedValue({ data: [{ task_id: 'task1', document_id: documentId }], error: null }),
            }
        }
        if (table === 'processed_documents') {
            return {
                select: vi.fn().mockReturnThis(),
                in: vi.fn().mockResolvedValue({ data: [{ id: documentId, markdown_content: largeContent, uploaded_files: { name: 'large.pdf' } }], error: null })
            }
        }
    });

    const result = await getDocumentContextTool.execute({ task_ids: taskIds, chunk_number: 1 });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].pagination_metadata).not.toBeNull();
    expect(result.documents[0].pagination_metadata?.current_chunk).toBe(1);
    expect(result.documents[0].pagination_metadata?.total_chunks).toBe(2);
  });
});
