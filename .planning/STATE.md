---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: — Comunicação, Portal e Inteligência
current_phase: 999.1
current_phase_name: sla-follow-up-automation-slack-google-calendar
status: phase_complete
stopped_at: Completed 999.1-01-PLAN.md
last_updated: "2026-07-15T21:59:33.057Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 19
  completed_plans: 19
  percent: 67
---

# STATE — CONSEJ CRM v2 Milestone v3.0

*Single source of truth for current project position. Updated at each phase transition.*

---

## Project Reference

**Milestone:** v3.0 — Comunicação, Portal e Inteligência
**Core value:** Completar comunicação multi-canal (Slack+Email+Push), expandir o portal do cliente e adicionar inteligência operacional (relatórios, forecast estatístico, classificação de leads) — todos com zero custo incremental
**Stack:** React 19 + Vite + Supabase (PostgreSQL + Auth + RLS + Edge Functions) + Vercel
**Constraint:** Zero custo incremental (preservado da v2.0)

Archives da última milestone: [v2.0-ROADMAP.md](./milestones/v2.0-ROADMAP.md) · [v2.0-REQUIREMENTS.md](./milestones/v2.0-REQUIREMENTS.md)

---

## Current Position

Phase: 999.1 (sla-follow-up-automation-slack-google-calendar) — EXECUTING
Plan: 6 of 6
**Current phase:** 999.1
**Phase numbering:** continua da v2.0 (5, 6, 7, 8, 9, 10)
**Phase status:** Phase 5 fechada. UAT 7/7 pass, UI audit 20/24 (sem blockers de produção exceto reenviar-sem-confirmação flagado), SECURITY 7/7 threats (T-05-01..07) verified. Backend multi-canal deployed (6 edge functions), migration 035 em prod, UI interna + portal placeholder shipped. CORS fix inline durante UAT (a760c96).
**Milestone status:** v3.0 Active, **1/6 phases complete (16%)**

```
Progress: [███░░░░░░░░░░░░░░░░░] 16% (1/6 phases complete)
```

---

## Phase Summary

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 5 | Multi-Channel Notifications (Email) | EMAIL-01..04 | ✅ Complete |
| 6 | PWA + Push Notifications | PUSH-01..04 | Not started |
| 7 | Client Portal Expansion | PORTAL-01..04 | Not started |
| 8 | Individual Performance Reports | REP-01..04 | Not started |
| 9 | Forecast Linear Regression | ML-01..04 | Not started |
| 10 | Smart Lead Classification | CLASS-01..05 | Not started |

---

## Key Decisions (v3.0)

| Decision | Rationale | Phase |
|----------|-----------|-------|
| Resend free tier (100/dia, 3k/mês) para e-mail | Zero custo até o limite; alternativa Supabase Auth tem só 4/hora | Phase 5 |
| Notion explicitamente fora | CONSEJ não usa Notion (decisão do usuário, 2026-05-27) | Out of Scope |
| Push via Web Push Protocol + VAPID | Gratuito (browser push services); funciona Chrome Android + Safari iOS 16.4+ | Phase 6 |
| Supabase Storage `cliente-docs` no free tier 1GB | Quota suficiente para volume CONSEJ atual; LRU se aproximar do limite | Phase 7 |
| PDF gerado client-side (jspdf ou react-pdf + html2canvas) | Sem servidor de PDF; bundle +~150kb aceitável | Phase 8 |
| Forecast regressão linear via `ml-regression-simple-linear` (~4KB) | Estatística honesta com banda 80% CI; sem ML pesado | Phase 9 |
| Classificação de leads via heurísticas determinísticas (sem API) | Zero custo; auditável; alinhado com pattern do DiagnosticForm existente | Phase 10 |
| Phase numbering continua da v2.0 (5-10, não 1-6) | Histórico contínuo de phases através do projeto facilita rastreabilidade entre milestones | Roadmap |

---

## Accumulated Context

### Blockers

*(nenhum atualmente)*

### Todos por fase

**Phase 5 (pre-start):**

- ✅ Conta Resend free criada + API key registrada como Supabase Secret `RESEND_API_KEY` (2026-05-27)
- ✅ Decisão sender domain: usar `onboarding@resend.dev` (default Resend) em dev e prod inicialmente. Migrar para `notif@consej.com.br` quando DNS estiver configurado — bloqueado por credencial do Registro.br (contato Andrieli `comunicacao.consej@gmail.com`)
- Migration 035: tabela `notificacoes_envios` (histórico) + coluna `perfis.preferencias_notif` (JSONB)
- Templates HTML simples em PT-BR para cada tipo de notif (tarefa/cadência/renovação/indicação)

**Phase 6 (pre-start):**

- Gerar VAPID keys (lib `web-push`) e adicionar `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` como Supabase Secrets
- Criar `public/sw.js` Service Worker minimal + `public/manifest.json` PWA + ícones 192/512
- Testar install prompt em Chrome Android e Safari iOS 16.4+ reais

**Phase 7 (pre-start):**

- Criar Supabase Storage bucket `cliente-docs` com RLS policy "cliente vê só os seus"
- Migration 036: tabela `cliente_doc_aprovacoes` (id, doc_path, status, timestamps, cliente_id, consultor_id)

**Phase 8 (pre-start):**

- Decidir lib: `jspdf + html2canvas` vs `react-pdf` (bundle size + qualidade do gráfico renderizado)

**Phase 9 (pre-start):**

- Adicionar `ml-regression-simple-linear` ao package.json OU implementar artesanalmente (~30 linhas)

**Phase 10 (pre-start):**

- Migration 037: coluna `configuracoes.lead_classifier_weights` (JSONB) com defaults
- Definir conjunto de heurísticas em conversa com o usuário (alinhar com domínio CONSEJ)

### Validated assumptions

- Resend free tier suficiente para CONSEJ (volume estimado <30 e-mails/dia)
- iOS 16.4+ tem suporte a Web Push (lançado março/2023; cobertura ampla em 2026)
- Supabase Storage 1GB suficiente para volume atual de documentos cliente
- recharts renderiza limpo em PDF via html2canvas (verificado em projetos similares)

---

## Performance Metrics (v3.0 targets)

| Metric | Target | Current |
|--------|--------|---------|
| Consultor sem Slack ainda recebe notif (via email/push) | 100% | 0% (só Slack hoje) |
| Cliente envia documento sem WhatsApp/email manual | >50% adoção em 60d | 0% |
| Coordenador exporta PDF para 1:1 | usado mensalmente | indisponível |
| Forecast Receita: erro médio CI80 | <15% no plano de 3m | indisponível |
| Lead classificado dentro de 1s no abrir do Kanban | <1s | indisponível |

---
| Phase 999.1 P01 | 35m | 3 tasks | 6 files |
| Phase 999.1 P02 | ~20m | 3 tasks | 4 files |
| Phase 999.1 P03 | 30m | 2 tasks | 3 files |
| Phase 999.1 P06 | ~15m | 2 tasks | 2 files |
| Phase 999.1 P05 | 12min | 2 tasks | 6 files |

## Session Continuity

**Last session:** 2026-07-15T21:56:47.608Z
**Stopped at:** Completed 999.1-01-PLAN.md
**Resume file:** None

**Last action:** Phase 6 CONTEXT.md escrita em 2026-05-28 via `/gsd-discuss-phase 6` (commit `be4e3f8`). 16 decisões locked (D-01..D-16) cobrindo subscription storage (tabela `push_subscriptions` multi-device, DELETE no 410 Gone, sem master switch), edge function shape (helper `_shared/push.ts` reinterpretando PUSH-03, `web-push@3.6.7` via esm.sh, VAPID em Supabase Secrets), PWA install UX (banner topo + card em `/me/preferencias`, reusar `logo.png`, SW minimal), e permission/iOS gate (request no toggle, iOS Safari standalone-only, deep link via `?highlight=<id>`). 13 ideias deferidas registradas explicitamente.
**Next action:** `/gsd-plan-phase 6` — research → plan → verify. Pré-requisitos manuais antes de `/gsd-execute-phase 6`: (1) `npx web-push generate-vapid-keys` → setar `VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` como Supabase Secrets; (2) setar `VITE_VAPID_PUBLIC_KEY` no env Vercel.
**Open questions:** nenhuma — discussão cobriu as 4 áreas (storage, function shape, install UX, permission timing).

## Tech Debt

| Item | Origem | Bloqueio | Plano |
|------|--------|----------|-------|
| Migrar sender `resend.dev` → `notif@consej.com.br` | Phase 5 | Credencial Registro.br (Andrieli — `comunicacao.consej@gmail.com`) | Quando contato com Andrieli destravar: adicionar 3 registros DNS (TXT DKIM + MX feedback + TXT SPF no subdomínio `send`), verificar via Resend API, atualizar edge function para usar novo from address. Domínio `consej.com.br` já está cadastrado no Resend (id `3b6472fc-b277-42ed-a22f-2dc41dab81d7`, status `not_started`) — só falta DNS. |
| `supabase db push` falha com `42501: permission denied to alter role cli_login_postgres` | Phase 5 (descoberto no Plan 05-01) | DB user do projeto não tem CREATEROLE — CLI v2.101.0 tenta rotacionar role temporária pra cada push. | **Fix permanente:** pegar DB password em `https://supabase.com/dashboard/project/wfnriqwkzdazdbuzbyug/settings/database` (seção "Database password" — reset se não souber), depois `setx SUPABASE_DB_PASSWORD "<password>"` (PowerShell, persistente) e reiniciar shell. **Fix per-comando:** `supabase db push -p "<password>"`. **Workaround atual:** aplicar migrations via Supabase Studio SQL Editor (https://supabase.com/dashboard/project/wfnriqwkzdazdbuzbyug/sql/new). |

---

*Last updated: 2026-05-27 after v3.0 kickoff*

## Decisions

- [Phase 999.1]: SLA clock keyed on leads.status change (never leads.updated_at) — D-02
- [Phase 999.1]: google_calendar_tokens RLS is zero-read: no SELECT policy for authenticated at all, not even the owner (T-999.1-01) — status exposed only via google_calendar_status() RPC
- [Phase 999.1]: getValidAccessToken refreshes with a 2-minute expiry buffer and returns null (never throws) when the refresh_token is revoked — caller degrades to Slack-only follow-up
- [Phase ?]: CAS-first dispatch: UPDATE ... WHERE x_sent_at IS NULL RETURNING é o literal primeiro statement antes de qualquer Slack/Calendar (Plan 03)
- [Phase ?]: Escalação sem SLACK_GERENCIA_CHANNEL_ID faz fail-safe (skip) e nunca fail-open, D-04 (Plan 03)
- [Phase 999.1]: SlaFollowupConfig: fases configuraveis derivadas de SLA_EXCLUDED_STAGES (sla-followup.ts), sem redeclarar; gating gerente+ via RequireRole; merge nao-destrutivo de metas ao salvar
- [Phase ?]: useCapturarTokenGoogle upsert usa returning minimal (sem .select()) porque google_calendar_tokens não tem policy SELECT
- [Phase ?]: Captura do refresh token usa useRef como guarda extra além do query param, defesa em profundidade para segredo de uso único
