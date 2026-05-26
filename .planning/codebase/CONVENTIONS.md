# Coding Conventions

**Analysis Date:** 2026-05-26

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` — e.g. `KanbanBoard.tsx`, `NewLeadModal.tsx`, `ErrorBoundary.tsx`
- shadcn/ui primitives: `kebab-case.tsx` (lowercase) — e.g. `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/dropdown-menu.tsx`
- Hooks: `useXxx.ts` (or `.tsx` when JSX is needed in tests) — e.g. `src/hooks/useLeads.ts`, `src/hooks/useCurrentRole.ts`
- Pages: `XxxPage.tsx` — e.g. `src/pages/LeadsPage.tsx`, `src/pages/DashboardPage.tsx`
- Libs / pure modules: `kebab-case.ts` — e.g. `src/lib/icp-dinamico.ts`, `src/lib/query-keys.ts`, `src/lib/diagnostic-questions.ts`
- Tests: co-located in `__tests__/` siblings, mirror the module name with `.test.{ts,tsx}` suffix — e.g. `src/hooks/__tests__/useLeads.test.tsx`, `src/lib/__tests__/icp-dinamico.test.ts`

**Functions:**
- camelCase. Exported helpers are descriptive verbs: `calcularIcpDinamico`, `getPeriodRange`, `formatCurrency`, `buildIcpFitContext`
- Hooks always start with `use` (lint rule `react-hooks/recommended` enforces this)
- Mutation hooks use `useCreateXxx` / `useUpdateXxx` / `useDeleteXxx` (`src/hooks/useLeads.ts:21,53,118`, `src/hooks/useObjecoes.ts:22,38,59`)
- Event handlers in components: `handleXxx` (`handleLogin`, `handleConfirm`, `handleReload`)
- Mixed PT-BR / EN allowed at function level: domain verbs in PT-BR (`comRole`, `destinoParaPerfil`), generic verbs in EN (`getInitials`, `makeBuilder`)

**Variables:**
- camelCase for locals (`responsavelId`, `filteredLeads`, `selectedPerfil`)
- SCREAMING_SNAKE_CASE for module-level constants (`PIPELINE_STAGES`, `TERMINAL_WON_STAGES`, `LEAD_SOURCES`, `QUERY_KEYS`, `STAGE_COLORS`) in `src/lib/constants.ts` and `src/lib/query-keys.ts`
- Domain names stay in PT-BR (`leads`, `contratos`, `perfis`, `objecoes`, `parceiros`, `oportunidades`) to match the Supabase schema

**Types:**
- PascalCase, exported via `interface` (preferred for object shapes — see `src/types/index.ts:1`) or `type` (for unions/aliases — `type Theme = 'dark' | 'light'`, `type RoleConsej = 'diretor' | 'gerente' | 'coordenador' | 'consultor'`)
- Component prop interfaces are local and called `Props` (`src/components/ErrorBoundary.tsx:3`, `src/components/shared/RequireRole.tsx:6`, `src/components/leads/NewLeadModal.tsx:32`)
- Discriminator literal types — `EntidadeTipo`, `Scope`, `PeriodValue` — exported alongside the component/hook that owns them

## Code Style

**Formatting:**
- No Prettier config in the repo. Two-space indent, single quotes, no semicolons in most files (e.g. `src/hooks/useLeads.ts`, `src/lib/utils.ts`).
- shadcn/ui primitives keep their upstream double-quote style (`src/components/ui/button.tsx`); do not reformat them.

**Linting:**
- Flat config at `eslint.config.js`. Extends:
  - `@eslint/js` recommended
  - `typescript-eslint` recommended
  - `eslint-plugin-react-hooks` flat recommended (enforces rules of hooks + exhaustive deps)
  - `eslint-plugin-react-refresh` (Vite preset)
- Globally ignores `dist/`. Browser globals enabled.
- Run with `npm run lint` (`eslint .`).
- Pragmas seen in the codebase to silence `react-hooks/exhaustive-deps` for intentional one-shot effects: `// eslint-disable-next-line react-hooks/exhaustive-deps` (`src/components/leads/NewLeadModal.tsx:65,79`).

## TypeScript

**Strict mode:** ON for both `tsconfig.app.json` and `tsconfig.node.json` (`"strict": true`).
- App config relaxes `noUnusedLocals`/`noUnusedParameters` to `false` so WIP code doesn’t block compilation; the Node config keeps them strict.
- `noFallthroughCasesInSwitch: true`, `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`.
- `jsx: "react-jsx"`, `moduleResolution: "bundler"`, `target/lib: ES2023`.
- Vitest globals are wired via `"types": ["vite/client", "vitest/globals"]` — `describe/it/expect/vi` are available without imports inside `src/`, though every existing test imports them explicitly anyway.

**Path aliases:** `@/*` → `./src/*`.
- Declared in `tsconfig.app.json:21-23` and mirrored in `vite.config.ts:7-11` and `vitest.config.ts:9-11`. Always use `@/...` for cross-folder imports; relative `../` is reserved for siblings inside the same feature directory (`src/components/__tests__/DeleteConfirmDialog.test.tsx:15` → `../shared/DeleteConfirmDialog`).

**Verbatim module syntax:** type-only imports must use `import type` — already followed throughout (`import type { Lead } from '@/types'`, `import { type ClassValue, clsx } from 'clsx'`).

## Import Organization

Observed order (no enforced auto-sort, but consistently applied — see `src/pages/DashboardPage.tsx:1-18`, `src/components/leads/NewLeadModal.tsx:1-16`):

1. React + framework: `react`, `react-dom`, `react-router-dom`
2. Third-party libs: `@tanstack/react-query`, `react-hook-form`, `zod`, `date-fns`, `recharts`, `lucide-react`, `sonner`, `@dnd-kit/*`, `@radix-ui/*`
3. Internal absolute (`@/`): hooks → lib → components → types
4. Sibling relative (`./`, `../`) at the end

Type-only imports use `import type` (`import type { Lead } from '@/types'`, `import type { ReactNode } from 'react'`).

## Forms

**Stack policy:** `react-hook-form` + `zod` via `@hookform/resolvers/zod` is the **preferred** pattern but is currently used in **only one place**:

- `src/components/leads/NewLeadModal.tsx:18-46` — declares a `z.object({...})` schema, derives `type FormData = z.infer<typeof schema>`, wires with `useForm<FormData>({ resolver: zodResolver(schema) })`, surfaces `errors.<field>.message` under inputs (`text-xs text-red-500`).

Every other form in the app uses **plain `useState` per field** + manual handlers. Examples:
- `src/components/leads/ConvertToClientModal.tsx:25-31`
- `src/components/leads/LostReasonModal.tsx`
- `src/components/leads/ConfirmSendModal.tsx`
- `src/pages/LoginPage.tsx:30-32`

**Rule for new code:** New forms should follow the `NewLeadModal` pattern (rhf + zod) — that’s the user’s stated preference and matches the project skills. Avoid the controlled-state approach unless the form has ≤ 2 fields.

**Validation idioms in zod schemas:**
- `z.string().min(2, 'Nome obrigatório')` — custom PT-BR error messages
- `z.string().email().optional().or(z.literal(''))` for optional emails that may be sent as an empty string by the input
- Convert `''` to `null` at submit (`email: data.email || null`)

## Data Fetching (TanStack Query)

**Provider:** single `QueryClient` in `src/main.tsx:10-17` with defaults `staleTime: 60_000`, `retry: 1`. Test client overrides to `retry: false`, `gcTime: 0` (`src/test/render-utils.tsx:7-14`).

**Query key conventions:** centralised in `src/lib/query-keys.ts` as a nested object literal. Always use `QUERY_KEYS.entity.scope` rather than ad-hoc string arrays. Hierarchical pattern: `['leads']`, `['leads', id]`, `['leads', 'stage', stageId]`, `['contratos', 'cliente', clienteId]`.

**Hook shape (read):**
```ts
// src/hooks/useLeads.ts:7
export function useLeads() {
  return useQuery({
    queryKey: QUERY_KEYS.leads.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, diagnostico:diagnosticos(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Lead[]
    },
  })
}
```

**Hook shape (mutation):**
```ts
// src/hooks/useObjecoes.ts:22
export function useCreateObjecao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const { data, error } = await supabase.from('objecoes').insert(input).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.objecoes.all })
      toast.success('Objeção adicionada')
    },
    onError: (e: Error) => toast.error(`Erro ao adicionar: ${e.message}`),
  })
}
```

**Optimistic updates:** present in `useUpdateLeadStatus` (`src/hooks/useLeads.ts:70-116`) using `onMutate` → snapshot via `getQueryData` → `setQueryData` → restore in `onError` → re-fetch in `onSettled`. Use this pattern for drag-and-drop / kanban-style mutations where instant feedback matters.

**Conditional queries:** use `enabled: !!id` to defer until a parameter exists (`src/hooks/useClientes.ts:33`).

**Per-user freshness:** `useMeuPerfil` uses `staleTime: 0` + `gcTime: 0` to prevent cross-session cache bleed after the account switcher logs in as a different user (`src/hooks/usePerfis.ts:38-41`).

**Cache reset on logout:** `AppLayout` clears the entire QueryClient inside `onAuthStateChange` when `SIGNED_OUT` fires (`src/components/layout/AppLayout.tsx:35-42`). Never leave per-user data in cache between sessions.

## Supabase Wrappers

**Client init:** single shared client from `src/lib/supabase.ts:19`. Fail-fast: missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` throws at import time with a PT-BR message — never wrap this in `try/catch` to mask it.

**Query pattern:** `.from('table').select(...).filter().order()`, always destructure `{ data, error }`, `throw error` if non-null, then cast with `as Type[]`.

**Joins:** PostgREST embed syntax with alias when needed:
- `select('*, diagnostico:diagnosticos(*)')` (`src/hooks/useLeads.ts:13`)
- `select('*, contratos(*), indicado_por_cliente:indicado_por_cliente_id(id,nome,empresa)')` (`src/hooks/useClientes.ts:13`)

**RPC for complex ops:** server-side functions for multi-table writes — `supabase.rpc('excluir_lead', { p_id })`, `supabase.rpc('restaurar_lead', { p_lixeira_id })`, `supabase.rpc('inspecionar_exclusao', { p_entidade_tipo, p_id })`. All RPC names are snake_case and prefix params with `p_`.

**Audit logging:** mutations that change important state insert into `audit_logs` from the client (`src/hooks/useLeads.ts:46,105`, `src/hooks/useClientes.ts:69`). This is fire-and-forget — do not await it on the critical path.

**Auth helpers:** `supabase.auth.getUser()`, `supabase.auth.getSession()`, `supabase.auth.signInWithPassword({ email, password })`, `supabase.auth.signOut()`, `supabase.auth.onAuthStateChange(cb)`. Storage uploads use `supabase.storage.from('avatars').upload(path, file, { upsert: true })` (`src/hooks/usePerfis.ts:82`).

## Error Handling

**Global render boundary:** `src/components/ErrorBoundary.tsx` wraps the entire tree in `src/main.tsx:21-27` (outside `ThemeProvider` and `QueryClientProvider` so even provider crashes are caught). Fallback UI is inline-styled (no Tailwind) so it works even if CSS fails to load.

**Per-mutation feedback:** every mutation uses `sonner` toasts in `onSuccess` / `onError`. Standard messages:
- Success: PT-BR action confirmation (`'Lead criado com sucesso!'`, `'NPS atualizado!'`)
- Error: short PT-BR description (`'Erro ao mover lead'`). For RPC errors that carry a user-facing message, surface it: `e instanceof Error ? e.message : 'Erro ao remover lead'` (`src/hooks/useLeads.ts:131-132`).

**Async inside `useEffect`:** never make the effect itself async. Wrap in an IIFE and prefix with `void`:
```ts
// src/components/shared/DeleteConfirmDialog.tsx:55
void (async () => {
  const { data, error } = await supabase.rpc(...)
  ...
})()
```

**Supabase query builders are PromiseLike, not Promise:** the comment in `DeleteConfirmDialog.tsx:53` warns against `.finally()` on builder chains — use `await` + `try/finally`.

**Throw-then-toast pattern:** `mutationFn` throws on Supabase error; the hook’s `onError` translates the throw into a toast. Components don’t need their own try/catch around `mutateAsync` unless they need to chain additional UI state (e.g. `DeleteConfirmDialog.handleConfirm` uses try/finally only for the `setConfirming` flag).

## Auth & Role Gating

**Route protection:** `AppLayout` (`src/components/layout/AppLayout.tsx:16-45`) checks `getSession()` on mount, redirects to `/login` if unauthenticated, and to `/portal` if `perfil.tipo === 'cliente'` (client accounts cannot reach the CRM).

**Role-aware UI:** use `useCurrentRole()` (`src/hooks/useCurrentRole.ts:22`) — exposes booleans (`isDiretor`, `isGerenteOrAcima`, `isCoordenadorOrAcima`) and helpers `hasRole(roles)` / `atLeast(min)`. Role hierarchy: `diretor (4) > gerente (3) > coordenador (2) > consultor (1)`.

**Declarative gating:** wrap restricted blocks with `<RequireRole atLeast="gerente">...</RequireRole>` or `<RequireRole roles={['diretor']}>` (`src/components/shared/RequireRole.tsx`). The component renders a loading state, an "Acesso restrito" fallback, or a custom `fallback` prop.

**Server-side enforcement:** Supabase RLS policies are the source of truth — role checks in React are a UX layer only. The `RequireRole` fallback exists because RLS will silently return empty rows otherwise.

## Theming / Dark Mode

**Default theme:** dark. Toggle via `ThemeContext` (`src/contexts/ThemeContext.tsx`) — sets `html.light` class and persists choice in `localStorage` under key `'theme'`.

**Tailwind config:** `darkMode: ["class"]` (`tailwind.config.js:7`). Semantic color tokens are CSS variables declared in `src/index.css:5-100`:
- `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`
- Chart palette: `--chart-1` through `--chart-5`
- Custom alphas for translucent surfaces: `--alpha-bg-xs/sm/md/lg`, `--alpha-border`, `--alpha-border-md`
- Brand semantic alphas: `--emerald-hi/mid/lo`, `--amber-hi/mid/lo`, `--cyan-hi/mid/lo`, `--red-hi`
- Sidebar tokens are pinned to dark and not overridden in `html.light`

**Class composition:** always use `cn(...)` from `@/lib/utils` — wraps `clsx` + `tailwind-merge` to dedupe conflicting Tailwind classes. Example: `cn('px-2', 'px-4')` → `'px-4'`.

**Variant styling:** shadcn/ui components use `class-variance-authority` (`src/components/ui/button.tsx:6-30`). New variants belong inside `cva(...)` blocks, not as ad-hoc class strings.

## Logging

**Framework:** plain `console.*`. Only the global ErrorBoundary logs from the app code (`src/components/ErrorBoundary.tsx:22` — `console.error('[ErrorBoundary] ...')`). No telemetry SDK is wired.

**User-facing notifications:** `sonner` `toast.success / toast.error / toast.info` only — never `alert()`, never silent failure.

**Convention if adding logs:** prefix with bracketed module tag (`'[ErrorBoundary]'`) and prefer `console.error` for failures, `console.warn` for cleanup misses (`tests/e2e/lead-exclusao.spec.ts:91`).

## Comments

**Language:** PT-BR for prose; English allowed when describing third-party behaviour (`// PostgREST embed syntax`, `// Falha cedo e com mensagem clara`).

**When to comment:** non-obvious *why*, not *what*. Common triggers in this codebase:
- Workarounds for upstream quirks — `// thenable: 'await builder' resolve a resposta` (`src/test/supabase-mock.ts:40`)
- Cross-cutting design decisions — `// Para drill-down de "ganho/terminal", o filtro de período passa a usar updated_at ...` (`src/pages/LeadsPage.tsx:66-72`)
- Why an effect is intentionally non-exhaustive — `// eslint-disable-next-line react-hooks/exhaustive-deps`
- ESM/Windows path notes — `// ESM: __dirname não existe — derivar da URL do módulo`

**TSDoc:** only where it documents public hook contracts (`src/hooks/useCurrentRole.ts:16-19`, `src/components/shared/RequireRole.tsx:8-14`).

## Function & Module Design

**Function size:** keep pure utilities ≤ 30 lines (see `src/lib/utils.ts`). Hooks may be larger when they bundle mutation lifecycle (`useUpdateLeadStatus` is ~50 lines).

**Parameters:** prefer a single object argument once you have ≥ 3 params (`renderWithProviders(ui, options)`, `createSupabaseMock(config)`, mutation inputs always take an object).

**Exports:**
- Named exports only — no `export default` in `src/` except for the Tailwind/Vite/Vitest config files which require it.
- Pages, hooks, components: each file exports one primary symbol matching its filename.

**Barrel files:** only `src/types/index.ts` aggregates types. Components and hooks are imported directly from their full path (`@/components/leads/NewLeadModal`, `@/hooks/useLeads`). Don't add new barrels — they break tree-shaking and create circular import risk.

**Module-level constants:** PT-BR domain enums + display labels + colour maps live in `src/lib/constants.ts`. Add new enums there instead of inlining magic strings.

**Adding a new entity:** create paired files
1. `src/hooks/useXxx.ts` — query + mutation hooks
2. Add query key block to `src/lib/query-keys.ts`
3. Add the interface to `src/types/index.ts`
4. Components live in `src/components/xxx/` (PT-BR domain name)
5. Page in `src/pages/XxxPage.tsx`, route in `src/router.tsx`

---

*Convention analysis: 2026-05-26*
