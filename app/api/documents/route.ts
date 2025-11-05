/**
 * GET /api/documents
 * Retrieves all uploaded files with their processing status and summaries
 * Supports filtering by status and sorting by various fields
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ErrorCode } from '@/lib/schemas';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Query parameter validation schema
const QueryParamsSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'review_required', 'all']).optional().default('all'),
  sort: z.enum(['date', 'name', 'confidence', 'size']).optional().default('date'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

type QueryParams = z.infer<typeof QueryParamsSchema>;

export async function GET(request: NextRequest) {
  try {
    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryParams: QueryParams = {
      status: (searchParams.get('status') as QueryParams['status']) || 'all',
      sort: (searchParams.get('sort') as QueryParams['sort']) || 'date',
      order: (searchParams.get('order') as QueryParams['order']) || 'desc',
    };

    // Validate query parameters
    const validation = QueryParamsSchema.safeParse(queryParams);
    if (!validation.success) {
      const error = validation.error.errors[0];
      const errorMessage = error.path[0] === 'status'
        ? `Invalid status filter. Allowed: pending, processing, completed, failed, review_required, all`
        : error.path[0] === 'sort'
        ? `Invalid sort field. Allowed: date, name, confidence, size`
        : `Invalid order. Allowed: asc, desc`;

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          code: ErrorCode.enum.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    const { status, sort, order } = validation.data;

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build query for uploaded_files with left join to processed_documents
    let query = supabase
      .from('uploaded_files')
      .select(`
        id,
        name,
        size,
        mime_type,
        uploaded_at,
        updated_at,
        status,
        source,
        external_id,
        sync_enabled,
        processed_documents (
          confidence,
          processing_duration,
          structured_output
        )
      `);

    // Apply status filter
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Apply sorting (confidence is handled separately after query due to null values)
    if (sort !== 'confidence') {
      const sortMapping: Record<'date' | 'name' | 'size', string> = {
        date: 'uploaded_at',
        name: 'name',
        size: 'size',
      };

      const sortField = sortMapping[sort as 'date' | 'name' | 'size'];
      const ascending = order === 'asc';

      query = query.order(sortField, { ascending });
    } else {
      // For confidence sorting, we'll sort after fetching (see below)
      // Default to date order for the initial query
      query = query.order('uploaded_at', { ascending: false });
    }

    // Execute query
    const { data: files, error: queryError } = await query;

    if (queryError) {
      console.error('[GET /api/documents] Database query error:', queryError);
      return NextResponse.json(
        {
          success: false,
          error: 'Database query failed',
          code: ErrorCode.enum.STORAGE_ERROR,
        },
        { status: 500 }
      );
    }

    // Transform data to match API contract
    const documents = files.map((file: any) => {
      const processedDoc = Array.isArray(file.processed_documents)
        ? file.processed_documents[0]
        : file.processed_documents;

      const baseDocument = {
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mime_type,
        uploadedAt: file.uploaded_at,
        updatedAt: file.updated_at,
        status: file.status,
        source: file.source ?? null,
        externalId: file.external_id ?? null,
        syncEnabled: Boolean(file.sync_enabled),
      };

      // Add summary data if document is processed
      if (processedDoc) {
        return {
          ...baseDocument,
          confidence: processedDoc.confidence,
          processingDuration: processedDoc.processing_duration,
          summary: processedDoc.structured_output,
        };
      }

      return baseDocument;
    });

    // Sort by confidence requires post-query sorting because null values
    if (sort === 'confidence') {
      documents.sort((a: any, b: any) => {
        const confA = a.confidence ?? -1;
        const confB = b.confidence ?? -1;
        return order === 'asc' ? confA - confB : confB - confA;
      });
    }

    return NextResponse.json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error('[GET /api/documents] Unexpected error:', error);
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
