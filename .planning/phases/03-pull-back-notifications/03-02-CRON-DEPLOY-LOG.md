# 03-02 — CRON Deploy Log
## notify-resumo-diario + migration 034

**Data de início:** 2026-05-26
**Data de conclusão:** 2026-05-26
**Executor:** Gabriel (araujon2000@gmail.com)
**Commit dos artefatos:** `266dd65f2b918c2ae37b1e9a7fa7a34be51af5af`

---

## Verificação de status `stand_by`

**Consulta executada:** `SELECT DISTINCT status FROM leads ORDER BY status;`

**Resultado pré-decisão (2026-05-26):**
`stand_by` existe em `PIPELINE_STAGES` em `src/lib/constants.ts` mas NOT em `TERMINAL_STAGES`.
Confirmado via `ACTIVE_LEAD_STAGES` (constants.ts:28) que já exclui `stand_by`.

**Decisão:** `stand_by` INCLUÍDO no `NOT IN (...)` de ambos os branches do UNION ALL
(leads pausados não devem receber alerta de cadência — alinhado com a diretoria CONSEJ 2026).

Documentado também na migration 034 como comentário SQL (linhas 15–25).

---

## Subpasso 1 — Vault secret

**Status:** OK (secret já existia de sessão anterior; recriado sem `< >` brackets)

**Comando SQL executado:**
```sql
DELETE FROM vault.secrets WHERE name = 'webhook_resumo_secret';
SELECT vault.create_secret(
  '<valor_32chars_hex>',
  'webhook_resumo_secret',
  'Bearer p/ notify-resumo-diario'
);
```

**Confirmação:** `SELECT name FROM vault.secrets WHERE name = 'webhook_resumo_secret';` retornou 1 linha.

**Incidente registrado:** primeira tentativa de criação incluiu os caracteres `< >` literais como parte do valor do secret (template não substituído). Causou 401 no smoke test. Corrigido via DELETE + CREATE com valor puro.

---

## Subpasso 2 — Secrets da edge function

**Status:** OK (configurado via CLI após Dashboard inicial inconsistente)

**Comando final usado:**
```powershell
rtk supabase secrets set WEBHOOK_RESUMO_SECRET=<valor> --project-ref wfnriqwkzdazdbuzbyug
```

**Secrets confirmados:**
| Nome | Status |
|------|--------|
| `WEBHOOK_RESUMO_SECRET` | OK (mesmo valor do Vault) |
| `SLACK_BOT_TOKEN` | OK (herdado de notify-tarefa) |
| `APP_URL` | OK (herdado de notify-tarefa) |
| `SUPABASE_URL` | AUTOMÁTICO |
| `SUPABASE_SERVICE_ROLE_KEY` | AUTOMÁTICO |

---

## Subpasso 3 — Migration 034 aplicada

**Status:** OK (aplicada via SQL Editor por bloqueio do `supabase db push --linked` — falta de `SUPABASE_DB_PASSWORD` no ambiente)

**Método:** cópia integral de `supabase/migrations/034_cron_resumo_diario.sql` para o SQL Editor do Dashboard.

**Resultado da execução:**
```json
[ { "schedule": 2 } ]
```
(`cron.schedule` retornou jobid = 2)

---

## Subpasso 4 — Verificação pós-migration

**Status:** OK

```sql
SELECT proname FROM pg_proc WHERE proname = 'cron_resumo_diario';
-- → 1 linha (cron_resumo_diario)

SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'resumo-diario-consultores';
-- → 1 linha:
--   jobname  = 'resumo-diario-consultores'
--   schedule = '0 10 * * *'
--   command  = 'SELECT public.cron_resumo_diario()'
```

---

## Subpasso 5 — Deploy da edge function

**Status:** OK (deploy final com `--no-verify-jwt`)

**Comando:**
```powershell
rtk supabase functions deploy notify-resumo-diario --project-ref wfnriqwkzdazdbuzbyug --no-verify-jwt
```

**Saída:**
```
Uploading asset (notify-resumo-diario): supabase/functions/notify-resumo-diario/index.ts
Deployed Functions on project wfnriqwkzdazdbuzbyug: notify-resumo-diario
```

**URL final:** `https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-resumo-diario`

**Incidente registrado:** primeiro deploy sem `--no-verify-jwt` causou 401 (`UNAUTHORIZED_INVALID_JWT_FORMAT`) — a edge function tem auth própria via `constantTimeAuthCheck`, então a verificação JWT padrão do Supabase precisa ser desabilitada. Corrigido com redeploy + flag.

---

## Subpasso 6 — Smoke test direto (curl)

**Status:** OK

**Comando (PowerShell, sintaxe `Invoke-RestMethod` por incompatibilidade do `curl.exe` no PS):**
```powershell
Invoke-RestMethod -Method POST `
  -Uri "https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-resumo-diario" `
  -Headers @{ "Authorization" = "Bearer <SECRET>" } `
  -ContentType "application/json" `
  -Body '{"perfil_id":"93f649b0-5c52-431e-91ff-e53c3a9bea55","tarefas_hoje":2,"leads_cadencia":[{"id":"00000000-0000-0000-0000-000000000001","nome":"Empresa Teste","d_point":3}]}'
```

- **Status HTTP:** 200
- **DM observada no Slack:** SIM (Gabriel Araujo / `U09CS4AQNE5`) — confirmado pelo usuário
- **Payload de teste:** 2 tarefas + 1 lead em D3

---

## Subpasso 7 — Smoke test do cron (disparo manual)

**Status:** OK

**Query SQL:**
```sql
SELECT public.cron_resumo_diario();
SELECT id, status_code, content::text FROM net._http_response ORDER BY id DESC LIMIT 10;
```

**Resultado relevante:**
| id | status_code | content |
|----|-------------|---------|
| 11 | 200 | `{"ok":true,"ts":"1779826503.824199"}` |
| 12 | 200 | `{"ok":true,"skipped":"notificar=false"}` (outra função — notify-tarefa) |

- **`_http_response.id` do POST do cron_resumo_diario:** **11**
- **Status code:** 200
- **Slack message ts:** `1779826503.824199`
- **DMs entregues:** ao menos 1 consultor com tarefas/leads hoje (POST único — demais consultores não tinham trabalho no dia)
- **Warnings:** nenhum

Entries `id 4-10` são 401s anteriores (incidentes documentados nos Subpassos 1 e 5, todos resolvidos).

---

## Subpasso 8 — Auditoria final

| Artefato | Hash |
|---------|------|
| `supabase/migrations/034_cron_resumo_diario.sql` | `266dd65f2b918c2ae37b1e9a7fa7a34be51af5af` |
| `supabase/functions/notify-resumo-diario/index.ts` | `266dd65f2b918c2ae37b1e9a7fa7a34be51af5af` |

| Requisito | Status | Evidência |
|-----------|--------|-----------|
| NOTIF-02 (tarefas_hoje no resumo) | **OK** | curl Subpasso 6 (`tarefas_hoje:2` aceito, DM entregue) + cron Subpasso 7 (`_http_response.id=11`) |
| NOTIF-03 (leads_cadencia no resumo) | **OK** | curl Subpasso 6 (`leads_cadencia: [{...d_point:3}]` aceito, DM entregue) + lógica SQL replica `getNextCadenciaPoint` (Task 1, 14 testes) |

**Resultado final:** **APROVADO** — NOTIF-02 e NOTIF-03 funcionais em produção.

**Estado do cron em produção (2026-05-26):**
- `jobname`: `resumo-diario-consultores`
- `jobid`: 2
- `schedule`: `0 10 * * *` (10:00 UTC = 07:00 BRT)
- Próximo disparo automático: 2026-05-27 07:00 BRT

---

## Notas de troubleshooting (resolvidas neste deploy)

| Sintoma | Causa raiz | Correção |
|---------|------------|----------|
| 23505 duplicate key em `vault.create_secret` | Secret já existia de sessão anterior | DELETE + CREATE |
| Vault `decrypted_secret` retornou `<valor>` literal | Placeholder `< >` não removido na criação inicial | Recriar com valor limpo |
| Curl: 401 com secret correto | Secret da edge function desincronizado do Vault | `supabase secrets set` via CLI |
| Curl: 401 persistente após sync | Verificação JWT padrão do Supabase ativa | Redeploy com `--no-verify-jwt` |
| `supabase db push --linked` falhou | `SUPABASE_DB_PASSWORD` ausente; permissão para alterar role `cli_login_postgres` recusada | Aplicar migration via SQL Editor (cópia integral do .sql) |
