# Phase 7: Client Portal Expansion — Pattern Map

**Mapped:** 2026-05-28
**Files analyzed:** 26 (17 novos + 9 modificados)
**Analogs found:** 23 / 26 (3 NEW UI sem analog direto — pattern via RESEARCH §3/§6)

---

## File Classification

| Arquivo (NEW / MOD) | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| **NEW** `supabase/migrations/037_cliente_docs.sql` | migration | DDL + RLS + JSONB extend + backfill | `supabase/migrations/036_push_subscriptions.sql` | exact |
| **NEW** `supabase/functions/_shared/aprovacoes.ts` | edge helper | Promise.allSettled multi-canal fanout | `supabase/functions/_shared/email.ts` + `_shared/push.ts` | exact (2 analogs combinados) |
| **NEW** `supabase/functions/notify-aprovacao-evento/index.ts` | edge function (trigger-driven) | request-response (webhook → fanout) | `supabase/functions/notify-tarefa/index.ts` | exact |
| **NEW** `supabase/functions/notify-aprovacoes-stale/index.ts` | edge function (cron-driven) | batch (loop docs pendentes → fanout) | `supabase/functions/notify-resumo-diario/index.ts` | exact |
| **NEW** `src/lib/file-validation.ts` | lib (pure) | transform (File → ValidationError\|null) | `src/lib/cnpj.ts` (helpers puros + tipos + Error) | role-match |
| **NEW** `src/lib/storage-helpers.ts` | lib (Supabase wrapper) | request-response (upload + signed URL) | `src/hooks/usePerfis.ts:82-93` (upload pattern inline) | partial (extrai inline → lib) |
| **NEW** `src/hooks/useClienteDocs.ts` | hook | CRUD (query + N mutations) | `src/hooks/useLeads.ts` | exact |
| **NEW** `src/hooks/useUploadClienteDoc.ts` | hook (mutation) | request-response (file → INSERT row → upload → UPDATE path) | `src/hooks/usePerfis.ts:82-93` (`useUploadAvatar`) | role-match (estende com row + signed URL) |
| **NEW** `src/hooks/useAprovacoesPendentes.ts` | hook (query) | CRUD (SELECT role-aware filtrado por RLS) | `src/hooks/useLeads.ts` `useLeadsLixeira` (query + RLS-filtered list) | exact |
| **NEW** `src/components/clientes/UploadDropzone.tsx` | component (UI) | event-driven (drag → drop → onFiles) | **sem analog** — RESEARCH §3 skeleton (react-dropzone) | NEW |
| **NEW** `src/components/clientes/ClienteDocsList.tsx` | component (UI) | request-response (lista + ações) | `src/components/me/NotificacoesPanel.tsx` (list + ações + mutations) | role-match |
| **NEW** `src/components/clientes/DocVersionTimeline.tsx` | component (UI) | transform (entries[] → timeline) | `src/components/shared/ActivityTimeline.tsx` | exact |
| **NEW** `src/pages/portal/PortalDocumentosPage.tsx` | page (portal) | request-response (upload + list) | `src/pages/portal/PortalHistoricoPage.tsx` | exact (mesma shell + tabs pattern) |
| **NEW** `src/pages/portal-admin/AprovacoesPendentesPage.tsx` | page (CRM coord+) | request-response (dashboard role-aware) | `src/pages/AdocaoPage.tsx` | exact (RequireRole + table + RLS-filtered query) |
| **NEW** `tests/rls/cliente_docs.test.ts` | test (RLS regression) | request-response (login → query → assert) | `tests/rls/push_subscriptions.test.ts` | exact |
| **NEW** `tests/rls/cliente_docs_storage.test.ts` | test (Storage RLS) | request-response (upload/download por role) | `tests/rls/push_subscriptions.test.ts` (mesmo bootstrap) | role-match |
| **NEW** `src/test/storage-mocks.ts` | test util | mock factory | `src/test/push-mocks.ts` | exact |
| **MOD** `src/types/index.ts` | types | declarative | já contém `TipoNotif`/`PreferenciasNotif` (linhas 430-487) | exact (estender) |
| **MOD** `src/lib/query-keys.ts` | lib (constants) | declarative | existing `QUERY_KEYS` (linhas 79-82 `pushSubscriptions`) | exact |
| **MOD** `src/components/me/NotificacoesPanel.tsx` | component | event-driven (toggle matriz) | já é o arquivo Phase 6 — matriz 4×3 → 5×3 mecânico | self |
| **MOD** `src/components/layout/Sidebar.tsx` | component | navegação | já contém `NAV_GROUPS` (linhas 23-68); grupo CRESCIMENTO | self |
| **MOD** `src/router.tsx` | config (routes) | declarative | já contém 3 rotas portal + 3 rotas CRM; adicionar 3 novas | self |
| **MOD** `src/pages/ClienteDetailPage.tsx` | page | request-response (tabs) | já contém 5 tabs (linhas 224-230); adicionar 6ª "Documentos" | self |
| **MOD** `src/pages/portal/PortalLayout.tsx` | page (shell) | navegação | já contém `NAV` array (linhas 14-20); adicionar entry | self |
| **MOD** `supabase/functions/_shared/email.ts` | edge helper | — | estender `TipoNotif` (linha 36) | self |
| **MOD** `supabase/functions/_shared/push.ts` | edge helper | — | estender `TipoNotif` (linha 43) | self |
| **MOD** `supabase/functions/_shared/perfis.ts` | edge helper | — | estender `PreferenciasNotif` (linhas 15-20) | self |

---

## Pattern Assignments

### 1. `supabase/migrations/037_cliente_docs.sql` (migration)

**Analog:** `supabase/migrations/036_push_subscriptions.sql` (exact — mesma estrutura: nova tabela + RLS + ALTER CHECK + handle_new_user CREATE OR REPLACE + backfill JSONB)

**Header pattern** (`036:1-16`):
```sql
-- Migration 036: Push Subscriptions + canal 'push' — Phase 6 fundação para
-- Web Push notifications (D-01, D-08, D-15).
--
-- Conteúdo:
--   1. Tabela push_subscriptions (multi-device 1:N, UNIQUE perfil_id+endpoint)
--   2. RLS role-aware espelhando pattern Phase 5 (4 policies)
--   3. ALTER CHECK notificacoes_envios.canal incluindo 'push' (D-08)
--   4. CREATE OR REPLACE handle_new_user — preserva lookup `slack_user_id IS
--      NOT NULL INTO has_slack` da migration 035 (anti-regressão D-04 Phase 5)
--   5. Backfill idempotente — `jsonb_set` aninhado adiciona push:false
```

**RLS 4-policy template** (`036:33-61`):
```sql
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subs_select ON push_subscriptions;
CREATE POLICY push_subs_select ON push_subscriptions
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid() OR public.is_at_least('coordenador'));

DROP POLICY IF EXISTS push_subs_insert ON push_subscriptions;
CREATE POLICY push_subs_insert ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (perfil_id = auth.uid());
```

**Adapt for Phase 7:** trocar `perfil_id = auth.uid()` por matriz cliente/interno conforme D-14 (cliente via `perfis.cliente_id`; interno via `clientes.responsavel_id` OR `is_at_least('coordenador')`). Ver RESEARCH §1.B.

**ALTER CHECK pattern (DROP + ADD)** (`036:63-69`):
```sql
ALTER TABLE notificacoes_envios DROP CONSTRAINT IF EXISTS notificacoes_envios_canal_check;
ALTER TABLE notificacoes_envios
  ADD CONSTRAINT notificacoes_envios_canal_check
  CHECK (canal IN ('email','slack','push'));
```

**Phase 7 aplicação:** mesma técnica em `notificacoes_envios_tipo_check` para incluir `'documentos'`.

**handle_new_user CREATE OR REPLACE — anti-regressão warning** (`036:71-115`):
```sql
-- ⚠️ Anti-regressão D-04 Phase 5: o lookup `SELECT slack_user_id IS NOT NULL
-- INTO has_slack` (linha ~885) DEVE ser preservado — sem ele o smart-default
-- condicional de Slack regride. NÃO copiar de 011_auto_profile_trigger.sql
-- (versão antiga sem esse lookup).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  default_name TEXT;
  has_slack    BOOLEAN;
BEGIN
  -- ...
  SELECT slack_user_id IS NOT NULL INTO has_slack
    FROM public.perfis WHERE id = new.id;

  UPDATE public.perfis
     SET preferencias_notif = jsonb_build_object(
       'tarefa',    jsonb_build_object('slack', has_slack, 'email', true, 'push', false),
       -- ... 4 tipos
     )
   WHERE id = new.id;
```

**Phase 7 aplicação:** adicionar 5ª chave `'documentos'` no `jsonb_build_object`. Manter lookup `has_slack`.

**Backfill JSONB aninhado** (`036:120-134`):
```sql
UPDATE perfis
   SET preferencias_notif =
       jsonb_set(
         jsonb_set(
           jsonb_set(
             jsonb_set(preferencias_notif,
               '{tarefa,push}', 'false'::jsonb, true),
             '{cadencia,push}', 'false'::jsonb, true),
           '{renovacao,push}', 'false'::jsonb, true),
         '{indicacao,push}', 'false'::jsonb, true)
 WHERE NOT (preferencias_notif #> '{tarefa,push}') IS NOT NULL;
```

**Phase 7 aplicação:** adicionar 1 `jsonb_set` mais externo para `{documentos}` (objeto inteiro `{slack,email,push}`). Pattern em RESEARCH Pitfall §9.

**Pitfalls aplicáveis:**
- Pitfall §4: 2 triggers separadas (INSERT vs UPDATE) chamando mesma function — `OLD` não existe em INSERT
- Pitfall §9: backfill `jsonb_set` aninhado — copiar pattern literal de 036:124-134
- Anti-regressão: NÃO regredir `has_slack` lookup (warning explícito em 036:74-77)

---

### 2. `supabase/functions/_shared/aprovacoes.ts` (edge helper)

**Analog primário:** `supabase/functions/_shared/email.ts` (assinatura + retorno + idempotência)
**Analog secundário:** `supabase/functions/_shared/push.ts` (Promise.allSettled fanout)

**Imports + Deno env pattern** (`email.ts:20-29`):
```typescript
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node — Deno runtime resolve em prod)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = (typeof Deno !== 'undefined' ? Deno.env.get('RESEND_API_KEY') : process.env.RESEND_API_KEY) ?? ''
const APP_URL = (
  (typeof Deno !== 'undefined' ? Deno.env.get('APP_URL') : process.env.APP_URL)
  ?? 'https://localhost:5173'
).replace(/\/$/, '')
```

**Phase 7 aplicação:** mesmo template — Deno.env com fallback `process.env` para testes Node; `APP_URL` normalizada.

**Tipos exportados pattern** (`email.ts:35-62`):
```typescript
export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'
export type EntidadeTipo = 'lead' | 'cliente' | 'contrato' | 'tarefa'

export interface SendEmailParams {
  perfilId: string
  toEmail: string
  tipo: TipoNotif
  // ...
}

export type SendEmailStatus =
  | 'queued' | 'dropped_quota' | 'failed' | 'skipped_idempotent' | 'fallback_diretor'

export interface SendEmailResult {
  ok: boolean
  status: SendEmailStatus
  // ...
}
```

**Phase 7 aplicação:** definir `EventoAprovacao = 'cliente_aprovou' | 'cliente_pediu_revisao' | 'cliente_subiu_doc' | 'aprovacao_stale'`. Result agregado com `slack`/`email`/`push` per-canal (ver RESEARCH §7 skeleton 685-792).

**Promise.allSettled fanout multi-device pattern** (`push.ts:180-214`):
```typescript
await Promise.allSettled(
  subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payloadStr,
      )
      delivered++
    } catch (e) {
      const sc = (e as { statusCode?: number })?.statusCode ?? 0
      const msg = (e as { message?: string })?.message ?? String(e)
      const shortId = sub.id.slice(0, 8)

      if (sc === 410 || sc === 404) {
        // D-02: subscription expirada/revogada — DELETE row
        await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        cleaned++; failed++
      } else {
        failed++; errors.push(`sub ${shortId}: ${sc || msg}`)
      }
    }
  }),
)
```

**Phase 7 aplicação:** `Promise.allSettled([slackPromise, emailPromise, pushPromise])` paralelo de 3 canais (não fanout multi-device dentro do helper — `sendPush` interno já cuida). Unwrap helper:
```typescript
const unwrap = (s: PromiseSettledResult<any>) =>
  s.status === 'fulfilled' ? s.value : { ok: false, error: String(s.reason) }
```

**Logging pattern (segurança)** (`email.ts:18`):
```typescript
// Segurança: RESEND_API_KEY nunca aparece em error_msg ou logs (R6).
```

**Phase 7 aplicação:** `webhook_aprovacao_secret` nunca em logs (T-07-11).

**Aplica:**
- D-09 (helper compartilhado mirror)
- D-08 (canal `documentos` em prefs)
- Pitfall §11 RESEARCH (webhook secret leak)

---

### 3. `supabase/functions/notify-aprovacao-evento/index.ts` (edge function trigger-driven)

**Analog:** `supabase/functions/notify-tarefa/index.ts` (trigger-driven Postgres webhook → fanout helper)

**Imports + env setup** (`notify-tarefa:21-64`):
```typescript
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { constantTimeAuthCheck } from '../_shared/auth.ts'
import {
  findSlackUserId, findPerfilNome, loadPrefs, findDiretores,
} from '../_shared/perfis.ts'
import { sendEmail, generateMagicLink } from '../_shared/email.ts'
import { sendPush } from '../_shared/push.ts'
import { renderTarefa } from '../_shared/templates/render.ts'
import { postDm } from '../_shared/slack.ts'

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_TAREFA_SECRET')
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
```

**Phase 7 aplicação:** trocar `WEBHOOK_TAREFA_SECRET` por `WEBHOOK_APROVACAO_SECRET`; importar `sendNotificacaoAprovacao` do novo `_shared/aprovacoes.ts`.

**Webhook payload shape pattern** (`notify-tarefa:36-56`):
```typescript
interface TarefaRow {
  id: string
  // ...
  atribuido_a_id: string | null
  criado_por_id: string | null
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: TarefaRow | null
  old_record: TarefaRow | null
}
```

**Phase 7 aplicação:** `ClienteDocRow` shape (ver D-14). Trigger SQL (RESEARCH §8) envia `evento + doc_id + cliente_id + destinatario_perfil_id + comentario_cliente` direto no body — não usa Database Webhook completo (mais leve).

**Auth check pattern** (`notify-tarefa:117-120` + `notify-resumo-diario:90-95`):
```typescript
if (WEBHOOK_SECRET) {
  const auth = req.headers.get('Authorization') ?? ''
  if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }
}
```

**Phase 7 aplicação:** copiar exato.

---

### 4. `supabase/functions/notify-aprovacoes-stale/index.ts` (edge function cron-driven)

**Analog:** `supabase/functions/notify-resumo-diario/index.ts` (cron-driven via pg_cron → SELECT loop → fanout helper)

**Cron-driven payload header** (`notify-resumo-diario:1-15`):
```typescript
// Edge Function: notify-resumo-diario
// Gatilho: chamada explícita do pg_cron (migration 034) diariamente às 07:00 BRT (10:00 UTC).
// Posta DM no Slack do consultor com resumo de tarefas vencendo hoje + leads em cadência
// E (Plan 5-02) dispara e-mail companion se prefs.cadencia.email=true.
```

**Payload shape (cron sends individual records)** (`notify-resumo-diario:28-32`):
```typescript
interface ResumoDiarioPayload {
  perfil_id: string
  tarefas_hoje: number
  leads_cadencia: Array<{ id: string; nome: string; d_point: number }>
}
```

**Phase 7 aplicação:** body do POST vem do `cron_disparar_aprovacoes_stale()` SQL (RESEARCH §9, linhas 904-934) — JSONB com `doc_id + cliente_id + destinatario_perfil_id + cliente_nome + doc_nome_arquivo`. Edge function recebe 1 chamada por doc stale (não batch). Mesma `Authorization: Bearer <vault secret>` pattern.

**Slack blocks builder pattern** (`notify-resumo-diario:46-83`) — utilitário Slack inline. Phase 7 reusa via `sendNotificacaoAprovacao` helper, sem rebuild.

---

### 5. `src/lib/file-validation.ts` (lib pura)

**Analog:** `src/lib/cnpj.ts` (lib pura: tipos + helpers de validação/formatação + erro tipado)

**Tipos exportados pattern** (`cnpj.ts:19-23`):
```typescript
export type CnpjState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: CnpjData }
  | { status: 'error'; message: string }
```

**Phase 7 aplicação:** `DocValidationError` discriminated union conforme RESEARCH §4:
```typescript
export type DocValidationError =
  | { code: 'EXTENSION'; message: string }
  | { code: 'MIME'; message: string }
  | { code: 'SIZE'; message: string }
  | { code: 'EMPTY'; message: string }
```

**Helper puro + Error pattern** (`cnpj.ts:49-59`):
```typescript
export async function lookupCnpj(cnpj: string): Promise<CnpjData> {
  const clean = cleanCNPJ(cnpj)
  if (clean.length !== 14) throw new Error('CNPJ deve ter 14 dígitos')
  // ...
}
```

**Phase 7 aplicação:** `validateDoc(file)` retorna `DocValidationError | null`; `validateDocOrThrow(file)` throws. Implementação completa RESEARCH §4 (linhas 566-606).

**Pitfalls aplicáveis:**
- Pitfall §2 RESEARCH: `file.type === ''` em Linux/iOS — tratar como indeterminado, NÃO bloquear
- Pitfall §3: NUNCA usar `file.name` em path (sempre `nome_arquivo` coluna)
- T-07-04: defense-in-depth — extensão + frontend MIME + bucket `allowed_mime_types`

---

### 6. `src/lib/storage-helpers.ts` (lib Supabase wrapper)

**Analog:** `src/hooks/usePerfis.ts:82-93` (`useUploadAvatar` — único upload pattern canônico do repo)

**Canonical upload pattern inline** (`usePerfis.ts:82-93`):
```typescript
export function useUploadAvatar() {
  return useMutation({
    mutationFn: async ({ userId, file }: { userId: string; file: File }) => {
      const ext = file.name.split('.').pop()
      const path = `${userId}/avatar.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      return data.publicUrl
    },
  })
}
```

**Phase 7 divergências necessárias:**
1. `upsert: false` (cada doc é um row novo — D-04 path scheme `{cliente_id}/{doc_id}.{ext}`)
2. `getPublicUrl` → `.createSignedUrl(path, 3600)` (bucket privado, expiry 60min — D-04)
3. Extrair lib pura `uploadClienteDoc({ path, file, onProgress? })` e `getSignedDownloadUrl(path)` para reuso entre `useUploadClienteDoc` e botões download
4. Constante exportada `SIGNED_URL_EXPIRY_SECONDS = 3600` (Anti-pattern §RESEARCH: não hardcode literal repetido)

**Signed URL pattern** (RESEARCH Pattern §2):
```typescript
const { data, error } = await supabase.storage
  .from('cliente-docs')
  .createSignedUrl(storagePath, 3600) // 3600s = 60min (D-04)
if (error) throw error
return data.signedUrl
```

**Pitfalls aplicáveis:**
- Pitfall §1 RESEARCH: `onUploadProgress` pode faltar nos types de `@supabase/supabase-js@2.99.x` — `@ts-expect-error` ou bump 2.106.2

---

### 7. `src/hooks/useClienteDocs.ts` (hook TanStack Query)

**Analog:** `src/hooks/useLeads.ts` (exact — query + N mutations + invalidação + optimistic update + RPC mutation)

**Imports + queryKey pattern** (`useLeads.ts:1-19`):
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-keys'
import type { Lead, LeadLixeira } from '@/types'
import { toast } from 'sonner'

export function useLeads() {
  return useQuery({
    queryKey: QUERY_KEYS.leads.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, diagnostico:diagnosticos(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Lead[]
    },
  })
}
```

**Phase 7 aplicação:** `useClienteDocs(clienteId)` — query enabled por `clienteId`, filtro `.eq('cliente_id', clienteId).is('deleted_at', null)` (RESEARCH §Code Examples 1206-1222). Use `QUERY_KEYS.clienteDocs.byCliente(clienteId)`.

**Mutation com toast pattern** (`useLeads.ts:21-51`):
```typescript
export function useCreateLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ...) => {
      const { data, error } = await supabase.from('leads').insert(input).select().single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: async (lead) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leads.all })
      // ... insert audit log
      toast.success('Lead criado com sucesso!')
    },
    onError: () => toast.error('Erro ao criar lead'),
  })
}
```

**Phase 7 aplicação:** `useAprovarDoc`, `useSolicitarRevisaoDoc`, `useDeleteDoc` seguem mesma estrutura. RPC pattern (`useLeads.ts:118-134` `useDeleteLead`) para soft-delete: `supabase.rpc('excluir_cliente_doc', { p_id })`. Erros com mensagem da RPC: `e instanceof Error ? e.message : 'Erro ao remover doc'` (Q2 OpenQuestion RESEARCH).

---

### 8. `src/hooks/useUploadClienteDoc.ts` (mutation hook)

**Analog:** `src/hooks/usePerfis.ts:82-93` (`useUploadAvatar`)

**Pattern Phase 7 evolui** (vs `useUploadAvatar`):

| Aspecto | usePerfis.useUploadAvatar | useUploadClienteDoc (Phase 7) |
|---------|---------------------------|-------------------------------|
| Bucket | `avatars` (público) | `cliente-docs` (privado) |
| Upsert | `upsert: true` | `upsert: false` (path = doc_id único) |
| Path | `{userId}/avatar.{ext}` | `{clienteId}/{docId}.{ext}` (D-04) |
| Pre-upload | nenhum | INSERT row em `cliente_docs` para gerar `doc_id` (RESEARCH §1.C linha 379-394) |
| Rollback | nenhum | DELETE row se upload falhar (RESEARCH §1.C linha 411-413) |
| Post-upload | `getPublicUrl` | UPDATE `storage_path` na row + retorna `doc_id` |
| Validação | nenhuma | `validateDocOrThrow(file)` no início (file-validation.ts) |

**Implementação completa em RESEARCH §1.C** (linhas 357-424). Pitfalls §1, §2, §3 aplicáveis.

---

### 9. `src/hooks/useAprovacoesPendentes.ts` (hook query role-aware)

**Analog:** `src/hooks/useLeads.ts` `useLeadsLixeira` (query + filter + RLS-trust)

**Pattern (useLeads.ts:136-148):**
```typescript
export function useLeadsLixeira() {
  return useQuery({
    queryKey: QUERY_KEYS.leads_lixeira.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads_lixeira')
        .select('*')
        .is('restaurado_em', null)
        .order('excluido_em', { ascending: false })
      if (error) throw error
      return data as LeadLixeira[]
    },
  })
}
```

**Phase 7 aplicação:** SELECT em `cliente_docs` com filtro `.eq('status', 'pending').eq('requer_aprovacao', true)`. RLS role-aware faz o resto: consultor vê só dos seus, coord+ vê tudo (D-11). Não precisa branch client-side por role — RLS é a SSoT (pattern Phase 5).

JOIN com clientes para nome + dias parados:
```typescript
.select('*, clientes!inner(id, nome, responsavel_id, perfis(nome))')
```

---

### 10. `src/components/clientes/UploadDropzone.tsx` (UI drag-drop)

**Analog:** NENHUM no codebase. Pattern de RESEARCH §3 (linhas 471-537) usando `react-dropzone@15.0.0`.

**Skeleton completo em RESEARCH §3** — usar literal:
```tsx
const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  // ...
}
const MAX_SIZE = 10 * 1024 * 1024

export function DocUploadZone({ onFiles, multiple = true, disabled = false }: ...) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    accept: ACCEPT, maxSize: MAX_SIZE, multiple, disabled,
    onDropRejected: (rejections) => {
      const first = rejections[0]?.errors[0]
      if (first?.code === 'file-too-large') toast.error('Arquivo maior que 10 MB')
      else if (first?.code === 'file-invalid-type') toast.error('Tipo não permitido')
      // ...
    },
    onDropAccepted: (files) => onFiles(files),
  })
  return (
    <div {...getRootProps()} className={cn(/* dynamic border colors */)}>
      <input {...getInputProps()} aria-label="Selecionar documentos" />
      {/* Upload icon + copy PT-BR */}
    </div>
  )
}
```

**Convenções projeto a aplicar:**
- `cn()` de `@/lib/utils` (shadcn pattern em uso em todo o repo)
- Tokens de cor via classes Tailwind (`border-primary`, `border-destructive`, `bg-primary/5`)
- PT-BR para copy ("Arraste arquivos ou clique para selecionar")
- Toasts via `sonner` (`import { toast } from 'sonner'`)
- Ícones via `lucide-react` (já dep — `Upload`)

**Pitfall §8 RESEARCH:** sempre listar **extensão fallback** no `accept` config — Windows pode reportar MIME `application/octet-stream` em .docx legítimos.

---

### 11. `src/components/clientes/ClienteDocsList.tsx` (lista + ações)

**Analog:** `src/components/me/NotificacoesPanel.tsx` (list + state + mutations + toast — role-match)

**State + draft pattern** (`NotificacoesPanel.tsx:56-73`):
```typescript
export function NotificacoesPanel() {
  const { data: perfil, isLoading: loadingPerfil } = useMeuPerfil()
  const { data: prefs, isLoading: loadingPrefs } = usePreferenciasNotif(perfil?.id ?? null)
  const salvar = useSalvarPrefs()

  const [draft, setDraft] = useState<PreferenciasNotif | null>(null)

  useEffect(() => {
    if (prefs) setDraft(prefs)
    else if (!loadingPrefs && perfil?.id) setDraft(DEFAULT_PREFS)
  }, [prefs, loadingPrefs, perfil?.id])
```

**Phase 7 aplicação:** lista pura sem draft — `useClienteDocs(clienteId)` direto. Mas mantém pattern de loading skeleton + empty state.

**Loading skeleton pattern** (`AdocaoPage.tsx:30-34`):
```tsx
{isLoading ? (
  <div className="space-y-2 p-4">
    {[1, 2, 3].map(i => (
      <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--alpha-bg-sm)' }} />
    ))}
  </div>
) : (...)
```

**Phase 7 aplicação:** copiar literal para placeholders enquanto lista carrega.

---

### 12. `src/components/clientes/DocVersionTimeline.tsx` (timeline UI)

**Analog:** `src/components/shared/ActivityTimeline.tsx` (exact — pattern timeline genérica com kind discriminator)

**Entry discriminated union pattern** (`ActivityTimeline.tsx:15-17`):
```typescript
type Entry =
  | { kind: 'audit'; id: string; data: AuditLog; ts: string }
  | { kind: 'interacao'; id: string; data: InteracaoLead; ts: string }
```

**Phase 7 aplicação:** versões + lembretes de aprovação:
```typescript
type DocTimelineEntry =
  | { kind: 'upload'; id: string; doc: ClienteDoc; ts: string }
  | { kind: 'aprovacao'; id: string; status: 'aprovado' | 'revisao_solicitada'; comentario?: string; ts: string }
  | { kind: 'lembrete'; id: string; perfilId: string; ts: string }
```

**Icon mapping pattern** (`ActivityTimeline.tsx:73-78`):
```typescript
function getAuditIcon(acao: string) {
  if (acao === 'criado') return Plus
  if (acao === 'status_alterado') return ArrowRight
  if (acao === 'convertido') return UserCheck
  return Edit3
}
```

**Phase 7 aplicação:** `getDocEntryIcon(entry: DocTimelineEntry)` — `Upload`, `CheckCircle2`, `MessageSquareWarning`, `Bell` (todos já em lucide-react).

**Dropdown expand pattern (RESEARCH §6 linhas 644-675)** — mostra apenas versão atual + dropdown "Ver versões anteriores" inline.

---

### 13. `src/pages/portal/PortalDocumentosPage.tsx` (page portal)

**Analog:** `src/pages/portal/PortalHistoricoPage.tsx` (exact — mesma shell PortalLayout, mesmo padrão inline styles cyan/dark)

**Imports + hooks pattern** (`PortalHistoricoPage.tsx:1-5,44-48`):
```typescript
import { useState } from 'react'
import { usePortalPerfil, useTokenTransacoes, useResgates, useMinhasIndicacoes } from '@/hooks/usePortal'
import { ClipboardList, TrendingUp, ... } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
// ...
export function PortalHistoricoPage() {
  const { data: perfil } = usePortalPerfil()
  const { data: transacoes = [], isLoading: loadingTx } = useTokenTransacoes()
```

**Phase 7 aplicação:** importar `usePortalPerfil` + `useClienteDocs(perfil?.cliente_id)`. `useUploadClienteDoc` para o dropzone.

**Header pattern** (`PortalHistoricoPage.tsx:64-71`):
```tsx
<div className="flex items-center gap-3 mb-6">
  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
    style={{ background: 'rgba(0,137,172,0.15)', border: '1px solid rgba(0,137,172,0.3)' }}>
    <ClipboardList className="w-5 h-5" style={{ color: '#6bd0e7' }} />
  </div>
  <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Histórico</h1>
</div>
```

**Phase 7 aplicação:** ícone `FileText`/`Upload`, título "Documentos". Cores portal mantidas (`#6bd0e7`, `#0089ac`, `#00081d` — inline styles, NÃO Tailwind tokens — diferente do CRM).

**Atenção (convenção portal):** Portal usa **inline styles cyan/dark** (`#00081d`, `#6bd0e7`, `#0089ac`, `rgba(0,137,172,0.x)`), NÃO os tokens do dark theme do CRM. Manter consistência com PortalLayout.

---

### 14. `src/pages/portal-admin/AprovacoesPendentesPage.tsx` (page coord+ dashboard)

**Analog:** `src/pages/AdocaoPage.tsx` (exact — RequireRole + table + RLS-filtered list)

**RequireRole + banner pattern** (`AdocaoPage.tsx:16-22`):
```tsx
return (
  <div className="space-y-8">
    <h1 className="text-xl font-bold text-foreground">Adoção</h1>

    <RequireRole atLeast="coordenador">
      <QuotaResendBanner />
    </RequireRole>
```

**Phase 7 aplicação:**
- `RequireRole atLeast="coordenador"` envolve `BucketUsageBanner` (warning > 80%)
- Página inteira NÃO é coord+ only (consultor vê suas, RLS faz o filtro — D-11) — sem `RequireRole` na shell
- Mas o **banner de bucket** sim é coord+ only

**Table pattern** (`AdocaoPage.tsx:36-80`):
```tsx
<table className="w-full text-sm">
  <thead>
    <tr className="border-b text-xs text-muted-foreground" style={{ borderColor: 'var(--alpha-border)' }}>
      <th className="px-4 py-2 text-left font-medium">Usuário</th>
      <th className="px-4 py-2 text-left font-medium">Último login</th>
      {/* ... */}
    </tr>
  </thead>
  <tbody className="divide-y" style={{ borderColor: 'var(--alpha-border)' }}>
    {atividade.length === 0 ? (
      <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
        Nenhuma atividade registrada este mês.
      </td></tr>
    ) : atividade.map(p => (...))}
```

**Phase 7 aplicação:** colunas Cliente / Doc (nome+tag+versão) / Enviado em / Dias parados / Consultor / Ação. `formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: ptBR })` para "há X dias" (já usado em AdocaoPage:67).

---

### 15. `tests/rls/cliente_docs.test.ts` + `tests/rls/cliente_docs_storage.test.ts`

**Analog:** `tests/rls/push_subscriptions.test.ts` (exact — mesmo bootstrap, mesmo describe.skipIf, mesmo TAG fixture pattern)

**Bootstrap pattern** (`push_subscriptions.test.ts:21-47`):
```typescript
const envPath = resolve(__dirname, '../../.env.test')
const env: Record<string, string> = {}
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const URL = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const QA = {
  diretorEmail: env.QA_DIRETOR_EMAIL,
  diretorPass: env.QA_DIRETOR_PASSWORD,
  consultorEmail: env.QA_CONSULTOR_EMAIL,
  consultorPass: env.QA_CONSULTOR_PASSWORD,
}

const configurado = !!(URL && ANON && SERVICE && QA.diretorEmail && /* ... */)

async function login(email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> {
  const client = createClient(URL!, ANON!, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user) throw new Error(`Login falhou para ${email}: ${error?.message}`)
  return { client, uid: data.user.id }
}
```

**Phase 7 aplicação:** copiar literal. TAG = `'[RLS-TEST-037]'`. Login adicional para `cliente@consej.com.br` se houver QA fixture, ou seed via service_role com `tipo='cliente'` + `cliente_id=<fixture>`.

**describe.skipIf pattern** (`push_subscriptions.test.ts:51`):
```typescript
describe.skipIf(!configurado)('RLS — push_subscriptions (migration 036)', () => {
  let consultor: SupabaseClient
  let diretor: SupabaseClient
  let service: SupabaseClient
  // ...

  beforeAll(async () => {
    const c = await login(QA.consultorEmail!, QA.consultorPass!)
    // ...
    // Seed via service_role (bypassa RLS) — limpa primeiro para idempotência
    await service.from('push_subscriptions').delete().in('endpoint', Object.values(seedEndpoints))
    // ...
  })
})
```

**Phase 7 aplicação:** suíte 1 (`cliente_docs.test.ts`) cobre RLS na tabela. Suíte 2 (`cliente_docs_storage.test.ts`) cobre `storage.objects` RLS (upload/download/list) — chama `supabase.storage.from('cliente-docs').upload()` por role.

**Casos cobrindo Threat Register Phase 7 (T-07-01 a T-07-09):**
- T-07-02: cliente INSERT em pasta de outro cliente_id → rejeitado
- T-07-08: SELECT bucket retorna apenas do próprio
- T-07-09: cliente NÃO pode UPDATE status='superseded' (cliente só aprova/pede revisão)

---

### 16. `src/test/storage-mocks.ts` (mock helpers para tests)

**Analog:** `src/test/push-mocks.ts` (exact — factory functions vi.fn-based, retorna teardown)

**Header pattern** (`push-mocks.ts:1-17`):
```typescript
import { vi } from 'vitest'

// Mock helpers para browser APIs usadas em Phase 6 (PWA + Push).
//
// Cada helper instala stubs em `globalThis` / `window` / `navigator` e retorna
// uma função de teardown. Style espelhado de `src/test/supabase-mock.ts` —
// factory functions vi.fn-based, sem efeitos colaterais até o helper ser
// chamado por um teste.
```

**Restore pattern** (`push-mocks.ts:21-38`):
```typescript
type Restore = () => void

export function mockNotificationPermission(state: NotificationPermissionState): Restore {
  const prev = (globalThis as any).Notification
  const stub = {
    permission: state,
    requestPermission: vi.fn(() => Promise.resolve(state)),
  }
  ;(globalThis as any).Notification = stub
  return () => {
    if (prev === undefined) delete (globalThis as any).Notification
    else (globalThis as any).Notification = prev
  }
}
```

**Phase 7 aplicação:** mocks para:
- `mockSupabaseStorageUpload({ shouldFail?, onProgress? }): Restore` — stub `supabase.storage.from().upload()`
- `mockSupabaseStorageSignedUrl({ url? }): Restore` — stub `.createSignedUrl()`
- `mockFileBuilder({ size?, type?, name? }): File` — factory para test fixtures

---

## Shared Patterns

### Authentication (Edge Functions)

**Source:** `supabase/functions/_shared/auth.ts` (`constantTimeAuthCheck`)
**Apply to:** `notify-aprovacao-evento`, `notify-aprovacoes-stale`

**Pattern** (uso em `notify-tarefa:117-120`):
```typescript
if (WEBHOOK_SECRET) {
  const auth = req.headers.get('Authorization') ?? ''
  if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }
}
```

**Phase 7 secrets:** `WEBHOOK_APROVACAO_SECRET` (novo Vault entry — D-15 Runtime State). Vault secret name `webhook_aprovacao_secret` consumido tanto por trigger SQL (RESEARCH §8 linha 841) quanto por cron SQL (RESEARCH §9 linha 896).

---

### Role-aware RLS

**Source:** `public.is_at_least(role)` + `public.is_interno()` (migrations 027/029/035 — em prod)
**Apply to:** `cliente_docs` table policies + `storage.objects` cliente-docs bucket policies

**Pattern** (`036:39-40`):
```sql
USING (perfil_id = auth.uid() OR public.is_at_least('coordenador'));
```

**Phase 7 expansion (3-way: cliente / interno consultor / interno coord+):**
```sql
USING (
  -- Cliente do próprio cliente_id
  cliente_id = (SELECT cliente_id FROM perfis WHERE id = auth.uid())
  OR
  -- Interno consultor: dos seus clientes
  (public.is_interno() AND cliente_id IN (
    SELECT id FROM clientes WHERE responsavel_id = auth.uid()
  ))
  OR
  -- Coord+
  public.is_at_least('coordenador')
)
```

Implementação completa em RESEARCH §1.B (linhas 310-352) para `storage.objects`. Pattern análogo para `cliente_docs` table.

---

### Idempotência via UNIQUE em `notificacoes_envios`

**Source:** `supabase/migrations/035_notificacoes_envios.sql` UNIQUE partial index
**Apply to:** Todos os 4 eventos do helper `aprovacoes.ts`

**Pattern** (`email.ts:131-151`):
```typescript
const { data: inserted, error: insertErr } = await supabase
  .from('notificacoes_envios')
  .insert({
    perfil_id: p.perfilId, tipo: p.tipo, /* ... */
    canal: 'email', subject: p.subject, status: 'queued',
  })
  .select('id').single<{ id: string }>()

if (insertErr) {
  // 23505: já existe linha (perfil, tipo, canal, dia, entidade) — idempotente
  if ((insertErr as { code?: string }).code === '23505') {
    return { ok: true, status: 'skipped_idempotent' }
  }
  return { ok: false, status: 'failed', errorMsg: insertErr.message }
}
```

**Phase 7 aplicação:** mesmo INSERT + 23505 catch em cada canal de `sendNotificacaoAprovacao`. `entidade_id = doc_id`, `tipo = 'documentos'`, `canal = 'email'|'slack'|'push'`. **OpenQuestion §6 RESEARCH:** lembretes manuais (D-12) usam `reenviado_por_id` set + UNIQUE partial `WHERE reenviado_por_id IS NULL` permite múltiplos.

---

### Error Handling (TanStack Mutations)

**Source:** `src/hooks/useLeads.ts` (pattern em todo o repo)
**Apply to:** Todos os mutation hooks de Phase 7 (`useUploadClienteDoc`, `useAprovarDoc`, etc.)

**Pattern toast + RPC message preservation** (`useLeads.ts:131-133`):
```typescript
onError: (e: unknown) =>
  toast.error(e instanceof Error ? e.message : 'Erro ao remover lead'),
```

**Phase 7 aplicação:** toda mutation preserva mensagem da RPC (importante para RAISE EXCEPTION em RPCs `excluir_cliente_doc`, etc.). Toast PT-BR fallback genérico.

---

### Validation (Forms + Files)

**Source:** zod + react-hook-form (forms) / `src/lib/cnpj.ts` pattern (helpers puros)
**Apply to:** `UploadDropzone`, `SolicitarRevisaoModal`, etc.

**Forms pattern** (CLAUDE.md projeto convenção):
- `z.object({ ... })` schema + `type FormData = z.infer<typeof schema>`
- `useForm<FormData>({ resolver: zodResolver(schema) })`
- Erros via `errors.<field>.message` com `className="text-xs text-red-500"`
- Custom messages PT-BR: `z.string().min(1, 'Campo obrigatório')`

**File validation (Phase 7 specific):** defense-in-depth (frontend + bucket config) — ver Pattern #5 acima.

---

### Page-level loading + empty state

**Source:** `src/pages/AdocaoPage.tsx` lines 30-48
**Apply to:** `PortalDocumentosPage`, `AprovacoesPendentesPage`

```tsx
{isLoading ? (
  <div className="space-y-2 p-4">
    {[1, 2, 3].map(i => (
      <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--alpha-bg-sm)' }} />
    ))}
  </div>
) : data.length === 0 ? (
  <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
    Nenhuma X.
  </td></tr>
) : data.map(row => (...))}
```

---

### Tabs structure (CRM pages)

**Source:** `src/pages/ClienteDetailPage.tsx` lines 224-230 (`Tabs` shadcn primitive)
**Apply to:** ClienteDetailPage MOD — adicionar 6ª tab "Documentos"

**Pattern existente:**
```tsx
<Tabs defaultValue="contratos">
  <TabsList className="mb-4">
    <TabsTrigger value="dados">Dados</TabsTrigger>
    <TabsTrigger value="contratos">Contratos ({contratos?.length || 0})</TabsTrigger>
    <TabsTrigger value="indicacoes">Indicações ({indicacoes.length})</TabsTrigger>
    <TabsTrigger value="oportunidades">Oportunidades ({oportunidades.length})</TabsTrigger>
    <TabsTrigger value="historico">Histórico</TabsTrigger>
  </TabsList>
  {/* ... 5 TabsContent */}
</Tabs>
```

**Phase 7 aplicação:** adicionar `<TabsTrigger value="documentos">Documentos ({docs?.length || 0})</TabsTrigger>` + `<TabsContent value="documentos"><DocsTab clienteId={cliente.id} /></TabsContent>`. Position: depois de "oportunidades", antes de "historico" (CONTEXT D-13 deferred a planner).

---

### Nav (Portal + Sidebar)

**Source:** `src/pages/portal/PortalLayout.tsx:14-20` + `src/components/layout/Sidebar.tsx:23-68`
**Apply to:** PortalLayout MOD + Sidebar MOD

**Portal NAV pattern** (`PortalLayout.tsx:14-20`):
```typescript
const NAV = [
  { to: '/portal',           label: 'Carteira',  icon: Wallet,        end: true },
  { to: '/portal/indicar',   label: 'Indicar',   icon: UserPlus       },
  { to: '/portal/catalogo',  label: 'Catálogo',  icon: Gift           },
  { to: '/portal/historico', label: 'Histórico', icon: ClipboardList  },
  { to: '/portal/preferencias', label: 'Preferências', icon: BellRing  },
]
```

**Phase 7:** adicionar `{ to: '/portal/documentos', label: 'Documentos', icon: FileText }` — posição entre "Histórico" e "Preferências".

**Sidebar grupo CRESCIMENTO** (`Sidebar.tsx:51-59`):
```typescript
{
  label: 'CRESCIMENTO',
  items: [
    { to: '/indicacoes',    label: 'Indicações',    icon: Share2         },
    { to: '/parceiros',     label: 'Parceiros',     icon: Handshake      },
    { to: '/pos-juniors',   label: 'Pós-Juniors',   icon: GraduationCap  },
    { to: '/portal-admin',  label: 'Portal Tokens', icon: Coins          },
  ],
},
```

**Phase 7:** adicionar `{ to: '/portal-admin/aprovacoes-pendentes', label: 'Aprovações Pendentes', icon: FileText }`. Visível para todos (RLS filtra) — sem `RequireRole` no nav.

---

### Router additions

**Source:** `src/router.tsx`
**Apply to:** Adicionar 3 rotas — CRM + Portal

**Phase 7 additions:**
- CRM (children de `<AppLayout />`): `{ path: 'portal-admin/aprovacoes-pendentes', element: <AprovacoesPendentesPage /> }`
- Portal (children de `<PortalLayout />`): `{ path: 'documentos', element: <PortalDocumentosPage /> }`
- (Opcional) CRM: tab "documentos" em `/clientes/:id` é gerenciada por `Tabs defaultValue` + searchParam, NÃO precisa rota nova

**Bookmarkable tab pattern** (já estabelecido — exemplo `/me?tab=notificacoes` no router linha 80):
```typescript
{ path: 'me/preferencias', element: <Navigate to="/me?tab=notificacoes" replace /> },
```

**Phase 7:** se decidir rota dedicada `/clientes/:id/docs`, adicionar `<Navigate to="/clientes/:id?tab=documentos" replace />`.

---

### Types extension (mecânico)

**Source:** `src/types/index.ts:430-487` (`TipoNotif` + `PreferenciasNotif` já existem)
**Apply to:** types MOD

**Pattern atual** (`types/index.ts:433-452`):
```typescript
export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'
export type CanalNotif = 'email' | 'slack' | 'push'
// ...
export interface PreferenciasNotif {
  tarefa:    { slack: boolean; email: boolean; push: boolean }
  cadencia:  { slack: boolean; email: boolean; push: boolean }
  renovacao: { slack: boolean; email: boolean; push: boolean }
  indicacao: { slack: boolean; email: boolean; push: boolean }
}
```

**Phase 7 D-16:**
- `TipoNotif` += `'documentos'`
- `PreferenciasNotif` += linha `documentos: { slack, email, push }`
- Novos tipos: `AutorDoc`, `TagDoc`, `StatusDoc`, `ClienteDoc` (definição em RESEARCH §12 linhas 1046-1067)

---

### Query keys extension

**Source:** `src/lib/query-keys.ts:79-82` (`pushSubscriptions` pattern Phase 6)
**Apply to:** query-keys MOD

**Pattern atual** (`query-keys.ts:79-82`):
```typescript
pushSubscriptions: {
  all: ['pushSubscriptions'] as const,
  byPerfil: (perfilId: string) => ['pushSubscriptions', perfilId] as const,
},
```

**Phase 7 additions:**
```typescript
clienteDocs: {
  all: ['clienteDocs'] as const,
  byCliente: (clienteId: string) => ['clienteDocs', 'cliente', clienteId] as const,
  byId: (id: string) => ['clienteDocs', id] as const,
},
aprovacoesPendentes: {
  all: ['aprovacoesPendentes'] as const,
},
bucketUsage: {
  byBucket: (bucket: string) => ['bucketUsage', bucket] as const,
},
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/clientes/UploadDropzone.tsx` | UI drag-drop | event-driven | Sem precedente — repo nunca teve drag-drop. Pattern via RESEARCH §3 (`react-dropzone@15.0.0`) + skeleton completo. Convenções projeto (`cn()`, sonner, PT-BR) aplicam. |
| `supabase/functions/_shared/aprovacoes.ts` (estrutura agregada) | edge helper | Promise.allSettled 3-canal | É a primeira "agregação cross-canal" — `email.ts` e `push.ts` são helpers single-canal. Phase 7 combina os 3. Mas estrutura interna espelha exatamente o pattern de cada um. RESEARCH §7 (linhas 685-792) tem skeleton. |
| `src/lib/storage-helpers.ts` | lib Supabase wrapper | request-response | `usePerfis.useUploadAvatar` é o único pattern de upload — inline em hook. Phase 7 evolui para lib pura (signed URL + 60min expiry + validation pre-upload). Sem analog 1:1. |

**Recomendação:** planner deve referenciar RESEARCH.md §3 (Dropzone), §7 (helper aprovacoes), §1.C + §2 (storage-helpers) para skeletons completos. Convenções do projeto (estilos, toasts, idioma) seguem das integrações ao redor.

---

## Pitfalls Critical to Plan Around

Resumo dos 9 pitfalls de RESEARCH §Common Pitfalls que afetam múltiplos arquivos:

| # | Pitfall | Arquivos afetados |
|---|---------|-------------------|
| 1 | `onUploadProgress` ausente nos types `@supabase/supabase-js@2.99.x` | `useUploadClienteDoc`, `storage-helpers` |
| 2 | `file.type === ''` em Linux/iOS | `file-validation`, `UploadDropzone` |
| 3 | Path traversal via `file.name` (T-07-01) | `useUploadClienteDoc`, `storage-helpers` |
| 4 | Trigger SQL `INSERT OR UPDATE` referencia `OLD` quebra | `037_cliente_docs.sql` (2 triggers separadas) |
| 5 | `pg_net.http_post` latency anormal | `037_cliente_docs.sql` trigger function |
| 6 | Idempotência day-level com múltiplos docs do mesmo cliente | `aprovacoes.ts` helper |
| 7 | Quota Resend estourada → emails dropados silenciosamente | `aprovacoes.ts` helper (já mitigado por Phase 5) |
| 8 | `react-dropzone` `accept` MIME `.docx` em Windows | `UploadDropzone` (accept com extension fallback) |
| 9 | Backfill JSONB `jsonb_set` aninhado destrói chaves | `037_cliente_docs.sql` (copiar 036:124-134 literal) |

---

## Metadata

**Analog search scope:**
- `supabase/migrations/036_push_subscriptions.sql` (migration template)
- `supabase/functions/_shared/{email,push,perfis,auth,slack}.ts` (edge helpers)
- `supabase/functions/{notify-tarefa,notify-resumo-diario}/index.ts` (edge entry points)
- `src/hooks/{useLeads,usePerfis}.ts` (hooks pattern)
- `src/components/me/NotificacoesPanel.tsx`, `src/components/shared/ActivityTimeline.tsx` (UI components)
- `src/pages/{AdocaoPage,ClienteDetailPage}.tsx`, `src/pages/portal/{PortalLayout,PortalHistoricoPage}.tsx` (pages)
- `src/lib/{cnpj.ts,query-keys.ts}`, `src/router.tsx`, `src/types/index.ts` (lib/config/types)
- `tests/rls/{push_subscriptions,notificacoes_envios}.test.ts`, `src/test/push-mocks.ts` (tests + mocks)

**Files scanned:** 24 (read directly); ~30 (Glob/Grep listing)
**Pattern extraction date:** 2026-05-28
**Last verified migration:** `036_push_subscriptions.sql`

---

## PATTERN MAPPING COMPLETE

**Phase:** 7 - Client Portal Expansion
**Files classified:** 26
**Analogs found:** 23 / 26

### Coverage

- Files with exact analog: 16
- Files with role-match analog: 7
- Files with no analog (use RESEARCH skeletons): 3

### Key Patterns Identified

- **80% reuso Phase 5/6** — migration 036 é template literal para 037 (table + RLS + ALTER CHECK + handle_new_user + backfill JSONB); helpers `email.ts` + `push.ts` definem assinatura + idempotência para o novo `aprovacoes.ts`
- **Helper compartilhado multi-canal** — `_shared/aprovacoes.ts` combina sendSlack + sendEmail + sendPush em `Promise.allSettled` 3-canal paralelo; cada canal individualmente preserva pattern de idempotência via UNIQUE em `notificacoes_envios`
- **RLS role-aware 3-way em Storage** — extensão de `is_at_least` + `is_interno` para cliente (via `perfis.cliente_id`) + consultor (via `clientes.responsavel_id`) + coord+ (via `is_at_least('coordenador')`) tanto em `cliente_docs` quanto em `storage.objects` policies
- **Storage upload evolui de `useUploadAvatar`** — bucket privado + signed URL 60min + INSERT row pre-upload + rollback on error + validation defense-in-depth (frontend `validateDoc` + bucket `allowed_mime_types`)
- **Migrations sequenciais imutáveis** — 037 é nova; bucket creation + Storage RLS policies via Dashboard SQL Editor (fora migration sequencial); cron schedule em 038 separada

### File Created

`.planning/phases/07-client-portal-expansion/07-PATTERNS.md`

### Ready for Planning

Pattern mapping complete. Planner pode referenciar:
- **Analog exato** para 16 files (incluindo a migration 036 → 037 1:1)
- **Analog role-match** para 7 files (incluindo `aprovacoes.ts` como combinação de `email.ts` + `push.ts`)
- **RESEARCH §3, §7, §1.C+§2** para os 3 files sem analog direto (Dropzone, helper agregado, storage-helpers)

Shared patterns (auth, RLS, idempotência, error handling, loading states, tabs, nav) explicitamente mapeados com excerpts concretos. Pitfalls cross-cutting listados para evitar re-descobrir durante implementação.
