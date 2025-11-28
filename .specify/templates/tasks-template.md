---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: The examples below include test tasks. Tests are OPTIONAL - only include them if explicitly requested in the feature specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [SLICE/POLISH] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[SLICE]**: Complete vertical slice (UI + Backend + Data + Feedback)
- **[POLISH]**: Enhancement to existing working slice
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

**FORBIDDEN TAGS**:
- ❌ **[SETUP]**: Infrastructure-only tasks violate vertical slice principle
- ❌ Database migrations as standalone tasks - must be implicit prerequisites

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- **Mobile**: `api/src/`, `ios/src/` or `android/src/`
- Paths shown below assume single project - adjust based on plan.md structure

<!-- 
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.
  
  The /speckit.tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/
  
  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment
  
  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Prerequisites** (implicit, not standalone tasks):
- Database migrations required (if applicable): `migrations/###_feature_name.sql`
- Environment variables (if applicable): Add to `.env.local`
- Dependencies (if applicable): Run `[package manager] install` if new deps needed
- **Validation**: Tests verify all prerequisites in setup phase

**Note**: Infrastructure is validated BY vertical slices, not delivered AS slices

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 (OPTIONAL - only if tests requested) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T001 [P] [SLICE] [US1] Contract test for [endpoint] in tests/contract/test_[name].py
  - **SEE**: Test suite passes with green output
  - **DO**: Run `[test command] tests/contract/test_[name].py`
  - **VERIFY**: Test fails initially (RED), passes after implementation (GREEN)
  - **Prerequisites** (validated in test setup):
    - Migration ###: [table name] created
    - Environment: [required vars] set
  - **Test cases**: [List specific test scenarios]

- [ ] T002 [P] [SLICE] [US1] Integration test for [user journey] in tests/integration/test_[name].py
  - **SEE**: Test suite validates complete user flow
  - **DO**: Run `[test command] tests/integration/test_[name].py`
  - **VERIFY**: End-to-end journey completes successfully
  - **Prerequisites** (validated in test setup):
    - All migrations applied
    - Test fixtures loaded
  - **Test scenarios**: [List user journey steps]

### Implementation for User Story 1

- [ ] T003 [P] [SLICE] [US1] Create [Entity1] model in src/models/[entity1].py
  - **SEE**: Entity file created with TypeScript types
  - **DO**: Implement [Entity1] with properties, validations
  - **VERIFY**: Unit tests pass for entity operations
  - **Dependencies**: Requires T001-T002 tests in RED state

- [ ] T004 [P] [SLICE] [US1] Create [Entity2] model in src/models/[entity2].py
  - **SEE**: Entity file created with TypeScript types
  - **DO**: Implement [Entity2] with properties, validations
  - **VERIFY**: Unit tests pass for entity operations
  - **Dependencies**: Requires T001-T002 tests in RED state

- [ ] T005 [SLICE] [US1] Implement [Service] in src/services/[service].py
  - **SEE**: Service exports functions for business logic
  - **DO**: Implement service methods using entities
  - **VERIFY**: Service tests pass, contract tests pass
  - **Dependencies**: Requires T003, T004 (entities)

- [ ] T006 [SLICE] [US1] Implement [UI Component + API Endpoint]
  - **SEE**: [Button/Form/Page] visible in UI at [/path]
  - **DO**: User clicks [action] → API endpoint processes → Database updated
  - **VERIFY**: User sees [outcome], integration tests pass
  - **Complete vertical slice**: UI → Backend → Data → Feedback
  - **Dependencies**: Requires T005 (service layer)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 2: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 (OPTIONAL - only if tests requested) ⚠️

- [ ] T007 [P] [SLICE] [US2] Contract test for [endpoint] in tests/contract/test_[name].py
  - **SEE**: Test suite validates API contract
  - **DO**: Run tests for US2 endpoints
  - **VERIFY**: Tests fail initially (RED)
  - **Prerequisites**: Migration if required

- [ ] T008 [P] [SLICE] [US2] Integration test for [user journey] in tests/integration/test_[name].py
  - **SEE**: End-to-end test validates user journey
  - **DO**: Run complete flow test
  - **VERIFY**: Journey test fails initially (RED)

### Implementation for User Story 2

- [ ] T009 [SLICE] [US2] Implement [Entity/Service/UI] for User Story 2
  - **SEE**: [UI element] visible at [location]
  - **DO**: User performs [action]
  - **VERIFY**: [Outcome] displayed, tests pass (GREEN)
  - **Complete vertical slice**: UI → Backend → Data → Feedback
  - **Dependencies**: Independent of US1 (can run in parallel)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 3: User Story 3 - [Title] (Priority: P3)

[Follow same pattern as US1/US2 - Tests with prerequisites, then vertical slice implementation]

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Enhancements to existing working features

- [ ] TXXX [POLISH] Performance optimization across all stories
  - **SEE**: Faster response times, metrics dashboard
  - **DO**: Implement caching, query optimization
  - **VERIFY**: Latency reduced by X%, benchmarks pass

- [ ] TXXX [POLISH] Accessibility improvements
  - **SEE**: Screen reader support, keyboard navigation
  - **DO**: Add ARIA labels, focus management
  - **VERIFY**: A11y audit passes, manual testing successful

- [ ] TXXX [POLISH] Documentation updates
  - **SEE**: Updated guides in docs/
  - **DO**: Document new features, update quickstart
  - **VERIFY**: QA team validates instructions work

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 1)**: No dependencies - start immediately 🎯 MVP
  - Prerequisites (migrations, env) handled implicitly within tasks
  - Tests validate all prerequisites in setup phase
- **User Story 2 (Phase 2)**: Independent of US1 - can run in parallel
  - Or sequential after US1 if team capacity limited
- **User Story 3 (Phase 3)**: Independent of US1/US2 - can run in parallel
- **Polish (Final Phase)**: Depends on core user stories being operational

### Task-Level Dependencies

- **Tests FIRST**: All test tasks (T001-T002) MUST fail (RED) before implementation
- **Vertical Slices**: Each [SLICE] task delivers complete user value
- **Prerequisites**: Database migrations, env vars validated by tests (not standalone tasks)
- **Parallel [P]**: Tasks marked [P] can run concurrently (different files)

### Execution Patterns

**Sequential (TDD):**
```
T001 (Test) → RED → T003 (Entity) → T005 (Service) → T006 (UI+API) → GREEN
```

**Parallel (Team):**
```
Developer A: User Story 1 (T001-T006)
Developer B: User Story 2 (T007-T009) ← runs simultaneously
Developer C: User Story 3 (T010-T012) ← runs simultaneously
```

### Parallel Opportunities

- All test tasks marked [P] within same user story
- All entity/model tasks marked [P] within same story
- Different user stories (US1, US2, US3) can be developed in parallel
- Infrastructure (migrations) applied once, shared by all stories

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. **Apply prerequisites** (migrations, env vars) manually or via setup script
2. **Write tests** (T001-T002) and confirm RED state
3. **Implement** entities, services, UI+API (T003-T006)
4. **Validate GREEN**: All tests pass, user can test feature
5. **Deploy/demo** if ready - complete vertical slice delivered

### Incremental Delivery

1. **Phase 1**: User Story 1 → Test independently → Deploy/Demo (MVP!) 🎯
2. **Phase 2**: User Story 2 → Test independently → Deploy/Demo
3. **Phase 3**: User Story 3 → Test independently → Deploy/Demo
4. **Each story adds value** without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. **Apply shared infrastructure**: Migrations, environment setup (one-time)
2. **Parallel development**:
   - Developer A: User Story 1 (T001-T006)
   - Developer B: User Story 2 (T007-T009)
   - Developer C: User Story 3 (T010-T012)
3. **Independent validation**: Each story testable without others
4. **Integration**: Stories compose naturally (no breaking changes)

---

## Notes

- **[P]** = Parallel execution possible (different files, no dependencies)
- **[SLICE]** = Vertical slice delivering complete user value (UI + Backend + Data + Feedback)
- **[POLISH]** = Enhancement to existing working feature
- **[Story]** = Maps to user story (US1, US2, US3) for traceability
- **Prerequisites** = Infrastructure validated BY tests, not delivered AS tasks
- **TDD** = Tests MUST fail (RED) before implementation starts
- **Demo-ready** = Every slice can be shown to non-technical person

**Forbidden Patterns:**
- ❌ [SETUP] tasks (infrastructure-only)
- ❌ Backend without UI
- ❌ UI without backend
- ❌ Tasks without SEE-DO-VERIFY
- ❌ Database migrations as standalone tasks

**Commit Strategy:**
- Commit after each GREEN (test passes)
- Stop at any checkpoint to validate story independently
