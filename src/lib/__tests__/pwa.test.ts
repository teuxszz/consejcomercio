import { describe, it } from 'vitest'

// Wave 0 scaffold (RED) — Phase 6 Plan 02 implementa src/lib/pwa.ts.
// Casos derivados de 06-RESEARCH.md §Validation Architecture (Phase Requirements → Test Map)
// e 06-VALIDATION.md §Wave 0 Requirements.
//
// Cada it.todo() vira teste real no Plan 02 (lib pwa.ts) ou no Plan 04
// (NotificacoesPanel iOS gate flow).

describe('src/lib/pwa.ts — helpers PWA + push subscription', () => {
  describe('urlBase64ToUint8Array / arrayBufferToBase64Url', () => {
    it.todo('urlBase64ToUint8Array converte chave VAPID base64url em Uint8Array correto (87 chars → 65 bytes)')
    it.todo('arrayBufferToBase64Url converte ArrayBuffer (do getKey()) em base64url sem padding')
    it.todo('round-trip urlBase64ToUint8Array(arrayBufferToBase64Url(buf)) === buf original')
    it.todo('urlBase64ToUint8Array lida com strings sem padding (replica padding %4)')
  })

  describe('isStandalone()', () => {
    it.todo('retorna true quando matchMedia(display-mode: standalone) matches')
    it.todo('retorna true quando navigator.standalone === true (iOS legacy)')
    it.todo('retorna false em browser normal (sem standalone)')
  })

  describe('isIOS()', () => {
    it.todo('detecta /iPad|iPhone|iPod/ no userAgent')
    it.todo('retorna false em Android UA')
    it.todo('retorna false em desktop Chrome UA')
  })

  describe('canSubscribePush()', () => {
    it.todo('retorna { ok: false, reason: "unsupported" } quando PushManager ausente')
    it.todo('retorna { ok: false, reason: "unsupported" } quando serviceWorker ausente')
    it.todo('retorna { ok: false, reason: "ios-not-standalone" } em UA iOS + display-mode browser (D-13)')
    it.todo('retorna { ok: false, reason: "denied" } quando Notification.permission === "denied"')
    it.todo('retorna { ok: true } em Chrome Android standalone')
    it.todo('retorna { ok: true } em iOS Safari PWA standalone')
  })

  describe('subscribePush(vapidPublicKey)', () => {
    it.todo('chama pushManager.subscribe com userVisibleOnly: true + applicationServerKey derivada')
    it.todo('retorna { endpoint, p256dh, auth } com chaves convertidas para base64url')
    it.todo('retorna null se getKey retornar null para qualquer chave')
  })

  describe('unsubscribePush()', () => {
    it.todo('chama subscription.unsubscribe() e retorna { endpoint } para cleanup DB')
    it.todo('retorna null quando não há subscription ativa')
  })
})
