import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const invokeMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { useReenviarNotificacao } from '../useReenviarNotificacao'
import { toast } from 'sonner'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useReenviarNotificacao', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    vi.clearAllMocks()
  })

  it('happy path: invoca reenviar-notificacao e mostra toast success', async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true, newId: 'new-1' }, error: null })
    const { result } = renderHook(() => useReenviarNotificacao(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('notif-abc')
    })

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('reenviar-notificacao', {
      body: { id: 'notif-abc' },
    })
    expect(toast.success).toHaveBeenCalledWith('Notificação reenviada.')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('erro do invoke surfaceia a mensagem via toast.error', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new Error('quota excedida'),
    })
    const { result } = renderHook(() => useReenviarNotificacao(), { wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync('notif-xyz')
      } catch {
        // expected
      }
    })

    expect(toast.error).toHaveBeenCalledWith('quota excedida')
    expect(toast.success).not.toHaveBeenCalled()
  })
})
