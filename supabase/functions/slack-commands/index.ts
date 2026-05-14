// Edge Function: slack-commands
// Gatilho: Slack Slash Command (configurado em api.slack.com).
//
// Comandos suportados:
//   /lead help
//   /lead Nome | Empresa | Telefone | Origem        ← cria lead
//   /lead status <id|prefix> <estagio>              ← atualiza funil (P3.4)
//
// Validação:
//   X-Slack-Request-Timestamp (rejeitar se > 5 min)
//   X-Slack-Signature = "v0=" + HMAC-SHA256(SLACK_SIGNING_SECRET, "v0:" + ts + ":" + raw_body)
//
// Permissões (após P3.1):
//   - "criar lead": qualquer interno com slack_user_id mapeado
//   - "atualizar status": diretor OU responsavel_id do lead = perfil correspondente
//
// Secrets esperados:
//   SLACK_SIGNING_SECRET, APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SLACK_SIGNING_SECRET = Deno.env.get('SLACK_SIGNING_SECRET') ?? ''
const APP_URL              = (Deno.env.get('APP_URL') ?? 'https://localhost:5173').replace(/\/$/, '')
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY          = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ─── Constantes de domínio ───────────────────────────────────────────────────

const ORIGENS_VALIDAS = new Set([
  'indicacao_cliente', 'indicacao_parceiro', 'evento',
  'redes_sociais', 'site', 'mej', 'outro',
])

const ESTAGIOS_VALIDOS = new Set([
  'classificacao', 'levantamento_oportunidade', 'educar_lead',
  'proposta_comercial', 'negociacao', 'stand_by',
  'ganho_assessoria', 'ganho_consultoria', 'perdido', 'cancelado',
])

const ESTAGIO_ALIASES: Record<string, string> = {
  classif:     'classificacao',
  levantamento: 'levantamento_oportunidade',
  educar:      'educar_lead',
  proposta:    'proposta_comercial',
  negociacao:  'negociacao',
  stand_by:    'stand_by',
  standby:     'stand_by',
  ganho:       'ganho_assessoria',
  perdido:     'perdido',
  cancelado:   'cancelado',
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function ephemeral(text: string) {
  return new Response(
    JSON.stringify({ response_type: 'ephemeral', text }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function helpMessage(): Response {
  return ephemeral(
    [
      '*Comandos disponíveis:*',
      '`/lead Nome | Empresa | Telefone | Origem` — cria um lead',
      '`/lead status <id|prefixo> <estagio>` — atualiza o estágio do funil',
      '`/lead help` — mostra esta ajuda',
      '',
      '*Origens válidas:* `indicacao_cliente`, `indicacao_parceiro`, `evento`, `redes_sociais`, `site`, `mej`, `outro`',
      '*Estágios:* `classificacao`, `levantamento_oportunidade`, `educar_lead`, `proposta_comercial`, `negociacao`, `stand_by`, `ganho_assessoria`, `ganho_consultoria`, `perdido`, `cancelado`',
      '_(aceita aliases curtos: `proposta`, `ganho`, `standby` etc.)_',
      '',
      '*Exemplos:*',
      '`/lead João Silva | ACME | (84) 99999-0000 | indicacao_cliente`',
      '`/lead status a1b2c3d4 proposta`',
    ].join('\n'),
  )
}

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

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - tsNum) > 60 * 5) return false

  const baseString = `v0:${ts}:${rawBody}`
  const expected = `v0=${await hmacHex(SLACK_SIGNING_SECRET, baseString)}`
  return constantTimeEqual(expected, sig)
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

interface InternoPerfil {
  id: string
  nome: string
  role: string | null
}

async function findInternoBySlackUser(slackUserId: string): Promise<InternoPerfil | null> {
  const { data } = await supabase
    .from('perfis')
    .select('id, nome, role')
    .eq('slack_user_id', slackUserId)
    .eq('tipo', 'interno')
    .maybeSingle<InternoPerfil>()
  return data ?? null
}

async function findLeadByIdOrPrefix(idOrPrefix: string): Promise<{ id: string; status: string; responsavel_id: string | null; nome: string } | null> {
  // UUID completo
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrPrefix)) {
    const { data } = await supabase.from('leads')
      .select('id, status, responsavel_id, nome')
      .eq('id', idOrPrefix)
      .maybeSingle<{ id: string; status: string; responsavel_id: string | null; nome: string }>()
    return data ?? null
  }

  // Prefixo (8+ chars): busca via ILIKE no id casted como text
  if (idOrPrefix.length >= 6) {
    const { data } = await supabase.from('leads')
      .select('id, status, responsavel_id, nome')
      .ilike('id::text', `${idOrPrefix}%`)
      .limit(2)
      .returns<Array<{ id: string; status: string; responsavel_id: string | null; nome: string }>>()
    if (!data || data.length === 0) return null
    if (data.length > 1) return null  // ambíguo
    return data[0]
  }

  return null
}

function normalizeEstagio(input: string): string | null {
  const lower = input.toLowerCase().replace(/[^a-z_]/g, '')
  if (ESTAGIOS_VALIDOS.has(lower)) return lower
  if (lower in ESTAGIO_ALIASES) return ESTAGIO_ALIASES[lower]
  return null
}

// ─── Sub-comandos ────────────────────────────────────────────────────────────

interface ParsedNewLead {
  nome: string
  empresa: string | null
  telefone: string | null
  origem: string
}

function parseNewLead(text: string): ParsedNewLead | { error: string } {
  const [nome, empresa, telefone, origemRaw] = text.split('|').map(p => p.trim())
  if (!nome) return { error: 'Nome é obrigatório.' }
  const origem = (origemRaw ?? 'outro').toLowerCase().replace(/[^a-z_]/g, '')
  if (!ORIGENS_VALIDAS.has(origem)) {
    return { error: `Origem inválida "${origemRaw}". Use \`/lead help\` para ver as opções.` }
  }
  return { nome, empresa: empresa || null, telefone: telefone || null, origem }
}

async function handleNewLead(text: string, slackUserId: string, userName: string): Promise<Response> {
  const parsed = parseNewLead(text)
  if ('error' in parsed) return ephemeral(`❌ ${parsed.error}`)

  const interno = await findInternoBySlackUser(slackUserId)

  const { data, error } = await supabase
    .from('leads')
    .insert({
      nome: parsed.nome,
      empresa: parsed.empresa ?? '—',
      segmento: 'outro',
      telefone: parsed.telefone ?? '',
      origem: parsed.origem,
      status: 'classificacao',
      responsavel_id: interno?.id ?? null,
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
      interno
        ? `_Você (${interno.nome}) foi atribuído como responsável._`
        : '_Sem responsável atribuído (seu perfil Slack não está mapeado em perfis.slack_user_id)._',
    ].filter(Boolean).join('\n'),
  )
}

async function handleStatusUpdate(args: string[], slackUserId: string): Promise<Response> {
  if (args.length < 2) {
    return ephemeral('❌ Uso: `/lead status <id|prefixo> <estagio>`. Veja `/lead help`.')
  }
  const [idOrPrefix, estagioRaw] = args

  const interno = await findInternoBySlackUser(slackUserId)
  if (!interno) {
    return ephemeral('❌ Seu usuário Slack não está mapeado a um perfil interno no CRM. Peça à diretoria pra preencher `perfis.slack_user_id`.')
  }

  const novoEstagio = normalizeEstagio(estagioRaw)
  if (!novoEstagio) {
    return ephemeral(`❌ Estágio inválido "${estagioRaw}". Veja \`/lead help\` para a lista.`)
  }

  const lead = await findLeadByIdOrPrefix(idOrPrefix)
  if (!lead) {
    return ephemeral(`❌ Lead não encontrado para "${idOrPrefix}" (ou prefixo ambíguo — use mais caracteres).`)
  }

  // Permissão: diretor OU responsável
  const isDiretor = interno.role === 'diretor'
  const isResponsavel = lead.responsavel_id === interno.id
  if (!isDiretor && !isResponsavel) {
    return ephemeral(`🔒 Sem permissão. Lead *${lead.nome}* tem outro responsável e você não é diretor.`)
  }

  if (lead.status === novoEstagio) {
    return ephemeral(`ℹ️ Lead *${lead.nome}* já está em \`${novoEstagio}\`. Nada a fazer.`)
  }

  const { error } = await supabase
    .from('leads')
    .update({ status: novoEstagio, updated_at: new Date().toISOString() })
    .eq('id', lead.id)

  if (error) {
    return ephemeral(`❌ Erro ao atualizar: ${error.message}`)
  }

  return ephemeral(
    [
      `✅ Lead *${lead.nome}* movido para \`${novoEstagio}\`.`,
      `<${APP_URL}/leads/${lead.id}|Abrir no CRM>`,
      `_Estágio anterior: \`${lead.status}\`_`,
    ].join('\n'),
  )
}

// ─── Handler principal ───────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const rawBody = await req.text()
  if (!await verifySlackSignature(req, rawBody)) {
    return new Response('unauthorized', { status: 401 })
  }

  const params   = new URLSearchParams(rawBody)
  const command  = params.get('command') ?? ''
  const text     = (params.get('text') ?? '').trim()
  const userId   = params.get('user_id') ?? ''
  const userName = params.get('user_name') ?? ''

  if (command !== '/lead') {
    return ephemeral(`Comando \`${command}\` não suportado.`)
  }

  if (!text || text === 'help' || text === '?') {
    return helpMessage()
  }

  // Tokeniza o primeiro argumento pra detectar subcomando
  const tokens = text.split(/\s+/)
  const head = tokens[0].toLowerCase()

  if (head === 'status') {
    return handleStatusUpdate(tokens.slice(1), userId)
  }

  // Default: criar lead (formato com | separator)
  return handleNewLead(text, userId, userName)
})
