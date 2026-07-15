// Edge Function: notify-sla-evento
// Gatilho: chamada explícita do pg_cron (migration 043, Plan 04) a cada
// ~15min, varrendo lead_sla (idx_lead_sla_scan) e disparando um POST por
// linha que cruzou o limiar de warning (2h antes do deadline) ou o próprio
// deadline (escalonamento).
//
// Idempotência: NÃO vive neste endpoint — vive no CAS atômico dentro de
// sendNotificacaoSla (_shared/sla.ts), que reivindica a linha via
// `UPDATE lead_sla SET x_sent_at=now() WHERE x_sent_at IS NULL RETURNING`
// como PRIMEIRO statement, antes de qualquer Slack/Calendar. Duas chamadas
// concorrentes para o mesmo lead/evento (ticks sobrepostos do cron de
// 15min — Pitfall 4) só produzem 1 envio.
//
// Auth: fail-closed (padrão endurecido na migration 040) — sem
// WEBHOOK_SLA_SECRET configurado, recusa (500) em vez de seguir sem auth.
// Com secret configurado, valida o header Authorization via
// constantTimeAuthCheck (401 se inválido).
//
// Validação de payload (T-999.1-09): `evento` deve ser 'warning' ou
// 'escalonamento'; `lead_id` deve casar com o formato UUID — qualquer
// desvio recusa com 400 antes de qualquer escrita.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { constantTimeAuthCheck } from '../_shared/auth.ts'
import { sendNotificacaoSla } from '../_shared/sla.ts'
import type { EventoSla } from '../_shared/sla.ts'

interface SlaEventoPayload {
  evento: EventoSla
  lead_id: string
}

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SLA_SECRET')
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENTOS_VALIDOS: EventoSla[] = ['warning', 'escalonamento']

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

  // Auth fail-closed (T-999.1-02): sem secret configurado, recusa em vez de
  // seguir sem auth — nunca fail-open.
  if (!WEBHOOK_SECRET) {
    return json({ ok: false, error: 'server misconfigured: webhook secret not set' }, 500)
  }
  const auth = req.headers.get('Authorization') ?? ''
  if (!constantTimeAuthCheck(auth, WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  let payload: SlaEventoPayload
  try {
    payload = (await req.json()) as SlaEventoPayload
  } catch {
    return json({ ok: false, error: 'invalid JSON' }, 400)
  }

  // Validação de input (T-999.1-09) — antes de qualquer escrita.
  if (!EVENTOS_VALIDOS.includes(payload.evento)) {
    return json({ ok: false, error: `evento deve ser um de: ${EVENTOS_VALIDOS.join(', ')}` }, 400)
  }
  if (typeof payload.lead_id !== 'string' || !UUID_RE.test(payload.lead_id)) {
    return json({ ok: false, error: 'lead_id deve ser um UUID válido' }, 400)
  }

  const result = await sendNotificacaoSla(supabase, {
    evento: payload.evento,
    leadId: payload.lead_id,
  })

  return json(
    {
      ok: result.ok,
      skipped: result.skipped,
      slack: result.slack,
      calendar: result.calendar,
    },
    result.ok ? 200 : 500,
  )
})
