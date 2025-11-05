import { supabase } from '@/lib/supabase';
import { DocumentContext, PaginationMetadata } from '@/lib/types/mastra';

const CHUNK_SIZE = 50000;
const OVERLAP_SIZE = 200;

export async function getDocumentsByTaskIds(
  task_ids: string[],
  chunk_number?: number
): Promise<DocumentContext[]> {
  const { data: tasks, error: tasksError } = await supabase
    .from('task_embeddings')
    .select('task_id, task_text, document_id')
    .in('task_id', task_ids);

  if (tasksError) {
    throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
  }

  if (!tasks || tasks.length === 0) {
    return [];
  }

  const documentIds = [...new Set(tasks.map((task) => task.document_id))];

  const { data: documents, error: documentsError } = await supabase
    .from('processed_documents')
    .select('id, markdown_content, uploaded_files(name)')
    .in('id', documentIds);

  if (documentsError) {
    throw new Error(`Failed to fetch documents: ${documentsError.message}`);
  }

  if (!documents || documents.length === 0) {
    const missingDocuments = documentIds.join(', ');
    throw new Error(
      `Document(s) removed during retrieval: ${missingDocuments}`
    );
  }

  const returnedDocIds = new Set(documents.map((doc) => doc.id));
  const missingDocIds = documentIds.filter((id) => !returnedDocIds.has(id));

  if (missingDocIds.length > 0) {
    throw new Error(
      `Document(s) removed during retrieval: ${missingDocIds.join(', ')}`
    );
  }

  const documentContexts: DocumentContext[] = documents.map((doc) => {
    const tasksInDocument = tasks.filter((task) => task.document_id === doc.id);
    const fullMarkdownContent = doc.markdown_content || '';
    let markdownContent = fullMarkdownContent;
    let paginationMetadata: PaginationMetadata | null = null;

    if (chunk_number !== undefined) {
      if (chunk_number < 1) {
        throw new Error('Chunk number must be >= 1');
      }

      if (fullMarkdownContent.length <= CHUNK_SIZE && chunk_number > 1) {
        throw new Error('Chunk number out of range for document size');
      }
    }

    if (fullMarkdownContent.length > CHUNK_SIZE) {
      const total_chunks = Math.ceil(fullMarkdownContent.length / CHUNK_SIZE);
      const current_chunk = chunk_number || 1;

      if (current_chunk > total_chunks) {
        throw new Error('Chunk number out of range');
      }

      const start = (current_chunk - 1) * CHUNK_SIZE;
      const end = start + CHUNK_SIZE;
      markdownContent = fullMarkdownContent.slice(start, end);

      if (current_chunk > 1) {
        markdownContent = fullMarkdownContent.slice(start - OVERLAP_SIZE, end);
      }

      paginationMetadata = {
        current_chunk,
        total_chunks,
        chunk_size: CHUNK_SIZE,
        overlap_size: OVERLAP_SIZE,
      };
    }

    return {
      document_id: doc.id,
      filename: doc.uploaded_files?.name ?? 'unknown',
      markdown_content: markdownContent,
      tasks_in_document: tasksInDocument.map((task) => ({
        task_id: task.task_id,
        task_text: task.task_text,
      })),
      pagination_metadata: paginationMetadata,
    };
  });

  return documentContexts;
}
