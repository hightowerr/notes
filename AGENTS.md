# Repository Guidelines

## Project Structure & Module Organization
- `app/` hosts the Next.js App Router, API routes (e.g., `app/api/outcomes/route.ts`), and shared UI under `app/components/`.
- Core logic lives in `lib/`, including Supabase-facing services, hooks, schemas, and the Mastra integration (`lib/mastra/`).
- Automated tests are grouped by intent: `__tests__/contract/`, `__tests__/integration/`, and `app/components/__tests__/`.
- Feature specs, planning notes, and quickstart guides live in `specs/`; agent logs and prior run context reside in `.claude/`.
- Database migrations are in `supabase/migrations/`, while static assets stay under `public/`.

## Build, Test, and Development Commands
- `npm run dev` — start the Next.js dev server with HMR.
- `npm run build` → `npm run start` — produce and serve the production bundle.
- `npm run lint` (`-- --fix` to auto-correct) — run ESLint/Prettier.
- `npm run test` — launch Vitest in watch mode; for single passes use `npm run test:run`.
- Integration specs that stress Tinypool should use `npm run test:run -- --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1`.
- `npx tsx scripts/test-mastra.ts` — quick Mastra wiring check (telemetry + tool registry count).

## Coding Style & Naming Conventions
- TypeScript everywhere, strict mode on, 2-space indentation, trailing semicolons.
- Components use PascalCase, hooks/utilities camelCase, constants SCREAMING_SNAKE_CASE.
- Keep Tailwind utilities inline unless a pattern repeats; reusable primitives belong in `components/ui/`.
- Prefer the `@/*` path alias over deep relative imports.

## Testing Guidelines
- Vitest + Testing Library power unit, contract, and integration coverage; keep file names `*.test.ts(x)`.
- Target ≥80 % coverage and add regression specs for any bug fix or retry logic change.
- Supabase-dependent tests need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; stub external services where possible.
- For Mastra tools, mirror contract tests in `__tests__/contract/mastra-tools.test.ts` and integration checks in `__tests__/integration/tool-execution.test.ts`.

## Commit & Pull Request Guidelines
- Use imperative, present-tense commit subjects (`Add outcome recompute queue`); keep commits atomic and scoped.
- Reference tracking issues with `Fixes #id` when relevant and note schema or migration impacts explicitly.
- PRs should include a concise summary, verification evidence (`npm run lint`, `npm run test`), and UI screenshots/GIFs when front-end behavior changes.

## Security & Configuration Tips
- Never run destructive commands (`git reset --hard`, `rm -rf`) without approval; operate inside the sandboxed workspace.
- Guard API keys in `.env.local`; never commit secrets. Supabase and OpenAI keys are required for end-to-end tests.
- Leverage `.claude/` and `specs/` when triaging regressions, and update this guide if tooling or workflows change.
