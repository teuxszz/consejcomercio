import '@testing-library/jest-dom/vitest'

// Phase 6: helper opt-in para instalar mocks de browser APIs (Push/SW/Notification)
// sem poluir o setup global — testes que precisam chamam explicitamente.
// Outros testes (ex.: lint que checa ausência de Notification) continuam vendo
// o ambiente jsdom puro.
//
// Uso:
//   import { installPushMocks } from '@/test/push-mocks-bundle' // se quiser bundler
// Ou diretamente:
//   import { mockNotificationPermission, ... } from '@/test/push-mocks'

export interface InstallPushMocksOpts {
  permission?: 'default' | 'granted' | 'denied'
  standalone?: boolean
  subscribed?: boolean
  userAgent?: string
}

/**
 * Conveniência: instala combo de mocks comuns + retorna função de teardown
 * agregada. Não é exportado por default no setup — testes importam manualmente.
 */
export async function installPushMocks(opts: InstallPushMocksOpts = {}): Promise<() => void> {
  const {
    mockNotificationPermission,
    mockMatchMediaStandalone,
    mockPushManager,
    mockUserAgent,
  } = await import('./src/test/push-mocks')
  const restorers: Array<() => void> = []
  if (opts.permission) restorers.push(mockNotificationPermission(opts.permission))
  if (opts.standalone !== undefined) restorers.push(mockMatchMediaStandalone(opts.standalone))
  if (opts.subscribed !== undefined) restorers.push(mockPushManager({ subscribed: opts.subscribed }))
  if (opts.userAgent) restorers.push(mockUserAgent(opts.userAgent))
  return () => restorers.forEach((r) => r())
}
