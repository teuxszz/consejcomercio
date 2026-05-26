---
phase: 03-pull-back-notifications
plan: 02
subsystem: notifications
tags:
  - slack
  - cron
  - pg_cron
  - edge-function
  - cadencia
  - notifications
dependency_graph:
  requires:
    - 03-01 (NOTIF-01 webhook verificado em produção)
    - supabase/migrations/030_perfis_slack.sql (slack_user_id em perfis)
    - supabase/migrations/033_rls_tarefas_notificar.sql (colunas de tarefas)
    - supabase/functions/notify-tarefa/index.ts (padrão de auth/Slack)
  provides:
    - edge function notify-resumo-diario deployada
    - pg_cron job 'resumo-diario-consultores' (0 10 * * *)
    - DM Slack diária consolidada por consultor (tarefas + leads cadencia)
  affects:
    - perfis (leitura via SECURITY DEFINER)
    - tarefas (leitura via SECURITY DEFINER)
    - leads + interacoes_lead (leitura via SECURITY DEFINER)
tech_stack:
  added:
    - pg_cron (extensão Supabase, nova migração de cron job)
    - pg_net (extensão Supabase, já usada em 031; nova chamada HTTP)
    - Supabase Vault (webhook_resumo_secret — novo secret)
  patterns:
    - UNION ALL para leads sem interação (Pitfall 1 de RESEARCH.md)
    - constantTimeAuthCheck copiado de notify-tarefa (anti-spoofing)
    - Vault secret em runtime via vault.decrypted_secrets
    - Defesa em profundidade: cron filtra antes de chamar + edge function curto-circuita payload vazio
key_files:
  created:
    - supabase/functions/notify-resumo-diario/index.ts (198 linhas)
    - supabase/migrations/034_cron_resumo_diario.sql (145 linhas)
    - .planning/phases/03-pull-back-notifications/03-02-CRON-DEPLOY-LOG.md
  modified:
    - src/lib/__tests__/cadencia.test.ts (Task 1 — commit ffbb40a)
decisions:
  - "'stand_by' incluído no NOT IN (CONSEJ 2026: leads pausados não cobrados na cadência)"
  - "Sem tabela de idempotência (Milestone 2 aceita re-envio acidental — RESEARCH Pitfall 5)"
  - "DM consolidada (não por evento) — um único código de disparo (cron + edge function)"
  - "RAISE WARNING (não EXCEPTION) no cron: job marca success mesmo sem secret para evitar rollback do scheduler"
metrics:
  duration: "~90 min (Task 1 pré-existente; Task 2 commit 266dd65; Task 3 deploy + smoke tests reais)"
  completed_date: "2026-05-26"
  completed_tasks: 3 of 3
  files_count: 3
---

# Phase 03 Plan 02: notify-resumo-diario + Migration 034 Summary

**One-liner:** Edge function Deno `notify-resumo-diario` + pg_cron `resumo-diario-consultores` (07:00 BRT) que agrega tarefas + leads em D-point por consultor e posta DM Slack consolidada, protegida por Vault secret com `constantTimeAuthCheck`.

---

## Tasks Executadas

| Task | Nome | Commit | Status |
|------|------|--------|--------|
| 1 | Estender testes unitários de cadência (NOTIF-02/03) | `ffbb40a` | DONE (pré-existente) |
| 2 | Edge function + migration 034 | `266dd65` | DONE |
| 3 | Deploy + Vault secret + smoke test | — | DONE (deploy log atualizado) |

---

## Artefatos Criados (Task 2)

### `supabase/functions/notify-resumo-diario/index.ts` (198 linhas)

- Imports: `deno.land/std@0.224.0` (serve, timingSafeEqual) + `esm.sh/supabase-js@2`
- Interface: `ResumoDiarioPayload { perfil_id, tarefas_hoje, leads_cadencia[] }`
- Auth: `constantTimeAuthCheck` (timing-safe, copiado de notify-tarefa)
- Helpers: `findSlackUserId`, `findPerfilNome`, `openDmChannel`, `postDm` (retry 3x)
- Blocos Slack: greeting + 2 fields (tarefas/leads) + lista de leads (D-point) + button "Abrir CRM → /me"
- Curto-circuito: payload vazio retorna 200 sem chamar Slack
- `findSlackUserId` não encontrou: retorna 200 `{ skipped: 'no slack_user_id' }` (fluxo esperado)

### `supabase/migrations/034_cron_resumo_diario.sql` (145 linhas)

- `CREATE EXTENSION IF NOT EXISTS pg_cron / pg_net` (idempotente)
- `public.cron_resumo_diario()` SECURITY DEFINER SET search_path = public
- Lê `webhook_resumo_secret` do Vault; `RAISE WARNING` se ausente (não EXCEPTION)
- Loop sobre `perfis WHERE tipo = 'interno' AND slack_user_id IS NOT NULL`
- NOTIF-02: `COUNT(*)` de tarefas `aberta/em_andamento` vencendo `CURRENT_DATE`
- NOTIF-03: UNION ALL — Branch 1 (leads COM interação, HAVING dias IN 1/3/5/7/10) + Branch 2 (leads SEM interação, criado 0/1 dias atrás → D1)
- `NOT IN ('ganho_assessoria','ganho_consultoria','perdido','cancelado','stand_by')`
- `cron.schedule('resumo-diario-consultores', '0 10 * * *', 'SELECT public.cron_resumo_diario()')`

---

## N_BASELINE da Suíte de Testes

- **N_BASELINE (antes da Task 1):** 123 testes passando
- **Após Task 1:** 137 passando + 5 skipped (14 novos testes = 10 `it` individuais + 4 via `it.each` para Test E)
- **Após Task 2:** 137 passando + 5 skipped (sem regressão — Task 2 não modifica nenhum arquivo de teste)

---

## Decisão sobre `stand_by`

`stand_by` existe em `PIPELINE_STAGES` mas não em `TERMINAL_STAGES`. `ACTIVE_LEAD_STAGES` já o exclui explicitamente (decisão da diretoria CONSEJ 2026). Leads pausados não devem receber alerta de cadência. Por isso, `stand_by` foi incluído no `NOT IN (...)` de ambos os branches do UNION ALL, com comentário SQL explicativo na migration 034.

---

## Deviations from Plan

None — plan executed exactly as written. Task 1 was pre-committed (ffbb40a). Task 2 artifacts were pre-written on disk and verified before commit.

---

## Task 3 — Deploy Concluído (2026-05-26)

Todos os 8 subpassos executados com sucesso. Detalhes completos em `03-02-CRON-DEPLOY-LOG.md`.

| Subpasso | Resultado |
|----------|-----------|
| 1. Vault secret | OK (recriado sem `< >` brackets do template) |
| 2. Edge function secrets | OK (via `supabase secrets set` CLI) |
| 3. Migration 034 aplicada | OK (via SQL Editor — `cron.schedule` retornou jobid=2) |
| 4. Verificação SQL | `cron_resumo_diario` + job `resumo-diario-consultores` confirmados |
| 5. Deploy edge function | OK com `--no-verify-jwt` |
| 6. Smoke test curl | HTTP 200 + DM real recebida no Slack de Gabriel |
| 7. Smoke test cron | `net._http_response.id=11` status 200, ts Slack `1779826503.824199` |
| 8. Auditoria final | NOTIF-02 + NOTIF-03 PASS |

**Estado em produção:**
- Edge function `notify-resumo-diario` deployada em `https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-resumo-diario`
- Cron `resumo-diario-consultores` ativo, schedule `0 10 * * *` (07:00 BRT), jobid=2
- Próximo disparo automático: 2026-05-27 07:00 BRT

**Incidentes resolvidos durante o deploy** (4 troubleshooting steps no LOG):
- Vault secret com brackets literais → DELETE + CREATE
- 401 por dessincronia entre Vault e edge function → CLI `supabase secrets set`
- 401 persistente da verificação JWT padrão do Supabase → redeploy com `--no-verify-jwt`
- `supabase db push --linked` bloqueado por falta de senha → migration aplicada via SQL Editor

---

## Threat Flags

Nenhum surface novo além do planejado no `<threat_model>` do plano.
- T-03-02-01 (Spoofing): `constantTimeAuthCheck` implementado
- T-03-02-02 (Secret disclosure): sem secret em arquivo versionado
- T-03-02-03 (SQL injection): `jsonb_build_object` sem string concat
- T-03-02-04 (SSRF): `v_url` hardcoded na função
- T-03-02-05 (DM errada): `WHERE l.responsavel_id = p.id` + `findSlackUserId(perfil_id)`

---

## Self-Check

### Arquivos criados

- [x] `supabase/functions/notify-resumo-diario/index.ts` — FOUND
- [x] `supabase/migrations/034_cron_resumo_diario.sql` — FOUND
- [x] `.planning/phases/03-pull-back-notifications/03-02-CRON-DEPLOY-LOG.md` — FOUND

### Commits

- [x] `ffbb40a` — Task 1 (pré-existente, verificado)
- [x] `266dd65` — Task 2 (feat: edge function + migration)

## Self-Check: PASSED
