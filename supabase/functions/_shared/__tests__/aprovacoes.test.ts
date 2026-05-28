import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Plan 02 popula.
// Cobre sendNotificacaoAprovacao: fan-out paralelo (Promise.allSettled) +
// respeito a PreferenciasNotif.documentos + idempotência via 23505 +
// flag skipSlack=true para reenviar-lembrete (D-13).

describe('sendNotificacaoAprovacao', () => {
  it.todo('dispara sendEmail + sendPush + sendSlack em paralelo via Promise.allSettled')
  it.todo('respeita PreferenciasNotif.documentos.{slack|email|push} (skip se OFF)')
  it.todo('captura 23505 no insert notificacoes_envios como idempotência (não falha)')
  it.todo('skipSlack=true pula canal Slack mantendo email+push (reenviar-lembrete)')
})
