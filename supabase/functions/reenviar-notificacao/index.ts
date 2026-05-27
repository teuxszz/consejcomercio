// Edge function: reenviar-notificacao (Plan 05-03, Task 4 / D-18 / Open Q#2 Opção A)
//
// Chamada pelo browser via `supabase.functions.invoke('reenviar-notificacao', { body: { id } })`.
// Cliente envia automaticamente o JWT do usuário no Authorization header.
//
// Fluxo:
//   1. Auth: cria supabaseUser COM o JWT do usuário → RLS valida quem pode SELECT a notif
//      original. Consultor só vê próprias; coord+ vê todas (migration 035).
//   2. SELECT original via supabaseUser — se RLS bloqueia, 404.
//   3. Lookup email/nome do destinatário original via supabaseAdmin.
//   4. Renderiza HTML genérico mínimo (re-render fiel ao template original é
//      nice-to-have v2; MVP usa subject original + link para o histórico no CRM).
//   5. INSERT nova linha em notificacoes_envios com reenviado_por_id = user.id
//      e reenviado_em = now() — índice parcial UNIQUE WHERE reenviado_por_id IS NULL
//      libera essa inserção (R8).
//   6. POST Resend API direto (NÃO usar sendEmail() porque ele faz INSERT idempotente
//      próprio que conflitaria com o INSERT do passo 5). Sucesso → UPDATE resend_id.
//      Falha → UPDATE status=failed + error_msg.
//   7. Return { ok, newId, resendId? }.
//
// Segurança: RESEND_API_KEY nunca vai pra resposta ou error_msg (R6).
//
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node — Deno runtime resolve em prod)
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Env vars ────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')

const FROM = 'CONSEJ <onboarding@resend.dev>' // D-24
const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface NotifEnvio {
  id: string
  perfil_id: string
  tipo: 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao'
  entidade_id: string | null
  entidade_tipo: 'lead' | 'cliente' | 'contrato' | 'tarefa' | null
  canal: 'email' | 'slack'
  subject: string | null
}

// ─── CORS ────────────────────────────────────────────────────────────────────
// Browser chama via supabase.functions.invoke — precisa de preflight OPTIONS
// + headers em todas as respostas.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Utils ───────────────────────────────────────────────────────────────────
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  )
}

function renderResendHtml(subjectOriginal: string): string {
  const safeSubject = escapeHtml(subjectOriginal)
  const histLink = `${APP_URL}/me/notificacoes-historico`
  const prefsLink = `${APP_URL}/me?tab=notificacoes`
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;color:#0b1929;background:#f5f7fa;padding:24px;">
  <div style="max-width:540px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0089ac;color:#fff;padding:16px 20px;">
      <strong style="font-size:14px;">CONSEJ — Reenvio de notificação</strong>
    </div>
    <div style="padding:20px;">
      <p style="margin:0 0 10px;font-size:14px;color:#475569;">Você está recebendo este reenvio da notificação original:</p>
      <p style="margin:0 0 18px;font-size:16px;font-weight:600;">${safeSubject}</p>
      <p style="margin:0 0 18px;">
        <a href="${histLink}" style="display:inline-block;background:#0089ac;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;">Abrir no CRM</a>
      </p>
      <p style="margin:0;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:14px;">
        <a href="${prefsLink}" style="color:#0089ac;text-decoration:none;">Gerenciar preferências de notificação</a>
      </p>
    </div>
  </div>
</body></html>`
}

// ─── Handler ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method not allowed' }, 405)
  }

  // 1. Auth — cria client com JWT do usuário pra RLS aplicar no SELECT inicial
  const authHeader = req.headers.get('Authorization') ?? ''
  const userJwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!userJwt) {
    return json({ ok: false, error: 'not authenticated' }, 401)
  }

  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  })

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ ok: false, error: 'not authenticated' }, 401)
  }
  const user = userData.user

  // 2. Parse body
  let body: { id?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid JSON body' }, 400)
  }
  if (!body.id) {
    return json({ ok: false, error: 'missing id' }, 400)
  }

  // 3. SELECT original via supabaseUser (RLS gate)
  const { data: original, error: selErr } = await supabaseUser
    .from('notificacoes_envios')
    .select('id, perfil_id, tipo, entidade_id, entidade_tipo, canal, subject')
    .eq('id', body.id)
    .maybeSingle<NotifEnvio>()

  if (selErr || !original) {
    return json(
      { ok: false, error: 'notificação não encontrada ou sem permissão' },
      404,
    )
  }

  // 4. Lookup destinatário via supabaseAdmin
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const { data: perfilDest } = await supabaseAdmin
    .from('perfis')
    .select('email, nome')
    .eq('id', original.perfil_id)
    .maybeSingle<{ email: string | null; nome: string | null }>()

  if (!perfilDest?.email) {
    return json({ ok: false, error: 'destinatário sem e-mail cadastrado' }, 400)
  }

  // 5. INSERT nova linha de reenvio
  const subject = original.subject ?? '(reenvio sem assunto)'
  const html = renderResendHtml(subject)

  const { data: newRow, error: insErr } = await supabaseAdmin
    .from('notificacoes_envios')
    .insert({
      perfil_id: original.perfil_id,
      tipo: original.tipo,
      entidade_id: original.entidade_id,
      entidade_tipo: original.entidade_tipo,
      canal: 'email',
      subject,
      status: 'queued',
      reenviado_por_id: user.id,
      reenviado_em: new Date().toISOString(),
    })
    .select('id')
    .single<{ id: string }>()

  if (insErr || !newRow?.id) {
    return json(
      { ok: false, error: insErr?.message ?? 'INSERT do reenvio falhou' },
      500,
    )
  }
  const newId = newRow.id

  // 6. POST Resend (com retry 3x para 429/5xx)
  let lastErr = ''
  let resendId = ''
  for (let i = 0; i < 3; i++) {
    let res: Response
    try {
      res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM,
          to: [perfilDest.email],
          subject,
          html,
          headers: { 'X-Entity-Ref-ID': newId },
        }),
      })
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'fetch falhou'
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))
      continue
    }

    if (res.status === 429 || res.status >= 500) {
      lastErr = `HTTP ${res.status}`
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))
      continue
    }

    let resBody: { id?: string; message?: string } = {}
    try {
      resBody = await res.json()
    } catch {
      // resposta sem JSON — fallthrough
    }

    if (res.ok && resBody.id) {
      resendId = resBody.id
      lastErr = ''
      break
    }

    lastErr = resBody.message ?? `HTTP ${res.status}`
    break // 4xx (não 429) — sem retry
  }

  if (lastErr) {
    await supabaseAdmin
      .from('notificacoes_envios')
      .update({ status: 'failed', error_msg: lastErr })
      .eq('id', newId)
    return json({ ok: false, error: lastErr, newId }, 502)
  }

  await supabaseAdmin
    .from('notificacoes_envios')
    .update({ resend_id: resendId })
    .eq('id', newId)

  return json({ ok: true, newId, resendId })
})
