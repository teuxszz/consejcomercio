// Helper central de envio de Web Push via VAPID.
//
// Espelha 1:1 _shared/email.ts (D-05 Phase 6). Divergências documentadas:
//   - Sem checkQuota (D-08: push não consome quota Resend; filtro canal='email'
//     no quota_resend_atual já garante isso)
//   - Multi-device fanout (D-01): perfil pode ter N subscriptions; helper itera
//     sobre todas e agrega delivered/failed/cleaned
//   - Cleanup automático em 410/404 (D-02): subscription expirada/revogada vira
//     DELETE FROM push_subscriptions WHERE id=sub.id + status='failed'
//   - Idempotência via UNIQUE em notificacoes_envios (D-08) — mesmo índice
//     parcial da migration 035 reaproveitado para canal='push'
//   - skipped_no_subscription: perfil sem nenhuma sub → NÃO loga em
//     notificacoes_envios (não há o que reenviar; difere de skipped_idempotent)
//
// Phase 6 D-05/D-06/D-07 — sendPush MVP sem retry (Open Question 5);
// botão "Reenviar" Phase 5 cobre re-tentativa manual.
//
// Segurança: VAPID_PRIVATE_KEY nunca aparece em error_msg/logs (T-06-01).
//
// @ts-nocheck (URL imports + Deno.env não resolvem no TS Node — Deno runtime resolve em prod)
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

// ─── Constantes (env-driven) ─────────────────────────────────────────────────
const VAPID_PUBLIC_KEY  = (typeof Deno !== 'undefined' ? Deno.env.get('VAPID_PUBLIC_KEY')  : process.env.VAPID_PUBLIC_KEY)  ?? ''
const VAPID_PRIVATE_KEY = (typeof Deno !== 'undefined' ? Deno.env.get('VAPID_PRIVATE_KEY') : process.env.VAPID_PRIVATE_KEY) ?? ''
const VAPID_SUBJECT     = (typeof Deno !== 'undefined' ? Deno.env.get('VAPID_SUBJECT')     : process.env.VAPID_SUBJECT)
  ?? 'mailto:comunicacao.consej@gmail.com'

// setVapidDetails é global no web-push — chamar 1x no module load. Pular se
// alguma key estiver vazia (smoke-test/tests rodam sem env): catch silencioso
// para evitar throw no import.
try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  }
} catch (_e) {
  // Inválido VAPID format — runtime sendPush vai falhar de forma observável
  // via try/catch interno. Não quebrar o import.
}

// ─── Tipos exportados ────────────────────────────────────────────────────────
// Phase 7 D-16: 'documentos' adicionado para aprovação/revisão de cliente_docs
export type TipoNotif = 'tarefa' | 'cadencia' | 'renovacao' | 'indicacao' | 'documentos'
export type EntidadeTipo = 'lead' | 'cliente' | 'contrato' | 'tarefa'

export interface PushPayload {
  title: string
  body: string
  data: {
    deepLink: string
    tipo: TipoNotif
    entidadeId: string | null
  }
}

export interface SendPushParams {
  perfilId: string
  tipo: TipoNotif
  entidadeId: string | null
  entidadeTipo: EntidadeTipo | null
  payload: PushPayload
}

export type SendPushStatus =
  | 'queued'
  | 'failed'
  | 'skipped_idempotent'
  | 'skipped_no_subscription'

export interface SendPushResult {
  ok: boolean
  status: SendPushStatus
  errorMsg?: string
  notificacaoId?: string
  delivered: number
  failed: number
  cleaned: number
}

interface PushSubRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

// ─── Função principal ────────────────────────────────────────────────────────
export async function sendPush(
  supabase: SupabaseClient,
  p: SendPushParams,
): Promise<SendPushResult> {
  // Defensive copy + truncate (Pitfall 4 / T-06-12 XSS-via-body mitigação):
  // title ≤ 50 chars, body ≤ 150 chars. SW trata como plaintext mas é boa
  // higiene cap pra evitar payload >4KB que estoura limite Web Push.
  const safePayload: PushPayload = {
    title: (p.payload.title ?? '').slice(0, 50),
    body: (p.payload.body ?? '').slice(0, 150),
    data: p.payload.data,
  }

  // ─── Passo 1: buscar todas subscriptions do perfil ──────────────────────────
  const { data: subs, error: subsErr } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('perfil_id', p.perfilId)
    .returns<PushSubRow[]>()

  if (subsErr) {
    return {
      ok: false,
      status: 'failed',
      errorMsg: subsErr.message ?? 'SELECT push_subscriptions falhou',
      delivered: 0,
      failed: 0,
      cleaned: 0,
    }
  }

  if (!subs || subs.length === 0) {
    // Perfil sem sub: não loga em notificacoes_envios — não há o que
    // reenviar. Resultado válido e auditável pelo caller.
    return {
      ok: true,
      status: 'skipped_no_subscription',
      delivered: 0,
      failed: 0,
      cleaned: 0,
    }
  }

  // ─── Passo 2: INSERT atômico em notificacoes_envios (idempotência UNIQUE) ──
  const { data: inserted, error: insertErr } = await supabase
    .from('notificacoes_envios')
    .insert({
      perfil_id: p.perfilId,
      tipo: p.tipo,
      entidade_id: p.entidadeId,
      entidade_tipo: p.entidadeTipo,
      canal: 'push',
      subject: safePayload.title,
      status: 'queued',
    })
    .select('id')
    .single<{ id: string }>()

  if (insertErr) {
    // 23505: UNIQUE partial index — push já enviado hoje p/ esse (perfil,tipo,entidade)
    if ((insertErr as { code?: string }).code === '23505') {
      return {
        ok: true,
        status: 'skipped_idempotent',
        delivered: 0,
        failed: 0,
        cleaned: 0,
      }
    }
    return {
      ok: false,
      status: 'failed',
      errorMsg: insertErr.message ?? 'INSERT notificacoes_envios falhou',
      delivered: 0,
      failed: 0,
      cleaned: 0,
    }
  }

  if (!inserted?.id) {
    return {
      ok: false,
      status: 'failed',
      errorMsg: 'INSERT sem id retornado',
      delivered: 0,
      failed: 0,
      cleaned: 0,
    }
  }

  const notificacaoId = inserted.id

  // ─── Passo 3: fanout para todas subs em paralelo ────────────────────────────
  let delivered = 0
  let failed = 0
  let cleaned = 0
  const errors: string[] = []
  const payloadStr = JSON.stringify(safePayload)

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr,
        )
        delivered++
      } catch (e) {
        // web-push lança erro com shape { statusCode, body, headers, message }
        const sc = (e as { statusCode?: number })?.statusCode ?? 0
        const msg = (e as { message?: string })?.message ?? String(e)
        const shortId = sub.id.slice(0, 8)

        if (sc === 410 || sc === 404) {
          // D-02: subscription expirada/revogada — DELETE row + count cleaned
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          cleaned++
          failed++
          errors.push(`sub ${shortId}: ${sc} Gone — DELETED`)
        } else {
          // Outros erros (5xx, 429, 401/403, network) — mantém row, conta failed
          failed++
          errors.push(`sub ${shortId}: ${sc || msg}`)
        }
      }
    }),
  )

  // ─── Passo 4: UPDATE final da row notificacoes_envios ───────────────────────
  const finalStatus = delivered > 0 ? 'delivered' : 'failed'
  const errorMsgAgg = errors.length > 0 ? errors.slice(0, 3).join('; ') : null

  await supabase
    .from('notificacoes_envios')
    .update({
      status: finalStatus,
      delivered_at: delivered > 0 ? new Date().toISOString() : null,
      error_msg: errorMsgAgg,
    })
    .eq('id', notificacaoId)

  return {
    ok: delivered > 0,
    status: delivered > 0 ? 'queued' : 'failed',
    errorMsg: errorMsgAgg ?? undefined,
    notificacaoId,
    delivered,
    failed,
    cleaned,
  }
}
