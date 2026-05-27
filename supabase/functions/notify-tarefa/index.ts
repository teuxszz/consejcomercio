// Edge Function: notify-tarefa
// Gatilho: Supabase Database Webhook em INSERT/UPDATE de `tarefas`.
//
// Fluxo (Phase 5 Plan 1 refactor):
//   - INSERT com atribuido_a_id != NULL
//   - UPDATE em que atribuido_a_id mudou (de NULL para X ou de Y para X)
//   - SELF-LOOP guard (D-06): se criado_por_id == atribuido_a_id → skip
//   - Lookup prefs (D-08) — só dispara Slack/email conforme prefs.tarefa.*
//   - Fallback diretor (D-05): se email do destinatário é NULL, dispara para
//     todos os perfis role='diretor' com status='fallback_diretor' registrado
//   - Dispatch paralelo Slack + e-mail (D-03) via Promise.all
//   - Magic link no rodapé (D-12) via supabase.auth.admin.generateLink (Q7-a)
//
// Helpers compartilhados via ../_shared/* (auth, perfis, email, templates).
//
// Requer:
//   - perfis.slack_user_id preenchido (para Slack — migration 030)
//   - perfis.preferencias_notif (migration 035)
//   - SLACK_BOT_TOKEN, WEBHOOK_TAREFA_SECRET, APP_URL, RESEND_API_KEY

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { constantTimeAuthCheck } from '../_shared/auth.ts'
import {
  findSlackUserId,
  findPerfilNome,
  loadPrefs,
  findDiretores,
} from '../_shared/perfis.ts'
import { sendEmail, generateMagicLink } from '../_shared/email.ts'
import { renderTarefa } from '../_shared/templates/render.ts'

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
  notificar: boolean | null
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: TarefaRow | null
  old_record: TarefaRow | null
}

const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_TAREFA_SECRET')
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const PRIORIDADE_EMOJI: Record<string, string> = {
  baixa: '🟢',
  media: '🟡',
  alta: '🟠',
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

// ─── Slack DM helpers (mantidos inline nesta task — extração para
//     _shared/slack.ts fica para Plan 2 junto com refactor das outras 3
//     funções, evitando drift) ────────────────────────────────────────────────

async function openDmChannel(slackUserId: string): Promise<{ ok: boolean; channel?: string; error?: string }> {
  const res = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ users: slackUserId }),
  })
  const body = (await res.json()) as { ok: boolean; channel?: { id: string }; error?: string }
  if (!body.ok || !body.channel) return { ok: false, error: body.error ?? `HTTP ${res.status}` }
  return { ok: true, channel: body.channel.id }
}

async function postDm(
  slackUserId: string,
  text: string,
  blocks: unknown[],
): Promise<{ ok: boolean; ts?: string; error?: string }> {
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
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))
      continue
    }
    const body = (await res.json()) as { ok: boolean; ts?: string; error?: string }
    return body.ok ? { ok: true, ts: body.ts } : { ok: false, error: body.error ?? `HTTP ${res.status}` }
  }
  return { ok: false, error: 'Slack indisponível após retries' }
}

// ─── Slack delivery log (idempotente via UNIQUE partial index migração 035) ──
async function logSlackDelivery(
  perfilId: string,
  tipo: 'tarefa',
  entidadeId: string,
  entidadeTipo: 'tarefa',
  slackTs: string | undefined,
  subject: string,
) {
  const { error } = await supabase.from('notificacoes_envios').insert({
    perfil_id: perfilId,
    tipo,
    canal: 'slack',
    entidade_id: entidadeId,
    entidade_tipo: entidadeTipo,
    subject,
    slack_ts: slackTs,
    status: 'delivered',
  })
  // 23505: idempotência silenciosa (já logado hoje) — ignore
  if (error && (error as { code?: string }).code !== '23505') {
    console.error('[notify-tarefa] logSlackDelivery erro:', error.message)
  }
}

// ─── Handler principal ───────────────────────────────────────────────────────
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
    payload = (await req.json()) as WebhookPayload
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400)
  }

  if (payload.table !== 'tarefas') {
    return json({ ok: true, skipped: 'not tarefas' })
  }

  const tarefa = payload.record
  if (!tarefa) return json({ ok: true, skipped: 'no record' })

  // SEC-02: opt-out de DM Slack para tarefas de cadência automática
  if (tarefa.notificar === false) return json({ ok: true, skipped: 'notificar=false' })

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

  // ─── D-06: SELF-LOOP GUARD ─────────────────────────────────────────────────
  // Suprime DM Slack + e-mail quando o criador é o próprio atribuído.
  if (tarefa.criado_por_id && tarefa.criado_por_id === novoAtribuido) {
    return json({ ok: true, skipped: 'self_loop' })
  }

  // ─── Lookup destinatário + prefs (D-08) ────────────────────────────────────
  const { data: destinatario } = await supabase
    .from('perfis')
    .select('email, nome')
    .eq('id', novoAtribuido)
    .maybeSingle<{ email: string | null; nome: string | null }>()

  const prefs = await loadPrefs(supabase, novoAtribuido)

  // ─── D-05: FALLBACK DIRETOR ────────────────────────────────────────────────
  // Quando destinatário não tem email → e-mail vai para todos os diretores
  // com status='fallback_diretor'. Slack continua tentando para o atribuído.
  let emailTargets: Array<{ perfilId: string; email: string; prefs: Awaited<ReturnType<typeof loadPrefs>> }> = []
  let fallbackAcionado = false

  if (!destinatario?.email) {
    fallbackAcionado = true
    const diretores = await findDiretores(supabase)
    emailTargets = await Promise.all(
      diretores.map(async (d) => ({
        perfilId: d.id,
        email: d.email,
        prefs: await loadPrefs(supabase, d.id),
      })),
    )
    // Registra a tentativa de envio para o destinatário original (audit/observability)
    await supabase.from('notificacoes_envios').insert({
      perfil_id: novoAtribuido,
      tipo: 'tarefa',
      canal: 'email',
      entidade_id: tarefa.id,
      entidade_tipo: 'tarefa',
      subject: `Nova tarefa: ${tarefa.titulo}`,
      status: 'fallback_diretor',
      error_msg: 'destinatário sem email — encaminhado para diretores',
    })
  } else {
    emailTargets = [{ perfilId: novoAtribuido, email: destinatario.email, prefs }]
  }

  // ─── Slack lookup (apenas para o destinatário original — fallback diretor
  //     não dispara Slack adicional, segue D-05 escopo de e-mail) ─────────────
  const slackUserId = await findSlackUserId(supabase, novoAtribuido)
  const criadorNome = await findPerfilNome(supabase, tarefa.criado_por_id)
  const emoji = PRIORIDADE_EMOJI[tarefa.prioridade] ?? '⚪'

  const link =
    tarefa.entidade_tipo && tarefa.entidade_id
      ? `${APP_URL}/${tarefa.entidade_tipo === 'lead' ? 'leads' : tarefa.entidade_tipo === 'cliente' ? 'clientes' : tarefa.entidade_tipo}/${tarefa.entidade_id}`
      : `${APP_URL}/tarefas?highlight=${tarefa.id}`

  // ─── Decisão Slack (apenas se há slackUserId + prefs.tarefa.slack=true) ────
  const wantSlack = prefs?.tarefa?.slack === true && slackUserId !== null && !fallbackAcionado

  // ─── Envia e-mails (parallel sobre emailTargets) ───────────────────────────
  const emailPromises = emailTargets.map(async (t) => {
    const wantEmail = t.prefs?.tarefa?.email === true
    if (!wantEmail) return { ok: true, skipped: 'email_off' as const, perfilId: t.perfilId }

    const nomeAtribuido = await findPerfilNome(supabase, t.perfilId)
    const magicLink = await generateMagicLink(supabase, t.email, '/me?tab=notificacoes')
    const html = renderTarefa({
      nomeAtribuido,
      tituloTarefa: tarefa.titulo,
      deepLink: link,
      gerenciarPrefsLink: magicLink,
    })
    return sendEmail(supabase, {
      perfilId: t.perfilId,
      toEmail: t.email,
      tipo: 'tarefa',
      entidadeId: tarefa.id,
      entidadeTipo: 'tarefa',
      subject: `Nova tarefa: ${tarefa.titulo}`,
      html,
    })
  })

  // ─── Slack DM (uma chamada — só se wantSlack) ──────────────────────────────
  const slackPromise: Promise<{ ok: boolean; ts?: string; error?: string; skipped?: string }> = wantSlack
    ? (async () => {
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
            elements: [{ type: 'button', text: { type: 'plain_text', text: 'Abrir no CRM' }, url: link }],
          },
        ]
        const r = await postDm(slackUserId!, text, blocks)
        if (r.ok) {
          await logSlackDelivery(novoAtribuido, 'tarefa', tarefa.id, 'tarefa', r.ts, tarefa.titulo)
        }
        return r
      })()
    : Promise.resolve({ ok: true, skipped: 'slack_off' })

  // ─── D-03: dispatch paralelo ───────────────────────────────────────────────
  const [slackRes, ...emailResArray] = await Promise.all([slackPromise, ...emailPromises])

  return json({
    ok: slackRes.ok && emailResArray.every((e) => (e as { ok: boolean }).ok),
    slack: slackRes,
    email: emailResArray,
    fallback_diretor: fallbackAcionado,
  })
})
