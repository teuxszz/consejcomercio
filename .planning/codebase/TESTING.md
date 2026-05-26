# Testing Patterns

**Analysis Date:** 2026-05-26

## Test Framework

**Runner:**
- **Vitest 3.2.4** (`vitest` + `@vitest/coverage-v8`) — unit + integration
- **Playwright 1.60** (`@playwright/test`) — E2E
- Config: `vitest.config.ts`, `playwright.config.ts`
- Setup: `vitest.setup.ts` registers `@testing-library/jest-dom/vitest` matchers globally

**Assertion / DOM Library:**
- `@testing-library/react` 16.3 (render, screen, renderHook, waitFor)
- `@testing-library/jest-dom` 6.9 (toBeInTheDocument, toBeDisabled, etc.)
- `@testing-library/user-event` 14.6 (await `userEvent.click(...)`)
- `@testing-library/dom` 10.4 (transitive base)
- `jsdom` 25 as the DOM environment for Vitest

**Run Commands** (from `package.json:11-15`):
```bash
npm run test          # vitest run  — single pass, used in CI / pre-commit
npm run test:watch    # vitest      — watch mode for TDD
npm run test:cov      # vitest run --coverage  — v8 provider
npm run test:e2e      # playwright test
npm run test:rls      # vitest run --dir tests/rls   — RLS suite only (skip if .env.test missing)
```

There is no shorthand for "run a single file" — use Vitest's filter: `npm run test -- src/lib/__tests__/icp-dinamico.test.ts` or `npm run test:watch -- -t "useDeleteLead"`.

## Test File Organization

**Vitest layout:** co-located under a `__tests__/` sibling directory, mirroring the module name. The Vitest config explicitly globs `src/**/*.test.{ts,tsx}` and `tests/rls/**/*.test.ts` (`vitest.config.ts:17`):

```
src/
├── lib/
│   ├── icp-dinamico.ts
│   ├── periods.ts
│   ├── projecao.ts
│   ├── utils.ts
│   └── __tests__/
│       ├── icp-dinamico.test.ts
│       ├── periods.test.ts
│       ├── projecao.test.ts
│       └── utils.test.ts
├── hooks/
│   ├── useLeads.ts
│   └── __tests__/
│       ├── useCurrentRole.test.ts
│       ├── useLeads.test.tsx
│       └── useObjecoes.test.tsx
└── components/
    ├── ErrorBoundary.tsx
    └── __tests__/
        ├── DeleteConfirmDialog.test.tsx
        ├── ErrorBoundary.test.tsx
        ├── PeriodSelector.test.tsx
        └── ResponsavelBadge.test.tsx
```

**Playwright + RLS layout:** top-level `tests/` directory:
```
tests/
├── e2e/
│   ├── global-setup.ts        # logs in QA users, saves storageState
│   ├── smoke.spec.ts          # READ-ONLY route walk
│   └── lead-exclusao.spec.ts  # round-trip excluir → lixeira → restaurar
└── rls/
    └── rls-role-aware.test.ts # runs in vitest, real Supabase JWT per role
```

**Naming:**
- Unit/component: `<module>.test.{ts,tsx}` — `.tsx` only when the test renders JSX (component tests, hook tests that wrap with providers)
- E2E specs: `<feature>.spec.ts` (Playwright convention)
- Suites use `describe('moduleOrFunction', ...)` and tests use PT-BR `it('descrição do comportamento', ...)`

## Test Structure

**Imports always explicit** even though Vitest globals are wired via `tsconfig.app.json:8` types:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
```

**Suite pattern (pure unit — `src/lib/__tests__/periods.test.ts`):**
```ts
describe('getYearRange', () => {
  it('cobre o ano civil inteiro (jan 1 → dez 31)', () => {
    const r = getYearRange(2025)
    expect(r.from.getMonth()).toBe(0)
    expect(r.to.getMonth()).toBe(11)
  })
})
```

**Suite pattern (hook test — `src/hooks/__tests__/useObjecoes.test.tsx`):**
```ts
let objecoesResp: MockResponse = { data: [], error: null }
vi.mock('@/lib/supabase', () => ({
  supabase: {
    get from() { return createSupabaseMock({ from: { objecoes: objecoesResp } }).from },
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { useObjecoes } from '../useObjecoes'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useObjecoes', () => {
  beforeEach(() => { objecoesResp = { data: [], error: null }; vi.clearAllMocks() })

  it('query resolve a lista de objeções', async () => {
    objecoesResp = { data: SAMPLE, error: null }
    const { result } = renderHook(() => useObjecoes(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
  })
})
```

**Suite pattern (component — `src/components/__tests__/DeleteConfirmDialog.test.tsx`):**
```ts
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('DeleteConfirmDialog', () => {
  beforeEach(() => { rpcResponse = { data: {}, error: null }; vi.clearAllMocks() })

  it('chama onConfirm ao clicar em Excluir', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<DeleteConfirmDialog {...baseProps} onConfirm={onConfirm} />)
    const btn = await screen.findByRole('button', { name: /excluir/i })
    await userEvent.click(btn)
    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce())
  })
})
```

**Conventions:**
- `beforeEach` resets module-level mock state + `vi.clearAllMocks()` to prevent leakage between tests
- `afterEach(() => vi.restoreAllMocks())` only when you spied on real globals — see `src/components/__tests__/ErrorBoundary.test.tsx:10`
- Prefer `screen.findByRole` (auto-awaits) over `getByRole + waitFor` when the element appears asynchronously
- Use `getByRole({ name: /regex/i })` for case-insensitive PT-BR matches

## Mocking

**Framework:** `vi.mock()` + `vi.fn()` (Vitest built-ins, no separate mocking library).

**Supabase mock helper:** the project ships its own chainable mock at `src/test/supabase-mock.ts`:
```ts
import { createSupabaseMock, type MockResponse } from '@/test/supabase-mock'

let objecoesResp: MockResponse = { data: [], error: null }

vi.mock('@/lib/supabase', () => ({
  supabase: {
    get from() {
      return createSupabaseMock({ from: { objecoes: objecoesResp } }).from
    },
  },
}))
```

How it works:
- Every PostgREST chain method (`select/insert/update/delete/upsert/eq/neq/gt/gte/lt/lte/in/is/not/order/limit/range/filter/or/returns`) returns the same builder so chaining works.
- The builder is **thenable** (`builder.then = resolve => resolve(response)`) — awaiting it resolves the configured `{ data, error }`.
- `.single()` and `.maybeSingle()` resolve directly.
- `rpc` and `auth` (`getUser`, `signInWithPassword`, `signOut`) are also mocked.
- Configure responses per-table or per-RPC: `createSupabaseMock({ from: { leads: {...} }, rpc: { excluir_lead: {...} } })`.

**Two-mock idiom** (sit alongside Supabase mock in every hook test): always mock `sonner` to silence toasts and let you assert on them:
```ts
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
```

**Mocking dependent hooks** (avoids deep mount): mock the inner hook module directly — see `src/hooks/__tests__/useCurrentRole.test.ts:7`:
```ts
const mockMeuPerfil = vi.fn()
vi.mock('../usePerfis', () => ({ useMeuPerfil: () => mockMeuPerfil() }))
```
Then drive it per-test with `mockMeuPerfil.mockReturnValue({ data: perfil, isLoading: false })`.

**What to mock:**
- `@/lib/supabase` — always, via `createSupabaseMock`
- `sonner` — always when the code under test calls `toast.*`
- Sibling hooks the SUT depends on, when you want to isolate role/permission logic from data fetching
- `console.error` — only when intentionally triggering React's error boundary (`vi.spyOn(console, 'error').mockImplementation(() => {})`)

**What NOT to mock:**
- TanStack Query itself — wrap with a real `QueryClient` (retry off) instead
- `cn()`, `formatCurrency`, `getPeriodRange`, etc. — pure utilities should be exercised, not mocked
- React Router — use `MemoryRouter` from `src/test/render-utils.tsx` if the component needs routing

## Test Utilities

**`src/test/render-utils.tsx`** — wraps a component with `QueryClientProvider` (retry-free, gcTime 0) and `MemoryRouter`:
```ts
const { queryClient } = renderWithProviders(<LeadsPage />, { route: '/leads?status=ganho' })
```

**`src/test/supabase-mock.ts`** — the chainable Supabase builder mock described above.

**`src/test/vitest-env.d.ts`** — re-imports `@testing-library/jest-dom/vitest` to register the matchers on Vitest's `Assertion` type.

## Fixtures and Factories

**No shared fixtures directory.** Each test file declares inline sample data — see `SAMPLE` in `src/hooks/__tests__/useObjecoes.test.tsx:30`, `PERFIS` in `src/components/__tests__/ResponsavelBadge.test.tsx:5`.

**Factory functions when shape repeats** — `src/lib/__tests__/icp-dinamico.test.ts:13-26` declares `lead()`, `ganho()`, `perda()` helpers; `src/hooks/__tests__/useCurrentRole.test.ts:13` uses `comRole()` to mount with different roles.

**Date-sensitive tests pin "today"** by passing it as a parameter rather than mocking `Date.now()` — see `src/lib/__tests__/projecao.test.ts:5`:
```ts
const TODAY = new Date(2025, 5, 15)
const p = calcularProjecaoMensal(leads, { today: TODAY, lookbackMonths: 3 })
```
This means production utilities accept an injectable `today` option specifically to keep tests deterministic.

## Coverage

**Provider:** v8 (`@vitest/coverage-v8`), configured in `vitest.config.ts:18-21`.

**Scope:** coverage is collected only for the testable core:
```ts
coverage: {
  provider: 'v8',
  include: ['src/lib/**', 'src/hooks/**', 'src/components/shared/**'],
}
```
Pages, feature-specific components (`src/components/leads/`, `src/components/dashboard/`, etc.), and shadcn/ui primitives are intentionally excluded.

**No enforced threshold.** Run `npm run test:cov` to view the report.

## What's Tested vs Untested

**Tested (well-covered):**
- Pure domain logic in `src/lib/`: ICP dinamico engine, period/range math, monthly projection scenarios, utils (cn, formatters, DDD→UF)
- Permission helpers: `useCurrentRole` covers all 4 roles + null + isLoading
- Lead lifecycle hooks: `useDeleteLead`, `useLeadsLixeira`, `useRestaurarLead` (RPC happy/error paths)
- Objecoes CRUD hooks
- Critical shared components: `ErrorBoundary` (renders children + catches errors), `DeleteConfirmDialog` (impact preview + bloqueio + cancel), `ResponsavelBadge`, `PeriodSelector`
- RLS role-aware policies: `tests/rls/rls-role-aware.test.ts` validates diretor vs consultor visibility on `leads`, `clientes`, `contratos` plus WITH CHECK on insert with a foreign `responsavel_id`
- E2E smoke: 27 routes walked as both `diretor` and `consultor`, asserting no console errors, no Supabase 4xx/5xx, body not empty
- E2E feature: full round-trip of lead exclusion → lixeira → restoration

**Not tested / gaps (potential future phases — confirm before treating as authoritative):**
- Most page components (`src/pages/*.tsx`) — only smoke-tested by Playwright
- Most feature folders (`src/components/{leads,clientes,contratos,demandas,reunioes,...}/`) — no Vitest specs
- Most hooks: `useClientes`, `useContratos`, `useDemandas`, `useDiagnostico`, `useIndicacoes`, `useOportunidades`, `useParceiros`, `usePerfis`, `usePortal`, `useReunioes`, `useTarefas`, etc. — no dedicated test files
- Form validation paths — `NewLeadModal` (the only rhf+zod form) has no test
- `src/contexts/ThemeContext.tsx` — no test
- Onboarding wizard (`src/components/onboarding/`)

When adding tests in these areas, follow the patterns from `useObjecoes.test.tsx` (hooks) and `DeleteConfirmDialog.test.tsx` (components).

## E2E (Playwright)

**Config:** `playwright.config.ts`
- `testDir: './tests/e2e'`, fully parallel, 30s timeout, 10s expect timeout, no retries
- Reporters: `list` + `html` (saved, never auto-opened)
- `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`
- Auto-starts the dev server (`npm run dev`) if not running, on `http://localhost:5173`
- **Two projects**, both using `Desktop Chrome`:
  - `diretor` — `storageState: tests/e2e/.auth/diretor.json`
  - `consultor` — `storageState: tests/e2e/.auth/consultor.json`

**Global setup:** `tests/e2e/global-setup.ts` logs each QA role into the live app via the `/login` form, saves the storage state, and reuses it across all specs. Requires `.env.test` with `QA_DIRETOR_EMAIL/PASSWORD` and `QA_CONSULTOR_EMAIL/PASSWORD`.

**Env loading:** both `playwright.config.ts:11-17` and `tests/e2e/lead-exclusao.spec.ts:12-20` ship their own zero-dependency `.env.test` parser (no `dotenv` package) — preserve this pattern if you add new E2E files.

**Conventions in specs:**
- Locate by role + accessible name with PT-BR regex: `page.getByRole('button', { name: /excluir lead/i })`
- Wait on `waitUntil: 'networkidle'` after navigation, then `await page.waitForTimeout(800)` if you also need queued queries to settle
- Always include a `test.afterAll` cleanup that removes any data created in `test.beforeAll` (see `tests/e2e/lead-exclusao.spec.ts:77-98`)
- Console-error filtering: maintain an `IGNORAR_CONSOLE` regex list for known-benign noise (Vite HMR, React DevTools nag, favicon 404)

## RLS Suite (vitest, real Supabase)

`tests/rls/rls-role-aware.test.ts` is the one place where Vitest hits a live Supabase project (not the mock). Both `tests/rls/**` and `src/**/*.test.tsx` share the same `vitest.config.ts` — separated only by the `npm run test:rls` filter when you want to run them alone.

Key pattern: `describe.skipIf(!configurado)('...')` (`tests/rls/rls-role-aware.test.ts:41`) so the suite **silently passes** in dev / CI without `.env.test`, but **runs for real** when QA credentials are present.

## CI Config

**None currently in repo.** No `.github/workflows/` directory exists (verified 2026-05-26). Deployment is on Vercel via `vercel.json`. There is no automated test gate before deploy — tests must be run locally with `npm run test` / `npm run test:e2e` before pushing.

Adding CI: a `.github/workflows/test.yml` that runs `npm ci && npm run lint && npm run test` on push/PR would be a low-friction first step. E2E + RLS suites need secrets (`QA_*`, `VITE_SUPABASE_*`) and a reachable Supabase, so they'd belong in a separate optional job.

## Common Patterns

**Async testing:**
```ts
// renderHook → wait for query
const { result } = renderHook(() => useLeads(), { wrapper })
await waitFor(() => expect(result.current.isSuccess).toBe(true))

// component → find element that appears after async work
const btn = await screen.findByRole('button', { name: /excluir/i })
```

**Error testing:**
```ts
// expect a mutation to reject
await expect(result.current.mutateAsync('id')).rejects.toBeTruthy()

// expect a query to surface error state
objecoesResp = { data: null, error: { message: 'RLS negou acesso' } }
await waitFor(() => expect(result.current.isError).toBe(true))
```

**Silencing expected console errors** (React boundary tests):
```ts
afterEach(() => vi.restoreAllMocks())
it('mostra fallback', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<ErrorBoundary><Boom /></ErrorBoundary>)
  ...
})
```

**Conditional run based on env:**
```ts
const configurado = !!(URL && ANON && QA.diretorEmail && QA.diretorPass)
describe.skipIf(!configurado)('RLS role-aware', () => { ... })
describe.skipIf(configurado)('RLS role-aware — PULADO', () => { ... })
```

---

*Testing analysis: 2026-05-26*
