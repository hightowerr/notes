import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { ErrorCode } from '@/lib/schemas';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const STORAGE_BUCKET = 'notes';

type RouteParams = {
  id: string;
};

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(_: Request, { params }: { params: Promise<RouteParams> }) {
  const { id } = await params;

  const validation = paramsSchema.safeParse({ id });
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid document id',
        code: ErrorCode.enum.INVALID_REQUEST,
      },
      { status: 400 }
    );
  }

  try {
    const { data: fileRecord, error: fetchError } = await supabase
      .from('uploaded_files')
      .select(`
        id,
        name,
        storage_path,
        processed_documents (
          id,
          markdown_storage_path,
          json_storage_path
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('[DELETE /api/documents/:id] Failed to load document:', fetchError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to load document record',
          code: ErrorCode.enum.STORAGE_ERROR,
        },
        { status: 500 }
      );
    }

    if (!fileRecord) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document not found',
          code: ErrorCode.enum.FILE_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    const storagePaths: string[] = [];

    if (fileRecord.storage_path) {
      storagePaths.push(fileRecord.storage_path);
    }

    const processedDocuments = Array.isArray(fileRecord.processed_documents)
      ? fileRecord.processed_documents
      : fileRecord.processed_documents
      ? [fileRecord.processed_documents]
      : [];

    for (const processed of processedDocuments) {
      if (processed?.markdown_storage_path) {
        storagePaths.push(processed.markdown_storage_path);
      }
      if (processed?.json_storage_path) {
        storagePaths.push(processed.json_storage_path);
      }
    }

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(storagePaths);
      if (storageError) {
        console.error('[DELETE /api/documents/:id] Failed to remove storage objects:', {
          error: storageError.message,
          paths: storagePaths,
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to delete document assets',
            code: ErrorCode.enum.STORAGE_ERROR,
          },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await supabase.from('uploaded_files').delete().eq('id', id);

    if (deleteError) {
      console.error('[DELETE /api/documents/:id] Failed to remove database records:', deleteError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to delete document record',
          code: ErrorCode.enum.STORAGE_ERROR,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: {
        id,
        storagePathsRemoved: storagePaths.length,
      },
    });
  } catch (error) {
    console.error('[DELETE /api/documents/:id] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An unexpected error occurred',
        code: ErrorCode.enum.STORAGE_ERROR,
      },
      { status: 500 }
    );
  }
}
