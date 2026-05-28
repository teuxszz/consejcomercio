import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Phase 6 Plan 04 implementa src/hooks/usePushSubscriptions.ts.
// Casos derivados de 06-RESEARCH.md (§Validation Architecture, §3 Subscription Flow,
// Pitfall 7 — ON CONFLICT upsert) e 06-PATTERNS.md (analog: usePreferenciasNotif.ts
// + useReenviarNotificacao.ts).
//
// Mocks: createSupabaseMock (src/test/supabase-mock.ts) + push-mocks (src/test/push-mocks.ts).

describe('src/hooks/usePushSubscriptions.ts', () => {
  describe('usePushSubscriptions(perfilId) — query', () => {
    it.todo('retorna lista de PushSubscriptionRow do perfil quando enabled')
    it.todo('queryKey usa QUERY_KEYS.pushSubscriptions.byPerfil(perfilId)')
    it.todo('enabled: false quando perfilId é null/undefined')
    it.todo('retorna array vazio quando perfil não tem subscriptions')
  })

  describe('useSubscribePush() — mutation', () => {
    it.todo('chama subscribePush(vapidPublicKey) do helper src/lib/pwa.ts')
    it.todo('upsert em push_subscriptions com onConflict: "perfil_id,endpoint" (Pitfall 7)')
    it.todo('grava user_agent: navigator.userAgent na row')
    it.todo('atualiza last_seen_at = new Date().toISOString() no upsert')
    it.todo('invalida QUERY_KEYS.pushSubscriptions.byPerfil(perfilId) onSuccess')
    it.todo('chama toast.error em onError (pattern shared do projeto)')
    it.todo('optimistic update reverte em erro (rollback via context.previous)')
  })

  describe('useUnsubscribePush() — mutation', () => {
    it.todo('chama unsubscribePush() do helper + DELETE FROM push_subscriptions WHERE perfil_id AND endpoint')
    it.todo('invalida cache onSuccess')
    it.todo('lida com caso de subscription já removida no browser (helper retorna null)')
  })

  describe('Permission flow inline (D-12) — usado por NotificacoesPanel', () => {
    it.todo('quando Notification.permission === "default", chama requestPermission antes de subscribe')
    it.todo('quando user denied, mutation retorna erro "Permissão negada" sem inserir DB')
    it.todo('quando user granted, fluxo segue para pushManager.subscribe → INSERT DB')
  })
})
