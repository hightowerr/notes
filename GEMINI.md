# GEMINI.md

This file provides guidance to Gemini when working with code in this repository.

## Project Overview

**AI Note Synthesiser** — An autonomous agent that detects uploaded note files, converts them to Markdown, summarizes content, and extracts structured data without manual intervention.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vercel AI SDK (OpenAI GPT-4o), Supabase, Tailwind CSS v4

**Core Pattern:** Sense → Reason → Act loop
- **Sense:** File upload detection
- **Reason:** Convert to Markdown → AI summarization → Extract structured data
- **Act:** Store JSON + Markdown outputs, display summary panel
- **Learn:** Log metrics (hash, duration, confidence scores)

## Architecture

### High-Level Processing Pipeline

```
1. Upload (T001)
   ├─ Browser → POST /api/upload
   ├─ Validate file (type, size, hash)
   ├─ Store in Supabase storage (notes bucket)
   └─ Save metadata to uploaded_files table

2. Process (T002)
   ├─ POST /api/process (automatic trigger from upload)
   ├─ noteProcessor.ts: PDF/DOCX/TXT → Markdown
   ├─ aiSummarizer.ts: GPT-4o extraction
   │   ├─ Topics (array of strings)
   │   ├─ Decisions (array of strings)
   │   ├─ Actions (array of strings)
   │   └─ LNO tasks (Leverage/Neutral/Overhead categorization)
   ├─ Store Markdown in notes/processed/
   ├─ Store JSON in processed_documents table
   └─ Update status: completed | review_required | failed

3. Display (T002 Frontend)
   ├─ Status polling (GET /api/status/[fileId])
   ├─ SummaryPanel.tsx renders when complete
   └─ Toast notification on completion
```

### Key Service Modules

**`lib/services/noteProcessor.ts`** - File conversion service
- Converts PDF (pdf-parse), DOCX (mammoth), TXT to Markdown
- Generates SHA-256 content hashes for deduplication
- OCR fallback placeholder for unreadable PDFs

**`lib/services/aiSummarizer.ts`** - AI extraction service
- Uses Vercel AI SDK with OpenAI GPT-4o
- Structured output via Zod schemas
- Retry logic for invalid JSON

**`lib/services/clusteringService.ts`** - Clustering service
- Groups similar tasks together based on their vector embeddings

**`lib/services/dependencyService.ts`** - Dependency service
- Detects dependencies between tasks

**`lib/services/documentService.ts`** - Document service
- Manages document-related operations

**`lib/services/embeddingQueue.ts`** - Embedding queue service
- Manages the queue of documents to be embedded

**`lib/services/embeddingService.ts`** - Embedding service
- Generates vector embeddings for tasks

**`lib/services/filteringService.ts`** - Filtering service
- Filters documents based on user-defined criteria

**`lib/services/noteProcessor.ts`** - File conversion service
- Converts PDF (pdf-parse), DOCX (mammoth), TXT to Markdown
- Generates SHA-256 content hashes for deduplication
- OCR fallback placeholder for unreadable PDFs

**`lib/services/outcomeService.ts`** - Outcome service
- Manages user-defined outcomes

**`lib/services/processingQueue.ts`** - Concurrent upload management
- Enforces max 3 parallel processing jobs
- FIFO queue for additional uploads

**`lib/services/recomputeDebounce.ts`** - Recompute debounce service
- Debounces recompute requests to avoid unnecessary recomputations

**`lib/services/recomputeService.ts`** - Recompute service
- Recomputes document summaries and embeddings when necessary

**`lib/services/reflectionService.ts`** - Reflection service
- Manages user reflections

**`lib/services/vectorStorage.ts`** - Vector storage service
- Stores and retrieves vector embeddings

## Building and Running

### Prerequisites

- Node.js 20+
- npm, yarn, pnpm, or bun
- Supabase account
- OpenAI API key

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd notes
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file and add your Supabase and OpenAI credentials:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
    OPENAI_API_KEY=your_openai_api_key
    ```

4.  **Set up the database:**
    Run the Supabase migrations to set up the database schema.

5.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at [http://localhost:3000](http://localhost:3000).

## Development Conventions

- **Code Quality:** The project uses ESLint for code linting and style enforcement, and Prettier for code formatting.
- **Type Safety:** TypeScript is used for type safety and improved developer experience.
- **Testing:** The project has a comprehensive test suite using Vitest and React Testing Library. The tests are organized into unit, contract, and integration tests.
- **Git Hooks:** Husky is used for pre-commit checks to ensure code quality.
- **Slice-Based Development:** Every code change MUST deliver complete user value (SEE IT → DO IT → VERIFY IT). The `slice-orchestrator` agent is used for all feature implementation.

## Default Task Completion Process

The `slice-orchestrator` agent coordinates the delivery of complete vertical slices of functionality. This is the mandatory process for any task completion.

### Workflow

1.  **Intake:** The orchestrator starts by loading the feature specification and task breakdown.
2.  **Context & Documentation:** It then invokes the `context-assembler` to gather information about the existing codebase and the `document-curator` to fetch relevant library documentation.
3.  **Task Classification & Delegation:** The orchestrator classifies the task (full-stack, backend-only, etc.) and delegates the implementation to the appropriate agents (e.g., `backend-engineer`, `frontend-ui-builder`).
4.  **Automatic Quality Pipeline:** After the implementation is complete, the orchestrator triggers an automated quality pipeline, which includes:
    *   `code-reviewer`: Reviews the code for quality and compliance.
    *   `test-runner`: Executes the test suite.
    *   `debugger`: If tests fail, this agent is invoked to diagnose the root cause.
5.  **Completion:** The orchestrator marks a task as complete only when the code has been reviewed, all tests have passed, and the feature is a complete, user-verifiable slice of functionality.



## Vector Embedding Infrastructure

**Purpose**: Enable sub-500ms semantic search across all document tasks using vector embeddings.

**Tech Stack**: OpenAI text-embedding-3-small via Vercel AI SDK, Supabase pgvector extension, IVFFlat index

### Embedding Generation Flow

```
1. Document Processing (Automatic)
   ├─ POST /api/process completes task extraction
   ├─ embeddingService.generateBatchEmbeddings(tasks)
   ├─ vectorStorage.storeEmbeddings(results)
   └─ Update document.embeddings_status field

2. Semantic Search (API)
   ├─ POST /api/embeddings/search
   ├─ Generate query embedding
   ├─ Supabase RPC: search_similar_tasks(query_embedding, threshold, limit)
   └─ Returns: task_id, task_text, document_id, similarity (sorted)
```

## API Endpoints

- `POST /api/upload`: File upload with validation, deduplication, and automatic processing trigger.
- `POST /api/process`: Orchestrates the conversion → summarization → storage pipeline.
- `GET /api/status/[fileId]`: Real-time status polling for the frontend.
- `GET /api/documents`: Retrieve all documents with filtering and sorting.
- `POST /api/cleanup`: Manual trigger for cleaning up expired documents.
- `GET /api/export/[fileId]`: Export a document summary as JSON or Markdown.
GET /api/outcomes: Fetch the active outcome statement.
POST /api/outcomes: Create or update an outcome statement.
POST /api/reflections: Create a reflection.
GET /api/reflections: Get all reflections.
POST /api/embeddings/search: Perform semantic search across task embeddings.

## Frontend Architecture

**Main Components:**
- `app/page.tsx`: Upload UI with drag-and-drop, multi-file support, and status polling.
- `app/dashboard/page.tsx`: Dashboard with grid layout, filtering, and sorting.
- `app/components/SummaryPanel.tsx`: Displays the topics, decisions, actions, and LNO tasks.
- `app/components/OutcomeBuilder.tsx`: Modal form for creating/editing outcome statements.

## Design System

The project uses a depth-based color system with 4 layers, a two-layer shadow system, and a set of gradient utilities. It relies on ShadCN UI for components and follows a "never use borders" rule, relying instead on color contrast and shadows.

## Database Schema

**Tables:**
- `uploaded_files`: File metadata, status tracking, and queue position.
- `processed_documents`: AI outputs, Markdown content, and a 30-day auto-expiry.
- `processing_logs`: Metrics, errors, and retry attempts.
- `user_outcomes`: User-defined outcome statements.
- `task_embeddings`: Vector embeddings for semantic search.

**Storage:**
- `notes/`: Original uploaded files.
- `notes/processed/`: Generated Markdown and JSON files.

## Testing

- **Framework:** Vitest with React Testing Library.
- **Types:** Unit, integration, and component tests.
- **Status:** 27/44 automated tests passing (61% pass rate).
- **Blockers:** FormData serialization issues in the test environment.
- **Workaround:** Manual testing guides are used for upload and processing validation.

## Known Issues & Workarounds

- **`pdf-parse` Library Issue:** A postinstall patch is required to fix an issue with the `pdf-parse` library.
- **FormData Testing Limitation:** File properties become undefined in Vitest, requiring manual testing for file uploads.
- **Node.js Version:** The project requires Node.js 20+ for the native File API.