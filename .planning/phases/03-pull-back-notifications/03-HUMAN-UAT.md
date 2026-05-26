---
status: partial
phase: 03-pull-back-notifications
source: [03-VERIFICATION.md]
started: 2026-05-26T18:30:00Z
updated: 2026-05-26T18:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. NOTIF-01 DM real ao criar tarefa
expected: ao atribuir tarefa a consultor com slack_user_id mapeado, DM Slack chega imediatamente
result: PASS (já verificado manualmente — request_id=10, Gabriel U09CS4AQNE5, evidência em 03-01-NOTIF01-WEBHOOK-CHECK.md)

### 2. NOTIF-01 opt-out (notificar=false)
expected: tarefa com `notificar=false` NÃO dispara DM Slack
result: PASS (já verificado manualmente, evidência em 03-01-NOTIF01-WEBHOOK-CHECK.md)

### 3. Execução automática do cron amanhã 07:00 BRT
expected: 2026-05-27 às 10:00 UTC (07:00 BRT), o cron `resumo-diario-consultores` dispara automaticamente, agrega tarefas + leads em D-point por consultor interno com slack_user_id e envia DM Slack consolidada
result: pending (observável a partir de 2026-05-27 10:00 UTC; smoke test manual Subpasso 7 confirma que o code path funciona)

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
