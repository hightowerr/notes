# Quickstart: P0 – Thinnest Agentic Slice

**Date**: 2025-10-07
**Phase**: 1 (Design & Contracts)
**Purpose**: Integration test scenarios to validate end-to-end functionality

## Prerequisites

1. **Environment Setup**
```bash
# Install dependencies
npm install

# Set environment variables
cp .env.local.example .env.local
# Edit .env.local with:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# - OPENAI_API_KEY

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

2. **Test Data**
- Sample PDF: `docs/test docs/Vision, Strategy, Objectives, Roadmap.pdf` (already exists)
- Sample DOCX: Create a test `.docx` file with meeting notes
- Sample TXT: Create a simple `.txt` file

---

## Scenario 1: Happy Path - PDF Upload & Processing

**Test**: Upload a valid PDF and verify complete autonomous processing

**Steps**:
```bash
# 1. Upload PDF
curl -X POST -F "file=@docs/test docs/Vision, Strategy, Objectives, Roadmap.pdf" \
  http://localhost:3000/api/upload

# Expected Response:
# {
#   "success": true,
#   "fileId": "<uuid>",
#   "status": "processing",
#   "message": "File uploaded successfully. Processing started."
# }

# 2. Check processing status (poll every 2s)
FILE_ID="<uuid from step 1>"
curl http://localhost:3000/api/documents/$FILE_ID/status

# Expected Response (while processing):
# {
#   "success": true,
#   "status": "processing",
#   "progress": {
#     "currentOperation": "summarize",
#     "percentComplete": 60
#   }
# }

# 3. Wait for completion (~5-8s), then retrieve document
curl http://localhost:3000/api/documents/$FILE_ID

# Expected Response:
# {
#   "success": true,
#   "document": {
#     "fileId": "<uuid>",
#     "fileName": "Vision, Strategy, Objectives, Roadmap.pdf",
#     "markdownContent": "# Vision\n\n...",
#     "structuredOutput": {
#       "topics": ["Vision", "Strategy", "Objectives"],
#       "decisions": [...],
#       "actions": [...],
#       "lno_tasks": { "leverage": [...], "neutral": [...], "overhead": [...] }
#     },
#     "confidence": 0.92,
#     "processingDuration": 6800,
#     "processedAt": "2025-10-07T10:00:07Z"
#   }
# }
```

**Acceptance Criteria** (from spec):
- ✅ FR-001: File automatically detected and processed without manual action
- ✅ FR-002: PDF converted to Markdown
- ✅ FR-003: Structured data extracted (topics, decisions, actions, LNO tasks)
- ✅ FR-004: Both Markdown and JSON outputs available
- ✅ FR-006: Status updates available via API
- ✅ FR-013: Processing completes within ~8s

---

## Scenario 2: File Size Validation

**Test**: Upload a file exceeding 10MB limit

**Steps**:
```bash
# Create a large test file (11MB)
dd if=/dev/zero of=/tmp/large-file.pdf bs=1M count=11

# Attempt upload
curl -X POST -F "file=@/tmp/large-file.pdf" \
  http://localhost:3000/api/upload

# Expected Response:
# {
#   "success": false,
#   "error": "File size exceeds 10MB limit",
#   "code": "FILE_TOO_LARGE"
# }
```

**Acceptance Criteria**:
- ✅ FR-016: Files > 10MB rejected with clear error message

---

## Scenario 3: Unsupported File Format

**Test**: Upload an unsupported file format

**Steps**:
```bash
# Create PowerPoint file
echo "test" > /tmp/test.pptx

# Attempt upload
curl -X POST -F "file=@/tmp/test.pptx" \
  http://localhost:3000/api/upload

# Expected Response:
# {
#   "success": false,
#   "error": "Unsupported file format. Only PDF, DOCX, TXT, and Markdown files are supported.",
#   "code": "UNSUPPORTED_FORMAT"
# }
```

**Acceptance Criteria**:
- ✅ FR-008: Invalid file formats handled gracefully without crashes
- ✅ System logs error to Supabase

---

## Scenario 4: Concurrent Upload Processing

**Test**: Upload 5 files simultaneously and verify queue behavior

**Steps**:
```bash
# Upload 5 files in parallel
for i in {1..5}; do
  curl -X POST -F "file=@test-file-$i.txt" \
    http://localhost:3000/api/upload &
done
wait

# Expected Responses:
# Files 1-3: { "status": "processing", "queuePosition": null }
# Files 4-5: { "status": "pending", "queuePosition": 1 } and { "queuePosition": 2 }

# Check status of all files
curl http://localhost:3000/api/documents?status=processing

# Expected: 3 files in "processing" state
# Expected: 2 files in "pending" state (queued)
```

**Acceptance Criteria**:
- ✅ FR-017: Max 3 files processed concurrently
- ✅ FR-017: Additional files queued and processed sequentially

---

## Scenario 5: Low Confidence Summary (Review Required)

**Test**: Upload a complex/ambiguous document triggering low confidence

**Steps**:
```bash
# Create a document with minimal content
echo "Lorem ipsum dolor sit amet" > /tmp/minimal.txt

# Upload
curl -X POST -F "file=@/tmp/minimal.txt" \
  http://localhost:3000/api/upload

# Get FILE_ID, then retrieve document
curl http://localhost:3000/api/documents/$FILE_ID

# Expected Response:
# {
#   "document": {
#     ...,
#     "confidence": 0.65,  // < 0.8 threshold
#     "status": "review_required"
#   }
# }

# Check logs
curl http://localhost:3000/api/documents/$FILE_ID/status

# Expected: Log entry with "review_required" flag
```

**Acceptance Criteria**:
- ✅ FR-011: Summaries with confidence <80% flagged as "review required"
- ✅ FR-007: Confidence scores logged

---

## Scenario 6: Invalid JSON Retry Logic

**Test**: Verify system retries when AI returns invalid JSON (requires mocking)

**Integration Test Pseudocode**:
```typescript
// Mock AI SDK to return invalid JSON first, then valid JSON on retry
jest.mock('ai', () => ({
  generateObject: jest.fn()
    .mockRejectedValueOnce(new Error('Invalid JSON schema'))
    .mockResolvedValueOnce({ topics: [...], decisions: [...], ... })
}));

// Upload file
const response = await POST('/api/upload', formData);

// Verify retry happened
expect(generateObject).toHaveBeenCalledTimes(2);

// Verify final success
const document = await GET(`/api/documents/${fileId}`);
expect(document.structuredOutput).toBeDefined();

// Verify retry logged
const logs = await GET(`/api/documents/${fileId}/status`);
expect(logs).toContainEqual({ operation: 'retry', status: 'completed' });
```

**Acceptance Criteria**:
- ✅ FR-010: System retries once with adjusted parameters on invalid JSON
- ✅ FR-007: Retry attempts logged

---

## Scenario 7: Duplicate File Handling

**Test**: Upload same file twice and verify hash-based deduplication

**Steps**:
```bash
# Upload file first time
curl -X POST -F "file=@test-doc.pdf" \
  http://localhost:3000/api/upload
# Response: { "fileId": "uuid-1", "status": "processing" }

# Upload identical file second time
curl -X POST -F "file=@test-doc.pdf" \
  http://localhost:3000/api/upload

# Expected Response:
# {
#   "success": true,
#   "fileId": "uuid-1",  // Same UUID as first upload
#   "status": "completed",
#   "message": "File already processed. Returning existing results."
# }
```

**Acceptance Criteria**:
- ✅ FR-012: Duplicate filenames handled via content hash
- ✅ System returns existing processed document instead of reprocessing

---

## Scenario 8: Unreadable PDF (OCR Fallback)

**Test**: Upload a scanned PDF requiring OCR

**Steps**:
```bash
# Upload scanned PDF (image-based, no text layer)
curl -X POST -F "file=@scanned-document.pdf" \
  http://localhost:3000/api/upload

# Monitor processing (will take longer ~15-20s due to OCR)
curl http://localhost:3000/api/documents/$FILE_ID/status

# Expected logs:
# - convert (failed) - "No text extracted"
# - retry (started) - "Attempting OCR fallback"
# - convert (completed) - "OCR successful"

# Retrieve document
curl http://localhost:3000/api/documents/$FILE_ID

# Expected: Markdown content extracted via OCR
# Expected: Confidence score may be lower due to OCR uncertainty
```

**Acceptance Criteria**:
- ✅ FR-009: OCR fallback attempted for unreadable PDFs
- ✅ System marks OCR results with appropriate confidence score

---

## Scenario 9: 30-Day Expiration

**Test**: Verify processed documents expire after 30 days

**Integration Test Pseudocode**:
```typescript
// Upload and process document
const { fileId } = await uploadFile('test.pdf');

// Fast-forward time by 30 days (mock Date.now)
jest.useFakeTimers();
jest.setSystemTime(Date.now() + 30 * 24 * 60 * 60 * 1000);

// Run cleanup cron job
await runCleanupJob();

// Verify document deleted from database
const document = await getDocument(fileId);
expect(document).toBeNull();

// Verify storage files deleted
const markdownExists = await supabase.storage.from('notes').exists(...);
const jsonExists = await supabase.storage.from('notes').exists(...);
expect(markdownExists).toBe(false);
expect(jsonExists).toBe(false);

// Verify uploaded_file metadata retained (audit trail)
const fileRecord = await getUploadedFile(fileId);
expect(fileRecord).toBeDefined();
expect(fileRecord.status).toBe('expired');
```

**Acceptance Criteria**:
- ✅ FR-018: Processed documents deleted after 30 days
- ✅ File metadata retained for audit purposes

---

## Scenario 10: End-to-End Performance

**Test**: Measure processing time for standard document

**Steps**:
```bash
# Upload with timing
time curl -X POST -F "file=@standard-meeting-notes.pdf" \
  http://localhost:3000/api/upload

# Poll status and measure total time
START=$(date +%s)
while true; do
  STATUS=$(curl -s http://localhost:3000/api/documents/$FILE_ID/status | jq -r '.status')
  if [ "$STATUS" = "completed" ]; then
    END=$(date +%s)
    DURATION=$((END - START))
    echo "Processing completed in ${DURATION}s"
    break
  fi
  sleep 1
done

# Retrieve processing metrics
curl http://localhost:3000/api/documents/$FILE_ID | jq '.document.processingDuration'

# Expected: < 8000ms (8 seconds)
```

**Acceptance Criteria**:
- ✅ FR-013: Average processing time < 8s for standard documents
- ✅ FR-007: Processing duration logged accurately

---

## Running All Tests

```bash
# Unit tests
npm run test:unit

# Contract tests
npm run test:contract

# Integration tests (requires running server)
npm run dev &
npm run test:integration

# E2E tests with Playwright
npm run test:e2e

# Generate coverage report
npm run test:coverage
```

**Coverage Targets** (per Constitution):
- Lines: ≥80%
- Functions: ≥80%
- Branches: ≥75%

---

## Success Metrics Validation

After running quickstart scenarios, verify these metrics:

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Autonomy | 100% | No manual actions in Scenarios 1-10 |
| File detection reliability | ≥95% | Track upload success rate |
| Summarization accuracy | ≥85% | Manual review of 20 sample outputs |
| Output completeness | 100% | All documents have topics/decisions/actions/LNO |
| Avg processing time | <8s | Measure processingDuration in logs |

---

## Troubleshooting

**Issue**: Processing hangs at "convert" step
- **Check**: pdf-parse installation (`npm list pdf-parse`)
- **Solution**: Reinstall with `npm install pdf-parse --save`

**Issue**: AI summarization returns empty results
- **Check**: OPENAI_API_KEY in `.env.local`
- **Solution**: Verify API key has sufficient credits

**Issue**: Supabase storage errors
- **Check**: RLS policies applied (`docs/supabase-rls-policies.sql`)
- **Solution**: Run SQL script in Supabase dashboard

---

**Quickstart Complete** ✅ - Integration test scenarios defined. Ready for TDD implementation.
