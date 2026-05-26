// Edge Function: notify-resumo-diario
// Gatilho: chamada explícita do pg_cron (migration 034) diariamente às 07:00 BRT (10:00 UTC).
// Posta DM no Slack do consultor com resumo de tarefas vencendo hoje + leads em cadência.
//
// Requer:
//   - perfis.slack_user_id preenchido para o destinatário (migração 030)
//   - SLACK_BOT_TOKEN
//   - WEBHOOK_RESUMO_SECRET
//   - APP_URL
//   - SUPABASE_URL             (injetado automaticamente pela plataforma)
//   - SUPABASE_SERVICE_ROLE_KEY (injetado automaticamente pela plataforma)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ResumoDiarioPayload {
  perfil_id: string
  tarefas_hoje: number
  leads_cadencia: Array<{ id: string; nome: string; d_point: number }>
}

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

const SLACK_BOT_TOKEN  = Deno.env.get('SLACK_BOT_TOKEN')
const WEBHOOK_SECRET   = Deno.env.get('WEBHOOK_RESUMO_SECRET')
const APP_URL          = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function findSlackUserId(perfilId: string): Promise<string | null> {
  const { data } = await supabase
    .from('perfis')
    .select('slack_user_id')
    .eq('id', perfilId)
    .maybeSingle<{ slack_user_id: string | null }>()
  return data?.slack_user_id ?? null
}

async function findPerfilNome(perfilId: string): Promise<string> {
  const { data } = await supabase
    .from('perfis')
    .select('nome')
    .eq('id', perfilId)
    .maybeSingle<{ nome: string }>()
  return data?.nome ?? 'consultor'
}

// Abre (ou recupera) o canal de DM com o usuário. Padrão recomendado pelo Slack
// para garantir entrega — postar direto no U... pode falhar silenciosamente.
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

async function postDm(slackUserId: string, text: string, blocks: unknown[]): Promise<{ ok: boolean; ts?: string; error?: string }> {
  // 1. Resolve o canal de DM (D...)
  const dm = await openDmChannel(slackUserId)
  if (!dm.ok || !dm.channel) {
    return { ok: false, error: `conversations.open falhou: ${dm.error}` }
  }
  // 2. Posta no canal de DM com retry exponencial (3x, backoff 500*2^i ms)
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

  // 7. Resolve slack_user_id do perfil
  const slackUserId = await findSlackUserId(payload.perfil_id)
  if (!slackUserId) {
    // Fluxo esperado para perfis sem Slack mapeado — não é erro, retorna 200
    return json({ ok: true, skipped: 'no slack_user_id' })
  }

  // 8. Resolve nome do consultor (fallback seguro caso perfil seja apagado)
  const nomeConsultor = await findPerfilNome(payload.perfil_id)

  // 9. Monta blocos Slack
  const blocks = buildResumoDiarioBlocks(nomeConsultor, payload.tarefas_hoje, payload.leads_cadencia, APP_URL)

  // 10. Envia DM
  const result = await postDm(slackUserId, 'Resumo diário CONSEJ', blocks)
  return json(result, result.ok ? 200 : 502)
})
