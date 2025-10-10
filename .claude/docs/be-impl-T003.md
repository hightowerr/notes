# Backend Implementation: T003 Dashboard Documents API

## API Endpoint
- Route: GET /api/documents
- Purpose: Retrieve all uploaded files with their processing status and summaries
- Auth: None (P0 public access)

## Request/Response Contract

**Request**:
```
GET /api/documents?status=completed&sort=date&order=desc

Query Parameters (all optional):
- status: "pending" | "processing" | "completed" | "failed" | "review_required" | "all"
- sort: "date" | "name" | "confidence" | "size"
- order: "asc" | "desc"
```

**Response Success (200)**:
```typescript
{
  "success": true,
  "documents": [
    {
      "id": "uuid",
      "name": "meeting-notes.pdf",
      "size": 2097152,
      "mimeType": "application/pdf",
      "uploadedAt": "2025-10-07T10:00:00Z",
      "status": "completed",
      "confidence": 0.92,
      "processingDuration": 6700,
      "summary": {
        "topics": ["Q4 Strategy", "Budget Planning"],
        "decisions": ["Hire 3 engineers by EOY"],
        "actions": ["Schedule design review"],
        "lno_tasks": {
          "leverage": ["Define metrics for Q4"],
          "neutral": ["Update documentation"],
          "overhead": ["File expense reports"]
        }
      }
    }
  ]
}
```

**Response Error (400)**:
```typescript
{
  "success": false,
  "error": "Invalid status filter. Allowed: pending, processing, completed, failed, review_required, all",
  "code": "INVALID_REQUEST"
}
```

**Response Error (500)**:
```typescript
{
  "success": false,
  "error": "Database query failed",
  "code": "STORAGE_ERROR"
}
```

## Service Layer
- Service: No separate service needed - query logic in route handler
- Methods: N/A (direct Supabase queries)
- Logic: Join uploaded_files + processed_documents, filter, sort, return formatted results

## Database Changes
- Table: None (uses existing uploaded_files, processed_documents)
- New columns: None
- Indexes: Already exist (idx_uploaded_files_status, idx_uploaded_files_uploaded_at, idx_processed_documents_confidence)
- RLS policies: Already configured (public access for P0)
- Migration: None needed

## Validation
- Input validation: Query parameter validation with Zod
  - Status enum validation
  - Sort field enum validation
  - Order enum validation
- Business rules: None (simple data retrieval)

## Error Handling
- Invalid query param → 400 with specific message
- DB error → 500 with logged details (generic message to user)
- Empty results → 200 with empty array (not an error)
- Retry logic: None (simple query, no external API)

## Test Plan
- Unit tests: Query parameter validation
- Integration tests:
  - GET /api/documents returns all files
  - Filter by status=completed returns only completed
  - Filter by status=review_required returns low confidence
  - Sort by confidence ascending works
  - Sort by date descending (default) works
  - Empty database returns empty array
  - Invalid status returns 400 error
- Edge cases:
  - No query parameters (return all, sorted by date desc)
  - File with no processed_documents (show as processing/failed)
  - Multiple files with same confidence (stable sort)

## Frontend Integration
What this enables frontend to do:
- Fetch all documents with `GET /api/documents`
- Filter by status with `?status=completed`
- Sort by confidence with `?sort=confidence&order=asc`
- Display document metadata (name, size, date, status)
- Show summary data when available (topics, decisions, actions, LNO tasks)
- Handle empty state (no documents uploaded yet)
