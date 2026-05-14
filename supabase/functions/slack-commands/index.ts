// Edge Function: slack-commands
// Gatilho: Slack Slash Command (configurado em api.slack.com).
//
// Comandos suportados (v1):
//   /lead nome | empresa | telefone | origem
//   /lead help
//
// Validação:
//   X-Slack-Request-Timestamp (rejeitar se > 5 min)
//   X-Slack-Signature = "v0=" + HMAC-SHA256(SLACK_SIGNING_SECRET, "v0:" + ts + ":" + raw_body)
//
// Secrets esperados:
//   SLACK_SIGNING_SECRET       — Settings → Basic Information → App Credentials → Signing Secret
//   APP_URL                    — base pública do CRM (pra montar o link de retorno)
//   SUPABASE_URL               — injetado
//   SUPABASE_SERVICE_ROLE_KEY  — injetado

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SLACK_SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET') ?? ''
const APP_URL              = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY          = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Origens válidas para slash command (subset de LEAD_SOURCES).
const ORIGENS_VALIDAS = new Set([
  'indicacao_cliente', 'indicacao_parceiro', 'evento',
  'redes_sociais', 'site', 'mej', 'outro',
])

function ephemeral(text: string) {
  return new Response(
    JSON.stringify({ response_type: 'ephemeral', text }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function helpMessage(): Response {
  return ephemeral(
    [
      '*Uso:* `/lead Nome | Empresa | Telefone | Origem`',
      '*Origens válidas:* `indicacao_cliente`, `indicacao_parceiro`, `evento`, `redes_sociais`, `site`, `mej`, `outro`',
      '',
      '_Exemplo:_ `/lead João Silva | ACME Ltda | (84) 99999-0000 | indicacao_cliente`',
    ].join('\n'),
  )
}

// HMAC-SHA256 em hex via WebCrypto
async function hmacHex(key: string, msg: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key)
  const msgBytes = new TextEncoder().encode(msg)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes)
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySlackSignature(req: Request, rawBody: string): Promise<boolean> {
  if (!SLACK_SIGNING_SECRET) return false
  const ts  = req.headers.get('x-slack-request-timestamp') ?? ''
  const sig = req.headers.get('x-slack-signature') ?? ''
  if (!ts || !sig) return false

  // Rejeita requests com timestamp antigo (anti-replay)
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - tsNum) > 60 * 5) return false

  const baseString = `v0:${ts}:${rawBody}`
  const expected = `v0=${await hmacHex(SLACK_SIGNING_SECRET, baseString)}`
  return constantTimeEqual(expected, sig)
}

interface ParsedLead {
  nome: string
  empresa: string | null
  telefone: string | null
  origem: string
}

function parseLeadArgs(text: string): ParsedLead | { error: string } {
  const parts = text.split('|').map(p => p.trim())
  const [nome, empresa, telefone, origemRaw] = parts

  if (!nome) return { error: 'Nome é obrigatório.' }

  const origem = (origemRaw ?? 'outro').toLowerCase().replace(/[^a-z_]/g, '')
  if (!ORIGENS_VALIDAS.has(origem)) {
    return { error: `Origem inválida "${origemRaw}". Use \`/lead help\` para ver as opções.` }
  }

  return {
    nome,
    empresa:  empresa || null,
    telefone: telefone || null,
    origem,
  }
}

async function findResponsavelBySlackUser(slackUserId: string): Promise<string | null> {
  // Tenta achar um perfil cujo slack_user_id bate. Se a coluna não existir ainda
  // (P3.3 ainda não rodou), o erro é silenciado e o lead vira sem responsável.
  const { data } = await supabase
    .from('perfis')
    .select('id')
    .eq('slack_user_id', slackUserId)
    .eq('tipo', 'interno')
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const ok = await verifySlackSignature(req, rawBody)
  if (!ok) {
    return new Response('unauthorized', { status: 401 })
  }

  const params = new URLSearchParams(rawBody)
  const command   = params.get('command') ?? ''
  const text      = (params.get('text') ?? '').trim()
  const userId    = params.get('user_id') ?? ''
  const userName  = params.get('user_name') ?? ''

  if (command !== '/lead') {
    return ephemeral(`Comando \`${command}\` não suportado.`)
  }

  if (!text || text === 'help' || text === '?') {
    return helpMessage()
  }

  const parsed = parseLeadArgs(text)
  if ('error' in parsed) return ephemeral(`❌ ${parsed.error}`)

  let responsavelId: string | null = null
  try {
    responsavelId = await findResponsavelBySlackUser(userId)
  } catch {
    // coluna slack_user_id ainda não existe — ignora
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      nome: parsed.nome,
      empresa: parsed.empresa ?? '—',
      segmento: 'outro',
      telefone: parsed.telefone ?? '',
      origem: parsed.origem,
      status: 'classificacao',
      responsavel_id: responsavelId,
      notas: `Criado via Slack por @${userName} em ${new Date().toLocaleString('pt-BR')}`,
    })
    .select('id')
    .single<{ id: string }>()

  if (error || !data) {
    return ephemeral(`❌ Erro ao criar lead: ${error?.message ?? 'desconhecido'}`)
  }

  return ephemeral(
    [
      `✅ Lead *${parsed.nome}* criado.`,
      `<${APP_URL}/leads/${data.id}|Abrir no CRM>`,
      parsed.empresa ? `_Empresa: ${parsed.empresa}_` : null,
      responsavelId
        ? '_Você foi atribuído como responsável._'
        : '_Sem responsável atribuído (perfil Slack não mapeado)._',
    ].filter(Boolean).join('\n'),
  )
})
