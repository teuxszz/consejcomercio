# Phase 5: Multi-Channel Notifications (Email) — Research

**Researched:** 2026-05-27
**Domain:** Email delivery (Resend free tier) + webhook tracking + opt-in granular + helper Deno compartilhado em Edge Functions
**Confidence:** HIGH (8 perguntas verificadas via docs oficiais + leitura direta do codebase)

---

## Summary

Phase 5 adiciona canal e-mail via **Resend free tier** (100/dia, 3000/mês) integrado às 4 Edge Functions de notificação existentes (`notify-tarefa`, `notify-resumo-diario`, `notify-indicacao`, `notify-renovacao`), com **opt-in granular por matriz 4×2** em `perfis.preferencias_notif`, **webhook Resend** para tracking de delivery (`delivered/opened/bounced/complained`), **histórico de 30 dias** com botão "Reenviar", e **proteção contra estouro de quota** (drop em 100%, warning UI em 80%).

24 decisões já travadas em CONTEXT.md (D-01 a D-24) — esta pesquisa **não re-debate**, apenas resolve os 8 unknowns técnicos que o planner precisa.

**Primary recommendation:** Migration **035** + helper compartilhado em `_shared/email.ts` + 4 funções estendidas inline + nova função `resend-webhook` + UI (tab Notificações + página histórico + portal preferências). Slicing em **4 plans verticais** que entregam valor incremental (Plan 1 = primeiro e-mail end-to-end via tarefa).

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 a D-24)

Todas as 24 decisões em `05-CONTEXT.md` <decisions> são **canônicas e não-renegociáveis** nesta phase. Destaques que afetam pesquisa:

- **D-01 / D-03:** roteamento híbrido; e-mail + Slack disparam **paralelo, sem deduplicação** quando ambos prefs estão ON
- **D-04:** smart default — email ON em todos os tipos; slack ON apenas se `slack_user_id` preenchido
- **D-05:** fallback diretor quando `responsavel_id` é NULL
- **D-06:** suprimir self-loop em `notify-tarefa` (tech-debt a corrigir)
- **D-12:** deep-link auth via token (Supabase OTP ou JWT custom — **planner decide entre as 3 opções na Question 7 abaixo**)
- **D-16:** webhook Resend com `WEBHOOK_RESEND_SECRET` (Bearer + timing-safe)
- **D-19:** schema `notificacoes_envios` com UNIQUE `(perfil_id, tipo, entidade_id, canal, dia)` + status enum
- **D-20:** helper `sendEmail()` em `supabase/functions/_shared/email.ts` (sem round-trip HTTP entre funções)
- **D-22:** 4 templates HTML específicos em `_shared/templates/`
- **D-23:** Migration **035** (confirmado: última aplicada é 034 — ver Question 4)
- **D-24:** Sender = `onboarding@resend.dev` em dev + prod inicial

### Claude's Discretion (research-resolvable)

- Forma exata da rota `/me/preferencias` (dedicada vs `?tab=`)
- Implementação do deep-link auth token (Question 7)
- Cor/copy/espaçamento dos 4 templates
- Paginação/filtros do histórico (não obrigatórios MVP)
- Counter de quota: query direta vs cached (recomendação CONTEXT já indica TanStack 1min stale)
- Refactor oportunista de `constantTimeAuthCheck` para `_shared/auth.ts`

### Deferred Ideas (OUT OF SCOPE)

MJML, push notifications (Phase 6), aprovação documentos (Phase 7), AI gerando body, queue/retry de drops, fallback automático Slack quando quota cheia, rate-limit interno de re-envio, modo digest único, notificação dual de hand-off, página separada `/notificacoes-admin`.

---

## Phase Requirements

| ID | Descrição | Research Support |
|----|-----------|------------------|
| EMAIL-01 | Opt-in granular por tipo em `/me/preferencias` | Q6 (shadcn Switch), Q5 (lookup `preferencias_notif` nas 4 funções), D-08 (schema JSONB), D-09/D-10 (UI matriz) |
| EMAIL-02 | Edge function envia via Resend (reinterpretada via D-20 como helper) | Q1 (Resend API), Q3 (secret storage), D-20 (helper inline) |
| EMAIL-03 | Triggers leem prefs (reinterpretada via D-03 como E/OU paralelo) | Q5 (refactor surface das 4 funções) |
| EMAIL-04 | Histórico 30d com status + reenviar | Q2 (webhook signature + payload), Q8 (quota query/index), D-19 (schema), D-11/D-17/D-18 (UI/RLS) |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Envio HTTP para Resend API | Edge Function (Deno) | — | Bearer secret nunca pode vazar pro browser; mesmo padrão do Slack `chat.postMessage` |
| Verificação assinatura webhook Resend | Edge Function (Deno) | — | HMAC com `WEBHOOK_RESEND_SECRET`; idêntico ao padrão `slack-commands` |
| Idempotência (UNIQUE + ON CONFLICT) | Database (Postgres) | — | Constraint atômica; padrão já em uso em `notificacoes_renovacao_enviadas` |
| Lookup de prefs / fallback diretor | Edge Function (Deno) | Database | Service-role read; lógica de fallback fica no Deno |
| Render template HTML | Edge Function (Deno) | — | Templates em `_shared/templates/*.html`; substituição via `replace` (D-22) |
| Tracking status via webhook | Edge Function (Deno) | Database | `resend-webhook` recebe evento → UPDATE `notificacoes_envios.status` |
| UI matriz 4×2 prefs | Browser (CRM) | — | shadcn Switch + react-hook-form + TanStack mutation com optimistic update |
| UI matriz portal cliente | Browser (Portal) | — | Mesmo pattern, scope reduzido (D-10) |
| Histórico 30 dias | Browser (CRM) | Database (RLS) | RLS role-aware via `is_at_least('coordenador')`; dropdown "filtrar por usuário" só coord+ |
| Quota counter (warning 80%) | Browser (cached) | Database (raw count) | TanStack Query 1min stale; visível só coord+ via `RequireRole` |
| Reenviar | Browser → Database | Database trigger? | Hook chama mutation que insere nova linha em `notificacoes_envios` + chama edge function diretamente OU edge function via RPC. **Planner decide entre as 2 abordagens; recomendação abaixo na seção Plan Slicing.** |
| Hand-off responsável | Edge Function (cron-driven) | — | Lê `responsavel_id` no momento do disparo (D-07) — comportamento natural já presente |
| Deep-link auth | Edge Function (gera token) → Browser (recebe) | — | Q7 abaixo recomenda a opção |

---

## Standard Stack

**Esta phase NÃO adiciona dependências npm novas além de `@radix-ui/react-switch` (via shadcn).** Toda a stack já existe no projeto. As versões abaixo são confirmadas no `package.json` lido via STACK.md.

### Core (já instalado)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.99.x | Client browser + Edge Function | Único client do projeto; padrão estabelecido |
| `@tanstack/react-query` | 5.90.x | Query/mutation cache | Padrão obrigatório do projeto |
| `react-hook-form` + `zod` | 7.71 / 4.3 | Forms (matriz prefs) | Padrão obrigatório |
| `sonner` | 2.0.x | Toasts | Padrão obrigatório |
| Deno `std@0.224.0` | — | `serve`, `timingSafeEqual` | Já usado em todas as edge functions |
| `https://esm.sh/@supabase/supabase-js@2` | — | Supabase no Deno | Já usado em todas as edge functions |

### Supporting (a instalar / verificar)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@radix-ui/react-switch` + `src/components/ui/switch.tsx` | — | Toggle on/off para matriz prefs | **Ausente** — instalar via shadcn (Q6 abaixo) |

### Alternatives Considered (not chosen)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `fetch` para Resend | `resend` SDK npm | SDK é Node-only, não roda em Deno limpo; raw fetch é trivial (1 POST) e zero dependência |
| Raw HMAC para verify webhook | `https://esm.sh/svix@1` | Svix package adiciona ~50KB cold-start; HMAC manual em ~20 linhas é mais simples e auditável |
| `notify-email` separada (literal de EMAIL-02) | Helper `_shared/email.ts` inline | D-20 já decidiu: round-trip HTTP entre edge functions é desperdício; helper compartilhado dá mesma reusabilidade sem latência extra |

**Installation:**

```bash
# Único pacote a adicionar — via shadcn CLI (instala radix + cria switch.tsx)
npx shadcn@latest add switch
```

**Version verification (executada na pesquisa):**

- Resend API endpoint confirmado via `https://resend.com/docs/api-reference/emails/send-email` [VERIFIED: docs oficiais 2026-05-27]
- Webhook event types e payload `data.email_id` confirmados via `https://resend.com/docs/dashboard/webhooks/introduction` [VERIFIED: docs oficiais 2026-05-27]
- Svix HMAC steps confirmados via `https://docs.svix.com/receiving/verifying-payloads/how-manual` [VERIFIED: docs oficiais 2026-05-27]
- Last migration `034_cron_resumo_diario.sql` confirmado via Glob [VERIFIED: filesystem]
- `src/components/ui/switch.tsx` **NÃO existe** [VERIFIED: Glob retornou "No files found"]

---

## Package Legitimacy Audit

| Package | Registry | Idade | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-------|-----------|-------------|-----------|-------------|
| `@radix-ui/react-switch` | npm | 5+ anos | ~5M/sem | github.com/radix-ui/primitives | n/a (slopcheck indisponível neste env Windows) | Approved — já em uso (várias variantes Radix do projeto via shadcn) |

**Packages removidos:** none
**Packages flagged [SUS]:** none

*slopcheck não foi rodado neste ambiente. `@radix-ui/react-switch` é a única adição e faz parte da família oficial Radix já em uso pesado no projeto (`@radix-ui/react-{checkbox,dialog,dropdown-menu,popover,select,tabs,tooltip,toast,…}` todos confirmados via `STACK.md`). Risco residual: baixo. Planner pode adicionar checkpoint manual antes de `npx shadcn@latest add switch` se quiser ser conservador.* [ASSUMED]

---

## 8 Research Questions

### Q1 — Resend API from Deno

**Recomendação:** **Raw `fetch` direto** para `https://api.resend.com/emails`. Sem SDK. Zero dependência nova. Mesmo padrão das chamadas `chat.postMessage` do Slack já no codebase.

**Endpoint:** `POST https://api.resend.com/emails` [VERIFIED: docs Resend]

**Headers obrigatórios:**

```
Authorization: Bearer re_xxxxxxxxx
Content-Type: application/json
```

**Request body (JSON):**

```json
{
  "from": "CONSEJ <onboarding@resend.dev>",
  "to": ["user@example.com"],
  "subject": "Nova tarefa: Ligar para João",
  "html": "<html>...</html>",
  "headers": { "X-Entity-Ref-ID": "uuid-de-notificacao" }
}
```

| Campo | Obrigatório | Notas |
|-------|-------------|-------|
| `from` | sim | "Nome <email>" funciona; em dev/prod inicial = `"CONSEJ <onboarding@resend.dev>"` (D-24) |
| `to` | sim | string ou array (máx 50) |
| `subject` | sim | UTF-8 PT-BR OK |
| `html` | sim (ou `text`) | template renderizado com replace `{{var}}` (D-22) |
| `headers` | opt | passar `X-Entity-Ref-ID` com `notificacoes_envios.id` ajuda debug |
| `tags` | opt | key/value para filtros no dashboard Resend |
| `reply_to` | opt | não usar em MVP (D-22 footer é estático) |

**Success response (HTTP 200):**

```json
{ "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }
```

Esse `id` é o que persistimos em `notificacoes_envios.resend_id`. **Atenção:** o webhook chama de `data.email_id` (não `data.id`) — ver Q2.

**Error codes (de relevância para Phase 5):**

| HTTP | Causa | Tratamento |
|------|-------|------------|
| 401 | API key inválida/expirada | Não deveria acontecer; logar `error_msg` e marcar `status='failed'` |
| 422 | Body inválido (e-mail mal formatado, subject ausente, sender não verificado) | **Crítico em prod:** se sender domain pendente, `onboarding@resend.dev` só envia para e-mails verificados na conta Resend — ver "Open Risks" abaixo |
| 429 | Rate limit (Resend free: 2 req/seg) | Backoff exponencial (já temos padrão `500*2^i` ms no notify-tarefa); 3 retries |
| 402 | Quota mensal estourou | Marcar `status='dropped_quota'`; nosso checker preventivo (Q8) deve disparar antes |
| 5xx | Resend indisponível | Retry com backoff; após 3 falhas, `status='failed'` |

**Helper assinatura sugerida (esqueleto):**

```typescript
// supabase/functions/_shared/email.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = 'CONSEJ <onboarding@resend.dev>'

export interface SendEmailParams {
  perfilId: string         // PK em perfis (para histórico)
  tipo: 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'
  entidadeId: string | null
  entidadeTipo: 'lead' | 'cliente' | 'contrato' | 'tarefa' | null
  toEmail: string
  subject: string
  html: string
}

export interface SendEmailResult {
  ok: boolean
  status: 'queued' | 'dropped_quota' | 'failed' | 'skipped_idempotent'
  resendId?: string
  errorMsg?: string
  notificacaoId?: string
}

export async function sendEmail(supabase: SupabaseClient, p: SendEmailParams): Promise<SendEmailResult> {
  // 1. Pre-check quota (Q8) — se >=100% diário ou >=3000 mensal, dropped_quota
  // 2. INSERT em notificacoes_envios com ON CONFLICT (perfil_id, tipo, entidade_id, canal='email', dia) DO NOTHING
  //    Se conflito → skipped_idempotent (não chama API)
  //    Se inseriu → capturar id retornado
  // 3. POST Resend com retry 3x backoff
  // 4. UPDATE notificacoes_envios SET resend_id=..., status='queued' (ou 'failed' com error_msg)
}
```

### Q2 — Resend webhook signature

**Recomendação:** **HMAC manual em ~20 linhas** dentro da nova edge function `resend-webhook`. Sem pacote `svix` (50KB extra de cold-start desnecessário).

**Headers que Resend envia:**

| Header | Conteúdo |
|--------|----------|
| `svix-id` | UUID único do evento (para dedup) |
| `svix-timestamp` | Unix timestamp em segundos |
| `svix-signature` | Lista de assinaturas: `"v1,base64sig1 v1,base64sig2"` (suporta rotação) |

**Algoritmo de verificação** [VERIFIED: docs Svix]:

```typescript
// supabase/functions/resend-webhook/verify.ts
import { decode as b64decode, encode as b64encode } from 'https://deno.land/std@0.224.0/encoding/base64.ts'

const SECRET = Deno.env.get('WEBHOOK_RESEND_SECRET')! // formato: whsec_xxx

export async function verifySvixSignature(
  body: string,        // raw text body (NÃO o JSON.parse)
  svixId: string,
  svixTimestamp: string,
  svixSignatureHeader: string,
): Promise<boolean> {
  const keyB64 = SECRET.split('_')[1]
  const keyBytes = b64decode(keyB64)
  const signedContent = `${svixId}.${svixTimestamp}.${body}`

  const key = await crypto.subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const computed = b64encode(new Uint8Array(sig))

  const provided = svixSignatureHeader.split(' ')
    .filter(s => s.startsWith('v1,'))
    .map(s => s.slice(3))

  // constant-time compare contra cada assinatura listada
  return provided.some(p => constantTimeEquals(computed, p))
}
```

**Replay protection:** rejeitar eventos com `svix-timestamp` >5min de diferença do `Date.now()`. Persistir `svix-id` em `notificacoes_webhook_eventos` (tabela auxiliar opcional) para dedup absoluto — **ou** confiar apenas em idempotência das colunas timestamp (`delivered_at`, `opened_at` — se já preenchidas, ignora).

**Event types e payload shape** [VERIFIED: docs Resend]:

| Event type | Campo em `notificacoes_envios` afetado | `data.email_id` é a chave |
|------------|----------------------------------------|---------------------------|
| `email.sent` | (ignorar — equivalente ao nosso `queued` inicial) | sim |
| `email.delivered` | `status='delivered'`, `delivered_at=created_at` | sim |
| `email.opened` | `status='opened'`, `opened_at=created_at` | sim |
| `email.bounced` | `status='bounced'`, `bounced_at=created_at`, `error_msg=data.bounce.message` | sim |
| `email.complained` | `status='complained'`, `complained_at=created_at` | sim |
| `email.delivery_delayed` | (logar; não mudar status — vai resolver pra `delivered` ou `bounced`) | sim |
| `email.clicked` | (ignorar MVP — opcional v2) | sim |

**Payload exemplo (Resend):**

```json
{
  "type": "email.bounced",
  "created_at": "2026-11-22T23:41:12.126Z",
  "data": {
    "email_id": "56761188-7520-42d8-8898-ff6fc54ce618",
    "from": "CONSEJ <onboarding@resend.dev>",
    "to": ["user@example.com"],
    "subject": "...",
    "bounce": { "message": "...", "type": "..." }
  }
}
```

**Match query:**

```sql
UPDATE notificacoes_envios
SET status = $1, delivered_at = $2  -- (e respectivas colunas conforme tipo)
WHERE resend_id = $3 -- = payload.data.email_id
```

### Q3 — Secret storage

**Recomendação:** **Supabase Secrets** (não Vault).

| Critério | Supabase Secrets | Vault |
|----------|------------------|-------|
| API consumption | Direto via `Deno.env.get()` | Precisa `vault.decrypted_secrets` SELECT em SQL |
| Setup | `supabase secrets set RESEND_API_KEY=re_xxx` | `SELECT vault.create_secret(...)` |
| Quem precisa | Edge Functions (Deno) | Postgres (pg_cron HTTP callouts) |
| Já em uso no projeto | SIM — `SLACK_BOT_TOKEN`, `WEBHOOK_*_SECRET`, etc. | Sim, mas só em `031_cron_renovacoes.sql` para o `pg_cron` chamar webhook |

Como `RESEND_API_KEY` e `WEBHOOK_RESEND_SECRET` serão consumidos exclusivamente por Edge Functions Deno (não por `pg_cron`), **Supabase Secrets é a escolha correta**, alinhada ao padrão `SLACK_BOT_TOKEN`/`WEBHOOK_TAREFA_SECRET` já estabelecido em INTEGRATIONS.md.

**Comandos de provisionamento:**

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set WEBHOOK_RESEND_SECRET=whsec_xxxxxxxx  # vem do dashboard Resend ao configurar o endpoint
```

`STATE.md` confirma: `RESEND_API_KEY` já configurada como Supabase Secret em 2026-05-27. `WEBHOOK_RESEND_SECRET` será criada pelo Resend quando o webhook for registrado no dashboard apontando para `{SUPABASE_URL}/functions/v1/resend-webhook`.

### Q4 — Next migration number

**Confirmado via Glob:** última migration aplicada é `034_cron_resumo_diario.sql`. Próxima = **035**.

Lista completa observada: `001` → `016`, salto para `019` (pula 017/018), depois `020` → `034` contínuos.

**Filename sugerido:** `supabase/migrations/035_notificacoes_envios.sql`

Conteúdo da migration (resume D-19 + D-23):

```sql
-- 035_notificacoes_envios.sql

-- 1. Coluna preferencias_notif em perfis
ALTER TABLE perfis
ADD COLUMN preferencias_notif jsonb NOT NULL DEFAULT '{
  "tarefa":    { "slack": false, "email": true },
  "cadencia":  { "slack": false, "email": true },
  "renovacao": { "slack": false, "email": true },
  "indicacao": { "slack": false, "email": true }
}'::jsonb;

-- 2. Tabela notificacoes_envios
CREATE TABLE notificacoes_envios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id       uuid NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('tarefa','cadencia','renovacao','indicacao')),
  entidade_id     uuid,
  entidade_tipo   text CHECK (entidade_tipo IN ('lead','cliente','contrato','tarefa') OR entidade_tipo IS NULL),
  canal           text NOT NULL CHECK (canal IN ('email','slack')),
  subject         text,
  status          text NOT NULL CHECK (status IN (
    'queued','delivered','opened','bounced','complained',
    'dropped_quota','skipped_no_recipient','fallback_diretor','failed'
  )),
  resend_id       text,
  slack_ts        text,
  error_msg       text,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  opened_at       timestamptz,
  bounced_at      timestamptz,
  complained_at   timestamptz,
  reenviado_por_id uuid REFERENCES perfis(id),
  reenviado_em    timestamptz,
  dia             date GENERATED ALWAYS AS (sent_at::date) STORED,
  CONSTRAINT notif_envios_unique UNIQUE (perfil_id, tipo, entidade_id, canal, dia)
);

-- 3. Índices (ver Q8 para racional)
CREATE INDEX idx_notif_envios_quota ON notificacoes_envios (canal, dia, status);
CREATE INDEX idx_notif_envios_perfil_sent ON notificacoes_envios (perfil_id, sent_at DESC);
CREATE INDEX idx_notif_envios_resend ON notificacoes_envios (resend_id) WHERE resend_id IS NOT NULL;

-- 4. RLS
ALTER TABLE notificacoes_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_envios_read ON notificacoes_envios FOR SELECT
USING (
  perfil_id = auth.uid()
  OR is_at_least('coordenador')  -- função da migration 029
);

-- INSERT/UPDATE feitos apenas via service_role (Edge Functions) — sem policy permissiva

-- 5. Atualizar handle_new_user para aplicar smart default condicional
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_slack text;
  v_prefs jsonb;
BEGIN
  -- ... corpo existente que cria perfil ...
  -- Após criar perfil, computar prefs:
  v_slack := NULL; -- novo perfil ainda não tem slack_user_id
  v_prefs := jsonb_build_object(
    'tarefa',    jsonb_build_object('slack', v_slack IS NOT NULL, 'email', true),
    'cadencia',  jsonb_build_object('slack', v_slack IS NOT NULL, 'email', true),
    'renovacao', jsonb_build_object('slack', v_slack IS NOT NULL, 'email', true),
    'indicacao', jsonb_build_object('slack', v_slack IS NOT NULL, 'email', true)
  );
  UPDATE perfis SET preferencias_notif = v_prefs WHERE id = new.id;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Observação importante:** a coluna `preferencias_notif` é populada com `email: true, slack: false` no DEFAULT. O trigger `handle_new_user` reaplica computando `slack: (slack_user_id IS NOT NULL)`. Para perfis **já existentes**, planner precisa de um `UPDATE` adicional no fim da migration:

```sql
UPDATE perfis
SET preferencias_notif = jsonb_build_object(
  'tarefa',    jsonb_build_object('slack', slack_user_id IS NOT NULL, 'email', true),
  'cadencia',  jsonb_build_object('slack', slack_user_id IS NOT NULL, 'email', true),
  'renovacao', jsonb_build_object('slack', slack_user_id IS NOT NULL, 'email', true),
  'indicacao', jsonb_build_object('slack', slack_user_id IS NOT NULL, 'email', true)
);
```

### Q5 — Existing notify-* refactor surface

Cada uma das 4 funções existentes recebe **as mesmas 4 mudanças cirúrgicas** (com variações listadas por função):

**Mudanças comuns às 4 funções (ordem dentro do handler):**

1. **Antes de qualquer chamada Slack:** lookup de `preferencias_notif` do destinatário:
   ```typescript
   const prefs = await loadPrefs(supabase, perfilId)
   const wantSlack = prefs?.[tipo]?.slack === true && slackUserId !== null
   const wantEmail = prefs?.[tipo]?.email === true
   ```
2. **Disparos em paralelo (D-03):**
   ```typescript
   const [slackResult, emailResult] = await Promise.all([
     wantSlack ? postDm(slackUserId!, text, blocks) : skip('slack_off'),
     wantEmail ? sendEmail(supabase, { perfilId, tipo, entidadeId, toEmail, subject, html }) : skip('email_off'),
   ])
   ```
3. **Log em `notificacoes_envios`** acontece dentro do `sendEmail()` (helper); para Slack, adicionar INSERT explícito com `canal='slack'`, `slack_ts=result.ts`, `status='delivered'` (Slack confirma sync).
4. **Fallback diretor (D-05)** quando `perfilId` resolvido é NULL: loopar sobre `SELECT id, email FROM perfis WHERE role='diretor'` e disparar email para cada, com `status='fallback_diretor'`.

**Mudanças específicas por função:**

| Função | Mudança extra |
|--------|----------------|
| `notify-tarefa` | **Self-loop suppression (D-06):** após detectar atribuição válida, `if (tarefa.criado_por_id === tarefa.atribuido_a_id) return json({ ok: true, skipped: 'self_loop' })`. Inserir **antes** do lookup de prefs. |
| `notify-resumo-diario` | Já tem `perfil_id` — só adicionar companion email. Entidade = NULL (resumo é geral). |
| `notify-indicacao` | **Lookup novo:** após criar o lead via indicação, buscar `leads.responsavel_id` do lead criado: `SELECT id, responsavel_id FROM leads WHERE id = $lead_criado_id`. Se NULL → fallback diretor. Canal Slack broadcast (`SLACK_LEADS_CHANNEL_ID`) **permanece intocado** (D-01). |
| `notify-renovacao` | **Lookup novo:** `SELECT responsavel_id FROM contratos WHERE id = $contrato_id`. Mesmo fallback. Broadcast permanece. |

**Duplicação digna de extração para `_shared/`:**

| Helper duplicado | Onde aparece | Sugestão `_shared/` |
|------------------|--------------|---------------------|
| `constantTimeAuthCheck` | 4 funções (idêntico) + nova `resend-webhook` precisará | **`_shared/auth.ts`** — extração obrigatória pra evitar drift de 5 cópias |
| `findSlackUserId` | 3 funções (notify-tarefa, notify-resumo-diario, e implicitamente nas outras) | `_shared/perfis.ts` — `findSlackUserId(supabase, perfilId)` |
| `findPerfilName` / `findPerfilNome` (nomes diferentes!) | notify-tarefa usa `findPerfilName`, notify-resumo-diario usa `findPerfilNome` | `_shared/perfis.ts` — unificar como `findPerfilNome` |
| `openDmChannel` + `postDm` | 4 funções (idênticos com retry 500*2^i) | `_shared/slack.ts` — `postSlackDm(token, slackUserId, text, blocks)` |
| `json(body, status)` | 4 funções (idêntico) | `_shared/http.ts` — opcional, 3 linhas só |

**Refactor mínimo obrigatório (D-20 + CONTEXT discretion):** apenas `_shared/auth.ts` e o novo `_shared/email.ts` + `_shared/templates/`. Os demais (`_shared/perfis.ts`, `_shared/slack.ts`) são opportunistic — planner decide se entra na phase ou vira tech-debt.

**Recomendação:** **incluir `_shared/perfis.ts` e `_shared/slack.ts` na phase**. Razão: 4 funções estão sendo tocadas de qualquer forma; é o momento natural para deduplicar sem aumentar muito a superfície da phase. Sem isso, qualquer bugfix futuro precisará ser aplicado em 4 lugares.

### Q6 — shadcn Switch

**Confirmado via Glob:** `src/components/ui/switch.tsx` **não existe**. Lista atual em `src/components/ui/` (per STACK.md) = `avatar, badge, button, card, dialog, dropdown-menu, input, label, progress, select, separator, tabs, textarea, tooltip, empty-state, search-input` — **sem switch**.

**Comando exato:**

```bash
npx shadcn@latest add switch
```

Isso vai:
1. Adicionar `@radix-ui/react-switch` ao `package.json` (já listado nas peer deps que vêm com várias outras Radix variants)
2. Criar `src/components/ui/switch.tsx` com a implementação shadcn canônica
3. Reutilizar tokens HSL `--primary`, `--background`, `--input` já no `tailwind.config.js`

Nada de config adicional necessário. Após `npm install`, importar como:

```typescript
import { Switch } from '@/components/ui/switch'
```

### Q7 — Deep-link auth token (3 opções)

| Opção | Como funciona | Complexidade | UX | Segurança |
|-------|---------------|--------------|----|-----------|
| **(a) Supabase `signInWithOtp`** | Gerar magic link via SDK; link aponta para `/auth/v1/verify?token=...&type=magiclink&redirect_to=/me/preferencias` | **Baixa** (uma chamada SDK no helper email) | Excelente — Supabase trata redirect e cria sessão automaticamente | Alta (Supabase audita e expira) |
| **(b) JWT custom assinado** | Edge function assina JWT curto (5min) com `SERVICE_ROLE_KEY` ou secret próprio via `djwt`; rota client `/auth-link?token=X` valida via `supabase.auth.setSession` ou chamada edge function | **Média-alta** (precisa biblioteca `djwt` + endpoint de verificação + injeção de sessão no client) | Boa | Alta, mas precisa cuidado com algoritmo (RS256 vs HS256) e replay |
| **(c) Downgrade: redirect-after-login** | Link no email = `${APP_URL}/me/preferencias?next=/me/preferencias`; se sem sessão, `/login?next=...` redireciona | **Mínima** (já tem padrão `next` no AppLayout) | Pior — força login se sessão expirou | Mais segura (sem token novo no fluxo) |

**Recomendação: (a) Supabase `signInWithOtp`** com fallback (c).

**Razões:**
1. **Já em uso no projeto** — `ClienteDetailPage.tsx:173` faz `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: ... }})` para criar magic link de convite ao cliente. Padrão estabelecido, zero código novo de criptografia.
2. **Custo zero** — Supabase Auth grátis até 50k MAU; magic links contam como auth events normais.
3. **Sem necessidade de criar/verificar JWT manualmente** — elimina superfície de bug em algoritmo HMAC.
4. **Fallback gracioso** — se `signInWithOtp` falhar (e.g., usuário não cadastrado), gerar link direto `${APP_URL}/me/preferencias` e o `AppLayout` redireciona pra `/login?next=...` — opção (c) embutida sem código extra.

**Implementação no `sendEmail` helper:**

```typescript
// dentro do _shared/email.ts, ao renderizar template:
const { data: linkData, error } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: toEmail,
  options: { redirectTo: `${APP_URL}/me/preferencias` }
})
const deepLink = linkData?.properties?.action_link ?? `${APP_URL}/me/preferencias`
```

`admin.generateLink` é o método server-side (service_role) que gera o link **sem enviar e-mail** — exatamente o que precisamos (vamos enviar nós mesmos via Resend com nosso template).

**Caveat:** `generateLink` exige `service_role` key; já está disponível no Edge Function. Para clientes do Portal (D-10), mesmo método, com `redirectTo: ${APP_URL}/portal/preferencias`.

### Q8 — Quota counter (query + index)

**Query exata:**

```sql
SELECT
  COUNT(*) FILTER (WHERE dia = CURRENT_DATE AND canal = 'email' AND status NOT IN ('dropped_quota','skipped_no_recipient','fallback_diretor')) AS hoje,
  COUNT(*) FILTER (WHERE dia >= date_trunc('month', CURRENT_DATE)::date AND canal = 'email' AND status NOT IN ('dropped_quota','skipped_no_recipient','fallback_diretor')) AS mes
FROM notificacoes_envios
WHERE canal = 'email'
  AND dia >= date_trunc('month', CURRENT_DATE)::date;
```

Retorna `{ hoje: 23, mes: 412 }`. Frontend computa `pctHoje = hoje/100`, `pctMes = mes/3000`, warning se `max(pctHoje, pctMes) > 0.8`, hard drop pré-emptivo no helper se `pctHoje >= 1 || pctMes >= 1`.

**Índice recomendado:**

```sql
CREATE INDEX idx_notif_envios_quota ON notificacoes_envios (canal, dia, status);
```

**Por que esses 3 campos nessa ordem:**
- `canal` em primeiro lugar — filtro fixo `='email'`, alta seletividade (50% das linhas serão Slack)
- `dia` em segundo — range scan dentro do filtro de canal; coluna GENERATED STORED é determinística e indexável
- `status` em terceiro — usado no `NOT IN`; ajuda a planner aplicar filtro composto sem voltar à tabela

**Alternativa avaliada e rejeitada:** índice em `(canal, sent_at)`. Funciona mas força planner a fazer `sent_at::date >= ...` que não usa o índice de forma ótima — a coluna gerada `dia` resolve isso melhor.

**TanStack Query setup (frontend):**

```typescript
// src/hooks/useQuotaResend.ts
export function useQuotaResend() {
  return useQuery({
    queryKey: QUERY_KEYS.quotaResend.current,
    queryFn: async () => {
      const { data } = await supabase.rpc('quota_resend_atual')
      return data as { hoje: number; mes: number }
    },
    staleTime: 60_000, // 1 min — CONTEXT discretion
    refetchOnWindowFocus: false,
  })
}
```

Sugestão: criar RPC `quota_resend_atual()` SECURITY DEFINER que retorna `(hoje int, mes int)` ao invés de query inline — esconde a complexidade do SQL e fica reusável no banner UI + edge function pre-check.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x (já em uso) |
| Config file | `vitest.config.ts` (jsdom env, globals) |
| Quick run | `npm test` (vitest run, todos os arquivos) |
| Full suite | `npm test && npm run test:rls` |
| RLS regression | `npm run test:rls` (vitest tests/rls) |

### Phase Requirements → Test Map

| Req ID | Comportamento | Test Type | Comando Automatizado | File Exists? |
|--------|---------------|-----------|----------------------|--------------|
| EMAIL-01 | Matriz 4×2 grava `preferencias_notif` no banco | unit | `npm test -- src/hooks/__tests__/usePreferenciasNotif.test.ts` | ❌ Wave 0 |
| EMAIL-01 | Smart default aplicado em `handle_new_user` (slack OFF sem slack_user_id) | rls | `npm run test:rls -- tests/rls/preferencias_notif.test.ts` | ❌ Wave 0 |
| EMAIL-02 | Helper `sendEmail` retorna `skipped_idempotent` em ON CONFLICT | unit | `npm test -- supabase/functions/_shared/__tests__/email.test.ts` | ❌ Wave 0 |
| EMAIL-02 | Pre-check quota retorna `dropped_quota` sem chamar Resend | unit | `npm test -- supabase/functions/_shared/__tests__/email.quota.test.ts` | ❌ Wave 0 |
| EMAIL-03 | `notify-tarefa` suprime self-loop (criador == atribuído) | unit | `npm test -- supabase/functions/notify-tarefa/__tests__/self-loop.test.ts` | ❌ Wave 0 |
| EMAIL-03 | `notify-tarefa` dispara Slack + Email em paralelo quando ambos opt-in | unit (mock fetch) | `npm test -- supabase/functions/notify-tarefa/__tests__/parallel.test.ts` | ❌ Wave 0 |
| EMAIL-03 | Fallback diretor quando `responsavel_id` NULL | unit | `npm test -- supabase/functions/_shared/__tests__/email.fallback.test.ts` | ❌ Wave 0 |
| EMAIL-04 | Histórico só mostra próprios para consultor; coord+ vê todos | rls | `npm run test:rls -- tests/rls/notificacoes_envios.test.ts` | ❌ Wave 0 |
| EMAIL-04 | Botão "Reenviar" insere nova linha com `reenviado_por_id/em` | unit | `npm test -- src/hooks/__tests__/useReenviarNotificacao.test.ts` | ❌ Wave 0 |
| EMAIL-04 | Webhook signature inválida retorna 401 | unit | `npm test -- supabase/functions/resend-webhook/__tests__/verify.test.ts` | ❌ Wave 0 |
| EMAIL-04 | Webhook `email.opened` atualiza `opened_at` via `data.email_id` match | unit | `npm test -- supabase/functions/resend-webhook/__tests__/handler.test.ts` | ❌ Wave 0 |

**Manual-only (não automatizável):**
- Verificar visualmente que template renderiza limpo em Gmail / Outlook web (cross-client compat)
- Confirmar UX do magic link (clicar do e-mail → abrir CRM logado na tab Notificações)
- Confirmar warning UI aparece em `/adocao` quando contador > 80%

### Sampling Rate

- **Per task commit:** `npm test -- <arquivo>.test.ts` (subset relacionado)
- **Per wave merge:** `npm test && npm run test:rls`
- **Phase gate:** Full suite green + manual smoke test (3 itens acima) antes de `/gsd-verify-work`

### Wave 0 Gaps

Todas as 11 entradas da tabela acima são **Wave 0 gaps** — nenhum arquivo de teste existe ainda. Sugestão para o planner:

- [ ] `src/hooks/__tests__/usePreferenciasNotif.test.ts` — mutation + optimistic update
- [ ] `supabase/functions/_shared/__tests__/email.test.ts` — helper sendEmail (mock fetch Resend)
- [ ] `supabase/functions/notify-tarefa/__tests__/self-loop.test.ts` — D-06 regression test
- [ ] `tests/rls/preferencias_notif.test.ts` — RLS na coluna nova
- [ ] `tests/rls/notificacoes_envios.test.ts` — RLS role-aware na nova tabela
- [ ] `supabase/functions/resend-webhook/__tests__/verify.test.ts` — HMAC verificação
- [ ] `supabase/functions/resend-webhook/__tests__/handler.test.ts` — payload → status update

**Framework já instalado** — sem `npm install` adicional para tests.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Aplica | Standard Control |
|---------------|--------|------------------|
| V2 Authentication | sim | Supabase Auth (já em uso); magic link via `admin.generateLink` para deep-link |
| V3 Session Management | sim | Sessão Supabase com `staleTime:0` em `useMeuPerfil` (já em uso) |
| V4 Access Control | sim | RLS role-aware via `is_at_least('coordenador')` na `notificacoes_envios` |
| V5 Input Validation | sim | Zod schemas para `preferencias_notif` writes (matriz 4×2 estrita) |
| V6 Cryptography | sim | HMAC-SHA256 manual via `crypto.subtle` (browser-standard) — não hand-rolling de algoritmo, apenas das 20 linhas de verificação |
| V10 Malicious Code | n/a | Sem upload de arquivo nesta phase |
| V11 Business Logic | sim | Idempotência via UNIQUE constraint — atômico no Postgres |
| V12 File / Resource | n/a | Sem arquivo nesta phase |
| V13 API | sim | Webhook signature + Bearer secret + replay protection (5min window em `svix-timestamp`) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Webhook replay attack | Repudiation | Validar `svix-timestamp` >5min reject; opcional: persistir `svix-id` em tabela dedup |
| Forge webhook payload | Spoofing | HMAC verificação obrigatória; sem fallback inseguro |
| API key leak via frontend | Information Disclosure | `RESEND_API_KEY` NUNCA exposta — vive só em Edge Function via `Deno.env` |
| Magic link reuse / interception | Elevation of Privilege | Supabase expira magic links automaticamente (default 1h); usar `redirectTo` restrito |
| Email enumeration via reenviar | Information Disclosure | RLS bloqueia listar `notificacoes_envios` de outros (consultor) — pattern já no projeto |
| Quota exhaustion by malicious internal | DoS | RLS impede INSERT direto; só Edge Function (service_role) escreve; idempotência UNIQUE protege duplicatas |
| Template injection via subject/body | Tampering | Subject e body são construídos por nós (não user input). Substituição `{{var}}` deve **escapar HTML** dos valores (ex.: nome do lead `<script>` viraria `&lt;script&gt;`) |
| Cross-tenant leak via fallback diretor | Information Disclosure | Fallback é intencional e dentro do mesmo tenant (CONSEJ); status `fallback_diretor` deixa rastro auditável |

**Atenção template injection:** ao implementar `replace('{{nomeLead}}', leadName)`, **escapar HTML do `leadName`** primeiro. Usar helper:

```typescript
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!))
}
```

---

## Common Pitfalls

### Pitfall 1: Sender domain restrito (CRÍTICO)

**O que acontece:** `onboarding@resend.dev` (D-24) é o sender padrão Resend, **mas só envia para e-mails verificados na sua conta Resend**. Em prod, ao enviar para um e-mail interno CONSEJ que não está na lista de "Test addresses" da conta Resend, **a API retorna 403 silencioso** e o e-mail nunca chega.

**Por que acontece:** Resend usa `resend.dev` como sandbox antes de domain verification. Restrição é deliberada para evitar spam.

**Como evitar:**
1. **Verificar todos os e-mails internos CONSEJ** em Resend Dashboard → Settings → Audiences → "Add test email" antes do primeiro disparo de prod.
2. **OU** acelerar o tech-debt do DNS (STATE.md) com Andrieli para destravar `notif@consej.com.br`.
3. **Sinal de aviso:** primeiro `email.bounced` em prod com `bounce.message` indicando "address not verified".

**Tratamento defensivo no helper:** logar `error_msg` completo na resposta 422; surfacer no `/me/notificacoes-historico` para coord+ identificar rapidamente.

### Pitfall 2: Webhook ordem dos eventos

**O que acontece:** `email.opened` pode chegar **antes** de `email.delivered` em alguns scenarios (race entre tracking pixel e SMTP confirmation).

**Por que acontece:** eventos Resend são paralelos; sem ordem garantida.

**Como evitar:** o handler **não deve regredir status**. Se `status='opened'` e chega `email.delivered`, manter `opened`. Lógica:

```typescript
const STATUS_RANK = { queued: 0, delivered: 1, opened: 2, bounced: 99, complained: 99, failed: 99 }
// Só atualizar se novo rank > rank atual (ou se é estado terminal bounced/complained)
```

### Pitfall 3: Webhook duplicate delivery

**O que acontece:** Resend pode reenviar o mesmo evento (network failure no ACK). Se UPDATE não é idempotente, contadores podem inflar.

**Como evitar:** UPDATE de `delivered_at/opened_at/bounced_at` é naturalmente idempotente (mesmo timestamp se reaplicado). MAS se houver lógica de "incrementar contador de opens" → guardar `svix-id` em tabela dedup.

### Pitfall 4: ON CONFLICT com NULL em entidade_id

**O que acontece:** Em PostgreSQL, `NULL != NULL` em UNIQUE constraints — duas linhas com `entidade_id=NULL, tipo='cadencia'` para o mesmo perfil/canal/dia **não conflitam**, quebrando idempotência.

**Como evitar:** usar `COALESCE` ou índice parcial. Opção mais limpa:

```sql
CREATE UNIQUE INDEX notif_envios_unique
ON notificacoes_envios (perfil_id, tipo, canal, dia, COALESCE(entidade_id, '00000000-0000-0000-0000-000000000000'::uuid));
```

**Substituir** a CONSTRAINT UNIQUE da migration por este índice. ON CONFLICT então usa `ON CONFLICT ON CONSTRAINT` ou `ON CONFLICT (... COALESCE(...) ...)`.

### Pitfall 5: Magic link redirect quebrado em iOS Safari

**O que acontece:** clicar magic link de e-mail em iOS Safari pode abrir em "in-app browser" do Mail → sessão Supabase não persiste no Safari principal.

**Como evitar:** opcional adicionar `?intent=open-in-safari` no link; documentar como known issue na phase. Sem mitigação trivial.

### Pitfall 6: Race entre INSERT idempotency e API call

**O que acontece:** se fizermos `INSERT ... ON CONFLICT DO NOTHING` retornando id → chamar Resend → UPDATE com `resend_id`, mas o INSERT retornou 0 rows (conflito), tentamos UPDATE WHERE id=undefined.

**Como evitar:** usar `INSERT ... ON CONFLICT (...) DO UPDATE SET subject=EXCLUDED.subject RETURNING id, (xmax = 0) AS inserted`. Se `inserted=false` → conflito, retornar `skipped_idempotent` sem chamar Resend.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Slack-only notifications | Slack + Email paralelo (híbrido D-01) | Phase 5 (2026-05-27) | Time sem Slack ativo recebe via email |
| EMAIL-02 "edge function `notify-email` separada" | Helper `_shared/email.ts` inline (D-20) | CONTEXT 2026-05-27 | Sem round-trip HTTP entre Edge Functions |
| EMAIL-03 "Slack OU email" (mutex) | "Slack E/OU email" (D-03 paralelo) | CONTEXT 2026-05-27 | Usuário controla cada canal independente |
| `notify-tarefa` envia DM para auto-atribuição | Suprime self-loop (D-06) | Phase 5 | Reduz ruído ~30% |

**Deprecated/outdated:** N/A — nenhuma feature está sendo removida nesta phase.

---

## Recommended Plan Slicing (MVP)

**Princípio:** cada plan entrega **valor end-to-end shippable** (não fatia horizontal de "tudo o schema, depois tudo a UI"). Sequência permite parar em qualquer plan e ter um produto incremental funcional.

### Plan 1 — Foundation + First Email (Tarefa)

**Valor entregue:** **Primeiro e-mail real sai** quando uma tarefa é atribuída. Time consegue ver na própria caixa. Validação end-to-end de toda a pipeline.

**Conteúdo:**
- Migration 035 completa (schema + RLS + index + trigger update + backfill)
- `_shared/auth.ts` (refactor de `constantTimeAuthCheck`)
- `_shared/email.ts` (helper completo: pre-check quota, INSERT idempotente, POST Resend, UPDATE status, magic link generation)
- `_shared/templates/tarefa.html` (template HTML inline com placeholders)
- `_shared/templates/_base.css.ts` (helper de styling compartilhado)
- Refactor `notify-tarefa/index.ts`: self-loop suppression + lookup prefs + Promise.all Slack+Email
- Wave 0 tests: `email.test.ts`, `self-loop.test.ts`, `email.fallback.test.ts`, `preferencias_notif.test.ts` (RLS), `notificacoes_envios.test.ts` (RLS)
- Deploy: `supabase functions deploy notify-tarefa` + `supabase db push`

**Gate:** atribuir tarefa de teste → e-mail chega na caixa + linha em `notificacoes_envios` com `status='queued'`.

### Plan 2 — Extend to Cadência, Renovação, Indicação + Webhook

**Valor entregue:** **Todos os 4 tipos de notif disparam e-mail.** Status de delivery aparece automaticamente via webhook.

**Conteúdo:**
- `_shared/templates/cadencia.html`, `renovacao.html`, `indicacao.html`
- Opcional (recomendado): `_shared/perfis.ts` + `_shared/slack.ts` (refactor dos 3 helpers duplicados)
- Refactor `notify-resumo-diario/index.ts`: companion email (perfil_id já existe)
- Refactor `notify-indicacao/index.ts`: lookup `leads.responsavel_id` + companion email
- Refactor `notify-renovacao/index.ts`: lookup `contratos.responsavel_id` + companion email
- Nova edge function `resend-webhook/index.ts` + `verify.ts` (HMAC manual)
- Wave 0 tests: `verify.test.ts`, `handler.test.ts`, `parallel.test.ts`
- Configurar webhook no Resend Dashboard apontando para `{SUPABASE_URL}/functions/v1/resend-webhook`
- `supabase secrets set WEBHOOK_RESEND_SECRET=whsec_...`
- Deploy: 4 funções + nova webhook

**Gate:** disparar cada um dos 4 tipos → e-mail chega + status sobe para `delivered` em <30s via webhook.

### Plan 3 — UI Internos: Tab Notificações + Histórico

**Valor entregue:** **Internos podem configurar prefs e ver histórico** no CRM.

**Conteúdo:**
- `npx shadcn@latest add switch`
- `src/types/index.ts`: tipos `PreferenciasNotif`, `NotificacaoEnvio`, `CanalNotif`, `TipoNotif`
- `src/lib/query-keys.ts`: `QUERY_KEYS.preferenciasNotif`, `QUERY_KEYS.notificacoesEnvios`, `QUERY_KEYS.quotaResend`
- `src/hooks/usePreferenciasNotif.ts` (query + mutation com optimistic update)
- `src/hooks/useNotificacoesEnvios.ts` (query com filtro 30d + perfil_id opcional)
- `src/hooks/useReenviarNotificacao.ts` (mutation que chama Edge Function ou RPC)
- `src/hooks/useQuotaResend.ts` (1min stale)
- `src/components/me/NotificacoesPanel.tsx` (matriz 4×2 com 8 Switches)
- `src/pages/MeEspacoPage.tsx`: adicionar tab "Notificações"
- `src/pages/NotificacoesHistoricoPage.tsx` (lista + filtro user dropdown para coord+ + reenviar)
- `src/router.tsx`: rotas `/me/preferencias` (sub-rota MeEspaco com tab pre-set), `/me/notificacoes-historico`
- Banner warning quota em `/adocao` e `/configuracoes` (visível só coord+ via `RequireRole`)
- Wave 0 tests: `usePreferenciasNotif.test.ts`, `useReenviarNotificacao.test.ts`

**Gate:** consultor abre `/me/preferencias` → toggla email/slack por tipo → grava. Coordenador abre `/me/notificacoes-historico?perfil=outro_user` → vê notifs do outro user.

### Plan 4 — Portal Cliente: Preferências (preparação Phase 7)

**Valor entregue:** **Infra de prefs para cliente pronta** quando Phase 7 (aprovação documentos) for ativar notifs reais.

**Conteúdo:**
- `src/pages/portal/PortalPreferenciasPage.tsx` (matriz reduzida — só linha `documentos` × coluna `email`, placeholder até Phase 7)
- `src/router.tsx`: rota `/portal/preferencias`
- `src/pages/portal/PortalLayout.tsx`: link nav "Preferências"
- Documentação: comentário explícito de que tipo `documentos` ainda não dispara (Phase 7)
- Smoke test manual: cliente faz login no portal → vê `/portal/preferencias` → toggla switch → grava

**Gate:** PR aprovado mesmo sem notif real disparando (Phase 7 plugará).

**Por que 4 e não 3 ou 5:**
- **3 plans** seria forçar Plan 3 a também incluir Portal — Portal tem layout/shell diferente, vale ter PR separado pra revisar
- **5 plans** fragmenta demais — refactor das 4 funções (Plan 2) é coeso e cabe num PR
- Plan 1 é a fronteira de **risco** (primeira API key sendo usada em prod, primeira migration grande) — vale isolar pra rollback rápido

---

## Open Risks / Landmines

### R1 — Sender restriction `onboarding@resend.dev` (CRÍTICO em prod)

Repetindo do Pitfall 1 por importância: até DNS de `consej.com.br` ser verificado no Resend, **só e-mails verificados na Resend Audience recebem**. Sem isso, e-mail de prod silenciosamente falha (HTTP 403).

**Mitigação imediata:** antes de mergear Plan 1 em prod, **pre-cadastrar todos os e-mails internos CONSEJ ativos** (5-10 contas) em Resend Dashboard. Documentar a lista no STATE.md.

### R2 — Cron `notify-resumo-diario` pode disparar 8h em vez de 7h após DST

Brasil aboliu DST em 2019, mas servidores UTC mantêm horário fixo. Resumo configurado às `10:00 UTC` = 7:00 BRT (constante o ano todo). **Sem risco real**, mas anotar para evitar confusão se cron mudar.

### R3 — `admin.generateLink` é rate-limited

Supabase limita `admin.generateLink` a ~30/min por projeto. Se o resumo diário disparar 50 e-mails às 7h, **gerar 50 magic links em paralelo pode hitar 429** do próprio Supabase.

**Mitigação:** rate-limit interno no `sendEmail` helper — quando volume diário >25, sequenciar `generateLink` em batches de 10 com `await sleep(2000)`. **OU** downgrade para opção (c) — link direto `${APP_URL}/me/preferencias` (redirect-after-login).

### R4 — Webhook reentrante durante migration

Se a migration 035 demorar (Supabase pode lockear), e ao mesmo tempo um webhook Resend chegar tentando UPDATE em `notificacoes_envios`, **o INSERT/UPDATE da migration pode deadlock**.

**Mitigação:** registrar o webhook no Resend Dashboard **APÓS** migration aplicada e Plan 1 deployado. Documentar no runbook.

### R5 — Sonner toast em mass-mutation do switch matriz

8 switches × clicar todos rapidamente → 8 mutations otimistas → 8 toasts empilhados. **UX ruim.**

**Mitigação:** debounce 500ms na mutation OU agrupar prefs num único PATCH `{ preferencias_notif: novaMatrizCompleta }`. Recomendação: **PATCH único** — mais simples e atômico.

### R6 — RLS bug latente: `auth.uid()` no INSERT do webhook

Edge Function chama via `service_role` (bypass RLS), mas se algum dev futuro mudar pra anon, INSERT no `notificacoes_envios` falharia silenciosamente (não há policy de INSERT permissiva).

**Mitigação:** comentar **explicitamente** na migration que INSERT/UPDATE são via service_role apenas, **sem** policy permissiva. Adicionar test em `tests/rls/notificacoes_envios.test.ts` que tenta INSERT como anon e espera falha.

### R7 — Race condition fallback diretor + UNIQUE constraint

Se há 2 diretores e renovação dispara fallback, o helper chama `sendEmail` para cada — mas a chave UNIQUE inclui `perfil_id`, então isso funciona (2 linhas distintas). **Sem risco.** Documentando para evitar paranoia.

### R8 — Reenviar em entidade com `entidade_id=NULL` (cadência resumo)

Se cadência é por perfil/dia sem entidade, e o usuário clica "Reenviar" 5 minutos depois → INSERT colidiria com UNIQUE (mesmo perfil/tipo/null/canal/dia).

**Mitigação:** reenviar gera linha nova com `reenviado_por_id/reenviado_em` preenchidos, mas precisa **ignorar UNIQUE** para esse caso — usar coluna `dia + sufixo` (e.g., `(sent_at + interval '1 second')::date`) é hack. Melhor: **remover UNIQUE para linhas onde `reenviado_por_id IS NOT NULL`** via índice parcial:

```sql
CREATE UNIQUE INDEX notif_envios_unique_idempotency
ON notificacoes_envios (perfil_id, tipo, canal, dia, COALESCE(entidade_id, '00000000-0000-0000-0000-000000000000'::uuid))
WHERE reenviado_por_id IS NULL;
```

Reenviadas ficam fora da UNIQUE — sempre criam nova linha. Documentar no commit.

---

## Runtime State Inventory

**Esta phase é greenfield para o domínio "email"** (não é rename/refactor). Mesmo assim, há **state pré-existente que precisa coexistir**:

| Categoria | Items Found | Action Required |
|-----------|-------------|------------------|
| Stored data | `perfis` table (todos os perfis existentes) — sem coluna `preferencias_notif` ainda | Migration 035: ADD COLUMN com DEFAULT + UPDATE inicial setando smart default por linha (Q4) |
| Live service config | Resend Dashboard: webhook ainda não configurado | Manual step (planner add task): registrar webhook após Plan 2 deployed |
| OS-registered state | Nenhum | None |
| Secrets/env vars | `RESEND_API_KEY` já provisionada (STATE.md 2026-05-27); `WEBHOOK_RESEND_SECRET` será gerada pelo Resend Dashboard | `supabase secrets set WEBHOOK_RESEND_SECRET=whsec_xxx` após registrar webhook |
| Build artifacts | Nenhum cache de Edge Function — `supabase functions deploy` overwrite | None — deploy é idempotente |

**Notícia extra:** `pg_cron` job de `notify-resumo-diario` (migration 034) já chama `notify-resumo-diario` daily. Após Plan 2, esta função **passará a enviar e-mails** automaticamente — **sem mudar o cron**. Quem não quiser receber e-mail precisa togglear OFF antes — comunicar ao time no rollout.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Conta Resend free + API key | Edge Functions (envio) | ✓ | `re_...` configurada como Supabase Secret | — |
| Domínio `consej.com.br` verificado no Resend | Sender em prod | ✗ | not_started (id `3b6472fc-...`) | Usar `onboarding@resend.dev` com test addresses (D-24 + R1) |
| Supabase CLI | Deploy edge functions | ✓ | já em uso no projeto | — |
| Node 20+ / npm | Dev local | ✓ | confirmed (STACK.md) | — |
| `@radix-ui/react-switch` | UI matriz | ✗ | a instalar via shadcn | — (sem fallback — obrigatório) |

**Missing dependencies with no fallback:** nenhuma bloqueante (DNS é tech-debt aceito).

**Missing dependencies with fallback:**
- Sender `notif@consej.com.br` (tech-debt Andrieli) — fallback ativo via `onboarding@resend.dev` + test addresses pré-cadastradas.

---

## Don't Hand-Roll

| Problema | Don't Build | Use Instead | Why |
|----------|-------------|-------------|-----|
| Magic link generation | JWT custom assinado com `djwt` | `supabase.auth.admin.generateLink({ type: 'magiclink', ... })` | Já existe no Supabase Auth; padrão estabelecido no ClienteDetailPage; zero código novo |
| Idempotency manual via tabela `dedup` | Pre-check `SELECT WHERE ...` antes do INSERT (race condition) | UNIQUE constraint + `ON CONFLICT DO NOTHING` (atômico no Postgres) | Já é o padrão do projeto (`notificacoes_renovacao_enviadas`) |
| HMAC verification | Implementação custom de SHA-256 | `crypto.subtle.sign('HMAC', key, ...)` (Web Crypto standard no Deno) | Algoritmo bem-testado; 5 linhas de código vs ~50 |
| Template HTML | MJML / React-Email / Handlebars | String literal HTML + `.replace('{{var}}', escapeHtml(v))` | Volume <30 emails/dia (STATE.md validated); 4 templates totais; D-22 já decidiu |
| Quota tracker em tabela separada | `quota_resend (data, count)` com UPDATE | Query agregada em `notificacoes_envios` com índice composto | Source of truth única; sem drift |
| Retry queue para drops | Job worker + tabela `email_queue` | Drop + log (status=`dropped_quota`); usuário usa "Reenviar" no dia seguinte | Volume baixo justifica simplicidade (CONTEXT deferred) |
| Rich text editor para subject | TipTap / Lexical | Hard-coded subject no template helper | Não é customizável pelo usuário; é template fixo |
| Switch from scratch | Custom toggle componente | shadcn Switch (Radix) | Already a primitive line in the design system |

---

## Code Examples

### Helper sendEmail (esqueleto detalhado)

```typescript
// supabase/functions/_shared/email.ts
// Source: derivado de notify-tarefa pattern + Resend docs

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = 'CONSEJ <onboarding@resend.dev>'
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')

export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'
export type EntidadeTipo = 'lead' | 'cliente' | 'contrato' | 'tarefa'

export interface SendEmailParams {
  perfilId: string
  toEmail: string
  tipo: TipoNotif
  entidadeId: string | null
  entidadeTipo: EntidadeTipo | null
  subject: string
  html: string
}

export interface SendEmailResult {
  ok: boolean
  status: 'queued' | 'dropped_quota' | 'failed' | 'skipped_idempotent'
  resendId?: string
  errorMsg?: string
  notificacaoId?: string
}

const QUOTA_DIARIA = 100
const QUOTA_MENSAL = 3000

async function checkQuota(supabase: SupabaseClient): Promise<{ hoje: number; mes: number; estourou: boolean }> {
  const { data } = await supabase.rpc('quota_resend_atual')
  const hoje = data?.hoje ?? 0
  const mes = data?.mes ?? 0
  return { hoje, mes, estourou: hoje >= QUOTA_DIARIA || mes >= QUOTA_MENSAL }
}

export async function sendEmail(
  supabase: SupabaseClient,
  p: SendEmailParams
): Promise<SendEmailResult> {
  // 1. Pre-check quota
  const quota = await checkQuota(supabase)
  if (quota.estourou) {
    const { data } = await supabase.from('notificacoes_envios').insert({
      perfil_id: p.perfilId,
      tipo: p.tipo,
      entidade_id: p.entidadeId,
      entidade_tipo: p.entidadeTipo,
      canal: 'email',
      subject: p.subject,
      status: 'dropped_quota',
    }).select('id').single()
    return { ok: true, status: 'dropped_quota', notificacaoId: data?.id }
  }

  // 2. INSERT idempotente
  const { data: inserted, error: insertErr } = await supabase
    .from('notificacoes_envios')
    .insert({
      perfil_id: p.perfilId,
      tipo: p.tipo,
      entidade_id: p.entidadeId,
      entidade_tipo: p.entidadeTipo,
      canal: 'email',
      subject: p.subject,
      status: 'queued',
    })
    .select('id')
    .single()

  if (insertErr) {
    // Provavelmente UNIQUE conflict — idempotência ativada
    if (insertErr.code === '23505') {
      return { ok: true, status: 'skipped_idempotent' }
    }
    return { ok: false, status: 'failed', errorMsg: insertErr.message }
  }

  // 3. POST Resend com retry exponencial
  let resendId: string | undefined
  let lastErr: string | undefined
  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [p.toEmail],
        subject: p.subject,
        html: p.html,
        headers: { 'X-Entity-Ref-ID': inserted.id },
      }),
    })

    if (res.status === 429 || res.status >= 500) {
      lastErr = `HTTP ${res.status}`
      await new Promise(r => setTimeout(r, 500 * 2 ** i))
      continue
    }

    const body = await res.json()
    if (res.ok && body.id) {
      resendId = body.id
      break
    }
    lastErr = body.message ?? `HTTP ${res.status}`
    break
  }

  // 4. UPDATE com resultado
  if (resendId) {
    await supabase.from('notificacoes_envios').update({ resend_id: resendId }).eq('id', inserted.id)
    return { ok: true, status: 'queued', resendId, notificacaoId: inserted.id }
  } else {
    await supabase.from('notificacoes_envios').update({ status: 'failed', error_msg: lastErr }).eq('id', inserted.id)
    return { ok: false, status: 'failed', errorMsg: lastErr, notificacaoId: inserted.id }
  }
}
```

### Template helper pattern

```typescript
// supabase/functions/_shared/templates/render.ts
import tarefaTemplate from './tarefa.html.ts' // Deno suporta import de .ts que exporta string

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!))
}

export function renderTarefa(vars: {
  nomeAtribuido: string; tituloTarefa: string; deepLink: string; gerenciarPrefsLink: string
}): string {
  return tarefaTemplate
    .replaceAll('{{nomeAtribuido}}', escapeHtml(vars.nomeAtribuido))
    .replaceAll('{{tituloTarefa}}', escapeHtml(vars.tituloTarefa))
    .replaceAll('{{deepLink}}', vars.deepLink) // URL — não escape
    .replaceAll('{{gerenciarPrefsLink}}', vars.gerenciarPrefsLink)
}
```

Alternativa: armazenar HTML em `.html` files e importar via `Deno.readTextFile(import.meta.url, './tarefa.html')` no startup. Cuidado com cold-start latency.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@radix-ui/react-switch` é trusted (família Radix oficial) | Package Legitimacy Audit | Baixo — Radix é a base do design system já em uso pesado |
| A2 | `admin.generateLink` rate limit é ~30/min | R3 | Médio — pode subir/baixar; se quebrar em vol >25/dia, downgrade para opção (c) Q7 |
| A3 | Resend free tier endpoint stable em `api.resend.com/emails` | Q1 | Baixo — endpoint estável há anos |
| A4 | Svix HMAC manual replica exatamente o que `svix` package faz | Q2 | Baixo — algoritmo documentado e padrão; test contra fixture do dashboard Resend mitiga |
| A5 | RPC `quota_resend_atual()` é melhor que query inline | Q8 | Baixo — refactor trivial se errado |
| A6 | Volume CONSEJ <30 emails/dia (STATE validated assumption) | Plan slicing | Médio — se subir pra >80/dia, quota daily 100 fica apertada, mas warning UI antecipa |
| A7 | Resend `data.email_id` (não `data.id`) no webhook é o ID retornado pela API send | Q2 | Crítico se errado, mas confirmado nos exemplos de docs |
| A8 | `notif@consej.com.br` DNS pendente é blocker apenas pro nome bonito (sandbox funciona) | R1, D-24 | Baixo — D-24 já decidiu usar resend.dev no MVP |

---

## Open Questions (RESOLVED)

1. **RESOLVED — Backfill de perfis existentes:** o trigger `handle_new_user` só roda em INSERT. A migration 035 inclui UPDATE explícito conforme script da Q4. Plan 1 Task 1 (migration) inclui o backfill na mesma migration — aceito pelo planner.

2. **RESOLVED — Resposta a "Reenviar" — Edge Function direta ou RPC?**
   - Opção A: hook chama `supabase.functions.invoke('reenviar-notificacao', { body: { id } })` — simples, expõe edge function nova
   - Opção B: hook chama `supabase.rpc('reenviar_notificacao', { p_id })` que internamente faz HTTP callout via `pg_net` (padrão de 031) — mais alinhado com pattern existente

   **Recomendação adotada:** Opção A (Edge Function direta `reenviar-notificacao` reutilizando o helper `sendEmail`). Mais simples, sem callout indireto. RLS protege via JWT. Implementado em Plan 3 Task 4.

3. **RESOLVED — Cliente sem prefs em Phase 5:** confirmado que o helper `sendEmail` só é chamado por notify-* (tarefa, cadência, renovação, indicação) com destinatário interno (responsáveis de leads/contratos/tarefas). Clientes não recebem e-mails em Phase 5. UI `/portal/preferencias` é placeholder per D-10 (integração real ativa em Phase 7).

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: `https://resend.com/docs/api-reference/emails/send-email`] — endpoint, request/response, auth header
- [VERIFIED: `https://resend.com/docs/dashboard/webhooks/introduction`] — event types, payload shape (`data.email_id`), svix headers
- [VERIFIED: `https://docs.svix.com/receiving/verifying-payloads/how-manual`] — HMAC verification algorithm
- [VERIFIED: filesystem Glob] — migrations 001..034 listadas; switch.tsx ausente
- [VERIFIED: leitura direta] — `supabase/functions/notify-tarefa/index.ts`, `notify-resumo-diario`, `notify-indicacao`, `notify-renovacao`

### Secondary (MEDIUM confidence)
- INTEGRATIONS.md (auditado 2026-05-26) — webhook secret patterns
- STACK.md (auditado 2026-05-26) — versões e devDeps
- ARCHITECTURE.md (auditado 2026-05-26) — layer responsibilities
- STATE.md — RESEND_API_KEY já configurada, validated assumption <30/dia, tech-debt DNS

### Tertiary (LOW confidence)
- [ASSUMED] Rate limit Supabase `admin.generateLink` ~30/min (A2)
- [ASSUMED] Volume CONSEJ <30 emails/dia mantém-se durante adoção (A6)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — única dep nova é Radix Switch (família estabelecida)
- Architecture: HIGH — 24 decisões em CONTEXT.md eliminam ambiguidade
- Pitfalls: HIGH — auditados via docs Resend + leitura direta dos 4 notify-* + patterns do projeto
- Plan slicing: MEDIUM — proposta cobre todos os 4 reqs; planner pode reordenar Plans 3/4 se preferir

**Research date:** 2026-05-27
**Valid until:** 2026-06-27 (30 dias — stack estável)
**Phase requirements covered:** EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04 (4/4)

---

## RESEARCH COMPLETE — 8 questions resolvidas; Resend API + webhook + secrets + migration 035 + refactor surface (4 funções + 3 helpers `_shared/`) + shadcn Switch (install needed) + magic link via `admin.generateLink` + índice composto `(canal, dia, status)` — slicing recomendado em 4 plans verticais começando com Plan 1 end-to-end (tarefa).
