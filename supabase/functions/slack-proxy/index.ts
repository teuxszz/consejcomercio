import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? ''

// Allowlist de origens permitidas via CORS. APP_URL (prod) + domínio Vercel + localhost dev.
const ALLOWED_ORIGINS = new Set([
  APP_URL.replace(/\/$/, ''),
  'https://consejcomercio-amber.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean))

function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_URL.replace(/\/$/, '')
  return {
    'Access-Control-Allow-Origin': allowed || 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function unauthorized(reason: string, origin: string | null) {
  return new Response(
    JSON.stringify({ ok: false, error: reason }),
    { status: 401, headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' } }
  )
}

function forbidden(reason: string, origin: string | null) {
  return new Response(
    JSON.stringify({ ok: false, error: reason }),
    { status: 403, headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' } }
  )
}

serve(async (req) => {
  const origin = req.headers.get('Origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeadersFor(origin) })
  }

  // ─── 1. Validar JWT do chamador (deve ser usuário autenticado da CONSEJ) ───
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return unauthorized('missing token', origin)

  const { data: userData, error: userError } = await adminClient.auth.getUser(jwt)
  if (userError || !userData?.user) return unauthorized('invalid token', origin)

  // ─── 2. Apenas internos podem usar o proxy do Slack ───────────────────────
  // Cliente do portal não tem nenhuma razão legítima para listar canais
  // ou ler mensagens internas da CONSEJ.
  const { data: perfil, error: perfilError } = await adminClient
    .from('perfis')
    .select('tipo')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (perfilError || perfil?.tipo !== 'interno') {
    return forbidden('only internal users can access slack-proxy', origin)
  }

  // ─── 3. Executar a ação solicitada ────────────────────────────────────────
  try {
    const SLACK_TOKEN = Deno.env.get('SLACK_BOT_TOKEN')
    if (!SLACK_TOKEN) {
      return new Response(
        JSON.stringify({ ok: false, error: 'SLACK_BOT_TOKEN não configurado.' }),
        { status: 500, headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' } }
      )
    }

    const { action, channel, limit = 30, cursor } = await req.json()

    const slackFetch = (url: string) =>
      fetch(url, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }).then((r) => r.json())

    let data: unknown

    if (action === 'list_channels') {
      data = await slackFetch(
        'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200&exclude_archived=true'
      )
    } else if (action === 'get_messages') {
      if (!channel) throw new Error('channel é obrigatório')
      // Validate channel ID format to prevent SSRF/abuse
      if (!/^[CDU][A-Z0-9]{8,}$/.test(channel)) throw new Error('channel id inválido')
      const params = new URLSearchParams({ channel, limit: String(limit) })
      if (cursor) params.set('cursor', cursor)
      data = await slackFetch(`https://slack.com/api/conversations.history?${params}`)
    } else if (action === 'get_user') {
      if (!channel) throw new Error('user id é obrigatório')
      if (!/^[UW][A-Z0-9]{8,}$/.test(channel)) throw new Error('user id inválido')
      data = await slackFetch(`https://slack.com/api/users.info?user=${channel}`)
    } else {
      throw new Error(`Ação desconhecida: ${action}`)
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' },
    })
  }
})
