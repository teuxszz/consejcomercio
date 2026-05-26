# Codebase Concerns

**Analysis Date:** 2026-05-26

> Cross-reference: `RELATORIO-TESTES.md` (2026-05-15) catalogued 2 critical, 4 high, 5 medium and 3 low findings. Items already closed there (C1 build, C2 ErrorBoundary, C4 env validation, A2 DeleteConfirmDialog, M4 range duplicado) are **not** repeated below. This document focuses on what is **still open** as of today plus new findings.

---

## Tech Debt

### Duplicated `useAuditLogs` hook — **HIGH**
- Issue: Two files export a hook with the same name `useAuditLogs` but different signatures.
  - `src/hooks/useAuditLog.ts` → `useAuditLogs()` (no args, returns last 200 global audit logs). Used by `src/pages/AuditoriaPage.tsx`.
  - `src/hooks/useAuditLogs.ts` → `useAuditLogs(tabela, registroId)` (scoped to entity). Used by `src/components/shared/ActivityTimeline.tsx`.
- Files: `src/hooks/useAuditLog.ts`, `src/hooks/useAuditLogs.ts`
- Impact: Auto-import will pick whichever the IDE indexed first; importing the wrong one silently breaks (wrong arity ⇒ TS error or runtime empty data). Rename collision is a footgun for every new feature touching audit.
- Fix approach: Merge into a single file `src/hooks/useAuditLogs.ts` with `useAuditLogsGlobal()` and `useAuditLogsForEntity(tabela, registroId)`. Delete `useAuditLog.ts`. Update `AuditoriaPage` import.

### God components: pages with 700+ lines — **MEDIUM**
- Issue: Several page components have grown beyond reasonable size and mix data, transforms and JSX.
- Files (line counts):
  - `src/pages/MensagensPage.tsx` — **1342 lines** (templates table, filters, localStorage prefs, modal, copy logic, classification all in one file)
  - `src/pages/PosJuniorsPage.tsx` — 770 lines
  - `src/pages/ClientesPage.tsx` — 753 lines
  - `src/pages/AnalyticsPage.tsx` — 749 lines
  - `src/pages/ProspeccaoPage.tsx` — 742 lines
  - `src/pages/ImportarPage.tsx` — 727 lines
  - `src/pages/ConfiguracoesPage.tsx` — 723 lines
- Impact: Hard to review, hard to test, Fast Refresh churns the whole tree on save, and the `BlocoEditorModal` null-bug class of issue (mentioned in RELATORIO-TESTES C2) becomes more likely as state grows.
- Fix approach: For `MensagensPage`, extract `TEMPLATES` constant to `src/lib/mensagens-templates.ts`, classification helpers already exist in `src/lib/slack.ts`/`src/lib/blocos-mensagem.ts` — move localStorage prefs to a small hook. For the others, apply the same pattern: tables/constants out, view kept in page.

### `as any` and non-null `!` assertions sprinkled — **MEDIUM**
- Issue: Type escape hatches mask real shape mismatches.
- Files (confirmed today):
  - `src/pages/DashboardPage.tsx:89` — `(c as any).contratos as typeof contratos` (joined relation not in `Cliente` type).
  - `src/pages/MapaPage.tsx:300-301` — `geographies: any[]`, `geo: any` (react-simple-maps lacks types in our usage).
  - `api/slack-proxy.ts:2` — disables `@typescript-eslint/no-explicit-any` for the whole file; `req`/`res` typed as `any`, `data.channels as any[]`.
- Impact: Same class of bug as `BlocoEditorModal` (RELATORIO-TESTES C2) where `null` propagated unchecked.
- Fix approach: Extend `Cliente` type in `src/types/index.ts` to include `contratos?: Contrato[]` for the joined query result, or expose a `ClienteWithContratos` type. For `MapaPage`, add proper `react-simple-maps` geography type. For `api/slack-proxy.ts`, type with `VercelRequest`/`VercelResponse` from `@vercel/node`.

### Eslint pin-down with `eslint-disable` (still uncleaned) — **LOW**
- Issue: Tactical disables that hide real `exhaustive-deps` decisions.
- Files: `src/components/leads/NewLeadModal.tsx:65,79`; `src/pages/MensagensPage.tsx:514,532,541`; `src/pages/LeadDetailPage.tsx:44`.
- Impact: When deps change, the effects may use stale closures. Low likelihood today but adds up.
- Fix approach: For each disable comment, either capture the dep through `useCallback`/`useMemo` or convert the effect to a deliberate one-shot pattern (e.g., `useRef` guard) and document why.

### Dead/stale references to AI key — **LOW**
- Issue: `src/components/diagnostico/DiagnosticForm.tsx:45` calls `toast.error('… verifique a chave VITE_ANTHROPIC_API_KEY')` but the underlying hook `src/hooks/useAnalyzeDiagnostico.ts` is a 100% offline rules engine that never throws on a missing key.
- Impact: User-visible error message references an env var the codebase does not use; misleads anyone trying to debug.
- Fix approach: Remove the key reference; the only realistic failure path is the diagnostic engine throwing, which won't mention API keys.

---

## Known Bugs / Fragile Areas

### Auth bootstrap race in `AppLayout` and `PortalLayout` — **MEDIUM**
- Symptoms: On hard reload, `AppLayout` runs `auth.getSession()` then queries `perfis` and only then unmounts the spinner. If the network is slow, child components may not mount yet — but `useLeads`, `useClientes` etc. *do* mount in pages downstream, triggering Supabase queries before the perfil check resolves. Acceptable today because RLS protects results, but a slow `perfis` lookup can yield 401s briefly visible in devtools.
- Files: `src/components/layout/AppLayout.tsx:16-45`, `src/pages/portal/PortalLayout.tsx:27-35`.
- Trigger: Hard reload with cold network or revoked refresh token.
- Workaround: None needed — RLS is the real gate. But the UI shows the spinner indefinitely if `perfis.select('tipo').single()` returns no row (e.g., perfil missing). The `.single()` will throw on zero rows.
- Fix approach: Switch the perfil fetch to `.maybeSingle()` (as `usePerfis.ts:46` already does for `useMeuPerfil`) and handle the null case explicitly — sign the user out with a clear toast if `perfis` row is missing.

### Optimistic update on lead status assumes one cache key — **LOW**
- Symptoms: `useUpdateLeadStatus` (in `src/hooks/useLeads.ts:85-115`) rolls back via `QUERY_KEYS.leads.all` only, but `useLeads()` is also referenced via `QUERY_KEYS.leads.byId(id)` from `LeadDetailPage`. A user dragging a card while the detail page is also open in another tab could see stale data on the detail side until next focus.
- Files: `src/hooks/useLeads.ts:85-115`.
- Trigger: Two tabs, same lead, drag-and-drop in one.
- Fix approach: In `onMutate`, also snapshot and patch `QUERY_KEYS.leads.byId(id)` if present. In `onSettled`, invalidate both keys (already invalidates `.all` and `.dashboard`, not `.byId`).

### `useCreateLead` and `useUpdateLeadStatus` fire-and-forget `audit_logs.insert` — **MEDIUM**
- Symptoms: `await supabase.from('audit_logs').insert(...)` is not awaited (line 46) — return value is discarded and no error toast surfaces. Same for `useUpdateLeadStatus.onSettled` (line 105) where the insert call result is dropped.
- Files: `src/hooks/useLeads.ts:46, 105`, `src/hooks/useClientes.ts:69`.
- Impact: Silent audit gaps — the table that legal/compliance trusts for "who did what" may be missing entries if the network blips between the success toast and the audit insert. RLS `interno_insert_audit_logs` requires the call to land on an authenticated client; an interim 401 (token refresh) would silently lose the entry.
- Fix approach: Either await with `try/catch` and log to `console.error`, or queue audit writes through a dedicated `useAuditTrail()` hook that retries on failure and surfaces gaps in a small banner.

### Kanban DnD does not gate on mutation in flight — **LOW**
- Symptoms: `KanbanBoard.handleDragEnd` (`src/components/leads/KanbanBoard.tsx:45-71`) immediately calls `updateStatus.mutate(...)`. If the user drags two cards in quick succession, both mutations fire — RTK rolls back the optimistic state from each independently, which can flip the list back and forth.
- Files: `src/components/leads/KanbanBoard.tsx:45-71`, `src/hooks/useLeads.ts:85-115`.
- Trigger: Fast double drag during a slow network.
- Fix approach: Disable DnD while `updateStatus.isPending` (or use `useMutationState` with a queue) or coalesce into a single batch update.

### `.finally()` on Supabase builder pattern (already fixed but watch for regressions) — **LOW**
- The fix was applied in `DeleteConfirmDialog` (RELATORIO-TESTES A2). The Supabase builder is `PromiseLike`, not a true `Promise`; any new code that uses `.finally()` directly on a `supabase.from(...)` chain will compile but is technically undefined behaviour.
- Fix approach: Add a lint rule or codemod check; preferred style is `try { await ... } finally { ... }`.

---

## Security

### `.env` is committed to git history — **HIGH**
- Risk: The repository tracks `.env` (verified with `git ls-files`). The variables present are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, both of which are public values intended to ship to the browser, so the **immediate** exposure is low — anon key is paired with strict RLS (migrations 020/021/029) that already lock down the data plane.
- Files: `.env` (tracked), `.gitignore` (does **not** include `.env`).
- Current mitigation: RLS lockdown ensures the anon key cannot read interno-only tables.
- Recommendations:
  - Add `.env` to `.gitignore` and `git rm --cached .env`.
  - Rotate the Supabase project anon key + URL anyway (cheap hygiene) and re-issue to Vercel.
  - Add `.env.example` (non-secret, committed) to document required variables.
  - Audit `git log -p -- .env` to confirm no past commit contained a service-role key or other server secret.

### `api/slack-proxy.ts` (Vercel function) has **no auth check** — **HIGH**
- Risk: The Vercel serverless function accepts any POST with `action: 'list_channels' | 'get_messages' | 'get_user'` and proxies straight to Slack using the bot token. CORS is `*`. Anyone on the public internet can list channels the bot is a member of, read messages, and look up users.
- Files: `api/slack-proxy.ts:1-68`. Called from `src/lib/slack.ts:19` (`/api/slack-proxy`).
- Current mitigation: None — the file disables `@typescript-eslint/no-explicit-any` and ships as-is.
- A hardened version exists in `supabase/functions/slack-proxy/index.ts` (validates JWT, requires `perfis.tipo = 'interno'`, allowlists origins) — but the client **does not call it**; it hits the unauthenticated Vercel endpoint.
- Recommendations:
  - Either delete `api/slack-proxy.ts` and switch `src/lib/slack.ts` to call the Supabase edge function (passing `Authorization: Bearer <session.access_token>`), OR
  - Port the JWT-validation logic from `supabase/functions/slack-proxy/index.ts` into `api/slack-proxy.ts` (verify JWT against Supabase, require `perfis.tipo === 'interno'`).
  - Replace `Access-Control-Allow-Origin: *` with an APP_URL allowlist (already done in the Supabase version).

### Sensitive-looking values exposed via `VITE_` prefix — **LOW (informational)**
- Risk: Anything starting with `VITE_` is bundled into the client. Today the codebase only references `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (both intended public) and the stale `VITE_ANTHROPIC_API_KEY` mention (not actually used). No leaked server-side secrets observed in `import.meta.env.*`.
- Files: `src/lib/supabase.ts:3-4`, `src/components/diagnostico/DiagnosticForm.tsx:45`.
- Recommendation: Add a CI lint to reject any `VITE_*` env name that contains `SECRET`, `PRIVATE`, `SERVICE_ROLE`, `BOT_TOKEN`, etc. — future-proofing against accidental leakage.

### Input validation: only one form uses zod — **MEDIUM**
- Risk: `NewLeadModal.tsx` is the **only** component using `react-hook-form` + `zodResolver` (verified with grep). Most modals/forms accept raw string state and write directly to Supabase. Without zod schemas, fields like email, phone, CNPJ are not validated client-side; bad data flows to RLS-protected tables.
- Files: `src/components/clientes/NewClienteModal.tsx`, `src/components/contratos/NewContratoModal.tsx`, `src/components/reunioes/NovaReuniaoModal.tsx`, `src/components/mensagens/BlocoEditorModal.tsx`, and many more.
- Impact: User-facing errors are deferred to backend constraint failures (poor UX). Email/CNPJ/phone format errors silently land in the DB.
- Recommendations: Introduce shared zod schemas in `src/lib/schemas.ts` (one per entity). Refactor existing modals to use `react-hook-form` + zod incrementally (start with high-PII forms: lead, cliente, contrato).

### CNPJ enrichment fetches BrasilAPI without rate limiting — **LOW**
- Risk: `src/lib/cnpj.ts:52` fetches `https://brasilapi.com.br/api/cnpj/v1/${clean}` directly from the browser. No throttle, no error caching. A bulk paste of CNPJs would trigger many requests in parallel; BrasilAPI's free tier limits could 429.
- Files: `src/lib/cnpj.ts:52`.
- Current mitigation: None observed.
- Recommendation: Cache lookups in a small `Map` keyed by CNPJ inside the session; or move the lookup behind a Supabase edge function with a redis-style cache.

### No CSP / no `dangerouslySetInnerHTML` (positive finding) — **N/A**
- Verified: zero matches for `dangerouslySetInnerHTML`, `eval(`, or `innerHTML =` in `src/`. Good baseline.

---

## Performance

### Every list page does `select('*')` with no pagination — **MEDIUM**
- Problem: 18 hooks call `.select('*')` without `.range()` or `.limit()`. As the CRM grows, the leads/clientes/contratos/oportunidades pages will load every row on every mount.
- Files (one per hook):
  - `src/hooks/useLeads.ts:13` (leads + joined diagnosticos)
  - `src/hooks/useClientes.ts:13,27` (clientes + joined contratos + joined indicador)
  - `src/hooks/useContratos.ts:28`
  - `src/hooks/useObjecoes.ts:13`
  - `src/hooks/useParceiros.ts:13`
  - `src/hooks/usePerfis.ts:27,46`
  - `src/hooks/useReunioes.ts:30,53`
  - `src/hooks/useTarefas.ts:13,28,45`
  - `src/hooks/useDiagnostico.ts:14`
  - `src/hooks/usePortal.ts:33,49,125`
  - `src/hooks/usePortalAdmin.ts:43,159,228,289`
  - `src/hooks/usePosJuniors.ts:15`
  - `src/hooks/useConfiguracoes.ts:169`
  - `src/hooks/useInteracoes.ts:13,28` (28 already has `.limit(2000)` — too high)
- Impact: At a few hundred rows, fine. Beyond ~5k leads (or any growth in contracts/audit), TTI degrades sharply and React Query memory footprint grows.
- Improvement path:
  - Pick a sensible default page size (e.g., 100) and add `useInfiniteQuery` for kanban + list pages.
  - For dashboard aggregates, replace `select('*')` with explicit columns (`select('id,status,created_at,valor_mensal')`).
  - Move heavy aggregations (e.g., dashboard KPI rollups) to Postgres views or RPCs to avoid shipping every row to the browser.

### `useInteracoes.ts:15` hardcoded `.limit(2000)` — **MEDIUM**
- Problem: Returns up to 2000 interaction rows per query — effectively unbounded for current scale, but still ships 2000 rows when one entity needs ~10.
- Files: `src/hooks/useInteracoes.ts:15`.
- Improvement: Filter by `lead_id` or `cliente_id` and drop the limit to ~50.

### Nested join on `useClientes` is N+1-shaped — **LOW**
- Problem: `select('*, contratos(*), indicado_por_cliente:indicado_por_cliente_id(id,nome,empresa)')` is fine while clients are small, but every client also pulls every contract. The dashboard's `postConsultoriaUpsell` computation in `src/pages/DashboardPage.tsx:88-99` relies on this join.
- Files: `src/hooks/useClientes.ts:13,27`, `src/pages/DashboardPage.tsx:88-99`.
- Improvement: Keep `contratos(*)` for now; move dashboard `postConsultoriaUpsell` filter to a Postgres view that joins server-side.

### Bundle size risks — **LOW**
- Heavy deps shipped to all clients:
  - `recharts ^3.8.0` (~250KB gzipped) — used in `DashboardPage`, `AnalyticsPage`.
  - `react-simple-maps ^3.0.0` + `d3-color` override (~200KB) — used **only** on `MapaPage`.
  - `recharts` and `react-simple-maps` are imported eagerly via the router (no lazy chunk).
- Files: `src/router.tsx`, `src/pages/MapaPage.tsx`, `src/pages/AnalyticsPage.tsx`.
- Improvement: Code-split heavy pages with `React.lazy(() => import('./pages/MapaPage'))` in `src/router.tsx`. Wrap routes in `<Suspense>`.

### `audit_logs` global query returns last 200 with no filtering — **LOW**
- Problem: `useAuditLogs()` in `src/hooks/useAuditLog.ts` returns the last 200 rows globally. Fine today; if a noisy table starts auditing on every keystroke, signal/noise tanks fast.
- Files: `src/hooks/useAuditLog.ts:14`, `src/pages/AuditoriaPage.tsx`.
- Improvement: Add `tabela` and date-range filters server-side; expose them as query params.

---

## DX / Maintenance

### No CI gate — **HIGH**
- Issue: There is no `.github/workflows/`, no `.husky/`, no `.pre-commit-config.yaml`. Lint and tests only run if a human remembers.
- Files: (absence of) `.github/`, `.husky/`.
- Impact: RELATORIO-TESTES M1 already noted 67 ESLint errors accumulated; without a CI gate the count regrows after each cleanup. Build was silently broken (C1) for the same reason.
- Fix approach: Add a GitHub Actions workflow `lint-and-test.yml` running `npm run lint`, `npm run test`, and `npm run build` on PR. Add a pre-push hook via husky for the same. Block merge on failure.

### Lint not part of build — **MEDIUM**
- Issue: `npm run build` is `tsc -b && vite build`; eslint runs only via the standalone `npm run lint` script.
- Files: `package.json:8`.
- Impact: Same root cause as above — 67 errors accumulated unnoticed.
- Fix approach: Either chain lint into build (`tsc -b && eslint . && vite build`) for local + CI, or rely on the CI workflow.

### Outdated / risky major versions — **MEDIUM**
- `react ^19.2.4` / `react-dom ^19.2.4` — current, but the `eslint-plugin-react-hooks ^7.0.1` rules around `set-state-in-effect` are new and produce false positives (RELATORIO-TESTES M5). Watch for plugin updates that change rule behaviour.
- `vite ^8.0.0` — very recent major; ensure all plugins (`@vitejs/plugin-react ^6.0.0`) keep up.
- `react-router-dom ^7.13.1` — v7 has subtle changes from v6 (e.g., `createBrowserRouter` typing). Code looks correct but treat router upgrades carefully.
- `eslint ^9.39.4` — flat config era; verify `eslint.config.js` reflects current best practices.
- `zod ^4.3.6` — v4 has breaking changes vs v3. Only one form uses zod today, so blast radius is low.
- Files: `package.json`.
- Impact: Most are aligned to recent majors. The risk is silent behavioural drift on minor updates, especially `react-hooks` rules.
- Fix approach: Pin majors, run `npm outdated` quarterly, and add a Renovate / Dependabot config once CI exists.

### Test coverage gaps — **MEDIUM**
- What's tested today (per `RELATORIO-TESTES.md` + `src/**/__tests__/`):
  - Unit: `periods`, `projecao`, `icp-dinamico`, `utils` (lib).
  - Hooks: `useCurrentRole`, `useObjecoes`, `useLeads`.
  - Components: `ResponsavelBadge`, `DeleteConfirmDialog`, `PeriodSelector`, `ErrorBoundary`.
  - E2E: smoke spec for 30 routes (gated on QA users).
  - RLS: 5 tests authored but skipped pending QA users.
- What's **not** tested:
  - Drag-and-drop in `KanbanBoard.tsx` (the core CRM interaction).
  - `MensagensPage` template rendering / bracket substitution (`fill`, `fillBrackets`).
  - `BlocoEditorModal` — the component that historically caused the null-render bug.
  - Optimistic update rollback paths in `useUpdateLeadStatus`.
  - Auth redirect logic in `AppLayout` and `PortalLayout`.
  - All Supabase Edge Functions (`slack-proxy`, `notify-indicacao`, `notify-renovacao`, `notify-tarefa`, `slack-commands`).
- Files: `src/**/__tests__/`, `tests/e2e/`, `tests/rls/`.
- Risk: Pipeline DnD breakage would not be caught until users hit it. Audit log silent failures (see "fire-and-forget audit_logs") would be invisible.
- Priority: HIGH for DnD test, HIGH for `useUpdateLeadStatus` rollback, MEDIUM for the rest.

### RLS test suite is dark (no QA users) — **MEDIUM**
- Issue: `tests/rls/` exists but tests are skipped pending creation of `qa-diretor@consej.com` and `qa-consultor@consej.com` (per `RELATORIO-TESTES.md` step 1).
- Files: `tests/rls/`, `.env.test.example`.
- Impact: Migrations 020/021/029 lock down RLS in non-trivial ways. Without runnable RLS tests, a regression in any future migration would only be caught by manual testing in production.
- Fix approach: Provision the two QA accounts in Supabase Auth, copy `.env.test.example` → `.env.test`, and add `npm run test:rls` to the CI workflow as a nightly job (requires the QA env to be reachable from CI runners).

### Migrations have a numbering gap (017, 018 missing) — **LOW**
- Issue: `supabase/migrations/` jumps from `016_regras_e_campanhas.sql` to `019_notificacoes_indicacao.sql`. The migrations applied to the DB may or may not match the filesystem.
- Files: `supabase/migrations/`.
- Impact: If 017/018 were applied directly via SQL Editor and never committed, dev environments rebuilt from scratch lack them.
- Fix approach: Run `supabase db diff` against the linked project and rename or restore the missing files; add a CI check that migration numbers are contiguous.

### Documentation drift — **LOW**
- The `.planning/codebase/` directory already has `STACK.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `INTEGRATIONS.md`, `TESTING.md` (per `ls`), but no automation refreshes them. `CLAUDE.md` mentions `consej-crm/` (v1) as legacy but does not call out which files in v2 are partial ports.
- Files: `CLAUDE.md`, `.planning/codebase/*`.
- Fix approach: Add a date stamp + diff-against-git-sha to each file; refresh after major migration or feature.

---

## Migration Risk

### v1 (`consej-crm/`, Next.js 15 + Prisma) is still on disk — **LOW**
- Risk: The legacy v1 lives at `../consej-crm/` (Next.js `app/` directory, Prisma schema). It is **not** referenced from v2 (`grep -rn "consej-crm/" src` returned zero matches outside of unrelated UI label strings).
- Files: `../consej-crm/` (parallel repo, not inside v2). Documented in the parent `CLAUDE.md`.
- Impact: No code coupling found. Risk is **organizational**: a contributor could mistakenly edit v1 thinking it's the active app.
- Fix approach: Either archive `consej-crm/` outside the working folder, or add a top-level `DEPRECATED.md` inside it pointing at v2 as the canonical app.

### Parallel `slack-proxy` implementations — **MEDIUM**
- Risk: Two implementations of the same proxy:
  - `api/slack-proxy.ts` (Vercel, unauth, CORS `*`, currently called).
  - `supabase/functions/slack-proxy/index.ts` (Supabase Edge Function, JWT-validated, interno-only).
- Files: `api/slack-proxy.ts`, `supabase/functions/slack-proxy/index.ts`, `src/lib/slack.ts:19`.
- Impact: See SECURITY section — the wrong one is live. Beyond security, the two will diverge over time as features land in one and not the other.
- Fix approach: Decide on one. Recommended: keep the Supabase Edge Function (it has the right auth posture), delete `api/slack-proxy.ts`, repoint `src/lib/slack.ts` to the edge function URL with `Authorization: Bearer ${session.access_token}`.

### `responsavel` (TEXT) vs `responsavel_id` (UUID) duplication — **MEDIUM**
- (Repeats RELATORIO-TESTES A3 — still open.) Columns `responsavel` (text legacy) and `responsavel_id` (uuid, added by migration 028) coexist on `oportunidades` and `demandas`. Inconsistent reads/writes cause RLS surprises and stale UI.
- Files: `supabase/migrations/028_responsavel_ids.sql`, `supabase/migrations/029_rls_role_aware.sql`, all `useOportunidades.ts`/`useDemandas.ts` consumers.
- Fix approach: Migrate all consumers to `responsavel_id`, drop the TEXT column in a follow-up migration.

### RLS role-aware effectively bypassed by orphan visibility — **MEDIUM**
- (Repeats RELATORIO-TESTES A1 — decision logged: keep orphan visible.) `can_see_responsavel(NULL)` returns true and 97–100% of rows have `responsavel_id = NULL`, so role-aware scoping is currently a no-op.
- Files: `supabase/migrations/029_rls_role_aware.sql`.
- Status: Stakeholder accepted. Long-term concern: a future feature that depends on role-aware scoping (e.g., "only my clients" view) will appear broken until backfill happens.
- Fix approach: Add a backfill script that assigns `responsavel_id` based on `audit_logs` "criado" entries (the creator becomes the default responsável).

---

## Test Coverage Gaps

(Consolidated from the items above for quick reference.)

| Untested area | File(s) | Risk | Priority |
|---|---|---|---|
| Kanban drag-and-drop | `src/components/leads/KanbanBoard.tsx` | Core CRM interaction breaks silently | HIGH |
| Optimistic rollback on lead status | `src/hooks/useLeads.ts:85-115` | Wrong stage shown to user after network error | HIGH |
| `audit_logs` insert fire-and-forget | `src/hooks/useLeads.ts:46, 105`, `src/hooks/useClientes.ts:69` | Compliance gaps | HIGH |
| `MensagensPage` template substitution | `src/pages/MensagensPage.tsx` (`fill`, `fillBrackets`) | Wrong message sent to lead | MEDIUM |
| `BlocoEditorModal` null-state handling | `src/components/mensagens/BlocoEditorModal.tsx` | Already caused tela-branca once | HIGH |
| Auth redirect / portal-vs-CRM | `src/components/layout/AppLayout.tsx`, `src/pages/portal/PortalLayout.tsx` | Cliente could see CRM briefly during slow network | MEDIUM |
| Supabase Edge Functions | `supabase/functions/*` | All slack/notification flows untested | MEDIUM |
| RLS suite | `tests/rls/` (skipped) | Migration regressions invisible | HIGH (unblock QA users) |

---

## Summary of Severity Counts

| Severity | Open Today |
|---|---|
| HIGH | 5 (duplicated `useAuditLogs`, `.env` tracked, `api/slack-proxy` unauth, no CI gate, RLS test suite dark) |
| MEDIUM | 12 |
| LOW | 9 |

> Already closed in `RELATORIO-TESTES.md`: C1 (build), C2 (ErrorBoundary), C4 (env validation), A2 (DeleteConfirmDialog `.finally`), M4 (range duplicado).

---

*Concerns audit: 2026-05-26*
