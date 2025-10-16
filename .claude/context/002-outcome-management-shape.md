# Context: 002-outcome-management-shape

## Summary
Outcome management already ships core backend and frontend pieces: `app/api/outcomes/route.ts` handles create/update/read with Supabase, while `OutcomeBuilder` and `OutcomeDisplay` coordinate the modal workflow and banner refresh on the client. Integration coverage is currently limited to component tests and API contract specs; T018 will add an end-to-end test validating the full create → display → edit loop.

## Existing Patterns

### Backend
- API route: `app/api/outcomes/route.ts` uses `createClient` from `@supabase/supabase-js`, validates payloads with `outcomeInputSchema`, assembles text via `assembleOutcome`, toggles `is_active`, and enqueues `recomputeService`.
- Service layer: `lib/services/outcomeService.ts` exposes deterministic assembly + length guards reused in both UI and API tiers.
- Validation: `lib/schemas/outcomeSchema.ts` defines shared Zod schemas (`outcomeInputSchema`, `outcomeResponseSchema`) used across contract and component tests.

### Frontend
- Modal workflow: `OutcomeBuilder` (app/components/OutcomeBuilder.tsx) wraps shadcn `Dialog` + `react-hook-form`, supports confirmation prompts, draft recovery, and `toast` feedback.
- Banner display: `OutcomeDisplay` (app/components/OutcomeDisplay.tsx) fetches the active outcome on mount, exposes `window.refreshOutcomeDisplay`, and renders edit affordance via icon button.
- Page orchestration: `app/page.tsx` wires both components—opening modal from header CTA and edit button; success callback clears edit state.

### Database
- Table: `user_outcomes` (created in T008) stores assembled outcome text, field components, `is_active` flag, and timestamps.
- Concurrency: API ensures single active record per user, deactivating prior entries before inserting the replacement.
- Related data: `processed_documents` count powers recompute messaging; background recompute logic lives in `lib/services/recomputeService.ts`.

## Dependencies

### Required Changes
- Tests: add `__tests__/integration/outcome-flow.test.ts` covering empty → create → edit pathway, reusing real API route handlers.
- Mocks: provide deterministic Supabase client + recompute service fakes to keep test hermetic.

### Integration Points
- `OutcomeBuilder` fetches `/api/outcomes` during modal open to detect replacement flow.
- `OutcomeDisplay` invokes `/api/outcomes` on mount and exposes `window.refreshOutcomeDisplay` for live refresh after saves.
- API route imports `assembleOutcome`, `outcomeInputSchema`, and `recomputeService.enqueue`, so mocks must respect these signatures.

## Similar Implementations

**Example 1**: `__tests__/integration/summary-flow.test.ts`
- Location: `__tests__/integration/summary-flow.test.ts`
- Pattern used: integration test driving API route handlers and Supabase fixtures to validate upload → process pipeline.
- Key learnings: rely on helper utilities, reset Supabase state between tests, and assert both API response shape and downstream persistence.

**Example 2**: Component specs (`OutcomeBuilder.test.tsx`, `OutcomeDisplay.test.tsx`)
- Location: `app/components/__tests__/OutcomeBuilder.test.tsx`
- Pattern used: mock `fetch` + `toast`, assert modal behaviors and refresh hook interactions.
- Key learnings: leverage `window.refreshOutcomeDisplay`, `toast` spies, and `userEvent` flows to simulate realistic user input.

## Recommendations

### Approach
- Mock `@supabase/supabase-js` to supply an in-memory table that honors `select/insert/update/eq` chains so the real `/api/outcomes` handlers can run untouched.
- Stub `recomputeService.enqueue` to avoid background timers while enabling call assertions.
- Replace global `fetch` with a wrapper that routes requests to `GET/POST` handlers for `/api/outcomes`, returning `NextResponse` objects.
- Drive the flow via `Home` page render: open modal, submit create, trigger edit, and confirm banner refresh plus toast messaging.

### Potential Issues
- Need to await modal toggles and refresh callbacks before asserting banner text (use `waitFor` to avoid race conditions).
- `OutcomeBuilder` persists drafts on close via `setTimeout`; ensure modal closes cleanly to prevent lingering timers in test environment.
- Supabase mock must support chained `.eq` calls and `{ count: 'exact', head: true }` selects used for recompute messaging.

### Testing Strategy
- Integration test: simulate first-time creation, then edit flow, asserting UI, toast calls, recompute enqueue invocations, and mock Supabase table state (active vs inactive outcomes).
- Regression coverage: ensure 404 path for initial GET is exercised; confirm edit path preserves direction default and updates preview text.

## Manual Verification
- Detailed QA checklist lives in `specs/002-outcome-management-shape/T008_MANUAL_TEST.md`, covering creation, edit confirmation, draft recovery, Launch/Ship grammar, validation errors, recompute failure handling, mobile responsiveness, and cross-page banner consistency.
- Performance guidance in the manual doc references NFR-001/002 targets (<1000ms preview updates, <2000ms save latency) to confirm user-perceived responsiveness.
- Use the guide for release sign-off alongside automated contract, component, and integration tests.

## Next Steps for Implementation Agents

**For backend-engineer**:
- None—reuse existing `/api/outcomes` logic through mocks; ensure Supabase stub mirrors `select/insert/update` semantics.

**For frontend-ui-builder**:
- Leverage existing `Home`, `OutcomeBuilder`, and `OutcomeDisplay`; focus on orchestrating modal interactions within the integration test.

**For test-runner**:
- Execute `npm run test:run -- outcome-flow.test.ts` validating new integration coverage and ensuring no regressions.
