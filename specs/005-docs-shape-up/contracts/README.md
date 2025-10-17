# API Contracts: Vector Storage Foundation

**Feature**: Phase 1 - Vector Storage Foundation
**Date**: 2025-10-17
**Status**: Complete

## Overview

This directory contains OpenAPI 3.1 specifications for all API endpoints introduced in Phase 1. Contracts define request/response schemas, validation rules, and error handling to ensure consistent behavior across implementation and testing.

## Contracts

### POST /api/embeddings/search

**File**: [`POST_embeddings_search.json`](./POST_embeddings_search.json)

**Purpose**: Perform semantic similarity search across stored task embeddings.

**Request**:
```json
{
  "query": "increase monthly revenue",
  "limit": 20,        // optional, default: 20
  "threshold": 0.7    // optional, default: 0.7
}
```

**Response** (200 OK):
```json
{
  "tasks": [
    {
      "task_id": "abc123...",
      "task_text": "Implement revenue tracking dashboard",
      "document_id": "550e8400-e29b-41d4-a716-446655440000",
      "similarity": 0.89
    }
  ],
  "query": "increase monthly revenue",
  "count": 1
}
```

**Error Codes**:
- `400 INVALID_QUERY`: Empty or invalid query string
- `400 INVALID_THRESHOLD`: Threshold not in range [0, 1]
- `400 INVALID_LIMIT`: Limit not in range [1, 100]
- `500 EMBEDDING_GENERATION_FAILED`: Failed to generate query embedding
- `500 DATABASE_ERROR`: Vector search query failed
- `503 EMBEDDING_SERVICE_UNAVAILABLE`: OpenAI API temporarily unavailable

---

## Contract Testing

### Test Structure

Contract tests are located in `__tests__/contract/embeddings.test.ts` and validate:

1. **Request Validation**:
   - Valid requests accepted
   - Invalid requests rejected with correct error codes
   - Default values applied correctly

2. **Response Schema**:
   - All required fields present
   - Field types match schema
   - Arrays and nested objects validated

3. **Edge Cases**:
   - Empty query handling
   - No results above threshold
   - Maximum result limit enforcement

### Running Contract Tests

```bash
# Run all contract tests
npm run test:contract

# Run embedding contract tests specifically
npm run test:contract -- embeddings.test.ts

# Run with coverage
npm run test:contract -- --coverage
```

### Test Scenarios

#### Scenario 1: Valid Search Request
```typescript
describe('POST /api/embeddings/search', () => {
  it('should return ranked results for valid query', async () => {
    const response = await request(app)
      .post('/api/embeddings/search')
      .send({
        query: 'increase monthly revenue',
        limit: 20,
        threshold: 0.7,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchSchema(SearchResponseSchema);
    expect(response.body.tasks).toBeInstanceOf(Array);
    expect(response.body.count).toBe(response.body.tasks.length);

    // Validate similarity scores descending
    const similarities = response.body.tasks.map(t => t.similarity);
    expect(similarities).toEqual([...similarities].sort((a, b) => b - a));
  });
});
```

#### Scenario 2: Invalid Request Handling
```typescript
it('should reject empty query with 400', async () => {
  const response = await request(app)
    .post('/api/embeddings/search')
    .send({ query: '' });

  expect(response.status).toBe(400);
  expect(response.body.code).toBe('INVALID_QUERY');
});

it('should reject invalid threshold with 400', async () => {
  const response = await request(app)
    .post('/api/embeddings/search')
    .send({ query: 'test', threshold: 1.5 });

  expect(response.status).toBe(400);
  expect(response.body.code).toBe('INVALID_THRESHOLD');
});
```

#### Scenario 3: No Results Handling
```typescript
it('should return empty array for no matches', async () => {
  const response = await request(app)
    .post('/api/embeddings/search')
    .send({ query: 'quantum computing algorithms', threshold: 0.95 });

  expect(response.status).toBe(200);
  expect(response.body.tasks).toEqual([]);
  expect(response.body.count).toBe(0);
});
```

#### Scenario 4: API Unavailability
```typescript
it('should return 503 when embedding service unavailable', async () => {
  // Mock OpenAI API failure
  mockEmbedFunction.mockRejectedValueOnce(new Error('API unavailable'));

  const response = await request(app)
    .post('/api/embeddings/search')
    .send({ query: 'test' });

  expect(response.status).toBe(503);
  expect(response.body.code).toBe('EMBEDDING_SERVICE_UNAVAILABLE');
});
```

---

## Schema Validation

### Zod Schema Definitions

```typescript
// lib/schemas/embeddingSchema.ts
import { z } from 'zod';

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().positive().max(100).default(20),
  threshold: z.number().min(0).max(1).default(0.7),
});

export const SimilarityResultSchema = z.object({
  task_id: z.string(),
  task_text: z.string(),
  document_id: z.string().uuid(),
  similarity: z.number().min(0).max(1),
});

export const SearchResponseSchema = z.object({
  tasks: z.array(SimilarityResultSchema),
  query: z.string(),
  count: z.number().int().nonnegative(),
});
```

### Runtime Validation

```typescript
// app/api/embeddings/search/route.ts
import { SearchRequestSchema, SearchResponseSchema } from '@/lib/schemas/embeddingSchema';

export async function POST(request: NextRequest) {
  // Validate request
  const body = await request.json();
  const validation = SearchRequestSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        error: 'Invalid request',
        message: validation.error.message,
        code: 'INVALID_QUERY',
      },
      { status: 400 }
    );
  }

  // ... perform search ...

  // Validate response before returning
  const response = { tasks, query, count };
  SearchResponseSchema.parse(response); // Throws if invalid

  return NextResponse.json(response);
}
```

---

## Performance Requirements

Per spec requirements (FR-015, FR-016):

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Search latency (p95) | <500ms | Monitor with `time curl` or test assertions |
| Result limit | 20 (default), max 100 | Contract test validation |
| Threshold | 0.7 (default), range [0, 1] | Contract test validation |
| Similarity scores | Descending order | Contract test assertion |

### Performance Test Example

```typescript
it('should complete search within 500ms', async () => {
  const start = Date.now();

  const response = await request(app)
    .post('/api/embeddings/search')
    .send({ query: 'test query' });

  const duration = Date.now() - start;

  expect(response.status).toBe(200);
  expect(duration).toBeLessThan(500); // p95 target
});
```

---

## Error Handling Matrix

| Scenario | HTTP Status | Error Code | Retry? |
|----------|-------------|------------|--------|
| Empty query | 400 | INVALID_QUERY | No (client error) |
| Threshold out of range | 400 | INVALID_THRESHOLD | No (client error) |
| Limit out of range | 400 | INVALID_LIMIT | No (client error) |
| Embedding generation failed | 500 | EMBEDDING_GENERATION_FAILED | Yes (transient) |
| Database query failed | 500 | DATABASE_ERROR | Yes (transient) |
| OpenAI API unavailable | 503 | EMBEDDING_SERVICE_UNAVAILABLE | Yes (wait + retry) |

---

## Future Contract Extensions

*Not included in Phase 1 - documented for future phases*:

### POST /api/embeddings/batch-search (Phase 2+)
Batch similarity search for multiple queries.

### GET /api/embeddings/status (Phase 2+)
Check embedding generation status for document.

### POST /api/embeddings/regenerate (Phase 2+)
Manually trigger embedding regeneration for failed tasks.

---

**Contract Status**: ✅ Complete
**Next Artifact**: quickstart.md (validation scenarios)
