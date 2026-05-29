// Helper central de envio de notificação multi-canal para eventos de aprovação
// de documentos de cliente (Phase 7 D-09).
//
// Espelha 1:1 o pattern de _shared/email.ts + _shared/push.ts: combina os 3
// canais (Slack + Email + Push) via Promise.allSettled paralelo, respeitando
// PreferenciasNotif.documentos.{slack,email,push} (D-08).
//
// Eventos (D-07):
//   - cliente_aprovou        → consultor responsável é avisado que cliente aprovou
//   - cliente_pediu_revisao  → consultor recebe comentário do cliente
//   - cliente_subiu_doc      → consultor descobre que cliente subiu doc no portal
//   - aprovacao_stale        → cron alerta consultor sobre doc parado > N dias
//
// Idempotência: o INSERT em notificacoes_envios feito por sendEmail/sendPush
// usa o índice parcial UNIQUE da migration 035 (perfil_id, tipo='documentos',
// canal, dia, entidade_id=doc_id) — pattern Phase 5 D-21.
//
// Variante D-12 (reenviar-lembrete pro cliente, Slice 4):
//   - skipSlack=true pula o canal Slack mesmo com prefs.documentos.slack=true
//   - cliente nunca tem Slack (slack_user_id NULL), então o lembrete só faz
//     sentido em email+push. Helper força isso para evitar tentativa custosa
//     de openDm em ID inválido.
//
// Segurança (T-07-11): WEBHOOK_APROVACAO_SECRET nunca aparece em error_msg ou
// logs — espelhando email.ts:18 (RESEND_API_KEY rule).
//
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node — Deno runtime resolve em prod)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from './email.ts'
import { sendPush } from './push.ts'
import { postDm } from './slack.ts'
import { findSlackUserId, loadPrefs } from './perfis.ts'

// ─── Constantes (env-driven) ─────────────────────────────────────────────────
const SLACK_BOT_TOKEN = (typeof Deno !== 'undefined' ? Deno.env.get('SLACK_BOT_TOKEN') : process.env.SLACK_BOT_TOKEN) ?? ''
const APP_URL = (
  (typeof Deno !== 'undefined' ? Deno.env.get('APP_URL') : process.env.APP_URL)
  ?? 'https://localhost:5173'
).replace(/\/$/, '')

// ─── Tipos exportados ────────────────────────────────────────────────────────
export type EventoAprovacao =
  | 'cliente_aprovou'
  | 'cliente_pediu_revisao'
  | 'cliente_subiu_doc'
  | 'aprovacao_stale'

export interface SendNotificacaoAprovacaoParams {
  perfilId: string                  // destinatário (consultor; em D-12 = cliente)
  evento: EventoAprovacao
  docId: string
  clienteNome: string
  docNomeArquivo: string
  comentarioCliente?: string | null
  skipSlack?: boolean               // D-12: reenviar-lembrete pro cliente OFF Slack
}

export interface SendNotificacaoAprovacaoResult {
  ok: boolean
  slack: { ok: boolean; skipped?: string; error?: string; ts?: string }
  email: { ok: boolean; skipped?: string; status?: string; errorMsg?: string }
  push:  { ok: boolean; skipped?: string; status?: string; errorMsg?: string; delivered?: number; failed?: number; cleaned?: number }
}

// ─── Subject builder (PT-BR per D-09) ────────────────────────────────────────
function subjectFor(e: EventoAprovacao, clienteNome: string, docNome: string): string {
  switch (e) {
    case 'cliente_aprovou':       return `${clienteNome} aprovou ${docNome}`
    case 'cliente_pediu_revisao': return `${clienteNome} pediu revisão em ${docNome}`
    case 'cliente_subiu_doc':     return `${clienteNome} enviou ${docNome}`
    case 'aprovacao_stale':       return `Aprovação parada há +5 dias — ${docNome}`
  }
}

// ─── Body builder (HTML simples PT-BR) ───────────────────────────────────────
function bodyFor(
  e: EventoAprovacao,
  clienteNome: string,
  docNome: string,
  comentario: string | null | undefined,
  deepLink: string,
): { plain: string; html: string } {
  let plain = ''
  switch (e) {
    case 'cliente_aprovou':
      plain = `${clienteNome} aprovou o documento "${docNome}".`
      break
    case 'cliente_pediu_revisao':
      plain = `${clienteNome} pediu revisão no documento "${docNome}".`
      if (comentario && comentario.trim().length > 0) {
        plain += `\n\nComentário: ${comentario}`
      }
      break
    case 'cliente_subiu_doc':
      plain = `${clienteNome} enviou o documento "${docNome}" no portal.`
      break
    case 'aprovacao_stale':
      plain = `O documento "${docNome}" de ${clienteNome} está aguardando aprovação há mais de 5 dias.`
      break
  }
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <p style="white-space: pre-line;">${plain}</p>
      <p style="margin-top: 24px;">
        <a href="${deepLink}" style="background:#0f172a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Abrir documento</a>
      </p>
    </div>
  `.trim()
  return { plain, html }
}

// ─── Função principal ────────────────────────────────────────────────────────
export async function sendNotificacaoAprovacao(
  supabase: SupabaseClient,
  p: SendNotificacaoAprovacaoParams,
): Promise<SendNotificacaoAprovacaoResult> {
  // 1. Lookup prefs + slack + perfil em paralelo
  const [prefs, slackUserId, perfilRes] = await Promise.all([
    loadPrefs(supabase, p.perfilId),
    findSlackUserId(supabase, p.perfilId),
    supabase
      .from('perfis')
      .select('email, nome')
      .eq('id', p.perfilId)
      .maybeSingle<{ email: string | null; nome: string | null }>(),
  ])
  const perfil = perfilRes?.data ?? null

  const subject = subjectFor(p.evento, p.clienteNome, p.docNomeArquivo)
  const deepLink = `${APP_URL}/clientes/${''}docs?doc=${p.docId}` // genérico; UI resolve cliente_id no Slice 3
  const { plain, html } = bodyFor(p.evento, p.clienteNome, p.docNomeArquivo, p.comentarioCliente, deepLink)

  // 2. Decisões por canal (respeitando prefs.documentos.{slack,email,push})
  const wantSlack = !p.skipSlack
    && prefs?.documentos?.slack === true
    && !!slackUserId
    && !!SLACK_BOT_TOKEN
  const wantEmail = prefs?.documentos?.email === true && !!perfil?.email
  const wantPush  = prefs?.documentos?.push  === true

  // 3. Construir 3 promises (Slack, Email, Push)
  const slackPromise: Promise<{ ok: boolean; ts?: string; error?: string; skipped?: string }> = wantSlack
    ? (async () => {
        const text = `📄 ${subject}`
        const blocks: unknown[] = [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*${subject}*${p.comentarioCliente ? `\n\n_${p.comentarioCliente}_` : ''}` },
          },
          {
            type: 'actions',
            elements: [{ type: 'button', text: { type: 'plain_text', text: 'Abrir no CRM' }, url: deepLink }],
          },
        ]
        return postDm(SLACK_BOT_TOKEN, slackUserId!, text, blocks)
      })()
    : Promise.resolve({ ok: true, skipped: 'slack_off' })

  const emailPromise: Promise<{ ok: boolean; status?: string; skipped?: string; errorMsg?: string }> = wantEmail
    ? sendEmail(supabase, {
        perfilId: p.perfilId,
        toEmail: perfil!.email!,
        tipo: 'documentos',
        entidadeId: p.docId,
        entidadeTipo: 'cliente',
        subject,
        html,
      })
    : Promise.resolve({ ok: true, skipped: 'email_off' })

  const pushPromise: Promise<{ ok: boolean; skipped?: string; status?: string; errorMsg?: string; delivered?: number; failed?: number; cleaned?: number }> = wantPush
    ? sendPush(supabase, {
        perfilId: p.perfilId,
        tipo: 'documentos',
        entidadeId: p.docId,
        entidadeTipo: 'cliente',
        payload: {
          title: subject.slice(0, 50),
          body: plain.slice(0, 150),
          data: { deepLink, tipo: 'documentos', entidadeId: p.docId },
        },
      })
    : Promise.resolve({ ok: true, skipped: 'push_off' })

  // 4. Promise.allSettled (resiliência cross-canal)
  const settled = await Promise.allSettled([slackPromise, emailPromise, pushPromise])
  const [slackSettled, emailSettled, pushSettled] = settled
  const unwrap = <T,>(s: PromiseSettledResult<T>): T | { ok: false; error: string } =>
    s.status === 'fulfilled' ? s.value : { ok: false, error: String(s.reason ?? 'unknown') }

  const slackRes = unwrap(slackSettled) as SendNotificacaoAprovacaoResult['slack']
  const emailRes = unwrap(emailSettled) as SendNotificacaoAprovacaoResult['email']
  const pushRes  = unwrap(pushSettled)  as SendNotificacaoAprovacaoResult['push']

  return {
    ok: slackRes.ok && emailRes.ok && pushRes.ok,
    slack: slackRes,
    email: emailRes,
    push:  pushRes,
  }
}
