// Helper central de envio de e-mail via Resend.
//
// Fluxo (per RESEARCH §Code Examples + D-20):
//   1. checkQuota via RPC public.quota_resend_atual — se hoje>=100 ou
//      mes>=3000, INSERT row com status='dropped_quota' e retorna sem chamar
//      Resend (D-13 + D-14)
//   2. INSERT atômico em notificacoes_envios (.select.single) — se erro
//      23505 retorna 'skipped_idempotent' sem chamar Resend (Pitfall 6)
//   3. POST https://api.resend.com/emails com retry exponencial 3x para
//      429/5xx (500 * 2^i) — 4xx (não 429) faz break sem retry
//   4. Sucesso: UPDATE notificacoes_envios SET resend_id=body.id
//      Falha: UPDATE SET status='failed', error_msg=<msg>
//
// Idempotência: garantida pelo índice parcial UNIQUE da migration 035
// (perfil_id, tipo, canal, dia, COALESCE(entidade_id, ...)) WHERE
// reenviado_por_id IS NULL.
//
// Segurança: RESEND_API_KEY nunca aparece em error_msg ou logs (R6).
//
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node — Deno runtime resolve em prod)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Constantes (env-driven) ─────────────────────────────────────────────────
const RESEND_API_KEY = (typeof Deno !== 'undefined' ? Deno.env.get('RESEND_API_KEY') : process.env.RESEND_API_KEY) ?? ''
const FROM = 'CONSEJ <onboarding@resend.dev>' // D-24: sender sandbox até DNS pronto
const APP_URL = (
  (typeof Deno !== 'undefined' ? Deno.env.get('APP_URL') : process.env.APP_URL)
  ?? 'https://localhost:5173'
).replace(/\/$/, '')

const QUOTA_DIARIA = 100
const QUOTA_MENSAL = 3000
const RESEND_ENDPOINT = 'https://api.resend.com/emails'

// ─── Tipos exportados ────────────────────────────────────────────────────────
// Phase 7 D-16: 'documentos' adicionado para aprovação/revisão de cliente_docs
export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao' | 'documentos'
export type EntidadeTipo = 'lead' | 'cliente' | 'contrato' | 'tarefa'

export interface SendEmailParams {
  perfilId: string
  toEmail: string
  tipo: TipoNotif
  entidadeId: string | null
  entidadeTipo: EntidadeTipo | null
  subject: string
  html: string
}

export type SendEmailStatus =
  | 'queued'
  | 'dropped_quota'
  | 'failed'
  | 'skipped_idempotent'
  | 'fallback_diretor'

export interface SendEmailResult {
  ok: boolean
  status: SendEmailStatus
  resendId?: string
  errorMsg?: string
  notificacaoId?: string
}

// ─── Quota check ─────────────────────────────────────────────────────────────
export interface QuotaSnapshot {
  hoje: number
  mes: number
  estourou: boolean
}

export async function checkQuota(supabase: SupabaseClient): Promise<QuotaSnapshot> {
  const { data } = await supabase.rpc('quota_resend_atual')
  // RPC retorna TABLE(hoje int, mes int) — Supabase JS empacota como array
  const row = Array.isArray(data) ? data[0] : data
  const hoje = Number(row?.hoje ?? 0)
  const mes = Number(row?.mes ?? 0)
  return {
    hoje,
    mes,
    estourou: hoje >= QUOTA_DIARIA || mes >= QUOTA_MENSAL,
  }
}

// ─── Magic link utility (D-12) ───────────────────────────────────────────────
// Não chamado dentro de sendEmail por default — caller passa `html` já pronto
// com o deepLink + gerenciarPrefsLink. Exportado para uso opcional pelo caller
// (notify-tarefa) usar via admin.generateLink (Q7 opção a).
export async function generateMagicLink(
  supabase: SupabaseClient,
  toEmail: string,
  redirectPath: string,
): Promise<string> {
  const fallback = `${APP_URL}${redirectPath}`
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: toEmail,
      options: { redirectTo: fallback },
    })
    if (error) return fallback
    return (data?.properties?.action_link as string | undefined) ?? fallback
  } catch {
    return fallback
  }
}

// ─── Função principal ────────────────────────────────────────────────────────
export async function sendEmail(
  supabase: SupabaseClient,
  p: SendEmailParams,
): Promise<SendEmailResult> {
  // 1. Quota check
  const quota = await checkQuota(supabase)
  if (quota.estourou) {
    const { data: dropped } = await supabase
      .from('notificacoes_envios')
      .insert({
        perfil_id: p.perfilId,
        tipo: p.tipo,
        entidade_id: p.entidadeId,
        entidade_tipo: p.entidadeTipo,
        canal: 'email',
        subject: p.subject,
        status: 'dropped_quota',
      })
      .select('id')
      .single<{ id: string }>()
    return { ok: true, status: 'dropped_quota', notificacaoId: dropped?.id }
  }

  // 2. INSERT atômico (idempotência via UNIQUE partial index)
  const { data: inserted, error: insertErr } = await supabase
    .from('notificacoes_envios')
    .insert({
      perfil_id: p.perfilId,
      tipo: p.tipo,
      entidade_id: p.entidadeId,
      entidade_tipo: p.entidadeTipo,
      canal: 'email',
      subject: p.subject,
      status: 'queued',
    })
    .select('id')
    .single<{ id: string }>()

  if (insertErr) {
    // 23505: já existe linha (perfil, tipo, canal, dia, entidade) — idempotente
    if ((insertErr as { code?: string }).code === '23505') {
      return { ok: true, status: 'skipped_idempotent' }
    }
    return { ok: false, status: 'failed', errorMsg: insertErr.message ?? 'INSERT falhou' }
  }
  if (!inserted?.id) {
    return { ok: false, status: 'failed', errorMsg: 'INSERT sem id retornado' }
  }

  const notificacaoId = inserted.id

  // 3. POST Resend com retry exponencial
  let lastErr = ''
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
          to: [p.toEmail],
          subject: p.subject,
          html: p.html,
          headers: { 'X-Entity-Ref-ID': notificacaoId },
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

    // 2xx ou 4xx (não 429) — não retry
    let body: { id?: string; message?: string } = {}
    try {
      body = await res.json()
    } catch {
      // resposta sem JSON
    }

    if (res.ok && body.id) {
      await supabase
        .from('notificacoes_envios')
        .update({ resend_id: body.id })
        .eq('id', notificacaoId)
      return { ok: true, status: 'queued', resendId: body.id, notificacaoId }
    }

    lastErr = body.message ?? `HTTP ${res.status}`
    break // 4xx (não 429) — sem retry
  }

  // 4. Falha após retries
  await supabase
    .from('notificacoes_envios')
    .update({ status: 'failed', error_msg: lastErr })
    .eq('id', notificacaoId)

  return { ok: false, status: 'failed', errorMsg: lastErr, notificacaoId }
}
