/**
 * GET /api/export/[fileId]?format=json|markdown
 * Export document summary in JSON or Markdown format
 * Implements T007: Export functionality for summaries
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ErrorCode, DocumentOutputSchema } from '@/lib/schemas';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Query parameter validation
const ExportFormatSchema = z.enum(['json', 'markdown']);
type ExportFormat = z.infer<typeof ExportFormatSchema>;

// Convert structured output to formatted Markdown
function convertToMarkdown(filename: string, summary: z.infer<typeof DocumentOutputSchema>): string {
  let markdown = `# Summary: ${filename}\n\n`;
  markdown += `*Generated on ${new Date().toISOString()}*\n\n`;
  markdown += `---\n\n`;

  // Topics section
  markdown += `## Topics\n\n`;
  if (summary.topics && summary.topics.length > 0) {
    summary.topics.forEach((topic: string) => {
      markdown += `- ${topic}\n`;
    });
  } else {
    markdown += `*No topics identified*\n`;
  }
  markdown += `\n`;

  // Decisions section
  markdown += `## Decisions\n\n`;
  if (summary.decisions && summary.decisions.length > 0) {
    summary.decisions.forEach((decision: string, index: number) => {
      markdown += `${index + 1}. ${decision}\n`;
    });
  } else {
    markdown += `*No decisions identified*\n`;
  }
  markdown += `\n`;

  // Actions section
  markdown += `## Action Items\n\n`;
  if (summary.actions && summary.actions.length > 0) {
    summary.actions.forEach((action: string) => {
      markdown += `- [ ] ${action}\n`;
    });
  } else {
    markdown += `*No actions identified*\n`;
  }
  markdown += `\n`;

  // LNO Tasks section
  markdown += `## Task Prioritization (Leverage / Neutral / Overhead)\n\n`;

  markdown += `### Leverage (High-Impact Strategic Tasks)\n\n`;
  if (summary.lno_tasks?.leverage && summary.lno_tasks.leverage.length > 0) {
    summary.lno_tasks.leverage.forEach((task: string) => {
      markdown += `- 🚀 ${task}\n`;
    });
  } else {
    markdown += `*No tasks identified*\n`;
  }
  markdown += `\n`;

  markdown += `### Neutral (Necessary Operational Tasks)\n\n`;
  if (summary.lno_tasks?.neutral && summary.lno_tasks.neutral.length > 0) {
    summary.lno_tasks.neutral.forEach((task: string) => {
      markdown += `- ⚙️ ${task}\n`;
    });
  } else {
    markdown += `*No tasks identified*\n`;
  }
  markdown += `\n`;

  markdown += `### Overhead (Low-Value Administrative Tasks)\n\n`;
  if (summary.lno_tasks?.overhead && summary.lno_tasks.overhead.length > 0) {
    summary.lno_tasks.overhead.forEach((task: string) => {
      markdown += `- ⚠️ ${task}\n`;
    });
  } else {
    markdown += `*No tasks identified*\n`;
  }

  return markdown;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;

    // Validate fileId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fileId)) {
      console.error('[Export API] Invalid fileId format:', fileId);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid file ID format',
          code: ErrorCode.enum.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    // Get export format from query parameter (default: json)
    const searchParams = request.nextUrl.searchParams;
    const formatParam = searchParams.get('format') || 'json';

    const formatValidation = ExportFormatSchema.safeParse(formatParam);
    if (!formatValidation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid format. Supported formats: json, markdown',
          code: ErrorCode.enum.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    const format: ExportFormat = formatValidation.data;

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch file metadata and processed document
    const { data: fileData, error: fileError } = await supabase
      .from('uploaded_files')
      .select(`
        id,
        name,
        status,
        processed_documents (
          structured_output,
          confidence,
          processing_duration,
          processed_at
        )
      `)
      .eq('id', fileId)
      .single();

    if (fileError || !fileData) {
      console.error('[Export API] File not found:', fileId, fileError);
      return NextResponse.json(
        {
          success: false,
          error: 'File not found',
          code: ErrorCode.enum.FILE_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    // Check if document has been processed
    if (!fileData.processed_documents || fileData.processed_documents.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document has not been processed yet',
          code: ErrorCode.enum.PROCESSING_ERROR,
        },
        { status: 400 }
      );
    }

    const processedDoc = fileData.processed_documents[0];

    // Validate structured output against schema
    const validationResult = DocumentOutputSchema.safeParse(processedDoc.structured_output);
    if (!validationResult.success) {
      console.error('[Export API] Invalid structured output:', validationResult.error);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid document structure',
          code: ErrorCode.enum.PROCESSING_ERROR,
        },
        { status: 500 }
      );
    }

    const summary = validationResult.data;

    // Generate export based on format
    if (format === 'json') {
      // Export as JSON
      const jsonExport = {
        filename: fileData.name,
        exportedAt: new Date().toISOString(),
        processedAt: processedDoc.processed_at,
        confidence: processedDoc.confidence,
        processingDuration: processedDoc.processing_duration,
        summary: summary,
      };

      const jsonString = JSON.stringify(jsonExport, null, 2);
      const sanitizedFilename = fileData.name.replace(/\.[^/.]+$/, ''); // Remove extension

      return new NextResponse(jsonString, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${sanitizedFilename}-summary.json"`,
        },
      });
    } else {
      // Export as Markdown
      const markdownContent = convertToMarkdown(fileData.name, summary);
      const sanitizedFilename = fileData.name.replace(/\.[^/.]+$/, ''); // Remove extension

      return new NextResponse(markdownContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename="${sanitizedFilename}-summary.md"`,
        },
      });
    }
  } catch (error) {
    console.error('[Export API] Unexpected error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export document',
        code: ErrorCode.enum.PROCESSING_ERROR,
      },
      { status: 500 }
    );
  }
}
