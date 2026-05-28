# Phase 6: PWA + Push Notifications — Pattern Map

**Mapped:** 2026-05-28
**Files analyzed:** 22 (13 NEW + 9 MODIFIED)
**Analogs found:** 19 / 22 (3 sem analog direto: `public/sw.js`, `public/manifest.json`, `public/icon-*.png` — usar skeleton do RESEARCH.md)

## File Classification

### NEW

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|----------------|---------------|
| `supabase/migrations/036_push_subscriptions.sql` | migration | DDL + DML batch | `supabase/migrations/035_notificacoes_envios.sql` | exact (mesmo formato Phase 5: tabela + RLS + ALTER CHECK + trigger update + backfill) |
| `supabase/functions/_shared/push.ts` | edge function helper (Deno) | request-response (web-push HTTP POST) | `supabase/functions/_shared/email.ts` | exact (canonical pattern D-05 espelha 1:1) |
| `src/lib/pwa.ts` | lib (pure helpers) | n/a (synchronous + Promise-based browser API wrappers) | `src/lib/utils.ts` (style) + `src/lib/cnpj.ts` (forma de helpers de domínio) | partial (no existe wrapper de browser API ainda — usar style das libs) |
| `src/hooks/usePushSubscriptions.ts` | hook (TanStack Query) | CRUD (query + insert/upsert + delete) | `src/hooks/usePreferenciasNotif.ts` + `src/hooks/useReenviarNotificacao.ts` (mutation idem) | exact (mesmo shape de Phase 5) |
| `src/components/layout/InstallAppBanner.tsx` | UI component | event-driven (`beforeinstallprompt`, `appinstalled`) | `src/components/shared/QuotaResendBanner.tsx` (banner dismissable estilo CONSEJ) + KanbanBoard.tsx (localStorage dismiss pattern `consej_kanban_hint`) | role-match (banner topo CRM) |
| `src/components/me/InstalarAppCard.tsx` | UI component | static-with-event-callback | `src/components/me/PerfilPanel.tsx` (card dentro de MeEspaco) + `src/components/me/NotificacoesPanel.tsx` (card structure) | exact (mesma estrutura visual de card) |
| `public/sw.js` | service worker (browser) | event-driven (`push`, `notificationclick`) | NENHUM — usar skeleton RESEARCH §1 | no analog |
| `public/manifest.json` | static asset | n/a (declarativo) | NENHUM — usar template RESEARCH §2 | no analog |
| `public/icon-192.png`, `public/icon-512.png` | static asset (binário) | n/a | `public/logo.png` (fonte) | source-asset |
| `tests/rls/push_subscriptions.test.ts` | test (RLS regression) | integration (Supabase admin + authenticated clients) | `tests/rls/notificacoes_envios.test.ts` | exact (mesma estrutura .env.test + describe.skipIf) |
| `src/test/push-mocks.ts` | test helper (mocks) | n/a | `src/test/supabase-mock.ts` (style de factory de mocks) | partial (push API + ServiceWorker não cobertos pelo supabase-mock) |
| `supabase/functions/_shared/__tests__/push.test.ts` | test (unit) | n/a (sync + mocked) | tests do email.ts equivalente (se existir) — caso contrário, usar push-mocks + supabase-mock | partial |

### MODIFIED

| File | Role | Modification | Closest Existing Pattern in same File | Match Quality |
|------|------|--------------|---------------------------------------|---------------|
| `src/components/me/NotificacoesPanel.tsx` | UI | matriz 4×2 → 4×3 + iOS gate + permission flow | linhas 95-126 (matriz atual) | self-extension |
| `src/types/index.ts` | types | estender `CanalNotif`, `PreferenciasNotif`; add `PushSubscriptionRow` | linhas 430-472 (block Phase 5) | self-extension |
| `src/lib/query-keys.ts` | lib | add `pushSubscriptions` keyset | linhas 67-77 (Phase 5 keys) | self-extension |
| `src/main.tsx` | entry | SW registration on boot | linhas 19-29 (bootstrap chain) | self-extension |
| `index.html` | entry (HTML) | `<link rel="manifest">`, theme-color, apple-touch-icon | linhas 1-13 (head atual) | self-extension |
| `supabase/functions/notify-tarefa/index.ts` | edge function | `sendPush()` em paralelo com `sendEmail()` via `Promise.allSettled` | linhas 218-285 (dispatch paralelo existente) | self-extension |
| `supabase/functions/notify-resumo-diario/index.ts` | edge function | idem | mesmo pattern de notify-tarefa | self-extension |
| `supabase/functions/notify-indicacao/index.ts` | edge function | idem | idem | self-extension |
| `supabase/functions/notify-renovacao/index.ts` | edge function | idem | idem | self-extension |
| `supabase/functions/_shared/perfis.ts` | edge function helper | estender `PreferenciasTipo` com `push: boolean` | linhas 9-12 (interface atual) | self-extension |
| `src/components/layout/AppLayout.tsx` | UI shell | montar `InstallAppBanner` + listener `PUSH_NAVIGATE` | linhas 73-94 (return JSX + useEffect) | self-extension |

---

## Pattern Assignments

### `supabase/migrations/036_push_subscriptions.sql` (migration, DDL)

**Analog:** `supabase/migrations/035_notificacoes_envios.sql`

**Pattern de header (linhas 1-23) — copiar formato de comentário motivacional:**
```sql
-- Migration 035: Notificações multi-canal (e-mail + Slack)
-- Phase 5 Plan 1 — fundação para envio de e-mail via Resend + log unificado de
-- notificações. Cobre EMAIL-01 (parcial: schema/RLS de preferências), EMAIL-02
-- ...
-- ⚠️ INSERT/UPDATE em notificacoes_envios feitos APENAS via service_role
```

**Pattern de CREATE TABLE + RLS (linhas 39-133) — espelhar para `push_subscriptions`:**
```sql
CREATE TABLE IF NOT EXISTS notificacoes_envios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id       uuid NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  ...
);

-- RLS
ALTER TABLE notificacoes_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_envios_read ON notificacoes_envios;
CREATE POLICY notif_envios_read ON notificacoes_envios
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid() OR public.is_at_least('coordenador'));
```

**Pattern de trigger handle_new_user atualizado (linhas 163-199) — copiar e adicionar `push: false`:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_slack BOOLEAN;
BEGIN
  ...
  UPDATE public.perfis
     SET preferencias_notif = jsonb_build_object(
       'tarefa',    jsonb_build_object('slack', has_slack, 'email', true),
       ...
     )
   WHERE id = new.id;
  RETURN new;
END;
$$;
```

**Pattern de backfill (linhas 204-210) — replicar usando `jsonb_set` por chave (RESEARCH §9 já tem versão final):**
```sql
UPDATE perfis
   SET preferencias_notif = jsonb_build_object(
     'tarefa',    jsonb_build_object('slack', slack_user_id IS NOT NULL, 'email', true),
     ...
   );
```

**Pitfalls aplicáveis (RESEARCH):**
- Postgres não suporta `ALTER CONSTRAINT CHECK` — usar DROP + ADD em mesmo statement (RESEARCH §9 notas).
- `CREATE OR REPLACE FUNCTION` não precisa de DROP — trigger `on_auth_user_created` continua apontando.
- Backfill idempotente — WHERE garante re-run safety.

---

### `supabase/functions/_shared/push.ts` (edge function helper, Deno)

**Analog:** `supabase/functions/_shared/email.ts`

**Pattern de header + imports (linhas 1-22):**
```typescript
// Helper central de envio de e-mail via Resend.
//
// Fluxo (per RESEARCH §Code Examples + D-20):
//   1. checkQuota via RPC public.quota_resend_atual — se hoje>=100 ou ...
//   2. INSERT atômico em notificacoes_envios (.select.single) — se erro
//      23505 retorna 'skipped_idempotent' sem chamar Resend
//   3. POST https://api.resend.com/emails com retry exponencial 3x para 429/5xx
//   4. Sucesso: UPDATE notificacoes_envios SET resend_id=body.id
//      Falha: UPDATE SET status='failed', error_msg=<msg>
//
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node — Deno runtime resolve em prod)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
```

**Pattern de env vars (linhas 24-33) — adaptar para VAPID:**
```typescript
const RESEND_API_KEY = (typeof Deno !== 'undefined' ? Deno.env.get('RESEND_API_KEY') : process.env.RESEND_API_KEY) ?? ''
const FROM = 'CONSEJ <onboarding@resend.dev>'
const APP_URL = (...).replace(/\/$/, '')
```

Para `push.ts` (D-07):
```typescript
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:comunicacao.consej@gmail.com'
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
```

**Pattern de tipos exportados (linhas 35-62):**
```typescript
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

export type SendEmailStatus = 'queued' | 'dropped_quota' | 'failed' | 'skipped_idempotent' | 'fallback_diretor'

export interface SendEmailResult {
  ok: boolean
  status: SendEmailStatus
  resendId?: string
  errorMsg?: string
  notificacaoId?: string
}
```

**Pattern do INSERT atômico de idempotência (linhas 131-157) — copiar exato, trocar canal `'email'` por `'push'`:**
```typescript
const { data: inserted, error: insertErr } = await supabase
  .from('notificacoes_envios')
  .insert({
    perfil_id: p.perfilId,
    tipo: p.tipo,
    entidade_id: p.entidadeId,
    entidade_tipo: p.entidadeTipo,
    canal: 'email',          // ← trocar para 'push'
    subject: p.subject,
    status: 'queued',
  })
  .select('id')
  .single<{ id: string }>()

if (insertErr) {
  if ((insertErr as { code?: string }).code === '23505') {
    return { ok: true, status: 'skipped_idempotent' }
  }
  return { ok: false, status: 'failed', errorMsg: insertErr.message ?? 'INSERT falhou' }
}
```

**Divergências documentadas (D-02, D-05, RESEARCH §4):**
- **Sem `checkQuota`** — push não consome quota Resend (D-08).
- **Iteração multi-device** — `select` em `push_subscriptions` retorna N rows; loop com `Promise.allSettled` por subscription.
- **Cleanup 410/404** — `await supabase.from('push_subscriptions').delete().eq('id', sub.id)` no catch quando `statusCode === 410 || 404` (D-02).
- **Sem retry exponencial em MVP** — RESEARCH §4 + Open Question 5: aceitar 1 tentativa; reenviar via botão Phase 5 ainda funciona.

**Pitfalls aplicáveis:**
- **R-L1 (HIGH):** `esm.sh/web-push@3.6.7` pode falhar em Deno por `node:crypto` polyfill — smoke-test obrigatório no Wave 1; fallback `npm:web-push@3.6.7`.
- **Pitfall 4:** payload > 4096 bytes silently dropped — manter title ≤ 50, body ≤ 150 chars.
- **Pitfall 6:** 410 sem cleanup acumula lixo — D-02 já cobre.

---

### `src/lib/pwa.ts` (lib, pure helpers)

**Analog:** `src/lib/utils.ts` (estilo de helpers exportados) + `src/lib/cnpj.ts` (estilo de tipos de domínio)

**Pattern de estilo do `utils.ts` (linhas 1-23) — named exports, JSDoc curto, sem default export:**
```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR })
}
```

**Pattern do `cnpj.ts` (linhas 1-23) — tipos exportados antes das funções, discriminated unions:**
```typescript
export interface CnpjData { ... }
export type CnpjState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: CnpjData }
  | { status: 'error'; message: string }
```

**Conteúdo final do `pwa.ts`:** já especificado em RESEARCH §3 (skeleton completo) — copy esse skeleton, exporta `isStandalone`, `isIOS`, `canSubscribePush`, `urlBase64ToUint8Array`, `arrayBufferToBase64Url`, `subscribePush`, `unsubscribePush`, type `PushBlockReason`.

**Pitfalls aplicáveis:**
- **Pitfall 5:** `Notification.permission === 'denied'` é permanente — tratar separadamente no `canSubscribePush()`.
- **Pitfall 9:** `display-mode: standalone` retorna false logo após `appinstalled` — escutar evento `appinstalled` (consumer no banner trata).

---

### `src/hooks/usePushSubscriptions.ts` (hook, TanStack Query)

**Analog:** `src/hooks/usePreferenciasNotif.ts` (query + mutation com optimistic update) + `src/hooks/useReenviarNotificacao.ts` (mutation com toast)

**Pattern de query com `enabled` + `queryKey` condicional (`usePreferenciasNotif.ts:11-28`):**
```typescript
export function usePreferenciasNotif(perfilId: string | null | undefined) {
  return useQuery<PreferenciasNotif | null>({
    queryKey: perfilId
      ? QUERY_KEYS.preferenciasNotif.byPerfil(perfilId)
      : QUERY_KEYS.preferenciasNotif.all,
    enabled: !!perfilId,
    queryFn: async () => {
      if (!perfilId) return null
      const { data, error } = await supabase
        .from('perfis')
        .select('preferencias_notif')
        .eq('id', perfilId)
        .maybeSingle<{ preferencias_notif: PreferenciasNotif | null }>()
      if (error) throw error
      return data?.preferencias_notif ?? null
    },
  })
}
```

**Pattern de mutation com optimistic update + rollback (`usePreferenciasNotif.ts:34-69`):**
```typescript
export function useSalvarPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { perfilId: string; prefs: PreferenciasNotif }) => {
      const { data, error } = await supabase
        .from('perfis')
        .update({ preferencias_notif: input.prefs })
        .eq('id', input.perfilId)
        .select('id, preferencias_notif')
        .single()
      if (error) throw error
      return data
    },
    onMutate: async ({ perfilId, prefs }) => {
      await qc.cancelQueries({ queryKey: QUERY_KEYS.preferenciasNotif.byPerfil(perfilId) })
      const previous = qc.getQueryData<PreferenciasNotif | null>(...)
      qc.setQueryData(QUERY_KEYS.preferenciasNotif.byPerfil(perfilId), prefs)
      return { previous, perfilId }
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous !== undefined && ctx.perfilId) {
        qc.setQueryData(QUERY_KEYS.preferenciasNotif.byPerfil(ctx.perfilId), ctx.previous)
      }
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar preferências')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.preferenciasNotif.all })
    },
  })
}
```

**Para `useSubscribePush` — usar `upsert` com `onConflict` (Pitfall 7 do RESEARCH):**
```typescript
supabase.from('push_subscriptions').upsert(
  { perfil_id, endpoint, p256dh, auth, user_agent: navigator.userAgent, last_seen_at: new Date().toISOString() },
  { onConflict: 'perfil_id,endpoint' }
)
```

**Pitfalls aplicáveis:**
- **R-L5:** request permission é async, switch otimisticamente vira ON, denied → reverter — lógica explícita no `onCheckedChange` (não dentro do hook).

---

### `src/hooks/useTogglePushPermission.ts` (hook, mutation orchestrator)

**Analog:** `src/hooks/useReenviarNotificacao.ts` (mutation com `toast.error` e mutateAsync usado de UI)

**Pattern:**
```typescript
export function useReenviarNotificacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (notifId: string) => {
      const { data, error } = await supabase.functions.invoke('reenviar-notificacao', { body: { id: notifId } })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.notificacoesEnvios.all })
      toast.success('Notificação reenviada.')
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Erro ao reenviar notificação'),
  })
}
```

**Alternativa:** combinar com `useSubscribePush` dentro de `usePushSubscriptions.ts` em vez de criar hook separado — RESEARCH §3 sugere "Exporta: usePushSubscriptions(perfilId) → query, useSubscribePush() → mutation, useUnsubscribePush() → mutation."

---

### `src/components/layout/InstallAppBanner.tsx` (UI, event-driven)

**Analog:** `src/components/shared/QuotaResendBanner.tsx` (banner estilo CONSEJ, dismiss condition early-return) + `src/components/leads/KanbanBoard.tsx` linhas 22-100 (dismiss persistente via localStorage)

**Pattern de banner estilo CONSEJ (QuotaResendBanner.tsx:25-46):**
```typescript
return (
  <div
    role="alert"
    className="flex items-start gap-3 rounded-lg border p-3 text-sm"
    style={{
      background: 'rgba(245,158,11,0.10)',
      borderColor: 'rgba(245,158,11,0.35)',
      color: 'var(--amber-hi, #fbbf24)',
    }}
  >
    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
    <div className="space-y-0.5">
      <p className="font-medium">...</p>
      <p className="text-xs opacity-90">...</p>
    </div>
  </div>
)
```

**Pattern de dismiss permanente via localStorage (KanbanBoard.tsx:22-94):**
```typescript
const [showDragHint, setShowDragHint] = useState(() => !localStorage.getItem('consej_kanban_hint'))
// ...
<button
  onClick={() => { setShowDragHint(false); localStorage.setItem('consej_kanban_hint', '1') }}
  className="p-0.5 ml-3 shrink-0"
  aria-label="Fechar dica"
>
  <X className="w-3.5 h-3.5" />
</button>
```

**Para `InstallAppBanner`:**
- Chave localStorage: `consej_install_banner_dismissed` (D-09)
- Event listener `beforeinstallprompt` + `appinstalled` em `useEffect` (RESEARCH §7)
- Early return quando `localStorage.getItem(...) === '1'` OU `isStandalone()` retorna true
- CTA "Instalar app" → chama `deferredPrompt.prompt()` (RESEARCH §7 skeleton completo)
- Tema/cor: usar `--cyan-hi` ou `#0089ac` (cor CONSEJ usada em NotificacoesPanel.tsx:75)

**Pitfalls aplicáveis:**
- **Pitfall 9:** standalone false logo após install — escutar `appinstalled` para hide banner.
- **Pitfall 10:** macOS Safari não dispara `beforeinstallprompt` — banner não aparece (limitação aceita em A7).

---

### `src/components/me/InstalarAppCard.tsx` (UI, card dentro de MeEspaco)

**Analog:** `src/components/me/PerfilPanel.tsx` (estrutura de card + header com ícone) + `src/components/me/NotificacoesPanel.tsx` (mesmo padrão visual)

**Pattern do header de card (NotificacoesPanel.tsx:71-86):**
```typescript
<div className="max-w-2xl space-y-6">
  <div className="bg-card rounded-2xl border p-6">
    <div className="flex items-center gap-3 mb-2">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
        style={{ backgroundColor: '#0089ac' }}
      >
        <Bell className="w-5 h-5" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Notificações</h2>
        <p className="text-xs text-muted-foreground">
          Escolha onde receber cada tipo de notificação.
        </p>
      </div>
    </div>
    ...
  </div>
</div>
```

**Conteúdo do card (D-09):**
- Se `isStandalone()` → não renderiza (return null)
- Se Chrome com `beforeinstallprompt` capturado → botão "Instalar app" (mesmo estilo `<Button>` do NotificacoesPanel:137-145)
- Se iOS Safari não-standalone → instruções estáticas "Compartilhar → Adicionar à Tela" com `<Share />` icon (lucide-react)

---

### `public/sw.js` (service worker, browser runtime)

**Analog:** NENHUM — usar skeleton completo do RESEARCH §1.

**Pattern de skeleton (RESEARCH §1, linhas 231-275):**
```javascript
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'CONSEJ CRM', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'CONSEJ CRM';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
    tag: payload.data?.tipo || 'consej',
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const deepLink = event.notification.data?.deepLink || '/dashboard';
  const targetUrl = new URL(deepLink, self.location.origin).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        client.postMessage({ type: 'PUSH_NAVIGATE', url: targetUrl });
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
```

**Pitfalls aplicáveis:**
- **Pitfall 1:** SW DEVE ficar em `public/sw.js` (não `src/`).
- **Pitfall 2:** scope automático `/` quando registrado de raiz.
- **R-S7 (security):** validar `targetUrl.origin === self.location.origin` antes de `openWindow`.

---

### `public/manifest.json` (PWA manifest)

**Analog:** NENHUM — usar template completo do RESEARCH §2 (já lockado em D-10).

```json
{
  "name": "CONSEJ CRM",
  "short_name": "CONSEJ",
  "description": "CRM interno da CONSEJ",
  "lang": "pt-BR",
  "start_url": "/dashboard",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#0a0a0a",
  "background_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

---

### `tests/rls/push_subscriptions.test.ts` (RLS regression test)

**Analog:** `tests/rls/notificacoes_envios.test.ts`

**Pattern de bootstrap .env.test + skip condicional (linhas 1-45):**
```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

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
const QA = { ... }
const configurado = !!(URL && ANON && SERVICE && QA.diretorEmail && ...)

async function login(email: string, password: string): Promise<{ client: SupabaseClient; uid: string }> { ... }

describe.skipIf(!configurado)('RLS — push_subscriptions (migration 036)', () => {
  // ...
})

describe.skipIf(configurado)('RLS — push_subscriptions — PULADO', () => {
  it('configure .env.test ...', () => expect(true).toBe(true))
})
```

**Pattern de seed via service_role + assertion por authenticated (linhas 56-117):**
```typescript
beforeAll(async () => {
  const c = await login(QA.consultorEmail!, QA.consultorPass!)
  const d = await login(QA.diretorEmail!, QA.diretorPass!)
  service = createClient(URL!, SERVICE!, { auth: { persistSession: false } })
  // seed: 2 subs do consultor + 1 do diretor (com endpoint distinct para não violar UNIQUE)
  await service.from('push_subscriptions').insert(rows)
})

it('consultor SELECT só vê linhas próprias', async () => {
  const { data, error } = await consultor.from('push_subscriptions').select('id, perfil_id')...
  expect(error).toBeNull()
  for (const row of data ?? []) expect(row.perfil_id).toBe(consultorUid)
})

it('diretor SELECT vê linhas de qualquer perfil', async () => { ... })
it('INSERT como outro perfil é bloqueado pela WITH CHECK', async () => { ... })
```

**Casos a cobrir (RESEARCH Validation Architecture):**
- consultor vê só as suas (perfil_id = auth.uid())
- diretor vê todas (is_at_least('coordenador'))
- INSERT com `perfil_id != auth.uid()` é bloqueado
- DELETE só próprias (consultor não consegue deletar de outro perfil)
- ON CONFLICT (perfil_id, endpoint) DO UPDATE funciona (re-subscribe)

---

### `src/test/push-mocks.ts` (test helper)

**Analog:** `src/test/supabase-mock.ts` (style de factory de mocks)

**Pattern do supabase-mock (linhas 32-60) — factory function que retorna objeto de mocks com `vi.fn`:**
```typescript
function makeBuilder(response: MockResponse) {
  const builder: Record<string, unknown> = {}
  for (const m of CHAIN_METHODS) {
    builder[m] = vi.fn(() => builder)
  }
  builder.single = vi.fn(() => Promise.resolve(response))
  builder.maybeSingle = vi.fn(() => Promise.resolve(response))
  builder.then = (resolve: (v: MockResponse) => unknown) => resolve(response)
  return builder
}

export function createSupabaseMock(config: MockConfig = {}) {
  return {
    from: vi.fn((table: string) => makeBuilder(config.from?.[table] ?? defaultResp)),
    rpc: vi.fn((fn: string) => { ... }),
    auth: { ... },
  }
}
```

**Para `push-mocks.ts` — mocks de browser APIs:**
- `mockServiceWorker()` → stub para `navigator.serviceWorker` (register, ready, addEventListener)
- `mockPushManager(subscription | null)` → stub para `registration.pushManager.subscribe/getSubscription/permissionState`
- `mockNotification(permission: 'default' | 'granted' | 'denied')` → stub para `window.Notification` global
- `mockMatchMedia(standalone: boolean)` → stub para `window.matchMedia('(display-mode: standalone)')`

**Wave 0 gap (RESEARCH):** "Mock helpers para `navigator.serviceWorker` + `PushManager` em vitest.setup.ts (não existe — atualizar setup)".

---

### MODIFIED: `src/components/me/NotificacoesPanel.tsx` (matriz 4×2 → 4×3)

**Self-extension** — pattern atual é o template.

**Pattern atual (linhas 93-126) — grid de 3 colunas:**
```typescript
{/* Cabeçalho */}
<div className="grid grid-cols-[1fr_auto_auto] gap-6 items-center px-3 py-2 ...">
  <span>Tipo</span>
  <span className="w-14 text-center">Slack</span>
  <span className="w-14 text-center">E-mail</span>
</div>

{TIPOS.map(t => (
  <div key={t.id} className="grid grid-cols-[1fr_auto_auto] gap-6 ...">
    <div>...</div>
    <div className="w-14 flex justify-center">
      <Switch
        checked={draft[t.id].slack}
        onCheckedChange={v => toggle(t.id, 'slack', v)}
        aria-label={`${t.label} via Slack`}
      />
    </div>
    <div className="w-14 flex justify-center">
      <Switch
        checked={draft[t.id].email}
        onCheckedChange={v => toggle(t.id, 'email', v)}
        aria-label={`${t.label} via E-mail`}
      />
    </div>
  </div>
))}
```

**Modificações (RESEARCH §3, §6):**
1. Mudar grid para `grid-cols-[1fr_auto_auto_auto]`.
2. Adicionar 3ª coluna no header "Push" (lucide `<Smartphone />` opcional).
3. Adicionar 3ª `<Switch>` por linha.
4. iOS Gate (D-13): se `canSubscribePush().reason === 'ios-not-standalone'` → switches Push `disabled` + `<Tooltip>` (do `src/components/ui/tooltip.tsx`) "Instale o app primeiro: toque em Compartilhar → Adicionar à Tela".
5. Permission flow inline (D-12, R-L5): no `onCheckedChange` do switch Push, se vai virar ON e `Notification.permission === 'default'`, chamar `Notification.requestPermission()` ANTES de `useSubscribePush.mutateAsync()`. Se denied → revert + `toast.error`.

**Pitfalls aplicáveis:**
- **R-L5:** lógica explícita do flow async com rollback do switch.
- **Pitfall 5:** quando `reason === 'denied'`, mostrar instrução para reverter em browser settings.

---

### MODIFIED: `src/types/index.ts` (extend block Phase 5)

**Pattern atual (linhas 432-450):**
```typescript
export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'
export type CanalNotif = 'email' | 'slack'

export interface PreferenciasNotif {
  tarefa:    { slack: boolean; email: boolean }
  cadencia:  { slack: boolean; email: boolean }
  renovacao: { slack: boolean; email: boolean }
  indicacao: { slack: boolean; email: boolean }
}
```

**Modificação (D-16, RESEARCH §10):**
```typescript
export type CanalNotif = 'email' | 'slack' | 'push'

export interface PreferenciasNotif {
  tarefa:    { slack: boolean; email: boolean; push: boolean }
  cadencia:  { slack: boolean; email: boolean; push: boolean }
  renovacao: { slack: boolean; email: boolean; push: boolean }
  indicacao: { slack: boolean; email: boolean; push: boolean }
}

// Nome `PushSubscriptionRow` em vez de `PushSubscription` para evitar colisão
// com o tipo nativo do DOM `PushSubscription` (RESEARCH §10 nota).
export interface PushSubscriptionRow {
  id: string
  perfil_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  last_seen_at: string
  created_at: string
}
```

---

### MODIFIED: `src/lib/query-keys.ts` (add pushSubscriptions)

**Pattern atual (linhas 67-77):**
```typescript
preferenciasNotif: {
  all: ['preferenciasNotif'] as const,
  byPerfil: (perfilId: string) => ['preferenciasNotif', perfilId] as const,
},
notificacoesEnvios: {
  all: ['notificacoesEnvios'] as const,
  byPerfil: (perfilId: string) => ['notificacoesEnvios', perfilId] as const,
},
```

**Adicionar:**
```typescript
pushSubscriptions: {
  all: ['pushSubscriptions'] as const,
  byPerfil: (perfilId: string) => ['pushSubscriptions', perfilId] as const,
},
```

---

### MODIFIED: `src/main.tsx` (SW registration)

**Pattern atual (linhas 19-29) — bootstrap chain:**
```typescript
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
```

**Modificação (D-11, RESEARCH §Code Examples — Boot do Service Worker):**
Adicionar ANTES do `createRoot(...)`:
```typescript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch((err) => console.warn('[SW] registration failed:', err))
  })
}
```

**Pitfall 8:** opcionalmente `if (import.meta.env.PROD)` para evitar conflito com HMR em dev — mas atualmente push só funciona em prod de qualquer jeito; aceitar.

---

### MODIFIED: `index.html` (PWA tags)

**Pattern atual (linhas 1-13):**
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>consej-crm-v2</title>
  </head>
  ...
</html>
```

**Adicionar dentro do `<head>` (RESEARCH §2 + D-10):**
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0a0a0a">
<link rel="apple-touch-icon" href="/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="CONSEJ">
```

Mudar `<html lang="en">` para `<html lang="pt-BR">` para alinhar com `manifest.json`.

---

### MODIFIED: `supabase/functions/notify-tarefa/index.ts` (sendPush em paralelo)

**Pattern atual (linhas 217-285) — dispatch paralelo Slack + Email via `Promise.all`:**
```typescript
const wantSlack = prefs?.tarefa?.slack === true && slackUserId !== null && !fallbackAcionado

const emailPromises = emailTargets.map(async (t) => {
  const wantEmail = t.prefs?.tarefa?.email === true
  if (!wantEmail) return { ok: true, skipped: 'email_off' as const, perfilId: t.perfilId }
  ...
  return sendEmail(supabase, { ... })
})

const slackPromise = wantSlack ? (async () => { ... })() : Promise.resolve({ ok: true, skipped: 'slack_off' })

const [slackRes, ...emailResArray] = await Promise.all([slackPromise, ...emailPromises])

return json({
  ok: slackRes.ok && emailResArray.every((e) => (e as { ok: boolean }).ok),
  slack: slackRes,
  email: emailResArray,
  fallback_diretor: fallbackAcionado,
})
```

**Modificação (D-05, RESEARCH §5, Open Question 1):**
1. **Trocar `Promise.all` → `Promise.allSettled`** (recomendação RESEARCH Q1 — pequeno, baixo risco, alto benefício).
2. Adicionar `wantPush` check + `pushPromise`:
```typescript
const wantPush = prefs?.tarefa?.push === true && !fallbackAcionado

const pushPayload = wantPush ? {
  title: `Nova tarefa: ${tarefa.titulo}`,
  body: `${criadorNome} te atribuiu uma tarefa`,
  data: { deepLink: link, tipo: 'tarefa' as const, entidadeId: tarefa.id },
} : null

const pushPromise = wantPush
  ? sendPush(supabase, {
      perfilId: novoAtribuido,
      tipo: 'tarefa',
      entidadeId: tarefa.id,
      entidadeTipo: 'tarefa',
      payload: pushPayload!,
    })
  : Promise.resolve({ ok: true, skipped: 'push_off' })

const settled = await Promise.allSettled([slackPromise, pushPromise, ...emailPromises])
const [slackRes, pushRes, ...emailResArray] = settled.map(s => s.status === 'fulfilled' ? s.value : { ok: false, error: String(s.reason) })
```

**Decisão NÃO usar fallback diretor para push** (RESEARCH §5 + Open Question 2) — documentar na implementação.

**Pitfall 4:** payload size — `title` ≤ 50 chars, `body` ≤ 150 chars.

**Aplicar mesmo pattern em:** `notify-resumo-diario`, `notify-indicacao`, `notify-renovacao`.

---

### MODIFIED: `supabase/functions/_shared/perfis.ts` (extend PreferenciasTipo)

**Pattern atual (linhas 9-12):**
```typescript
export interface PreferenciasTipo {
  slack: boolean
  email: boolean
}
```

**Modificação (RESEARCH §11):**
```typescript
export interface PreferenciasTipo {
  slack: boolean
  email: boolean
  push: boolean   // ← NEW (Phase 6 D-16)
}
```

**Verified (A6):** Phase 5 functions não quebram porque acessam `prefs?.tarefa?.email` (não destructure rígido); `@ts-nocheck` no top do arquivo afrouxa qualquer drift.

---

### MODIFIED: `src/components/layout/AppLayout.tsx` (mount banner + SW message listener)

**Pattern atual (linhas 73-94) — JSX root + `useEffect` para auth:**
```typescript
return (
  <div className="flex h-screen bg-background">
    <Sidebar />
    <main className="flex-1 overflow-y-auto bg-background">
      <div key={location.pathname} className="p-6 animate-in fade-in duration-150">
        <Outlet />
      </div>
    </main>
    <GlobalSearch />
    <OnboardingWizard />
    <Toaster ... />
  </div>
)
```

**Modificação:**
1. Montar `<InstallAppBanner />` no topo de `<main>` (acima de `<Outlet />`).
2. Adicionar `useEffect` para listener de mensagens do SW (RESEARCH §8):
```typescript
useEffect(() => {
  if (!('serviceWorker' in navigator)) return
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'PUSH_NAVIGATE' && typeof e.data.url === 'string') {
      const url = new URL(e.data.url)
      // R-S7: validar same-origin antes de navegar
      if (url.origin === window.location.origin) {
        navigate(url.pathname + url.search)
      }
    }
  }
  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}, [navigate])
```

---

## Shared Patterns

### Idempotência (`notificacoes_envios` UNIQUE)

**Source:** `supabase/migrations/035_notificacoes_envios.sql:71-79`
**Apply to:** `_shared/push.ts` (canal='push' usa mesma UNIQUE após ALTER CHECK em migration 036)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS notif_envios_unique_idempotency
  ON notificacoes_envios (
    perfil_id, tipo, canal, dia,
    COALESCE(entidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE reenviado_por_id IS NULL;
```

INSERT atômico com `.single<{id}>()` + check `insertErr.code === '23505'` → return `skipped_idempotent`.

---

### RLS Role-aware

**Source:** `supabase/migrations/035_notificacoes_envios.sql:130-133`
**Apply to:** `push_subscriptions` policies (migration 036)

```sql
CREATE POLICY ... ON push_subscriptions
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid() OR public.is_at_least('coordenador'));
```

Função `is_at_least(role)` já existe (criada em migration 035). Padronizado: consultor vê só as suas; coord+ vê todas.

---

### TanStack Query Mutations com Optimistic Update + Toast

**Source:** `src/hooks/usePreferenciasNotif.ts:34-69`
**Apply to:** `usePushSubscriptions.ts` (subscribe + unsubscribe mutations)

```typescript
return useMutation({
  mutationFn: async (input) => { ... if (error) throw error; return data },
  onMutate: async (vars) => {
    await qc.cancelQueries(...)
    const previous = qc.getQueryData(...)
    qc.setQueryData(...) // optimistic
    return { previous, ... }
  },
  onError: (e, _vars, ctx) => {
    if (ctx?.previous) qc.setQueryData(..., ctx.previous) // rollback
    toast.error(e instanceof Error ? e.message : 'Erro ...')
  },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ... })
  },
})
```

---

### Edge function header + `@ts-nocheck`

**Source:** `supabase/functions/_shared/email.ts:1-22`, `_shared/perfis.ts:1-7`
**Apply to:** `_shared/push.ts` (mesmo header style)

```typescript
// Helper central de envio de Web Push via VAPID.
//
// Espelha 1:1 o pattern de _shared/email.ts:
//   ...
//
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node — Deno runtime resolve em prod)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
```

---

### Dismissible Banner com localStorage (pattern CONSEJ)

**Source:** `src/components/leads/KanbanBoard.tsx:22,94` (`consej_kanban_hint`)
**Apply to:** `InstallAppBanner.tsx` (`consej_install_banner_dismissed`)

```typescript
const [show, setShow] = useState(() => !localStorage.getItem('consej_install_banner_dismissed'))
// ...
onClick={() => { setShow(false); localStorage.setItem('consej_install_banner_dismissed', '1') }}
```

---

### Deep link via `useSearchParams` (já estabelecido)

**Source:** `src/pages/LeadsPage.tsx` (pattern bookmarkable), notify-tarefa.ts:214 (`?highlight=`)
**Apply to:** TarefasPage, IndicacoesPage, etc — `useEffect` lê `searchParams.get('highlight')` e dispara modal/scroll.

```typescript
// notify-tarefa.ts:211-214 já gera link no caller
const link =
  tarefa.entidade_tipo && tarefa.entidade_id
    ? `${APP_URL}/${...}/${tarefa.entidade_id}`
    : `${APP_URL}/tarefas?highlight=${tarefa.id}`
```

Phase 6 usa esse `link` em `payload.data.deepLink`.

---

## No Analog Found

| File | Role | Reason | Mitigation |
|------|------|--------|------------|
| `public/sw.js` | service worker | Nenhum SW existe no projeto | Usar skeleton completo RESEARCH §1 (testado em produção) |
| `public/manifest.json` | PWA manifest | Nenhum manifest existe | Usar template completo D-10 / RESEARCH §2 |
| `public/icon-192.png`, `public/icon-512.png` | PWA icons | Gerados from `public/logo.png` | Recomendação Open Question 3: usar maskable.app online + commitar (sem dep `sharp`) |

---

## Pre-execution Manual Prerequisites (do RESEARCH/STATE)

Estes não são arquivos a copiar, mas o planner precisa documentá-los como tarefas manuais antes do execute-phase:

1. **Gerar VAPID keypair localmente** (`npx web-push generate-vapid-keys`).
2. **Setar Supabase Secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
3. **Setar Vercel env:** `VITE_VAPID_PUBLIC_KEY` (mesmo valor de `VAPID_PUBLIC_KEY`).
4. **Validar mesmo valor** (R-L2 mitigation) — assertion no smoke-test ou no boot do edge function.
5. **(Opcional, R-L4)** Adicionar a `vercel.json`:
```json
"headers": [
  { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }] }
]
```

---

## Metadata

**Analog search scope:**
- `supabase/functions/_shared/` (4 arquivos)
- `supabase/migrations/03*.sql` (6 arquivos)
- `src/hooks/use*.ts` (28 arquivos — focused em Phase 5: `usePreferenciasNotif`, `useNotificacoesEnvios`, `useReenviarNotificacao`, `useLeads`)
- `src/components/me/*.tsx` (6 arquivos)
- `src/components/layout/AppLayout.tsx`, `Sidebar.tsx`
- `src/components/shared/QuotaResendBanner.tsx`
- `src/lib/utils.ts`, `cnpj.ts`, `query-keys.ts`, `supabase.ts`
- `src/types/index.ts`
- `src/main.tsx`, `index.html`, `vercel.json`
- `tests/rls/notificacoes_envios.test.ts`, `preferencias_notif.test.ts`
- `src/test/supabase-mock.ts`

**Files scanned:** ~40 (incluindo notify-tarefa/index.ts via offset Read)
**Pattern extraction date:** 2026-05-28

---

## PATTERN MAPPING COMPLETE

**Phase:** 6 - PWA + Push Notifications
**Files classified:** 22 (13 NEW + 9 MODIFIED)
**Analogs found:** 19 / 22

### Coverage
- Files with exact analog: 14 (`036_*.sql`, `_shared/push.ts`, `usePushSubscriptions`, `useTogglePushPermission`, `InstalarAppCard`, `tests/rls/push_subscriptions`, plus 8 self-extensions on modified files)
- Files with role-match / partial analog: 5 (`pwa.ts`, `InstallAppBanner`, `push-mocks.ts`, `_shared/__tests__/push.test.ts`, AppLayout modification)
- Files with NO analog (use RESEARCH skeleton): 3 (`public/sw.js`, `public/manifest.json`, `public/icon-*.png`)

### Key Patterns Identified
- **Phase 5 helpers (email.ts, perfis.ts, NotificacoesPanel, usePreferenciasNotif, notificacoes_envios schema) são o template canônico** — Phase 6 estende cada um em modo aditivo (sem rewrite).
- **Idempotência + RLS role-aware já estão em produção** — Phase 6 reaproveita UNIQUE e `is_at_least('coordenador')` sem mudança estrutural; só expande `canal` CHECK e adiciona nova tabela com mesmo padrão de RLS.
- **3 artefatos browser-native sem analog** (`sw.js`, `manifest.json`, ícones) — usar skeletons completos do RESEARCH §1, §2 (já validados).
- **Dispatch paralelo nas 4 notify-* functions** — pattern canônico de `Promise.all([slackPromise, ...emailPromises])` evolui para `Promise.allSettled([slackPromise, pushPromise, ...emailPromises])` (Open Question 1 recomenda refactor oportunista para resiliência cross-canal).
- **Cleanup 410 + DELETE row** é a única divergência conceitual entre `sendEmail` e `sendPush` — capturar `e.statusCode === 410 || 404` no catch e `supabase.from('push_subscriptions').delete().eq('id', sub.id)`.

### File Created
`.planning/phases/06-pwa-push-notifications/06-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns (file + line ranges) in PLAN.md actions for each of the 22 files.
