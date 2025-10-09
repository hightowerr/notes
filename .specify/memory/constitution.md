<!--
SYNC IMPACT REPORT
===================
Version Change: 1.1.0 → 1.1.1
Rationale: PATCH version bump - Clarified Principle IV (Test-First Development) to
acknowledge current test environment limitations without changing the principle itself.
Added exception clause for FormData/upload testing with manual testing workaround.
This is a non-semantic refinement that documents existing practice.

Modified Principles:
  - Principle IV: Test-First Development - Added exception clause for automated test
    blockers with manual testing requirement. Maintains TDD mandate while acknowledging
    technical constraints.

Added Sections:
  - None

Removed Sections:
  - None

Templates Requiring Updates:
  ✅ .specify/templates/plan-template.md - No changes needed (TDD still required)
  ✅ .specify/templates/tasks-template.md - No changes needed (already has test requirements)
  ✅ .specify/templates/spec-template.md - No changes needed
  ✅ CLAUDE.md - Already documents test limitations and manual testing approach
  ✅ T002_MANUAL_TEST.md - Already serves as comprehensive manual test guide

Follow-up TODOs:
  - Resolve FormData serialization in Vitest (use MSW or Next.js server for integration tests)
  - Fix Node.js 18 compatibility or enforce Node.js 20+ requirement in CI
  - Target: Restore full automated test coverage once environment issues resolved
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
2. Version bump following semantic versioning (see below)
3. Update of dependent templates (plan-template.md, spec-template.md, tasks-template.md)
4. Sync Impact Report prepended to this file
5. Commit message format: `docs: amend constitution to vX.Y.Z (summary of changes)`

### Versioning Policy
- **MAJOR**: Backward-incompatible changes (principle removal/redefinition requiring code changes)
- **MINOR**: New principles or materially expanded guidance (additive changes)
- **PATCH**: Clarifications, wording improvements, typo fixes (non-semantic refinements)

### Compliance Review
The /plan command Constitution Check section enforces these principles before design
work begins and after Phase 1 completion. Violations must be documented in Complexity
Tracking with justification or the design must be simplified to comply.

The /tasks command validates slice compliance before generating tasks.md. Any
task failing the Three Laws (SEE, DO, VERIFY) is rejected and restructured.

**Runtime Guidance**: See `CLAUDE.md` and `.claude/SYSTEM_RULES.md` in repository
root for agent-specific development instructions and slice enforcement protocol

---
**Version**: 1.1.1 | **Ratified**: 2025-10-05 | **Last Amended**: 2025-10-08
