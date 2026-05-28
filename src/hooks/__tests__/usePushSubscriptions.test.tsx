import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PushSubscriptionRow } from '@/types'

// ─── Mocks: supabase + sonner + pwa helpers ───────────────────────────────────

const upsertMock = vi.fn()
const deleteMock = vi.fn()
const eqDeleteMock = vi.fn()
const selectMock = vi.fn()
const eqSelectMock = vi.fn()
const orderSelectMock = vi.fn()
const returnsSelectMock = vi.fn()

let selectResp: { data: PushSubscriptionRow[] | null; error: unknown } = { data: [], error: null }
let upsertResp: { data: unknown; error: unknown } = { data: null, error: null }
let deleteResp: { data: unknown; error: unknown } = { data: null, error: null }

vi.mock('@/lib/supabase', () => {
  const builderFor = (table: string) => {
    if (table !== 'push_subscriptions') return {}
    return {
      select: (...args: unknown[]) => {
        selectMock(...args)
        const b = {
          eq: (...a: unknown[]) => {
            eqSelectMock(...a)
            return b
          },
          order: (...a: unknown[]) => {
            orderSelectMock(...a)
            return b
          },
          returns: (...a: unknown[]) => {
            returnsSelectMock(...a)
            return b
          },
          then: (resolve: (v: typeof selectResp) => unknown) => resolve(selectResp),
        }
        return b
      },
      upsert: (payload: unknown, opts: unknown) => {
        upsertMock(payload, opts)
        return {
          then: (resolve: (v: typeof upsertResp) => unknown) => resolve(upsertResp),
        }
      },
      delete: () => {
        deleteMock()
        const b = {
          eq: (...a: unknown[]) => {
            eqDeleteMock(...a)
            return b
          },
          then: (resolve: (v: typeof deleteResp) => unknown) => resolve(deleteResp),
        }
        return b
      },
    }
  }
  return { supabase: { from: vi.fn((t: string) => builderFor(t)) } }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const subscribePushMock = vi.fn()
const unsubscribePushMock = vi.fn()

vi.mock('@/lib/pwa', () => ({
  subscribePush: (...args: unknown[]) => subscribePushMock(...args),
  unsubscribePush: (...args: unknown[]) => unsubscribePushMock(...args),
}))

import { usePushSubscriptions, useSubscribePush, useUnsubscribePush } from '../usePushSubscriptions'
import { toast } from 'sonner'

// Stub VITE_VAPID_PUBLIC_KEY (vitest expõe import.meta.env)
beforeEach(() => {
  ;(import.meta as unknown as { env: Record<string, unknown> }).env.VITE_VAPID_PUBLIC_KEY = 'BNs28hM4mWvgVrgkPxxCC0z4rOJtTl3a4tWE9o9rWZw0PspRfbX0CB1trAlOFXi2nLfTRRPpwbV3RNyULv0K11A'
})

afterEach(() => {
  vi.clearAllMocks()
  selectResp = { data: [], error: null }
  upsertResp = { data: null, error: null }
  deleteResp = { data: null, error: null }
})

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  return { qc, Wrapper }
}

const SAMPLE_ROW: PushSubscriptionRow = {
  id: 'sub-1',
  perfil_id: 'perfil-1',
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  p256dh: 'sample-p256dh',
  auth: 'sample-auth',
  user_agent: 'Mozilla/5.0',
  last_seen_at: '2026-05-28T10:00:00Z',
  created_at: '2026-05-28T09:00:00Z',
}

describe('usePushSubscriptions(perfilId) — query', () => {
  it('retorna lista de PushSubscriptionRow do perfil quando enabled', async () => {
    selectResp = { data: [SAMPLE_ROW], error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePushSubscriptions('perfil-1'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([SAMPLE_ROW])
    expect(eqSelectMock).toHaveBeenCalledWith('perfil_id', 'perfil-1')
  })

  it('enabled: false quando perfilId é null/undefined', () => {
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePushSubscriptions(null), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(result.current.data).toBeUndefined()
  })

  it('retorna array vazio quando perfil não tem subscriptions', async () => {
    selectResp = { data: [], error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => usePushSubscriptions('perfil-2'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([])
  })
})

describe('useSubscribePush() — mutation', () => {
  it('chama subscribePush(vapidPublicKey) do helper src/lib/pwa.ts', async () => {
    subscribePushMock.mockResolvedValue({ endpoint: 'https://fcm/x', p256dh: 'p', auth: 'a' })
    upsertResp = { data: null, error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscribePush(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ perfilId: 'perfil-1' })
    })

    expect(subscribePushMock).toHaveBeenCalledTimes(1)
    expect(subscribePushMock).toHaveBeenCalledWith(expect.stringMatching(/^B/))
  })

  it('upsert em push_subscriptions com onConflict: "perfil_id,endpoint" (Pitfall 7)', async () => {
    subscribePushMock.mockResolvedValue({ endpoint: 'https://fcm/y', p256dh: 'p256', auth: 'au' })
    upsertResp = { data: null, error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscribePush(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ perfilId: 'perfil-1' })
    })

    expect(upsertMock).toHaveBeenCalledTimes(1)
    const [payload, opts] = upsertMock.mock.calls[0] as [Record<string, unknown>, { onConflict: string }]
    expect(payload.perfil_id).toBe('perfil-1')
    expect(payload.endpoint).toBe('https://fcm/y')
    expect(payload.p256dh).toBe('p256')
    expect(payload.auth).toBe('au')
    expect(opts.onConflict).toBe('perfil_id,endpoint')
  })

  it('grava user_agent: navigator.userAgent na row', async () => {
    subscribePushMock.mockResolvedValue({ endpoint: 'https://fcm/z', p256dh: 'p', auth: 'a' })
    upsertResp = { data: null, error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscribePush(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ perfilId: 'perfil-1' })
    })

    const [payload] = upsertMock.mock.calls[0] as [Record<string, unknown>]
    expect(payload.user_agent).toBeDefined()
    expect(typeof payload.user_agent).toBe('string')
  })

  it('atualiza last_seen_at = new Date().toISOString() no upsert', async () => {
    subscribePushMock.mockResolvedValue({ endpoint: 'https://fcm/w', p256dh: 'p', auth: 'a' })
    upsertResp = { data: null, error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscribePush(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ perfilId: 'perfil-1' })
    })

    const [payload] = upsertMock.mock.calls[0] as [Record<string, unknown>]
    expect(payload.last_seen_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('chama toast.error em onError quando subscribePush retorna null (getKey falhou)', async () => {
    subscribePushMock.mockResolvedValue(null)
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscribePush(), { wrapper: Wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({ perfilId: 'perfil-1' })
      } catch {
        // expected
      }
    })

    expect(toast.error).toHaveBeenCalled()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('throw "VAPID public key não configurada" se env var ausente (via vi.stubEnv)', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useSubscribePush(), { wrapper: Wrapper })

    let err: unknown
    await act(async () => {
      try {
        await result.current.mutateAsync({ perfilId: 'perfil-1' })
      } catch (e) {
        err = e
      }
    })

    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/VAPID/)
    expect(subscribePushMock).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})

describe('useUnsubscribePush() — mutation', () => {
  it('chama unsubscribePush() helper + DELETE FROM push_subscriptions WHERE perfil_id AND endpoint', async () => {
    unsubscribePushMock.mockResolvedValue({ endpoint: 'https://fcm/existing' })
    deleteResp = { data: null, error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUnsubscribePush(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ perfilId: 'perfil-1' })
    })

    expect(unsubscribePushMock).toHaveBeenCalledTimes(1)
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(eqDeleteMock).toHaveBeenCalledWith('perfil_id', 'perfil-1')
    expect(eqDeleteMock).toHaveBeenCalledWith('endpoint', 'https://fcm/existing')
  })

  it('lida com caso de subscription já removida no browser (helper retorna null)', async () => {
    unsubscribePushMock.mockResolvedValue(null)
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUnsubscribePush(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ perfilId: 'perfil-1' })
    })

    // Não tenta DELETE quando endpoint não foi resolvido
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('usa endpoint passado explicitamente (cleanup de row órfã) sem chamar unsubscribePush', async () => {
    deleteResp = { data: null, error: null }
    const { Wrapper } = makeWrapper()
    const { result } = renderHook(() => useUnsubscribePush(), { wrapper: Wrapper })

    await act(async () => {
      await result.current.mutateAsync({ perfilId: 'perfil-1', endpoint: 'https://fcm/orphan' })
    })

    expect(unsubscribePushMock).not.toHaveBeenCalled()
    expect(deleteMock).toHaveBeenCalledTimes(1)
    expect(eqDeleteMock).toHaveBeenCalledWith('endpoint', 'https://fcm/orphan')
  })
})
