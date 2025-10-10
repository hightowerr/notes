# Frontend UI Builder - T004 Client-Side Validation

## Task
Add client-side file validation in the upload UI to provide immediate feedback before sending files to the server.

## Requirements

### 1. Pre-Upload Validation Function
Create a validation function that checks files BEFORE upload:

```typescript
const validateFileBeforeUpload = (file: File): { valid: boolean; error?: string } => {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ];

  // Check file size
  if (file.size > MAX_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File too large: ${file.name} (${sizeMB}MB). Maximum size: 10MB`,
    };
  }

  // Check MIME type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.name}. Please use PDF, DOCX, or TXT files.`,
    };
  }

  return { valid: true };
};
```

### 2. Update Upload Handler
Modify `handleFilesAdded` function (line 148) to validate BEFORE uploading:

```typescript
const handleFilesAdded = async (files: File[]) => {
  for (const file of files) {
    // Client-side validation FIRST
    const validation = validateFileBeforeUpload(file);
    if (!validation.valid) {
      // Show error toast immediately
      toast.error(validation.error!);

      // Log to console
      console.error('[CLIENT VALIDATION]', {
        filename: file.name,
        size: file.size,
        type: file.type,
        error: validation.error,
      });

      continue; // Skip this file, don't upload
    }

    // Rest of upload logic...
  }
};
```

### 3. Display Supported Formats
Update the upload area description (line 378-380) to show supported formats:

**Current:**
```tsx
<p className="text-sm text-muted-foreground">
  Drag & drop or click to browse • PDF, DOCX, TXT (max 10MB)
</p>
```

**Enhanced (add below):**
```tsx
<p className="text-xs text-muted-foreground mt-1">
  Accepts: PDF, DOCX, TXT, MD • Maximum: 10MB
</p>
```

### 4. Handle Server-Side Validation Errors
Ensure server errors are displayed properly (already exists but verify):

- Line 210-211: Shows toast for server errors
- Line 213-219: Logs server errors to console

### Implementation Changes

**File: `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/page.tsx`**

1. Add `validateFileBeforeUpload` function after imports (around line 28)
2. Modify `handleFilesAdded` to call validation before upload (line 148)
3. Update upload area text to show supported formats clearly (line 378-380)
4. Ensure error toasts show for both client and server validation

### Success Criteria
- ✅ Client-side validation runs before any upload request
- ✅ Invalid files show error toast immediately (no network call)
- ✅ Oversized files show size in error message
- ✅ Unsupported formats show which formats are accepted
- ✅ Valid files proceed to upload normally
- ✅ Upload area displays supported formats clearly

### Files to Modify
- `/home/yunix/learning-agentic/ideas/Note-synth/notes/app/page.tsx`

### Context
- Current upload handler is at line 148-244
- Toast notifications use `sonner` library (imported line 9)
- Error handling for server responses already exists (line 200-220)

### Output Required
- Implementation plan
- Modified code
- Confirmation of changes
