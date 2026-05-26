# CONSEJ CRM v2 — Contexto do Projeto

## O que é

CRM interno da CONSEJ, empresa júnior de consultoria jurídica. Gerencia leads, pipeline, clientes, contratos, diagnósticos e mensagens de abordagem.

## Stack

- **Frontend:** React + TypeScript + Vite + TailwindCSS
- **Backend:** Supabase (PostgreSQL + Auth + RLS)
- **Roteamento:** React Router v6
- **Estado/fetch:** TanStack Query (React Query)
- **UI:** shadcn/ui + Radix UI
- **DnD:** @dnd-kit

## Vault Obsidian — CONSEJ

O vault de conhecimento da CONSEJ está em:
```
C:\Users\Gabriel\OneDrive\Área de Trabalho\CONSEJ
```

Acessível via MCP `obsidian-consej` (servidor filesystem configurado no settings global).

### Estrutura do vault

| Pasta | Conteúdo |
|-------|----------|
| `Leads/` | Notas por lead — contexto, histórico, dores identificadas |
| `Clientes/` | Notas por cliente ativo — projeto, entregas, NPS |
| `Reuniões/` | Atas de diagnóstico e reuniões |
| `Processos/` | Processos internos da CONSEJ |
| `Conhecimento Jurídico/` | Referências, modelos, pesquisa jurídica |
| `Templates/` | Modelos de e-mail, proposta, contrato |
| `Time/` | Notas dos consultores |

### Uso

- Ao trabalhar em um lead específico, consultar `Leads/Nome - Empresa.md` para contexto adicional
- Diagnósticos importantes podem ser anotados em `Reuniões/`
- Conhecimento jurídico relevante para um serviço fica em `Conhecimento Jurídico/`

## Convenções de código

- Componentes em `src/components/`
- Hooks em `src/hooks/`
- Páginas em `src/pages/`
- Tipos centralizados em `src/types/index.ts`
- Constantes em `src/lib/constants.ts`
- Configurações globais em `configuracoes` (Supabase, id = 'default')

## Supabase

- RLS ativa em todas as tabelas sensíveis
- Migrações incrementais em `supabase/migrations/`
- Perfis de usuário auto-criados via trigger `on_auth_user_created`

## Contexto / tokens

- **Nunca** ler `package-lock.json` com `Read` (~367 mil chars, ~92k tokens) — usar Glob/Grep para inspecionar dependências.
- Para versões de pacote, ler `package.json`.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**CONSEJ CRM v2 — Milestone 2: Adoção & Crescimento**

CRM interno da CONSEJ (empresa júnior de consultoria jurídica em Natal/RN) que gerencia o ciclo completo de lead → cliente → contrato.

O **Milestone 1** construiu a fundação: pipeline de leads, clientes, contratos, diagnósticos, ICP scoring, Slack, portal de indicações, auditoria. Tudo isso existe e funciona.

O **Milestone 2** resolve o problema real: **o time não usa o CRM direito**. Com 2-5 pessoas, o CRM existe mas é subutilizado — o time esquece de abrir e não tem clareza sobre o que fazer quando abre. Isso significa dados incompletos, leads esquecidos e liderança operando no escuro.

**Core Value:** > Transformar o CRM de "lugar onde deveria reportar" em "lugar onde o trabalho acontece" — criando razões para o time abrir todo dia e valor visível quando abre.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.9.x (`~5.9.3`) — all application code, hooks, components, tests, and Vercel serverless handler
- TSX — React components (`src/**/*.tsx`)
- SQL (PostgreSQL dialect with `pg_cron` / `pg_net` / Supabase Vault extensions) — schema and policies in `supabase/migrations/*.sql`
- TypeScript on Deno runtime — Supabase Edge Functions (`supabase/functions/*/index.ts`); imports use `https://deno.land/std@0.224.0/...` and `https://esm.sh/@supabase/supabase-js@2`
- JavaScript ESM (`.mjs`) — one-off Pipefy migration scripts in `scripts/migrate-*.mjs`
- HTML — single Vite entry `index.html`
## Runtime
- Browser (modern, ES2023 target) — primary client app
- Vercel serverless (Node.js) — single API route `api/slack-proxy.ts`
- Deno (Supabase Edge Functions) — `supabase/functions/{notify-indicacao,notify-renovacao,notify-tarefa,slack-commands,slack-proxy}/index.ts`
- Node.js — local dev (Vite), tests (Vitest, Playwright), and migration scripts (the `@types/node` dep is `^24.x`, signalling Node 20+ expected locally)
- npm — lockfile `package-lock.json` is present (per CLAUDE.md: do not Read it; ~92k tokens)
- `.npmrc` sets `legacy-peer-deps=true` (relaxes peer-dep resolution; needed because React 19 + several Radix/testing-library packages still declare React 18 peers)
## Frameworks
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
- Vitest 3.2.x (`vitest`, `@vitest/coverage-v8`) — unit / integration runner (config: `vitest.config.ts`; setup: `vitest.setup.ts`)
- Testing Library — `@testing-library/react` 16.3, `@testing-library/dom` 10.4, `@testing-library/jest-dom` 6.9, `@testing-library/user-event` 14.6
- jsdom 25.0.x — DOM environment for Vitest
- Playwright `@playwright/test` 1.60.x — end-to-end browser tests (config: `playwright.config.ts`, suites in `tests/e2e/`)
- A separate Vitest RLS suite lives in `tests/rls/` (script `npm run test:rls`)
- TypeScript project references — root `tsconfig.json` delegates to `tsconfig.app.json` (browser, `react-jsx`, `vitest/globals` types, `@/*` → `./src/*`) and `tsconfig.node.json` (for `vite.config.ts`)
- ESLint 9.39.x flat config (`eslint.config.js`) — extends `@eslint/js` recommended, `typescript-eslint` recommended, `eslint-plugin-react-hooks` (flat/recommended), `eslint-plugin-react-refresh` (vite preset); ignores `dist`
- `typescript-eslint` 8.56.x — TS parser/plugin
- PostCSS 8.5.x with `autoprefixer` 10.4.x — Tailwind pipeline
- `tsc -b && vite build` — production build (script `npm run build`)
## Key Dependencies
- `@supabase/supabase-js` 2.99.x — sole client for the database, auth, storage, and edge functions. Single client created in `src/lib/supabase.ts`
- `react-router-dom` 7.13.x — every page in `src/pages/` is registered in `src/router.tsx`
- `@tanstack/react-query` 5.90.x — wraps every `src/hooks/use*.ts` (Leads, Clientes, Contratos, Demandas, Indicações, Oportunidades, Reuniões, Tarefas, Perfis, Portal, PortalAdmin, etc.)
- `zod` 4.3.x — form schemas
- `date-fns` 4.1.x — date math; `date-fns/locale` (`ptBR`) for Portuguese formatting (used in `PortalAdminPage.tsx`, `portal/PortalWalletPage.tsx`, gamification)
- `recharts` 3.8.x — dashboard and analytics charts (`src/pages/AnalyticsPage.tsx`, `src/pages/DashboardPage.tsx`)
- `react-simple-maps` 3.0.x — geographic map view (`src/pages/MapaPage.tsx`); `@types/react-simple-maps` 3.0 in devDeps
- `lucide-react` 0.577.x — icon set used throughout
- `class-variance-authority` 0.7.x + `clsx` 2.1.x + `tailwind-merge` 3.5.x — `cn()` utility (`src/lib/utils.ts`) and shadcn-style variants
- `prop-types` 15.8.x — declared but not idiomatic for this TS codebase; likely transitive support shim
- `overrides.d3-color` pinned to `^3.1.0` — security/compat override for `recharts`/`react-simple-maps` transitive graph
## Configuration
- `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — read in `src/lib/supabase.ts`; the client throws an explicit error at startup if either is missing
- `VITE_ANTHROPIC_API_KEY` — referenced only in a toast string in `src/components/diagnostico/DiagnosticForm.tsx:45`; in practice diagnostic analysis is fully local/rule-based in `src/hooks/useAnalyzeDiagnostico.ts` (no Anthropic SDK installed)
- Test-time env vars listed in `.env.test.example`: `QA_DIRETOR_EMAIL`, `QA_DIRETOR_PASSWORD`, `QA_CONSULTOR_EMAIL`, `QA_CONSULTOR_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `E2E_BASE_URL`. Playwright loads `.env.test` itself (no dotenv dependency) — see `playwright.config.ts:10-17`
- Vercel function env: `SLACK_BOT_TOKEN` (consumed by `api/slack-proxy.ts:10`)
- Migration scripts read `PIPEFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`/`SUPABASE_KEY` from `process.env` (`scripts/migrate-pipefy*.mjs`, `scripts/migrate-contratos-pipefy.mjs`)
- `vite.config.ts` — minimal: React plugin + `@` alias to `./src`
- `vitest.config.ts` — deliberately separate from Vite (comment explains: avoids version conflict with Vitest's bundled Vite); uses jsdom env, `globals: true`, includes `src/**/*.test.{ts,tsx}` and `tests/rls/**/*.test.ts`; v8 coverage targets `src/lib/**`, `src/hooks/**`, `src/components/shared/**`
- `vitest.setup.ts` — only imports `@testing-library/jest-dom/vitest`
- `tailwind.config.js` — `darkMode: 'class'`, content globs use absolute paths resolved from `import.meta.url`; HSL CSS-variable color tokens (`--background`, `--foreground`, `--primary`, …, `--chart-1..5`), accordion keyframes/animations defined inline
- `postcss.config.js` — Tailwind + Autoprefixer; passes absolute path of `tailwind.config.js`
- `eslint.config.js` — flat config, ignores `dist`, targets `**/*.{ts,tsx}` only
- `vercel.json` — SPA rewrites: `/api/*` passes through, everything else falls back to `/index.html`
## Platform Requirements
- Node.js 20+ (implied by `@types/node` `^24.x` and Vite 8)
- npm (lockfile present); `legacy-peer-deps=true` required due to React 19 + React 18 peer mismatches
- Windows-friendly tooling — Tailwind/PostCSS configs convert backslashes via `fileURLToPath` (`tailwind.config.js:1-3`)
- Supabase CLI for local edge-function dev (`supabase functions serve …`, `supabase secrets set …`, `supabase db push`) — referenced in `docs/slack-indicacoes.md`
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- React components: `PascalCase.tsx` — e.g. `KanbanBoard.tsx`, `NewLeadModal.tsx`, `ErrorBoundary.tsx`
- shadcn/ui primitives: `kebab-case.tsx` (lowercase) — e.g. `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/dropdown-menu.tsx`
- Hooks: `useXxx.ts` (or `.tsx` when JSX is needed in tests) — e.g. `src/hooks/useLeads.ts`, `src/hooks/useCurrentRole.ts`
- Pages: `XxxPage.tsx` — e.g. `src/pages/LeadsPage.tsx`, `src/pages/DashboardPage.tsx`
- Libs / pure modules: `kebab-case.ts` — e.g. `src/lib/icp-dinamico.ts`, `src/lib/query-keys.ts`, `src/lib/diagnostic-questions.ts`
- Tests: co-located in `__tests__/` siblings, mirror the module name with `.test.{ts,tsx}` suffix — e.g. `src/hooks/__tests__/useLeads.test.tsx`, `src/lib/__tests__/icp-dinamico.test.ts`
- camelCase. Exported helpers are descriptive verbs: `calcularIcpDinamico`, `getPeriodRange`, `formatCurrency`, `buildIcpFitContext`
- Hooks always start with `use` (lint rule `react-hooks/recommended` enforces this)
- Mutation hooks use `useCreateXxx` / `useUpdateXxx` / `useDeleteXxx` (`src/hooks/useLeads.ts:21,53,118`, `src/hooks/useObjecoes.ts:22,38,59`)
- Event handlers in components: `handleXxx` (`handleLogin`, `handleConfirm`, `handleReload`)
- Mixed PT-BR / EN allowed at function level: domain verbs in PT-BR (`comRole`, `destinoParaPerfil`), generic verbs in EN (`getInitials`, `makeBuilder`)
- camelCase for locals (`responsavelId`, `filteredLeads`, `selectedPerfil`)
- SCREAMING_SNAKE_CASE for module-level constants (`PIPELINE_STAGES`, `TERMINAL_WON_STAGES`, `LEAD_SOURCES`, `QUERY_KEYS`, `STAGE_COLORS`) in `src/lib/constants.ts` and `src/lib/query-keys.ts`
- Domain names stay in PT-BR (`leads`, `contratos`, `perfis`, `objecoes`, `parceiros`, `oportunidades`) to match the Supabase schema
- PascalCase, exported via `interface` (preferred for object shapes — see `src/types/index.ts:1`) or `type` (for unions/aliases — `type Theme = 'dark' | 'light'`, `type RoleConsej = 'diretor' | 'gerente' | 'coordenador' | 'consultor'`)
- Component prop interfaces are local and called `Props` (`src/components/ErrorBoundary.tsx:3`, `src/components/shared/RequireRole.tsx:6`, `src/components/leads/NewLeadModal.tsx:32`)
- Discriminator literal types — `EntidadeTipo`, `Scope`, `PeriodValue` — exported alongside the component/hook that owns them
## Code Style
- No Prettier config in the repo. Two-space indent, single quotes, no semicolons in most files (e.g. `src/hooks/useLeads.ts`, `src/lib/utils.ts`).
- shadcn/ui primitives keep their upstream double-quote style (`src/components/ui/button.tsx`); do not reformat them.
- Flat config at `eslint.config.js`. Extends:
- Globally ignores `dist/`. Browser globals enabled.
- Run with `npm run lint` (`eslint .`).
- Pragmas seen in the codebase to silence `react-hooks/exhaustive-deps` for intentional one-shot effects: `// eslint-disable-next-line react-hooks/exhaustive-deps` (`src/components/leads/NewLeadModal.tsx:65,79`).
## TypeScript
- App config relaxes `noUnusedLocals`/`noUnusedParameters` to `false` so WIP code doesn’t block compilation; the Node config keeps them strict.
- `noFallthroughCasesInSwitch: true`, `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`.
- `jsx: "react-jsx"`, `moduleResolution: "bundler"`, `target/lib: ES2023`.
- Vitest globals are wired via `"types": ["vite/client", "vitest/globals"]` — `describe/it/expect/vi` are available without imports inside `src/`, though every existing test imports them explicitly anyway.
- Declared in `tsconfig.app.json:21-23` and mirrored in `vite.config.ts:7-11` and `vitest.config.ts:9-11`. Always use `@/...` for cross-folder imports; relative `../` is reserved for siblings inside the same feature directory (`src/components/__tests__/DeleteConfirmDialog.test.tsx:15` → `../shared/DeleteConfirmDialog`).
## Import Organization
## Forms
- `src/components/leads/NewLeadModal.tsx:18-46` — declares a `z.object({...})` schema, derives `type FormData = z.infer<typeof schema>`, wires with `useForm<FormData>({ resolver: zodResolver(schema) })`, surfaces `errors.<field>.message` under inputs (`text-xs text-red-500`).
- `src/components/leads/ConvertToClientModal.tsx:25-31`
- `src/components/leads/LostReasonModal.tsx`
- `src/components/leads/ConfirmSendModal.tsx`
- `src/pages/LoginPage.tsx:30-32`
- `z.string().min(2, 'Nome obrigatório')` — custom PT-BR error messages
- `z.string().email().optional().or(z.literal(''))` for optional emails that may be sent as an empty string by the input
- Convert `''` to `null` at submit (`email: data.email || null`)
## Data Fetching (TanStack Query)
## Supabase Wrappers
- `select('*, diagnostico:diagnosticos(*)')` (`src/hooks/useLeads.ts:13`)
- `select('*, contratos(*), indicado_por_cliente:indicado_por_cliente_id(id,nome,empresa)')` (`src/hooks/useClientes.ts:13`)
## Error Handling
- Success: PT-BR action confirmation (`'Lead criado com sucesso!'`, `'NPS atualizado!'`)
- Error: short PT-BR description (`'Erro ao mover lead'`). For RPC errors that carry a user-facing message, surface it: `e instanceof Error ? e.message : 'Erro ao remover lead'` (`src/hooks/useLeads.ts:131-132`).
## Auth & Role Gating
## Theming / Dark Mode
- `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`
- Chart palette: `--chart-1` through `--chart-5`
- Custom alphas for translucent surfaces: `--alpha-bg-xs/sm/md/lg`, `--alpha-border`, `--alpha-border-md`
- Brand semantic alphas: `--emerald-hi/mid/lo`, `--amber-hi/mid/lo`, `--cyan-hi/mid/lo`, `--red-hi`
- Sidebar tokens are pinned to dark and not overridden in `html.light`
## Logging
## Comments
- Workarounds for upstream quirks — `// thenable: 'await builder' resolve a resposta` (`src/test/supabase-mock.ts:40`)
- Cross-cutting design decisions — `// Para drill-down de "ganho/terminal", o filtro de período passa a usar updated_at ...` (`src/pages/LeadsPage.tsx:66-72`)
- Why an effect is intentionally non-exhaustive — `// eslint-disable-next-line react-hooks/exhaustive-deps`
- ESM/Windows path notes — `// ESM: __dirname não existe — derivar da URL do módulo`
## Function & Module Design
- Named exports only — no `export default` in `src/` except for the Tailwind/Vite/Vitest config files which require it.
- Pages, hooks, components: each file exports one primary symbol matching its filename.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
```
## Component Responsibilities
| Component | Responsibility | File |
|-----------|----------------|------|
| `main.tsx` | Bootstrap: monta provedores (ErrorBoundary, Theme, QueryClient, Router) | `src/main.tsx` |
| `router.tsx` | Configura `createBrowserRouter` com 3 escopos: público (`/login`, `/reset-password`), CRM (`/` + `AppLayout`), Portal (`/portal` + `PortalLayout`) | `src/router.tsx` |
| `AppLayout` | Shell do CRM: verifica sessão, redireciona cliente p/ `/portal`, monta Sidebar/GlobalSearch/Onboarding/Toaster e renderiza `<Outlet />` | `src/components/layout/AppLayout.tsx` |
| `PortalLayout` | Shell do Portal de Indicações (cliente + interno opt-in): header com saldo de tokens + nível, nav horizontal | `src/pages/portal/PortalLayout.tsx` |
| `Sidebar` | Navegação principal do CRM, agrupada em PIPELINE / CLIENTES / CRESCIMENTO / COMUNICAÇÃO + dropdown de perfil (account switcher CRM ↔ Portal) | `src/components/layout/Sidebar.tsx` |
| `GlobalSearch` | Cmd/Ctrl+K — busca cross-entidade lendo as queries já em cache (leads, clientes, contratos, etc.) | `src/components/layout/GlobalSearch.tsx` |
| `ErrorBoundary` | Captura erros de render e mostra fallback no lugar de tela branca | `src/components/ErrorBoundary.tsx` |
| `ThemeProvider` | Toggle dark/light persistido em `localStorage` (classes `light`/`dark` no `<html>`) | `src/contexts/ThemeContext.tsx` |
| `RequireRole` | Guarda de conteúdo por role (`roles=[...]` ou `atLeast=...`) usando `useCurrentRole` | `src/components/shared/RequireRole.tsx` |
| `ScopeToggle` | Toggle canônico "Minhas / Todas" em listagens com filtro por responsável | `src/components/shared/ScopeToggle.tsx` |
| `PeriodSelector` | Seletor canônico de período (ano + granularidade trim/sem/total) | `src/components/shared/PeriodSelector.tsx` |
| `supabase` client | Singleton do Supabase JS — falha cedo com mensagem clara se faltarem env vars | `src/lib/supabase.ts` |
| `icp-dinamico` | Cálculo de ICP observado, win-rate e contexto `IcpFit` (Set O(1) usado no `LeadCard`) | `src/lib/icp-dinamico.ts` + `src/hooks/useIcpFit.ts` |
## Pattern Overview
- **3 shells em uma SPA:** `/login` (público), `/` (CRM interno com `AppLayout`), `/portal` (Portal de Indicações com `PortalLayout`). Account switcher no dropdown do header alterna entre CRM e Portal para usuários `tipo='interno'`; clientes (`tipo='cliente'`) são forçados ao Portal pelo `AppLayout`.
- **Hooks são a camada de dados:** cada agregado tem um arquivo `src/hooks/use<Recurso>.ts` que expõe queries (`useLeads`, `useCliente(id)`) e mutations (`useCreateLead`, `useUpdateLeadStatus`).
- **Mutations escrevem em múltiplas tabelas:** o pattern padrão é `mutationFn` faz o write principal e o `onSuccess` invalida queries + insere `audit_logs` + cria reflexos (ex.: `useCreateLead` insere `indicacoes` quando origem é referral).
- **Optimistic updates onde DnD importa:** `useUpdateLeadStatus` faz `onMutate` (rollback no `onError`) para o kanban responder instantaneamente.
- **RPCs SECURITY DEFINER substituem mutations diretas em casos sensíveis:** `excluir_lead` / `restaurar_lead` (lixeira), `solicitar_resgate` (portal).
- **Estado server-side via TanStack Query; estado UI local via `useState`/`useSearchParams`.** Sem Redux, sem Zustand.
- **Filtros bookmarkable via URL:** `/leads?status=ganho&segmento=...` para drill-down (ver `LeadsPage`).
## Layers
- Purpose: declara todas as rotas em um único `createBrowserRouter`
- Location: `src/router.tsx`
- Contains: rotas públicas (`/login`, `/reset-password`), rotas CRM (filhas de `AppLayout`), rotas Portal (filhas de `PortalLayout`), catch-all `*` → `/dashboard`
- Depends on: páginas em `src/pages/`
- Used by: `RouterProvider` em `src/main.tsx`
- Purpose: chrome global da aplicação — sidebar, header, search, onboarding, toaster + guarda de sessão
- Location: `src/components/layout/AppLayout.tsx`, `src/components/layout/Sidebar.tsx`, `src/pages/portal/PortalLayout.tsx`
- Depends on: `supabase` client, `useMeuPerfil`, `useTheme`
- Used by: roteador como `element` das rotas pai
- Purpose: composição por rota — orquestra hooks, filtros, layout específico
- Location: `src/pages/*.tsx` (32 páginas CRM + 5 páginas Portal em `src/pages/portal/`)
- Depends on: hooks (`src/hooks/`), componentes feature (`src/components/<feature>/`), primitivos UI (`src/components/ui/`)
- Used by: roteador
- Purpose: componentes ricos por domínio — kanban, modais, formulários, dashboards
- Location: `src/components/leads/`, `src/components/clientes/`, `src/components/diagnostico/`, `src/components/me/`, `src/components/onboarding/`, `src/components/portal-admin/`, etc.
- Depends on: hooks, primitivos UI, libs (`@dnd-kit`, `recharts`)
- Used by: páginas correspondentes (a página `LeadsPage` usa `components/leads/KanbanBoard.tsx`, etc.)
- Purpose: componentes cross-feature canônicos (toggles, badges, dialogs, role guard)
- Location: `src/components/shared/ScopeToggle.tsx`, `PeriodSelector.tsx`, `RequireRole.tsx`, `DeleteConfirmDialog.tsx`, `ActivityTimeline.tsx`, `ResponsavelBadge.tsx`
- Depends on: primitivos UI, hooks
- Used by: páginas e feature components
- Purpose: design system — wrappers shadcn/ui sobre Radix (Dialog, DropdownMenu, Tabs, Select, Avatar, Button, Input, etc.)
- Location: `src/components/ui/*.tsx` (16 primitivos)
- Depends on: Radix UI, `class-variance-authority`, `clsx`, `tailwind-merge` via `cn()` em `src/lib/utils.ts`
- Used by: praticamente tudo acima
- Purpose: contrato entre UI e dados — queries + mutations TanStack Query
- Location: `src/hooks/use<Recurso>.ts` (22 arquivos: `useLeads`, `useClientes`, `useContratos`, `useDemandas`, `useIndicacoes`, `useOportunidades`, `useParceiros`, `useReunioes`, `useTarefas`, `useDiagnostico`, `useAnalyzeDiagnostico`, `usePerfis`, `useCurrentRole`, `useConfiguracoes`, `useGamification`, `useIcpFit`, `useObjecoes`, `useAuditLog`, `useAuditLogs`, `useInteracoes`, `usePortal`, `usePortalAdmin`, `usePosJuniors`)
- Depends on: `@/lib/supabase`, `@/lib/query-keys`, `@/types`
- Used by: pages, layout, components
- Purpose: lógica pura, configuração, cliente Supabase, constantes
- Location: `src/lib/supabase.ts`, `query-keys.ts`, `constants.ts`, `utils.ts`, `periods.ts`, `icp-dinamico.ts`, `projecao.ts`, `diagnostic-utils.ts`, `diagnostic-questions.ts`, `cadencia.ts`, `mensagens-rules.ts`, `blocos-mensagem.ts`, `slack.ts`, `slack-suggestions.ts`, `cnpj.ts`, `tarefas-derivadas.ts`
- Depends on: bibliotecas npm puras (`date-fns`, `clsx`, `tailwind-merge`, `@supabase/supabase-js`)
- Used by: hooks, components, pages
- Purpose: Postgres schema + RLS + RPCs + Edge Functions
- Location: `supabase/migrations/001..032_*.sql`, `supabase/functions/<fn>/index.ts`
- Used by: client via REST/RPC (PostgREST) e auth
## Data Flow
### Primary Request Path (CRM — listar leads no Kanban)
### Auth Flow
### Lead Pipeline / Drag-and-Drop
### Diagnostic Flow
### Client / Contract Flow
### ICP Dinâmico Flow
### Lead Trash / Lixeira Flow
### Portal de Indicações (Tokens)
- **Server state:** TanStack Query (`QueryClient` em `src/main.tsx:10-17`, defaults `staleTime=60s`, `retry=1`). Chaves centralizadas em `src/lib/query-keys.ts`. `useMeuPerfil` usa `staleTime:0` + `gcTime:0` para evitar bleed entre sessões.
- **UI local:** `useState`/`useReducer` por componente. Sem store global.
- **URL state:** filtros bookmarkable via `useSearchParams` em `LeadsPage` e `IcpDinamicoPage`.
- **Theme:** Context (`src/contexts/ThemeContext.tsx`) com persistência em `localStorage`.
## Key Abstractions
- Purpose: shell autenticado do CRM com guarda de sessão e redirecionamento de cliente
- Examples: `src/components/layout/AppLayout.tsx`
- Pattern: route layout (`<Outlet />`) + guarda imperativa no `useEffect`
- Purpose: shell do Portal de Indicações com header de saldo/nível e dropdown que permite ao interno voltar para o CRM
- Examples: `src/pages/portal/PortalLayout.tsx`
- Pattern: idem `AppLayout`, mas com guarda mais permissiva (qualquer sessão válida)
- Purpose: permitir ao mesmo usuário interno acessar tanto o CRM quanto o Portal sem deslogar; impedir cliente de ver o CRM
- Examples: dropdown do `Sidebar.tsx:161-204` (Meu Espaço / Portal / Sair) e header do `PortalLayout.tsx:97-143` (Ir para o CRM / Sair); seletor de portal no `LoginPage.tsx:131-162`
- Pattern: leitura de `perfis.tipo` (`interno`/`cliente`) decide destino; `destinoParaPerfil()` em `LoginPage.tsx:14-24`
- Purpose: avaliar se um lead bate com o perfil ideal — observado dos ganhos do ano OU configurado em `DEFAULT_SERVICOS`
- Examples: `src/lib/icp-dinamico.ts`, `src/hooks/useIcpFit.ts`, badge no `src/components/leads/LeadCard.tsx`, página dedicada `src/pages/IcpDinamicoPage.tsx`
- Pattern: função pura testável (`calcularIcpDinamico`, `buildIcpFitContext`, `isLeadIcpFit`) + hook fino que memoiza com base em `useLeads`+`useConfiguracoes`
- Purpose: deletar lead sem perda — snapshot completo + restauração por coordenador+
- Examples: `useDeleteLead` / `useLeadsLixeira` / `useRestaurarLead` em `src/hooks/useLeads.ts`; RPCs em `supabase/migrations/032_lixeira_leads.sql`; UI na `AuditoriaPage` / `ConfiguracoesPage`
- Pattern: RPC `SECURITY DEFINER` no Postgres serializa em JSONB; tabela `leads_lixeira` sem FK pro `leads.id` (o lead já foi apagado)
- Purpose: hierarquia `consultor` < `coordenador` < `gerente` < `diretor`
- Examples: `src/hooks/useCurrentRole.ts` (expõe `isDiretor`, `isGerenteOrAcima`, `atLeast(min)`), `src/components/shared/RequireRole.tsx` (wrapper de UI)
- Pattern: ranking numérico (`ROLE_RANK`); RLS no Postgres replica a mesma hierarquia (ver `supabase/migrations/029_rls_role_aware.sql`)
- Purpose: capturar erros de render para evitar tela branca
- Examples: `src/components/ErrorBoundary.tsx`
- Pattern: classe React clássica (`getDerivedStateFromError` + `componentDidCatch`), montada no topo da árvore em `main.tsx:21`
- Purpose: única fonte de verdade para chaves do TanStack Query (evita typos e invalidações que erram)
- Examples: `src/lib/query-keys.ts`
- Pattern: objeto `QUERY_KEYS` com chaves `as const` (tipos literais preservados)
- Purpose: padronizar filtro por responsável nas listagens
- Examples: `src/components/shared/ScopeToggle.tsx`; usado em `LeadsPage`, `ClientesPage`, `ContratosPage`, `MeEspacoPage`
- Pattern: `value: 'mine' | 'all'` + contadores opcionais
- Purpose: filtro de período canônico (ano + total/T1-T4/S1-S2)
- Examples: `src/components/shared/PeriodSelector.tsx`, lógica em `src/lib/periods.ts`
- Pattern: `PeriodValue = { year, granularity }` + helpers `getPeriodRange`, `isInRange`, `isCurrentCycle`
## Entry Points
- Location: `index.html`
- Triggers: requisição inicial do browser; Vite injeta o script de dev/build
- Responsibilities: declara `<div id="root">` e carrega `/src/main.tsx`
- Location: `src/main.tsx`
- Triggers: importado por `index.html`
- Responsibilities: instancia `QueryClient`, monta `StrictMode → ErrorBoundary → ThemeProvider → QueryClientProvider → RouterProvider` em `document.getElementById('root')`
- Location: `src/router.tsx`
- Triggers: passado ao `<RouterProvider>` em `main.tsx`
- Responsibilities: define toda a árvore de rotas (público, CRM, Portal, catch-all)
- Location: `src/App.tsx`
- Triggers: nenhum no momento (arquivo só exporta `{}` — `main.tsx` usa diretamente o router); mantido como placeholder
- Responsibilities: nenhuma — não importar deste arquivo
- `supabase/functions/notify-indicacao/index.ts` — webhook chamado por triggers/cron para notificar Slack sobre nova indicação
- `supabase/functions/notify-renovacao/index.ts` — alerta de renovação (cron em `supabase/migrations/031_cron_renovacoes.sql`)
- `supabase/functions/notify-tarefa/index.ts` — notificação de tarefa
- `supabase/functions/slack-commands/index.ts` — handler de slash commands do Slack
- `supabase/functions/slack-proxy/index.ts` — proxy CORS-safe pro Slack (espelhado em `api/slack-proxy.ts` para Vercel)
## Architectural Constraints
- **Threading:** browser single-threaded (event loop). Sem workers.
- **Global state:** singleton do `supabase` client em `src/lib/supabase.ts:19`; `QueryClient` único em `src/main.tsx:10`; `localStorage` para tema, dica do kanban (`consej_kanban_hint`).
- **Sem camada de API própria:** browser fala direto com Supabase. Toda autorização vive em RLS + RPCs `SECURITY DEFINER`. Mutações privilegiadas (excluir lead, restaurar lead, solicitar resgate) DEVEM ser RPCs, não inserts/updates diretos.
- **Configurações em linha única:** registro `configuracoes` único (`id='default'`) hospeda catálogo de serviços (`servicos`), metas, configs de mensagens — ler/escrever sempre via `useConfiguracoes`.
- **Tipos centralizados:** todos os tipos de domínio vivem em `src/types/index.ts`. Não duplicar interfaces de domínio em outros arquivos.
- **Migrações sequenciais e imutáveis:** arquivos `supabase/migrations/NNN_*.sql` (001 → 032). Migrações antigas não são editadas; corrigir = nova migração.
- **Env vars obrigatórias:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — ausência lança erro no boot (`src/lib/supabase.ts:8-17`). Falha cedo, não silenciosa.
- **Circular imports:** nenhuma detectada. `hooks` importam `lib`; `lib` não importa `hooks`.
## Anti-Patterns
### Mutation direta para operações com cascata/auditoria
### Definir query key inline
### Duplicar tipos de domínio
### Ler `perfis.tipo` direto na página em vez de usar guards de layout
### Filtros de listagem só em `useState`
## Error Handling
- Boot: `src/lib/supabase.ts:8-17` lança `Error` claro se faltar env var.
- Render: `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) renderiza fallback com botão "Recarregar".
- Mutations: padrão é `onError: () => toast.error('...')` e `onSuccess: () => toast.success('...')` (ver qualquer hook em `src/hooks/`).
- RPCs com mensagens: quando o erro vem da RPC com `RAISE EXCEPTION`, repassar a mensagem original — `onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro...')` (ver `useDeleteLead`, `useRestaurarLead`).
- Optimistic updates: `onError` faz rollback do cache via `context.previous` (ver `useUpdateLeadStatus` em `src/hooks/useLeads.ts:85-96`).
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
