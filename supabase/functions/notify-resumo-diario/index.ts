// Edge Function: notify-resumo-diario
// Gatilho: chamada explícita do pg_cron (migration 034) diariamente às 07:00 BRT (10:00 UTC).
// Posta DM no Slack do consultor com resumo de tarefas vencendo hoje + leads em cadência
// E (Plan 5-02) dispara e-mail companion se prefs.cadencia.email=true.
//
// Refactor Plan 5-02:
//   - Helpers _shared/{auth,perfis,slack,email,templates} centralizados
//   - sendEmail per-user (tipo='cadencia', entidade=NULL) em paralelo a postDm
//   - magic link via generateMagicLink (Q7-a) com fallback URL direto
//   - Volume CONSEJ <30/dia (A6) — sob rate limit do generateLink (Q7/R3)
//
// Requer:
//   - perfis.slack_user_id preenchido para Slack DM (migração 030)
//   - perfis.preferencias_notif (migration 035)
//   - SLACK_BOT_TOKEN, WEBHOOK_RESUMO_SECRET, APP_URL, RESEND_API_KEY
//   - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injetados)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { constantTimeAuthCheck } from '../_shared/auth.ts'
import { findSlackUserId, findPerfilNome, loadPrefs } from '../_shared/perfis.ts'
import { postDm } from '../_shared/slack.ts'
import { sendEmail, generateMagicLink } from '../_shared/email.ts'
import { renderCadencia } from '../_shared/templates/render.ts'

interface ResumoDiarioPayload {
  perfil_id: string
  tarefas_hoje: number
  leads_cadencia: Array<{ id: string; nome: string; d_point: number }>
}

const SLACK_BOT_TOKEN  = Deno.env.get('SLACK_BOT_TOKEN')
const WEBHOOK_SECRET   = Deno.env.get('WEBHOOK_RESUMO_SECRET')
const APP_URL          = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

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

serve(async (req) => {
  // 1. Method check
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  // 2. Auth check (timing-safe Bearer comparison)
  if (WEBHOOK_SECRET) {
    const auth = req.headers.get('Authorization') ?? ''
    if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }
  }

  // 3. Env check
  if (!SLACK_BOT_TOKEN) {
    return json({ ok: false, error: 'SLACK_BOT_TOKEN ausente' }, 500)
  }

  // 4. JSON parse
  let payload: ResumoDiarioPayload
  try {
    payload = await req.json() as ResumoDiarioPayload
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400)
  }

  // 5. Payload validation
  if (!payload.perfil_id || typeof payload.tarefas_hoje !== 'number' || !Array.isArray(payload.leads_cadencia)) {
    return json({ ok: false, error: 'perfil_id, tarefas_hoje e leads_cadencia são obrigatórios' }, 400)
  }

  // 6. Curto-circuito: payload vazio (defesa em profundidade — a migration já filtra antes de chamar)
  if (payload.tarefas_hoje === 0 && payload.leads_cadencia.length === 0) {
    return json({ ok: true, skipped: 'empty payload' })
  }

  // 7. Resolve dados do perfil (Slack + email + prefs)
  const slackUserId = await findSlackUserId(supabase, payload.perfil_id)
  const prefs = await loadPrefs(supabase, payload.perfil_id)
  const { data: perfil } = await supabase
    .from('perfis')
    .select('email, nome')
    .eq('id', payload.perfil_id)
    .maybeSingle<{ email: string | null; nome: string | null }>()

  const nomeConsultor = perfil?.nome ?? (await findPerfilNome(supabase, payload.perfil_id))
  const totalTarefas = payload.tarefas_hoje
  const totalLeads = payload.leads_cadencia.length

  // 8. Decisão Slack DM
  const wantSlack = prefs?.cadencia?.slack === true && slackUserId !== null
  const slackPromise: Promise<{ ok: boolean; ts?: string; error?: string; skipped?: string }> =
    wantSlack
      ? (async () => {
          const blocks = buildResumoDiarioBlocks(nomeConsultor, totalTarefas, payload.leads_cadencia, APP_URL)
          return postDm(SLACK_BOT_TOKEN!, slackUserId!, 'Resumo diário CONSEJ', blocks)
        })()
      : Promise.resolve({ ok: true, skipped: 'slack_off' })

  // 9. Decisão e-mail
  const wantEmail = prefs?.cadencia?.email === true && !!perfil?.email
  const emailPromise: Promise<{ ok: boolean; status?: string; skipped?: string; errorMsg?: string }> =
    wantEmail
      ? (async () => {
          const magicLink = await generateMagicLink(supabase, perfil!.email!, '/me?tab=notificacoes')
          const html = renderCadencia({
            nomeConsultor,
            totalTarefas,
            totalLeads,
            deepLink: `${APP_URL}/me`,
            gerenciarPrefsLink: magicLink,
          })
          return sendEmail(supabase, {
            perfilId: payload.perfil_id,
            toEmail: perfil!.email!,
            tipo: 'cadencia',
            entidadeId: null,
            entidadeTipo: null,
            subject: `Resumo diário — ${totalTarefas} tarefa(s) hoje`,
            html,
          })
        })()
      : Promise.resolve({ ok: true, skipped: 'email_off' })

  // 10. Dispatch paralelo (D-03)
  const [slackRes, emailRes] = await Promise.all([slackPromise, emailPromise])

  return json({
    ok: slackRes.ok && emailRes.ok,
    slack: slackRes,
    email: emailRes,
  })
})
