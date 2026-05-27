# Phase 5: Multi-Channel Notifications (Email) — Pattern Map

**Mapped:** 2026-05-27
**Files analyzed:** 15 CREATE + 10 MODIFY = 25 files
**Analogs found:** 24 / 25 (Resend webhook HMAC has partial analog only)

## File Classification

### CREATE

| New file | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/035_notificacoes_envios.sql` | migration | DDL + RLS + trigger | `supabase/migrations/026_renovacao_notif.sql` + `029_rls_role_aware.sql` + `011_auto_profile_trigger.sql` | composite exact |
| `supabase/functions/_shared/auth.ts` | helper module (Deno) | utility | `constantTimeAuthCheck` block repeated identical in all 4 `notify-*/index.ts` | exact (extract) |
| `supabase/functions/_shared/perfis.ts` | helper module (Deno) | DB lookup | `findSlackUserId` + `findPerfilName`/`findPerfilNome` in `notify-tarefa` + `notify-resumo-diario` | exact (extract) |
| `supabase/functions/_shared/slack.ts` | helper module (Deno) | request-response (Slack API) | `openDmChannel` + `postDm` in `notify-tarefa/index.ts` + `notify-resumo-diario/index.ts` | exact (extract) |
| `supabase/functions/_shared/email.ts` | helper module (Deno) | request-response (Resend API) + DB write | `notify-renovacao/index.ts` (idempotent insert → API call → status update pattern) | role-match |
| `supabase/functions/_shared/templates/{tarefa,cadencia,renovacao,indicacao}.html` | template asset | string substitution | `supabase/functions/notify-indicacao/slack.ts` `buildIndicacaoBlocks` (closest is structured block builder, not HTML) | partial — no HTML template precedent; new pattern |
| `supabase/functions/resend-webhook/index.ts` | edge function | event-driven (webhook receive → UPDATE) | `supabase/functions/slack-commands/index.ts` (signature verify + HMAC); `notify-renovacao/index.ts` (UPDATE notification table) | composite role-match |
| `src/components/me/NotificacoesPanel.tsx` | feature component | form (matrix) + mutation | `src/components/me/PerfilPanel.tsx` (panel-in-tab pattern) | role-match (PerfilPanel uses raw inputs, not Switch matrix) |
| `src/pages/NotificacoesHistoricoPage.tsx` | page | list + filter + role-gated action | `src/pages/AuditoriaPage.tsx` (list + role-gated restore action) | exact |
| `src/pages/portal/PortalPreferenciasPage.tsx` | page (portal) | form + mutation | `src/pages/portal/PortalWalletPage.tsx` (portal page shell) + `NotificacoesPanel` (same matrix UI reduced) | role-match |
| `src/hooks/usePreferenciasNotif.ts` | hook | query + mutation with invalidate | `src/hooks/usePerfis.ts::useSalvarPerfil` (upsert single column + invalidate) | exact |
| `src/hooks/useNotificacoesEnvios.ts` | hook | query with optional filter | `src/hooks/useAuditLogs.ts::useAllAuditLogs` (limit, order desc) | exact |
| `src/hooks/useReenviarNotificacao.ts` | hook | mutation calling edge function | `src/hooks/useLeads.ts::useDeleteLead` (rpc + invalidate + toast PT-BR with error message) | role-match (uses `functions.invoke` instead of `rpc`) |
| `src/hooks/useQuotaResend.ts` | hook | query with staleTime | `src/hooks/useAuditLogs.ts::useAllAuditLogs` + custom `staleTime` like `useMeuPerfil` | role-match |
| `src/components/ui/switch.tsx` | UI primitive (shadcn) | controlled toggle | `src/components/ui/tabs.tsx` (Radix-wrapped shadcn primitive); installed via CLI not handcrafted | n/a (CLI generated) |

### MODIFY

| Modified file | Role | Change Pattern | Reference Analog |
|---|---|---|---|
| `supabase/functions/notify-tarefa/index.ts` | edge function | Insert self-loop check + prefs lookup + `Promise.all([postDm, sendEmail])` | Refactor mirrors current handler shape (lines 142–227 of same file) |
| `supabase/functions/notify-resumo-diario/index.ts` | edge function | Add companion `sendEmail` after `postDm` | Mirror `notify-tarefa` modification |
| `supabase/functions/notify-indicacao/index.ts` | edge function | Lookup `leads.responsavel_id` of created lead + companion `sendEmail` per-user (broadcast preserved) | Lookup pattern from `notify-tarefa::findSlackUserId` |
| `supabase/functions/notify-renovacao/index.ts` | edge function | Lookup `contratos.responsavel_id` + companion `sendEmail` per-user (broadcast preserved) | Lookup pattern + existing `hydrateContrato` (notify-renovacao:75–100) |
| `src/pages/MeEspacoPage.tsx` | page | Add new entry to `TABS` const array | `TABS` const at MeEspacoPage:21–27 |
| `src/router.tsx` | config | Add 3 route entries | Existing CRM/Portal children arrays at router.tsx:49–84/89–94 |
| `src/lib/query-keys.ts` | config | Append `preferenciasNotif`, `notificacoesEnvios`, `quotaResend` keys | Object literal pattern at query-keys.ts:1–67 |
| `src/types/index.ts` | types | Append `PreferenciasNotif`, `NotificacaoEnvio`, `CanalNotif`, `TipoNotif` exports | Interface export pattern at types/index.ts:1–80 |
| `src/pages/portal/PortalLayout.tsx` | layout | Append nav item to `NAV` array | NAV const at PortalLayout.tsx:14–19 |

## Pattern Assignments

---

### `supabase/migrations/035_notificacoes_envios.sql` (migration, composite)

**Primary analog:** `supabase/migrations/026_renovacao_notif.sql` (idempotency table + RLS)

**Idempotency-table pattern** (026:1–26):
```sql
CREATE TABLE IF NOT EXISTS notificacoes_renovacao_enviadas (
  contrato_id  UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  dias_antes   INT NOT NULL,
  enviada_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  slack_ts     TEXT,
  status       TEXT NOT NULL DEFAULT 'enviado',
  erro_msg     TEXT,
  PRIMARY KEY (contrato_id, dias_antes)
);

CREATE INDEX IF NOT EXISTS idx_notif_renov_contrato ON notificacoes_renovacao_enviadas(contrato_id);
ALTER TABLE notificacoes_renovacao_enviadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interno_all_notif_renov" ON notificacoes_renovacao_enviadas
  FOR ALL TO authenticated
  USING (public.is_interno()) WITH CHECK (public.is_interno());
```

**RLS role-aware pattern** (mirror from 029:43–48, swap `responsavel_id` for `perfil_id`):
```sql
CREATE POLICY "notif_envios_read" ON notificacoes_envios
  FOR SELECT TO authenticated
  USING (perfil_id = auth.uid() OR public.is_diretor() OR public.can_see_perfil(perfil_id));
```
Reference `is_at_least()` / `can_see_perfil()` from 029. Coordenador+ visibility per D-11.

**Trigger update pattern** (011:16–47):
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE default_name TEXT;
BEGIN
  default_name := COALESCE(...);
  INSERT INTO public.perfis (id, email, nome) VALUES (new.id, new.email, default_name)
    ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
```
**Modification needed:** add `UPDATE perfis SET preferencias_notif = jsonb_build_object(...)` after the INSERT, computing `slack: (slack_user_id IS NOT NULL)` per D-04. Trigger redeclaration uses `CREATE OR REPLACE FUNCTION` (no `DROP TRIGGER` needed since trigger references function by name).

**Service-role-only write pattern** (033:22–38 inverse — explicitly avoid permissive INSERT/UPDATE policies):
```sql
-- Only SELECT policy declared. INSERT/UPDATE bypassed via service_role.
-- Comment loudly in migration: "INSERT/UPDATE feitos apenas via service_role (Edge Functions)"
```

**Pattern divergence (do NOT replicate):**
- 026 uses composite `PRIMARY KEY (contrato_id, dias_antes)` — Phase 5 uses surrogate `uuid PK` + separate `UNIQUE` index with `COALESCE(entidade_id, ...)` (R8 + Pitfall 4 in RESEARCH).
- 026 uses generic `public.is_interno()` — Phase 5 must use `public.is_at_least('coordenador')` for the "see others" branch (D-11).

---

### `supabase/functions/_shared/auth.ts` (helper module, extract)

**Analog:** identical block at `notify-tarefa/index.ts:40–49`, `notify-indicacao/index.ts:19–30`, `notify-renovacao/index.ts:22–31`, `notify-resumo-diario/index.ts:23–32`.

**Exact code to extract** (notify-tarefa:40–49):
```typescript
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts'

export function constantTimeAuthCheck(received: string, expectedSecret: string): boolean {
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

Replace all 4 callsites with `import { constantTimeAuthCheck } from '../_shared/auth.ts'`. New `resend-webhook` imports the same.

---

### `supabase/functions/_shared/perfis.ts` (helper module, extract)

**Analog:** `notify-tarefa/index.ts:79–96` and `notify-resumo-diario/index.ts:46–62` (note naming drift `findPerfilName` vs `findPerfilNome` — unify as `findPerfilNome`).

**Exact pattern** (notify-tarefa:79–96):
```typescript
export async function findSlackUserId(supabase: SupabaseClient, perfilId: string): Promise<string | null> {
  const { data } = await supabase
    .from('perfis')
    .select('slack_user_id')
    .eq('id', perfilId)
    .maybeSingle<{ slack_user_id: string | null }>()
  return data?.slack_user_id ?? null
}

export async function findPerfilNome(supabase: SupabaseClient, perfilId: string | null): Promise<string> {
  if (!perfilId) return 'Sistema'
  const { data } = await supabase
    .from('perfis')
    .select('nome')
    .eq('id', perfilId)
    .maybeSingle<{ nome: string }>()
  return data?.nome ?? 'Alguém'
}
```

**Add new helper for prefs lookup:**
```typescript
export async function loadPrefs(
  supabase: SupabaseClient,
  perfilId: string,
): Promise<Record<string, { slack: boolean; email: boolean }> | null> {
  const { data } = await supabase
    .from('perfis')
    .select('preferencias_notif, email')
    .eq('id', perfilId)
    .maybeSingle<{ preferencias_notif: Record<string, { slack: boolean; email: boolean }> | null; email: string }>()
  return data?.preferencias_notif ?? null
}

export async function findDiretores(supabase: SupabaseClient): Promise<Array<{ id: string; email: string }>> {
  const { data } = await supabase
    .from('perfis')
    .select('id, email')
    .eq('role', 'diretor')
    .returns<Array<{ id: string; email: string }>>()
  return data ?? []
}
```

---

### `supabase/functions/_shared/slack.ts` (helper module, extract)

**Analog:** `notify-tarefa/index.ts:98–140` + `notify-resumo-diario/index.ts:64–106` (identical except for inline comments).

**Exact code to extract** (notify-tarefa:114–140):
```typescript
async function openDmChannel(token: string, slackUserId: string) {
  const res = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ users: slackUserId }),
  })
  const body = await res.json() as { ok: boolean; channel?: { id: string }; error?: string }
  if (!body.ok || !body.channel) return { ok: false, error: body.error ?? `HTTP ${res.status}` }
  return { ok: true, channel: body.channel.id }
}

export async function postDm(token: string, slackUserId: string, text: string, blocks: unknown[]): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const dm = await openDmChannel(token, slackUserId)
  if (!dm.ok || !dm.channel) return { ok: false, error: `conversations.open falhou: ${dm.error}` }
  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: dm.channel, text, blocks, unfurl_links: false }),
    })
    if (res.status === 429 || res.status >= 500) {
      await new Promise(r => setTimeout(r, 500 * 2 ** i))
      continue
    }
    const body = await res.json() as { ok: boolean; ts?: string; error?: string }
    return body.ok ? { ok: true, ts: body.ts } : { ok: false, error: body.error ?? `HTTP ${res.status}` }
  }
  return { ok: false, error: 'Slack indisponível após retries' }
}
```

**Pattern divergence:** in helper, accept `token` as parameter (don't read `Deno.env` inside helper) — keeps the helper portable for `resend-webhook` and future functions. Original closes over module-level `SLACK_BOT_TOKEN`.

---

### `supabase/functions/_shared/email.ts` (helper module, new)

**Analog:** `notify-renovacao/index.ts` (the full pattern of insert idempotency table → call external API with retry → update status).

**Insert-then-API-then-update pattern** (notify-renovacao:187–232):
```typescript
// Step 1: insert idempotency row
const { error: insertErr } = await supabase
  .from('notificacoes_renovacao_enviadas')
  .insert({ contrato_id: payload.contrato_id, dias_antes: payload.dias_antes, status: 'pendente' })

if (insertErr) {
  if (/duplicate key|unique/i.test(insertErr.message)) {
    return json({ ok: true, skipped: 'já notificado (idempotência)' })
  }
  return json({ ok: false, error: `insert falhou: ${insertErr.message}` }, 500)
}

// Step 2: call external API
const result = await postToSlack(blocks, fallback)

// Step 3: update status with API outcome
if (!result.ok) {
  await supabase.from('notificacoes_renovacao_enviadas')
    .update({ status: 'erro', erro_msg: result.error ?? 'unknown' })
    .eq('contrato_id', ...)
}
await supabase.from('notificacoes_renovacao_enviadas')
  .update({ status: 'enviado', slack_ts: result.ts })
  .eq('contrato_id', ...)
```

**Retry-with-exponential-backoff pattern** (notify-renovacao:137–159) — mirror for Resend `fetch`:
```typescript
for (let i = 0; i < 3; i++) {
  const res = await fetch(url, { ... })
  if (res.status === 429 || res.status >= 500) {
    await new Promise(r => setTimeout(r, 500 * 2 ** i))
    continue
  }
  // success/non-retryable path
}
```

**Full helper signature in RESEARCH.md §Code Examples** (lines 942–1067) — copy that scaffold; main divergences from analog:
- Use Postgres error code `'23505'` (unique_violation) instead of regex match — more precise.
- Pre-check quota via `supabase.rpc('quota_resend_atual')` before INSERT (RESEARCH Q8).
- Use Postgres `INSERT ... RETURNING id, (xmax = 0) AS inserted` idiom (Pitfall 6) to detect conflict atomically.

**Pattern divergence (do NOT replicate):**
- notify-renovacao does NOT escape strings (Slack does it server-side). For HTML templates, MUST escape (`escapeHtml`) — see RESEARCH §Security `escapeHtml` snippet.
- notify-renovacao module-level `const supabase = createClient(...)` — helper takes `supabase` as param so caller passes already-instantiated client.

---

### `supabase/functions/_shared/templates/{tarefa,cadencia,renovacao,indicacao}.html` (template, new)

**Closest analog:** `supabase/functions/notify-indicacao/slack.ts::buildIndicacaoBlocks` (structured-block builder — same _semantic_ purpose: header + fields + CTA, just different output format).

**Reference block structure** (notify-indicacao/slack.ts:19–60) for what to put in each template:
- Header (`indicanteHeader` analog → email subject + H1)
- Field group (indicado fields → entity facts)
- Indicante info → footer "sent because..."
- CTA button → `Abrir no CRM` linking to `${APP_URL}/{entity_route}/{id}`

**Render helper** (RESEARCH.md:1073–1089):
```typescript
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!))
}
export function renderTarefa(vars: { nomeAtribuido: string; tituloTarefa: string; deepLink: string; gerenciarPrefsLink: string }): string {
  return tarefaTemplate
    .replaceAll('{{nomeAtribuido}}', escapeHtml(vars.nomeAtribuido))
    .replaceAll('{{tituloTarefa}}', escapeHtml(vars.tituloTarefa))
    .replaceAll('{{deepLink}}', vars.deepLink)  // URL — não escape
    .replaceAll('{{gerenciarPrefsLink}}', vars.gerenciarPrefsLink)
}
```

**Pattern divergence:** there is no prior HTML template pattern in this codebase. The 4 templates are net-new; follow the layout/copy spec in CONTEXT D-22 (header + título + corpo + CTA + footer; PT-BR; cor `--primary`).

---

### `supabase/functions/resend-webhook/index.ts` (edge function, new)

**Composite analogs:**
- `supabase/functions/slack-commands/index.ts` (HMAC signature verification with replay protection)
- `supabase/functions/notify-renovacao/index.ts` (handler shape: auth check → JSON parse → DB UPDATE → return JSON)

**Signature verification pattern** (slack-commands:84–115) — mirror for Resend/Svix HMAC:
```typescript
async function hmacHex(key: string, msg: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key)
  const msgBytes = new TextEncoder().encode(msg)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes)
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySlackSignature(req: Request, rawBody: string): Promise<boolean> {
  // ...
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - tsNum) > 60 * 5) return false  // 5-minute replay window
  const baseString = `v0:${ts}:${rawBody}`
  const expected = `v0=${await hmacHex(SLACK_SIGNING_SECRET, baseString)}`
  return constantTimeEqual(expected, sig)
}
```

**Resend/Svix divergence:**
- Base string is `${svixId}.${svixTimestamp}.${body}` (not `v0:${ts}:${body}`).
- Secret format `whsec_xxx` — must strip `whsec_` prefix and **base64-decode** the remainder before HMAC (Svix encodes the secret in base64). See RESEARCH Q2:249–278.
- Multiple signatures supported (`"v1,sig1 v1,sig2"`); iterate and return true on any constant-time match.

**Handler skeleton** (notify-renovacao:162–232):
```typescript
serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
  // verify signature instead of constantTimeAuthCheck
  // parse JSON payload
  // UPDATE notificacoes_envios SET status=$1, delivered_at=$2 WHERE resend_id = payload.data.email_id
  return json({ ok: true })
})
```

**Status-monotonic UPDATE** (RESEARCH Pitfall 2): apply `STATUS_RANK` ordering so `opened` is not regressed by a late-arriving `delivered`.

---

### `src/components/me/NotificacoesPanel.tsx` (feature component)

**Analog:** `src/components/me/PerfilPanel.tsx` (panel-in-MeEspaco shell; same `bg-card rounded-2xl border p-6` framing).

**Panel shell pattern** (PerfilPanel.tsx:75–144):
```typescript
export function NotificacoesPanel() {
  const { data: perfil, isLoading } = useMeuPerfil()
  const { data: prefs } = usePreferenciasNotif(perfil?.id)
  const salvar = useSalvarPrefs()

  if (isLoading) return <div className="text-center py-16 text-fg4">Carregando...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-card rounded-2xl border p-6">
        {/* matriz 4x2 com Switch */}
      </div>
    </div>
  )
}
```

**Toast pattern** (PerfilPanel.tsx:38–47):
```typescript
async function handleSave() {
  try {
    await salvar.mutateAsync(...)
    toast.success('Preferências salvas!')
  } catch {
    toast.error('Erro ao salvar preferências')
  }
}
```

**Pattern divergence:** PerfilPanel uses inline state per field + manual `<input className="form-control" />`. NotificacoesPanel should use the matrix-as-single-object approach (R5 mitigation: single PATCH atomic write) and `@/components/ui/switch`. No `react-hook-form` needed for 8 switches.

---

### `src/pages/NotificacoesHistoricoPage.tsx` (page)

**Analog:** `src/pages/AuditoriaPage.tsx` (list of audit events + role-gated action button).

**List + role-gated action pattern** (AuditoriaPage.tsx:19–66):
```typescript
export function NotificacoesHistoricoPage() {
  const { data: envios, isLoading } = useNotificacoesEnvios(filtroPerfilId)
  const reenviar = useReenviarNotificacao()
  const { isCoordenadorOrAcima } = useCurrentRole()

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground mb-6">Histórico de notificações</h1>

      {/* Coord+ only: dropdown "Filtrar por usuário" */}
      {isCoordenadorOrAcima && <PerfilFilterDropdown ... />}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Últimos 30 dias ({envios?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {envios?.map(env => (
              <div key={env.id} className="flex items-center gap-4 px-5 py-3">
                {/* ... row content ... */}
                <Button variant="ghost" disabled={reenviar.isPending}
                        onClick={() => reenviar.mutate(env.id)}>
                  <RotateCcw className="w-4 h-4" /> Reenviar
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Status-color map** (AuditoriaPage.tsx:9–17) — mirror with notification statuses (`delivered`, `opened`, `bounced`, `dropped_quota`, etc.).

**Pattern divergence:** AuditoriaPage only shows restore button for coord+ (`{isCoordenadorOrAcima && ...}`). For "Reenviar", D-18 says "sempre visível" for all users — own row plus coord+ for others. Conditional logic on perfil_id match.

---

### `src/pages/portal/PortalPreferenciasPage.tsx` (page)

**Analog:** `src/pages/portal/PortalWalletPage.tsx` (portal page shell using `bg #00081d` palette) + `NotificacoesPanel` (matrix UI, reduced).

**Portal page conventions** (PortalWalletPage.tsx:36–50): inline-styled dark theme with `#00081d` background, `#6bd0e7` accents, `rgba(0,137,172,0.x)` borders. Do NOT use `bg-card` / `text-foreground` tokens here — Portal opts out of theme tokens.

**Reduced matrix:** D-10 says only `notif_documentos` × `email` column (Phase 7 will plug actual notifications). MVP UI is a single Switch + explanatory copy noting "ativará na Phase 7 — Documentos".

---

### `src/hooks/usePreferenciasNotif.ts` (hook)

**Analog:** `src/hooks/usePerfis.ts::useSalvarPerfil` (upsert single column + invalidate paired keys).

**Mutation + invalidate pattern** (usePerfis.ts:63–80):
```typescript
export function useSalvarPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { perfilId: string; prefs: PreferenciasNotif }) => {
      const { data, error } = await supabase
        .from('perfis')
        .update({ preferencias_notif: input.prefs })
        .eq('id', input.perfilId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.preferenciasNotif.all })
      qc.invalidateQueries({ queryKey: ['perfil-meu'] })
    },
  })
}
```

**Optional optimistic update** (useLeads.ts::useUpdateLeadStatus:85–95) if R5 mitigation requires immediate Switch toggle feedback:
```typescript
onMutate: async ({ perfilId, prefs }) => {
  await queryClient.cancelQueries({ queryKey: QUERY_KEYS.preferenciasNotif.byPerfil(perfilId) })
  const previous = queryClient.getQueryData(QUERY_KEYS.preferenciasNotif.byPerfil(perfilId))
  queryClient.setQueryData(QUERY_KEYS.preferenciasNotif.byPerfil(perfilId), prefs)
  return { previous }
},
onError: (_e, _v, ctx) => {
  if (ctx?.previous) queryClient.setQueryData(...)
  toast.error('Erro ao salvar preferências')
},
```

---

### `src/hooks/useNotificacoesEnvios.ts` (hook)

**Analog:** `src/hooks/useAuditLogs.ts::useAllAuditLogs` (limit + order desc + plain query).

**Query pattern** (useAuditLogs.ts:24–37):
```typescript
export function useNotificacoesEnvios(perfilId?: string | null) {
  return useQuery({
    queryKey: perfilId ? QUERY_KEYS.notificacoesEnvios.byPerfil(perfilId) : QUERY_KEYS.notificacoesEnvios.all,
    queryFn: async () => {
      let q = supabase
        .from('notificacoes_envios')
        .select('*')
        .gte('dia', new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10))
        .order('sent_at', { ascending: false })
        .limit(200)
      if (perfilId) q = q.eq('perfil_id', perfilId)
      const { data, error } = await q
      if (error) throw error
      return data as NotificacaoEnvio[]
    },
  })
}
```

---

### `src/hooks/useReenviarNotificacao.ts` (hook)

**Analog:** `src/hooks/useLeads.ts::useDeleteLead` (mutation calling Supabase backend + invalidate + toast with error message from server).

**Mutation pattern with `e instanceof Error` error surfacing** (useLeads.ts:118–134):
```typescript
export function useReenviarNotificacao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (notifId: string) => {
      const { data, error } = await supabase.functions.invoke('reenviar-notificacao', {
        body: { id: notifId },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notificacoesEnvios.all })
      toast.success('Notificação reenviada.')
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Erro ao reenviar notificação'),
  })
}
```

**Pattern divergence:** `useDeleteLead` uses `supabase.rpc(...)`. This hook uses `supabase.functions.invoke(...)` per RESEARCH §Open Questions #2 recommendation (Option A — direct edge function call, simpler than `pg_net` RPC).

---

### `src/hooks/useQuotaResend.ts` (hook)

**Analog:** `src/hooks/usePerfis.ts::useMeuPerfil` (custom staleTime) + `useAuditLogs` (RPC pattern via simple query).

**Pattern** (usePerfis.ts:35–61 for staleTime; RESEARCH Q8 for full skeleton):
```typescript
export function useQuotaResend() {
  return useQuery({
    queryKey: QUERY_KEYS.quotaResend.current,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('quota_resend_atual')
      if (error) throw error
      return data as { hoje: number; mes: number }
    },
    staleTime: 60_000,           // 1 min (CONTEXT discretion)
    refetchOnWindowFocus: false,
  })
}
```

---

### `src/components/ui/switch.tsx` (UI primitive)

**Source:** generated by `npx shadcn@latest add switch`. Do not hand-write. Family analog: `src/components/ui/tabs.tsx` (Radix-wrapped primitive with `cn()` utility).

---

### MODIFY: `supabase/functions/notify-tarefa/index.ts`

**Insert self-loop guard (D-06)** — add immediately after the `novoAtribuido` check (after line 178):
```typescript
// D-06: suprimir self-loop
if (tarefa.criado_por_id && tarefa.criado_por_id === novoAtribuido) {
  return json({ ok: true, skipped: 'self_loop' })
}
```

**Replace single `postDm` call (line 225)** with parallel dispatch:
```typescript
const prefs = await loadPrefs(supabase, novoAtribuido)
const wantSlack = prefs?.tarefa?.slack === true && slackUserId !== null
const wantEmail = prefs?.tarefa?.email === true

const [slackRes, emailRes] = await Promise.all([
  wantSlack ? postDm(SLACK_BOT_TOKEN!, slackUserId!, text, blocks) : Promise.resolve({ ok: true, skipped: 'slack_off' }),
  wantEmail ? sendEmail(supabase, { perfilId: novoAtribuido, toEmail: ..., tipo: 'tarefa', ... }) : Promise.resolve({ ok: true, skipped: 'email_off' }),
])
return json({ ok: slackRes.ok && emailRes.ok, slack: slackRes, email: emailRes })
```

Also: replace inline `findSlackUserId` / `findPerfilName` / `openDmChannel` / `postDm` / `constantTimeAuthCheck` with imports from `_shared/`.

---

### MODIFY: `supabase/functions/notify-resumo-diario/index.ts`

Mirror notify-tarefa modification but `entidade_id=null, entidade_tipo=null` (resumo is per-perfil/day, not entity-bound). Already has `payload.perfil_id` — no lookup needed.

---

### MODIFY: `supabase/functions/notify-indicacao/index.ts`

**Add per-user lookup AFTER the broadcast Slack post (preserved at line 218):**
```typescript
// After: const result = await postToSlack(blocks, fallback) [line 218]
// New: per-user companion for the lead's responsável
if (ind.lead_id) {
  const { data: lead } = await supabase
    .from('leads')
    .select('id, responsavel_id, nome')
    .eq('id', ind.lead_id)
    .maybeSingle<{ id: string; responsavel_id: string | null; nome: string }>()

  const targets = lead?.responsavel_id
    ? [lead.responsavel_id]
    : (await findDiretores(supabase)).map(d => d.id)  // D-05 fallback

  for (const perfilId of targets) {
    const prefs = await loadPrefs(supabase, perfilId)
    if (prefs?.indicacao?.email) {
      await sendEmail(supabase, {
        perfilId,
        toEmail: ...,
        tipo: 'indicacao',
        entidadeId: ind.lead_id,
        entidadeTipo: 'lead',
        ...
      })
    }
  }
}
```

Note: `notify-indicacao` does NOT use `postDm` today — it uses `postToSlack` (channel broadcast). D-01 says broadcast is preserved; per-user is the new addition.

---

### MODIFY: `supabase/functions/notify-renovacao/index.ts`

Same pattern as notify-indicacao modification. After `postToSlack` at line 216, lookup `contratos.responsavel_id` (via existing `hydrateContrato` — extend its SELECT to include `responsavel_id`) and dispatch per-user email with fallback to diretor.

---

### MODIFY: `src/pages/MeEspacoPage.tsx`

Add to `TABS` const (line 21–27):
```typescript
const TABS = [
  { id: 'visao',    label: 'Visão Geral',    icon: LayoutDashboard },
  { id: 'tarefas',  label: 'Minhas Tarefas', icon: CheckSquare    },
  { id: 'leads',    label: 'Meus Leads',     icon: Users          },
  { id: 'agenda',   label: 'Minha Agenda',   icon: Calendar       },
  { id: 'notificacoes', label: 'Notificações', icon: Bell         }, // NEW
  { id: 'perfil',   label: 'Perfil',         icon: UserCircle2    },
] as const
```

Add corresponding `<TabsContent value="notificacoes"><NotificacoesPanel /></TabsContent>` at line 114-area.

URL navigation already works via `?tab=notificacoes` (`useSearchParams` logic at lines 32–34, 45–50). Route `/me/preferencias` → use `Navigate` redirect to `/me?tab=notificacoes` (analog: router.tsx:77 has `{ path: 'perfil', element: <Navigate to="/me?tab=perfil" replace /> }`).

---

### MODIFY: `src/router.tsx`

Three additions:
- Add `{ path: 'preferencias', element: <Navigate to="/me?tab=notificacoes" replace /> }` under `/` children (mirrors line 77 perfil redirect)
- Add `{ path: 'me/preferencias', element: <Navigate to="/me?tab=notificacoes" replace /> }` (if Plan opts to keep both paths)
- Add `{ path: 'notificacoes-historico', element: <NotificacoesHistoricoPage /> }` under `/` children
- Add `{ path: 'preferencias', element: <PortalPreferenciasPage /> }` under `/portal` children (mirror PortalCatalogoPage entry at line 92)

---

### MODIFY: `src/lib/query-keys.ts`

Append to object literal (after `dashboard` at line 66):
```typescript
preferenciasNotif: {
  all: ['preferenciasNotif'] as const,
  byPerfil: (perfilId: string) => ['preferenciasNotif', perfilId] as const,
},
notificacoesEnvios: {
  all: ['notificacoesEnvios'] as const,
  byPerfil: (perfilId: string) => ['notificacoesEnvios', perfilId] as const,
},
quotaResend: {
  current: ['quotaResend', 'current'] as const,
},
```

Mirror style: lowercase camelCase top-level, nested objects with `as const` literal arrays. See `audit_logs` and `tarefas` (lines 36–51) for the multi-key sub-object pattern.

---

### MODIFY: `src/types/index.ts`

Append (style mirrors lines 1–80):
```typescript
export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'
export type CanalNotif = 'email' | 'slack'
export type StatusNotif =
  | 'queued' | 'delivered' | 'opened'
  | 'bounced' | 'complained'
  | 'dropped_quota' | 'skipped_no_recipient' | 'fallback_diretor' | 'failed'

export interface PreferenciasNotif {
  tarefa:    { slack: boolean; email: boolean }
  cadencia:  { slack: boolean; email: boolean }
  renovacao: { slack: boolean; email: boolean }
  indicacao: { slack: boolean; email: boolean }
}

export interface NotificacaoEnvio {
  id: string
  perfil_id: string
  tipo: TipoNotif
  entidade_id: string | null
  entidade_tipo: 'lead' | 'cliente' | 'contrato' | 'tarefa' | null
  canal: CanalNotif
  subject: string | null
  status: StatusNotif
  resend_id: string | null
  slack_ts: string | null
  error_msg: string | null
  sent_at: string
  delivered_at: string | null
  opened_at: string | null
  bounced_at: string | null
  complained_at: string | null
  reenviado_por_id: string | null
  reenviado_em: string | null
  dia: string
}
```

Style notes (per types/index.ts:1–80): `interface` for object shapes, `type` for unions, snake_case for DB-mirroring fields, `| null` for nullable columns (never `?`).

---

### MODIFY: `src/pages/portal/PortalLayout.tsx`

Append to `NAV` const (line 14–19):
```typescript
const NAV = [
  { to: '/portal',              label: 'Carteira',     icon: Wallet,        end: true },
  { to: '/portal/indicar',      label: 'Indicar',      icon: UserPlus       },
  { to: '/portal/catalogo',     label: 'Catálogo',     icon: Gift           },
  { to: '/portal/historico',    label: 'Histórico',    icon: ClipboardList  },
  { to: '/portal/preferencias', label: 'Preferências', icon: BellRing       }, // NEW
]
```

---

## Shared Patterns

### Edge Function Bootstrap

**Source:** `notify-tarefa/index.ts:14–57` (all 4 functions identical except secret names)

**Apply to:** every new + modified Deno function (resend-webhook, all 4 notify-*).

```typescript
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { constantTimeAuthCheck } from '../_shared/auth.ts'  // NEW: from shared

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')
const WEBHOOK_SECRET  = Deno.env.get('WEBHOOK_TAREFA_SECRET')
const APP_URL         = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
```

### Edge Function Auth Check (entry of every `serve` handler)

**Source:** identical at notify-tarefa:142–150, notify-indicacao:163–171, notify-renovacao:162–170, notify-resumo-diario:147–157

```typescript
serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
  if (WEBHOOK_SECRET) {
    const auth = req.headers.get('Authorization') ?? ''
    if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }
  }
  // ... env checks, JSON parse, business logic
})
```

### TanStack Query Mutation + Toast PT-BR

**Source:** `useLeads.ts::useCreateLead:22–50`

**Apply to:** all new hooks (usePreferenciasNotif, useReenviarNotificacao).

```typescript
return useMutation({
  mutationFn: async (input) => { /* supabase call */ },
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.xxx.all })
    toast.success('Ação realizada com sucesso!')
  },
  onError: (e: unknown) =>
    toast.error(e instanceof Error ? e.message : 'Erro ao realizar ação'),
})
```

### Role-Gated UI

**Source:** `src/components/shared/RequireRole.tsx` + `useCurrentRole().isCoordenadorOrAcima`

**Apply to:** quota warning banner (`/adocao`, `/configuracoes`), "Filtrar por usuário" dropdown in NotificacoesHistoricoPage, "Reenviar" button for others' rows.

```typescript
import { useCurrentRole } from '@/hooks/useCurrentRole'
const { isCoordenadorOrAcima } = useCurrentRole()
{isCoordenadorOrAcima && <QuotaBanner />}

// OR wrap whole sub-trees:
import { RequireRole } from '@/components/shared/RequireRole'
<RequireRole atLeast="coordenador">
  <PerfilFilterDropdown />
</RequireRole>
```

### Migration RLS Helpers Already Present

**Source:** declared in 021, 027, 029 — call (do not redefine):
- `public.is_interno()` — true for `tipo='interno'`
- `public.is_diretor()` — true for `role='diretor'`
- `public.is_at_least(role text)` — hierarchical check (D-11)
- `public.can_see_perfil(target_id)` — gestor hierarchy
- `public.can_see_responsavel(target_id)` — `is_diretor() OR target IS NULL OR target = auth.uid() OR can_see_perfil(target)`

### Idempotent Insert Pattern (Postgres)

**Source:** `notify-renovacao/index.ts:188–201` (regex fallback) + Pitfall 6 atomic upgrade

Atomic version (preferred for new code):
```typescript
const { data, error } = await supabase
  .from('notificacoes_envios')
  .insert({ ...row })
  .select('id')
  .single()

if (error?.code === '23505') {
  // unique_violation — idempotent skip
  return { ok: true, status: 'skipped_idempotent' }
}
```

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `supabase/functions/_shared/templates/*.html` | HTML email templates | No prior HTML template files exist in the codebase. notify-indicacao/slack.ts uses structured JSON blocks (Slack Block Kit), not HTML. Pattern is net-new per D-22 — follow RESEARCH §Code Examples + Security `escapeHtml`. |

Note: the Resend webhook HMAC verification (`supabase/functions/resend-webhook/`) has a **role-match analog** in `slack-commands/index.ts` (HMAC + replay window) — the algorithm shape is identical even though the exact base-string format and secret encoding differ. Use slack-commands as the template, swap base-string formula and add base64 secret decoding.

## Metadata

**Analog search scope:**
- `supabase/migrations/*.sql` (32 files: 001–034)
- `supabase/functions/**/index.ts` (6 functions)
- `src/components/ui/*.tsx` (16 primitives)
- `src/components/me/*.tsx` (5 panels)
- `src/components/shared/*.tsx` (RequireRole, ScopeToggle, etc.)
- `src/hooks/use*.ts` (24 hooks)
- `src/pages/*.tsx` (focused reads: MeEspacoPage, AuditoriaPage)
- `src/pages/portal/*.tsx` (5 portal pages)
- `src/router.tsx`, `src/lib/query-keys.ts`, `src/types/index.ts`

**Pattern extraction date:** 2026-05-27
