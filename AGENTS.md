# Repository Guidelines

## Project Structure & Module Organization
- `app/` houses the Next.js App Router: UI routes, API handlers (`app/api/outcomes/route.ts`), and shared components (see `app/components/`).
- Shared logic lives in `lib/` (`lib/services/outcomeService.ts`, `lib/hooks/useOutcomeDraft.ts`, schemas under `lib/schemas/`).
- Tests are grouped by scope: `__tests__/contract/`, `__tests__/integration/`, and component specs in `app/components/__tests__/`.
- Feature planning and slice assets reside in `.specify/` and `specs/002-outcome-management-shape/`; agent state and logs are under `.claude/`.
- SQL migrations are in `supabase/migrations/`; static assets belong in `public/`.

## Build, Test, and Development Commands
- `npm run dev` – Launch the local Next.js server with hot reload.
- `npm run build` / `npm run start` – Produce and serve the production bundle.
- `npm run lint` (`-- --fix` to auto-format) – ESLint + Prettier pass.
- `npm run test` – Vitest in watch mode; `npm run test:run` for single pass.
- Integration specs that hit Tinypool should run with `npm run test:run -- --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1`.

## Coding Style & Naming Conventions
- TypeScript everywhere, strict mode on, 2-space indentation, trailing semicolons.
- Components use PascalCase; hooks/utilities camelCase; constants SCREAMING_SNAKE_CASE.
- Tailwind utility classes stay inline—extract only when reused (`components/ui/`).
- Imports rely on `@/*` alias; avoid deep relative paths (`../../`).

## Testing Guidelines
- Vitest + Testing Library power unit, contract, and integration suites.
- Name specs `*.test.ts` or `*.test.tsx` and place them in the appropriate folder noted above.
- Maintain ≥80% coverage and add regression cases for new failure paths (e.g., recompute retries).
- When running Supabase-dependent tests locally, ensure env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) are set.

## Commit & Pull Request Guidelines
- Commits follow imperative, present-tense subjects (e.g., “Add outcome recompute queue”). Keep changes atomic and reference issues with `Fixes #id` when closing them.
- PRs require: concise summary, test evidence (`npm run test`, `npm run lint`), and screenshots or GIFs for UI changes. Mention Supabase migrations and update environment docs when applicable.
- Before submitting, run `npm run lint -- --fix` and the relevant focused test commands to keep CI green.
