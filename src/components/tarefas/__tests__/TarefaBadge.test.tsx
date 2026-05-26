import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}

const mockFrom = vi.fn()
const mockRemoveChannel = vi.fn()
const mockChannelFn = vi.fn(() => mockChannel)

vi.mock('@/lib/supabase', () => ({
  supabase: {
    get from() { return mockFrom },
    get channel() { return mockChannelFn },
    get removeChannel() { return mockRemoveChannel },
  },
}))

import { useTarefasBadgeCount } from '@/hooks/useTarefasBadgeCount'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function makeFromChain(count: number) {
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'in', 'order', 'limit']
  for (const m of methods) chain[m] = vi.fn(() => chain)
  chain.then = (resolve: (v: { count: number }) => unknown) => resolve({ count })
  return vi.fn(() => chain)
}

describe('useTarefasBadgeCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannelFn.mockReturnValue(mockChannel)
    mockChannel.on.mockReturnThis()
    mockChannel.subscribe.mockReturnThis()
  })

  it('retorna 0 quando userId eh undefined sem chamar supabase.from', () => {
    mockFrom.mockImplementation(makeFromChain(0))
    const { result } = renderHook(() => useTarefasBadgeCount(undefined), { wrapper })
    expect(result.current).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('chama supabase.from com filtros corretos quando userId valido', async () => {
    const fromChain = makeFromChain(3)
    mockFrom.mockImplementation(fromChain)
    const { result } = renderHook(() => useTarefasBadgeCount('user-1'), { wrapper })
    await waitFor(() => expect(result.current).toBe(3))
    expect(fromChain).toHaveBeenCalledWith('tarefas')
  })

  it('cria canal Realtime com nome tarefas-badge-user-1', async () => {
    mockFrom.mockImplementation(makeFromChain(2))
    renderHook(() => useTarefasBadgeCount('user-1'), { wrapper })
    await waitFor(() => expect(mockChannelFn).toHaveBeenCalledWith('tarefas-badge-user-1'))
  })

  it('chama removeChannel no cleanup', async () => {
    mockFrom.mockImplementation(makeFromChain(1))
    const { unmount } = renderHook(() => useTarefasBadgeCount('user-1'), { wrapper })
    await waitFor(() => expect(mockChannelFn).toHaveBeenCalled())
    unmount()
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel)
  })
})
