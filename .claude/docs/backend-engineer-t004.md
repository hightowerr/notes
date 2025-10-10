# Backend Engineer - T004 Error Validation Enhancement

## Task
Enhance backend validation in `/api/upload` to provide better error handling and logging for rejected file uploads.

## Requirements

### 1. HTTP Status Code Fixes
- Change file size validation to return **HTTP 413** (Payload Too Large) instead of 400
- Keep format validation at HTTP 400 (Bad Request)
- Keep other validation errors at HTTP 400

### 2. Logging Rejected Uploads
Add logging to `processing_logs` table for ALL rejected uploads:

```typescript
await supabase
  .from('processing_logs')
  .insert({
    file_id: null, // No file ID yet for rejected uploads
    operation: 'upload',
    status: 'failed',
    duration: Date.now() - startTime,
    error: validation.error,
    metadata: {
      filename: file.name,
      size: file.size,
      mime_type: file.type,
      rejection_reason: validation.code,
    },
    timestamp: new Date().toISOString(),
  });
```

### 3. Enhanced Error Messages
Make error messages more descriptive:

**File Too Large:**
```
File too large: {filename} ({actualSize}MB). Maximum size: 10MB
```

**Unsupported Format:**
```
Unsupported file type: {filename}. Please use PDF, DOCX, or TXT files.
```

### Implementation Changes

**File: `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/api/upload/route.ts`**

1. After line 42-60 (validation block), add logging for rejected uploads
2. Change HTTP status code for FILE_TOO_LARGE from 400 to 413
3. Update error messages to include filename and specific details
4. Ensure all rejected uploads are logged before returning error response

### Success Criteria
- ✅ Oversized files return HTTP 413
- ✅ Invalid formats return HTTP 400
- ✅ All rejections logged to processing_logs table with metadata
- ✅ Error messages include filename and specific details
- ✅ Existing valid upload flow unchanged

### Files to Modify
- `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/api/upload/route.ts`

### Context
- Current validation logic is in `lib/schemas.ts` (validateFileUpload function)
- Backend already uses `processing_logs` table for successful uploads (line 197-211)
- Need to add similar logging for failures

### Output Required
- Implementation plan
- Modified code
- Confirmation of changes
