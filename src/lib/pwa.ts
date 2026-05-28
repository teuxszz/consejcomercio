// src/lib/pwa.ts — Helpers PWA + push subscription (Phase 6 D-12/D-13)
//
// Puros, testáveis (vitest) e sem dependências de React. Skeleton derivado
// de 06-RESEARCH.md §3 Subscription Flow. Ordem das checagens importa
// (Pitfall 5): iOS gate antes de Notification.permission para que iOS
// Safari não-standalone sempre receba `ios-not-standalone` (mesmo se a
// permission default).

/** Detecta se app está rodando em modo standalone (PWA instalado).
 *  Combo: matchMedia(display-mode: standalone) + legacy navigator.standalone (iOS). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS legacy: navigator.standalone (não-padrão, só Safari)
  if ((window.navigator as unknown as { standalone?: boolean }).standalone === true) return true
  return false
}

/** Detecta iOS via UA. Frágil mas é o que temos (Safari não tem UA Client Hints). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
}

export type PushBlockReason = 'ios-not-standalone' | 'unsupported' | 'denied'

/** Determina se o ambiente suporta push subscription e, se não, por quê.
 *  Ordem: unsupported → ios-not-standalone (D-13) → denied (Pitfall 5). */
export function canSubscribePush(): { ok: boolean; reason?: PushBlockReason } {
  // Feature detection
  if (
    typeof navigator === 'undefined' ||
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return { ok: false, reason: 'unsupported' }
  }
  // iOS Gate (D-13): Safari iOS só permite push em standalone (instalado)
  if (isIOS() && !isStandalone()) {
    return { ok: false, reason: 'ios-not-standalone' }
  }
  // Permission denied (Pitfall 5): permission='denied' é estado terminal sem flow de recovery via JS
  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'denied' }
  }
  return { ok: true }
}

/** Converte VAPID public key (base64url, 87 chars) → Uint8Array (65 bytes raw)
 *  para passar em `pushManager.subscribe({ applicationServerKey })`. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** Converte ArrayBuffer (do `subscription.getKey()`) → base64url para persistir em DB. */
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Subscribe ao push manager do SW e extrai { endpoint, p256dh, auth }.
 *  Retorna null se getKey falhar (browser pode bloquear acesso às chaves). */
export async function subscribePush(vapidPublicKey: string): Promise<{
  endpoint: string
  p256dh: string
  auth: string
} | null> {
  const registration = await navigator.serviceWorker.ready
  // applicationServerKey precisa de BufferSource com ArrayBuffer explícito
  // (TS 5.9: Uint8Array<ArrayBufferLike> não é assignable a Uint8Array<ArrayBuffer>)
  const keyBytes = urlBase64ToUint8Array(vapidPublicKey)
  const keyBuffer = new ArrayBuffer(keyBytes.byteLength)
  new Uint8Array(keyBuffer).set(keyBytes)
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBuffer,
  })

  const p256dh = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')
  if (!p256dh || !auth) return null

  return {
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64Url(p256dh),
    auth: arrayBufferToBase64Url(auth),
  }
}

/** Unsubscribe do browser + retorna endpoint para DELETE em push_subscriptions.
 *  Retorna null se não houver subscription ativa. */
export async function unsubscribePush(): Promise<{ endpoint: string } | null> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return { endpoint }
}
