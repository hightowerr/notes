# Test Fixtures

This directory contains test files used for integration and contract testing.

## Files

- `sample-meeting-notes.txt` - Plain text meeting notes with topics, decisions, actions, and LNO tasks
- `sample-strategy-doc.txt` - Strategic planning document for testing AI extraction
- `test-helpers.ts` - Helper functions for uploading fixtures to Supabase storage

## Usage

```typescript
import { uploadTestFile, cleanupTestFile } from './__tests__/fixtures/test-helpers';

// Upload fixture before test
const { fileId, storagePath } = await uploadTestFile('sample-meeting-notes.txt');

// Run your test...

// Cleanup after test
await cleanupTestFile(fileId, storagePath);
```

## Notes

- All test files are designed to produce predictable AI extraction results
- Files contain clear topics, decisions, actions, and LNO-categorized tasks
- TXT format is used primarily to avoid PDF generation complexity
- Storage paths follow pattern: `test-fixtures/{uuid}-{filename}`
