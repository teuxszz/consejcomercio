# NOTIF-01 Webhook Check — Registro de Evidência

**Plano:** 03-01
**Data do registro:** 2026-05-26
**Requisito:** NOTIF-01 — DM Slack ao atribuir tarefa a um colega

---

## Configuração do Database Webhook

### Parâmetros obrigatórios

| Campo                | Valor esperado                                                              | Status |
|----------------------|-----------------------------------------------------------------------------|--------|
| Nome do webhook      | `notify-tarefa-webhook` (ou equivalente)                                    | A verificar |
| Source table         | `public.tarefas`                                                            | A verificar |
| Events               | `INSERT`, `UPDATE`                                                          | A verificar |
| HTTP Method          | `POST`                                                                      | A verificar |
| URL                  | `https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-tarefa`      | A verificar |
| HTTP Header          | `Authorization: Bearer <valor_de_WEBHOOK_TAREFA_SECRET>`                    | A verificar |
| Webhook ativo        | Sim                                                                         | A verificar |

### Como verificar/configurar

1. Acesse [Supabase Dashboard](https://supabase.com/dashboard/project/wfnriqwkzdazdbuzbyug)
2. Menu lateral: **Database → Webhooks**
3. Procure um webhook com source table `tarefas` e URL `notify-tarefa`
4. Se não existir: clique em **Create a new hook** com os parâmetros acima
5. Para o header `Authorization`: usar o valor do secret `WEBHOOK_TAREFA_SECRET` já configurado em **Settings → Edge Functions → Secrets**

### Resultado da verificação

<!-- PREENCHER APÓS VERIFICAÇÃO NO DASHBOARD -->

- **Webhook encontrado:** [ ] Sim / [ ] Não — criado novo
- **Nome do webhook:** ___________________________
- **URL configurada:** `https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-tarefa`
- **Eventos configurados:** [ ] INSERT [ ] UPDATE
- **Header Authorization presente:** [ ] Sim com `Bearer <WEBHOOK_TAREFA_SECRET>`
- **Webhook ativo:** [ ] Sim

---

## Smoke Test 1 — notificar = true (esperado: DM recebida)

**Objetivo:** Confirmar que criar/atribuir tarefa a um consultor com `slack_user_id` mapeado dispara DM no Slack.

### Passos

1. No CRM, acesse a área de Tarefas
2. Crie uma nova tarefa com:
   - **Atribuída a:** consultor interno com `slack_user_id` mapeado em perfis
   - **notificar:** `true` (padrão — não alterar)
   - **Título:** "Smoke Test NOTIF-01 — pode deletar"
3. Aguarde até 30 segundos
4. Verifique se o destinatário recebeu DM no Slack

### Verificar log do webhook

1. No Supabase Dashboard: **Database → Webhooks → [nome do webhook] → Logs**
2. Localizar o POST mais recente com status `200`
3. Copiar o `request_id` (campo no log)

### Resultado

<!-- PREENCHER APÓS SMOKE TEST 1 -->

- **DM recebida:** [ ] PASS — DM chegou em < 30s / [ ] FAIL — nenhuma DM recebida
- **Consultor destinatário do teste:** ___________________________
- **Horário do teste:** ___________________________
- **request_id do log do webhook:** ___________________________
- **Status HTTP do webhook:** ___________________________
- **Conteúdo da DM (resumo):** ___________________________

---

## Smoke Test 2 — notificar = false (esperado: nenhuma DM)

**Objetivo:** Confirmar que o opt-out funciona — tarefas com `notificar = false` não disparam DM.

### Passos

1. No CRM ou via Supabase Studio (SQL Editor), crie uma tarefa com `notificar = false`:
   ```sql
   INSERT INTO tarefas (titulo, tipo, prioridade, status, atribuido_a_id, criado_por_id, notificar)
   VALUES (
     'Smoke Test opt-out NOTIF-01 — pode deletar',
     'outro',
     'media',
     'aberta',
     '<uuid-do-consultor-de-teste>',
     '<uuid-do-criador>',
     false  -- opt-out
   );
   ```
2. Aguarde 30 segundos
3. Confirme que o destinatário NÃO recebeu DM no Slack

### Verificar no log do webhook

No log do webhook, o evento deve aparecer com resposta `200` mas com body `{"ok":true,"skipped":"notificar=false"}`.

### Resultado

<!-- PREENCHER APÓS SMOKE TEST 2 -->

- **DM NÃO recebida (opt-out funcionando):** [ ] PASS / [ ] FAIL — DM indevida recebida
- **Resposta do webhook no log:** ___________________________
- **request_id do evento opt-out:** ___________________________

---

## Conclusão

<!-- PREENCHER APÓS AMBOS OS SMOKE TESTS -->

- **NOTIF-01 funcional em produção:** [ ] PASS / [ ] FAIL
- **Opt-out funcional:** [ ] PASS / [ ] FAIL
- **Webhook ativo e configurado:** [ ] Sim
- **Evidência commitada:** [ ] Sim

---

## Contexto da edge function (para referência)

A função `supabase/functions/notify-tarefa/index.ts` já implementa NOTIF-01 corretamente:

- Verifica `notificar === false` → retorna `{ ok: true, skipped: 'notificar=false' }` (linha 171)
- Para INSERT com `atribuido_a_id != null`: resolve `slack_user_id` via `perfis`, abre DM com `conversations.open` e posta com `chat.postMessage`
- Para UPDATE: só dispara se `atribuido_a_id` mudou (linha 179-184)
- Autentica via `constantTimeAuthCheck` com Bearer `WEBHOOK_TAREFA_SECRET`

**Secrets necessários na edge function** (`Settings → Edge Functions → Secrets`):
- `SLACK_BOT_TOKEN` — token do bot do Slack
- `WEBHOOK_TAREFA_SECRET` — secret Bearer para validar o webhook
- `APP_URL` — URL do CRM (ex: `https://consej-crm.vercel.app`)
- `SUPABASE_URL` — URL do projeto Supabase (injetada automaticamente)
- `SUPABASE_SERVICE_ROLE_KEY` — chave de serviço (injetada automaticamente)

---

*Arquivo gerado em 2026-05-26 como parte do Plano 03-01 (NOTIF-01).*
*Preencher os campos marcados com `<!-- PREENCHER -->` após verificação manual no Supabase Dashboard.*
