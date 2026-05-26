---
phase: 03-pull-back-notifications
plan: 01
subsystem: infra
tags: [slack, supabase-webhook, edge-function, notify-tarefa, notif-01]

requires:
  - phase: 01-tasks-adoption-signal
    provides: "Coluna `notificar boolean DEFAULT true` em `tarefas` (migration 033) e `perfis.slack_user_id` (migration 030)"
  - phase: 02-cadence-guide-whatsapp-quick-actions
    provides: "Nenhuma dependência direta — phase 3 é extensão de infra"

provides:
  - "Template de evidência auditável 03-01-NOTIF01-WEBHOOK-CHECK.md para registro do webhook e smoke tests"
  - "Instruções claras de como configurar o Database Webhook no Supabase Dashboard para notify-tarefa"

affects: [03-pull-back-notifications/03-02]

tech-stack:
  added: []
  patterns:
    - "Database Webhook Supabase → Edge Function (event-driven, sem código de disparo)"
    - "Registro de evidência de configuração de plataforma em .planning/ como artifact auditável"

key-files:
  created:
    - ".planning/phases/03-pull-back-notifications/03-01-NOTIF01-WEBHOOK-CHECK.md"
  modified: []

key-decisions:
  - "NOTIF-01 é tratado como já implementado em código (notify-tarefa/index.ts) — tarefa é 100% configuração de plataforma no Supabase Dashboard"
  - "Arquivo de evidência template criado com campos a preencher após verificação manual — não inventar request_id ou resultados de smoke test"

patterns-established:
  - "Evidência de configuração de plataforma: criar arquivo template com parâmetros esperados, campos para preencher e instruções step-by-step"

requirements-completed: []

duration: 15min
completed: 2026-05-26
---

# Phase 3 Plan 01: NOTIF-01 Webhook Check Summary

**Template de evidência auditável criado para verificação/configuração do Database Webhook Supabase → notify-tarefa, aguardando preenchimento manual pelo usuário**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-26T00:00:00Z
- **Completed:** 2026-05-26 (parcial — aguardando checkpoint humano)
- **Tasks:** 1 de 1 (em andamento — requer verificação manual)
- **Files modified:** 1

## Accomplishments

- Template de evidência `03-01-NOTIF01-WEBHOOK-CHECK.md` criado com todos os parâmetros esperados do webhook, instruções de configuração e checklist de smoke tests
- Código da edge function `notify-tarefa` verificado — NOTIF-01 já está 100% implementado em código (opt-out `notificar=false`, DM para INSERT/UPDATE com `atribuido_a_id` não nulo, auth timing-safe)
- Migrations 030 e 033 confirmadas — `perfis.slack_user_id` e coluna `notificar boolean DEFAULT true` em `tarefas` existem em produção

## Task Commits

1. **Task 1: Template de evidência para NOTIF-01** - `5995dfe` (docs)

## Files Created/Modified

- `.planning/phases/03-pull-back-notifications/03-01-NOTIF01-WEBHOOK-CHECK.md` — Template de registro com parâmetros do webhook, instruções de configuração e campos para smoke tests

## Decisions Made

- NOTIF-01 é tratado como já implementado em código — tarefa é integralmente configuração de plataforma (Database Webhook no Supabase Dashboard)
- Arquivo de evidência criado com template (campos a preencher após verificação manual) — não fabricar request_id ou resultados de smoke test

## Deviations from Plan

Nenhuma — o plano explicita que é tarefa de verificação/configuração manual com human-check obrigatório.

## Checkpoint Humano Necessário

Esta task tem um `<human-check>` explícito na verificação. Para completar NOTIF-01:

1. **Verificar Database Webhook:** Acesse [Supabase Dashboard → Database → Webhooks](https://supabase.com/dashboard/project/wfnriqwkzdazdbuzbyug/database/hooks)
   - Confirme webhook com source table `tarefas`, eventos INSERT+UPDATE, URL `notify-tarefa`, header `Authorization: Bearer <WEBHOOK_TAREFA_SECRET>`
   - Se não existir: criar conforme instruções em `03-01-NOTIF01-WEBHOOK-CHECK.md`

2. **Smoke Test 1 (notificar=true):** Criar tarefa atribuída a consultor com `slack_user_id` mapeado → confirmar DM recebida no Slack em < 30s → copiar `request_id` do log do webhook

3. **Smoke Test 2 (notificar=false):** Criar tarefa com `notificar=false` → confirmar que nenhuma DM é enviada

4. **Preencher evidência:** Atualizar `03-01-NOTIF01-WEBHOOK-CHECK.md` com resultados reais e commitar

## Issues Encountered

Nenhum problema técnico. O plano é inteiramente de configuração de plataforma (não de código), portanto o executor automatizado não pode verificar/criar o webhook nem executar smoke tests reais no Slack.

## Next Phase Readiness

- NOTIF-01 em código: PRONTO (edge function `notify-tarefa` já implementa toda a lógica)
- NOTIF-01 em plataforma: AGUARDANDO confirmação do webhook no dashboard
- Phase 03-02: pode prosseguir em paralelo (NOTIF-02/03 são independentes do webhook de NOTIF-01)

---
*Phase: 03-pull-back-notifications*
*Completed: 2026-05-26*
