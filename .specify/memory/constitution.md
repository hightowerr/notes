<!--
SYNC IMPACT REPORT
===================
Version Change: 1.1.6 → 1.1.7
Rationale: PATCH version bump - Clarifications and consistency improvements only:
  1. Updated last amended date to 2025-11-05 (constitution review via /constitution command)
  2. Added clarification note about Phase 5 Cloud Sync implementation status in Development Workflow
  3. No semantic changes to principles, requirements, or governance
  4. All existing code remains compliant without modifications

Modified Principles:
  - None (clarification improvements only)

Added Sections:
  - None

Removed Sections:
  - None

Templates Requiring Updates:
  ✅ .specify/templates/plan-template.md - Version references will be updated in next /plan execution
  ✅ .specify/templates/tasks-template.md - No version references found
  ✅ .specify/templates/spec-template.md - No version references found
  ✅ .specify/templates/agent-file-template.md - Template placeholders only
  ✅ CLAUDE.md - No changes needed (documents principles, not version)
  ✅ README.md - No changes needed (no constitution version references)
  ✅ .claude/SYSTEM_RULES.md - No changes needed (implementation protocol, not version-dependent)

Follow-up TODOs:
  - Next MINOR version: Consider adding principle for AI safety/security patterns
  - Next constitution review: Validate Test-First Development exception status (automated testing resolution)
  - Monitor Phase 5 Cloud Sync adoption and refine guidance based on operational learnings
-->

# AI Note Synthesiser Constitution

## Core Principles

### I. Autonomous by Default
Every feature MUST operate without manual user intervention beyond initial
configuration. The system follows the Sense → Reason → Act pattern: detect inputs
automatically, process intelligently, and execute actions without prompts. No
"click to summarize" buttons or manual triggers are permitted unless the feature
explicitly requires user confirmation for destructive operations.

**Rationale**: The project's core value proposition is removing friction from
knowledge work. Any feature requiring manual steps defeats this purpose and
violates user expectations.

### II. Deterministic Outputs
All AI-generated outputs MUST conform to documented, versioned JSON schemas.
Schemas define required fields, types, and validation rules. Invalid outputs
trigger automatic retry with adjusted prompts (maximum once). Schema changes
follow semantic versioning and require migration scripts for existing data.

**Rationale**: Downstream systems and user workflows depend on consistent data
structures. Non-deterministic outputs create fragile integrations and erode trust.

### III. Modular Architecture
Components MUST be decoupled and independently testable. Each module (conversion,
summarization, storage) operates through well-defined interfaces. Modules can be
replaced, enhanced, or removed without cascading changes. Future features (RAG,
memory retrieval) integrate via plugin patterns, not core rewrites.

**Rationale**: Early-stage projects evolve rapidly. Tight coupling creates
technical debt that becomes insurmountable before product-market fit.

### IV. Test-First Development (NON-NEGOTIABLE)
TDD is mandatory for all features:
1. Write failing tests that validate requirements
2. Obtain user/stakeholder approval of test scenarios
3. Implement minimum code to pass tests
4. Refactor while keeping tests green

Integration tests cover: file detection triggers, conversion pipeline, AI
summarization contracts, storage operations, error handling flows.

**Current Environment Exception**: Where automated testing is blocked by technical
limitations (e.g., FormData serialization in test environment, library
compatibility issues), comprehensive manual testing guides MUST be created and
executed. Manual test scenarios must cover the same acceptance criteria as
automated tests would. This exception does NOT waive the TDD requirement—it
temporarily substitutes execution method while maintaining validation rigor.

**Resolution Requirement**: Teams must actively work to resolve test environment
blockers. Manual testing is a temporary workaround, not a permanent solution.
See `T002_MANUAL_TEST.md` for current manual testing approach.

**Rationale**: Autonomous systems have no human in the loop to catch errors.
Comprehensive validation—whether automated or manual—is the only safety net.
Test environment limitations cannot justify shipping untested code.

### V. Observable by Design
Every system operation MUST emit structured logs with: timestamp, operation type,
input hash, duration, confidence scores, error details. Errors log to both console
(development) and Supabase (production). Performance metrics track against targets:
<8s processing time, ≥95% detection reliability, ≥85% summarization accuracy.

**Rationale**: Autonomous systems fail silently without observability. Logs enable
debugging, performance optimization, and user trust through transparency.

### VI. Vertical Slice Architecture
Every code change MUST deliver complete, user-testable value following the Three Laws:

1. **SEE IT** → Visible UI change or feedback
2. **DO IT** → Interactive capability user can trigger
3. **VERIFY IT** → Observable outcome confirming it worked

**Implementation Requirements**:
- Each task includes: UI component + backend endpoint + data layer + user feedback
- User story format: "As a [user], I can [action] to [achieve outcome]"
- Demo-ready: Must be demonstrable to non-technical stakeholders
- Pre-flight validation: Confirm UI entry point, backend process, and test scenario

**FORBIDDEN**:
- Backend-only tasks (e.g., "Create User model")
- Frontend-only tasks (e.g., "Add login form")
- Infrastructure tasks without user value (e.g., "Setup CI/CD")
- Tasks that can't be tested by end users

**Enforcement**: The `slice-orchestrator` agent is the default for ALL feature
implementation. Tasks violating slice principles MUST be restructured before
development begins. See `.claude/SYSTEM_RULES.md` for detailed protocol.

**Rationale**: Incremental, user-visible progress prevents over-engineering,
enables rapid feedback, and ensures every commit adds demonstrable value. Partial
slices (backend without UI) create integration risk and delay validation.

## Quality Standards

### Error Handling Requirements
- Invalid file formats: Log error, skip processing, notify user of unsupported type
- Unreadable content: Attempt OCR fallback (Tesseract), then skip with clear error
- Invalid JSON from LLM: Retry once with adjusted prompt parameters, mark "review required"
- Low-confidence summaries: Flag in logs with confidence score, store raw output
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
3. **Task Generation**: Create vertical slice tasks (UI + Backend + Data + Feedback per task)
4. **Test Creation**: Write failing integration and contract tests before any implementation (or manual test guide if automated testing blocked)
5. **Implementation**: Build minimum code to pass tests, following modular architecture
6. **Validation**: Execute quickstart.md scenarios, verify performance targets, review logs

**Tool Usage Note**: This project uses `pnpm` as the package manager (not `npm`).
All dependency installation and script execution commands should use `pnpm`.
See `CLAUDE.md` for complete development command reference.

**Phase 5 Status**: Cloud Sync (Google Drive integration + text input) is
implemented and operational. See `docs/shape-up-pitches/phase-5-cloud-sync.md`
for architecture and `lib/services/googleDriveService.ts` for implementation.

### Code Review Gates
All changes must verify:
- [ ] Tests written before implementation (TDD compliance - Principle IV)
  - Automated tests preferred; manual test guide acceptable if environment blocked
- [ ] No manual user intervention required (Autonomous compliance - Principle I)
- [ ] JSON schemas documented and validated (Deterministic compliance - Principle II)
- [ ] Components independently testable (Modular compliance - Principle III)
- [ ] Structured logs emitted (Observable compliance - Principle V)
- [ ] Vertical slice delivered (SEE + DO + VERIFY) (Slice compliance - Principle VI)
- [ ] Performance targets met (Quality standards compliance)

## Governance

### Amendment Procedure
Constitution changes require:
1. Proposal documenting: rationale, affected principles, migration impact
2. Version bump following semantic versioning (see Versioning Policy below)
3. Update of dependent templates (plan-template.md, spec-template.md, tasks-template.md)
4. Sync Impact Report prepended to this file as HTML comment
5. Commit message format: `docs: amend constitution to vX.Y.Z (summary of changes)`

When templates reference constitution version numbers, they should be updated to
match the current version. However, version drift in templates is non-critical
and can be addressed in batch updates.

### Versioning Policy
- **MAJOR (X.0.0)**: Backward-incompatible changes requiring code modifications
  - Examples: Principle removal, principle redefinition that invalidates existing code,
    new mandatory requirements that existing features don't meet
- **MINOR (x.Y.0)**: Additive changes that don't invalidate existing implementations
  - Examples: New principle added, materially expanded guidance for existing principle,
    new quality standard or development workflow step
- **PATCH (x.y.Z)**: Non-semantic refinements with zero behavioral impact
  - Examples: Clarifications, wording improvements, typo fixes, formatting changes,
    template consistency updates, rationale enhancements

**Version Determination Guidelines**:
- If existing code would need changes to comply: MAJOR
- If new code must follow new guidance but existing code is grandfathered: MINOR
- If only documentation readability improves: PATCH
- When uncertain, propose reasoning before finalizing version bump

### Compliance Review
The /plan command Constitution Check section enforces these principles before design
work begins and after Phase 1 completion. Violations must be documented in Complexity
Tracking with justification or the design must be simplified to comply.

The /tasks command validates slice compliance before generating tasks.md. Any
task failing the Three Laws (SEE, DO, VERIFY) is rejected and restructured.

**Runtime Guidance**: See `CLAUDE.md` and `.claude/SYSTEM_RULES.md` in repository
root for agent-specific development instructions and slice enforcement protocol.

---
**Version**: 1.1.7 | **Ratified**: 2025-10-05 | **Last Amended**: 2025-11-05
