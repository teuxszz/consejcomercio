# 03-02 — CRON Deploy Log
## notify-resumo-diario + migration 034

**Data de início:** 2026-05-26
**Executor:** Gabriel (gabriel@araujon2000@gmail.com)
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

**Status:** PENDENTE (ação manual do operador)

**Gerar o valor com:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Comando SQL a executar no Dashboard → SQL Editor:**
```sql
SELECT vault.create_secret('<valor_gerado>', 'webhook_resumo_secret', 'Bearer p/ notify-resumo-diario');
```

**Confirmar criação:**
```sql
SELECT name FROM vault.secrets WHERE name = 'webhook_resumo_secret';
```

- Data/hora da criação: _______________
- Resultado da confirmação: _______________

---

## Subpasso 2 — Secrets da edge function

**Status:** PENDENTE (ação manual no Dashboard)

**Local:** Supabase Dashboard → Edge Functions → notify-resumo-diario → Secrets

**Secret a configurar:**
| Nome | Valor | Status |
|------|-------|--------|
| `WEBHOOK_RESUMO_SECRET` | (mesmo valor do Subpasso 1) | PENDENTE |

**Secrets já presentes (verificar):**
| Nome | Esperado | Status |
|------|----------|--------|
| `SLACK_BOT_TOKEN` | Herdado do projeto | VERIFICAR |
| `APP_URL` | Herdado do projeto | VERIFICAR |
| `SUPABASE_URL` | Injetado automaticamente | AUTOMÁTICO |
| `SUPABASE_SERVICE_ROLE_KEY` | Injetado automaticamente | AUTOMÁTICO |

- Data/hora da configuração: _______________
- Secrets confirmados: _______________

---

## Subpasso 3 — Schema push (`supabase db push`)

**Status:** PENDENTE

**Pré-requisito:** Secret no Vault deve existir ANTES deste subpasso.

**Comando:**
```powershell
$env:SUPABASE_ACCESS_TOKEN = "<seu_token>"  # se não estiver setado
supabase db push --linked
```

- Data/hora: _______________
- Exit code: _______________
- Migration `034_cron_resumo_diario.sql` aplicada: _______________
- Primeiras linhas da saída: _______________

---

## Subpasso 4 — Verificação pós-push

**Status:** PENDENTE

**Queries SQL a executar no Dashboard:**
```sql
-- Função criada?
SELECT proname FROM pg_proc WHERE proname = 'cron_resumo_diario';

-- Job agendado?
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'resumo-diario-consultores';
```

- `pg_proc` retornou: _______________
- `cron.job` retornou (jobname / schedule): _______________

---

## Subpasso 5 — Deploy da edge function

**Status:** PENDENTE

**Comando:**
```bash
supabase functions deploy notify-resumo-diario --project-ref wfnriqwkzdazdbuzbyug
```

- Data/hora: _______________
- URL final: `https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-resumo-diario`
- Versão deployada: _______________
- Exit code: _______________

---

## Subpasso 6 — Smoke test direto (curl)

**Status:** PENDENTE

**Pré-requisito:** Obter `perfil_id` real de um perfil interno com `slack_user_id` mapeado:
```sql
SELECT id, nome, slack_user_id FROM perfis WHERE tipo = 'interno' AND slack_user_id IS NOT NULL LIMIT 5;
```

**Comando curl (substituir `<SECRET>` e `<PERFIL_ID>`):**
```bash
curl -X POST https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-resumo-diario \
  -H "Authorization: Bearer <SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"perfil_id":"<PERFIL_ID>","tarefas_hoje":2,"leads_cadencia":[{"id":"00000000-0000-0000-0000-000000000001","nome":"Empresa Teste","d_point":3}]}'
```

- Status HTTP: _______________
- Body da resposta: _______________
- DM observada no Slack: _______________
- Timestamp da DM: _______________

---

## Subpasso 7 — Smoke test do cron (disparo manual)

**Status:** PENDENTE

**Query SQL:**
```sql
-- Executa o cron manualmente
SELECT public.cron_resumo_diario();

-- Verificar POSTs enviados pelo pg_net
SELECT * FROM net._http_response ORDER BY id DESC LIMIT 10;

-- Verificar runs agendados (apenas execuções via scheduler aparecem aqui)
SELECT runid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'resumo-diario-consultores')
ORDER BY start_time DESC
LIMIT 5;
```

- Número de DMs recebidas no Slack: _______________
- `_http_response.id` do primeiro POST: _______________
- Status code dos POSTs: _______________
- Content dos POSTs: _______________
- Warnings no log Postgres (se houver): _______________

---

## Subpasso 8 — Auditoria final

**Status:** PENDENTE

| Artefato | Hash |
|---------|------|
| `supabase/migrations/034_cron_resumo_diario.sql` | `266dd65f2b918c2ae37b1e9a7fa7a34be51af5af` |
| `supabase/functions/notify-resumo-diario/index.ts` | `266dd65f2b918c2ae37b1e9a7fa7a34be51af5af` |

| Requisito | Status |
|-----------|--------|
| NOTIF-02 (tarefas_hoje no resumo) | PENDENTE |
| NOTIF-03 (leads_cadencia no resumo) | PENDENTE |

**Resultado final:** PENDENTE

---

## Notas de troubleshooting

Se o smoke test retornar **401**: secret entre Vault (Subpasso 1) e edge function (Subpasso 2) está diferente.

Se retornar **500**: verificar logs em Dashboard → Edge Functions → notify-resumo-diario → Logs. Verificar se `SLACK_BOT_TOKEN` está configurado.

Se retornar **200 + `{ ok: true, skipped: 'no slack_user_id' }`**: o `perfil_id` não tem `slack_user_id` mapeado. Usar outro `perfil_id` com `slack_user_id` preenchido.

Se `cron_resumo_diario()` executar mas não aparecer nada em `net._http_response`: provavelmente nenhum consultor tem tarefas ou leads hoje. O cron executa, mas não chama a edge function quando `v_tarefas = 0` e `jsonb_array_length(v_leads) = 0`.
