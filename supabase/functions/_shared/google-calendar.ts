// Helper: Google Calendar OAuth refresh + criação do bloco de follow-up
// (Phase 999.1 Plan 02 — D-01: refresh_token é credencial de terceiro).
//
// refreshAccessToken: POST oauth2.googleapis.com/token (grant_type=refresh_token).
//   Non-2xx (ex.: invalid_grant, token revogado fora de banda) → null; o caller
//   trata como "desconectado" e degrada para fallback Slack-only (T-999.1-04).
//   NUNCA loga token/secret em mensagem de erro (T-999.1-06).
//
// createFollowupEvent: POST calendars/primary/events — bloco de 30min
//   terminando no deadline_at; description inclui deep link para o lead
//   (Open Q4 — incluído por padrão).
//
// getValidAccessToken: lê a linha via service_role (bypassa RLS zero-leitura
//   da migration 042); se access_token ainda válido (margem ~2min) devolve
//   sem chamar refresh; senão refresca, persiste em google_calendar_tokens e
//   devolve; refresh null → devolve null (Plan 03 degrada para Slack-only).
//
// @ts-nocheck (URL imports não resolvem no TS Node — Deno runtime resolve em prod)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID = (typeof Deno !== 'undefined' ? Deno.env.get('GOOGLE_CLIENT_ID') : process.env.GOOGLE_CLIENT_ID) ?? ''
const GOOGLE_CLIENT_SECRET = (typeof Deno !== 'undefined' ? Deno.env.get('GOOGLE_CLIENT_SECRET') : process.env.GOOGLE_CLIENT_SECRET) ?? ''

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const REFRESH_BUFFER_MS = 2 * 60 * 1000 // margem de ~2min antes de expirar

export interface RefreshResult {
  accessToken: string
  expiresAt: Date
}

export type CreateEventResult =
  | { ok: true; eventId: string }
  | { ok: false; status: number }

/**
 * Refresca o access_token via refresh_token. Non-2xx → null; caller trata
 * como desconectado (T-999.1-04). NUNCA loga token/secret (T-999.1-06).
 */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshResult | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  })
  if (!res.ok) return null
  const body = (await res.json()) as { access_token: string; expires_in: number }
  return { accessToken: body.access_token, expiresAt: new Date(Date.now() + body.expires_in * 1000) }
}

/**
 * Cria o bloco de follow-up na Google Agenda primária do assessor. Bloco de
 * 30min terminando no deadline_at; description inclui deep link para o lead
 * (Open Q4) e nota de origem.
 */
export async function createFollowupEvent(
  accessToken: string,
  leadNome: string,
  deadlineAt: Date,
  leadId: string,
  appUrl: string,
): Promise<CreateEventResult> {
  const start = new Date(deadlineAt.getTime() - 30 * 60 * 1000)
  const deepLink = `${appUrl.replace(/\/$/, '')}/leads/${leadId}`
  const res = await fetch(EVENTS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `Fazer follow-up com Lead ${leadNome}`,
      description: `${deepLink}\n\nGerado pelo CONSEJ CRM — SLA de follow-up`,
      start: { dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: deadlineAt.toISOString(), timeZone: 'America/Sao_Paulo' },
    }),
  })
  if (!res.ok) return { ok: false, status: res.status }
  const body = (await res.json()) as { id: string }
  return { ok: true, eventId: body.id }
}

interface TokenRow {
  refresh_token: string
  access_token: string | null
  access_token_expires_at: string | null
}

/**
 * Devolve um access_token válido para o perfil, refrescando se necessário.
 * Lê/escreve via supabase (service_role) — o token nunca sai do server.
 * Retorna null quando o perfil nunca conectou ou quando o refresh falha
 * (desconectado) — caller (Plan 03) degrada para fallback Slack-only.
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  perfilId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('google_calendar_tokens')
    .select('refresh_token, access_token, access_token_expires_at')
    .eq('perfil_id', perfilId)
    .maybeSingle<TokenRow>()

  if (!data) return null

  const expiresAtMs = data.access_token_expires_at ? new Date(data.access_token_expires_at).getTime() : 0
  if (data.access_token && expiresAtMs - REFRESH_BUFFER_MS > Date.now()) {
    return data.access_token
  }

  const refreshed = await refreshAccessToken(data.refresh_token)
  if (!refreshed) return null

  await supabase
    .from('google_calendar_tokens')
    .update({
      access_token: refreshed.accessToken,
      access_token_expires_at: refreshed.expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('perfil_id', perfilId)

  return refreshed.accessToken
}
