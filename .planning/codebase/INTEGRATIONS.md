# External Integrations

**Analysis Date:** 2026-05-26

## APIs & External Services

**Backend-as-a-Service (primary):**
- **Supabase** — single source of truth for data, auth, storage, scheduled jobs, and HTTP webhooks
  - SDK/Client: `@supabase/supabase-js` 2.99.x; client singleton in `src/lib/supabase.ts`
  - Auth: `import.meta.env.VITE_SUPABASE_URL`, `import.meta.env.VITE_SUPABASE_ANON_KEY` (anon key from browser, RLS enforced server-side)
  - Edge Functions also instantiate an admin client via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (auto-injected by the Supabase runtime)
  - Project ref encoded in `supabase/migrations/031_cron_renovacoes.sql:27` as `https://wfnriqwkzdazdbuzbyug.supabase.co`

**Slack:**
- **Slack Web API** — read access to channels/messages (CRM "Slack" page) and write access for handoff/renovation/task notifications
  - Bot token env var: `SLACK_BOT_TOKEN` (xoxb-...) — required by `api/slack-proxy.ts:10` and every `supabase/functions/notify-*/index.ts`
  - Endpoints called (raw `fetch`, no Slack SDK):
    - `https://slack.com/api/conversations.list` — paginated, filtered by `is_member` (`api/slack-proxy.ts:37-47`)
    - `https://slack.com/api/conversations.history` (`api/slack-proxy.ts:54`)
    - `https://slack.com/api/users.info` (`api/slack-proxy.ts:60`)
    - `https://slack.com/api/chat.postMessage` (edge functions `notify-indicacao`, `notify-renovacao`, `notify-tarefa`)
  - Browser callers go through `/api/slack-proxy` (the Vercel function) — see `src/lib/slack.ts:19`
  - Slash-command webhook receiver: `supabase/functions/slack-commands/index.ts` (validates `X-Slack-Signature` HMAC-SHA256 using `SLACK_SIGNING_SECRET`)
  - In-app helper / regex classifier: `src/lib/slack.ts` (functions `listChannels`, `getMessages`, `getUserName`, `tsToDate`, `formatSlackText`, `classifyMessage`)
  - LLM-style heuristics (no LLM): `src/lib/slack-suggestions.ts`

**Brazilian government / business data:**
- **BrasilAPI** — public CNPJ lookup (Receita Federal data)
  - Endpoint: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` (`src/lib/cnpj.ts:52`)
  - No auth, no env var; used directly from the browser in `lookupCnpj`
  - CNAE → segment mapping lives in `src/lib/cnpj.ts:63-72` (`cnaeToSegmento`)

**AI / LLM:**
- No production AI integration. `VITE_ANTHROPIC_API_KEY` is mentioned only in a toast string (`src/components/diagnostico/DiagnosticForm.tsx:45`); the analysis engine in `src/hooks/useAnalyzeDiagnostico.ts` is 100% local rules-based ("Engine de análise baseada em regras — 100% gratuita, sem API externa", line 33-34).

**Migration / one-off:**
- **Pipefy GraphQL API** — historical data migration only
  - Env vars: `PIPEFY_TOKEN`, plus `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`
  - Scripts: `scripts/migrate-pipefy.mjs`, `scripts/migrate-pipefy-api.mjs`, `scripts/migrate-contratos-pipefy.mjs`
  - Not invoked by the running app; safe to ignore for new features

## Data Storage

**Databases:**
- **Supabase Postgres** — single project
  - Connection: via `@supabase/supabase-js` (URL + anon key from env)
  - Schema: 32 incremental migrations `supabase/migrations/001_initial_schema.sql` … `032_lixeira_leads.sql`
  - Core tables defined in `001_initial_schema.sql`: `parceiros`, `leads`, `clientes`, `diagnosticos`, `contratos`, `demandas`, `indicacoes`, `oportunidades`, `audit_logs`
  - Added later (selected): `reunioes` (003), `perfis` (004, 030 adds `slack_user_id`), `configuracoes` (008, singleton row `id='default'`), `gamification` (010), `mensagens_config` (012), `interacoes_lead` (013), `tarefas` (014), `portal_tokens` + `token_transacoes` + `catalogo_recompensas` + `resgates` (015), `regras_tokens` + `campanhas_promocionais` (016), `notificacoes_indicacao` (019), `objecoes` (024), `clean_delete` infrastructure (025), `notificacoes_renovacao_enviadas` (026, 031), `roles` + `responsavel_ids` (027–028), `lixeira_leads` (032)
  - RLS: enabled on every sensitive table; lockdown wave in 021, role-aware policies in 029, portal-specific in 020/023; storage RLS in 009
  - Auto-profile trigger: `on_auth_user_created` in `auth.users` → `public.handle_new_user()` → inserts into `public.perfis` (`supabase/migrations/011_auto_profile_trigger.sql`)
  - Generated columns (e.g., `demandas.valor` from `tipo`), check constraints (e.g., `indicacoes_must_have_referrer`), and triggers `update_updated_at` on every table

**File Storage:**
- **Supabase Storage** — single public bucket `avatars` (5 MB limit; MIME allowlist JPEG/PNG/WebP/GIF)
  - Created by `supabase/migrations/009_storage_avatars.sql`
  - RLS: insert/update/delete restricted to `auth.uid() = (storage.foldername(name))[1]`; public read
  - Uploaded via `supabase.storage.from('avatars').upload(...)` in `src/hooks/usePerfis.ts:87`

**Caching:**
- Browser only: TanStack Query cache (`staleTime: 60_000`, `retry: 1`) — `src/main.tsx:10-17`
- No Redis / external cache

## Authentication & Identity

**Auth Provider:**
- **Supabase Auth** (email/password + magic link)
  - Email/password login: `supabase.auth.signInWithPassword({ email, password })` in `src/pages/LoginPage.tsx:47`
  - Password reset: `supabase.auth.resetPasswordForEmail(email, { redirectTo: '${origin}/reset-password' })` in `src/pages/LoginPage.tsx:79`; handler in `src/pages/ResetPasswordPage.tsx`
  - Magic-link invite (client portal): `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '${origin}/portal', data: { tipo: 'cliente', cliente_id } } })` in `src/pages/ClienteDetailPage.tsx:173`
  - No OAuth/SSO providers configured (no `signInWithOAuth` calls in source)
  - Two portals share the same auth: `/dashboard` (internal CRM) and `/portal` (client rewards portal); `perfis.tipo='cliente'` is forced into `/portal` by `destinoParaPerfil()` in `LoginPage.tsx`
  - Internal roles (`027_roles_internos.sql`): `diretor`, `consultor`, and others — drive role-aware RLS (`029_rls_role_aware.sql`)
- Profile auto-provisioned by Postgres trigger on `auth.users` insert (see Migrations §011 above)

## Monitoring & Observability

**Error Tracking:**
- No external service (no Sentry / Datadog / Bugsnag imports detected)
- React `ErrorBoundary` component wraps the whole app (`src/components/ErrorBoundary.tsx`, mounted in `src/main.tsx:21-27`)
- User-visible errors surface as `sonner` toasts

**Logs:**
- Browser: `console.*` only
- Edge Functions: Supabase Dashboard → Edge Functions → `<name>` → Logs (referenced in `docs/slack-indicacoes.md:124`)
- DB-side notification audit: tables `notificacoes_indicacao` and `notificacoes_renovacao_enviadas` (idempotency + observability views like `notificacoes_indicacao_falhas`)

## CI/CD & Deployment

**Hosting:**
- **Vercel** — hosts the SPA build (`dist/`) plus `/api/*` serverless functions
  - Routing: `vercel.json` rewrites `/api/(.*)` → `/api/$1`, everything else → `/index.html`
  - Function: `api/slack-proxy.ts` (CORS-enabled, accepts `POST` only)
- **Supabase Edge Functions** (Deno) — deployed via `supabase functions deploy <name>`:
  - `notify-indicacao` — triggered by Database Webhook on `INSERT` of `indicacoes`
  - `notify-renovacao` — triggered by `pg_cron` job `disparar-renovacoes` (daily at `0 12 * * *` UTC) — see `supabase/migrations/031_cron_renovacoes.sql`
  - `notify-tarefa` — triggered by Database Webhook on `INSERT/UPDATE` of `tarefas`
  - `slack-commands` — public endpoint receiving Slack slash commands
  - `slack-proxy` — alternative server-side Slack proxy with CORS allowlist (likely deprecated by `api/slack-proxy.ts`; both exist)

**CI Pipeline:**
- No `.github/workflows/` or `.circleci/` configuration detected in repo root
- Local quality gates: `npm run lint`, `npm test`, `npm run test:rls`, `npm run test:e2e`

## Environment Configuration

**Required env vars (frontend, build-time via Vite):**
- `VITE_SUPABASE_URL` — hard requirement; `src/lib/supabase.ts:8-17` throws if missing
- `VITE_SUPABASE_ANON_KEY` — same
- `VITE_ANTHROPIC_API_KEY` — referenced only in an error toast; **not actually consumed** by any working code path

**Required env vars (Vercel function):**
- `SLACK_BOT_TOKEN` — `api/slack-proxy.ts:10`

**Required env vars (Supabase Edge Functions / secrets):**
- `SLACK_BOT_TOKEN` (shared bot)
- `SLACK_LEADS_CHANNEL_ID` — Slack channel for indicação/renovação notifications (fallback: `SLACK_CHANNEL_ID`)
- `SLACK_SIGNING_SECRET` — verifies slash-command requests in `slack-commands/index.ts:23`
- `WEBHOOK_INDICACAO_SECRET` — Bearer token for the `notify-indicacao` Database Webhook (`notify-indicacao/index.ts:34`)
- `WEBHOOK_RENOVACAO_SECRET` — Bearer token for `notify-renovacao`; also stored in Supabase Vault as `webhook_renovacao_secret` for `pg_cron` (`supabase/migrations/031_cron_renovacoes.sql:9, 31-38`)
- `WEBHOOK_TAREFA_SECRET` — Bearer token for `notify-tarefa`
- `APP_URL` — public CRM base URL used in Slack deep-links and CORS allowlist; falls back to `https://localhost:5173`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase runtime; used by every edge function to instantiate an admin client

**Required env vars (test):**
- `.env.test.example` lists `QA_DIRETOR_EMAIL`, `QA_DIRETOR_PASSWORD`, `QA_CONSULTOR_EMAIL`, `QA_CONSULTOR_PASSWORD`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `E2E_BASE_URL`
- `playwright.config.ts:10-17` loads `.env.test` directly (no `dotenv` dependency)

**Required env vars (migration scripts — manual, not for production):**
- `PIPEFY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` / `SUPABASE_KEY` (`scripts/migrate-pipefy*.mjs`, `scripts/migrate-contratos-pipefy.mjs`)

**Secrets location:**
- Frontend `VITE_*` vars: `.env` at repo root (gitignored — file exists but contents must not be read; `.gitignore` covers `.env*` patterns and `.env.test`, `.env.migration` specifically)
- Vercel function vars: Vercel Dashboard → Settings → Environment Variables (per `api/slack-proxy.ts:14`)
- Edge Function secrets: `supabase secrets set …` (per `docs/slack-indicacoes.md:33-36`)
- `pg_cron` HTTP-call secret: Supabase Vault (`SELECT vault.create_secret(...)` per `supabase/migrations/031_cron_renovacoes.sql:9`)

## Webhooks & Callbacks

**Incoming (handlers exposed by this repo):**
- `POST /api/slack-proxy` (Vercel) — internal Slack read proxy, called by the browser via `src/lib/slack.ts:19`
- `POST {supabase}/functions/v1/notify-indicacao` — Supabase Database Webhook on `indicacoes` INSERT
- `POST {supabase}/functions/v1/notify-renovacao` — `pg_cron` HTTP call (daily) + manual triggers
- `POST {supabase}/functions/v1/notify-tarefa` — Supabase Database Webhook on `tarefas` INSERT/UPDATE
- `POST {supabase}/functions/v1/slack-commands` — Slack slash-command endpoint (e.g., `/lead Nome | Empresa | Telefone | Origem`)
- `POST {supabase}/functions/v1/slack-proxy` — alternate Slack proxy (CORS allowlisted to `APP_URL` + localhost)

**Outgoing:**
- Slack: `chat.postMessage`, `conversations.list`, `conversations.history`, `users.info` (see Slack section above)
- BrasilAPI: `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}` from the browser
- Supabase REST/Realtime/Auth/Storage: via `@supabase/supabase-js`

## RLS / Security Notes

- RLS is enabled on every domain table; initial migration grants `authenticated_all` (open to any signed-in user) and is later restricted by `021_lockdown_rls.sql`, `020_portal_rls_fix.sql`, `023_internos_no_portal.sql`, and the role-aware `029_rls_role_aware.sql`
- Webhook handlers use `timingSafeEqual` for constant-time Bearer comparison (`notify-indicacao/index.ts:19-30`, mirrored in `notify-renovacao` and `notify-tarefa`)
- The Vercel SPA does not enforce auth — RLS does. Anonymous key in the browser is expected.

---

*Integration audit: 2026-05-26*
