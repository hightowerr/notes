'use server';

/**
 * Text Input API
 * Accepts direct text submissions and processes them via the existing pipeline.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createTextInputDocument } from '@/lib/services/textInputService';

const TextInputRequestSchema = z.object({
  content: z.string(),
  title: z.string().max(256).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    let json: unknown;

    try {
      json = await request.json();
    } catch (parseError) {
      console.error('[TextInputAPI] Invalid JSON payload:', parseError);
      return NextResponse.json(
        {
          success: false,
          error: 'Request body must be valid JSON.',
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      );
    }

    const parsed = TextInputRequestSchema.safeParse(json);

    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const isContentIssue = issue?.path?.[0] === 'content';
      const message = isContentIssue
        ? 'Content cannot be empty.'
        : issue?.message ?? 'Invalid request payload.';
      return NextResponse.json(
        {
          success: false,
          error: message,
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      );
    }

    const { content, title } = parsed.data;
    const result = await createTextInputDocument({ content, title });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
          code: result.code,
        },
        { status: result.statusCode }
      );
    }

    // When job starts immediately, trigger processing pipeline with inline content
    if (result.initialStatus === 'processing') {
      const processUrl = new URL('/api/process', request.url);
      if (processUrl.hostname === 'localhost' || processUrl.hostname === '127.0.0.1') {
        processUrl.protocol = 'http:';
      }

      fetch(processUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: result.fileId,
          rawContent: result.rawContent,
          contentHash: result.contentHash,
        }),
      }).catch((error) => {
        console.error('[TextInputAPI] Failed to trigger processing:', error);
      });
    }

    return NextResponse.json({
      success: true,
      fileId: result.fileId,
      status: result.initialStatus,
      queuePosition: result.queuePosition,
      message:
        result.initialStatus === 'processing'
          ? 'Processing text input...'
          : `Text input queued at position ${result.queuePosition}`,
    });
  } catch (error) {
    console.error('[TextInputAPI] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process text input. Please try again.',
        code: 'STORAGE_ERROR',
      },
      { status: 500 }
    );
  }
}
