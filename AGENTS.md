# Repository Guidelines

## Project Structure & Module Organization
- `app/` implements Next.js App Router routes, UI, and API handlers (`app/dashboard`, `app/api`).  
- `components/` holds shared UI primitives; `lib/` centralizes hooks, services, and schema logic.  
- `__tests__/contract`, `__tests__/integration`, and `app/components/__tests__` cover contract, end-to-end, and component specs respectively.  
- `supabase/migrations/` stores SQL migrations; `public/` contains static assets; `specs/002-outcome-management-shape/` documents active feature slices.  
- `.specify/specs/` maintains slice plans, while `.claude/` tracks agent state, review logs, and curated docs.

## Build, Test, and Development Commands
- `npm run dev` – local Next.js server with hot reload.  
- `npm run build` / `npm run start` – compile and serve the production bundle.  
- `npm run lint` – ESLint + Prettier; append `-- --fix` to auto-format.  
- `npm run test` (watch) / `npm run test:run` (single pass) / `npm run test:ui` (dashboard). Use `npm run test:run -- --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1` when Tinypool crashes.

## Coding Style & Naming Conventions
- TypeScript everywhere, 2-space indentation, trailing semicolons, strict mode enabled.  
- React 19 patterns: PascalCase components, camelCase hooks/utilities, SCREAMING_SNAKE_CASE constants.  
- Keep Tailwind classes inline; extract shared styling into `components/ui/` when reused.  
- Run `npm run lint -- --fix` before committing to enforce `eslint-config-next` + Prettier rules.

## Testing Guidelines
- Vitest + Testing Library power all specs; add files under `__tests__/contract`, `__tests__/integration`, or `app/components/__tests__`.  
- Name tests `*.test.ts`/`*.test.tsx`, target ≥80% coverage, and add regressions for new failure paths.  
- Prefer shared fixtures and mocks for Supabase, AI services, and localStorage to keep runs deterministic.

## Vertical Slice & TDD Expectations
- Deliver end-to-end value every slice: something users SEE (UI feedback), DO (actionable workflow), and VERIFY (confirmation).  
- Follow Red–Green–Refactor: write a failing test first, implement the minimal passing change, then tidy with all tests green.  
- Stay within defined slice scope and document outcomes via `.claude/state/<task-id>.json`.

## Commit & Pull Request Guidelines
- Use imperative, present-tense commit subjects and keep changes atomic; cite issues with `Fixes #id` when closing them.  
- PRs require a short summary, test evidence (`npm run test`, `npm run lint`), and screenshots/GIFs for UI changes. Note Supabase migrations and refresh environment docs as needed.

## Accessibility & UX Requirements
- Meet WCAG 2.1 AA: keyboard operability, visible focus indicators, and descriptive ARIA labels for dialogs and icon buttons.  
- Maintain ≥4.5:1 text contrast, provide 44px touch targets, and ensure Escape/Enter/Space activate modal and button interactions.
