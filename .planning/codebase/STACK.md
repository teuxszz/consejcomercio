# Technology Stack

**Analysis Date:** 2026-05-26

## Languages

**Primary:**
- TypeScript 5.9.x (`~5.9.3`) — all application code, hooks, components, tests, and Vercel serverless handler
- TSX — React components (`src/**/*.tsx`)

**Secondary:**
- SQL (PostgreSQL dialect with `pg_cron` / `pg_net` / Supabase Vault extensions) — schema and policies in `supabase/migrations/*.sql`
- TypeScript on Deno runtime — Supabase Edge Functions (`supabase/functions/*/index.ts`); imports use `https://deno.land/std@0.224.0/...` and `https://esm.sh/@supabase/supabase-js@2`
- JavaScript ESM (`.mjs`) — one-off Pipefy migration scripts in `scripts/migrate-*.mjs`
- HTML — single Vite entry `index.html`

## Runtime

**Environment:**
- Browser (modern, ES2023 target) — primary client app
- Vercel serverless (Node.js) — single API route `api/slack-proxy.ts`
- Deno (Supabase Edge Functions) — `supabase/functions/{notify-indicacao,notify-renovacao,notify-tarefa,slack-commands,slack-proxy}/index.ts`
- Node.js — local dev (Vite), tests (Vitest, Playwright), and migration scripts (the `@types/node` dep is `^24.x`, signalling Node 20+ expected locally)

**Package Manager:**
- npm — lockfile `package-lock.json` is present (per CLAUDE.md: do not Read it; ~92k tokens)
- `.npmrc` sets `legacy-peer-deps=true` (relaxes peer-dep resolution; needed because React 19 + several Radix/testing-library packages still declare React 18 peers)

## Frameworks

**Core:**
- React 19.2.x (`react`, `react-dom`) — UI framework
- Vite 8.0.x with `@vitejs/plugin-react` 6.0.x — dev server / bundler (config: `vite.config.ts`)
- React Router DOM 7.13.x — routing via `createBrowserRouter` in `src/router.tsx`
- TanStack Query v5 (`@tanstack/react-query` 5.90.x) — server-state cache, instantiated in `src/main.tsx` with `staleTime: 60_000`, `retry: 1`
- TailwindCSS 3.4.x — styling (config: `tailwind.config.js`, plugin set via `postcss.config.js`)
- shadcn/ui pattern (Radix primitives + Tailwind) — components in `src/components/ui/` (avatar, badge, button, card, dialog, dropdown-menu, input, label, progress, select, separator, tabs, textarea, tooltip, empty-state, search-input)
- Radix UI primitives — `@radix-ui/react-{avatar,checkbox,dialog,dropdown-menu,label,popover,progress,select,separator,slot,switch,tabs,toast,tooltip}` (versions 1.x–2.x)
- react-hook-form 7.71.x + `@hookform/resolvers` 5.2.x — form state
- Zod 4.3.x — schema validation (used with react-hook-form resolver)
- @dnd-kit (`/core` 6.3, `/sortable` 10.0, `/utilities` 3.2) — Kanban drag-and-drop (leads pipeline)
- Sonner 2.0.x — toast notifications (used pervasively via `import { toast } from 'sonner'`)

**Testing:**
- Vitest 3.2.x (`vitest`, `@vitest/coverage-v8`) — unit / integration runner (config: `vitest.config.ts`; setup: `vitest.setup.ts`)
- Testing Library — `@testing-library/react` 16.3, `@testing-library/dom` 10.4, `@testing-library/jest-dom` 6.9, `@testing-library/user-event` 14.6
- jsdom 25.0.x — DOM environment for Vitest
- Playwright `@playwright/test` 1.60.x — end-to-end browser tests (config: `playwright.config.ts`, suites in `tests/e2e/`)
- A separate Vitest RLS suite lives in `tests/rls/` (script `npm run test:rls`)

**Build/Dev:**
- TypeScript project references — root `tsconfig.json` delegates to `tsconfig.app.json` (browser, `react-jsx`, `vitest/globals` types, `@/*` → `./src/*`) and `tsconfig.node.json` (for `vite.config.ts`)
- ESLint 9.39.x flat config (`eslint.config.js`) — extends `@eslint/js` recommended, `typescript-eslint` recommended, `eslint-plugin-react-hooks` (flat/recommended), `eslint-plugin-react-refresh` (vite preset); ignores `dist`
- `typescript-eslint` 8.56.x — TS parser/plugin
- PostCSS 8.5.x with `autoprefixer` 10.4.x — Tailwind pipeline
- `tsc -b && vite build` — production build (script `npm run build`)

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` 2.99.x — sole client for the database, auth, storage, and edge functions. Single client created in `src/lib/supabase.ts`
- `react-router-dom` 7.13.x — every page in `src/pages/` is registered in `src/router.tsx`
- `@tanstack/react-query` 5.90.x — wraps every `src/hooks/use*.ts` (Leads, Clientes, Contratos, Demandas, Indicações, Oportunidades, Reuniões, Tarefas, Perfis, Portal, PortalAdmin, etc.)
- `zod` 4.3.x — form schemas
- `date-fns` 4.1.x — date math; `date-fns/locale` (`ptBR`) for Portuguese formatting (used in `PortalAdminPage.tsx`, `portal/PortalWalletPage.tsx`, gamification)
- `recharts` 3.8.x — dashboard and analytics charts (`src/pages/AnalyticsPage.tsx`, `src/pages/DashboardPage.tsx`)
- `react-simple-maps` 3.0.x — geographic map view (`src/pages/MapaPage.tsx`); `@types/react-simple-maps` 3.0 in devDeps
- `lucide-react` 0.577.x — icon set used throughout
- `class-variance-authority` 0.7.x + `clsx` 2.1.x + `tailwind-merge` 3.5.x — `cn()` utility (`src/lib/utils.ts`) and shadcn-style variants

**Infrastructure:**
- `prop-types` 15.8.x — declared but not idiomatic for this TS codebase; likely transitive support shim
- `overrides.d3-color` pinned to `^3.1.0` — security/compat override for `recharts`/`react-simple-maps` transitive graph

## Configuration

**Environment:**
- `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — read in `src/lib/supabase.ts`; the client throws an explicit error at startup if either is missing
- `VITE_ANTHROPIC_API_KEY` — referenced only in a toast string in `src/components/diagnostico/DiagnosticForm.tsx:45`; in practice diagnostic analysis is fully local/rule-based in `src/hooks/useAnalyzeDiagnostico.ts` (no Anthropic SDK installed)
- Test-time env vars listed in `.env.test.example`: `QA_DIRETOR_EMAIL`, `QA_DIRETOR_PASSWORD`, `QA_CONSULTOR_EMAIL`, `QA_CONSULTOR_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `E2E_BASE_URL`. Playwright loads `.env.test` itself (no dotenv dependency) — see `playwright.config.ts:10-17`
- Vercel function env: `SLACK_BOT_TOKEN` (consumed by `api/slack-proxy.ts:10`)
- Migration scripts read `PIPEFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`/`SUPABASE_KEY` from `process.env` (`scripts/migrate-pipefy*.mjs`, `scripts/migrate-contratos-pipefy.mjs`)

**Build:**
- `vite.config.ts` — minimal: React plugin + `@` alias to `./src`
- `vitest.config.ts` — deliberately separate from Vite (comment explains: avoids version conflict with Vitest's bundled Vite); uses jsdom env, `globals: true`, includes `src/**/*.test.{ts,tsx}` and `tests/rls/**/*.test.ts`; v8 coverage targets `src/lib/**`, `src/hooks/**`, `src/components/shared/**`
- `vitest.setup.ts` — only imports `@testing-library/jest-dom/vitest`
- `tailwind.config.js` — `darkMode: 'class'`, content globs use absolute paths resolved from `import.meta.url`; HSL CSS-variable color tokens (`--background`, `--foreground`, `--primary`, …, `--chart-1..5`), accordion keyframes/animations defined inline
- `postcss.config.js` — Tailwind + Autoprefixer; passes absolute path of `tailwind.config.js`
- `eslint.config.js` — flat config, ignores `dist`, targets `**/*.{ts,tsx}` only
- `vercel.json` — SPA rewrites: `/api/*` passes through, everything else falls back to `/index.html`

## Platform Requirements

**Development:**
- Node.js 20+ (implied by `@types/node` `^24.x` and Vite 8)
- npm (lockfile present); `legacy-peer-deps=true` required due to React 19 + React 18 peer mismatches
- Windows-friendly tooling — Tailwind/PostCSS configs convert backslashes via `fileURLToPath` (`tailwind.config.js:1-3`)
- Supabase CLI for local edge-function dev (`supabase functions serve …`, `supabase secrets set …`, `supabase db push`) — referenced in `docs/slack-indicacoes.md`

**Production:**
- **Frontend & API:** Vercel — static SPA + Node serverless functions under `/api/*` (config: `vercel.json`); the only HTTP function today is `api/slack-proxy.ts`
- **Backend (BaaS):** Supabase project (URL pattern `https://wfnriqwkzdazdbuzbyug.supabase.co` hard-coded in `supabase/migrations/031_cron_renovacoes.sql:27`) — PostgreSQL + Auth + Storage + Edge Functions + `pg_cron` + Supabase Vault
- Build command: `npm run build` (`tsc -b && vite build`); output `dist/`

## Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | Local dev server (default port 5173) |
| `build` | `tsc -b && vite build` | Type-check + production bundle |
| `lint` | `eslint .` | Lint all files |
| `preview` | `vite preview` | Serve built `dist/` locally |
| `test` | `vitest run` | Unit tests (single run) |
| `test:watch` | `vitest` | Unit tests in watch mode |
| `test:cov` | `vitest run --coverage` | Vitest + v8 coverage |
| `test:e2e` | `playwright test` | End-to-end (Chromium projects `diretor` and `consultor`) |
| `test:rls` | `vitest run --dir tests/rls` | RLS policy regression suite |

---

*Stack analysis: 2026-05-26*
