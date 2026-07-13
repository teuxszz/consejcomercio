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
import { sendPush } from '../_shared/push.ts'
import { renderTarefa } from '../_shared/templates/render.ts'
import { postDm } from '../_shared/slack.ts'

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

// ─── Slack DM helpers extraídos para ../_shared/slack.ts (Plan 5-02) ────────

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

  // Fail-closed (audit 040): esta função roda com service_role e é deployada
  // com --no-verify-jwt; o HMAC é a ÚNICA fronteira. Se o secret não estiver
  // configurado, RECUSA o request em vez de seguir sem auth.
  if (!WEBHOOK_SECRET) {
    return json({ ok: false, error: 'server misconfigured: webhook secret not set' }, 500)
  }
  const auth = req.headers.get('Authorization') ?? ''
  if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
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

  // ─── Decisão Push (Phase 6 D-03 + D-05 helper) ─────────────────────────────
  // Push NÃO usa fallback diretor (Open Question 2 RESEARCH §5):
  //   - diretores podem não ter PWA instalado → drop silencioso é OK
  //   - spam de notif p/ liderança a cada tarefa órfã é UX ruim
  //   - skipped_no_subscription é resultado válido e auditável pelo SUMMARY
  const wantPush = prefs?.tarefa?.push === true && !fallbackAcionado

  const pushPayload = wantPush
    ? {
        title: `Nova tarefa: ${tarefa.titulo}`.slice(0, 50),
        body: `${criadorNome} te atribuiu uma tarefa`.slice(0, 150),
        data: { deepLink: link, tipo: 'tarefa' as const, entidadeId: tarefa.id },
      }
    : null

  const pushPromise: Promise<{ ok: boolean; skipped?: string } | Awaited<ReturnType<typeof sendPush>>> = wantPush
    ? sendPush(supabase, {
        perfilId: novoAtribuido,
        tipo: 'tarefa',
        entidadeId: tarefa.id,
        entidadeTipo: 'tarefa',
        payload: pushPayload!,
      })
    : Promise.resolve({ ok: true, skipped: 'push_off' as const })

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
        const r = await postDm(SLACK_BOT_TOKEN!, slackUserId!, text, blocks)
        if (r.ok) {
          await logSlackDelivery(novoAtribuido, 'tarefa', tarefa.id, 'tarefa', r.ts, tarefa.titulo)
        }
        return r
      })()
    : Promise.resolve({ ok: true, skipped: 'slack_off' })

  // ─── D-03 + Phase 6 Open Question 1: dispatch paralelo via allSettled ──────
  // Promise.allSettled (refactor Phase 6): falha de 1 canal NÃO aborta os outros.
  // Resilência cross-canal — Slack indisponível não impede push/email, etc.
  const settled = await Promise.allSettled([slackPromise, pushPromise, ...emailPromises])
  const [slackSettled, pushSettled, ...emailSettledArray] = settled
  const unwrap = <T,>(s: PromiseSettledResult<T>): T | { ok: false; error: string } =>
    s.status === 'fulfilled' ? s.value : { ok: false, error: String(s.reason ?? 'unknown') }
  const slackRes = unwrap(slackSettled)
  const pushRes = unwrap(pushSettled)
  const emailResArray = emailSettledArray.map(unwrap)

  return json({
    ok:
      (slackRes as { ok: boolean }).ok &&
      (pushRes as { ok: boolean }).ok &&
      emailResArray.every((e) => (e as { ok: boolean }).ok),
    slack: slackRes,
    push: pushRes,
    email: emailResArray,
    fallback_diretor: fallbackAcionado,
  })
})
