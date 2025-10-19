# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains the Next.js App Router, UI routes, API handlers such as `app/api/outcomes/route.ts`, and shared UI pieces under `app/components/`.
- Shared logic sits in `lib/`, with services (`lib/services/outcomeService.ts`), hooks (`lib/hooks/useOutcomeDraft.ts`), and Zod schemas under `lib/schemas/`.
- Tests live in `__tests__/contract/`, `__tests__/integration/`, and `app/components/__tests__/`.
- Feature planning assets are stored in `.specify/` and `specs/002-outcome-management-shape/`; agent logs live in `.claude/`.
- Database migrations are in `supabase/migrations/`; static assets belong in `public/`.

## Build, Test, and Development Commands
- `npm run dev` starts the local Next.js server with hot reload.
- `npm run build` compiles the production bundle; follow with `npm run start` to serve it.
- `npm run lint` runs ESLint + Prettier (append `-- --fix` before committing).
- `npm run test` launches Vitest in watch mode; `npm run test:run` executes a single pass.
- For integration specs that hit Tinypool, prefer `npm run test:run -- --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1`.

## Coding Style & Naming Conventions
- TypeScript everywhere, strict mode enabled, 2-space indentation, and trailing semicolons.
- Components use PascalCase, hooks and utilities camelCase, constants SCREAMING_SNAKE_CASE.
- Tailwind utility classes stay inline unless reused; shared UI lives in `components/ui/`.
- Use the `@/*` alias for imports to avoid deep relative paths.

## Testing Guidelines
- Vitest + Testing Library cover unit, contract, and integration suites.
- Name specs `*.test.ts` or `*.test.tsx` and place them in the directories noted above.
- Target ≥80% coverage and add regression tests when fixing failures (e.g., recompute retries).
- Supabase-dependent tests rely on `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Commit & Pull Request Guidelines
- Write imperative, present-tense subjects (e.g., `Add outcome recompute queue`); keep commits atomic.
- Reference closed issues with `Fixes #id` when appropriate.
- PRs need a concise summary, test evidence (`npm run test`, `npm run lint`), and screenshots or GIFs for UI changes.
- Mention Supabase migrations and update environment docs when configuration changes.

## Security & Agent Tips
- Never run destructive commands (`git reset --hard`, `rm -rf`) without explicit approval.
- Leverage agent logs in `.claude/` for triage; update AGENTS.md when workflows evolve.
