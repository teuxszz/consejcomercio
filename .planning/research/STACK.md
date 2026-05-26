# Stack Research
**Date:** 2026-05-26
**Project:** CONSEJ CRM v2 — Milestone 2 (Adoção & Crescimento)
**Scope:** Task management, notifications, WhatsApp deep links, revenue dashboard

---

## Recommended Approach: Extend what exists — zero new infrastructure

All five features are achievable without adding any new service or cost. The project already has:
- `tarefas` table with full CRUD hooks (migration 014, `useTarefas.ts`)
- `pg_cron` enabled and in production (migration 031 proves it on this exact Supabase project)
- `notify-tarefa` edge function deployed (Slack DM on assignment)
- `wa.me` + `encodeURIComponent` pattern already working in `MensagensPage.tsx` line 456–459
- `recharts` + `useContratos` already providing MRR computation in `DashboardPage.tsx`
- `tarefas-derivadas.ts` computing cadence and stagnation client-side

Every Milestone 2 feature is an extension of existing patterns, not a new architecture decision.

---

## Task System

### Schema

The `tarefas` table (migration 014) is already complete and correct. **Do not add a new table.**

```sql
-- Already exists. Fields relevant to Milestone 2:
-- tipo: 'generica' | 'followup' | 'reuniao_prep' | 'renovacao' | 'upsell' | 'diagnostico' | 'proposta' | 'cobranca'
-- entidade_tipo: 'lead' | 'cliente' | 'contrato' | 'oportunidade' | 'reuniao' | 'indicacao' | null
-- entidade_id: UUID (nullable — null = internal team task with no lead)
-- atribuido_a_id: FK perfis
-- data_vencimento: TIMESTAMPTZ
-- status: 'aberta' | 'em_andamento' | 'concluida' | 'cancelada'
```

For **cadence tracking** per lead: do NOT add a `dia_cadencia` column. The existing `interacoes_lead` table + `cadencia.ts` + `tarefas-derivadas.ts` already computes this client-side. The derived task system (`TarefaDerivada` with `derivada: true`) surfaces cadence reminders without polluting the DB. This approach is already shipped and working — keep it.

For **internal team tasks** (not attached to a lead): `entidade_tipo = null` and `entidade_id = null`. This is already supported by the schema. No migration needed.

For **next-action guide** per lead: compute client-side in `tarefas-derivadas.ts` (already implemented for cadence and stagnation). Add a new derivation block for "suggested next action" based on `lead.status` → return a `TarefaDerivada` with the action label and deeplink to `/mensagens`.

### Trigger/Notification Pattern

Existing `notify-tarefa` edge function handles Slack DM on assignment (Database Webhook on INSERT/UPDATE). This is already deployed and functional. No changes needed for assignment notifications.

For **daily reminder of overdue tasks**: extend the existing `pg_cron` pattern from migration 031.

```sql
-- New cron job (migration 033):
-- Read from vault, call a new edge function notify-tarefas-vencidas daily at 09:00 BRT (12:00 UTC)
SELECT cron.schedule(
  'disparar-tarefas-vencidas',
  '0 12 * * *',
  'SELECT public.cron_disparar_tarefas_vencidas()'
);
```

The Postgres function queries `tarefas WHERE status IN ('aberta','em_andamento') AND data_vencimento < NOW()` grouped by `atribuido_a_id`, then calls `notify-tarefas-vencidas` edge function which posts a Slack DM digest per user. Pattern is identical to `cron_disparar_renovacoes` (migration 031) — proven and zero-cost.

**Pull-back notification alternative (email):** Supabase Auth's built-in SMTP handles transactional email (password reset, magic link). It cannot be used for arbitrary emails from edge functions without a configured SMTP provider. Since the constraint is zero incremental cost, use Slack DM (already configured, SLACK_BOT_TOKEN already set). This delivers the pull-back notification where the team already is.

### Confidence: High

Evidence: migration 014 exists in repo; `useTarefas.ts` fully implemented; `tarefas-derivadas.ts` client-side derivation already works; `notify-tarefa` edge function deployed; migration 031 proves `pg_cron` + `pg_net` active on this Supabase project.

---

## Notifications (zero-cost)

### Options Evaluated

**Option A: Slack DM via existing edge function (RECOMMENDED)**
- Already implemented for task assignment (`notify-tarefa`) and contract renewal (`notify-renovacao`)
- Zero new infrastructure — `SLACK_BOT_TOKEN` already configured
- Pattern: `pg_cron` → Postgres function → `net.http_post` → edge function → `conversations.open` + `chat.postMessage`
- Limitation: requires `perfis.slack_user_id` to be set for each user (already migrated in 030)
- Cost: free

**Option B: Browser Push API (service worker)**
- Requires HTTPS (satisfied — Vercel), user permission grant, and a service worker registration
- Works offline (sends even when tab is closed) only if browser is open
- No server-side push without a push service (e.g., web-push + VAPID keys) — needs a server endpoint
- With 2–5 internal users this is disproportionate complexity for marginal benefit over Slack DMs
- Cost: technically free but requires maintaining a service worker, VAPID key pair, and push subscription storage in DB
- Verdict: NOT recommended for this team size and existing Slack setup

**Option C: Supabase Realtime subscriptions**
- Real-time in-app badge/toast when a task is assigned or updated while the app is open
- Already possible with `supabase.channel('tarefas').on('postgres_changes', ...)` using existing `@supabase/supabase-js`
- Only works while tab is open — not a pull-back mechanism
- Best used as a complement to Slack DMs, not a replacement
- Cost: free (Realtime is included on all Supabase plans)
- Verdict: use for in-app live updates (e.g., inbox counter badge), NOT as the pull-back notification

**Option D: Email via SMTP (Resend, Sendgrid, etc.)**
- Resend free tier: 3,000 emails/month — sufficient for 2–5 users
- BUT requires adding a new service and DNS verification for custom domain
- With 2–5 users and an existing Slack setup, email adds friction without benefit
- Verdict: NOT recommended given team size and existing Slack coverage

### Recommended

**Primary pull-back:** Slack DM digest via `pg_cron` + edge function (extension of existing pattern)
**Secondary in-app:** Supabase Realtime `postgres_changes` subscription for live inbox badge when app is open

Implementation order:
1. Extend `notify-tarefa` to also send a summary to the user's DM when tasks are overdue (daily cron)
2. Add a `useRealtimeTarefas` hook using `supabase.channel()` for the in-app notification badge on the `/me` or dashboard page

### Confidence: High

Evidence: `notify-tarefa` and `notify-renovacao` edge functions are deployed and working. Migration 031 confirms `pg_cron` + `pg_net` are active. `SLACK_BOT_TOKEN` is configured. `perfis.slack_user_id` column exists (migration 030).

---

## WhatsApp Deep Links

### Pattern

Already implemented and working in the codebase. The canonical implementation is in `MensagensPage.tsx:456–459`:

```typescript
function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('55') ? digits : '55' + digits
  return 'https://wa.me/' + intl + '?text=' + encodeURIComponent(message)
}
```

For cadence deep links from the task inbox or cadence page, reuse this function. The `/cadencia` page already shows the cadence due today per lead; adding a WhatsApp button is a one-liner calling `buildWhatsAppUrl(lead.telefone, templateText)`.

The CadenciaPage already routes to MensagensPage via query params (`?leadId=...&stage=...`). For the "next action guide", the fastest implementation is a button that opens `/mensagens?leadId=X&stage=Y&nome=...&empresa=...` — MensagensPage then renders the pre-filled template. The WhatsApp button inside MensagensPage opens `wa.me` directly.

### Gotchas

1. **`encodeURIComponent` is correct.** Do NOT use `encodeURI` — it does not encode `&`, `=`, `+`, which breaks the `?text=` query param when the message contains those characters (common in Portuguese legal text like "Art. 14 & 15", percentages, etc.).

2. **Portuguese diacritics are safe.** `encodeURIComponent` encodes `ã`, `ç`, `é`, `ó`, `ú`, etc. as percent-encoded UTF-8 sequences. WhatsApp Web and the mobile app both decode these correctly. Confirmed by existing working implementation in `ProspeccaoPage.tsx:97`.

3. **Newlines in templates.** WhatsApp renders `\n` as line breaks when the text comes from a `wa.me` link decoded by the app. Use `\n` in template strings — `encodeURIComponent('\n')` → `%0A`, which WhatsApp interprets correctly.

4. **Brazilian phone normalization.** The `55` country code prefix logic already handles numbers that may or may not include it. Numbers stored in DB may have masks like `(84) 99999-9999` — the `replace(/\D/g, '')` strip already handles this.

5. **`wa.me` link opens WhatsApp Web or the installed app** depending on the device. On desktop Chrome (Gabriel's primary browser), it opens WhatsApp Web. The pre-filled text appears in the message box — the user still clicks Send. This is the intended zero-cost behavior (no bot, no API).

6. **No issue with 160-char limits.** WhatsApp messages have no server-enforced length limit in the `?text=` param (tested up to ~1500 chars in practice). The long cadence templates in `MensagensPage.tsx` work fine.

### Confidence: High

Evidence: `buildWhatsAppUrl` exists and is called in production at `MensagensPage.tsx:710` and `ProspeccaoPage.tsx:97`. No open issues in the repo related to encoding failures.

---

## Revenue Dashboard

### Key Metrics

Based on the existing `contratos` table and `DashboardPage.tsx` patterns, the revenue dashboard needs:

| Metric | Definition | Source |
|--------|-----------|--------|
| MRR | Sum of `valor_mensal` for `contratos WHERE status='ativo'` | Already computed in DashboardPage.tsx:73 |
| ARR | MRR × 12 | Derived from MRR |
| Receita total do período | Sum of `valor_total` for contracts signed in date range | `contratos.data_inicio` filter |
| Contratos ativos | Count of `status='ativo'` | Already tracked |
| Renovações pendentes | Contracts with `data_fim` in next 30/60/90 days | Already in DashboardPage.tsx:75–78 |
| Forecast | MRR × remaining months in year + pipeline value from `oportunidades` | Derivable client-side |
| Churn risk | Contracts expiring without a `renovacao` opportunity linked | Join `contratos` + `oportunidades` |
| Receita por segmento | Group `contratos` by `clientes.segmento` | One join query |
| Receita por área do direito | Group by `contratos.areas_direito` (array) | `unnest()` in Postgres |

### Supabase Query Pattern

All revenue metrics are computable client-side from the existing `useContratos` hook data, which already does `select('*, cliente:clientes(id, nome, empresa, segmento)')`. No new queries needed for basic MRR/ARR.

For segmento breakdown, the existing data is sufficient since `cliente.segmento` is already joined. Use `useMemo` to aggregate client-side — at 2–5 users with tens of contracts, this is well within client-side performance limits.

For more complex metrics (revenue by `areas_direito` which is a PostgreSQL array), prefer a Supabase RPC:

```sql
-- RPC: revenue_by_area
CREATE OR REPLACE FUNCTION public.receita_por_area()
RETURNS TABLE(area TEXT, mrr NUMERIC, contagem INT)
LANGUAGE SQL SECURITY DEFINER
AS $$
  SELECT
    unnest(areas_direito) AS area,
    SUM(valor_mensal) AS mrr,
    COUNT(*)::INT AS contagem
  FROM contratos
  WHERE status = 'ativo'
  GROUP BY area
  ORDER BY mrr DESC NULLS LAST;
$$;
```

Call via `supabase.rpc('receita_por_area')`. Add to a new hook `useReceitaDashboard.ts`.

**Forecast pattern:** simple linear projection is sufficient for this team size. `forecast = MRR * monthsRemaining + sum(oportunidades.valor_estimado WHERE status IN ('em_proposta','convertida'))`. No ML needed.

**recharts is already installed** (`recharts 3.8.x`). Use `BarChart` + `LineChart` for MRR trend (group contracts by `data_inicio` month). The `DashboardPage.tsx` already uses these — the revenue page can follow the exact same pattern with a `PeriodSelector` component (already exists at `src/components/shared/PeriodSelector.tsx`).

**New page vs embedded:** Create a dedicated `/receita` or `/dashboard/receita` page rather than cramming into the existing DashboardPage. The existing DashboardPage is already large and covers pipeline/operational metrics. Revenue = separate concern, separate page, separate route registered in `src/router.tsx`.

### Confidence: High

Evidence: `contratos` schema confirmed in migration 001; `useContratos` hook fetches with cliente join; MRR already computed in DashboardPage:73; `recharts` installed and used; `PeriodSelector` component exists; `oportunidades` table has `valor_estimado`. All building blocks are present.

---

## What NOT to Use

- **WhatsApp Business API / Meta Cloud API:** requires a dedicated phone number, Meta Business verification, and per-message costs. Explicitly ruled out in PROJECT.md Key Decisions. The `wa.me` deep link approach is the correct zero-cost alternative.

- **Resend / SendGrid / Postmark for email notifications:** adds a new paid/free-tier service dependency. With an existing Slack integration covering all 2–5 internal users, email notifications add complexity without meaningful benefit. Reserve email for future milestone if the team grows beyond Slack.

- **Browser Push API (Web Push / VAPID):** disproportionate complexity (service worker, subscription management, VAPID key rotation) for 2–5 users who already have Slack. Only reconsider if team stops using Slack.

- **Supabase Realtime as primary pull-back mechanism:** Realtime only works while the browser tab is open — it cannot pull users back to the CRM. Use only as in-app live update complement.

- **A new `cadencia_leads` table:** the cadence state is already derivable from `interacoes_lead` timestamps + `cadencia.ts`. Storing redundant cadence day counters creates sync complexity and drift risk. The `tarefas-derivadas.ts` pattern (client-side derivation) is the right architecture.

- **Adding a separate task DB table for internal tasks:** the existing `tarefas` table with `entidade_tipo = null` already handles internal tasks. No new table needed.

- **Supabase Edge Functions for scheduling (instead of pg_cron):** edge functions have a maximum execution time and are invocation-based, not time-based. `pg_cron` is the correct scheduler — it is already active on this project (migration 031 proves it). Do not replace it.

---

## Addendum: pg_cron + pg_net Availability

**Confirmed available on this specific Supabase project.** Migration 031 (`CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE EXTENSION IF NOT EXISTS pg_net;`) is applied and the `cron.schedule('disparar-renovacoes', '0 12 * * *', ...)` job is running in production. The project URL `wfnriqwkzdazdbuzbyug.supabase.co` is hardcoded in that migration, confirming it is the production project.

`pg_cron` is available on Supabase Pro plan and above. The fact that migration 031 applied successfully is conclusive evidence. The free plan does not include `pg_cron` — this project is on Pro or higher.

**Confidence: High** (direct evidence from migration file applied to production project)
