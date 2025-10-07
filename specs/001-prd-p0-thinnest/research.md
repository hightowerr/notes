# Research: P0 – Thinnest Agentic Slice

**Date**: 2025-10-07
**Phase**: 0 (Outline & Research)
**Status**: Complete

## Research Questions

From Technical Context analysis, the following areas require research:

1. **Document Conversion Libraries** (PDF/DOCX/TXT → Markdown)
2. **Vercel AI SDK Integration** (LLM summarization)
3. **Testing Framework Setup** (Vitest/Jest + Playwright)
4. **Concurrent Processing Strategy** (up to 3 files)
5. **JSON Schema Validation** (deterministic outputs with retry)

---

## 1. Document Conversion Libraries

### Decision
- **PDF**: `pdf-parse` library
- **DOCX**: `mammoth` library
- **TXT/MD**: Native Node.js `fs` + UTF-8 encoding

### Rationale
- **pdf-parse**: Lightweight, pure JavaScript, no external dependencies. Extracts text reliably from most PDFs. Returns plain text suitable for Markdown conversion.
- **mammoth**: Specifically designed for DOCX → HTML/Markdown conversion. Preserves structure (headings, lists, bold/italic) better than alternatives like `docx-parser`.
- **TXT/MD**: No library needed - direct `fs.readFile` with UTF-8 encoding is sufficient.

### Alternatives Considered
- **pdf2json**: More complex, returns JSON structure requiring additional parsing
- **Apache Tika** (via REST API): External service dependency, violates local-first principle
- **docx-parser**: Returns raw XML, requires manual parsing

### OCR Fallback Strategy
For unreadable PDFs (scanned documents), implement fallback using Tesseract.js:
- Detect when `pdf-parse` returns empty/minimal text
- Convert PDF pages to images using `pdf-to-png`
- Run Tesseract OCR on images
- Flag results with confidence score from Tesseract
- If confidence <80%, mark as "review required" per FR-011

---

## 2. Vercel AI SDK Integration

### Decision
Use Vercel AI SDK v3+ with OpenAI provider (GPT-4-turbo or GPT-3.5-turbo):
```typescript
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const schema = z.object({
  topics: z.array(z.string()),
  decisions: z.array(z.string()),
  actions: z.array(z.string()),
  lno_tasks: z.object({
    leverage: z.array(z.string()),
    neutral: z.array(z.string()),
    overhead: z.array(z.string())
  })
});

const result = await generateObject({
  model: openai('gpt-4-turbo'),
  schema,
  prompt: `Extract structured summary from: ${markdown}`
});
```

### Rationale
- **generateObject()** with Zod schema ensures deterministic JSON output (satisfies Constitution Principle II)
- Built-in retry logic handles transient API failures
- Schema validation happens automatically - invalid outputs throw errors
- OpenAI models (GPT-4/3.5) proven for summarization tasks

### Alternatives Considered
- **Raw OpenAI SDK**: Requires manual JSON parsing and validation, more error-prone
- **Anthropic Claude**: Good quality but Vercel AI SDK OpenAI integration more mature
- **Local models (Ollama)**: Slower, less reliable summarization quality for P0 scope

### Retry Strategy
Per FR-010, implement single retry on validation failure:
```typescript
try {
  return await generateObject({ model, schema, prompt });
} catch (error) {
  // Retry with temperature adjustment
  return await generateObject({
    model,
    schema,
    prompt: `${prompt}\n\nIMPORTANT: Return valid JSON only.`,
    temperature: 0.3  // Lower temperature for more deterministic output
  });
}
```

---

## 3. Testing Framework Setup

### Decision
- **Unit/Integration Tests**: Vitest (fast, ESM-native, works with Next.js)
- **E2E Tests**: Playwright (official Next.js recommendation)
- **Coverage**: c8 (native V8 coverage, works with Vitest)

### Rationale
- **Vitest**: Drop-in Jest replacement, 10x faster, better TypeScript support, ESM modules
- **Playwright**: Multi-browser support, excellent Next.js integration, reliable file upload testing
- **c8**: No instrumentation overhead, accurate coverage for ESM modules

### Test Structure
```
__tests__/
├── unit/
│   ├── document-converter.test.ts    # Test PDF/DOCX/TXT conversion
│   └── ai-summarizer.test.ts         # Test AI SDK integration (mocked)
├── contract/
│   ├── upload.test.ts                # Test /api/upload contract
│   ├── process.test.ts               # Test /api/process contract
│   └── documents.test.ts             # Test /api/documents contract
└── integration/
    └── file-processing.test.ts       # End-to-end: upload → process → retrieve
```

### Configuration
```json
// vitest.config.ts
{
  "test": {
    "environment": "node",
    "coverage": {
      "provider": "c8",
      "reporter": ["text", "json", "html"],
      "threshold": {
        "lines": 80,
        "functions": 80,
        "branches": 75
      }
    }
  }
}
```

### Alternatives Considered
- **Jest**: Slower, CommonJS-first, requires more config for Next.js
- **Cypress**: Heavier than Playwright, slower test execution

---

## 4. Concurrent Processing Strategy

### Decision
Use p-limit library to control concurrency:
```typescript
import pLimit from 'p-limit';

const limit = pLimit(3); // Max 3 concurrent

const processFiles = async (files: File[]) => {
  const tasks = files.map(file =>
    limit(() => processDocument(file))
  );
  return Promise.all(tasks);
};
```

### Rationale
- Simple API, battle-tested (100M+ downloads/year)
- Automatically queues excess files beyond limit (FR-017 requirement)
- Works seamlessly with Promise.all for parallel execution
- Minimal overhead (~1KB)

### Alternatives Considered
- **Manual Promise.allSettled** with chunking: More complex, error-prone
- **async-pool**: Similar but less popular, fewer updates
- **Worker threads**: Overkill for I/O-bound operations (PDF parsing, API calls)

### Queue Behavior
Per FR-017, when 5 files uploaded:
- Files 1-3: Process immediately in parallel
- Files 4-5: Automatically queued, start when slot available
- UI shows "Processing (2/5)" status during queue execution

---

## 5. JSON Schema Validation

### Decision
Use Zod for runtime schema validation:
```typescript
import { z } from 'zod';

export const OutputSchema = z.object({
  topics: z.array(z.string()).min(1),
  decisions: z.array(z.string()),
  actions: z.array(z.string()),
  lno_tasks: z.object({
    leverage: z.array(z.string()),
    neutral: z.array(z.string()),
    overhead: z.array(z.string())
  })
});

export type DocumentOutput = z.infer<typeof OutputSchema>;
```

### Rationale
- **Type-safe**: Generates TypeScript types from schema
- **Runtime validation**: Catches invalid AI outputs before storage
- **Integration**: Works natively with Vercel AI SDK `generateObject()`
- **Detailed errors**: Provides specific field-level validation errors for debugging

### Validation Strategy
```typescript
try {
  const validated = OutputSchema.parse(aiOutput);
  // Save to Supabase
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Schema validation failed:', error.errors);
    // Trigger retry per FR-010
  }
}
```

### Alternatives Considered
- **JSON Schema + ajv**: Separate types and validation, more verbose
- **Yup**: Less TypeScript-friendly, weaker type inference
- **Manual validation**: Error-prone, doesn't satisfy deterministic outputs requirement

---

## Dependencies to Add

```json
{
  "dependencies": {
    "pdf-parse": "^1.1.1",
    "mammoth": "^1.6.0",
    "zod": "^3.22.4",
    "ai": "^3.0.0",
    "@ai-sdk/openai": "^0.0.20",
    "p-limit": "^5.0.0"
  },
  "devDependencies": {
    "vitest": "^1.3.0",
    "@playwright/test": "^1.41.0",
    "@types/pdf-parse": "^1.1.4",
    "c8": "^9.1.0"
  }
}
```

---

## Performance Considerations

### Processing Time Breakdown (estimated)
- File upload to Supabase: ~500ms (for 2MB PDF)
- PDF/DOCX conversion: ~1-2s
- AI summarization (GPT-4-turbo): ~3-5s
- JSON validation + storage: ~200ms
- **Total**: ~5-8s (meets FR-013 target)

### Optimization Opportunities
- Stream file uploads (reduce latency)
- Cache conversion results by file hash (avoid reprocessing duplicates)
- Use GPT-3.5-turbo for speed vs GPT-4 for quality (configurable)
- Parallel API calls if multiple AI passes needed

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| OCR processing slow (>10s) | Violates FR-013 | Flag as "delayed" after 8s, complete async |
| LLM timeout | Processing failure | Implement exponential backoff, queue retry |
| Malformed PDF crashes parser | System downtime | Wrap in try-catch, log to Supabase per FR-008 |
| Concurrent uploads exhaust memory | Server crash | Set max file size (10MB), limit concurrency to 3 |

---

## Next Steps (Phase 1)

1. Create `data-model.md` with entity definitions
2. Generate OpenAPI contracts for `/api/upload`, `/api/process`, `/api/documents`
3. Write failing contract tests
4. Create `quickstart.md` with integration test scenarios
5. Update `CLAUDE.md` with new tech stack details

---

**Research Complete** ✅ - All NEEDS CLARIFICATION resolved. Ready for Phase 1 design.
