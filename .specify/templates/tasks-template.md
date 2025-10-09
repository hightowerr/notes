# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md, research.md, data-model.md, contracts/

## Execution Flow (Slice-Based)
```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, user stories, acceptance criteria

2. Load spec.md for user journeys:
   → Extract: primary user actions, expected outcomes
   → Identify: UI entry points, data flows, feedback mechanisms

3. Load optional design documents:
   → contracts/: API endpoints for each user action
   → data-model.md: Data structures needed for journeys
   → research.md: Technical decisions affecting slices

4. Generate VERTICAL SLICE tasks:
   → Each user story = ONE complete slice task
   → Slice includes: UI component + API endpoint + data layer + user feedback
   → Validate: Can user SEE, DO, and VERIFY this?
   → Reject: Backend-only, frontend-only, or infrastructure-only tasks

5. Apply slice ordering rules:
   → P0 user journeys first (must-have features)
   → Setup tasks ONLY if blocking all P0 slices
   → P1 journeys after P0 validated
   → Polish after core journeys work

6. Mark parallel execution:
   → Different user journeys = [P] (parallel)
   → Shared critical files = sequential

7. Validate EVERY task:
   → ✅ Includes user story?
   → ✅ Specifies UI entry point?
   → ✅ Includes backend work?
   → ✅ Describes visible outcome?
   → ✅ Has test scenario?
   → ❌ Reject if any missing

8. Return: SUCCESS (slice tasks ready for execution)
```

## Format: `[ID] [TYPE] [P?] User Story & Implementation Scope`
- **[SLICE]**: Complete vertical slice (UI → Backend → Data → Feedback)
- **[SETUP]**: Foundational work blocking ALL slices (avoid if possible)
- **[POLISH]**: Enhancement to existing working slice
- **[P]**: Can run in parallel with other [P] tasks

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `app/` (Next.js), `lib/`, `components/`
- **API**: `app/api/`, `lib/services/`
- Paths shown below assume Next.js - adjust based on plan.md structure

---

## Phase 1: P0 User Journeys (Must-Have Features)

### T001 [SLICE] User uploads note file and sees upload confirmation
**User Story**: As a user, I can drag-and-drop a PDF/DOCX/TXT file to upload it and receive immediate confirmation

**Implementation Scope**:
- **UI**: File upload component with drag-drop zone (`app/components/FileUpload.tsx`)
  - Visual feedback during upload (progress indicator)
  - Success state with file name and size
- **Backend**: POST `/api/upload` endpoint (`app/api/upload/route.ts`)
  - Accept multipart/form-data
  - Save to Supabase storage bucket `notes`
  - Return file metadata (name, size, upload timestamp)
- **Data**: Supabase storage persistence
- **Feedback**: Success message displays "uploaded.pdf (2.3MB) uploaded successfully"

**Test Scenario**:
1. Navigate to home page
2. Drag `test-note.pdf` to upload zone
3. Observe progress indicator
4. Verify success message shows file name and size
5. Check Supabase storage for uploaded file

**Files Modified**:
- `app/components/FileUpload.tsx` (create)
- `app/api/upload/route.ts` (create)
- `app/page.tsx` (integrate component)

---

### T002 [P] [SLICE] User views uploaded files in dashboard
**User Story**: As a user, I can navigate to a dashboard and see a list of all my uploaded files with preview information

**Implementation Scope**:
- **UI**: Dashboard page with file grid (`app/dashboard/page.tsx`)
  - File cards showing: name, upload date, file type icon
  - Responsive grid layout (shadcn Card components)
- **Backend**: GET `/api/files` endpoint (`app/api/files/route.ts`)
  - Retrieve file list from Supabase storage
  - Return metadata array (name, size, upload_date, type)
- **Data**: Query Supabase storage bucket metadata
- **Feedback**: Files display in grid, empty state if no files

**Test Scenario**:
1. Upload 2-3 files using T001
2. Navigate to `/dashboard`
3. Verify all uploaded files appear in grid
4. Check file names, dates, and type icons display correctly
5. Verify empty state shows if no files exist

**Files Modified**:
- `app/dashboard/page.tsx` (create)
- `app/api/files/route.ts` (create)
- `components/ui/card.tsx` (use existing)

---

### T003 [SLICE] User sees note summary after file processing completes
**User Story**: As a user, after uploading a note, I can see an AI-generated summary with topics, decisions, actions, and LNO tasks

**Implementation Scope**:
- **UI**: Summary panel component (`app/components/SummaryPanel.tsx`)
  - Displays: topics list, decisions list, actions list, LNO task columns
  - Loading state during processing
  - Error state if processing fails
- **Backend**:
  - File processing service (`lib/services/noteProcessor.ts`)
    * Convert PDF/DOCX/TXT → Markdown (using unified parser)
    * Call AI summarization (Vercel AI SDK)
    * Extract structured JSON (topics, decisions, actions, lno_tasks)
  - POST `/api/process` endpoint (`app/api/process/route.ts`)
    * Trigger processing for uploaded file
    * Store JSON output in Supabase database
    * Return summary data
- **Data**:
  - Supabase table `note_summaries` (file_id, summary_json, created_at)
  - Storage: original file + generated markdown
- **Feedback**: Summary appears below upload confirmation with all extracted data

**Test Scenario**:
1. Upload `sample-meeting-notes.pdf`
2. Observe "Processing..." state
3. Wait for summary to appear (≤8 seconds)
4. Verify topics, decisions, actions populate
5. Check LNO tasks categorized correctly (Leverage/Neutral/Overhead)
6. Confirm data persisted in Supabase table

**Files Modified**:
- `app/components/SummaryPanel.tsx` (create)
- `lib/services/noteProcessor.ts` (create)
- `app/api/process/route.ts` (create)
- `app/api/upload/route.ts` (modify to trigger processing)
- Database migration for `note_summaries` table

---

## Phase 2: Setup (If Required for P0)

### T004 [SETUP] Configure AI SDK and document conversion dependencies
**Why Needed**: T003 requires AI SDK and document parsing libraries

**Implementation Scope**:
- Install dependencies: `ai`, `pdf-parse`, `mammoth` (DOCX), unified markdown tools
- Configure environment variables for AI provider
- Create shared AI client utility (`lib/ai/client.ts`)
- Add error handling and retry logic wrapper

**Validation**:
- Dependencies installed successfully
- AI client initializes without errors
- Ready for use in T003

**Files Modified**:
- `package.json`
- `.env.local`
- `lib/ai/client.ts` (create)

---

## Phase 3: P1 User Journeys (Nice-to-Have)

### T005 [P] [SLICE] User can delete uploaded file from dashboard
**User Story**: As a user, I can delete a file from my dashboard and see it removed immediately

**Implementation Scope**:
- **UI**: Delete button on file cards (`app/dashboard/page.tsx`)
  - Confirmation dialog before deletion
  - Optimistic UI update (remove card immediately)
- **Backend**: DELETE `/api/files/:id` endpoint (`app/api/files/[id]/route.ts`)
  - Remove file from Supabase storage
  - Delete associated summary data
- **Feedback**: File card fades out, success toast appears

**Test Scenario**:
1. Navigate to dashboard with uploaded files
2. Click delete icon on a file card
3. Confirm deletion in dialog
4. Verify file card disappears
5. Check file removed from Supabase storage

---

### T006 [P] [SLICE] User can download original uploaded file
**User Story**: As a user, I can download the original file I uploaded from the dashboard

**Implementation Scope**:
- **UI**: Download button on file cards
  - Shows download progress for large files
- **Backend**: GET `/api/files/:id/download` endpoint
  - Retrieve file from Supabase storage
  - Stream file to client with proper headers
- **Feedback**: Browser download starts, file saves locally

**Test Scenario**:
1. Navigate to dashboard
2. Click download icon on file card
3. Verify browser download initiates
4. Check downloaded file matches original

---

## Phase 4: Polish

### T007 [P] [POLISH] Add upload progress indicator with percentage
**Enhancement to**: T001

**Implementation Scope**:
- Add upload progress tracking to `FileUpload.tsx`
- Display percentage and estimated time remaining
- Handle pause/resume for large files

**Test Scenario**:
1. Upload 50MB file
2. Observe progress bar with percentage
3. Verify accurate time estimates

---

### T008 [P] [POLISH] Implement summary export (JSON/Markdown download)
**Enhancement to**: T003

**Implementation Scope**:
- Add export buttons to `SummaryPanel.tsx`
- Generate downloadable JSON and Markdown files
- Format Markdown with proper headings and lists

**Test Scenario**:
1. Process a file to generate summary
2. Click "Export JSON" → verify JSON downloads
3. Click "Export Markdown" → verify formatted MD downloads

---

## Dependencies

```
T001 → (enables) → T002, T003
T004 → (required for) → T003
T003 → (enables) → T008
T002 → (enables) → T005, T006
```

**Parallel Execution**:
- T001 must complete first (foundational)
- T002 + T004 can run in parallel after T001
- T005 + T006 can run in parallel after T002
- T007 + T008 can run in parallel after T003

---

## Parallel Execution Example

```bash
# After T001 completes, launch T002 and T004 together:
Task: "Implement T002 [SLICE] User views uploaded files in dashboard"
Task: "Implement T004 [SETUP] Configure AI SDK and document conversion dependencies"

# After T002 and T004 complete, can launch:
Task: "Implement T003 [SLICE] User sees note summary after processing"
Task: "Implement T005 [SLICE] User can delete uploaded file"
Task: "Implement T006 [SLICE] User can download original file"
```

---

## Notes

- **[SLICE]** tasks are independently deployable and user-testable
- **[P]** tasks operate on different files/features and can run in parallel
- Every slice MUST enable user to SEE, DO, and VERIFY something
- Avoid creating tasks without complete user journey
- Setup tasks should be minimal - prefer integrating setup into slices
- Each task should be demoable to a non-technical person

## Validation Checklist
*MUST verify before creating tasks.md*

- [ ] Every [SLICE] task has a user story
- [ ] Every [SLICE] task includes UI + Backend + Data + Feedback
- [ ] Every [SLICE] task has a test scenario
- [ ] No backend-only or frontend-only tasks exist
- [ ] Setup tasks are minimal and justify their necessity
- [ ] Tasks ordered by user value, not technical layers
- [ ] Parallel tasks truly operate on independent features/files
- [ ] Each task specifies exact file paths to modify
