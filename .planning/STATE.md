---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: comunicacao-portal-inteligencia
current_phase: 06
status: phase_complete
last_updated: "2026-05-27T21:00:00.000Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 16
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

Phase: 05 (multi-channel-notifications-email) — ✅ COMPLETE
Plan: 4 of 4 complete
**Current phase:** 05 (closed) → próxima Phase 06 (PWA + Push Notifications)
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

## Session Continuity

**Last action:** Phase 5 **fechada formalmente** em 2026-05-27. Stack final: UAT 7/7 pass (CORS fix inline em commit `a760c96`), UI audit 20/24 (`28f3a1b`), SECURITY 7/7 threats verified — `T-05-01` HMAC svix manual + replay 5min, `T-05-02` escapeHtml em 4 templates, `T-05-03` quota banner coord+ + Resend 429, `T-05-04` RLS role-aware + dual-client edge, `T-05-05` magic link via `admin.generateLink`, `T-05-06` findDiretores idempotente, `T-05-07` self-loop guard + webhook secret.
**Next action:** `/gsd-plan-phase 6` ou `/gsd-execute-phase 6` — Phase 6 (PWA + Push Notifications). Pré-requisitos: gerar VAPID keys + setar `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` como Supabase Secrets (ver Phase 6 pre-start no STATE.md).
**Open questions:** nenhuma — Phase 5 100% closed (verify + UI + security todos verdes).

## Tech Debt

| Item | Origem | Bloqueio | Plano |
|------|--------|----------|-------|
| Migrar sender `resend.dev` → `notif@consej.com.br` | Phase 5 | Credencial Registro.br (Andrieli — `comunicacao.consej@gmail.com`) | Quando contato com Andrieli destravar: adicionar 3 registros DNS (TXT DKIM + MX feedback + TXT SPF no subdomínio `send`), verificar via Resend API, atualizar edge function para usar novo from address. Domínio `consej.com.br` já está cadastrado no Resend (id `3b6472fc-b277-42ed-a22f-2dc41dab81d7`, status `not_started`) — só falta DNS. |
| `supabase db push` falha com `42501: permission denied to alter role cli_login_postgres` | Phase 5 (descoberto no Plan 05-01) | DB user do projeto não tem CREATEROLE — CLI v2.101.0 tenta rotacionar role temporária pra cada push. | **Fix permanente:** pegar DB password em `https://supabase.com/dashboard/project/wfnriqwkzdazdbuzbyug/settings/database` (seção "Database password" — reset se não souber), depois `setx SUPABASE_DB_PASSWORD "<password>"` (PowerShell, persistente) e reiniciar shell. **Fix per-comando:** `supabase db push -p "<password>"`. **Workaround atual:** aplicar migrations via Supabase Studio SQL Editor (https://supabase.com/dashboard/project/wfnriqwkzdazdbuzbyug/sql/new). |

---

*Last updated: 2026-05-27 after v3.0 kickoff*
