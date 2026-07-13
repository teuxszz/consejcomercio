// Edge Function: notify-aprovacoes-stale
// Gatilho: chamada explícita do pg_cron (migration 038) diariamente às 08:00 BRT
// (11:00 UTC). Para cada doc pending com requer_aprovacao=true E
// (now - created_at) > dias_para_aprovacao_pendente, dispara
// sendNotificacaoAprovacao(evento='aprovacao_stale') para o consultor
// responsável (1 chamada por doc — payload inline, sem SELECT extra).
//
// Idempotência via UNIQUE notificacoes_envios (já em prod desde Phase 5):
// (perfil_id, tipo='documentos', canal, dia, entidade_id=doc_id) garante 1
// envio/dia mesmo se cron rodar 2x (ou se manualmente disparado).
//
// Helper compartilhado: _shared/aprovacoes.ts (mesmo de notify-aprovacao-evento).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { constantTimeAuthCheck } from '../_shared/auth.ts'
import { sendNotificacaoAprovacao } from '../_shared/aprovacoes.ts'

interface StalePayload {
  doc_id: string
  cliente_id: string
  destinatario_perfil_id: string
  cliente_nome: string
  doc_nome_arquivo: string
}

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_APROVACAO_SECRET')
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method not allowed' }, 405)
  }

  // Auth check (timing-safe Bearer)
  // Fail-closed (audit 040): service_role + --no-verify-jwt → HMAC é a única
  // fronteira. Sem secret configurado, recusa em vez de seguir sem auth.
  if (!WEBHOOK_SECRET) {
    return json({ ok: false, error: 'server misconfigured: webhook secret not set' }, 500)
  }
  const auth = req.headers.get('Authorization') ?? ''
  if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  let payload: StalePayload
  try {
    payload = (await req.json()) as StalePayload
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400)
  }

  if (
    !payload.doc_id
    || !payload.destinatario_perfil_id
    || !payload.cliente_nome
    || !payload.doc_nome_arquivo
  ) {
    return json(
      { ok: false, error: 'doc_id, destinatario_perfil_id, cliente_nome, doc_nome_arquivo são obrigatórios' },
      400,
    )
  }

  // Chama o helper compartilhado com evento='aprovacao_stale'.
  // Stale notifica o CONSULTOR (não o cliente), logo Slack é OK (skipSlack=false).
  const result = await sendNotificacaoAprovacao(supabase, {
    perfilId: payload.destinatario_perfil_id,
    evento: 'aprovacao_stale',
    docId: payload.doc_id,
    clienteNome: payload.cliente_nome,
    docNomeArquivo: payload.doc_nome_arquivo,
  })

  return json(
    {
      ok: result.ok,
      slack: result.slack,
      email: result.email,
      push: result.push,
    },
    result.ok ? 200 : 500,
  )
})
