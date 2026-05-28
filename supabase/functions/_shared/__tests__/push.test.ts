import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Phase 6 Plan 03 implementa supabase/functions/_shared/push.ts.
// Casos derivados de 06-RESEARCH.md §4 sendPush Helper + §Validation Architecture
// + D-02 cleanup 410/404 + D-08 idempotência canal='push'.
//
// Pattern espelha supabase/functions/_shared/__tests__/email.test.ts:
// mocka supabase via createSupabaseMock + mocka webpush.sendNotification via vi.mock.

describe('supabase/functions/_shared/push.ts — sendPush', () => {
  describe('happy path', () => {
    it.todo('sendPush retorna { ok: true, delivered: 1, failed: 0, cleaned: 0 } quando 1 subscription + 201')
    it.todo('multi-device: 2 subs → ambas 201 → delivered=2, failed=0, status="delivered" em notificacoes_envios')
    it.todo('INSERT em notificacoes_envios usa canal="push" (D-08)')
  })

  describe('skipped cases (D-04 / D-08)', () => {
    it.todo('skipped_no_subscription quando perfil sem rows em push_subscriptions')
    it.todo('skipped_idempotent quando INSERT viola UNIQUE (PG code 23505) — idempotência reaproveita índice migration 035')
  })

  describe('error handling (D-02 cleanup 410/404)', () => {
    it.todo('webpush 410 Gone → DELETE FROM push_subscriptions WHERE id = sub.id + status="failed" + cleaned=1')
    it.todo('webpush 404 Not Found → mesmo cleanup do 410 (D-02 cobre ambos)')
    it.todo('webpush 5xx → status="failed" + error_msg SEM deletar row (problema do push service, não da subscription)')
    it.todo('webpush 401/403 → status="failed" SEM deletar row (problema VAPID, não subscription)')
  })

  describe('multi-device aggregation', () => {
    it.todo('2 subs onde uma retorna 201 e outra retorna 410 → delivered=1, failed=1, cleaned=1, ok=true')
    it.todo('2 subs ambas falham → delivered=0, failed=2, ok=false, status="failed"')
    it.todo('pelo menos 1 delivered → ok=true (best-effort multi-device)')
  })

  describe('payload size (Pitfall 4)', () => {
    it.todo('helper não trunca — caller (notify-*) responsabilidade manter title ≤ 50, body ≤ 150')
  })

  describe('VAPID env', () => {
    it.todo('webpush.setVapidDetails é chamado no module load com Deno.env vars')
  })
})
