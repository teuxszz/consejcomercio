---
phase: 3
slug: pull-back-notifications
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm run test -- --reporter=dot` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --reporter=dot`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | NOTIF-01 | — | DM só enviada ao responsável correto; sem vazamento entre usuários | manual | Supabase webhook log / Slack DM | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | NOTIF-02, NOTIF-03 | T-03-02-08 | Lógica de elegibilidade (D-point + exclusão terminal) documentada em TS espelha a query PL/pgSQL; sem regressão em testes existentes | unit | `npm run test -- src/lib/__tests__/cadencia.test.ts --reporter=dot` | ✅ existente (estendido) | ⬜ pending |
| 03-02-02 | 02 | 1 | NOTIF-02, NOTIF-03 | T-03-02-01, T-03-02-02, T-03-02-03, T-03-02-04, T-03-02-05, T-03-02-08 | Resumo só enviado para consultores internos com `slack_user_id`; alerta de cadência só para leads com D-point ∈ {1,3,5,7,10} e fora dos estágios terminais; secrets nunca hardcoded | static (grep gates) | `test -f ... && grep -q ...` (ver `<automated>` em PLAN 03-02 Task 2) | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | NOTIF-02, NOTIF-03 | T-03-02-01, T-03-02-06 | Cron real dispara DM observável; `net._http_response` registra status 200; log de deploy auditável | integration (manual + automated grep) | `grep -q "resumo-diario-consultores" .planning/phases/03-pull-back-notifications/03-02-CRON-DEPLOY-LOG.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Nota:** NOTIF-02 e NOTIF-03 residem inteiramente no PLAN **03-02** (não no 03-01). O PLAN 03-01 trata exclusivamente de NOTIF-01 (verificação/configuração do Database Webhook para `notify-tarefa`). As três tasks do PLAN 03-02 implementam de forma vertical:
- **03-02-01** — testes TS que espelham a regra de elegibilidade do cron (NOTIF-02 + NOTIF-03)
- **03-02-02** — edge function `notify-resumo-diario` + migration `034_cron_resumo_diario.sql` (NOTIF-02 + NOTIF-03)
- **03-02-03** — deploy + smoke tests + log auditável (NOTIF-02 + NOTIF-03 validados em produção)

---

## Wave 0 Requirements

- [ ] Verificar Database Webhook configurado para `notify-tarefa` no dashboard Supabase (cobre NOTIF-01 / task 03-01-01)
- [ ] Criar `webhook_resumo_secret` no Supabase Vault antes de aplicar migration 034 (pré-requisito da task 03-02-03)
- [ ] Confirmar `SELECT DISTINCT status FROM leads` em produção para decidir tratamento de `'stand_by'` (pré-decisão da task 03-02-02)

*A maioria das verificações desta fase é manual (DMs Slack, pg_cron execution). Infraestrutura de teste existente cobre lógica auxiliar via `cadencia.test.ts`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Task | Why Manual | Test Instructions |
|----------|-------------|------|------------|-------------------|
| DM Slack ao atribuir tarefa | NOTIF-01 | 03-01-01 | Requer webhook de plataforma + Slack real | Criar tarefa com responsável diferente → verificar DM no Slack do responsável |
| Resumo matinal via pg_cron | NOTIF-02 | 03-02-03 | pg_cron executa em cloud Supabase | Verificar logs do cron em `cron.job_run_details`; disparar manualmente via `SELECT public.cron_resumo_diario()`; observar `net._http_response` |
| Alerta de cadência D-point | NOTIF-03 | 03-02-03 | Depende de leads reais com interações ou recém-criados + hora do servidor | Inserir interação datada há 3 dias em lead de teste → `SELECT public.cron_resumo_diario()` → confirmar DM recebida com `(D3)` |
| Edge function `notify-resumo-diario` | NOTIF-02/03 | 03-02-03 (Subpasso 6) | Deno runtime no Supabase cloud | `curl -X POST .../functions/v1/notify-resumo-diario` com payload de teste e Bearer do Vault |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
