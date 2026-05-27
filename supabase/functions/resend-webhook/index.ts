// Edge Function: resend-webhook
// Gatilho: Resend Dashboard envia POST a cada evento de e-mail
// (sent, delivered, opened, bounced, complained, delivery_delayed, clicked).
//
// Fluxo (per Plan 5-02 D-16, Q2, Pitfalls 2/3):
//   1. Valida assinatura Svix HMAC-SHA256 (svix-id / svix-timestamp / svix-signature)
//   2. Replay window 5 min (rejeita timestamps antigos)
//   3. Match data.email_id ↔ notificacoes_envios.resend_id
//   4. STATUS_RANK monotonic — opened (rank 2) NÃO regride para delivered (rank 1)
//   5. UPDATE idempotente — mesmo timestamp aplicado 2x = mesmo resultado (Pitfall 3)
//
// Sem tabela auxiliar de dedup: UPDATE natural é idempotente.
//
// Requer:
//   - WEBHOOK_RESEND_SECRET (formato whsec_xxx, vem do Resend Dashboard)
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injetados)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifySvixSignature, isReplayValid } from './verify.ts'

const WEBHOOK_RESEND_SECRET = Deno.env.get('WEBHOOK_RESEND_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Monotonic ordering — status só pode SUBIR (Pitfall 2).
// queued < delivered < opened. Terminal failures usam rank alto.
const STATUS_RANK: Record<string, number> = {
  queued: 0,
  delivered: 1,
  opened: 2,
  bounced: 99,
  complained: 99,
  failed: 99,
  fallback_diretor: 99,
  dropped_quota: 99,
  skipped_no_recipient: 99,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface ResendWebhookPayload {
  type: string
  created_at: string
  data: {
    email_id: string
    bounce?: { message?: string }
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  const svixId = req.headers.get('svix-id') ?? ''
  const svixTs = req.headers.get('svix-timestamp') ?? ''
  const svixSig = req.headers.get('svix-signature') ?? ''

  if (!svixId || !svixTs || !svixSig) {
    return json({ ok: false, error: 'missing svix headers' }, 401)
  }

  const body = await req.text()

  // 1. Replay window check (5 min)
  if (!isReplayValid(svixTs)) {
    return json({ ok: false, error: 'timestamp skew' }, 401)
  }

  // 2. HMAC signature check
  if (!WEBHOOK_RESEND_SECRET) {
    return json({ ok: false, error: 'WEBHOOK_RESEND_SECRET ausente' }, 500)
  }
  const sigValid = await verifySvixSignature(body, svixId, svixTs, svixSig, WEBHOOK_RESEND_SECRET)
  if (!sigValid) {
    return json({ ok: false, error: 'invalid signature' }, 401)
  }

  // 3. Parse payload
  let payload: ResendWebhookPayload
  try {
    payload = JSON.parse(body) as ResendWebhookPayload
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400)
  }

  const { type, created_at, data } = payload
  if (!data?.email_id) {
    return json({ ok: true, skipped: 'no email_id' })
  }

  // 4. Decidir status novo + colunas a atualizar
  let newStatus: string | null = null
  const updates: Record<string, unknown> = {}

  switch (type) {
    case 'email.sent':
      // equivalente a queued — ignora (já temos status='queued' do INSERT)
      return json({ ok: true, skipped: 'email.sent' })
    case 'email.delivered':
      newStatus = 'delivered'
      updates.delivered_at = created_at
      break
    case 'email.opened':
      newStatus = 'opened'
      updates.opened_at = created_at
      break
    case 'email.bounced':
      newStatus = 'bounced'
      updates.bounced_at = created_at
      updates.error_msg = data.bounce?.message ?? null
      break
    case 'email.complained':
      newStatus = 'complained'
      updates.complained_at = created_at
      break
    case 'email.delivery_delayed':
      return json({ ok: true, skipped: 'delivery_delayed' })
    case 'email.clicked':
      // MVP não rastreia clicks (sem coluna dedicada)
      return json({ ok: true, skipped: 'clicked' })
    default:
      return json({ ok: true, skipped: `unknown type: ${type}` })
  }

  // 5. Buscar row atual — STATUS_RANK monotonic enforcement
  const { data: current } = await supabase
    .from('notificacoes_envios')
    .select('id, status')
    .eq('resend_id', data.email_id)
    .maybeSingle<{ id: string; status: string }>()

  if (!current) {
    return json({ ok: true, skipped: 'unknown resend_id' })
  }

  // Só atualiza status se newStatus tem rank ESTRITAMENTE maior que atual (Pitfall 2)
  const currentRank = STATUS_RANK[current.status] ?? 0
  const newRank = STATUS_RANK[newStatus] ?? 0
  if (newRank > currentRank) {
    updates.status = newStatus
  }

  // Se status não muda E não há outros campos timestamp pra escrever, skip
  // (defensive — na prática SEMPRE escrevemos um *_at, então updates está populado)
  if (Object.keys(updates).length === 0) {
    return json({ ok: true, skipped: 'status regress prevented' })
  }

  // 6. UPDATE idempotente
  const { error } = await supabase
    .from('notificacoes_envios')
    .update(updates)
    .eq('id', current.id)

  if (error) {
    return json({ ok: false, error: error.message }, 500)
  }

  return json({ ok: true, applied: updates, type })
})
