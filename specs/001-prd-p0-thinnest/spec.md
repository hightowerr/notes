# Feature Specification: P0 – Thinnest Agentic Slice (Proof of Agency)

**Feature Branch**: `001-prd-p0-thinnest`
**Created**: 2025-10-06
**Status**: Draft
**Input**: User description: "# PRD: ⚙️ P0 – Thinnest Agentic Slice (Proof of Agency) - Build autonomous sense-reason-act loop for file detection, conversion, summarization, and structured output"

## Execution Flow (main)
```
1. Parse user description from Input
   → Feature: Autonomous note processing system
2. Extract key concepts from description
   → Actors: Knowledge workers, system agent
   → Actions: Detect files, convert to Markdown, summarize, extract structure
   → Data: Files (PDF/DOCX/TXT), summaries, JSON output
   → Constraints: <8s processing, ≥95% reliability, 100% autonomous
3. For each unclear aspect:
   → No critical ambiguities - PRD is comprehensive
4. Fill User Scenarios & Testing section
   → Primary: Upload file → automatic processing → receive summary
5. Generate Functional Requirements
   → 15 testable requirements identified
6. Identify Key Entities (if data involved)
   → UploadedFile, ProcessedDocument, Summary, StructuredOutput
7. Run Review Checklist
   → All sections complete, no implementation details in spec
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## Clarifications

### Session 2025-10-06
- Q: What is the maximum file size the system should accept for processing? → A: 10 MB (suitable for typical meeting transcripts)
- Q: What confidence score threshold should trigger a "review required" flag for summaries? → A: 80% (balanced - moderate review load)
- Q: How should the system handle multiple files uploaded simultaneously (concurrent uploads)? → A: Process in parallel (up to 3 files concurrently)
- Q: What should happen to processed outputs (JSON + Markdown files) after successful processing? → A: Delete after 30 days (rolling retention)
- Q: How should the system notify users when processing completes successfully? → A: All of the above (console + toast + status)

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As a knowledge worker who attends frequent meetings, I want to upload my meeting notes (PDF, DOCX, or TXT) and automatically receive structured summaries with topics, decisions, actions, and prioritized tasks (Leverage/Neutral/Overhead), so I can quickly identify what matters without manually processing lengthy transcripts.

### Acceptance Scenarios
1. **Given** a PDF meeting transcript is uploaded, **When** the system detects the file, **Then** it automatically converts to Markdown, extracts topics/decisions/actions, and displays success via console log, toast notification, and status badge within 8 seconds
2. **Given** a DOCX file with complex formatting is uploaded, **When** conversion to Markdown occurs, **Then** the system preserves key content structure and produces valid JSON output with all required fields
3. **Given** the AI model returns malformed JSON, **When** validation fails, **Then** the system retries once with adjusted parameters and logs the error for review
4. **Given** an unreadable PDF is uploaded, **When** standard conversion fails, **Then** the system attempts OCR processing and marks the result as "review required" if confidence is low
5. **Given** a duplicate filename is detected, **When** saving the processed output, **Then** the system appends a unique hash suffix to prevent overwriting

### Edge Cases
- What happens when an unsupported file format (e.g., .pptx, .xls) is uploaded? → System logs error, skips processing, notifies user of unsupported type
- What happens when a file exceeds 10 MB? → System rejects upload immediately, displays error message with size limit
- What happens when 5 files are uploaded simultaneously? → System processes 3 concurrently, queues remaining 2 for sequential processing
- How does the system handle a 50-page PDF document? → Processing continues but may exceed 8s target; system logs duration metrics for monitoring
- What if the LLM is unavailable or times out? → System marks document as "pending retry" and queues for next processing attempt
- How are incomplete summaries (missing topics or actions) handled? → System flags as "review required" and stores partial output with confidence score below 80%

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST automatically detect when a new file (PDF, DOCX, TXT) is uploaded without requiring manual user action
- **FR-016**: System MUST reject files exceeding 10 MB with clear error message indicating size limit
- **FR-017**: System MUST support concurrent processing of up to 3 files simultaneously, queuing additional uploads
- **FR-002**: System MUST convert uploaded files to Markdown format, preserving document structure and content
- **FR-003**: System MUST extract structured data from converted Markdown including topics, decisions, actions, and L/N/O tasks
- **FR-004**: System MUST produce both a Markdown summary and a JSON output with deterministic schema (topics, decisions, actions, lno_tasks)
- **FR-005**: System MUST store processed outputs (JSON + Markdown) locally in persistent storage
- **FR-018**: System MUST automatically delete processed outputs (JSON + Markdown) after 30 days to maintain storage hygiene
- **FR-006**: System MUST display success feedback via console log, toast notification, and file list status badge when processing completes
- **FR-007**: System MUST log all processing metrics including file hash, duration, and confidence scores
- **FR-008**: System MUST handle invalid file formats by logging errors and skipping processing without crashes
- **FR-009**: System MUST attempt OCR fallback for unreadable PDFs before marking as failed
- **FR-010**: System MUST retry once with adjusted parameters when LLM returns invalid JSON
- **FR-011**: System MUST mark summaries with confidence scores below 80% as "review required" in logs
- **FR-012**: System MUST handle duplicate filenames by appending content hash suffix to prevent overwrites
- **FR-013**: System MUST complete file processing within 8 seconds on average for standard documents
- **FR-014**: System MUST achieve ≥95% reliability in file detection (no missed uploads)
- **FR-015**: System MUST produce 100% output completeness (all required schema fields populated: topics, decisions, actions, lno_tasks)

### Key Entities *(include if feature involves data)*
- **UploadedFile**: Represents original user file with metadata (name, size, format, upload timestamp, content hash)
- **ConvertedDocument**: Markdown representation of uploaded file with preserved structure
- **ProcessedSummary**: AI-generated summary containing extracted topics, decisions, and actions
- **StructuredOutput**: JSON object conforming to schema with topics (array), decisions (array), actions (array), lno_tasks (object with leverage/neutral/overhead arrays)
- **ProcessingMetrics**: Log entry tracking file hash, processing duration, confidence score, error details, retry attempts

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked (none found)
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---
