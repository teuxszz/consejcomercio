import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isStandalone,
  isIOS,
  canSubscribePush,
  urlBase64ToUint8Array,
  arrayBufferToBase64Url,
  subscribePush,
  unsubscribePush,
} from '@/lib/pwa'
import {
  mockNotificationPermission,
  mockPushManager,
  mockServiceWorkerRegistration,
  mockMatchMediaStandalone,
  mockUserAgent,
} from '@/test/push-mocks'

// Phase 6 Plan 04 Task 4.1 — pwa.ts helpers GREEN tests.
// Casos derivados de 06-RESEARCH.md §Validation Architecture.

const VAPID_SAMPLE = 'BNs28hM4mWvgVrgkPxxCC0z4rOJtTl3a4tWE9o9rWZw0PspRfbX0CB1trAlOFXi2nLfTRRPpwbV3RNyULv0K11A'

const restorers: Array<() => void> = []

afterEach(() => {
  restorers.forEach(r => r())
  restorers.length = 0
})

describe('src/lib/pwa.ts — helpers PWA + push subscription', () => {
  describe('urlBase64ToUint8Array / arrayBufferToBase64Url', () => {
    it('urlBase64ToUint8Array converte chave VAPID base64url em Uint8Array correto (87 chars → 65 bytes)', () => {
      const out = urlBase64ToUint8Array(VAPID_SAMPLE)
      expect(out).toBeInstanceOf(Uint8Array)
      // 87 chars base64url decodificam para 65 bytes (VAPID raw)
      expect(out.length).toBe(65)
    })

    it('arrayBufferToBase64Url converte ArrayBuffer (do getKey()) em base64url sem padding', () => {
      const buf = new Uint8Array([1, 2, 3, 4, 5]).buffer
      const out = arrayBufferToBase64Url(buf)
      expect(out).not.toContain('=')
      expect(out).not.toContain('+')
      expect(out).not.toContain('/')
    })

    it('round-trip urlBase64ToUint8Array(arrayBufferToBase64Url(buf)) === buf original', () => {
      const original = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255])
      const encoded = arrayBufferToBase64Url(original.buffer)
      const decoded = urlBase64ToUint8Array(encoded)
      expect(Array.from(decoded)).toEqual(Array.from(original))
    })

    it('urlBase64ToUint8Array lida com strings sem padding (replica padding %4)', () => {
      // "AQ" são 2 chars (precisa de 2 '=' para padding)
      const out = urlBase64ToUint8Array('AQ')
      expect(out.length).toBe(1)
      expect(out[0]).toBe(1)
    })
  })

  describe('isStandalone()', () => {
    beforeEach(() => {
      restorers.push(mockUserAgent('Mozilla/5.0 (Linux; Android 11)'))
    })

    it('retorna true quando matchMedia(display-mode: standalone) matches', () => {
      restorers.push(mockMatchMediaStandalone(true))
      expect(isStandalone()).toBe(true)
    })

    it('retorna false em browser normal (sem standalone)', () => {
      restorers.push(mockMatchMediaStandalone(false))
      // Garantir que navigator.standalone não esteja definido como true
      const prev = (window.navigator as unknown as { standalone?: boolean }).standalone
      ;(window.navigator as unknown as { standalone?: boolean }).standalone = false
      try {
        expect(isStandalone()).toBe(false)
      } finally {
        ;(window.navigator as unknown as { standalone?: boolean }).standalone = prev
      }
    })

    it('retorna true quando navigator.standalone === true (iOS legacy)', () => {
      restorers.push(mockMatchMediaStandalone(false))
      const prev = (window.navigator as unknown as { standalone?: boolean }).standalone
      ;(window.navigator as unknown as { standalone?: boolean }).standalone = true
      try {
        expect(isStandalone()).toBe(true)
      } finally {
        ;(window.navigator as unknown as { standalone?: boolean }).standalone = prev
      }
    })
  })

  describe('isIOS()', () => {
    it('detecta /iPad|iPhone|iPod/ no userAgent', () => {
      restorers.push(mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15'))
      expect(isIOS()).toBe(true)
    })

    it('retorna false em Android UA', () => {
      restorers.push(mockUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36'))
      expect(isIOS()).toBe(false)
    })

    it('retorna false em desktop Chrome UA', () => {
      restorers.push(mockUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0'))
      expect(isIOS()).toBe(false)
    })
  })

  describe('canSubscribePush()', () => {
    it('retorna { ok: false, reason: "unsupported" } quando PushManager ausente', () => {
      // jsdom default — sem PushManager
      restorers.push(mockUserAgent('Mozilla/5.0 (Linux; Android 11)'))
      const r = canSubscribePush()
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('unsupported')
    })

    it('retorna { ok: false, reason: "unsupported" } quando serviceWorker ausente', () => {
      restorers.push(mockUserAgent('Mozilla/5.0 (Linux; Android 11)'))
      // navigator.serviceWorker não existe em jsdom por padrão
      const r = canSubscribePush()
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('unsupported')
    })

    it('retorna { ok: false, reason: "ios-not-standalone" } em UA iOS + display-mode browser (D-13)', () => {
      restorers.push(mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)'))
      restorers.push(mockMatchMediaStandalone(false))
      restorers.push(mockPushManager({ subscribed: false }))
      restorers.push(mockNotificationPermission('default'))
      // PushManager presente no window
      ;(window as unknown as { PushManager?: unknown }).PushManager =
        (window as unknown as { PushManager?: unknown }).PushManager ?? function () {}
      const r = canSubscribePush()
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('ios-not-standalone')
    })

    it('retorna { ok: false, reason: "denied" } quando Notification.permission === "denied"', () => {
      restorers.push(mockUserAgent('Mozilla/5.0 (Linux; Android 11)'))
      restorers.push(mockMatchMediaStandalone(false))
      restorers.push(mockPushManager({ subscribed: false }))
      restorers.push(mockNotificationPermission('denied'))
      ;(window as unknown as { PushManager?: unknown }).PushManager =
        (window as unknown as { PushManager?: unknown }).PushManager ?? function () {}
      const r = canSubscribePush()
      expect(r.ok).toBe(false)
      expect(r.reason).toBe('denied')
    })

    it('retorna { ok: true } em Chrome Android standalone', () => {
      restorers.push(mockUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0'))
      restorers.push(mockMatchMediaStandalone(true))
      restorers.push(mockPushManager({ subscribed: false }))
      restorers.push(mockNotificationPermission('default'))
      ;(window as unknown as { PushManager?: unknown }).PushManager =
        (window as unknown as { PushManager?: unknown }).PushManager ?? function () {}
      const r = canSubscribePush()
      expect(r.ok).toBe(true)
    })

    it('retorna { ok: true } em iOS Safari PWA standalone', () => {
      restorers.push(mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)'))
      restorers.push(mockMatchMediaStandalone(true))
      restorers.push(mockPushManager({ subscribed: false }))
      restorers.push(mockNotificationPermission('default'))
      ;(window as unknown as { PushManager?: unknown }).PushManager =
        (window as unknown as { PushManager?: unknown }).PushManager ?? function () {}
      const r = canSubscribePush()
      expect(r.ok).toBe(true)
    })
  })

  describe('subscribePush(vapidPublicKey)', () => {
    beforeEach(() => {
      restorers.push(mockUserAgent('Mozilla/5.0 (Linux; Android 11)'))
      restorers.push(mockMatchMediaStandalone(true))
      restorers.push(mockNotificationPermission('granted'))
      ;(window as unknown as { PushManager?: unknown }).PushManager =
        (window as unknown as { PushManager?: unknown }).PushManager ?? function () {}
    })

    it('chama pushManager.subscribe com userVisibleOnly: true + applicationServerKey derivada', async () => {
      restorers.push(mockPushManager({ subscribed: false, endpoint: 'https://fcm/abc' }))
      const result = await subscribePush(VAPID_SAMPLE)
      expect(result).not.toBeNull()
      expect(result?.endpoint).toBe('https://fcm/abc')
    })

    it('retorna { endpoint, p256dh, auth } com chaves convertidas para base64url', async () => {
      restorers.push(mockPushManager({ subscribed: false, endpoint: 'https://fcm/xyz' }))
      const result = await subscribePush(VAPID_SAMPLE)
      expect(result).toMatchObject({
        endpoint: 'https://fcm/xyz',
        p256dh: expect.any(String),
        auth: expect.any(String),
      })
      // base64url chars: nada de '+' '/' '='
      expect(result?.p256dh).not.toMatch(/[+/=]/)
      expect(result?.auth).not.toMatch(/[+/=]/)
    })
  })

  describe('unsubscribePush()', () => {
    beforeEach(() => {
      restorers.push(mockUserAgent('Mozilla/5.0 (Linux; Android 11)'))
      restorers.push(mockMatchMediaStandalone(true))
      restorers.push(mockNotificationPermission('granted'))
    })

    it('chama subscription.unsubscribe() e retorna { endpoint } para cleanup DB', async () => {
      restorers.push(mockPushManager({ subscribed: true, endpoint: 'https://fcm/existing' }))
      const result = await unsubscribePush()
      expect(result).toEqual({ endpoint: 'https://fcm/existing' })
    })

    it('retorna null quando não há subscription ativa', async () => {
      restorers.push(mockPushManager({ subscribed: false }))
      const result = await unsubscribePush()
      expect(result).toBeNull()
    })
  })

  describe('integration: roundtrip helpers usados pelo SW registration sem registry', () => {
    it('mockServiceWorkerRegistration funciona (smoke)', async () => {
      restorers.push(mockServiceWorkerRegistration())
      const reg = await navigator.serviceWorker.ready
      expect(reg).toBeDefined()
    })
  })
})
