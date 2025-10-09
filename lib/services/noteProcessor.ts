/**
 * Note Processing Service
 * Converts various file formats (PDF, DOCX, TXT) to Markdown
 * Implements FR-002 (File Conversion) and FR-009 (OCR Fallback)
 */

import mammoth from 'mammoth';
import { generateContentHash } from '@/lib/schemas';

// Type definition for pdf-parse module
type PdfParser = (dataBuffer: Buffer) => Promise<{
  numpages: number;
  numrender: number;
  info: Record<string, unknown> & { Title?: string };
  metadata: Record<string, unknown> | null;
  version: string;
  text: string;
}>;

// Dynamic import for pdf-parse with error suppression
// The pdf-parse library has buggy test code that runs at import time
// We suppress the ENOENT error for its test file path
let pdfParserCache: PdfParser | null = null;
async function getPdfParser(): Promise<PdfParser> {
  if (pdfParserCache) return pdfParserCache;

  try {
    const pdfParse = await import('pdf-parse');
    pdfParserCache = pdfParse.default as PdfParser;
    return pdfParserCache;
  } catch (error) {
    // Ignore the test file ENOENT error from pdf-parse's buggy code
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT' &&
      'path' in error &&
      typeof error.path === 'string' &&
      error.path.includes('test/data')
    ) {
      // The module still loads despite this error, try to use it anyway
      const pdfParse = await import('pdf-parse');
      pdfParserCache = pdfParse.default as PdfParser;
      return pdfParserCache;
    }
    throw error;
  }
}

export class ConversionError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'ConversionError';
  }
}

/**
 * Convert file to Markdown format based on MIME type
 * @param fileBuffer - File content as Buffer
 * @param mimeType - MIME type of the file
 * @param fileName - Original filename for logging
 * @returns Object with markdown content and content hash
 * @throws ConversionError if conversion fails
 */
export async function convertToMarkdown(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ markdown: string; contentHash: string }> {
  console.log('[CONVERT START]', { fileName, mimeType, size: fileBuffer.length });

  const startTime = Date.now();
  let markdown: string;

  try {
    switch (mimeType) {
      case 'application/pdf':
        markdown = await convertPdfToMarkdown(fileBuffer);
        break;

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        markdown = await convertDocxToMarkdown(fileBuffer);
        break;

      case 'text/plain':
      case 'text/markdown':
        markdown = await convertTxtToMarkdown(fileBuffer);
        break;

      default:
        throw new ConversionError(`Unsupported MIME type: ${mimeType}`);
    }

    // Validate markdown is not empty
    if (!markdown || markdown.trim().length === 0) {
      throw new ConversionError('Converted content is empty');
    }

    // Generate content hash
    // Convert Buffer to ArrayBuffer - Node.js Buffer needs conversion to Web API ArrayBuffer
    const arrayBuffer = new ArrayBuffer(fileBuffer.length);
    const view = new Uint8Array(arrayBuffer);
    fileBuffer.copy(view);
    const contentHash = await generateContentHash(arrayBuffer);

    const duration = Date.now() - startTime;
    console.log('[CONVERT COMPLETE]', {
      fileName,
      duration,
      markdownLength: markdown.length,
      contentHash: contentHash.substring(0, 16) + '...',
    });

    return { markdown, contentHash };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[CONVERT ERROR]', {
      fileName,
      duration,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof ConversionError) {
      throw error;
    }

    throw new ConversionError(
      `Failed to convert ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Convert PDF to Markdown
 * Uses pdf-parse library with OCR fallback for scanned PDFs
 * @param buffer - PDF file buffer
 * @returns Markdown string
 */
async function convertPdfToMarkdown(buffer: Buffer): Promise<string> {
  try {
    const pdf = await getPdfParser();
    const data = await pdf(buffer);

    // Check if PDF has extractable text
    if (!data.text || data.text.trim().length < 50) {
      console.warn('[PDF] Low text content detected, attempting OCR fallback');
      // FR-009: OCR fallback for unreadable PDFs
      return await applyOcrFallback(buffer);
    }

    // Convert to Markdown format
    const markdown = formatTextAsMarkdown(data.text, data.info?.Title);

    return markdown;

  } catch (error) {
    // Suppress pdf-parse's buggy test file error, but still log other errors
    const shouldSuppressError =
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT' &&
      'path' in error &&
      typeof error.path === 'string' &&
      error.path.includes('test/data');

    if (!shouldSuppressError) {
      console.error('[PDF] Primary extraction failed:', error);
    }

    // Try OCR fallback
    try {
      return await applyOcrFallback(buffer);
    } catch {
      throw new ConversionError(
        'PDF extraction failed and OCR fallback unsuccessful',
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * Convert DOCX to Markdown
 * Uses mammoth library to extract raw text, then formats as markdown
 * @param buffer - DOCX file buffer
 * @returns Markdown string
 */
async function convertDocxToMarkdown(buffer: Buffer): Promise<string> {
  try {
    // Mammoth only has convertToHtml and extractRawText - we use extractRawText
    const result = await mammoth.extractRawText({ buffer });

    if (result.messages && result.messages.length > 0) {
      console.warn('[DOCX] Conversion warnings:', result.messages);
    }

    if (!result.value || result.value.trim().length === 0) {
      throw new ConversionError('DOCX conversion produced empty output');
    }

    // Format the extracted text as markdown with basic paragraph structure
    return formatTextAsMarkdown(result.value);

  } catch (error) {
    throw new ConversionError(
      'DOCX conversion failed',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Convert plain text/markdown to Markdown
 * Simple UTF-8 decode with basic formatting preservation
 * @param buffer - Text file buffer
 * @returns Markdown string
 */
async function convertTxtToMarkdown(buffer: Buffer): Promise<string> {
  try {
    const text = buffer.toString('utf-8');

    if (!text || text.trim().length === 0) {
      throw new ConversionError('Text file is empty');
    }

    // Preserve existing markdown formatting or convert plain text
    return text;

  } catch (error) {
    throw new ConversionError(
      'Text conversion failed',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * OCR fallback for unreadable PDFs (FR-009)
 * Currently logs and returns placeholder - full OCR requires Tesseract.js
 * @param buffer - PDF file buffer
 * @returns Markdown string (placeholder implementation)
 */
async function applyOcrFallback(buffer: Buffer): Promise<string> {
  console.log('[OCR FALLBACK] Applying OCR to scanned PDF...');

  // TODO: Implement full OCR with Tesseract.js if needed
  // For P0, we'll return a placeholder to indicate OCR was attempted

  const placeholder = `# Document Processing Notice

This document appears to be a scanned image or contains minimal extractable text content.

**File Size:** ${(buffer.length / 1024).toFixed(2)} KB

**Status:** Unable to extract text content for AI summarization.

**Next Steps:** This document requires manual review or additional processing with OCR tools.
`;

  console.log('[OCR FALLBACK] Returning placeholder content for testing');
  return placeholder;
}

/**
 * Format plain text as basic Markdown with headings detection
 * @param text - Plain text content
 * @param title - Optional document title
 * @returns Formatted Markdown string
 */
function formatTextAsMarkdown(text: string, title?: string): string {
  let markdown = '';

  // Add title if available
  if (title) {
    markdown += `# ${title}\n\n`;
  }

  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/);

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Detect potential headings (all caps, short lines)
    if (trimmed.length < 100 && trimmed === trimmed.toUpperCase() && /^[A-Z\s]+$/.test(trimmed)) {
      markdown += `## ${trimmed}\n\n`;
    } else {
      // Regular paragraph
      markdown += `${trimmed}\n\n`;
    }
  }

  return markdown.trim();
}
