// Edge Function: notify-aprovacao-evento
// Gatilho: Postgres trigger em cliente_docs (INSERT autor='cliente' = evento c;
// UPDATE com status mudando para 'aprovado' = evento a; status para
// 'revisao_solicitada' = evento b) via pg_net.http_post (migration 038).
//
// Helper compartilhado: _shared/aprovacoes.ts.sendNotificacaoAprovacao faz
// fanout Slack + Email + Push respeitando prefs.documentos.{slack,email,push}.
//
// Payload (trigger SQL define):
//   {
//     evento: 'cliente_aprovou' | 'cliente_pediu_revisao' | 'cliente_subiu_doc'
//             | 'aprovacao_stale',  // stale entra também aqui em D-12 v2
//     doc_id, cliente_id, destinatario_perfil_id, comentario_cliente,
//     skip_slack?: boolean   // D-12: reenviar-lembrete pro cliente OFF Slack
//   }
//
// BLOCKER #3 fix: skip_slack (snake_case JSON) → skipSlack (camelCase helper).
// Sem essa propagação, D-12 reenviar-lembrete dispararia Slack indevidamente.
//
// Auth: constantTimeAuthCheck contra WEBHOOK_APROVACAO_SECRET (timing-safe).

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { constantTimeAuthCheck } from '../_shared/auth.ts'
import { sendNotificacaoAprovacao, type EventoAprovacao } from '../_shared/aprovacoes.ts'

interface AprovacaoEventoPayload {
  evento: EventoAprovacao
  doc_id: string
  cliente_id: string
  destinatario_perfil_id: string
  comentario_cliente: string | null
  // D-12: reenviar-lembrete (Slice 4 ReenviarLembreteButton). Slack OFF para cliente.
  skip_slack?: boolean
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
      // CORS para chamadas vindas do trigger pg_net (origin pode estar ausente)
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  })
}

serve(async (req) => {
  // 1. CORS preflight
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

  // 2. Auth check (timing-safe Bearer comparison)
  // Fail-closed (audit 040): service_role + --no-verify-jwt → HMAC é a única
  // fronteira. Sem secret configurado, recusa em vez de seguir sem auth.
  if (!WEBHOOK_SECRET) {
    return json({ ok: false, error: 'server misconfigured: webhook secret not set' }, 500)
  }
  const auth = req.headers.get('Authorization') ?? ''
  if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  // 3. JSON parse
  let payload: AprovacaoEventoPayload
  try {
    payload = (await req.json()) as AprovacaoEventoPayload
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400)
  }

  // 4. Validation
  if (!payload.evento || !payload.doc_id || !payload.destinatario_perfil_id) {
    return json({ ok: false, error: 'evento, doc_id e destinatario_perfil_id são obrigatórios' }, 400)
  }

  // 5. Fetch nome do cliente + nome do arquivo do doc (lookup mínimo)
  const { data: doc, error: docErr } = await supabase
    .from('cliente_docs')
    .select('nome_arquivo, clientes!inner(nome)')
    .eq('id', payload.doc_id)
    .maybeSingle<{ nome_arquivo: string; clientes: { nome: string } | { nome: string }[] }>()

  if (docErr || !doc) {
    return json({ ok: false, error: 'doc não encontrado', detail: docErr?.message ?? null }, 404)
  }

  // clientes!inner pode vir como objeto único ou array dependendo da versão do PostgREST
  const clienteNome = Array.isArray(doc.clientes) ? doc.clientes[0]?.nome : doc.clientes?.nome
  const docNomeArquivo = doc.nome_arquivo

  if (!clienteNome) {
    return json({ ok: false, error: 'cliente vazio no doc' }, 500)
  }

  // 6. Call shared helper (BLOCKER #3: propaga skip_slack → skipSlack)
  const result = await sendNotificacaoAprovacao(supabase, {
    perfilId: payload.destinatario_perfil_id,
    evento: payload.evento,
    docId: payload.doc_id,
    clienteNome,
    docNomeArquivo,
    comentarioCliente: payload.comentario_cliente,
    skipSlack: payload.skip_slack ?? false,
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
