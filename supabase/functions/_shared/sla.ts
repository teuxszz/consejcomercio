// Helper central de dispatch do motor de SLA de follow-up (Phase 999.1 Plan 03).
//
// Chamado por notify-sla-evento (edge function invocada pelo cron pg_cron do
// Plan 04, a cada ~15min). Duas transições:
//
//   evento='warning'       — faltam 2h para o deadline_at do lead_sla e o
//                             assessor ainda não registrou atividade. SEMPRE
//                             manda a DM no Slack do assessor (D-03 — ignora
//                             perfis.preferencias_notif; SLA é crítico e não
//                             pode ser silenciado por opt-in). Se o assessor
//                             conectou a Google Agenda (google_calendar_tokens
//                             tem token válido) → cria o bloco de follow-up e
//                             guarda calendar_event_id (D-05). Sem token →
//                             fallback só-Slack, sem quebrar (D-01).
//   evento='escalonamento' — o SLA venceu sem ação. Posta no canal da
//                             gerência (SLACK_GERENCIA_CHANNEL_ID). Se o
//                             secret do canal não está configurado → fail-safe
//                             (loga/pula), NUNCA fail-open (D-04 — canal é
//                             deferido, usuário ainda vai pedir o ID).
//
// Idempotência forte (Pitfall 4, T-999.1-05): o cron roda a cada 15min
// (~96x mais apertado que os crons diários existentes). Duas chamadas
// concorrentes para o mesmo lead/evento só produzem 1 envio via CAS atômico
// — o PRIMEIRO statement é sempre:
//   UPDATE lead_sla SET x_sent_at=now() WHERE lead_id=$1 AND x_sent_at IS NULL
//     AND resolved_at IS NULL RETURNING lead_id
// Se a linha não foi reivindicada (0 rows / null) → retorna 'already_sent'
// SEM tocar Slack/Calendar.
//
// Log best-effort em notificacoes_envios (tipo sla_warning/sla_escalonamento,
// migration 041 D-06) — idempotência REAL vive no CAS acima, não neste log;
// erros de INSERT (inclusive 23505) são engolidos silenciosamente aqui.
//
// Segurança (T-999.1-06): NUNCA logar SLACK_BOT_TOKEN/SLACK_GERENCIA_CHANNEL_ID
// ou tokens do Google em mensagens de erro/log.
//
// @ts-nocheck (URL imports não resolvem no TS Node — Deno runtime resolve em prod)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { postDm } from './slack.ts'
import { findSlackUserId, findPerfilNome } from './perfis.ts'
import { getValidAccessToken, createFollowupEvent } from './google-calendar.ts'

// ─── Constantes (env-driven) ─────────────────────────────────────────────────
const SLACK_BOT_TOKEN = (typeof Deno !== 'undefined' ? Deno.env.get('SLACK_BOT_TOKEN') : process.env.SLACK_BOT_TOKEN) ?? ''
const SLACK_GERENCIA_CHANNEL_ID = (typeof Deno !== 'undefined' ? Deno.env.get('SLACK_GERENCIA_CHANNEL_ID') : process.env.SLACK_GERENCIA_CHANNEL_ID) ?? ''
const APP_URL = (
  (typeof Deno !== 'undefined' ? Deno.env.get('APP_URL') : process.env.APP_URL)
  ?? 'https://localhost:5173'
).replace(/\/$/, '')

// ─── Tipos exportados ────────────────────────────────────────────────────────
export type EventoSla = 'warning' | 'escalonamento'

export interface SendNotificacaoSlaParams {
  evento: EventoSla
  leadId: string
}

export interface SlackDispatchResult {
  ok: boolean
  skipped?: string
  error?: string
  ts?: string
}

export interface CalendarDispatchResult {
  ok: boolean
  skipped?: string
  error?: string
}

export interface SendNotificacaoSlaResult {
  ok: boolean
  skipped?: 'already_sent' | 'no_gerencia_channel'
  slack?: SlackDispatchResult
  calendar?: CalendarDispatchResult
  tarefa?: { created: boolean }
}

interface LeadRow {
  id: string
  nome: string | null
  empresa: string | null
  responsavel_id: string | null
}

interface SlaRow {
  deadline_at: string
}

// ─── Log best-effort em notificacoes_envios (D-06) ───────────────────────────
async function logEnvio(
  supabase: SupabaseClient,
  tipo: 'sla_warning' | 'sla_escalonamento',
  perfilId: string | null,
  leadId: string,
  status: string,
): Promise<void> {
  // perfil_id é NOT NULL em notificacoes_envios (035). Sem responsável não há
  // como logar — pula (best-effort, nunca aborta o dispatch).
  if (!perfilId) return
  try {
    await supabase
      .from('notificacoes_envios')
      .insert({
        perfil_id: perfilId,
        tipo,
        canal: 'slack',
        entidade_tipo: 'lead',
        entidade_id: leadId,
        status,
      })
  } catch {
    // best-effort — a idempotência real é o CAS em lead_sla, não este log.
    // Erros aqui (inclusive 23505) nunca abortam o dispatch.
  }
}

// ─── postToChannel — chat.postMessage no canal da gerência ──────────────────
// Espelha postToSlack de notify-renovacao: retry exponencial 3x para 429/5xx.
async function postToChannel(text: string, blocks: unknown[]): Promise<{ ok: boolean; ts?: string; error?: string }> {
  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: SLACK_GERENCIA_CHANNEL_ID,
        text,
        blocks,
        unfurl_links: false,
      }),
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

// ─── criarTarefaFollowup — abre um item em "Minhas Tarefas" do assessor ──────
// Best-effort: um erro aqui NUNCA aborta a DM/Calendar já enviados. Guarda
// anti-duplicata: se já existe uma tarefa de follow-up ABERTA para o lead, não
// cria outra (evita empilhar a cada re-aviso). service_role bypassa a RLS.
async function criarTarefaFollowup(
  supabase: SupabaseClient,
  leadId: string,
  leadNome: string,
  empresa: string | null,
  responsavelId: string | null,
  deadlineAt: Date,
): Promise<{ created: boolean }> {
  if (!responsavelId) return { created: false }

  const { data: existente } = await supabase
    .from('tarefas')
    .select('id')
    .eq('entidade_tipo', 'lead')
    .eq('entidade_id', leadId)
    .eq('tipo', 'followup')
    .in('status', ['aberta', 'em_andamento'])
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (existente) return { created: false }

  const { error } = await supabase.from('tarefas').insert({
    titulo: `Follow-up: ${leadNome}`,
    descricao: `SLA de follow-up vencendo${empresa ? ` — ${empresa}` : ''}. Registre o próximo contato para resolver o SLA.`,
    tipo: 'followup',
    entidade_tipo: 'lead',
    entidade_id: leadId,
    atribuido_a_id: responsavelId,
    prioridade: 'alta',
    status: 'aberta',
    data_vencimento: deadlineAt.toISOString(),
  })
  return { created: !error }
}

// ─── warning: DM sempre + Calendar/fallback ──────────────────────────────────
async function sendWarning(supabase: SupabaseClient, leadId: string): Promise<SendNotificacaoSlaResult> {
  const { data: lead } = await supabase
    .from('leads')
    .select('id, nome, empresa, responsavel_id')
    .eq('id', leadId)
    .maybeSingle<LeadRow>()

  const { data: slaRow } = await supabase
    .from('lead_sla')
    .select('deadline_at')
    .eq('lead_id', leadId)
    .maybeSingle<SlaRow>()

  const leadNome = lead?.nome ?? 'Lead'
  const responsavelId = lead?.responsavel_id ?? null
  const deadlineAt = slaRow?.deadline_at ? new Date(slaRow.deadline_at) : new Date()
  const deepLink = `${APP_URL}/leads/${leadId}`

  // DM SEMPRE — D-03: não consulta preferencias_notif. Só pula se não há
  // slack_user_id cadastrado ou o bot token não está configurado.
  let slackRes: SlackDispatchResult = { ok: true, skipped: 'no_slack_user' }
  if (responsavelId) {
    const slackUserId = await findSlackUserId(supabase, responsavelId)
    if (slackUserId && SLACK_BOT_TOKEN) {
      const text = `⏰ SLA de follow-up vencendo — ${leadNome}`
      const blocks: unknown[] = [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*${text}*${lead?.empresa ? `\n${lead.empresa}` : ''}` },
        },
        {
          type: 'actions',
          elements: [{ type: 'button', text: { type: 'plain_text', text: 'Abrir no CRM' }, url: deepLink }],
        },
      ]
      slackRes = await postDm(SLACK_BOT_TOKEN, slackUserId, text, blocks)
    }
  }

  // Calendar — isolado (try/catch): erro aqui NUNCA aborta a DM já enviada.
  let calendarRes: CalendarDispatchResult = { ok: true, skipped: 'no_token' }
  if (responsavelId) {
    try {
      const token = await getValidAccessToken(supabase, responsavelId)
      if (token) {
        const eventRes = await createFollowupEvent(token, leadNome, deadlineAt, leadId, APP_URL)
        if (eventRes.ok) {
          await supabase
            .from('lead_sla')
            .update({ calendar_event_id: eventRes.eventId })
            .eq('lead_id', leadId)
          calendarRes = { ok: true }
        } else {
          calendarRes = { ok: false, error: `HTTP ${eventRes.status}` }
        }
      }
    } catch (e) {
      calendarRes = { ok: false, error: e instanceof Error ? e.message : 'erro desconhecido no Calendar' }
    }
  }

  // Tarefa no CRM — abre um item em "Minhas Tarefas" do assessor (best-effort;
  // nunca aborta a DM/Calendar já enviados).
  let tarefaRes: { created: boolean } = { created: false }
  try {
    tarefaRes = await criarTarefaFollowup(supabase, leadId, leadNome, lead?.empresa ?? null, responsavelId, deadlineAt)
  } catch {
    tarefaRes = { created: false }
  }

  await logEnvio(supabase, 'sla_warning', responsavelId, leadId, slackRes.ok ? 'queued' : 'failed')

  return { ok: slackRes.ok, slack: slackRes, calendar: calendarRes, tarefa: tarefaRes }
}

// ─── escalonamento: posta no canal da gerência, fail-safe se ausente ─────────
async function sendEscalonamento(supabase: SupabaseClient, leadId: string): Promise<SendNotificacaoSlaResult> {
  // D-04: canal é deferido — se o secret não está configurado, fail-safe
  // (loga/pula) em vez de fail-open (nunca lança exceção).
  if (!SLACK_GERENCIA_CHANNEL_ID) {
    // Sem canal configurado (D-04): fail-safe silencioso. Não logamos aqui —
    // notificacoes_envios exige perfil_id e este ramo ainda não carregou o lead.
    return { ok: true, skipped: 'no_gerencia_channel' }
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, nome, empresa, responsavel_id')
    .eq('id', leadId)
    .maybeSingle<LeadRow>()

  const { data: slaRow } = await supabase
    .from('lead_sla')
    .select('deadline_at')
    .eq('lead_id', leadId)
    .maybeSingle<SlaRow>()
  void slaRow // hidratado por completude; a mensagem de escalação não usa o deadline diretamente

  const leadNome = lead?.nome ?? 'Lead'
  const responsavelNome = await findPerfilNome(supabase, lead?.responsavel_id ?? null)
  const deepLink = `${APP_URL}/leads/${leadId}`
  const text = `🚨 SLA VENCIDO — ${leadNome} (${responsavelNome})`
  const blocks: unknown[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${text}*` } },
    {
      type: 'actions',
      elements: [{ type: 'button', text: { type: 'plain_text', text: 'Abrir no CRM' }, url: deepLink }],
    },
  ]

  const result = await postToChannel(text, blocks)
  await logEnvio(supabase, 'sla_escalonamento', lead?.responsavel_id ?? null, leadId, result.ok ? 'queued' : 'failed')

  return { ok: result.ok, slack: result }
}

// ─── Função principal ────────────────────────────────────────────────────────
export async function sendNotificacaoSla(
  supabase: SupabaseClient,
  p: SendNotificacaoSlaParams,
): Promise<SendNotificacaoSlaResult> {
  const claimField = p.evento === 'warning' ? 'warning_sent_at' : 'escalated_at'
  const nowIso = new Date().toISOString()

  // CAS PRIMEIRO (T-999.1-05, Pitfall 4) — antes de qualquer chamada a
  // Slack/Calendar. Se a linha não foi reivindicada (já enviado ou perdido
  // para um scan concorrente), retorna sem efeito colateral algum.
  const { data: claimed } = await supabase
    .from('lead_sla')
    .update({ [claimField]: nowIso })
    .eq('lead_id', p.leadId)
    .is(claimField, null)
    .is('resolved_at', null)
    .select('lead_id')
    .maybeSingle<{ lead_id: string }>()

  if (!claimed) {
    return { ok: true, skipped: 'already_sent' }
  }

  return p.evento === 'escalonamento'
    ? sendEscalonamento(supabase, p.leadId)
    : sendWarning(supabase, p.leadId)
}
