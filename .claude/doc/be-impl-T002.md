# Backend Implementation Plan: T002 Processing Pipeline

**Task:** T002 [SLICE] User sees AI-generated summary after automatic processing completes
**Agent:** backend-engineer
**Created:** 2025-10-08

## Overview

Implement the complete processing pipeline that converts uploaded files to Markdown, extracts structured data using AI, and stores results in Supabase. This enables the autonomous Sense → Reason → Act loop.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      /api/process                              │
│  POST { fileId }                                               │
│                                                                │
│  1. Fetch File    ──→  Supabase Storage (uploaded_files)     │
│  2. Convert       ──→  noteProcessor.convertToMarkdown()     │
│  3. Summarize     ──→  aiSummarizer.extractStructuredData()  │
│  4. Store         ──→  Supabase (processed_documents)        │
│  5. Log Metrics   ──→  Supabase (processing_logs)            │
│                                                                │
│  Response: { success, documentId, structuredOutput, ... }     │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                   /api/status/[fileId]                        │
│  GET                                                           │
│                                                                │
│  Query: uploaded_files + processed_documents                  │
│  Response: { fileId, status, summary?, confidence?, ... }     │
└────────────────────────────────────────────────────────────────┘
```

## Services to Implement

### 1. `lib/services/noteProcessor.ts`

**Purpose:** Convert various file formats to Markdown

**Functions:**
```typescript
export async function convertToMarkdown(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<{ markdown: string; contentHash: string }>

// Internal helpers:
- convertPdfToMarkdown(buffer: Buffer): Promise<string>
- convertDocxToMarkdown(buffer: Buffer): Promise<string>
- convertTxtToMarkdown(buffer: Buffer): Promise<string>
- applyOcrFallback(buffer: Buffer): Promise<string> // FR-009
```

**Dependencies:**
- `pdf-parse` - PDF text extraction
- `mammoth` - DOCX conversion
- Node.js `crypto` for content hashing

**Error Handling:**
- Throw `ConversionError` with descriptive message
- Log errors to console for observability
- OCR fallback for unreadable PDFs (FR-009)

**Performance:**
- Target: < 3000ms for conversion phase
- Contribute to overall 8s budget (FR-013)

### 2. `lib/services/aiSummarizer.ts`

**Purpose:** Extract structured data using Anthropic Claude via Vercel AI SDK

**Functions:**
```typescript
export async function extractStructuredData(
  markdown: string,
  options?: { retry?: boolean }
): Promise<{
  output: DocumentOutput;
  confidence: number;
  duration: number;
}>

// Internal helpers:
- calculateConfidence(output: DocumentOutput): number
- retryWithAdjustedParams(markdown: string): Promise<DocumentOutput>
```

**Implementation Details:**
- Use `generateObject()` from Vercel AI SDK
- Model: `claude-3-5-sonnet-20241022` (latest available)
- Schema: `DocumentOutputSchema` from lib/schemas.ts
- Prompt:
  ```
  Extract structured information from this document:

  Required output:
  - topics: Array of key themes/topics discussed
  - decisions: Array of decisions made
  - actions: Array of action items identified
  - lno_tasks: Object with three arrays:
    * leverage: High-impact strategic tasks
    * neutral: Necessary operational tasks
    * overhead: Low-value administrative tasks

  Document content:
  {markdown}
  ```

**Retry Logic (FR-010):**
- On invalid JSON: retry once with adjusted parameters
- Adjusted params: temperature=0.3 (from default 0.7), maxTokens+500
- Log retry attempt to processing_logs with operation='retry'

**Confidence Calculation (FR-011):**
```typescript
function calculateConfidence(output: DocumentOutput): number {
  let score = 1.0;

  // Deduct if arrays are empty
  if (output.topics.length === 0) score -= 0.2;
  if (output.decisions.length === 0) score -= 0.1;
  if (output.actions.length === 0) score -= 0.1;

  // Deduct if LNO tasks all empty
  const lnoTotal = output.lno_tasks.leverage.length +
                   output.lno_tasks.neutral.length +
                   output.lno_tasks.overhead.length;
  if (lnoTotal === 0) score -= 0.2;

  // Cap at 0.0 minimum
  return Math.max(0, score);
}
```

**Flag Review Required:**
- If confidence < 0.8: Set uploaded_files.status = 'review_required' (FR-011)

**Performance:**
- Target: < 4000ms for AI summarization
- Use streaming if available to show progress

**Environment:**
- Requires: `ANTHROPIC_API_KEY` in .env.local

### 3. `app/api/process/route.ts`

**Purpose:** Orchestrate the complete processing pipeline

**HTTP Method:** POST

**Request Body:**
```typescript
{
  fileId: string (UUID);
  forceInvalidJson?: boolean; // Test-only flag
  forceLowConfidence?: boolean; // Test-only flag
  forceFailure?: boolean; // Test-only flag
}
```

**Response (Success 200):**
```typescript
{
  success: true,
  documentId: string (UUID),
  fileId: string (UUID),
  markdownContent: string,
  structuredOutput: DocumentOutput,
  confidence: number,
  processingDuration: number,
  metrics: {
    fileHash: string,
    processingDuration: number,
    confidence: number
  }
}
```

**Response (Error 400/404/500):**
```typescript
{
  success: false,
  error: string,
  code: ErrorCode
}
```

**Processing Steps:**

```typescript
export async function POST(request: Request) {
  const startTime = Date.now();

  // 1. Validate request
  const body = await request.json();
  if (!body.fileId) {
    return Response.json(
      { success: false, error: 'Missing fileId', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  // 2. Fetch uploaded file metadata
  const { data: file } = await supabase
    .from('uploaded_files')
    .select('*')
    .eq('id', body.fileId)
    .single();

  if (!file) {
    return Response.json(
      { success: false, error: 'File not found', code: 'FILE_NOT_FOUND' },
      { status: 404 }
    );
  }

  try {
    // 3. Update status to processing
    await supabase
      .from('uploaded_files')
      .update({ status: 'processing' })
      .eq('id', body.fileId);

    // 4. Download file from storage
    const { data: fileData } = await supabase
      .storage
      .from('notes')
      .download(file.storage_path);

    const fileBuffer = Buffer.from(await fileData.arrayBuffer());

    // 5. Convert to Markdown (log operation)
    await logOperation(body.fileId, 'convert', 'started');
    const convertStartTime = Date.now();

    const { markdown, contentHash } = await convertToMarkdown(
      fileBuffer,
      file.mime_type,
      file.name
    );

    const convertDuration = Date.now() - convertStartTime;
    await logOperation(body.fileId, 'convert', 'completed', convertDuration);

    // 6. Extract structured data with AI (log operation)
    await logOperation(body.fileId, 'summarize', 'started');
    const summarizeStartTime = Date.now();

    let aiResult;
    try {
      aiResult = await extractStructuredData(markdown);
    } catch (error) {
      // Retry logic (FR-010)
      await logOperation(body.fileId, 'retry', 'started');
      aiResult = await extractStructuredData(markdown, { retry: true });
      await logOperation(body.fileId, 'retry', 'completed');
    }

    const summarizeDuration = Date.now() - summarizeStartTime;
    await logOperation(body.fileId, 'summarize', 'completed', summarizeDuration);

    // 7. Store Markdown and JSON in Supabase storage
    await logOperation(body.fileId, 'store', 'started');
    const storeStartTime = Date.now();

    const docId = crypto.randomUUID();
    const markdownPath = `processed/${docId}.md`;
    const jsonPath = `processed/${docId}.json`;

    await supabase.storage
      .from('notes')
      .upload(markdownPath, markdown, { contentType: 'text/markdown' });

    await supabase.storage
      .from('notes')
      .upload(jsonPath, JSON.stringify(aiResult.output), { contentType: 'application/json' });

    const storeDuration = Date.now() - storeStartTime;
    await logOperation(body.fileId, 'store', 'completed', storeDuration);

    // 8. Create processed_documents record
    const processingDuration = Date.now() - startTime;

    const { data: processedDoc } = await supabase
      .from('processed_documents')
      .insert({
        id: docId,
        file_id: body.fileId,
        markdown_content: markdown,
        markdown_storage_path: markdownPath,
        structured_output: aiResult.output,
        json_storage_path: jsonPath,
        confidence: aiResult.confidence,
        processing_duration: processingDuration,
      })
      .select()
      .single();

    // 9. Update file status (FR-011: review_required if confidence < 0.8)
    const finalStatus = aiResult.confidence < 0.8 ? 'review_required' : 'completed';
    await supabase
      .from('uploaded_files')
      .update({ status: finalStatus })
      .eq('id', body.fileId);

    // 10. Console log metrics (FR-007)
    console.log('[PROCESSING COMPLETE]', {
      fileId: body.fileId,
      fileHash: contentHash,
      duration: processingDuration,
      confidence: aiResult.confidence,
      status: finalStatus,
    });

    // 11. Return success response
    return Response.json({
      success: true,
      documentId: docId,
      fileId: body.fileId,
      markdownContent: markdown,
      structuredOutput: aiResult.output,
      confidence: aiResult.confidence,
      processingDuration,
      metrics: {
        fileHash: contentHash,
        processingDuration,
        confidence: aiResult.confidence,
      },
    });

  } catch (error: any) {
    // Error handling
    await logOperation(body.fileId, 'error', 'failed', undefined, error.message);

    await supabase
      .from('uploaded_files')
      .update({ status: 'failed' })
      .eq('id', body.fileId);

    console.error('[PROCESSING ERROR]', {
      fileId: body.fileId,
      error: error.message,
      stack: error.stack,
    });

    return Response.json(
      {
        success: false,
        error: error.message || 'Processing failed',
        code: 'PROCESSING_ERROR',
      },
      { status: 500 }
    );
  }
}

// Helper: Log operation to processing_logs
async function logOperation(
  fileId: string,
  operation: LogOperationType,
  status: LogStatusType,
  duration?: number,
  error?: string
) {
  await supabase.from('processing_logs').insert({
    file_id: fileId,
    operation,
    status,
    duration,
    error,
    metadata: {},
  });
}
```

### 4. `app/api/status/[fileId]/route.ts`

**Purpose:** Return processing status for frontend polling

**HTTP Method:** GET

**URL Parameter:** `fileId` (UUID)

**Response (Success 200):**
```typescript
{
  fileId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'review_required',
  summary?: DocumentOutput, // Only if status is completed or review_required
  confidence?: number,
  processingDuration?: number,
  error?: string // Only if status is failed
}
```

**Response (Error 404):**
```typescript
{
  success: false,
  error: 'File not found',
  code: 'FILE_NOT_FOUND'
}
```

**Implementation:**

```typescript
export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;

  // Fetch file metadata
  const { data: file } = await supabase
    .from('uploaded_files')
    .select('status')
    .eq('id', fileId)
    .single();

  if (!file) {
    return Response.json(
      { success: false, error: 'File not found', code: 'FILE_NOT_FOUND' },
      { status: 404 }
    );
  }

  // If completed or review_required, fetch processed document
  if (file.status === 'completed' || file.status === 'review_required') {
    const { data: processed } = await supabase
      .from('processed_documents')
      .select('structured_output, confidence, processing_duration')
      .eq('file_id', fileId)
      .single();

    if (processed) {
      return Response.json({
        fileId,
        status: file.status,
        summary: processed.structured_output,
        confidence: processed.confidence,
        processingDuration: processed.processing_duration,
      });
    }
  }

  // If failed, fetch error details
  if (file.status === 'failed') {
    const { data: errorLog } = await supabase
      .from('processing_logs')
      .select('error')
      .eq('file_id', fileId)
      .eq('status', 'failed')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    return Response.json({
      fileId,
      status: file.status,
      error: errorLog?.error || 'Processing failed',
    });
  }

  // Return current status (pending or processing)
  return Response.json({
    fileId,
    status: file.status,
  });
}
```

## Database Migration

File: `supabase/migrations/002_create_processing_tables.sql`

**Status:** Already created in TDD Step 1

**Tables:**
- `processed_documents` - Stores Markdown content and structured output
- Indexes on `file_id`, `expires_at`, `confidence`
- Trigger to auto-set `expires_at = processed_at + 30 days`
- RLS policies for public access (P0 development)

**Apply Migration:**
```bash
# Via Supabase CLI
supabase db push

# Or via Supabase Dashboard:
# SQL Editor → Paste migration → Run
```

## Testing Strategy

**Contract Tests:** `__tests__/contract/process.test.ts` (16 tests)
- FR-002: PDF/DOCX/TXT conversion
- FR-003: Structured data extraction
- FR-004: JSON + Markdown storage
- FR-007: Metrics logging
- FR-010: Invalid JSON retry
- FR-011: Low confidence flagging
- FR-013: 8-second performance target
- Error handling (400/404/500)

**Integration Tests:** `__tests__/integration/summary-flow.test.ts` (10 tests)
- Complete upload → process → status flow
- Status polling while processing
- Markdown/JSON storage verification
- Processing log trail
- Concurrent processing

**Test Execution:**
```bash
npm run test:run  # Run all tests once
npm run test      # Watch mode
```

## Quality Gates

- [ ] All 26 tests pass (16 contract + 10 integration)
- [ ] Processing completes < 8000ms (FR-013)
- [ ] Confidence score calculated correctly (FR-011)
- [ ] Retry logic handles invalid JSON (FR-010)
- [ ] All operations logged to processing_logs (FR-007)
- [ ] Markdown and JSON stored in Supabase storage
- [ ] Status endpoint returns correct data
- [ ] Error handling covers all edge cases

## Dependencies

**npm packages (already added to package.json):**
- `ai` (^4.0.0) - Vercel AI SDK
- `@anthropic-ai/sdk` (^0.30.0) - Anthropic client
- `pdf-parse` (^1.1.1) - PDF text extraction
- `mammoth` (^1.8.0) - DOCX conversion

**Environment Variables:**
- `ANTHROPIC_API_KEY` - Required for AI summarization
- `NEXT_PUBLIC_SUPABASE_URL` - Already configured
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Already configured

## Next Steps (After Backend Complete)

1. Apply database migration
2. Run tests to verify implementation
3. Delegate frontend to frontend-ui-builder agent:
   - Create `app/components/SummaryPanel.tsx`
   - Update `app/page.tsx` with polling and integration
4. Delegate to test-runner for full test execution
5. Delegate to code-reviewer for quality validation

## Notes

- Maintain same code quality standards as T001 (100% test coverage)
- Follow SYSTEM_RULES: Complete vertical slice (Backend + Frontend)
- User journey: Upload → Process → See Summary (no manual steps)
- Performance budget: 8s total (3s convert, 4s AI, 1s storage)
