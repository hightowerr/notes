import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { documentStatusResponseSchema } from '@/lib/schemas/documentStatus';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_USER_ID = 'default-user';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const querySchema = z.object({
  outcome_id: z.string().uuid(),
  excluded_ids: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

type TaskRow = {
  document_id: string | null;
};

type ProcessedDocumentRow = {
  id: string;
  file_id: string | null;
};

type UploadedFileRow = {
  id: string;
  name: string;
  uploaded_at: string | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    outcome_id: url.searchParams.get('outcome_id'),
    excluded_ids: url.searchParams.get('excluded_ids') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'outcome_id is required and must be a UUID' },
      { status: 400 }
    );
  }

  const { outcome_id: outcomeId, excluded_ids: rawExcludedIds } = parsed.data;
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;
  const offset = parsed.data.offset ?? 0;
  const excludedIds = rawExcludedIds?.split(',').map(id => id.trim()).filter(Boolean) ?? [];

  try {
    // Try to fetch baseline session with baseline_document_ids column
    // If column doesn't exist (migration not applied), gracefully handle it
    let baselineSession: { baseline_document_ids?: string[] | null; created_at?: string | null } | null = null;

    try {
      const { data, error: baselineError } = await supabase
        .from('agent_sessions')
        .select('baseline_document_ids, created_at')
        .eq('user_id', DEFAULT_USER_ID)
        .eq('outcome_id', outcomeId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (baselineError) {
        // If error is about missing column, log but continue with empty baseline
        if (baselineError.message?.includes('column') && baselineError.message?.includes('does not exist')) {
          console.warn('[Document Status API] baseline_document_ids column not found - migration 028 not applied');
        } else {
          console.error('[Document Status API] Failed to fetch baseline session', baselineError);
          return NextResponse.json(
            { error: 'DATABASE_ERROR', message: 'Failed to load baseline session' },
            { status: 500 }
          );
        }
      } else {
        baselineSession = data;
      }
    } catch (error) {
      console.warn('[Document Status API] Could not fetch baseline session', error);
      // Continue with empty baseline
    }

    const baselineDocumentIds = new Set<string>(
      Array.isArray(baselineSession?.baseline_document_ids)
        ? baselineSession.baseline_document_ids.filter((id): id is string => typeof id === 'string')
        : []
    );
    const baselineCreatedAt = baselineSession?.created_at ?? null;

    const taskLimit = Math.min((limit + offset) * 50, 2000);
    const { data: taskRows, error: taskError } = await supabase
      .from('task_embeddings')
      .select('document_id')
      .eq('status', 'completed')
      .not('document_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(taskLimit)
      .returns<TaskRow[]>();

    if (taskError) {
      console.error('[Document Status API] Failed to fetch task embeddings', taskError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to load task embeddings' },
        { status: 500 }
      );
    }

    const taskCounts = new Map<string, number>();
    (taskRows ?? []).forEach(row => {
      if (!row.document_id) {
        return;
      }
      taskCounts.set(row.document_id, (taskCounts.get(row.document_id) ?? 0) + 1);
    });

    const documentIds = Array.from(taskCounts.keys());

    if (documentIds.length === 0) {
      return NextResponse.json({
        documents: [],
        summary: {
          included_count: 0,
          excluded_count: 0,
          pending_count: 0,
          total_task_count: 0,
        },
        total: 0,
      });
    }

    const { data: processedDocs, error: docError } = await supabase
      .from('processed_documents')
      .select('id, file_id')
      .in('id', documentIds);

    if (docError) {
      console.error('[Document Status API] Failed to fetch processed documents', docError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to load document metadata' },
        { status: 500 }
      );
    }

    const fileIds = Array.from(
      new Set(
        (processedDocs ?? [])
          .map(doc => doc.file_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    let uploadedFilesById = new Map<string, UploadedFileRow>();
    if (fileIds.length > 0) {
      const { data: files, error: filesError } = await supabase
        .from('uploaded_files')
        .select('id, name, uploaded_at')
        .in('id', fileIds)
        .returns<UploadedFileRow[]>();

      if (filesError) {
        console.error('[Document Status API] Failed to fetch uploaded_files', filesError);
      } else if (files) {
        uploadedFilesById = new Map(files.map(file => [file.id, file]));
      }
    }

    const metadataById = new Map<string, ProcessedDocumentRow>();
    (processedDocs ?? []).forEach(doc => metadataById.set(doc.id, doc));

    const excludedSet = new Set(excludedIds);
    const decorated = documentIds.map(id => {
      const meta = metadataById.get(id);
      const uploadMetadata = meta?.file_id ? uploadedFilesById.get(meta.file_id) : null;
      const uploadedAt = uploadMetadata?.uploaded_at ?? null;
      const isExcluded = excludedSet.has(id);
      const isIncluded = baselineDocumentIds.has(id);
      const status: 'included' | 'excluded' | 'pending' = isExcluded
        ? 'excluded'
        : isIncluded
          ? 'included'
          : 'pending';

      return {
        id,
        name: uploadMetadata?.name ?? 'Untitled document',
        uploaded_at: uploadedAt,
        task_count: taskCounts.get(id) ?? 0,
        status,
        included_at: isIncluded ? baselineCreatedAt : null,
      };
    });

    const sorted = decorated.sort((a, b) => {
      const aTime = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
      const bTime = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
      return bTime - aTime;
    });

    const summary = sorted.reduce(
      (acc, doc) => {
        if (doc.status === 'included') {
          acc.included_count += 1;
          acc.total_task_count += doc.task_count;
        } else if (doc.status === 'excluded') {
          acc.excluded_count += 1;
        } else {
          acc.pending_count += 1;
          acc.total_task_count += doc.task_count;
        }
        return acc;
      },
      {
        included_count: 0,
        excluded_count: 0,
        pending_count: 0,
        total_task_count: 0,
      }
    );

    const documents = sorted.slice(offset, offset + limit);

    const payload = { documents, summary, total: sorted.length };
    const parsedResponse = documentStatusResponseSchema.safeParse(payload);
    if (!parsedResponse.success) {
      console.error('[Document Status API] Response validation failed', parsedResponse.error.flatten());
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: 'Failed to build document status response' },
        { status: 500 }
      );
    }

    return NextResponse.json(parsedResponse.data);
  } catch (error) {
    console.error('[Document Status API] Unexpected error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Unexpected server error' },
      { status: 500 }
    );
  }
}
