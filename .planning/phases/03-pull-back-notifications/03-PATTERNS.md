# Phase 3: Pull-back Notifications — Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 3 (2 novos + 1 verificado como já implementado)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/034_cron_resumo_diario.sql` | migration | batch / event-driven (cron) | `supabase/migrations/031_cron_renovacoes.sql` | exact |
| `supabase/functions/notify-resumo-diario/index.ts` | service (edge function) | request-response | `supabase/functions/notify-tarefa/index.ts` | exact |
| `supabase/functions/notify-tarefa/index.ts` | service (edge function) | event-driven (webhook) | — | ja-implementado (NOTIF-01 coberto) |

---

## Pattern Assignments

### `supabase/migrations/034_cron_resumo_diario.sql` (migration, batch/cron)

**Analog:** `supabase/migrations/031_cron_renovacoes.sql`

**Estrutura do arquivo** (linhas 1-15 de 031):
```sql
-- Migration 031: Cron de renovações via pg_cron (substitui o Vercel Cron)
-- O segredo Bearer (WEBHOOK_RENOVACAO_SECRET) NÃO fica neste arquivo — é lido
-- do Supabase Vault em runtime. Para gravá-lo (uma vez, fora do git):
--   SELECT vault.create_secret('<secret>', 'webhook_renovacao_secret', 'Bearer p/ notify-renovacao');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

**Padrão: leitura de secret do Vault** (linhas 31-38 de 031):
```sql
DECLARE
  v_secret TEXT;
  v_url    TEXT := 'https://wfnriqwkzdazdbuzbyug.supabase.co/functions/v1/notify-renovacao';
  v_janela INT;
  c        RECORD;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'webhook_renovacao_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'cron_disparar_renovacoes: secret webhook_renovacao_secret ausente no Vault';
    RETURN;
  END IF;
```
Para 034: usar `name = 'webhook_resumo_secret'` e `RAISE WARNING 'cron_resumo_diario: secret webhook_resumo_secret ausente no Vault'`. Nunca usar `RAISE EXCEPTION` — o pg_cron deve marcar o job como "success" mesmo sem secret para evitar rollback do scheduler.

**Padrão: chamada HTTP via pg_net** (linhas 57-65 de 031):
```sql
PERFORM net.http_post(
  url     := v_url,
  body    := jsonb_build_object('contrato_id', c.id, 'dias_antes', v_janela),
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  )
);
```
Para 034: o `body` muda para `jsonb_build_object('perfil_id', p.id, 'tarefas_hoje', v_tarefas, 'leads_cadencia', v_leads)`. Manter `Content-Type` e `Authorization` idênticos.

**Padrão: agendamento idempotente** (linhas 71-75 de 031):
```sql
SELECT cron.schedule(
  'disparar-renovacoes',
  '0 12 * * *',
  'SELECT public.cron_disparar_renovacoes()'
);
```
Para 034: usar job name `'resumo-diario-consultores'`, cron expression `'0 10 * * *'` (07:00 BRT), função `public.cron_resumo_diario()`. O mesmo job name em re-execução atualiza o job sem criar duplicata.

**Padrão específico de 034 — iteração por perfil interno:**
```sql
-- Itera sobre cada interno com slack_user_id mapeado
FOR p IN
  SELECT id, slack_user_id
    FROM perfis
   WHERE tipo = 'interno'
     AND slack_user_id IS NOT NULL
LOOP
  -- Conta tarefas vencendo hoje
  SELECT COUNT(*) INTO v_tarefas
    FROM tarefas
   WHERE atribuido_a_id = p.id
     AND status IN ('aberta', 'em_andamento')
     AND data_vencimento::date = CURRENT_DATE;

  -- Leads em D-point hoje (com interação)
  SELECT COALESCE(jsonb_agg(...), '[]'::jsonb)
    INTO v_leads
    FROM (
      -- Branch 1: leads COM interação
      SELECT l.id, l.nome, (CURRENT_DATE - MAX(i.enviada_em)::date) AS d_point
        FROM leads l
        JOIN interacoes_lead i ON i.lead_id = l.id
       WHERE l.responsavel_id = p.id
         AND l.status NOT IN ('ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado')
       GROUP BY l.id, l.nome
      HAVING (CURRENT_DATE - MAX(i.enviada_em)::date) IN (1, 3, 5, 7, 10)

      UNION ALL

      -- Branch 2: leads SEM interação (D1 se criado hoje ou ontem)
      SELECT l.id, l.nome, (CURRENT_DATE - l.created_at::date) AS d_point
        FROM leads l
       WHERE l.responsavel_id = p.id
         AND l.status NOT IN ('ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado')
         AND NOT EXISTS (SELECT 1 FROM interacoes_lead i WHERE i.lead_id = l.id)
         AND (CURRENT_DATE - l.created_at::date) IN (0, 1)
    ) sub;

  -- Só chama edge function se há algo para notificar
  IF v_tarefas > 0 OR jsonb_array_length(v_leads) > 0 THEN
    PERFORM net.http_post(...);
  END IF;
END LOOP;
```
Atenção: o UNION ALL resolve o Pitfall 1 do RESEARCH.md (leads sem interação não apareceriam de outra forma, pois `NULL IN (1,3,5,7,10)` é sempre false). Os valores de `TERMINAL_STAGES` foram verificados em `src/lib/constants.ts`: `['ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado']`.

**Cabeçalho de comentário canônico** (copiar de 031, adaptando para 034):
```sql
-- Migration 034: Cron de resumo diário (NOTIF-02 + NOTIF-03)
--
-- Agenda um job diário que, para cada consultor interno com slack_user_id,
-- agrega tarefas vencendo hoje (NOTIF-02) e leads em D-point da cadência
-- (NOTIF-03) e chama a edge function notify-resumo-diario.
--
-- O segredo Bearer (WEBHOOK_RESUMO_SECRET) NÃO fica neste arquivo — é lido
-- do Supabase Vault em runtime. Para gravá-lo (uma vez, fora do git):
--   SELECT vault.create_secret('<secret>', 'webhook_resumo_secret', 'Bearer p/ notify-resumo-diario');
```

---

### `supabase/functions/notify-resumo-diario/index.ts` (edge function, request-response)

**Analog primário:** `supabase/functions/notify-tarefa/index.ts`
**Analog secundário:** `supabase/functions/notify-renovacao/index.ts` (para padrão de bloco Slack com campos)

**Bloco de imports** (linhas 14-16 de notify-tarefa):
```typescript
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
```
Copiar identicamente — mesmas URLs de import que todas as outras edge functions do projeto.

**Padrão: env vars e Supabase client** (linhas 51-57 de notify-tarefa):
```typescript
const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')
const WEBHOOK_SECRET  = Deno.env.get('WEBHOOK_RESUMO_SECRET')   // adaptar nome
const APP_URL         = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
```
Para `notify-resumo-diario`: trocar `WEBHOOK_TAREFA_SECRET` por `WEBHOOK_RESUMO_SECRET`. O restante é idêntico.

**Padrão: auth check timing-safe** (linhas 40-49 de notify-tarefa):
```typescript
function constantTimeAuthCheck(received: string, expectedSecret: string): boolean {
  const enc = new TextEncoder()
  const expected = enc.encode(`Bearer ${expectedSecret}`)
  const got = enc.encode(received)
  if (got.length !== expected.length) {
    timingSafeEqual(expected, expected)
    return false
  }
  return timingSafeEqual(got, expected)
}
```
Copiar função inteira sem alteração. Esta função previne timing attacks — não simplificar para comparação direta de strings.

**Padrão: helper json()** (linhas 59-61 de notify-tarefa):
```typescript
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
```
Copiar identicamente.

**Padrão: findSlackUserId()** (linhas 79-86 de notify-tarefa):
```typescript
async function findSlackUserId(perfilId: string): Promise<string | null> {
  const { data } = await supabase
    .from('perfis')
    .select('slack_user_id')
    .eq('id', perfilId)
    .maybeSingle<{ slack_user_id: string | null }>()
  return data?.slack_user_id ?? null
}
```
Copiar identicamente — `notify-resumo-diario` também precisa resolver `perfil_id` → `slack_user_id`.

**Padrão: openDmChannel()** (linhas 100-112 de notify-tarefa):
```typescript
async function openDmChannel(slackUserId: string): Promise<{ ok: boolean; channel?: string; error?: string }> {
  const res = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ users: slackUserId }),
  })
  const body = await res.json() as { ok: boolean; channel?: { id: string }; error?: string }
  if (!body.ok || !body.channel) return { ok: false, error: body.error ?? `HTTP ${res.status}` }
  return { ok: true, channel: body.channel.id }
}
```
Copiar identicamente. Nunca postar diretamente no user_id — o `conversations.open` garante entrega.

**Padrão: postDm() com retry exponencial** (linhas 114-140 de notify-tarefa):
```typescript
async function postDm(slackUserId: string, text: string, blocks: unknown[]): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const dm = await openDmChannel(slackUserId)
  if (!dm.ok || !dm.channel) {
    return { ok: false, error: `conversations.open falhou: ${dm.error}` }
  }
  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: dm.channel, text, blocks, unfurl_links: false }),
    })
    if (res.status === 429 || res.status >= 500) {
      await new Promise(r => setTimeout(r, 500 * 2 ** i))
      continue
    }
    const body = await res.json() as { ok: boolean; ts?: string; error?: string }
    return body.ok
      ? { ok: true, ts: body.ts }
      : { ok: false, error: body.error ?? `HTTP ${res.status}` }
  }
  return { ok: false, error: 'Slack indisponível após retries' }
}
```
Copiar identicamente. Cobre rate-limit (429) e erros 5xx com backoff 500ms * 2^i.

**Padrão: serve() handler** (linhas 142-164 de notify-tarefa — estrutura):
```typescript
serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  if (WEBHOOK_SECRET) {
    const auth = req.headers.get('Authorization') ?? ''
    if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }
  }

  if (!SLACK_BOT_TOKEN) {
    return json({ ok: false, error: 'SLACK_BOT_TOKEN ausente' }, 500)
  }

  let payload: ResumoDiarioPayload
  try {
    payload = await req.json() as ResumoDiarioPayload
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400)
  }

  // validação de payload (específica de notify-resumo-diario)
  if (!payload.perfil_id || typeof payload.tarefas_hoje !== 'number') {
    return json({ ok: false, error: 'perfil_id e tarefas_hoje obrigatórios' }, 400)
  }

  // ... lógica de negócio ...
})
```
A ordem é sempre: method check → auth check → env check → JSON parse → payload validation → lógica.

**Interface do payload** (novo, baseado no contrato definido na migration 034):
```typescript
interface ResumoDiarioPayload {
  perfil_id: string
  tarefas_hoje: number
  leads_cadencia: Array<{ id: string; nome: string; d_point: number }>
}
```

**Padrão de bloco Slack para resumo** (baseado em `buildBlocks()` de notify-renovacao/index.ts, linhas 102-133, adaptado para DM):
```typescript
function buildResumoDiarioBlocks(
  nomeConsultor: string,
  tarefasHoje: number,
  leadsCadencia: Array<{ id: string; nome: string; d_point: number }>,
  appUrl: string
): unknown[] {
  const base = appUrl.replace(/\/$/, '')
  const leadLines = leadsCadencia
    .map(l => `• ${l.nome} (D${l.d_point})`)
    .join('\n')

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Bom dia, *${nomeConsultor}*! Aqui está seu resumo de hoje:`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Tarefas vencendo hoje*\n${tarefasHoje}` },
        { type: 'mrkdwn', text: `*Leads na cadência*\n${leadsCadencia.length}` },
      ],
    },
    ...(leadsCadencia.length > 0 ? [{
      type: 'section',
      text: { type: 'mrkdwn', text: leadLines },
    }] : []),
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Abrir CRM' }, url: `${base}/me` },
      ],
    },
  ]
}
```

**Cabeçalho de comentário canônico** (copiar de notify-tarefa, linhas 1-12, adaptando):
```typescript
// Edge Function: notify-resumo-diario
// Gatilho: chamada explícita do pg_cron (migration 034) diariamente às 07:00 BRT.
// Posta DM no Slack do consultor com resumo de tarefas + leads em cadência.
//
// Requer:
//   - perfis.slack_user_id preenchido para o destinatário (migração 030)
//   - SLACK_BOT_TOKEN
//   - WEBHOOK_RESUMO_SECRET
//   - APP_URL
```

---

### `supabase/functions/notify-tarefa/index.ts` — verificação NOTIF-01

**Status:** Já implementado. Nenhuma modificação de código necessária.

**Evidência:** O arquivo em `supabase/functions/notify-tarefa/index.ts` já contém:
- Lógica de DM para INSERT com `atribuido_a_id != NULL` (linha 174-177)
- Lógica de DM para UPDATE onde `atribuido_a_id` mudou (linhas 179-184)
- Opt-out por `notificar === false` (linha 171) — integração com SEC-02 da migration 033

**Ação pendente (configuração de plataforma, não código):** Verificar no Supabase Dashboard → Database → Webhooks se existe webhook apontando para `notify-tarefa` com trigger em `tarefas` INSERT e UPDATE. Se ausente, criar via dashboard.

---

## Shared Patterns

### Auth check timing-safe
**Source:** `supabase/functions/notify-tarefa/index.ts`, linhas 40-49
**Apply to:** `notify-resumo-diario/index.ts`
```typescript
function constantTimeAuthCheck(received: string, expectedSecret: string): boolean {
  const enc = new TextEncoder()
  const expected = enc.encode(`Bearer ${expectedSecret}`)
  const got = enc.encode(received)
  if (got.length !== expected.length) {
    timingSafeEqual(expected, expected)   // dummy call para timing uniforme
    return false
  }
  return timingSafeEqual(got, expected)
}
```
Aplicar na abertura do `serve()` handler antes de qualquer lógica de negócio.

### Supabase client (service role, sem sessão)
**Source:** `supabase/functions/notify-tarefa/index.ts`, linha 57
**Apply to:** `notify-resumo-diario/index.ts`
```typescript
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
```
Edge functions usam service role key para leitura de `perfis` sem RLS. `persistSession: false` evita cache de sessão entre invocações.

### Secret no Vault (não em env var de código)
**Source:** `supabase/migrations/031_cron_renovacoes.sql`, linhas 31-38
**Apply to:** `supabase/migrations/034_cron_resumo_diario.sql`
```sql
SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
 WHERE name = 'webhook_resumo_secret';

IF v_secret IS NULL THEN
  RAISE WARNING '...secret ausente no Vault';
  RETURN;
END IF;
```
Secrets NUNCA hardcoded em SQL commitado. Criar via `vault.create_secret()` fora do git antes de aplicar a migration.

### SECURITY DEFINER + search_path para funções PL/pgSQL
**Source:** `supabase/migrations/031_cron_renovacoes.sql`, linhas 19-24
**Apply to:** `supabase/migrations/034_cron_resumo_diario.sql`
```sql
CREATE OR REPLACE FUNCTION public.cron_resumo_diario()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
```
Toda função chamada pelo pg_cron deve ser `SECURITY DEFINER` com `search_path = public` fixo.

### Retry com exponential backoff para Slack API
**Source:** `supabase/functions/notify-tarefa/index.ts`, linhas 121-138
**Apply to:** `notify-resumo-diario/index.ts` (via cópia de `postDm()`)
```typescript
for (let i = 0; i < 3; i++) {
  // ... fetch chat.postMessage ...
  if (res.status === 429 || res.status >= 500) {
    await new Promise(r => setTimeout(r, 500 * 2 ** i))
    continue
  }
  // ... retorno em sucesso ou erro 4xx
}
return { ok: false, error: 'Slack indisponível após retries' }
```
3 tentativas com delays de 500ms, 1000ms, 2000ms. Cobre rate-limit e transient 5xx.

### Valores exatos de TERMINAL_STAGES (para query PL/pgSQL)
**Source:** `src/lib/constants.ts`, linhas 18-22
**Apply to:** `supabase/migrations/034_cron_resumo_diario.sql`
```typescript
export const TERMINAL_WON_STAGES = ['ganho_assessoria', 'ganho_consultoria'] as const
export const TERMINAL_LOST_STAGES = ['perdido', 'cancelado'] as const
export const TERMINAL_STAGES = [...TERMINAL_WON_STAGES, ...TERMINAL_LOST_STAGES] as const
```
SQL equivalente verificado:
```sql
AND l.status NOT IN ('ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado')
```
Também excluir `'stand_by'` se leads em espera não devem receber alerta de cadência (decisão para o planner confirmar com o usuário).

---

## No Analog Found

Nenhum arquivo desta fase ficou sem analog. Todos os padrões necessários existem no codebase.

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `supabase/functions/`, `src/lib/`
**Files scanned:** 7 (031_cron_renovacoes.sql, 033_rls_tarefas_notificar.sql, notify-tarefa/index.ts, notify-renovacao/index.ts, cadencia.ts, constants.ts, RESEARCH.md)
**Pattern extraction date:** 2026-05-26

**Observações para o planner:**
1. A migration 034 deve ter um pré-requisito explícito: `SELECT vault.create_secret(...)` para `webhook_resumo_secret` executado manualmente antes de aplicar a migration.
2. O deploy da edge function `notify-resumo-diario` requer `supabase functions deploy notify-resumo-diario` após criação do arquivo.
3. NOTIF-01 não gera nenhuma linha de código — é uma task de verificação de configuração no Supabase Dashboard.
4. A lógica de D-point em PL/pgSQL deve usar o UNION ALL de dois branches (leads com e sem interação) conforme Pitfall 1 do RESEARCH.md — diferente da query ingênua com JOIN LATERAL mostrada na seção Architecture Patterns do RESEARCH.md.
