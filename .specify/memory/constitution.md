<!--
SYNC IMPACT REPORT
===================
Version Change: None → 1.0.0
Rationale: Initial constitution creation for AI Note Synthesiser project

Modified Principles: N/A (initial creation)
Added Sections:
  - Core Principles (5 principles aligned with autonomous agent architecture)
  - Quality Standards (observability and error handling)
  - Development Workflow (TDD enforcement)
  - Governance (amendment process and versioning)

Removed Sections: N/A

Templates Requiring Updates:
  ✅ .specify/templates/plan-template.md - Constitution Check section now references autonomous, deterministic, modular, test-first, observable principles
  ✅ .specify/templates/spec-template.md - Aligned with functional requirements and testability focus
  ✅ .specify/templates/tasks-template.md - TDD ordering matches Test-First principle

Follow-up TODOs: None
-->

# AI Note Synthesiser Constitution

## Core Principles

### I. Autonomous by Default
Every feature MUST operate without manual user intervention beyond initial configuration. The system follows the Sense → Reason → Act pattern: detect inputs automatically, process intelligently, and execute actions without prompts. No "click to summarize" buttons or manual triggers are permitted unless the feature explicitly requires user confirmation for destructive operations.

**Rationale**: The project's core value proposition is removing friction from knowledge work. Any feature requiring manual steps defeats this purpose and violates user expectations.

### II. Deterministic Outputs
All AI-generated outputs MUST conform to documented, versioned JSON schemas. Schemas define required fields, types, and validation rules. Invalid outputs trigger automatic retry with adjusted prompts (maximum once). Schema changes follow semantic versioning and require migration scripts for existing data.

**Rationale**: Downstream systems and user workflows depend on consistent data structures. Non-deterministic outputs create fragile integrations and erode trust.

### III. Modular Architecture
Components MUST be decoupled and independently testable. Each module (conversion, summarization, storage) operates through well-defined interfaces. Modules can be replaced, enhanced, or removed without cascading changes. Future features (RAG, memory retrieval) integrate via plugin patterns, not core rewrites.

**Rationale**: Early-stage projects evolve rapidly. Tight coupling creates technical debt that becomes insurmountable before product-market fit.

### IV. Test-First Development (NON-NEGOTIABLE)
TDD is mandatory for all features:
1. Write failing tests that validate requirements
2. Obtain user/stakeholder approval of test scenarios
3. Implement minimum code to pass tests
4. Refactor while keeping tests green

Integration tests cover: file detection triggers, conversion pipeline, AI summarization contracts, storage operations, error handling flows.

**Rationale**: Autonomous systems have no human in the loop to catch errors. Comprehensive tests are the only safety net.

### V. Observable by Design
Every system operation MUST emit structured logs with: timestamp, operation type, input hash, duration, confidence scores, error details. Errors log to both console (development) and Supabase (production). Performance metrics track against targets: <8s processing time, ≥95% detection reliability, ≥85% summarization accuracy.

**Rationale**: Autonomous systems fail silently without observability. Logs enable debugging, performance optimization, and user trust through transparency.

## Quality Standards

### Error Handling Requirements
- Invalid file formats: Log error, skip processing, notify user of unsupported type
- Unreadable content: Attempt OCR fallback (Tesseract), then skip with clear error message
- Invalid JSON from LLM: Retry once with adjusted prompt parameters, then mark as "review required"
- Low-confidence summaries: Flag in logs with confidence score, store raw output for manual review
- Duplicate filenames: Append content hash suffix, preserve both versions

### Performance Constraints
- Average processing time: <8 seconds per file
- File detection reliability: ≥95% success rate
- Summarization accuracy: ≥85% (measured via manual review sampling)
- Output completeness: 100% (all required schema fields populated)

## Development Workflow

### Implementation Process
1. **Specification Phase**: Define requirements in spec.md with testable acceptance criteria
2. **Planning Phase**: Document architecture in plan.md, research unknowns, design data models and contracts
3. **Test Creation**: Write failing integration and contract tests before any implementation
4. **Implementation**: Build minimum code to pass tests, following modular architecture
5. **Validation**: Execute quickstart.md scenarios, verify performance targets, review logs

### Code Review Gates
All changes must verify:
- [ ] Tests written before implementation (TDD compliance)
- [ ] No manual user intervention required (autonomous compliance)
- [ ] JSON schemas documented and validated (deterministic compliance)
- [ ] Components independently testable (modular compliance)
- [ ] Structured logs emitted (observable compliance)
- [ ] Performance targets met (quality standards compliance)

## Governance

### Amendment Procedure
Constitution changes require:
1. Proposal documenting: rationale, affected principles, migration impact
2. Version bump following semantic versioning (see below)
3. Update of dependent templates (plan-template.md, spec-template.md, tasks-template.md)
4. Sync Impact Report prepended to this file
5. Commit message format: `docs: amend constitution to vX.Y.Z (summary of changes)`

### Versioning Policy
- **MAJOR**: Backward-incompatible changes (principle removal/redefinition requiring code changes)
- **MINOR**: New principles or materially expanded guidance (additive changes)
- **PATCH**: Clarifications, wording improvements, typo fixes (no semantic changes)

### Compliance Review
The /plan command Constitution Check section enforces these principles before design work begins and after Phase 1 completion. Violations must be documented in Complexity Tracking with justification or the design must be simplified to comply.

**Runtime Guidance**: See `CLAUDE.md` in repository root for agent-specific development instructions.

---
**Version**: 1.0.0 | **Ratified**: 2025-10-05 | **Last Amended**: 2025-10-05
