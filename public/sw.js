// Phase 6 D-11 — minimal SW: push + notificationclick.
// Sem cache, sem offline. Phase futura adiciona offline-first.
//
// Decisões herdadas:
//   D-11: Service Worker minimal — apenas push + notificationclick handlers (~2KB).
//   D-14: deepLink chega em event.notification.data.deepLink (calculado no caller de sendPush).
//   T-06-07 (R-S7 mitigation): notificationclick valida same-origin antes de openWindow,
//          para impedir open-redirect via payload manipulado.
//   R-L4 mitigation: este arquivo é servido com Cache-Control: must-revalidate (vercel.json).
//
// Pitfall 1/2 do RESEARCH:
//   - SW vive em public/ (não src/) — Vite serve public/ como raiz estática sem hash.
//   - Registrado com '/sw.js' (sem path) → scope automático = '/'. Cobre todo o CRM.

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'CONSEJ CRM', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'CONSEJ CRM'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
    tag: (payload.data && payload.data.tipo) || 'consej',
    renotify: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const deepLink = (event.notification.data && event.notification.data.deepLink) || '/dashboard'
  const targetUrl = new URL(deepLink, self.location.origin).href

  // T-06-07 (R-S7 same-origin guard): se payload foi adulterado para apontar para outra origin,
  // não abre — defesa contra open redirect via notificationclick.
  if (new URL(targetUrl).origin !== self.location.origin) return

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    // Tab CRM já aberta? Foca e navega via postMessage (React Router escuta em AppLayout).
    for (const client of clientsList) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus()
        client.postMessage({ type: 'PUSH_NAVIGATE', url: targetUrl })
        return
      }
    }

    // Sem tab aberta — abre nova janela diretamente no deep link.
    await self.clients.openWindow(targetUrl)
  })())
})
