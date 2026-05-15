// Edge Function: notify-tarefa
// Gatilho: Supabase Database Webhook em INSERT/UPDATE de `tarefas`.
//
// Posta DM no Slack do destinatário quando:
//   - INSERT com atribuido_a_id != NULL
//   - UPDATE em que atribuido_a_id mudou (de NULL para X ou de Y para X)
//
// Requer:
//   - perfis.slack_user_id preenchido para o destinatário (migração 030)
//   - SLACK_BOT_TOKEN
//   - WEBHOOK_TAREFA_SECRET
//   - APP_URL

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TarefaRow {
  id: string
  titulo: string
  descricao: string | null
  tipo: string
  prioridade: string
  status: string
  atribuido_a_id: string | null
  criado_por_id: string | null
  entidade_tipo: string | null
  entidade_id: string | null
  data_vencimento: string | null
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: TarefaRow | null
  old_record: TarefaRow | null
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

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')
const WEBHOOK_SECRET  = Deno.env.get('WEBHOOK_TAREFA_SECRET')
const APP_URL         = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const PRIORIDADE_EMOJI: Record<string, string> = {
  baixa: '🟢',
  media: '🟡',
  alta:  '🟠',
  critica: '🔴',
}

function formatDate(iso: string | null): string {
  if (!iso) return 'sem prazo'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return iso
  }
}

async function findSlackUserId(perfilId: string): Promise<string | null> {
  const { data } = await supabase
    .from('perfis')
    .select('slack_user_id')
    .eq('id', perfilId)
    .maybeSingle<{ slack_user_id: string | null }>()
  return data?.slack_user_id ?? null
}

async function findPerfilName(perfilId: string | null): Promise<string> {
  if (!perfilId) return 'Sistema'
  const { data } = await supabase
    .from('perfis')
    .select('nome')
    .eq('id', perfilId)
    .maybeSingle<{ nome: string }>()
  return data?.nome ?? 'Alguém'
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
  // 2. Posta no canal de DM
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

  let payload: WebhookPayload
  try {
    payload = await req.json() as WebhookPayload
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400)
  }

  if (payload.table !== 'tarefas') {
    return json({ ok: true, skipped: 'not tarefas' })
  }

  const tarefa = payload.record
  if (!tarefa) return json({ ok: true, skipped: 'no record' })

  // Detecta atribuição nova / mudança de atribuído
  const novoAtribuido = tarefa.atribuido_a_id
  if (!novoAtribuido) {
    return json({ ok: true, skipped: 'sem destinatário' })
  }

  if (payload.type === 'UPDATE') {
    const antigoAtribuido = payload.old_record?.atribuido_a_id ?? null
    if (antigoAtribuido === novoAtribuido) {
      return json({ ok: true, skipped: 'atribuição não mudou' })
    }
  }

  const slackUserId = await findSlackUserId(novoAtribuido)
  if (!slackUserId) {
    return json({ ok: true, skipped: 'perfil sem slack_user_id mapeado' })
  }

  const criadorNome = await findPerfilName(tarefa.criado_por_id)
  const emoji = PRIORIDADE_EMOJI[tarefa.prioridade] ?? '⚪'

  const link = tarefa.entidade_tipo && tarefa.entidade_id
    ? `${APP_URL}/${tarefa.entidade_tipo === 'lead' ? 'leads' : tarefa.entidade_tipo === 'cliente' ? 'clientes' : tarefa.entidade_tipo}/${tarefa.entidade_id}`
    : `${APP_URL}/me`

  const text = `📌 ${criadorNome} te atribuiu uma tarefa: ${tarefa.titulo}`

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📌 *Nova tarefa atribuída*\n*${tarefa.titulo}*${tarefa.descricao ? `\n${tarefa.descricao}` : ''}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Por*\n${criadorNome}` },
        { type: 'mrkdwn', text: `*Prioridade*\n${emoji} ${tarefa.prioridade}` },
        { type: 'mrkdwn', text: `*Tipo*\n${tarefa.tipo}` },
        { type: 'mrkdwn', text: `*Vencimento*\n${formatDate(tarefa.data_vencimento)}` },
      ],
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Abrir no CRM' }, url: link },
      ],
    },
  ]

  const result = await postDm(slackUserId, text, blocks)
  return json(result, result.ok ? 200 : 502)
})
