# Pitfalls Research
**Date:** 2026-05-26
**Project:** CONSEJ CRM v2 — Milestone 2 (Adoção & Crescimento)
**Confidence:** HIGH (project-specific context from codebase + CONCERNS.md; domain findings from training knowledge at HIGH confidence for established patterns)

---

## Adoption Initiative Pitfalls

- **"Announce and forget" launch** — Team is told a feature exists, uses it once, forgets it exists. Warning sign: adoption metrics spike on day 1, crash by day 5. Prevention: build a reason to return *into* the feature itself (e.g., daily task count badge, "X leads need attention today" surfaced on login). Phase to address: every feature in Milestone 2 must have a pull-back hook, not just a landing page.

- **Feature solves the wrong pain** — Gestor builds what they think the team needs vs what the team actually avoids. Warning sign: team says "I liked the old way" or ignores the feature silently. Prevention: before building each feature, confirm friction point is real by reviewing audit log of current behavior (login frequency, page visit frequency — already trackable via existing `audit_logs`). Phase to address: Phase 1 should instrument adoption visibility first so later phases can be validated.

- **Too many places to register the same thing** — If tasks, cadence tracking, and lead status updates each live in different UIs, consultors will pick one and abandon the others. Warning sign: one module has 100% adoption, others 0%. Prevention: consolidate the daily action into a single "my work today" surface that links out; do not scatter state across tabs. Phase to address: task system and cadence guide must be co-located or linked from the same entry point.

- **No visible personal value to the user** — If the CRM only benefits the gestor (reporting), consultors see it as overhead. Warning sign: gestor loves it, consultor never opens it. Prevention: every feature built in Milestone 2 must give the consultor something useful *to them* — not just data capture. Example: WhatsApp deep link saves the consultor time composing the message; task list tells them what to do, not just what to report. Phase to address: task guide and cadence prompts must reduce decision fatigue, not add form fields.

- **Permission and role confusion on day-1 of new feature** — A new table ships, RLS defaults to `authenticated_all` (exactly what `014_tarefas.sql` did — policy `"authenticated_all" ON tarefas FOR ALL TO authenticated USING (true)`), leaving data accessible to both `interno` and `cliente` portal users. Warning sign: portal user can read team's internal tasks. Prevention: never ship a new table with `authenticated_all`; always use `is_interno()` guard or explicit role policy. Phase to address: every new migration in Milestone 2.

- **Data quality loop not closed** — Team registers incomplete leads (missing phone, no company, no source). CRM data stays dirty. Analytics built on dirty data surface wrong conclusions to gestor. Warning sign: dashboard shows 0 conversions but team insists deals were closed. Prevention: require minimum fields on lead creation using zod validation (already missing — only `NewLeadModal` uses zod); add adoption dashboard showing % leads with complete data. Phase to address: adoption visibility dashboard + form hardening.

---

## Task System Pitfalls

- **Too many required fields on task creation** — If creating a task takes more than 3 clicks (title + due date + confirm), consultors will not create tasks during calls or right after a meeting. The existing `tarefas` schema has 12+ columns; creation modal must expose only `titulo`, `data_vencimento`, and `atribuido_a_id` by default, with optional fields collapsed. Prevention: progressive disclosure — minimal mandatory, rest optional behind "more options".

- **"Another list to check"** — If tasks live only on a dedicated `/tarefas` page, they become invisible unless the user navigates there. Prevention: embed task count/badge in the lead detail page, in the sidebar nav item, and on the home dashboard. `useMinhasTarefas` already filters by user and status — use this on the dashboard directly.

- **Task system that doubles as a reporting tool** — Asking consultors to fill in `notas`, `tipo`, and `prioridade` on every task turns tasks into data entry. Prevention: `tipo` and `prioridade` should default to sensible values (`generica`, `media`) and only be shown when editing, not creating.

- **No "done today" satisfaction signal** — Completing a task should feel good. Without a visual celebration (even a strikethrough animation or count decrement in nav), consultors don't feel progress. Prevention: optimistic UI on `useConcluirTarefa` so the task disappears immediately on click; add count badge that visually decrements.

- **`useTarefas()` fetches ALL tasks globally with `select('*')`** — At 2-5 users each with 10+ tasks, this is fine. If tasks scale (cadence auto-creates D3/D5/D7/D10 tasks per lead), this becomes 500+ rows loaded on every mount. Prevention: always use `useMinhasTarefas(userId)` for the personal view; use `useTarefasByEntidade` for the lead detail view; use `useTarefas()` only in the admin adoption dashboard. Do not use the global hook as the default on the main task UI.

- **Task notification on every INSERT triggers Slack DM flood** — The `notify-tarefa` edge function fires on every INSERT where `atribuido_a_id != NULL`. If the cadence system auto-creates tasks for D3/D5/D7/D10 (4 tasks per lead), a batch import of 10 leads creates 40 DMs at once. Prevention: add a `notificar` boolean column (default `true`) to `tarefas`; auto-created cadence tasks set `notificar = false` or add a 5-minute delay/batching gate. Alternative: notify only when the task is actually overdue, not on creation.

---

## Notification Fatigue

- **Same channel for every event type** — Renovações, atribuições de tarefas, indicações, e pull-back de leads estagnados all posting to the same Slack channel or DM thread. Team mutes the bot within a week. Prevention: use Slack DM (personal) only for direct assignments (`notify-tarefa`); use a shared leads channel only for renovações and high-urgency items. Never use the same channel for both operational alerts and reminders.

- **Daily reminder at the same time every day** — Fixed-time reminders become invisible ("the 9am bot message" becomes wallpaper). Prevention: vary trigger by event state, not clock — alert when a lead has been stagnant for N days, not every morning. Already partially addressed: `cron_disparar_renovacoes` fires at 30/14/7 days before expiry, which is event-driven, not daily.

- **No snooze or dismiss** — If the team cannot acknowledge an alert ("I know, I'm handling it"), they learn to ignore all alerts. Prevention: Slack action buttons (already present in `notify-renovacao` and `notify-tarefa`) should include a "dismiss" or "marcar como visto" button that updates a `viewed_at` column; otherwise the same contract shows up in alerts every run.

- **Notification without a direct action link** — Alert fires, user opens Slack, does not know what to do next, closes Slack. Prevention: every Slack block must have a direct "Abrir no CRM" button linking to the specific entity (lead, contrato, tarefa). Already done in `notify-renovacao` and `notify-tarefa` — maintain this pattern in all new notification types.

- **WhatsApp pull-back links sent via WhatsApp itself** — A wa.me link sent to a user's own WhatsApp asking them to open the CRM is confusing and feels like spam. Prevention: pull-back notifications must use the channel the team already monitors for work (Slack); WhatsApp deep links are for *outbound* lead contact, not *internal* team pull-back.

- **Notification volume scales with team activity, not need** — Every task assigned = 1 DM. Team creates 20 tasks/day = 20 DMs. Prevention: batch notifications within a time window (e.g., "3 novas tarefas atribuídas a você — ver todas" instead of 3 individual DMs). Requires buffering logic in the edge function or a separate digest job.

---

## Revenue Dashboard Pitfalls

- **MRR shown without context** — Displaying R$ 8.000/mês MRR tells nothing without trend, target, or composition. Vanity metric. What to do instead: show MRR delta vs previous period + breakdown by tipo (assessoria vs consultoria) + count of active contracts. The `DashboardPage` already computes `mrr` and `renewalsSoon` — use these in combination, not isolation.

- **Gross revenue vs net receivable confusion** — Contracts with `valor_total` (lump sum consultoria) vs `valor_mensal` (recurring assessoria) are apples and oranges. Showing both summed as "faturamento" is misleading. What to do instead: separate one-time revenue (consultoria fechada no período) from recurring MRR (assessoria ativa). Already partially done in ICP scoring (ganhos diretos vs atribuíveis) — apply same separation in revenue dashboard.

- **Win rate over all time** — Reporting "30% conversion rate" over 2 years of accumulated data hides that the last month was 10% (or 50%). What to do instead: filter conversion rate by the same period selector already in `DashboardPage` (`PeriodSelector`). `convRate` is already period-filtered — ensure the revenue dashboard uses the same filter, not a hardcoded `total` view.

- **"Leads ativos" as a health metric** — A consultor can mark 50 leads as "classificação" without ever following up. Active lead count is a vanity metric. What to do instead: use stagnant leads count (already computed in `DashboardPage` — `stagnantLeads`) and cadence overdue count as the actionable signal. The revenue dashboard should show "leads em risco de perda" not "leads ativos".

- **Forecast based on pipeline total** — Summing all lead deal sizes in the pipeline as "forecast" overestimates by 5-10x. What to do instead: apply ICP win rate per stage (already computed in ICP scoring module) to weight pipeline value. `ProjecaoFechamento` component already exists — confirm it uses weighted probabilities, not raw totals.

- **Renovações pendentes shown as risk but no owner** — Dashboard shows "3 contratos vencem em 30 dias" but no assignment. Nobody acts. What to do instead: tie the renewal alert directly to a task creation ("criar tarefa de renovação") so it leaves the dashboard and becomes an owned action item.

---

## WhatsApp Deep Link Gotchas

- **Phone number without country code** — `wa.me/84999999999` fails silently (opens WhatsApp but cannot resolve the contact). Fix: always prefix with `55` (Brazil) — `wa.me/5584999999999`. Strip all non-digits from the stored phone before building the URL. Phone numbers in the CRM currently have no enforced format (only `NewLeadModal` uses zod, and even there phone validation may not include country code prefix logic).

- **Phone stored with formatting characters** — Numbers stored as `(84) 99999-9999` or `+55 (84) 99999-9999` will break the URL if concatenated directly. Fix: in the link-builder utility, run `phone.replace(/\D/g, '')` then prefix `55` if the result doesn't already start with `55`.

- **Message text with unencoded special characters** — Portuguese messages with `ã`, `ç`, `é`, `?`, `&` in the pre-text will corrupt the URL if not encoded. `wa.me/55...?text=Olá João, tudo bem?` breaks at the `?` inside the message. Fix: always `encodeURIComponent(message)` before appending to `?text=`. Do not manually escape — use the browser's native encoder.

- **iOS vs Android URL scheme difference** — On iOS, `https://wa.me/...` opens WhatsApp reliably. On Android, both `https://wa.me/...` and `whatsapp://send?phone=...&text=...` work, but the native scheme may open faster. Fix: use the `https://wa.me/` scheme universally — it works on both platforms and does not require the app to be registered as a URI handler.

- **Message length limit** — WhatsApp pre-fills up to ~4096 characters in the text field, but very long messages (D10 cadence with full context) may be silently truncated or cause the link to not open on some Android versions. Fix: keep pre-filled cadence messages under 500 characters. The full template lives in `MensagensPage`; the deep link should use a short version (first paragraph only).

- **Group number vs personal number** — If the stored phone in the lead is a company PABX or WhatsApp Business group number, the deep link will open a conversation with that group/business, not the individual contact. Fix: UI should warn if the number doesn't match Brazilian mobile number format (starts with 9 in the 9th digit position for mobile, e.g., `55849XXXXXXXX` where position 5 = 9).

- **WhatsApp not installed** — On desktop, `wa.me` redirects to `web.whatsapp.com` automatically. On mobile without WhatsApp installed, it redirects to the app store. This is expected behavior — no fix needed, but the UI should make the CTA label clear ("Abrir WhatsApp") rather than "Enviar mensagem" to set expectations.

---

## Supabase-Specific

- **New table ships without RLS enabled** — The pattern in this codebase: `014_tarefas.sql` enables RLS (`ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY`) but uses `"authenticated_all" ON tarefas FOR ALL TO authenticated USING (true)` — which means portal `cliente` users can read and write all tasks. Prevention: the standard pattern for new Milestone 2 tables must be `is_interno()` policy, not `authenticated_all`. Audit every new migration before applying.

- **Migration numbering gap** — Migrations jump from 016 to 019 (017, 018 missing). If those were applied via SQL Editor and not committed, a fresh dev environment will be missing them silently — no error, just missing schema. Prevention: use `supabase db diff` after every SQL Editor change to capture it as a numbered migration immediately. Never apply schema changes outside the migration file flow.

- **N+1 in dashboard aggregations** — `DashboardPage` loads full `leads`, `clientes` (with joined `contratos(*)`), `contratos`, `indicacoes`, `oportunidades`, and `reunioes` — six independent queries, all `select('*')`, all on mount. For a 2-5 person team with <200 rows this is fine. For Milestone 2 features (tasks, cadence data), adding 2+ more unbounded queries will start to feel slow. Prevention: for the revenue dashboard, use a Postgres RPC or view that pre-aggregates MRR, won count, and renewal count server-side, returning 5 numbers instead of 500 rows.

- **`useTarefas()` global select invalidates on every mutation** — `useCreateTarefa`, `useUpdateTarefa`, `useConcluirTarefa`, `useDeleteTarefa` all invalidate `QUERY_KEYS.tarefas.all`. This refetches the full tasks list for every operation. With optimistic UI this is invisible today, but as tasks grow (auto-cadence tasks), this becomes a 200-row refetch on every checkbox click. Prevention: also invalidate `QUERY_KEYS.tarefas.mine(userId)` selectively on the mutations that belong to that user, and use `setQueryData` for instant optimistic updates before the refetch settles.

- **`audit_logs` insert is fire-and-forget** — `useCreateLead` and `useUpdateLeadStatus` do not await the audit insert and discard errors (confirmed in CONCERNS.md lines 69-73). Any new Milestone 2 feature that writes to `audit_logs` must await with `try/catch` or use a queued pattern. Prevention: the adoption visibility dashboard depends on audit log completeness — silent audit gaps will make the dashboard unreliable.

- **Supabase Vault secret absent crashes the cron** — `cron_disparar_renovacoes` raises `WARNING` and returns early if `webhook_renovacao_secret` is absent from Vault. No error propagation. If the secret rotates in Vercel/Supabase but not in Vault, cron silently stops sending notifications. Prevention: add an alerting query to a monitoring table when `v_secret IS NULL` (or use `RAISE EXCEPTION` instead of `WARNING`); add a manual test invocation after any secret rotation.

- **Realtime subscriptions without RLS-aligned filters** — If Milestone 2 adds Supabase Realtime for live task updates (`supabase.channel('tarefas').on('postgres_changes', ...)`), the client-side filter must match the RLS policy. Without `filter: 'atribuido_a_id=eq.{userId}'`, all authenticated users receive all task change events even if RLS hides the rows on direct query — Realtime channels bypass row-level RLS filtering unless explicitly configured with channel-level auth. Prevention: always use `filter` param in Realtime subscriptions; verify with the dark RLS test suite once QA users are provisioned.

- **Edge Function cold-start delays notification delivery** — `notify-tarefa` and `notify-renovacao` run on Supabase Edge Functions with potential cold-start latency (200-800ms) on the first invocation after inactivity. For a webhook triggered by a database insert, this delay is acceptable. For a cron job calling 20+ contracts in sequence, sequential `net.http_post` calls can accumulate. Prevention: `cron_disparar_renovacoes` already uses async `net.http_post` (fire-and-forget from PL/pgSQL) — verify that `pg_net` actually handles concurrent requests, not a serial queue.

---

## Launch Without Onboarding

- **Feature goes live, nobody knows where it is** — Consultor logs in, sees nothing different (new tab in nav or new section on dashboard not obviously visible). Usage stays at 0. Mitigation: on first login after a feature is deployed, show a one-time tooltip or highlight (coachmark) on the new element. The existing `onboarding_wizard` table/mechanism should be extended with a `feature_flags_seen` column per user to gate first-time coachmarks.

- **The new feature requires data that doesn't exist yet** — Task system launches, but no tasks exist. Dashboard launches, but no revenue data is entered. The empty state looks broken. Mitigation: every new UI surface must have a designed empty state with a clear CTA ("Criar primeira tarefa" / "Adicionar contrato"). Do not ship a feature whose empty state is a blank box.

- **No adoption feedback loop for the gestor** — Gabriel (gestor) cannot see who is using the new features. Mitigation: the adoption visibility dashboard must be the first sub-feature deployed in Milestone 2 — it gives the gestor the signal to see if the other features are being picked up, and gives consultors social proof ("equipe registrou 12 atividades hoje").

- **Training is a one-time event** — If the team is shown how to use a feature in a meeting, they'll forget 60% of it by the next day. Mitigation: embed the instructions inside the product itself (contextual help tooltip, inline example). For the cadence guide, the "o que fazer agora" suggestion per lead must be self-explanatory without any external documentation.

- **Rollout to all users at once when feature has bugs** — A broken new feature on day 1 creates lasting distrust ("that thing never works"). Mitigation: deploy behind a feature flag (a boolean in `configuracoes` table — `id = 'default'` row, add a JSONB `feature_flags` column) that the gestor can toggle. Enables testing in production with one user before full rollout. This also means bugs are isolated, not team-wide.

- **Feature competes with existing workflow** — If consultors already use a WhatsApp group to track tasks, a new in-CRM task system feels redundant and duplicative. Mitigation: the task system must integrate with the existing Slack notification flow (already wired via `notify-tarefa`). Show task assignments where the team already lives (Slack), not only inside the CRM. The Slack DM with "Abrir no CRM" button is the bridge.

---

## Sources

- Project context: `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md` (HIGH confidence — direct codebase analysis)
- `supabase/functions/notify-tarefa/index.ts`, `supabase/functions/notify-renovacao/index.ts` (HIGH confidence — direct code review)
- `supabase/migrations/014_tarefas.sql`, `supabase/migrations/021_lockdown_rls.sql`, `supabase/migrations/031_cron_renovacoes.sql` (HIGH confidence — direct migration review)
- `src/hooks/useTarefas.ts`, `src/pages/DashboardPage.tsx` (HIGH confidence — direct code review)
- CRM adoption failure patterns: established industry knowledge (MEDIUM confidence — well-documented in SaaS literature, aligned with project-specific evidence)
- Notification fatigue patterns: established UX research (MEDIUM confidence)
- WhatsApp deep link behavior: documented wa.me spec + known iOS/Android quirks (MEDIUM confidence)
- Supabase RLS + Realtime behavior: Supabase documentation patterns (HIGH confidence for RLS; MEDIUM for Realtime channel-level auth, flag for phase-specific verification)
