// Edge Function: notify-renovacao
// Gatilho: chamada explícita do cron Vercel em api/cron-renovacoes.ts.
// Posta um aviso no Slack quando o contrato está a N dias do vencimento.
//
// Secrets esperados:
//   SLACK_BOT_TOKEN          — xoxb-... (mesmo da slack-proxy / notify-indicacao)
//   SLACK_LEADS_CHANNEL_ID   — ID do canal de leads/renovações. Fallback: SLACK_CHANNEL_ID
//   WEBHOOK_RENOVACAO_SECRET — string do header Authorization (Bearer ...)
//   APP_URL                  — base pública do CRM
//   SUPABASE_URL             — injetado automaticamente
//   SUPABASE_SERVICE_ROLE_KEY — injetado automaticamente

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Plan 5-02: companion e-mail per-user (D-01 broadcast Slack preservado) ──
import { constantTimeAuthCheck } from '../_shared/auth.ts'
import { loadPrefs, findDiretores } from '../_shared/perfis.ts'
import { sendEmail, generateMagicLink } from '../_shared/email.ts'
import { renderRenovacao } from '../_shared/templates/render.ts'

interface RenovacaoPayload {
  contrato_id: string
  dias_antes:  number
}

const SLACK_BOT_TOKEN          = Deno.env.get('SLACK_BOT_TOKEN')
const SLACK_LEADS_CHANNEL_ID   = Deno.env.get('SLACK_LEADS_CHANNEL_ID') ?? Deno.env.get('SLACK_CHANNEL_ID')
const WEBHOOK_SECRET           = Deno.env.get('WEBHOOK_RENOVACAO_SECRET')
const APP_URL                  = Deno.env.get('APP_URL') ?? 'https://localhost:5173'
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function formatCurrencyBRL(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

interface ContratoHidratado {
  id: string
  data_fim: string | null
  valor_mensal: number | null
  valor_total:  number | null
  tipo: string
  cliente_id: string | null
  cliente_nome: string | null
  cliente_empresa: string | null
  // D-07: lê responsavel_id atual no momento do disparo (cron) — sem snapshot.
  // Se o responsável muda entre schedule e dispatch, o destinatário é o NOVO.
  responsavel_id: string | null
}

async function hydrateContrato(contratoId: string): Promise<ContratoHidratado | null> {
  const { data, error } = await supabase
    .from('contratos')
    .select('id, data_fim, valor_mensal, valor_total, tipo, cliente_id, responsavel_id, cliente:clientes(nome, empresa)')
    .eq('id', contratoId)
    .maybeSingle<{
      id: string
      data_fim: string | null
      valor_mensal: number | null
      valor_total: number | null
      tipo: string
      cliente_id: string | null
      responsavel_id: string | null
      cliente: { nome: string | null; empresa: string | null } | null
    }>()

  if (error || !data) return null

  return {
    id: data.id,
    data_fim: data.data_fim,
    valor_mensal: data.valor_mensal,
    valor_total: data.valor_total,
    tipo: data.tipo,
    cliente_id: data.cliente_id,
    cliente_nome: data.cliente?.nome ?? null,
    cliente_empresa: data.cliente?.empresa ?? null,
    responsavel_id: data.responsavel_id,
  }
}

function buildBlocks(c: ContratoHidratado, diasAntes: number, appUrl: string): unknown[] {
  const base = appUrl.replace(/\/$/, '')
  const link = `${base}/contratos`

  const urgencia =
    diasAntes <= 30 ? '🔴 Renovação urgente'
    : diasAntes <= 60 ? '🟠 Renovação próxima'
    : '🟡 Renovação em até 90 dias'

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: urgencia, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Cliente*\n${c.cliente_nome ?? '—'}` },
        { type: 'mrkdwn', text: `*Empresa*\n${c.cliente_empresa ?? '—'}` },
        { type: 'mrkdwn', text: `*Tipo*\n${c.tipo}` },
        { type: 'mrkdwn', text: `*Vencimento*\n${formatDate(c.data_fim)} (${diasAntes}d)` },
        { type: 'mrkdwn', text: `*Valor mensal*\n${formatCurrencyBRL(c.valor_mensal)}` },
        { type: 'mrkdwn', text: `*Valor total*\n${formatCurrencyBRL(c.valor_total)}` },
      ],
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Abrir CRM' }, url: link },
      ],
    },
  ]
}

async function postToSlack(blocks: unknown[], fallback: string): Promise<{ ok: boolean; ts?: string; error?: string }> {
  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: SLACK_LEADS_CHANNEL_ID,
        text: fallback,
        blocks,
        unfurl_links: false,
      }),
    })
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))
      continue
    }
    const body = await res.json() as { ok: boolean; ts?: string; error?: string }
    if (!body.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` }
    return { ok: true, ts: body.ts }
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

  if (!SLACK_BOT_TOKEN || !SLACK_LEADS_CHANNEL_ID) {
    return json({ ok: false, error: 'Slack secrets não configurados' }, 500)
  }

  let payload: RenovacaoPayload
  try {
    payload = await req.json() as RenovacaoPayload
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400)
  }

  if (!payload.contrato_id || typeof payload.dias_antes !== 'number') {
    return json({ ok: false, error: 'contrato_id e dias_antes obrigatórios' }, 400)
  }

  // Idempotência: PRIMARY KEY (contrato_id, dias_antes) bloqueia duplicação
  const { error: insertErr } = await supabase
    .from('notificacoes_renovacao_enviadas')
    .insert({
      contrato_id: payload.contrato_id,
      dias_antes:  payload.dias_antes,
      status: 'pendente',
    })

  if (insertErr) {
    if (/duplicate key|unique/i.test(insertErr.message)) {
      return json({ ok: true, skipped: 'já notificado (idempotência)' })
    }
    return json({ ok: false, error: `insert falhou: ${insertErr.message}` }, 500)
  }

  const contrato = await hydrateContrato(payload.contrato_id)
  if (!contrato) {
    await supabase
      .from('notificacoes_renovacao_enviadas')
      .update({ status: 'erro', erro_msg: 'contrato não encontrado' })
      .eq('contrato_id', payload.contrato_id)
      .eq('dias_antes', payload.dias_antes)
    return json({ ok: false, error: 'contrato não encontrado' }, 404)
  }

  const blocks = buildBlocks(contrato, payload.dias_antes, APP_URL)
  const fallback = `Renovação em ${payload.dias_antes}d — ${contrato.cliente_nome ?? 'cliente'}`

  const result = await postToSlack(blocks, fallback)

  if (!result.ok) {
    await supabase
      .from('notificacoes_renovacao_enviadas')
      .update({ status: 'erro', erro_msg: result.error ?? 'unknown' })
      .eq('contrato_id', payload.contrato_id)
      .eq('dias_antes', payload.dias_antes)
    return json({ ok: false, error: result.error }, 502)
  }

  await supabase
    .from('notificacoes_renovacao_enviadas')
    .update({ status: 'enviado', slack_ts: result.ts })
    .eq('contrato_id', payload.contrato_id)
    .eq('dias_antes', payload.dias_antes)

  // ─── Plan 5-02: companion e-mail per-user (D-01 broadcast preservado) ──────
  const emailResults = await dispatchEmailRenovacao(contrato, payload.dias_antes).catch((e) => ({
    error: e instanceof Error ? e.message : String(e),
  }))

  return json({ ok: true, ts: result.ts, email: emailResults })
})

// ─── Plan 5-02: dispatch per-user de e-mail para renovação ───────────────────
// Lê contrato.responsavel_id JÁ HIDRATADO no momento do disparo (D-07).
// Fallback p/ diretores se NULL (D-05). Prefs.renovacao.email gate.
async function dispatchEmailRenovacao(
  contrato: ContratoHidratado,
  diasAntes: number,
): Promise<{ targets: number; sent: number; skipped: number; fallback: boolean }> {
  const fallback = !contrato.responsavel_id
  const targetIds: string[] = fallback
    ? (await findDiretores(supabase)).map((d) => d.id)
    : [contrato.responsavel_id!]

  let sent = 0
  let skipped = 0

  for (const perfilId of targetIds) {
    const { data: perfil } = await supabase
      .from('perfis')
      .select('email, nome')
      .eq('id', perfilId)
      .maybeSingle<{ email: string | null; nome: string | null }>()

    if (!perfil?.email) {
      skipped++
      continue
    }

    const prefs = await loadPrefs(supabase, perfilId)
    if (!prefs?.renovacao?.email) {
      skipped++
      continue
    }

    const valorBRL =
      contrato.valor_total != null
        ? contrato.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : contrato.valor_mensal != null
          ? `${contrato.valor_mensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`
          : '—'

    const deepLink = contrato.cliente_id
      ? `${APP_URL.replace(/\/$/, '')}/clientes/${contrato.cliente_id}`
      : `${APP_URL.replace(/\/$/, '')}/contratos`

    const magicLink = await generateMagicLink(supabase, perfil.email, '/me?tab=notificacoes')
    const html = renderRenovacao({
      nomeResponsavel: perfil.nome ?? 'Consultor',
      nomeCliente: contrato.cliente_nome ?? contrato.cliente_empresa ?? '(cliente)',
      diasAteRenovacao: diasAntes,
      valorContrato: valorBRL,
      deepLink,
      gerenciarPrefsLink: magicLink,
    })

    const r = await sendEmail(supabase, {
      perfilId,
      toEmail: perfil.email,
      tipo: 'renovacao',
      entidadeId: contrato.id,
      entidadeTipo: 'contrato',
      subject: `Renovação em ${diasAntes} dia(s): ${contrato.cliente_nome ?? '(cliente)'}`,
      html,
    })
    if (r.ok) sent++
    else skipped++
  }

  return { targets: targetIds.length, sent, skipped, fallback }
}
