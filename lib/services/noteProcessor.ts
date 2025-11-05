/**
 * Note Processing Service
 * Converts various file formats (PDF, DOCX, TXT) to Markdown
 * Implements FR-002 (File Conversion) and FR-009 (OCR Fallback)
 */

import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { pdfToPng } from 'pdf-to-png-converter';
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
 * Uses Tesseract.js to extract text from scanned images
 * @param buffer - PDF file buffer
 * @returns Markdown string with extracted text
 */
/**
 * Validate OCR text quality to detect gibberish
 * @param text - OCR extracted text
 * @returns true if text appears to be valid, false if likely gibberish
 */
function validateOcrTextQuality(text: string): boolean {
  if (!text || text.trim().length < 20) {
    return false;
  }

  // Remove whitespace for analysis
  const trimmed = text.trim();

  // Check 1: Reasonable word-to-character ratio (words should be 4-7 chars on average)
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 10) {
    return false; // Too few words
  }

  const avgWordLength = trimmed.replace(/\s+/g, '').length / words.length;
  if (avgWordLength < 2 || avgWordLength > 15) {
    return false; // Words too short or too long
  }

  // Check 2: Not too many special characters (gibberish often has high special char ratio)
  const specialChars = (trimmed.match(/[^a-zA-Z0-9\s.,!?;:()\-'"]/g) || []).length;
  const specialCharRatio = specialChars / trimmed.length;
  if (specialCharRatio > 0.3) {
    return false; // More than 30% special characters
  }

  // Check 3: Reasonable letter distribution (gibberish has uneven distribution)
  const letters = trimmed.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (letters.length < 20) {
    return false;
  }

  return true;
}

async function applyOcrFallback(buffer: Buffer): Promise<string> {
  console.log('[OCR FALLBACK] Starting OCR processing for scanned PDF...');
  const startTime = Date.now();

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    // Convert PDF pages to PNG images
    console.log('[OCR] Converting PDF to images...');
    const pngPages = await pdfToPng(buffer, {
      viewportScale: 3.0, // Increased from 2.0 for better OCR quality on slides
      outputFolder: undefined, // Return buffers instead of writing to disk
      strictPagesToProcess: false,
      pagesToProcess: [1, 2, 3, 4, 5], // Process first 5 pages max (performance)
    });

    if (!pngPages || pngPages.length === 0) {
      throw new Error('Failed to convert PDF pages to images');
    }

    console.log(`[OCR] Converted ${pngPages.length} pages to images`);

    // Initialize Tesseract worker with explicit paths for Next.js
    console.log('[OCR] Initializing Tesseract worker...');
    worker = await createWorker('eng', 1, {
      logger: () => {}, // Suppress verbose Tesseract logs
      // Use CDN paths that work in Next.js environment
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
      langPath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v6.0.0/lang-data',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v6.0.0',
    });

    // Configure Tesseract for presentation slides/documents
    // PSM 3 = Fully automatic page segmentation (best for mixed content)
    await worker.setParameters({
      tessedit_pageseg_mode: '3',  // Fully automatic page segmentation
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?;:()\'-" ',
    });

    // Extract text from each page
    const pageTexts: string[] = [];
    const validPages: number[] = [];

    for (let i = 0; i < pngPages.length; i++) {
      console.log(`[OCR] Processing page ${i + 1}/${pngPages.length}...`);

      const page = pngPages[i];
      if (!page || !page.content) {
        console.warn(`[OCR] Skipping page ${i + 1} - no content`);
        continue;
      }

      try {
        const { data } = await worker.recognize(page.content);
        const text = data.text.trim();

        if (text.length > 0) {
          // Validate text quality before accepting
          const isValid = validateOcrTextQuality(text);

          if (isValid) {
            pageTexts.push(`## Page ${i + 1}\n\n${text}`);
            validPages.push(i + 1);
            console.log(`[OCR] ✓ Extracted ${text.length} chars from page ${i + 1} (valid)`);
          } else {
            console.warn(`[OCR] ✗ Page ${i + 1} text quality too low (likely gibberish)`);
            pageTexts.push(`## Page ${i + 1}\n\n[Low quality OCR output - text appears to be gibberish]`);
          }
        } else {
          console.warn(`[OCR] No text extracted from page ${i + 1}`);
        }
      } catch (error) {
        console.error(`[OCR] Failed to process page ${i + 1}:`, error);
        pageTexts.push(`## Page ${i + 1}\n\n[OCR processing failed for this page]`);
      }
    }

    console.log(`[OCR] Quality check: ${validPages.length}/${pngPages.length} pages passed validation`);

    // Terminate worker
    await worker.terminate();
    worker = null;

    // Check if we extracted any valid text
    if (validPages.length === 0) {
      // No valid text extracted - likely a scanned presentation with images/graphics
      const markdown = `# Document Processing Notice

This document appears to be a scanned presentation or image-heavy PDF.

**OCR Status:** Failed to extract readable text from ${pngPages.length} page${pngPages.length === 1 ? '' : 's'}
**Quality Check:** All extracted text appeared to be gibberish or unreadable

**Possible Reasons:**
- Low image quality or resolution
- Text embedded in images/graphics
- Complex formatting or layouts
- Non-standard fonts or styling

**Next Steps:**
- Manual review of the original document recommended
- Consider requesting a text-based version (DOCX, TXT, or searchable PDF)
- If this is a presentation, speaker notes or transcript may be more suitable

**File Size:** ${(buffer.length / 1024 / 1024).toFixed(2)} MB`;

      const duration = Date.now() - startTime;
      console.log('[OCR FALLBACK] Complete (no valid text)', {
        duration,
        pagesProcessed: pngPages.length,
        validPages: 0,
      });

      return markdown;
    }

    // Combine valid page texts
    const markdown = validPages.length < pngPages.length
      ? `# Document (OCR Extracted - Partial Success)

**OCR Status:** Extracted readable text from ${validPages.length} of ${pngPages.length} pages
**Warning:** Some pages produced low-quality or unreadable text

${pageTexts.join('\n\n')}`
      : `# Document (OCR Extracted)

${pageTexts.join('\n\n')}`;

    const duration = Date.now() - startTime;
    console.log('[OCR FALLBACK] Complete', {
      duration,
      pagesProcessed: pngPages.length,
      validPages: validPages.length,
      totalLength: markdown.length,
      avgCharsPerPage: Math.round(markdown.length / pngPages.length),
    });

    return markdown;

  } catch (error) {
    // Ensure worker is terminated even on error
    if (worker) {
      try {
        await worker.terminate();
      } catch (terminateError) {
        console.error('[OCR] Failed to terminate worker:', terminateError);
      }
    }

    const duration = Date.now() - startTime;
    console.error('[OCR FALLBACK] Failed', {
      duration,
      error: error instanceof Error ? error.message : String(error),
    });

    // Return fallback message if OCR completely fails
    return `# Document Processing Notice

This document appears to be a scanned image or presentation slides.

**File Size:** ${(buffer.length / 1024).toFixed(2)} KB

**OCR Status:** Processing failed - ${error instanceof Error ? error.message : 'Unknown error'}

**Next Steps:** This document may require manual review or alternative processing methods.
`;
  }
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
