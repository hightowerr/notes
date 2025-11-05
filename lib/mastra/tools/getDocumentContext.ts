import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getDocumentsByTaskIds } from '@/lib/services/documentService';
import type { DocumentContext } from '@/lib/types/mastra';

type GetDocumentContextErrorCode =
  | 'DOCUMENT_DELETED'
  | 'TASK_NOT_FOUND'
  | 'DATABASE_ERROR';

class GetDocumentContextToolError extends Error {
  constructor(
    public readonly code: GetDocumentContextErrorCode,
    message: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'GetDocumentContextToolError';
  }
}

const inputSchema = z.object({
  task_ids: z.array(z.string()).min(1, 'At least one task ID is required'),
  chunk_number: z.number().int().min(1).optional(),
});

function normalizeTaskIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') {
          return item.trim();
        }
        if (item && typeof item === 'object' && 'task_id' in (item as Record<string, unknown>)) {
          const taskId = (item as { task_id?: unknown }).task_id;
          return typeof taskId === 'string' ? taskId.trim() : '';
        }
        return typeof item === 'number' || typeof item === 'boolean' ? String(item) : '';
      })
      .filter(taskId => taskId.length > 0);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function normalizeInput(
  input: z.input<typeof inputSchema>
): z.input<typeof inputSchema> {
  if (!input || typeof input !== 'object') {
    return input;
  }

  const context = (input as Record<string, unknown>).context as Record<string, unknown> | undefined;
  const taskIdsSource =
    (input as Record<string, unknown>).task_ids ??
    context?.task_ids;

  const chunkNumberSource =
    (input as Record<string, unknown>).chunk_number ??
    context?.chunk_number;

  return {
    task_ids: normalizeTaskIds(taskIdsSource),
    chunk_number: chunkNumberSource as number | undefined,
  };
}

async function executeGetDocumentContext(
  input: z.input<typeof inputSchema>
): Promise<{
  documents: DocumentContext[];
}> {
  const normalized = normalizeInput(input);
  const { task_ids, chunk_number } = inputSchema.parse(normalized);

  try {
    const documents = await getDocumentsByTaskIds(task_ids, chunk_number);
    if (!documents || documents.length === 0) {
      throw new GetDocumentContextToolError(
        'TASK_NOT_FOUND',
        'No documents found for the provided task IDs. Verify each ID exists in the task_embeddings table.',
        false
      );
    }
    return { documents };
  } catch (error) {
    if (error instanceof GetDocumentContextToolError) {
      throw error;
    }
    if (error instanceof Error) {
        if (error.message.includes('Document(s) removed during retrieval')) {
            throw new GetDocumentContextToolError('DOCUMENT_DELETED', error.message, false);
        }
        if (error.message.includes('Failed to fetch tasks')) {
            throw new GetDocumentContextToolError('TASK_NOT_FOUND', error.message, false);
        }
    }
    throw new GetDocumentContextToolError(
      'DATABASE_ERROR',
      error instanceof Error ? error.message : 'Unknown database error',
      true
    );
  }
}

export const getDocumentContextTool = createTool({
  id: 'get-document-context',
  description: 'Retrieves the full markdown content and all associated tasks for a given set of task IDs. Use this to get the context of a task.',
  inputSchema,
  execute: executeGetDocumentContext,
});

export type GetDocumentContextTool = typeof getDocumentContextTool;
