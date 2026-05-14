// Vercel Cron: roda diariamente, identifica contratos com data_fim caindo em
// janelas pré-definidas e chama a edge function notify-renovacao para cada um.
// A idempotência é garantida pela tabela notificacoes_renovacao_enviadas
// (PK contrato_id + dias_antes).
//
// Schedule: configurado em vercel.json — recomendado "0 12 * * *" (12h UTC = 9h BRT).
//
// Secrets esperados:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   WEBHOOK_RENOVACAO_SECRET    — usado no Authorization da edge function
//   CRON_SECRET                 — opcional, Vercel envia Authorization: Bearer ...
//                                 quando configurado em Settings → Environment

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'

// Janelas em dias até o vencimento. A primeira (30d) é o "1 mês antes" pedido
// pela diretoria. As demais reforçam — caso a primeira passe sem ação, recordamos.
const JANELAS_DIAS = [30, 14, 7] as const

interface Contrato {
  id: string
  data_fim: string | null
  status: string
}

function daysUntil(iso: string): number {
  const target = new Date(iso)
  target.setHours(23, 59, 59, 999)
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

export default async function handler(req: any, res: any) {
  // Vercel Cron envia o header automaticamente em produção
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers?.authorization
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const RENOV_SECRET = process.env.WEBHOOK_RENOVACAO_SECRET

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ ok: false, error: 'Supabase env vars ausentes' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Pega contratos ativos com data_fim nos próximos 35 dias (cobre 30d window)
  const upperBound = new Date()
  upperBound.setDate(upperBound.getDate() + 35)

  const { data: contratos, error } = await supabase
    .from('contratos')
    .select('id, data_fim, status')
    .eq('status', 'ativo')
    .not('data_fim', 'is', null)
    .lte('data_fim', upperBound.toISOString())
    .returns<Contrato[]>()

  if (error) {
    return res.status(500).json({ ok: false, error: error.message })
  }

  const results: Array<{ contrato_id: string; dias_antes: number; ok: boolean; reason?: string }> = []

  for (const c of contratos ?? []) {
    if (!c.data_fim) continue
    const d = daysUntil(c.data_fim)
    if (d < 0) continue

    // Encontra a primeira janela em que o contrato cai (precisão de ±1 dia)
    const janela = JANELAS_DIAS.find(j => Math.abs(d - j) <= 0)
    if (!janela) continue

    // Chama a edge function (idempotente via PK)
    const url = `${SUPABASE_URL}/functions/v1/notify-renovacao`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(RENOV_SECRET ? { Authorization: `Bearer ${RENOV_SECRET}` } : {}),
      },
      body: JSON.stringify({ contrato_id: c.id, dias_antes: janela }),
    })

    const body = await resp.json().catch(() => ({})) as { ok?: boolean; skipped?: string; error?: string }
    results.push({
      contrato_id: c.id,
      dias_antes: janela,
      ok: !!body.ok,
      reason: body.skipped ?? body.error,
    })
  }

  return res.status(200).json({
    ok: true,
    checked: contratos?.length ?? 0,
    triggered: results.length,
    results,
  })
}
