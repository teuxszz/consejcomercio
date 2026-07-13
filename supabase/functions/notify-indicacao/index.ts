// Edge Function: notify-indicacao
// Gatilho: Supabase Database Webhook em INSERT de `indicacoes`.
// Posta uma mensagem no Slack com os dados do lead indicado e de quem indicou.
//
// Secrets esperados:
//   SLACK_BOT_TOKEN          — xoxb-... (mesmo da slack-proxy / handoff)
//   SLACK_LEADS_CHANNEL_ID   — ID do canal de leads (ex.: C0XXXXXX). Fallback: SLACK_CHANNEL_ID
//   WEBHOOK_INDICACAO_SECRET — string do header Authorization do Database Webhook
//   APP_URL                  — base pública do CRM
//   SUPABASE_URL             — injetado automaticamente
//   SUPABASE_SERVICE_ROLE_KEY — injetado automaticamente

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { HydratedIndicacao, IndicacaoRow, WebhookPayload } from './types.ts'
import { buildIndicacaoBlocks, buildIndicacaoFallbackText } from './slack.ts'

// ─── Plan 5-02: companion e-mail per-user (D-01 broadcast Slack preservado) ──
import { constantTimeAuthCheck } from '../_shared/auth.ts'
import { loadPrefs, findDiretores } from '../_shared/perfis.ts'
import { sendEmail, generateMagicLink } from '../_shared/email.ts'
import { sendPush } from '../_shared/push.ts'
import { renderIndicacao } from '../_shared/templates/render.ts'

const SLACK_BOT_TOKEN          = Deno.env.get('SLACK_BOT_TOKEN')
const SLACK_LEADS_CHANNEL_ID   = Deno.env.get('SLACK_LEADS_CHANNEL_ID') ?? Deno.env.get('SLACK_CHANNEL_ID')
const WEBHOOK_SECRET           = Deno.env.get('WEBHOOK_INDICACAO_SECRET')
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

function extrairSegmento(notas: string | null): string | null {
  if (!notas) return null
  const match = notas.match(/Segmento:\s*(.+?)(\n|$)/i)
  return match ? match[1].trim() : null
}

async function hydrateIndicacao(ind: IndicacaoRow): Promise<HydratedIndicacao> {
  let indicante_tipo: HydratedIndicacao['indicante_tipo'] = 'desconhecida'
  let indicante_nome: string | null = null
  let indicante_email: string | null = null
  let indicante_empresa: string | null = null
  let indicante_telefone: string | null = null
  let portal_perfil_nome: string | null = null
  let portal_tokens_creditados: number | null = null

  if (ind.indicante_cliente_id) {
    indicante_tipo = 'cliente'
    const { data: cliente } = await supabase
      .from('clientes')
      .select('nome, email, empresa, telefone, contato_principal')
      .eq('id', ind.indicante_cliente_id)
      .maybeSingle()
    if (cliente) {
      indicante_nome     = (cliente as { contato_principal?: string }).contato_principal ?? (cliente as { nome?: string }).nome ?? null
      indicante_email    = (cliente as { email?: string }).email ?? null
      indicante_empresa  = (cliente as { empresa?: string }).empresa ?? (cliente as { nome?: string }).nome ?? null
      indicante_telefone = (cliente as { telefone?: string }).telefone ?? null
    }

    // Se houver perfil portal vinculado, busca o crédito feito para essa indicação
    const { data: perfil } = await supabase
      .from('perfis')
      .select('id, nome')
      .eq('cliente_id', ind.indicante_cliente_id)
      .eq('tipo', 'cliente')
      .maybeSingle()

    if (perfil) {
      portal_perfil_nome = (perfil as { nome?: string }).nome ?? null
      const { data: tx } = await supabase
        .from('token_transacoes')
        .select('valor')
        .eq('referencia_id', ind.id)
        .eq('motivo', 'indicacao')
        .eq('tipo', 'credito')
        .maybeSingle()
      if (tx) portal_tokens_creditados = (tx as { valor?: number }).valor ?? null
    }
  } else if (ind.indicante_parceiro_id) {
    indicante_tipo = 'parceiro'
    const { data: parceiro } = await supabase
      .from('parceiros')
      .select('nome, email, telefone, organizacao')
      .eq('id', ind.indicante_parceiro_id)
      .maybeSingle()
    if (parceiro) {
      indicante_nome     = (parceiro as { nome?: string }).nome ?? null
      indicante_email    = (parceiro as { email?: string }).email ?? null
      indicante_empresa  = (parceiro as { organizacao?: string }).organizacao ?? null
      indicante_telefone = (parceiro as { telefone?: string }).telefone ?? null
    }
  }

  return {
    ...ind,
    indicante_tipo,
    indicante_nome,
    indicante_email,
    indicante_empresa,
    indicante_telefone,
    portal_perfil_nome,
    portal_tokens_creditados,
    segmento: extrairSegmento(ind.notas),
  }
}

async function postToSlack(blocks: unknown[], fallbackText: string): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const attempts = 3
  for (let i = 0; i < attempts; i++) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: SLACK_LEADS_CHANNEL_ID,
        text: fallbackText,
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
  return { ok: false, error: 'Slack API unavailable after retries' }
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Plan 5-02 + Phase 6 Plan 03: dispatch per-user de e-mail + push ─────────
// Olha o lead vinculado (responsavel_id atual — sem snapshot, D-07 spirit) e
// dispara sendEmail + sendPush em paralelo via Promise.allSettled (Open Question 1)
// para o responsável (ou fallback p/ diretores, D-05) se prefs.indicacao.{email,push}=true.
// NOTA: push NÃO usa fallback diretor (Open Question 2 Phase 6) — diretor pode
// não ter PWA instalado; silent miss aceitável. Apenas email faz fallback.
async function dispatchEmailIndicacao(
  ind: IndicacaoRow,
  hydrated: HydratedIndicacao,
): Promise<{
  targets: number
  sent: number
  skipped: number
  fallback: boolean
  push_sent: number
  push_skipped: number
}> {
  if (!ind.lead_id) {
    return { targets: 0, sent: 0, skipped: 0, fallback: false, push_sent: 0, push_skipped: 0 }
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, responsavel_id, nome, segmento')
    .eq('id', ind.lead_id)
    .maybeSingle<{ id: string; responsavel_id: string | null; nome: string | null; segmento: string | null }>()

  if (!lead) return { targets: 0, sent: 0, skipped: 0, fallback: false, push_sent: 0, push_skipped: 0 }

  // D-02 + D-05: email per-user para responsavel_id, ou fallback p/ diretores se NULL
  const fallback = !lead.responsavel_id
  const emailTargetIds: string[] = fallback
    ? (await findDiretores(supabase)).map((d) => d.id)
    : [lead.responsavel_id!]

  // Phase 6 D-05 push: apenas responsavel_id (sem fallback diretor — Open Question 2)
  const pushTargetIds: string[] = lead.responsavel_id ? [lead.responsavel_id] : []

  let sent = 0
  let skipped = 0
  let push_sent = 0
  let push_skipped = 0

  const allTargetIds = Array.from(new Set([...emailTargetIds, ...pushTargetIds]))

  for (const perfilId of allTargetIds) {
    const { data: perfil } = await supabase
      .from('perfis')
      .select('email, nome')
      .eq('id', perfilId)
      .maybeSingle<{ email: string | null; nome: string | null }>()

    const prefs = await loadPrefs(supabase, perfilId)
    const deepLink = `${APP_URL.replace(/\/$/, '')}/indicacoes?highlight=${ind.id}`

    // ─── Email branch (mantém comportamento Phase 5) ──────────────────────────
    const wantEmail =
      emailTargetIds.includes(perfilId) && !!perfil?.email && prefs?.indicacao?.email === true
    const emailPromise = wantEmail
      ? (async () => {
          const magicLink = await generateMagicLink(supabase, perfil!.email!, '/me?tab=notificacoes')
          const html = renderIndicacao({
            nomeResponsavel: perfil!.nome ?? 'Consultor',
            nomeIndicante: hydrated.indicante_nome ?? 'Cliente',
            nomeIndicado: lead.nome ?? '(sem nome)',
            segmento: lead.segmento ?? hydrated.segmento ?? '—',
            deepLink: `${APP_URL.replace(/\/$/, '')}/leads/${lead.id}`,
            gerenciarPrefsLink: magicLink,
          })
          return sendEmail(supabase, {
            perfilId,
            toEmail: perfil!.email!,
            tipo: 'indicacao',
            entidadeId: lead.id,
            entidadeTipo: 'lead',
            subject: `Nova indicação: ${lead.nome ?? '(sem nome)'}`,
            html,
          })
        })()
      : Promise.resolve({ ok: false, skipped: 'email_off_or_no_email' } as const)

    // ─── Push branch (Phase 6 D-05 helper + D-03 toggle) ──────────────────────
    const wantPush =
      pushTargetIds.includes(perfilId) && prefs?.indicacao?.push === true
    const pushPromise = wantPush
      ? sendPush(supabase, {
          perfilId,
          tipo: 'indicacao',
          entidadeId: lead.id,
          entidadeTipo: 'lead',
          payload: {
            title: `Nova indicação`.slice(0, 50),
            body: `${lead.nome ?? '(sem nome)'} (${hydrated.indicante_nome ?? 'origem'})`.slice(0, 150),
            data: { deepLink, tipo: 'indicacao' as const, entidadeId: lead.id },
          },
        })
      : Promise.resolve({ ok: false, skipped: 'push_off_or_no_target' } as const)

    // Open Question 1 — dispatch paralelo por perfil
    const [emailSettled, pushSettled] = await Promise.allSettled([emailPromise, pushPromise])

    const emailRes = emailSettled.status === 'fulfilled' ? emailSettled.value : { ok: false }
    const pushRes = pushSettled.status === 'fulfilled' ? pushSettled.value : { ok: false }

    if ((emailRes as { ok: boolean }).ok) sent++
    else skipped++
    if ((pushRes as { ok: boolean }).ok) push_sent++
    else push_skipped++
  }

  return {
    targets: allTargetIds.length,
    sent,
    skipped,
    fallback,
    push_sent,
    push_skipped,
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  // Fail-closed (audit 040): service_role + --no-verify-jwt → HMAC é a única
  // fronteira. Sem secret configurado, recusa em vez de seguir sem auth.
  if (!WEBHOOK_SECRET) {
    return json({ ok: false, error: 'server misconfigured: webhook secret not set' }, 500)
  }
  const auth = req.headers.get('Authorization') ?? ''
  if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  if (!SLACK_BOT_TOKEN || !SLACK_LEADS_CHANNEL_ID) {
    return json({ ok: false, error: 'Slack secrets não configurados' }, 500)
  }

  let payload: WebhookPayload
  try {
    payload = await req.json() as WebhookPayload
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400)
  }

  if (payload.table !== 'indicacoes' || payload.type !== 'INSERT' || !payload.record) {
    return json({ ok: true, skipped: 'not an indicacoes INSERT' })
  }

  const ind = payload.record
  const origem: 'cliente' | 'parceiro' | 'desconhecida' =
    ind.indicante_cliente_id  ? 'cliente'  :
    ind.indicante_parceiro_id ? 'parceiro' :
    'desconhecida'

  // Idempotência: UNIQUE(indicacao_id) bloqueia duplicação
  const { error: insertErr } = await supabase
    .from('notificacoes_indicacao')
    .insert({
      indicacao_id: ind.id,
      origem,
      slack_channel: SLACK_LEADS_CHANNEL_ID,
      status: 'pendente',
      tentativas: 0,
    })

  if (insertErr) {
    if (/duplicate key|unique/i.test(insertErr.message)) {
      return json({ ok: true, skipped: 'já notificado (idempotência)' })
    }
    return json({ ok: false, error: `insert falhou: ${insertErr.message}` }, 500)
  }

  try {
    const hydrated = await hydrateIndicacao(ind)
    const blocks   = buildIndicacaoBlocks(hydrated, APP_URL)
    const fallback = buildIndicacaoFallbackText(hydrated)
    const payloadHash = await sha256Hex(JSON.stringify(blocks))

    const result = await postToSlack(blocks, fallback)

    if (!result.ok) {
      await supabase
        .from('notificacoes_indicacao')
        .update({
          status: 'erro',
          erro_mensagem: result.error ?? 'unknown',
          tentativas: 3,
          payload_hash: payloadHash,
        })
        .eq('indicacao_id', ind.id)
      return json({ ok: false, error: result.error }, 502)
    }

    await supabase
      .from('notificacoes_indicacao')
      .update({
        status: 'enviado',
        slack_ts: result.ts,
        enviado_em: new Date().toISOString(),
        tentativas: 1,
        payload_hash: payloadHash,
      })
      .eq('indicacao_id', ind.id)

    // ─── Plan 5-02 + Phase 6 Plan 03: companion email + push per-user ────────
    // Look up lead.responsavel_id; fallback to all diretores (email only — D-05).
    // Push fanout só para responsavel_id (Open Question 2 — sem fallback).
    // Promise.allSettled interno: falha de email não aborta push e vice-versa.
    const dispatchResults = await dispatchEmailIndicacao(ind, hydrated).catch((e) => ({
      error: e instanceof Error ? e.message : String(e),
    }))

    // Resposta retro-compatível: campo `email` mantido (Phase 5), `push` adicionado (Phase 6)
    const pushRes =
      'push_sent' in dispatchResults
        ? { ok: dispatchResults.push_sent > 0, sent: dispatchResults.push_sent, skipped: dispatchResults.push_skipped }
        : { ok: false, error: 'dispatch failed' }

    return json({ ok: true, ts: result.ts, email: dispatchResults, push: pushRes })
  } catch (err) {
    const message = (err as Error).message
    await supabase
      .from('notificacoes_indicacao')
      .update({ status: 'erro', erro_mensagem: message })
      .eq('indicacao_id', ind.id)
    return json({ ok: false, error: message }, 500)
  }
})
