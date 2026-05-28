import { vi } from 'vitest'

// Mock helpers para browser APIs usadas em Phase 6 (PWA + Push).
//
// Cada helper instala stubs em `globalThis` / `window` / `navigator` e retorna
// uma função de teardown. Style espelhado de `src/test/supabase-mock.ts` —
// factory functions vi.fn-based, sem efeitos colaterais até o helper ser
// chamado por um teste.
//
// Uso:
//   import { mockPushManager, mockNotificationPermission, mockServiceWorkerRegistration, mockMatchMediaStandalone } from '@/test/push-mocks'
//
//   beforeEach(() => {
//     restorers.push(mockNotificationPermission('default'))
//     restorers.push(mockMatchMediaStandalone(true))
//   })
//   afterEach(() => { restorers.forEach(r => r()); restorers.length = 0 })

export type NotificationPermissionState = 'default' | 'granted' | 'denied'

type Restore = () => void

/**
 * Stub global `window.Notification` com permission configurável.
 * `requestPermission` retorna o state passado (simula resposta do prompt).
 */
export function mockNotificationPermission(state: NotificationPermissionState): Restore {
  const prev = (globalThis as any).Notification
  const stub = {
    permission: state,
    requestPermission: vi.fn(() => Promise.resolve(state)),
  }
  ;(globalThis as any).Notification = stub
  return () => {
    if (prev === undefined) delete (globalThis as any).Notification
    else (globalThis as any).Notification = prev
  }
}

export interface MockPushManagerOptions {
  subscribed: boolean
  endpoint?: string
  subscribeFails?: boolean
}

/**
 * Stub `navigator.serviceWorker.ready.pushManager` com state controlado.
 * - subscribed=true → getSubscription retorna mock PushSubscription
 * - subscribeFails=true → subscribe() rejeita
 */
export function mockPushManager(opts: MockPushManagerOptions): Restore {
  const endpoint = opts.endpoint ?? 'https://fcm.googleapis.com/fcm/send/mock-endpoint'
  const existingSub = opts.subscribed
    ? {
        endpoint,
        getKey: vi.fn((name: string) => {
          // 65 byte buffer simulando p256dh, 16 bytes simulando auth
          const size = name === 'p256dh' ? 65 : 16
          return new ArrayBuffer(size)
        }),
        unsubscribe: vi.fn(() => Promise.resolve(true)),
      }
    : null

  const newSub = {
    endpoint,
    getKey: vi.fn((name: string) => {
      const size = name === 'p256dh' ? 65 : 16
      return new ArrayBuffer(size)
    }),
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  }

  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(existingSub)),
    subscribe: vi.fn(() => {
      if (opts.subscribeFails) return Promise.reject(new Error('subscribe failed'))
      return Promise.resolve(newSub)
    }),
    permissionState: vi.fn(() => Promise.resolve('granted')),
  }

  const registration = { pushManager, showNotification: vi.fn() }
  const prevSw = (globalThis.navigator as any).serviceWorker
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      register: vi.fn(() => Promise.resolve(registration)),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })

  return () => {
    if (prevSw === undefined) {
      delete (globalThis.navigator as any).serviceWorker
    } else {
      Object.defineProperty(globalThis.navigator, 'serviceWorker', {
        configurable: true,
        value: prevSw,
      })
    }
  }
}

/**
 * Stub mínimo de ServiceWorkerRegistration sem PushManager (cenário 'unsupported').
 */
export function mockServiceWorkerRegistration(): Restore {
  const registration = { pushManager: undefined, showNotification: vi.fn() }
  const prevSw = (globalThis.navigator as any).serviceWorker
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      register: vi.fn(() => Promise.resolve(registration)),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
  return () => {
    if (prevSw === undefined) delete (globalThis.navigator as any).serviceWorker
    else Object.defineProperty(globalThis.navigator, 'serviceWorker', { configurable: true, value: prevSw })
  }
}

/**
 * Stub `window.matchMedia` para retornar `matches = standalone` quando query
 * for `(display-mode: standalone)`.
 */
export function mockMatchMediaStandalone(standalone: boolean): Restore {
  const prev = window.matchMedia
  ;(window as any).matchMedia = vi.fn((query: string) => ({
    matches: query.includes('standalone') ? standalone : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }))
  return () => {
    if (prev === undefined) delete (window as any).matchMedia
    else (window as any).matchMedia = prev
  }
}

/**
 * Stub user agent (read-only por padrão em jsdom — usa defineProperty).
 */
export function mockUserAgent(ua: string): Restore {
  const prev = Object.getOwnPropertyDescriptor(globalThis.navigator, 'userAgent')
  Object.defineProperty(globalThis.navigator, 'userAgent', {
    configurable: true,
    get: () => ua,
  })
  return () => {
    if (prev) Object.defineProperty(globalThis.navigator, 'userAgent', prev)
  }
}
